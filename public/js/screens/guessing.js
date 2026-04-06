const GuessingScreen = (() => {
  let roundData = null;
  let assignments = {};  // answerId -> playerId
  let timerInterval = null;
  let timeLeft = 0;

  function init(data) {
    roundData = data;
    assignments = {};
    stopTimer();

    if (data.timerEnabled && data.timerDuration > 0) {
      timeLeft = Math.ceil(data.timerDuration / 1000);
      timerDeadline = Date.now() + data.timerDuration;
      startTimer();
    }
  }

  let timerDeadline = 0;

  function startTimer() {
    timerInterval = setInterval(() => {
      timeLeft = Math.max(0, Math.ceil((timerDeadline - Date.now()) / 1000));
      const timerEl = document.getElementById('round-timer');
      if (timerEl) {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        timerEl.className = 'round-timer' +
          (timeLeft <= 5 ? ' danger' : timeLeft <= 15 ? ' warning' : '');
      }

      if (timeLeft <= 10 && timeLeft > 0) SoundManager.countdown();
      if (timeLeft <= 0) {
        stopTimer();
        forceSubmit();
      }
    }, 250);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function render() {
    if (!roundData) return '';

    const unassignedAnswers = Object.entries(roundData.answers)
      .filter(([aId]) => !assignments[aId]);

    const myId = Socket.getId();
    const players = roundData.playerNames;

    const answerPool = unassignedAnswers.map(([aId, ans]) => `
      <div class="answer-card" draggable="true" data-answer-id="${aId}"
        ondragstart="GuessingScreen.onDragStart(event)"
        ondragend="GuessingScreen.onDragEnd(event)"
        onclick="GuessingScreen.onTouchStart(event)"
        ontouchend="GuessingScreen.onTouchStart(event)">
        <div class="answer-text">${escapeHtml(ans.text)}</div>
        ${ans.image ? `<img class="answer-image" src="${ans.image}" alt="answer image">` : ''}
      </div>
    `).join('');

    const playerSlots = players.map(p => {
      const assignedAnswer = Object.entries(assignments).find(([, pid]) => pid === p.id);
      const isSelf = p.id === myId;
      const ansData = assignedAnswer ? roundData.answers[assignedAnswer[0]] : null;

      return `
        <div class="player-slot ${isSelf ? 'self-slot' : ''}" data-player-id="${p.id}">
          <div class="player-slot-name" style="border-left: 3px solid ${p.color}">
            <span class="slot-avatar">${p.avatar}</span>
            <span>${escapeHtml(p.name)}</span>
          </div>
          <div class="player-slot-drop ${assignedAnswer ? 'filled' : ''} ${isSelf ? 'self-slot' : ''}"
            data-player-id="${p.id}"
            ondragover="GuessingScreen.onDragOver(event)"
            ondrop="GuessingScreen.onDrop(event)"
            ondragleave="GuessingScreen.onDragLeave(event)"
            ${isSelf ? '' : `onclick="GuessingScreen.onSlotClick('${p.id}')"`}>
            ${isSelf
              ? '<span style="font-size:0.85rem">🔒 זה אתה</span>'
              : assignedAnswer
                ? `<span class="answer-text">${escapeHtml(ansData?.text || '')}</span>
                   <span class="remove-btn" onclick="event.stopPropagation(); GuessingScreen.removeAssignment('${assignedAnswer[0]}')">✕</span>`
                : 'גררו תשובה לכאן'
            }
          </div>
        </div>
      `;
    }).join('');

    const timerDisplay = roundData.timerEnabled ? `
      <div id="round-timer" class="round-timer">
        ${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}
      </div>
    ` : '';

    const totalMatchable = players.filter(p => p.id !== myId).length;
    const assigned = Object.keys(assignments).length;
    const canSubmit = assigned === totalMatchable;

    return `
      <div class="screen" id="guessing-screen">
        <div class="screen-content">
          ${timerDisplay}

          <div class="round-header">
            <div class="round-number">סיבוב ${roundData.roundNumber} מתוך ${roundData.totalRounds}</div>
            <div class="round-question">${escapeHtml(roundData.question.text)}</div>
          </div>

          <div class="guessing-container">
            <div class="section-label">תשובות (${unassignedAnswers.length} נותרו)</div>
            <div class="answers-pool" id="answers-pool">
              ${answerPool || '<div style="text-align:center; color: var(--text-muted); padding: 12px">כל התשובות שובצו!</div>'}
            </div>

            <div class="divider"></div>

            <div class="section-label">שחקנים - התאימו כל תשובה לשחקן</div>
            <div class="players-slots" id="players-slots">
              ${playerSlots}
            </div>
          </div>

          <button class="btn ${canSubmit ? 'btn-success' : 'btn-primary'} btn-lg btn-full"
            onclick="GuessingScreen.submit()" ${canSubmit ? '' : 'disabled'}>
            ${canSubmit ? '✓ שליחת ניחושים' : `שובצו ${assigned}/${totalMatchable}`}
          </button>
        </div>
      </div>
    `;
  }

  // Drag & Drop
  let draggedAnswerId = null;

  function onDragStart(e) {
    draggedAnswerId = e.target.closest('.answer-card')?.dataset.answerId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('.answer-card')?.classList.add('dragging');
  }

  function onDragEnd(e) {
    e.target.closest('.answer-card')?.classList.remove('dragging');
    draggedAnswerId = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    const slot = e.target.closest('.player-slot-drop');
    if (slot && !slot.classList.contains('self-slot')) {
      slot.classList.add('drag-over');
    }
  }

  function onDragLeave(e) {
    const slot = e.target.closest('.player-slot-drop');
    if (slot) slot.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    const slot = e.target.closest('.player-slot-drop');
    if (!slot || slot.classList.contains('self-slot')) return;
    slot.classList.remove('drag-over');

    const playerId = slot.dataset.playerId;
    if (draggedAnswerId && playerId) {
      assignAnswer(draggedAnswerId, playerId);
    }
    draggedAnswerId = null;
  }

  // Tap-to-assign (primary mobile interaction)
  let selectedAnswerId = null;
  let lastTouchTime = 0;

  function onTouchStart(e) {
    if (e.type === 'click' && Date.now() - lastTouchTime < 500) return;
    if (e.type === 'touchend') lastTouchTime = Date.now();
    e.preventDefault();
    const card = e.target.closest('.answer-card');
    if (!card) return;

    const aId = card.dataset.answerId;

    // If already selected, deselect
    if (selectedAnswerId === aId) {
      deselectAll();
      return;
    }

    deselectAll();
    selectedAnswerId = aId;
    card.style.outline = '2px solid var(--accent-purple)';
    card.style.boxShadow = '0 0 15px rgba(108, 99, 255, 0.4)';
    SoundManager.click();

    // Highlight available slots
    document.querySelectorAll('.player-slot-drop:not(.self-slot):not(.filled)').forEach(slot => {
      slot.style.borderColor = 'var(--accent-purple)';
      slot.style.background = 'rgba(108, 99, 255, 0.08)';
    });
  }

  function deselectAll() {
    selectedAnswerId = null;
    document.querySelectorAll('.answer-card').forEach(c => {
      c.style.outline = '';
      c.style.boxShadow = '';
    });
    document.querySelectorAll('.player-slot-drop').forEach(s => {
      if (!s.classList.contains('filled') && !s.classList.contains('drag-over')) {
        s.style.borderColor = '';
        s.style.background = '';
      }
    });
  }

  function onSlotClick(playerId) {
    if (selectedAnswerId) {
      assignAnswer(selectedAnswerId, playerId);
      deselectAll();
    } else {
      // Auto-assign if only one unassigned answer remains
      const unassigned = Object.keys(roundData.answers).filter(aId => !assignments[aId]);
      if (unassigned.length === 1) {
        assignAnswer(unassigned[0], playerId);
      }
    }
  }

  function assignAnswer(answerId, playerId) {
    // Remove previous assignment for this player
    Object.entries(assignments).forEach(([aId, pId]) => {
      if (pId === playerId) delete assignments[aId];
    });

    // Remove previous assignment for this answer
    delete assignments[answerId];

    assignments[answerId] = playerId;
    SoundManager.click();
    App.renderScreen(render());
  }

  function removeAssignment(answerId) {
    delete assignments[answerId];
    SoundManager.click();
    App.renderScreen(render());
  }

  function forceSubmit() {
    stopTimer();
    Socket.emit('submit-guesses', { matches: assignments });
    App.renderScreen(`
      <div class="screen">
        <div class="screen-content" style="justify-content: center; min-height: 80vh">
          <span style="font-size: 4rem">⏰</span>
          <h1 class="title">!נגמר הזמן</h1>
          <p class="subtitle">ממתינים לתוצאות...</p>
        </div>
      </div>
    `);
  }

  function submit() {
    const myId = Socket.getId();
    const totalMatchable = roundData.playerNames.filter(p => p.id !== myId).length;
    if (Object.keys(assignments).length < totalMatchable) return;

    stopTimer();
    SoundManager.click();
    Socket.emit('submit-guesses', { matches: assignments });

    App.renderScreen(`
      <div class="screen">
        <div class="screen-content" style="justify-content: center; min-height: 80vh">
          <span style="font-size: 4rem" class="animate-bounce">⏳</span>
          <h1 class="title">נשלח!</h1>
          <p class="subtitle">ממתינים לשאר השחקנים...</p>
          <div id="guess-progress-display" class="guess-progress"></div>
        </div>
      </div>
    `);
  }

  function updateGuessProgress(data) {
    const el = document.getElementById('guess-progress-display');
    if (el) {
      el.textContent = `${data.submitted} מתוך ${data.total} שלחו`;
    }
  }

  function destroy() {
    stopTimer();
  }

  return {
    init, render, submit, forceSubmit, destroy,
    onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
    onTouchStart, onSlotClick,
    removeAssignment, assignAnswer,
    updateGuessProgress, deselectAll
  };
})();
