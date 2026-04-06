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

class GameRoom {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.state = STATES.LOBBY;
    this.players = {};
    this.questions = [];
    this.answers = {};       // questionId -> { playerId: { text, image } }
    this.currentRound = 0;
    this.roundResults = [];
    this.scores = {};
    this.timerEnabled = false;
    this.timerDuration = 60000;
    this.roundGuesses = {};
    this.roundStartTime = null;
    this.roundShuffledAnswers = {};
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this._avatarIndex = 0;
    this._colorIndex = 0;
  }

  addPlayer(socketId, name) {
    if (this.state !== STATES.LOBBY) return { error: 'המשחק כבר התחיל' };
    if (Object.values(this.players).some(p => p.name === name)) {
      return { error: 'שם זה כבר תפוס' };
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
    }
    this.lastActivity = Date.now();
  }

  reconnectPlayer(socketId, oldSocketId) {
    if (this.players[oldSocketId]) {
      this.players[socketId] = { ...this.players[oldSocketId], connected: true };
      this.scores[socketId] = this.scores[oldSocketId] || 0;
      delete this.players[oldSocketId];
      delete this.scores[oldSocketId];
      if (this.hostSocketId === oldSocketId) {
        this.hostSocketId = socketId;
      }
    }
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

    // Create shuffled answer list with anonymous IDs
    const answerEntries = Object.entries(questionAnswers);
    const shuffled = [...answerEntries].sort(() => Math.random() - 0.5);

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
    return activePlayers.every(pid => this.roundGuesses[pid]);
  }

  calculateRoundResults() {
    const question = this.questions[this.currentRound];
    const answerOwners = this._currentAnswerOwners;
    const totalPlayers = Object.keys(this.players).filter(id => this.players[id].connected).length;
    const playerResults = {};

    const guessesForStats = {};

    Object.entries(this.roundGuesses).forEach(([guesserId, { matches, timeRemaining }]) => {
      let correctCount = 0;
      const details = {};
      guessesForStats[guesserId] = matches;

      Object.entries(matches).forEach(([answerId, guessedPlayerId]) => {
        const actualPlayerId = answerOwners[answerId];
        const isCorrect = guessedPlayerId === actualPlayerId;
        if (isCorrect && guessedPlayerId !== guesserId) correctCount++;
        details[answerId] = {
          guessed: guessedPlayerId,
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

    // Store for end-game stats
    this.roundResults.push({
      questionId: question.id,
      guesses: guessesForStats,
      answerOwners,
      answers: this.roundShuffledAnswers
    });

    const microStats = calculateRoundMicroStats(
      this.roundResults[this.roundResults.length - 1],
      this.players
    );

    // Build reveal data (correct mapping for all answers)
    const reveal = {};
    Object.entries(answerOwners).forEach(([answerId, playerId]) => {
      reveal[answerId] = {
        playerId,
        name: this.players[playerId]?.name,
        avatar: this.players[playerId]?.avatar,
        color: this.players[playerId]?.color
      };
    });

    this.state = STATES.ROUND_RESULTS;
    this.lastActivity = Date.now();

    return {
      playerResults,
      reveal,
      microStats,
      question: question.text,
      roundNumber: this.currentRound + 1,
      totalRounds: this.questions.length
    };
  }

  getLeaderboard() {
    const sorted = Object.entries(this.scores)
      .filter(([id]) => this.players[id])
      .map(([id, score]) => ({
        id,
        name: this.players[id].name,
        avatar: this.players[id].avatar,
        color: this.players[id].color,
        score
      }))
      .sort((a, b) => b.score - a.score);

    return sorted;
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

    return {
      podium: leaderboard.slice(0, 3),
      fullLeaderboard: leaderboard,
      stats
    };
  }

  getPlayerList() {
    return Object.entries(this.players)
      .filter(([, p]) => p.connected)
      .map(([id, p]) => ({
        id,
        name: p.name,
        avatar: p.avatar,
        color: p.color
      }));
  }

  isHost(socketId) {
    return this.hostSocketId === socketId;
  }
}

module.exports = { GameRoom, STATES };
