const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameRoom, STATES } = require('./GameRoom');
const { QUESTION_BANK } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6 // 5MB for image uploads
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

// Clean up old rooms every 30 minutes
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

  socket.on('create-room', (callback) => {
    const code = generateRoomCode();
    const room = new GameRoom(code, socket.id);
    rooms.set(code, room);
    currentRoom = code;
    socket.join(code);
    callback({ code });
  });

  socket.on('join-room', ({ code, name }, callback) => {
    const roomCode = code.toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) return callback({ error: 'חדר לא נמצא' });
    if (room.state !== STATES.LOBBY) return callback({ error: 'המשחק כבר התחיל' });

    const result = room.addPlayer(socket.id, name);
    if (result.error) return callback({ error: result.error });

    currentRoom = roomCode;
    socket.join(roomCode);

    io.to(roomCode).emit('player-joined', {
      players: room.getPlayerList(),
      newPlayer: { id: socket.id, name, avatar: result.avatar, color: result.color }
    });

    callback({ success: true, avatar: result.avatar, color: result.color, players: room.getPlayerList() });
  });

  socket.on('setup-questions', ({ questions, timerEnabled, timerDuration }, callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });

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
    if (!room) return;

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

    const roundData = room.startRound();
    if (!roundData) return callback?.({ error: 'אין שאלות' });

    io.to(currentRoom).emit('round-start', roundData);
    callback?.({ success: true });
  });

  socket.on('submit-guesses', ({ matches }) => {
    const room = rooms.get(currentRoom);
    if (!room || room.state !== STATES.GUESSING) return;

    room.submitGuesses(socket.id, matches);

    const activePlayers = Object.entries(room.players)
      .filter(([, p]) => p.connected).length;
    const submitted = Object.keys(room.roundGuesses).length;

    io.to(currentRoom).emit('guess-progress', { submitted, total: activePlayers });

    if (room.allGuessesSubmitted()) {
      const results = room.calculateRoundResults();
      io.to(currentRoom).emit('round-results', results);
    }
  });

  socket.on('show-leaderboard', (callback) => {
    const room = rooms.get(currentRoom);
    if (!room || !room.isHost(socket.id)) return callback?.({ error: 'לא מורשה' });

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

    const roundData = room.startRound();
    if (!roundData) return callback?.({ error: 'אין עוד סיבובים' });

    io.to(currentRoom).emit('round-start', roundData);
    callback?.({ success: true });
  });

  socket.on('timer-expired', () => {
    const room = rooms.get(currentRoom);
    if (!room || room.state !== STATES.GUESSING) return;

    // Auto-submit empty guesses for players who haven't submitted
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
    Object.keys(room.players).forEach(id => { room.scores[id] = 0; });

    io.to(currentRoom).emit('game-reset');
    callback?.({ success: true });
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.removePlayer(socket.id);
        io.to(currentRoom).emit('player-left', {
          playerId: socket.id,
          players: room.getPlayerList()
        });

        const activePlayers = Object.values(room.players).filter(p => p.connected);
        if (activePlayers.length === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
