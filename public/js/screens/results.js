const ResultsScreen = (() => {
  let resultsData = null;
  let myResults = null;

  function init(data) {
    resultsData = data;
    myResults = data.playerResults[Socket.getId()];
  }

  function render() {
    if (!resultsData || !myResults) return '';

    const resultItems = Object.entries(myResults.details || {}).map(([answerId, detail], index) => {
      const revealData = resultsData.reveal[answerId];
      if (!revealData) return '';
      const answerData = resultsData.playerResults[Socket.getId()]?.details[answerId];
      const isCorrect = detail.correct;
      const guessedPlayer = resultsData.reveal[answerId];

      // Who did I guess?
      const guessedId = detail.guessed;
      const actualId = detail.actual;
      const isSelf = actualId === Socket.getId();

      if (isSelf) return '';

      const actualPlayer = resultsData.reveal[answerId];

      return `
        <div class="result-item ${isCorrect ? 'correct' : 'wrong'}" style="animation-delay: ${index * 150}ms">
          <span class="result-icon">${isCorrect ? '✅' : '❌'}</span>
          <div class="result-details">
            <div><strong>${actualPlayer.avatar} ${actualPlayer.name}</strong></div>
            ${!isCorrect ? `<div class="result-answer" style="color: var(--accent-pink)">ניחשת: ${getPlayerName(guessedId)}</div>` : ''}
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
            <div class="round-question">${resultsData.question}</div>
          </div>

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

          <div class="results-list stagger-children">
            ${resultItems}
          </div>

          ${microStats ? `
            <div class="micro-stats">
              ${microStats.openBook ? `
                <div class="micro-stat-card">
                  <div class="micro-stat-label">📖 ספר פתוח</div>
                  <div class="micro-stat-emoji">${getPlayerAvatar(microStats.openBook.playerId)}</div>
                  <div class="micro-stat-name">${microStats.openBook.name}</div>
                  <div class="micro-stat-value">${microStats.openBook.pct}% ניחשו נכון</div>
                </div>
              ` : ''}
              ${microStats.enigma ? `
                <div class="micro-stat-card">
                  <div class="micro-stat-label">🕵️ אניגמה</div>
                  <div class="micro-stat-emoji">${getPlayerAvatar(microStats.enigma.playerId)}</div>
                  <div class="micro-stat-name">${microStats.enigma.name}</div>
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
