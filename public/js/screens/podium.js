const PodiumScreen = (() => {
  let finalData = null;

  function init(data) {
    finalData = data;
  }

  function render() {
    if (!finalData) return '';

    const podium = finalData.podium;
    const stats = finalData.stats;

    // Podium: show 2nd, 1st, 3rd (visual arrangement)
    const second = podium[1];
    const first = podium[0];
    const third = podium[2];

    const podiumHtml = `
      <div class="podium-container">
        ${second ? `
          <div class="podium-place">
            <div class="podium-avatar">${second.avatar}</div>
            <div class="podium-name">${escapeHtml(second.name)}</div>
            <div class="podium-score">${second.score.toLocaleString()}</div>
            <div class="podium-bar second">2</div>
          </div>
        ` : ''}
        ${first ? `
          <div class="podium-place">
            <div class="podium-avatar" style="font-size: 3rem">${first.avatar}</div>
            <div class="podium-name">${escapeHtml(first.name)}</div>
            <div class="podium-score">${first.score.toLocaleString()}</div>
            <div class="podium-bar first">1</div>
          </div>
        ` : ''}
        ${third ? `
          <div class="podium-place">
            <div class="podium-avatar">${third.avatar}</div>
            <div class="podium-name">${escapeHtml(third.name)}</div>
            <div class="podium-score">${third.score.toLocaleString()}</div>
            <div class="podium-bar third">3</div>
          </div>
        ` : ''}
      </div>
    `;

    // Stats cards
    const statsHtml = buildStatsCards(stats);

    // Full leaderboard
    const fullBoard = finalData.fullLeaderboard.map((entry, i) => `
      <div class="leaderboard-row" style="animation-delay: ${i * 80}ms">
        <span class="leaderboard-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span>
        <span class="leaderboard-avatar">${entry.avatar}</span>
          <span class="leaderboard-name">${escapeHtml(entry.name)}</span>
        <span class="leaderboard-score">${entry.score.toLocaleString()}</span>
      </div>
    `).join('');

    return `
      <div class="screen" id="podium-screen">
        <div class="screen-content">
          <h1 class="title title-lg">🏆 תוצאות סופיות</h1>

          ${podiumHtml}

          <div class="divider"></div>
          <h2 class="title" style="font-size: 1.3rem">📊 סטטיסטיקות</h2>
          ${statsHtml}

          <div class="divider"></div>
          <h2 class="title" style="font-size: 1.3rem">📋 דירוג מלא</h2>
          <div class="leaderboard stagger-children">
            ${fullBoard}
          </div>

          ${App.isHost() ? `
            <button class="btn btn-primary btn-lg btn-full" onclick="App.playAgain()">
              🔄 משחק חדש
            </button>
          ` : ''}

          <button class="btn btn-ghost btn-full" onclick="App.showHome()">
            🏠 חזרה לדף הבית
          </button>
        </div>
      </div>
    `;
  }

  function buildStatsCards(stats) {
    if (!stats) return '';

    const cards = [];

    if (stats.mindReader) {
      cards.push(`
        <div class="stat-card">
          <span class="stat-emoji">🧠</span>
          <div class="stat-title">קורא/ת מחשבות</div>
          <div class="stat-name">${escapeHtml(stats.mindReader.name)}</div>
          <div class="stat-value">${stats.mindReader.correctCount} ניחושים נכונים</div>
        </div>
      `);
    }

    if (stats.mysteryPerson) {
      cards.push(`
        <div class="stat-card">
          <span class="stat-emoji">🕵️</span>
          <div class="stat-title">אדם המסתורין</div>
          <div class="stat-name">${escapeHtml(stats.mysteryPerson.name)}</div>
          <div class="stat-value">רק ${stats.mysteryPerson.percentage}% ניחשו נכון</div>
        </div>
      `);
    }

    if (stats.openBook) {
      cards.push(`
        <div class="stat-card">
          <span class="stat-emoji">📖</span>
          <div class="stat-title">ספר פתוח</div>
          <div class="stat-name">${escapeHtml(stats.openBook.name)}</div>
          <div class="stat-value">${stats.openBook.percentage}% ניחשו נכון</div>
        </div>
      `);
    }

    if (stats.soulmates) {
      cards.push(`
        <div class="stat-card stat-card-full">
          <span class="stat-emoji">💕</span>
          <div class="stat-title">נשמות תואמות</div>
          <div class="stat-name">${escapeHtml(stats.soulmates.player1.name)} & ${escapeHtml(stats.soulmates.player2.name)}</div>
          <div class="stat-value">ניחשו אחד את השני ${stats.soulmates.count} פעמים</div>
        </div>
      `);
    }

    if (stats.surpriseOfTheNight) {
      cards.push(`
        <div class="stat-card stat-card-full">
          <span class="stat-emoji">😱</span>
          <div class="stat-title">ההפתעה של הערב</div>
          <div class="stat-name">${escapeHtml(stats.surpriseOfTheNight.name)}</div>
          <div class="stat-value">"${escapeHtml(truncate(stats.surpriseOfTheNight.answerText, 60))}" — הטעה/תה ${stats.surpriseOfTheNight.fooledCount} שחקנים</div>
        </div>
      `);
    }

    // Per-player cards
    if (stats.playerCards) {
      const playerCardHtml = Object.entries(stats.playerCards).map(([id, card]) => `
        <div class="stat-card">
          <div class="stat-name">${card.name}</div>
          <div class="stat-value">${card.guessedCorrectPct}% ניחשו אותו/ה נכון</div>
          <div class="stat-value">${card.totalCorrectGuesses} ניחושים נכונים</div>
        </div>
      `).join('');

      cards.push(`
        <div class="stat-card stat-card-full" style="padding: 12px">
          <div class="stat-title" style="margin-bottom: 8px">📇 כרטיס שחקן</div>
          <div class="stats-grid">${playerCardHtml}</div>
        </div>
      `);
    }

    return `<div class="stats-grid stagger-children">${cards.join('')}</div>`;
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  return { init, render };
})();
