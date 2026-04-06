const ResultsScreen = (() => {
  let resultsData = null;
  let myResults = null;

  function init(data) {
    resultsData = data;
    myResults = data.playerResults[Socket.getId()];
  }

  function render() {
    if (!resultsData || !myResults) return '';

    // Full answer reveal: show every answer with the player who wrote it
    const answerRevealItems = Object.entries(resultsData.reveal).map(([answerId, player], index) => {
      const answerData = resultsData.answers?.[answerId];
      const text = answerData?.text || '';
      const image = answerData?.image || null;

      return `
        <div class="result-item correct" style="animation-delay: ${index * 120}ms; background: var(--bg-card); border-color: var(--border-glass)">
          <div style="display:flex; align-items:center; gap:8px; min-width:80px">
            <span style="font-size:1.3rem">${player.avatar}</span>
            <strong style="color:${player.color}">${escapeHtml(player.name)}</strong>
          </div>
          <div class="result-details" style="flex:1; border-right: 2px solid ${player.color}; padding-right:12px">
            <div style="font-size:0.95rem">${escapeHtml(text)}</div>
            ${image ? `<img src="${image}" style="max-width:120px; max-height:80px; border-radius:8px; margin-top:4px" alt="">` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Personal results: what did I get right/wrong
    const myGuessItems = Object.entries(myResults.details || {}).map(([answerId, detail], index) => {
      const actualPlayer = resultsData.reveal[answerId];
      if (!actualPlayer) return '';
      const isSelf = detail.actual === Socket.getId();
      if (isSelf) return '';

      const isCorrect = detail.correct;
      return `
        <div class="result-item ${isCorrect ? 'correct' : 'wrong'}" style="animation-delay: ${index * 100}ms">
          <span class="result-icon">${isCorrect ? '✅' : '❌'}</span>
          <div class="result-details">
            <div><strong>${actualPlayer.avatar} ${escapeHtml(actualPlayer.name)}</strong></div>
            ${!isCorrect ? `<div class="result-answer" style="color: var(--accent-pink)">ניחשת: ${getPlayerName(detail.guessed)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const accuracyLabel = myResults.correctCount === myResults.matchableCount
      ? '🎯 סיבוב מושלם!'
      : myResults.correctCount >= myResults.matchableCount * 0.75
        ? '💪 סיבוב מצוין!'
        : myResults.correctCount >= myResults.matchableCount * 0.5
          ? '👍 לא רע!'
          : '🤷 בפעם הבאה...';

    const microStats = resultsData.microStats;

    return `
      <div class="screen" id="results-screen">
        <div class="screen-content">
          <div class="round-header">
            <div class="round-number">סיבוב ${resultsData.roundNumber} מתוך ${resultsData.totalRounds}</div>
            <div class="round-question">${escapeHtml(resultsData.question)}</div>
          </div>

          <div class="section-label">📋 מי ענה מה?</div>
          <div class="results-list stagger-children">
            ${answerRevealItems}
          </div>

          <div class="divider"></div>

          <div class="score-breakdown animate-scale-in">
            <div style="font-size: 1.3rem; margin-bottom: 4px">${accuracyLabel}</div>
            <div class="score-total" id="round-score">+${myResults.totalPoints}</div>
            <div class="score-detail">
              ${myResults.basePoints} בסיס
              ${myResults.accuracyBonus > 0 ? ` + ${myResults.accuracyBonus} בונוס דיוק` : ''}
              ${myResults.speedBonus > 0 ? ` + ${myResults.speedBonus} בונוס מהירות` : ''}
            </div>
            <div class="score-detail">${myResults.correctCount} מתוך ${myResults.matchableCount} נכונים</div>
          </div>

          <div class="section-label">🎯 הניחושים שלך</div>
          <div class="results-list stagger-children">
            ${myGuessItems}
          </div>

          ${microStats ? `
            <div class="micro-stats">
              ${microStats.openBook ? `
                <div class="micro-stat-card">
                  <div class="micro-stat-label">📖 ספר פתוח</div>
                  <div class="micro-stat-emoji">${getPlayerAvatar(microStats.openBook.playerId)}</div>
                  <div class="micro-stat-name">${escapeHtml(microStats.openBook.name)}</div>
                  <div class="micro-stat-value">${microStats.openBook.pct}% ניחשו נכון</div>
                </div>
              ` : ''}
              ${microStats.enigma ? `
                <div class="micro-stat-card">
                  <div class="micro-stat-label">🕵️ אניגמה</div>
                  <div class="micro-stat-emoji">${getPlayerAvatar(microStats.enigma.playerId)}</div>
                  <div class="micro-stat-name">${escapeHtml(microStats.enigma.name)}</div>
                  <div class="micro-stat-value">${microStats.enigma.pct}% ניחשו נכון</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${App.isHost() ? `
            <button class="btn btn-primary btn-lg btn-full" onclick="App.showLeaderboard()">
              🏆 טבלת ניקוד
            </button>
          ` : `
            <div class="status-badge waiting" style="align-self: center">
              <span>ממתינים למנהל המשחק</span>
              <span class="waiting-dots"><span></span><span></span><span></span></span>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function getPlayerName(playerId) {
    const fromReveal = Object.values(resultsData?.reveal || {}).find(r => r.playerId === playerId);
    if (fromReveal) return fromReveal.name;
    const player = App.getPlayers().find(p => p.id === playerId);
    return player ? player.name : 'לא ידוע';
  }

  function getPlayerAvatar(playerId) {
    const player = App.getPlayers().find(p => p.id === playerId);
    return player ? player.avatar : '❓';
  }

  return { init, render };
})();
