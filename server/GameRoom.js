const { calculateRoundScore } = require('./scoring');
const { calculateStatistics, calculateRoundMicroStats } = require('./statistics');

const AVATARS = ['😎', '🦊', '🐱', '🦁', '🐸', '🦄', '🐧', '🐼', '🦋', '🌟', '🎭', '🎪', '🎯', '🎨', '🎵', '🚀', '💎', '🔥', '🌈', '⚡'];
const COLORS = ['#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#a18cd1', '#fbc2eb', '#00c9ff', '#ff9a9e', '#fad0c4', '#a1c4fd', '#c2e9fb', '#d4fc79', '#96e6a1', '#fccb90', '#e0c3fc', '#8fd3f4', '#b8cbb8', '#e2d1c3', '#ffecd2', '#fcb69f'];

const STATES = {
  LOBBY: 'lobby',
  QUESTION_SETUP: 'question_setup',
  ANSWERING: 'answering',
  WAITING_TO_START: 'waiting_to_start',
  GUESSING: 'guessing',
  ROUND_RESULTS: 'round_results',
  LEADERBOARD: 'leaderboard',
  FINAL: 'final'
};

// Fisher-Yates shuffle (unbiased)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class GameRoom {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.state = STATES.LOBBY;
    this.players = {};
    this.questions = [];
    this.answers = {};
    this.currentRound = 0;
    this.roundResults = [];
    this.scores = {};
    this.timerEnabled = false;
    this.timerDuration = 60000;
    this.roundGuesses = {};
    this.roundStartTime = null;
    this.roundShuffledAnswers = {};
    this._currentAnswerOwners = null;
    this.idAliases = {};  // oldId -> newId, for resolving stale IDs
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this._avatarIndex = 0;
    this._colorIndex = 0;
  }

  addPlayer(socketId, name) {
    if (this.state !== STATES.LOBBY) return { error: 'המשחק כבר התחיל' };

    // Clean up disconnected player with same name
    const existingEntry = Object.entries(this.players).find(([, p]) => p.name === name);
    if (existingEntry) {
      if (existingEntry[1].connected) return { error: 'שם זה כבר תפוס' };
      const oldId = existingEntry[0];
      delete this.players[oldId];
      delete this.scores[oldId];
    }

    const avatar = AVATARS[this._avatarIndex % AVATARS.length];
    const color = COLORS[this._colorIndex % COLORS.length];
    this._avatarIndex++;
    this._colorIndex++;

    this.players[socketId] = { name, avatar, color, connected: true };
    this.scores[socketId] = 0;
    this.lastActivity = Date.now();
    return { success: true, avatar, color };
  }

  removePlayer(socketId) {
    if (this.players[socketId]) {
      this.players[socketId].connected = false;
      this.players[socketId].disconnectedAt = Date.now();
    }
    this.lastActivity = Date.now();
  }

  resolveId(id) {
    let resolved = id;
    let depth = 0;
    while (this.idAliases[resolved] && depth < 10) {
      resolved = this.idAliases[resolved];
      depth++;
    }
    return resolved;
  }

  reconnectPlayer(socketId, oldSocketId) {
    if (!this.players[oldSocketId] || socketId === oldSocketId) return;

    // Register alias so any future reference to oldSocketId resolves to socketId
    this.idAliases[oldSocketId] = socketId;

    this.players[socketId] = { ...this.players[oldSocketId], connected: true };
    delete this.players[socketId].disconnectedAt;
    this.scores[socketId] = this.scores[oldSocketId] || 0;
    delete this.players[oldSocketId];
    delete this.scores[oldSocketId];

    // Migrate answers
    Object.keys(this.answers).forEach(qId => {
      if (this.answers[qId][oldSocketId]) {
        this.answers[qId][socketId] = this.answers[qId][oldSocketId];
        delete this.answers[qId][oldSocketId];
      }
    });

    // Migrate current round guesses (keys = guesser IDs)
    if (this.roundGuesses[oldSocketId]) {
      this.roundGuesses[socketId] = this.roundGuesses[oldSocketId];
      delete this.roundGuesses[oldSocketId];
    }

    // Migrate guessed-player VALUES in current round guesses
    // (other players may have guessed oldSocketId in their matches)
    Object.values(this.roundGuesses).forEach(({ matches }) => {
      if (matches) {
        Object.keys(matches).forEach(aId => {
          if (matches[aId] === oldSocketId) matches[aId] = socketId;
        });
      }
    });

    // Migrate _currentAnswerOwners (critical for guessing phase)
    if (this._currentAnswerOwners) {
      Object.entries(this._currentAnswerOwners).forEach(([anonId, pid]) => {
        if (pid === oldSocketId) {
          this._currentAnswerOwners[anonId] = socketId;
        }
      });
    }

    // Migrate past roundResults for correct final stats
    this.roundResults.forEach(rr => {
      if (rr.answerOwners) {
        Object.entries(rr.answerOwners).forEach(([anonId, pid]) => {
          if (pid === oldSocketId) rr.answerOwners[anonId] = socketId;
        });
      }
      // Migrate guesser keys
      if (rr.guesses && rr.guesses[oldSocketId]) {
        rr.guesses[socketId] = rr.guesses[oldSocketId];
        delete rr.guesses[oldSocketId];
      }
      // Migrate guessed-player VALUES inside all match objects
      if (rr.guesses) {
        Object.values(rr.guesses).forEach(matches => {
          if (matches) {
            Object.keys(matches).forEach(aId => {
              if (matches[aId] === oldSocketId) matches[aId] = socketId;
            });
          }
        });
      }
    });

    if (this.hostSocketId === oldSocketId) {
      this.hostSocketId = socketId;
    }
  }

  reconnectByName(socketId, name) {
    const entry = Object.entries(this.players).find(([, p]) => p.name === name);
    if (entry) {
      const [oldId] = entry;
      this.reconnectPlayer(socketId, oldId);
      return true;
    }
    return false;
  }

  migrateHost() {
    const nextHost = Object.entries(this.players).find(([, p]) => p.connected);
    if (nextHost) {
      this.hostSocketId = nextHost[0];
      return { newHostId: nextHost[0], name: nextHost[1].name };
    }
    return null;
  }

  getGameState(forPlayerId) {
    const gs = {
      state: this.state,
      roomCode: this.code,
      players: this.getPlayerList(),
      questions: this.questions.map(q => ({ id: q.id, text: q.text, supportsImage: q.supportsImage })),
      currentRound: this.currentRound,
      scores: this.scores,
      timerEnabled: this.timerEnabled,
      timerDuration: this.timerDuration,
      leaderboard: this.getLeaderboard()
    };

    // Include answering progress for the specific player
    if (forPlayerId && this.state === STATES.ANSWERING) {
      const answered = [];
      this.questions.forEach(q => {
        if (this.answers[q.id] && this.answers[q.id][forPlayerId]) {
          answered.push(q.id);
        }
      });
      gs.answeredQuestionIds = answered;
    }

    return gs;
  }

  setQuestions(questions) {
    this.questions = questions;
    this.questions.forEach(q => { this.answers[q.id] = {}; });
    this.lastActivity = Date.now();
  }

  submitAnswer(socketId, questionId, text, image) {
    if (!this.answers[questionId]) this.answers[questionId] = {};
    this.answers[questionId][socketId] = { text: text || '', image: image || null };
    this.lastActivity = Date.now();
  }

  getPlayerProgress() {
    const totalQuestions = this.questions.length;
    const progress = {};
    Object.keys(this.players).forEach(pid => {
      let answered = 0;
      this.questions.forEach(q => {
        if (this.answers[q.id] && this.answers[q.id][pid]) answered++;
      });
      progress[pid] = { answered, total: totalQuestions };
    });
    return progress;
  }

  allPlayersFinished() {
    const totalQuestions = this.questions.length;
    return Object.keys(this.players).every(pid => {
      if (!this.players[pid].connected) return true;
      let answered = 0;
      this.questions.forEach(q => {
        if (this.answers[q.id] && this.answers[q.id][pid]) answered++;
      });
      return answered >= totalQuestions;
    });
  }

  startRound() {
    if (this.currentRound >= this.questions.length) return null;

    const question = this.questions[this.currentRound];
    const questionAnswers = this.answers[question.id] || {};

    // Only include answers from connected players
    const connectedIds = new Set(Object.keys(this.players).filter(id => this.players[id].connected));
    const answerEntries = Object.entries(questionAnswers).filter(([pid]) => connectedIds.has(pid));
    const shuffled = shuffle(answerEntries);

    const anonymousAnswers = {};
    const answerOwners = {};
    shuffled.forEach(([playerId, answer], index) => {
      const anonId = `ans_${index}`;
      anonymousAnswers[anonId] = { text: answer.text, image: answer.image };
      answerOwners[anonId] = playerId;
    });

    this.roundShuffledAnswers = anonymousAnswers;
    this._currentAnswerOwners = answerOwners;
    this.roundGuesses = {};
    this.roundStartTime = Date.now();
    this.state = STATES.GUESSING;
    this.lastActivity = Date.now();

    return {
      question,
      answers: anonymousAnswers,
      playerNames: this.getPlayerList(),
      roundNumber: this.currentRound + 1,
      totalRounds: this.questions.length,
      timerEnabled: this.timerEnabled,
      timerDuration: this.timerDuration
    };
  }

  submitGuesses(socketId, matches) {
    if (this.roundGuesses[socketId]) return; // prevent double submission

    const timeRemaining = this.timerEnabled
      ? Math.max(0, this.timerDuration - (Date.now() - this.roundStartTime))
      : 0;

    this.roundGuesses[socketId] = { matches, timeRemaining };
    this.lastActivity = Date.now();
  }

  allGuessesSubmitted() {
    const activePlayers = Object.entries(this.players)
      .filter(([, p]) => p.connected)
      .map(([id]) => id);
    return activePlayers.length > 0 && activePlayers.every(pid => this.roundGuesses[pid]);
  }

  calculateRoundResults() {
    const question = this.questions[this.currentRound];
    const answerOwners = this._currentAnswerOwners;
    const totalPlayers = Object.keys(answerOwners).length;
    const playerResults = {};
    const guessesForStats = {};

    Object.entries(this.roundGuesses).forEach(([guesserId, { matches, timeRemaining }]) => {
      let correctCount = 0;
      const details = {};
      guessesForStats[guesserId] = matches;

      Object.entries(matches).forEach(([answerId, guessedPlayerId]) => {
        const resolvedGuess = this.resolveId(guessedPlayerId);
        const actualPlayerId = this.resolveId(answerOwners[answerId]);
        const resolvedGuesser = this.resolveId(guesserId);
        const isCorrect = resolvedGuess === actualPlayerId;
        if (isCorrect && resolvedGuess !== resolvedGuesser) correctCount++;
        details[answerId] = {
          guessed: resolvedGuess,
          actual: actualPlayerId,
          correct: isCorrect
        };
      });

      const score = calculateRoundScore(
        correctCount, totalPlayers,
        timeRemaining, this.timerEnabled, this.timerDuration
      );

      this.scores[guesserId] = (this.scores[guesserId] || 0) + score.totalPoints;
      playerResults[guesserId] = { ...score, details };
    });

    // Store resolved IDs for accurate end-game stats
    const resolvedGuesses = {};
    Object.entries(guessesForStats).forEach(([gid, matches]) => {
      const resolvedGid = this.resolveId(gid);
      const resolvedMatches = {};
      Object.entries(matches).forEach(([aId, pid]) => {
        resolvedMatches[aId] = this.resolveId(pid);
      });
      resolvedGuesses[resolvedGid] = resolvedMatches;
    });

    const resolvedOwners = {};
    Object.entries(answerOwners).forEach(([aId, pid]) => {
      resolvedOwners[aId] = this.resolveId(pid);
    });

    this.roundResults.push({
      questionId: question.id,
      guesses: resolvedGuesses,
      answerOwners: resolvedOwners,
      answers: this.roundShuffledAnswers
    });

    const microStats = calculateRoundMicroStats(
      this.roundResults[this.roundResults.length - 1],
      this.players
    );

    const reveal = {};
    Object.entries(answerOwners).forEach(([answerId, playerId]) => {
      const resolved = this.resolveId(playerId);
      reveal[answerId] = {
        playerId: resolved,
        name: this.players[resolved]?.name || this.players[playerId]?.name,
        avatar: this.players[resolved]?.avatar || this.players[playerId]?.avatar,
        color: this.players[resolved]?.color || this.players[playerId]?.color
      };
    });

    this.state = STATES.ROUND_RESULTS;
    this.lastActivity = Date.now();

    return {
      playerResults,
      reveal,
      answers: this.roundShuffledAnswers,
      microStats,
      question: question.text,
      roundNumber: this.currentRound + 1,
      totalRounds: this.questions.length
    };
  }

  getLeaderboard() {
    return Object.entries(this.scores)
      .filter(([id]) => this.players[id])
      .map(([id, score]) => ({
        id,
        name: this.players[id].name,
        avatar: this.players[id].avatar,
        color: this.players[id].color,
        score
      }))
      .sort((a, b) => b.score - a.score);
  }

  advanceRound() {
    this.currentRound++;
    this.lastActivity = Date.now();

    if (this.currentRound >= this.questions.length) {
      this.state = STATES.FINAL;
      return { finished: true };
    }

    this.state = STATES.LEADERBOARD;
    return { finished: false };
  }

  getFinalResults() {
    const leaderboard = this.getLeaderboard();
    const stats = calculateStatistics(this.players, this.roundResults, this.questions);
    return { podium: leaderboard.slice(0, 3), fullLeaderboard: leaderboard, stats };
  }

  getPlayerList() {
    return Object.entries(this.players)
      .filter(([, p]) => p.connected)
      .map(([id, p]) => ({ id, name: p.name, avatar: p.avatar, color: p.color }));
  }

  isHost(socketId) {
    return this.hostSocketId === socketId;
  }
}

module.exports = { GameRoom, STATES };
