const LobbyScreen = (() => {
  function renderHome(app) {
    return `
      <div class="screen" id="home-screen">
        <div class="screen-content">
          <div class="logo-container">
            <span class="logo-emoji">🎭</span>
            <h1 class="title title-lg">מי אמר מה?</h1>
            <p class="subtitle">כמה טוב אתם מכירים את החברים שלכם?</p>
          </div>
          <div style="height: 20px"></div>
          <button class="btn btn-primary btn-lg btn-full" onclick="App.createRoom()">
            🎮 יצירת משחק חדש
          </button>
          <button class="btn btn-ghost btn-lg btn-full" onclick="App.showJoinScreen()">
            🚪 הצטרפות למשחק
          </button>
        </div>
      </div>
    `;
  }

  function renderJoin() {
    return `
      <div class="screen" id="join-screen">
        <div class="screen-content">
          <div class="logo-container">
            <span class="logo-emoji">🚪</span>
            <h1 class="title">הצטרפות למשחק</h1>
          </div>
          <div class="glass-card">
            <div class="input-group">
              <label class="label">קוד חדר</label>
              <input class="input" id="room-code-input" type="text" maxlength="4"
                placeholder="הכניסו קוד בן 4 תווים" autocomplete="off"
                style="text-align: center; font-size: 1.5rem; letter-spacing: 6px; direction: ltr; text-transform: uppercase">
            </div>
            <div style="height: 12px"></div>
            <div class="input-group">
              <label class="label">השם שלך</label>
              <input class="input" id="player-name-input" type="text" maxlength="20"
                placeholder="הכניסו את השם שלכם">
            </div>
          </div>
          <div id="join-error" style="color: var(--accent-pink); font-size: 0.9rem; text-align: center; display: none;"></div>
          <button class="btn btn-primary btn-lg btn-full" onclick="App.joinRoom()">
            הצטרפות ➜
          </button>
          <button class="btn btn-ghost btn-full" onclick="App.showHome()">
            ← חזרה
          </button>
        </div>
      </div>
    `;
  }

  function renderWaiting(roomCode, players, isHost) {
    const playerChips = players.map(p => `
      <div class="player-chip" style="border-color: ${p.color}">
        <span class="avatar">${p.avatar}</span>
        <span>${escapeHtml(p.name)}</span>
      </div>
    `).join('');

    const hostControls = isHost ? `
      <div class="host-banner">👑 אתה מנהל המשחק</div>
      <button class="btn btn-primary btn-lg btn-full" onclick="App.showQuestionSetup()" ${players.length < 2 ? 'disabled' : ''}>
        📝 בחירת שאלות
      </button>
      ${players.length < 2 ? '<p class="label" style="text-align:center">צריך לפחות 2 שחקנים כדי להתחיל</p>' : ''}
    ` : `
      <div class="status-badge waiting" style="align-self: center">
        <span>ממתינים שהמארגן יתחיל</span>
        <span class="waiting-dots"><span></span><span></span><span></span></span>
      </div>
    `;

    return `
      <div class="screen" id="waiting-screen">
        <div class="screen-content">
          <div class="logo-container">
            <span class="logo-emoji">🎭</span>
            <h1 class="title">מי אמר מה?</h1>
          </div>
          <div class="glass-card" style="text-align: center">
            <p class="room-code-label">קוד החדר</p>
            <div class="room-code">${roomCode}</div>
            <p class="label">שתפו את הקוד עם החברים!</p>
          </div>
          <div>
            <p class="label" style="text-align: center; margin-bottom: 8px">שחקנים (${players.length})</p>
            <div class="player-list stagger-children">
              ${playerChips}
            </div>
          </div>
          ${hostControls}
        </div>
      </div>
    `;
  }

  return { renderHome, renderJoin, renderWaiting };
})();
