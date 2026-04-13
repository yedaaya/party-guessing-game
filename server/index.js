const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameRoom, STATES } = require('./GameRoom');
const { QUESTION_BANK } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

app.get('/api/questions', (req, res) => {
  res.json(QUESTION_BANK);
});

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('rejoin-room', ({ code, name, oldSocketId }, callback) => {
    const roomCode = code?.toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      if (typeof callback === 'function') callback({ error: 'room_gone' });
      return;
    }

    currentRoom = roomCode;
    socket.join(roomCode);

    let reconnected = false;

    if (oldSocketId && room.players[oldSocketId]) {
      room.reconnectPlayer(socket.id, oldSocketId);
      reconnected = true;
    }

    if (!reconnected && name) {
      reconnected = room.reconnectByName(socket.id, name);
    }

    if (reconnected) {
      const gameState = room.getGameState(socket.id);
      gameState.isHost = room.isHost(socket.id);

      io.to(roomCode).emit('player-joined', { players: room.getPlayerList() });

      if (room.state === STATES.GUESSING && !room.roundGuesses[socket.id]) {
        room.submitGuesses(socket.id, {});
        const activeList = Object.entries(room.players).filter(([, p]) => p.connected);
        const submitted = activeList.filter(([id]) => room.roundGuesses[id]).length;
        io.to(roomCode).emit('guess-progress', { submitted, total: activeList.length });
        if (room.allGuessesSubmitted()) {
          const results = room.calculateRoundResults();
          io.to(roomCode).emit('round-results', results);
        }
      }

      if (typeof callback === 'function') callback({ success: true, gameState });
    } else {
      if (typeof callback === 'function') callback({ error: 'player_not_found' });
    }
  });

  socket.on('create-room', (callback) => {
    const code = generateRoomCode();
    const room = new GameRoom(code, socket.id);
    rooms.set(code, room);
    currentRoom = code;
    socket.join(code);
    callback({ code });
  });

  socket.on('join-room', ({ code, name }, callback) => {
    if (!code || !name) return callback({ error: 'חסרים פרטים' });
    const trimmedName = String(name).trim();
    if (trimmedName.length < 1 || trimmedName.length > 20) return callback({ error: 'שם חייב להיות בין 1 ל-20 תווים' });
    const roomCode = code.toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) return callback({ error: 'חדר לא נמצא' });
    if (room.state !== STATES.LOBBY) return callback({ error: 'המשחק כבר התחיל' });

    const result = room.addPlayer(socket.id, trimmedName);
    if (result.error) return callback({ error: result.error });

    currentRoom = roomCode;
    socket.join(roomCode);

    io.to(roomCode).emit('player-joined', {
      players: room.getPlayerList(),
      newPlayer: { id: socket.id, name: trimmedName, avatar: result.avatar, color: result.color }
    });

    callback({ success: true, avatar: result.avatar, color: result.color, players: room.getPlayerList() });
  });

  socket.on('setup-questions', ({ questions, timerEnabled, timerDuration }, callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });
    if (!questions || questions.length < 1) return callback?.({ error: 'צריך לפחות שאלה אחת' });

    room.setQuestions(questions);
    room.timerEnabled = !!timerEnabled;
    room.timerDuration = timerDuration || 60000;
    room.state = STATES.ANSWERING;

    io.to(currentRoom).emit('questions-started', {
      questions: questions.map(q => ({ id: q.id, text: q.text, supportsImage: q.supportsImage }))
    });

    callback?.({ success: true });
  });

  socket.on('submit-answer', ({ questionId, text, image }) => {
    const room = rooms.get(currentRoom);
    if (!room || room.state !== STATES.ANSWERING) return;

    room.submitAnswer(socket.id, questionId, text, image);

    const progress = room.getPlayerProgress();
    io.to(currentRoom).emit('answer-progress', progress);

    if (room.allPlayersFinished()) {
      room.state = STATES.WAITING_TO_START;
      io.to(currentRoom).emit('all-answers-done');
    }
  });

  socket.on('start-game', (callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });
    if (room.state !== STATES.WAITING_TO_START) return callback?.({ error: 'עדיין לא כולם סיימו' });

    const roundData = room.startRound();
    if (!roundData) return callback?.({ error: 'אין שאלות' });

    io.to(currentRoom).emit('round-start', roundData);
    callback?.({ success: true });
  });

  socket.on('submit-guesses', ({ matches }) => {
    const room = rooms.get(currentRoom);
    if (!room || room.state !== STATES.GUESSING) return;
    if (room.roundGuesses[socket.id]) return;

    room.submitGuesses(socket.id, matches);

    const activeList = Object.entries(room.players).filter(([, p]) => p.connected);
    const submitted = activeList.filter(([id]) => room.roundGuesses[id]).length;
    io.to(currentRoom).emit('guess-progress', { submitted, total: activeList.length });

    if (room.allGuessesSubmitted()) {
      const results = room.calculateRoundResults();
      io.to(currentRoom).emit('round-results', results);
    }
  });

  socket.on('show-leaderboard', (callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });
    if (room.state !== STATES.ROUND_RESULTS) return callback?.({ error: 'לא בשלב הנכון' });

    const advanceResult = room.advanceRound();
    const leaderboard = room.getLeaderboard();

    if (advanceResult.finished) {
      const finalResults = room.getFinalResults();
      io.to(currentRoom).emit('game-final', finalResults);
    } else {
      io.to(currentRoom).emit('show-leaderboard', { leaderboard });
    }

    callback?.({ success: true });
  });

  socket.on('next-round', (callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });
    if (room.state !== STATES.LEADERBOARD) return callback?.({ error: 'לא בשלב הנכון' });

    const roundData = room.startRound();
    if (!roundData) return callback?.({ error: 'אין עוד סיבובים' });

    io.to(currentRoom).emit('round-start', roundData);
    callback?.({ success: true });
  });

  socket.on('timer-expired', () => {
    const room = rooms.get(currentRoom);
    if (!room || room.state !== STATES.GUESSING) return;
    if (!room.timerEnabled) return;
    const elapsed = Date.now() - room.roundStartTime;
    if (elapsed < room.timerDuration - 2000) return;

    Object.entries(room.players).forEach(([pid, p]) => {
      if (p.connected && !room.roundGuesses[pid]) {
        room.submitGuesses(pid, {});
      }
    });

    if (room.allGuessesSubmitted()) {
      const results = room.calculateRoundResults();
      io.to(currentRoom).emit('round-results', results);
    }
  });

  socket.on('play-again', (callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });

    room.state = STATES.LOBBY;
    room.questions = [];
    room.answers = {};
    room.currentRound = 0;
    room.roundResults = [];
    room.scores = {};
    room.roundGuesses = {};
    room.roundShuffledAnswers = {};
    room._currentAnswerOwners = null;
    room.idAliases = {};
    Object.keys(room.players).forEach(id => { room.scores[id] = 0; });

    io.to(currentRoom).emit('game-reset');
    callback?.({ success: true });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const wasHost = room.isHost(socket.id);
    room.removePlayer(socket.id);

    // Host failover
    if (wasHost) {
      const newHost = room.migrateHost();
      if (newHost) {
        io.to(currentRoom).emit('host-changed', newHost);
      }
    }

    io.to(currentRoom).emit('player-left', {
      playerId: socket.id,
      players: room.getPlayerList()
    });

    // If disconnecting during answering, check if remaining players are all done
    if (room.state === STATES.ANSWERING && room.allPlayersFinished()) {
      room.state = STATES.WAITING_TO_START;
      io.to(currentRoom).emit('all-answers-done');
    }

    if (room.state === STATES.GUESSING && !room.roundGuesses[socket.id]) {
      room.submitGuesses(socket.id, {});
      if (room.allGuessesSubmitted()) {
        const results = room.calculateRoundResults();
        io.to(currentRoom).emit('round-results', results);
      }
    }

    const activePlayers = Object.values(room.players).filter(p => p.connected);
    if (activePlayers.length === 0) {
      const roomRef = room;
      const roomCode = currentRoom;
      setTimeout(() => {
        if (rooms.get(roomCode) === roomRef) {
          const stillEmpty = Object.values(roomRef.players).filter(p => p.connected).length === 0;
          if (stillEmpty) rooms.delete(roomCode);
        }
      }, 5 * 60 * 1000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
