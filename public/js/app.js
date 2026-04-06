const App = (() => {
  let state = {
    screen: 'home',
    roomCode: null,
    playerName: null,
    isHost: false,
    players: [],
    questions: []
  };

  function init() {
    setupSocketListeners();
    QuestionSetupScreen.init();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    document.addEventListener('click', () => SoundManager.resume(), { once: true });
    document.addEventListener('touchstart', () => SoundManager.resume(), { once: true });

    // If we have a saved session, show a "reconnecting" screen while we rejoin
    if (Socket.hasSavedSession()) {
      renderScreen(`
        <div class="screen">
          <div class="screen-content" style="justify-content: center; min-height: 80vh">
            <span class="logo-emoji">🎭</span>
            <h1 class="title">מתחבר מחדש...</h1>
            <div class="waiting-dots" style="justify-content: center"><span></span><span></span><span></span></div>
          </div>
        </div>
      `);
      // Socket.js will handle the rejoin on 'connect' and call handleRejoin
    } else {
      renderScreen(LobbyScreen.renderHome());
    }

    // Warn before closing/refreshing during active game
    window.addEventListener('beforeunload', (e) => {
      if (state.screen !== 'home' && state.roomCode) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function handleRejoin(gameState) {
    state.roomCode = gameState.roomCode;
    state.isHost = gameState.isHost;
    state.players = gameState.players;
    state.questions = gameState.questions || [];

    const myPlayer = gameState.players.find(p => p.id === Socket.getId());
    state.playerName = myPlayer?.name || state.playerName;

    // Route to the correct screen based on game state
    switch (gameState.state) {
      case 'lobby':
        state.screen = 'waiting';
        renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
        break;

      case 'question_setup':
        if (state.isHost) {
          state.screen = 'question-setup';
          renderScreen(QuestionSetupScreen.render());
        } else {
          state.screen = 'waiting';
          renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
        }
        break;

      case 'answering':
        state.screen = 'answering';
        if (state.questions.length > 0) {
          QuestionsScreen.init(state.questions);
          // Skip already-answered questions
          if (gameState.answeredQuestionIds) {
            QuestionsScreen.skipAnswered(gameState.answeredQuestionIds);
          }
          renderScreen(QuestionsScreen.render());
        } else {
          renderScreen(renderWaitingGeneric('ממתינים...'));
        }
        break;

      case 'waiting_to_start':
        if (state.isHost) {
          renderScreen(`
            <div class="screen">
              <div class="screen-content" style="justify-content: center; min-height: 80vh">
                <span style="font-size: 4rem">🎉</span>
                <h1 class="title">כולם סיימו!</h1>
                <p class="subtitle">הגיע הזמן להתחיל לנחש</p>
                <button class="btn btn-success btn-lg btn-full" onclick="App.startGame()">
                  🚀 התחלת המשחק
                </button>
              </div>
            </div>
          `);
        } else {
          renderScreen(renderWaitingGeneric('ממתינים שהמנהל יתחיל את המשחק...'));
        }
        break;

      case 'guessing':
        state.screen = 'guessing';
        renderScreen(renderWaitingGeneric('סיבוב ניחושים מתנהל... ממתינים לסיבוב הבא'));
        break;

      case 'round_results':
      case 'leaderboard':
        state.screen = 'leaderboard';
        LeaderboardScreen.init(gameState.leaderboard);
        renderScreen(LeaderboardScreen.render());
        break;

      case 'final':
        state.screen = 'leaderboard';
        LeaderboardScreen.init(gameState.leaderboard);
        renderScreen(LeaderboardScreen.render());
        break;

      default:
        state.screen = 'waiting';
        renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
        break;
    }
  }

  function renderWaitingGeneric(message) {
    return `
      <div class="screen">
        <div class="screen-content" style="justify-content: center; min-height: 80vh">
          <span class="logo-emoji">🎭</span>
          <h1 class="title">מי אמר מה?</h1>
          <p class="subtitle">${message}</p>
          <div class="status-badge waiting">
            <span class="waiting-dots"><span></span><span></span><span></span></span>
          </div>
        </div>
      </div>
    `;
  }

  function setupSocketListeners() {
    Socket.on('player-joined', (data) => {
      state.players = data.players;
      if (state.screen === 'waiting') {
        SoundManager.join();
        renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
      }
    });

    Socket.on('player-left', (data) => {
      state.players = data.players;
      if (state.screen === 'waiting') {
        renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
      }
    });

    Socket.on('questions-started', (data) => {
      state.questions = data.questions;
      state.screen = 'answering';
      QuestionsScreen.init(data.questions);
      renderScreen(QuestionsScreen.render());
    });

    Socket.on('answer-progress', (progress) => {
      QuestionsScreen.updateProgress(progress);
    });

    Socket.on('all-answers-done', () => {
      state.screen = 'waiting_to_start';
      if (state.isHost) {
        renderScreen(`
          <div class="screen">
            <div class="screen-content" style="justify-content: center; min-height: 80vh">
              <span style="font-size: 4rem">🎉</span>
              <h1 class="title">כולם סיימו!</h1>
              <p class="subtitle">הגיע הזמן להתחיל לנחש</p>
              <button class="btn btn-success btn-lg btn-full" onclick="App.startGame()">
                🚀 התחלת המשחק
              </button>
            </div>
          </div>
        `);
      } else {
        renderScreen(renderWaitingGeneric('כולם סיימו! ממתינים שהמנהל יתחיל את המשחק...'));
      }
    });

    Socket.on('round-start', (data) => {
      state.screen = 'guessing';
      GuessingScreen.init(data);
      renderScreen(GuessingScreen.render());
    });

    Socket.on('guess-progress', (data) => {
      GuessingScreen.updateGuessProgress(data);
    });

    Socket.on('round-results', (data) => {
      state.screen = 'results';
      GuessingScreen.destroy();
      ResultsScreen.init(data);
      renderScreen(ResultsScreen.render());

      const myResults = data.playerResults[Socket.getId()];
      if (myResults) {
        if (myResults.correctCount === myResults.matchableCount) {
          SoundManager.victory();
        } else if (myResults.correctCount > 0) {
          SoundManager.correct();
        } else {
          SoundManager.wrong();
        }
      }
    });

    Socket.on('show-leaderboard', (data) => {
      state.screen = 'leaderboard';
      LeaderboardScreen.init(data.leaderboard);
      renderScreen(LeaderboardScreen.render());
      SoundManager.reveal();
    });

    Socket.on('game-final', (data) => {
      state.screen = 'podium';
      PodiumScreen.init(data);
      renderScreen(PodiumScreen.render());
      SoundManager.victory();
      setTimeout(() => Animations.launchConfetti(4000), 500);
    });

    Socket.on('game-reset', () => {
      GuessingScreen.destroy();
      state.screen = 'waiting';
      state.questions = [];
      QuestionSetupScreen.reset();
      renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
    });

    Socket.on('host-changed', (data) => {
      if (data.newHostId === Socket.getId()) {
        state.isHost = true;
        Socket.setRoom(state.roomCode, state.playerName, true);
      }
    });
  }

  function renderScreen(html) {
    const app = document.getElementById('app');
    app.innerHTML = html;
    app.scrollTop = 0;
  }

  // ===== Actions =====

  function createRoom() {
    SoundManager.click();
    Socket.emit('create-room', (res) => {
      if (res.code) {
        state.roomCode = res.code;
        state.isHost = true;
        state.screen = 'join-as-host';
        renderScreen(`
          <div class="screen" id="host-join-screen">
            <div class="screen-content">
              <div class="logo-container">
                <span class="logo-emoji">🎭</span>
                <h1 class="title">מי אמר מה?</h1>
              </div>
              <div class="glass-card" style="text-align: center">
                <p class="room-code-label">קוד החדר</p>
                <div class="room-code">${res.code}</div>
                <p class="label">שתפו את הקוד עם החברים!</p>
              </div>
              <div class="input-group">
                <label class="label">השם שלך (מנהל המשחק)</label>
                <input class="input" id="host-name-input" type="text" maxlength="20" placeholder="הכניסו את השם שלכם">
              </div>
              <button class="btn btn-primary btn-lg btn-full" onclick="App.hostJoin()">
                הצטרפות כמנהל ➜
              </button>
            </div>
          </div>
        `);
      }
    });
  }

  function hostJoin() {
    const nameInput = document.getElementById('host-name-input');
    const name = nameInput?.value.trim();
    if (!name) {
      nameInput?.focus();
      return;
    }

    SoundManager.click();
    Socket.emit('join-room', { code: state.roomCode, name }, (res) => {
      if (res.error) {
        alert(res.error);
        return;
      }
      state.playerName = name;
      state.players = res.players;
      state.screen = 'waiting';
      Socket.setRoom(state.roomCode, name, state.isHost);
      renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
    });
  }

  function showJoinScreen() {
    SoundManager.click();
    renderScreen(LobbyScreen.renderJoin());
  }

  function joinRoom() {
    const codeInput = document.getElementById('room-code-input');
    const nameInput = document.getElementById('player-name-input');
    const code = codeInput?.value.trim().toUpperCase();
    const name = nameInput?.value.trim();
    const errorEl = document.getElementById('join-error');

    if (!code || code.length !== 4) {
      if (errorEl) { errorEl.textContent = 'הכניסו קוד בן 4 תווים'; errorEl.style.display = 'block'; }
      codeInput?.focus();
      return;
    }
    if (!name) {
      if (errorEl) { errorEl.textContent = 'הכניסו את השם שלכם'; errorEl.style.display = 'block'; }
      nameInput?.focus();
      return;
    }

    SoundManager.click();
    Socket.emit('join-room', { code, name }, (res) => {
      if (res.error) {
        if (errorEl) { errorEl.textContent = res.error; errorEl.style.display = 'block'; }
        return;
      }
      state.roomCode = code;
      state.playerName = name;
      state.players = res.players;
      state.isHost = false;
      state.screen = 'waiting';
      Socket.setRoom(code, name, false);
      renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
    });
  }

  function showHome() {
    GuessingScreen.destroy();
    state = { screen: 'home', roomCode: null, playerName: null, isHost: false, players: [], questions: [] };
    Socket.clearSession();
    QuestionSetupScreen.reset();
    renderScreen(LobbyScreen.renderHome());
  }

  function showQuestionSetup() {
    SoundManager.click();
    state.screen = 'question-setup';
    renderScreen(QuestionSetupScreen.render());
  }

  function backToWaiting() {
    state.screen = 'waiting';
    renderScreen(LobbyScreen.renderWaiting(state.roomCode, state.players, state.isHost));
  }

  function startGame() {
    SoundManager.click();
    Socket.emit('start-game', (res) => {
      if (res?.error) alert(res.error);
    });
  }

  function showLeaderboard() {
    SoundManager.click();
    Socket.emit('show-leaderboard', (res) => {
      if (res?.error) alert(res.error);
    });
  }

  function nextRound() {
    SoundManager.click();
    Socket.emit('next-round', (res) => {
      if (res?.error) alert(res.error);
    });
  }

  function playAgain() {
    SoundManager.click();
    Socket.emit('play-again', (res) => {
      if (res?.error) alert(res.error);
    });
  }

  function isHost() {
    return state.isHost;
  }

  function getPlayers() {
    return state.players;
  }

  // Init on load
  document.addEventListener('DOMContentLoaded', init);

  return {
    renderScreen, createRoom, hostJoin, showJoinScreen, joinRoom,
    showHome, showQuestionSetup, backToWaiting,
    startGame, showLeaderboard, nextRound, playAgain,
    isHost, getPlayers, handleRejoin
  };
})();
