const QuestionSetupScreen = (() => {
  let questionBank = [];
  let selectedIds = new Set();
  let customQuestions = [];
  let timerEnabled = false;
  let timerDuration = 60000;

  async function init() {
    try {
      const resp = await fetch('/api/questions');
      questionBank = await resp.json();
      selectedIds = new Set(questionBank.map(q => q.id));
    } catch (e) {
      console.error('Failed to load questions:', e);
    }
  }

  function render() {
    const questionItems = questionBank.map(q => {
      const isSelected = selectedIds.has(q.id);
      return `
        <div class="question-item ${isSelected ? 'selected' : ''}" data-qid="${q.id}" onclick="QuestionSetupScreen.toggleQuestion('${q.id}')">
          <div class="question-checkbox"></div>
          <span class="question-text">${q.text}</span>
          ${q.supportsImage ? '<span class="question-badge">📷 תמונה</span>' : ''}
        </div>
      `;
    }).join('');

    const customItems = customQuestions.map((q, i) => `
      <div class="question-item selected" data-custom="${i}">
        <div class="question-checkbox"></div>
        <span class="question-text">${q.text}</span>
        ${q.supportsImage ? '<span class="question-badge">📷 תמונה</span>' : ''}
        <span style="cursor:pointer; color: var(--accent-pink); padding: 4px" onclick="QuestionSetupScreen.removeCustom(${i})">✕</span>
      </div>
    `).join('');

    const totalSelected = selectedIds.size + customQuestions.length;

    const timerOptions = [
      { label: '30 שניות', value: 30000 },
      { label: '60 שניות', value: 60000 },
      { label: '90 שניות', value: 90000 },
    ];

    return `
      <div class="screen" id="question-setup-screen">
        <div class="screen-content">
          <h1 class="title">📝 בחירת שאלות</h1>
          <p class="subtitle">בחרו אילו שאלות יהיו במשחק</p>

          <div class="question-list stagger-children">
            ${questionItems}
            ${customItems}
          </div>

          <div class="glass-card glass-card-sm">
            <p class="label" style="margin-bottom: 8px">הוספת שאלה מותאמת אישית</p>
            <div class="custom-question-input">
              <input class="input" id="custom-q-input" type="text" placeholder="כתבו שאלה חדשה...">
              <button class="btn btn-primary" onclick="QuestionSetupScreen.addCustom()" style="flex-shrink:0">+</button>
            </div>
            <label style="display:flex; align-items:center; gap:8px; margin-top:8px; cursor:pointer; font-size:0.85rem; color: var(--text-secondary)">
              <input type="checkbox" id="custom-q-image"> אפשר העלאת תמונה
            </label>
          </div>

          <div class="divider"></div>

          <div class="timer-settings">
            <label class="timer-toggle">
              <input type="checkbox" ${timerEnabled ? 'checked' : ''} onchange="QuestionSetupScreen.toggleTimer(this.checked)">
              <span class="timer-slider"></span>
            </label>
            <div style="flex:1">
              <p style="font-weight:500; font-size:0.95rem">⏱️ טיימר לסיבובי ניחוש</p>
              <div class="timer-options" id="timer-options" style="${timerEnabled ? '' : 'opacity:0.4; pointer-events:none'}">
                ${timerOptions.map(o => `
                  <button class="timer-option ${timerDuration === o.value ? 'active' : ''}"
                    onclick="QuestionSetupScreen.setTimer(${o.value})">${o.label}</button>
                `).join('')}
              </div>
            </div>
          </div>

          <button class="btn btn-success btn-lg btn-full" onclick="QuestionSetupScreen.confirm()" ${totalSelected < 3 ? 'disabled' : ''}>
            🚀 התחלת שאלות (${totalSelected} שאלות)
          </button>
          <button class="btn btn-ghost btn-full" onclick="App.backToWaiting()">
            ← חזרה ללובי
          </button>
        </div>
      </div>
    `;
  }

  function toggleQuestion(id) {
    SoundManager.click();
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    App.renderScreen(render());
  }

  function addCustom() {
    const input = document.getElementById('custom-q-input');
    const imageCheck = document.getElementById('custom-q-image');
    const text = input?.value.trim();
    if (!text) return;

    SoundManager.click();
    customQuestions.push({
      id: `custom_${Date.now()}`,
      text,
      supportsImage: imageCheck?.checked || false
    });
    App.renderScreen(render());
  }

  function removeCustom(index) {
    SoundManager.click();
    customQuestions.splice(index, 1);
    App.renderScreen(render());
  }

  function toggleTimer(checked) {
    timerEnabled = checked;
    const opts = document.getElementById('timer-options');
    if (opts) {
      opts.style.opacity = checked ? '1' : '0.4';
      opts.style.pointerEvents = checked ? '' : 'none';
    }
  }

  function setTimer(value) {
    SoundManager.click();
    timerDuration = value;
    document.querySelectorAll('.timer-option').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.onclick.toString().match(/\d+/)?.[0]) === value);
    });
    App.renderScreen(render());
  }

  function confirm() {
    const selectedQuestions = [
      ...questionBank.filter(q => selectedIds.has(q.id)),
      ...customQuestions
    ];

    if (selectedQuestions.length < 3) return;

    Socket.emit('setup-questions', {
      questions: selectedQuestions,
      timerEnabled,
      timerDuration
    }, (res) => {
      if (res?.error) {
        alert(res.error);
      }
    });
  }

  return { init, render, toggleQuestion, addCustom, removeCustom, toggleTimer, setTimer, confirm };
})();
