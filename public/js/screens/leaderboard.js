const LeaderboardScreen = (() => {
  let leaderboardData = [];

  function init(data) {
    leaderboardData = data;
  }

  function render() {
    const maxScore = leaderboardData.length > 0 ? leaderboardData[0].score : 1;

    const rows = leaderboardData.map((entry, index) => {
      const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
      const rankSymbol = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
      const barWidth = maxScore > 0 ? (entry.score / maxScore) * 100 : 0;
      const isMe = entry.id === Socket.getId();

      return `
        <div class="leaderboard-row ${isMe ? 'glow' : ''}" style="animation-delay: ${index * 100}ms; position: relative; ${isMe ? 'border-color: var(--accent-purple);' : ''}">
          <span class="leaderboard-rank ${rankClass}">${rankSymbol}</span>
          <span class="leaderboard-avatar">${entry.avatar}</span>
          <span class="leaderboard-name">${escapeHtml(entry.name)} ${isMe ? '(אתה)' : ''}</span>
          <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
          <div class="leaderboard-bar-container">
            <div class="leaderboard-bar" style="width: ${barWidth}%; animation-delay: ${index * 100 + 300}ms"></div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="screen" id="leaderboard-screen">
        <div class="screen-content">
          <span style="font-size: 3rem">🏆</span>
          <h1 class="title">טבלת ניקוד</h1>

          <div class="leaderboard stagger-children">
            ${rows}
          </div>

          ${App.isHost() ? `
            <button class="btn btn-primary btn-lg btn-full" onclick="App.nextRound()">
              ➜ סיבוב הבא
            </button>
          ` : `
            <div class="status-badge waiting" style="align-self: center">
              <span>ממתינים לסיבוב הבא</span>
              <span class="waiting-dots"><span></span><span></span><span></span></span>
            </div>
          `}
        </div>
      </div>
    `;
  }

  return { init, render };
})();
