const QuestionsScreen = (() => {
  let questions = [];
  let currentIndex = 0;
  let answers = {};

  function init(questionList) {
    questions = questionList;
    currentIndex = 0;
    answers = {};
  }

  function render() {
    if (currentIndex >= questions.length) {
      return renderDone();
    }

    const q = questions[currentIndex];
    const existingAnswer = answers[q.id] || {};

    return `
      <div class="screen" id="questions-screen">
        <div class="screen-content">
          <div class="progress-text">שאלה ${currentIndex + 1} מתוך ${questions.length}</div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${((currentIndex) / questions.length) * 100}%"></div>
          </div>

          <div class="glass-card" style="text-align: center">
            <div class="question-display">${q.text}</div>
          </div>

          <div class="answer-area">
            <textarea class="input" id="answer-text" rows="3"
              placeholder="התשובה שלך...">${existingAnswer.text || ''}</textarea>

            ${q.supportsImage ? `
              <div class="image-upload-area ${existingAnswer.image ? 'has-image' : ''}"
                onclick="document.getElementById('image-input').click()" id="image-area">
                ${existingAnswer.image
                  ? `<img src="${existingAnswer.image}" alt="uploaded">`
                  : `<span class="image-upload-icon">📷</span>
                     <span>לחצו להעלאת תמונה</span>`
                }
              </div>
              <input type="file" id="image-input" accept="image/*" style="display:none"
                onchange="QuestionsScreen.handleImage(this)">
            ` : ''}
          </div>

          <div style="display: flex; gap: 10px; width: 100%">
            ${currentIndex > 0 ? `
              <button class="btn btn-ghost" onclick="QuestionsScreen.prev()" style="flex:1">
                → הקודם
              </button>
            ` : ''}
            <button class="btn btn-primary" onclick="QuestionsScreen.next()" style="flex:2">
              ${currentIndex < questions.length - 1 ? 'הבא ←' : 'סיום ✓'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDone() {
    return `
      <div class="screen" id="questions-done-screen">
        <div class="screen-content" style="justify-content: center; min-height: 80vh">
          <span style="font-size: 4rem">✅</span>
          <h1 class="title">סיימתם!</h1>
          <p class="subtitle">ממתינים לשאר השחקנים...</p>
          <div class="status-badge waiting">
            <span class="waiting-dots"><span></span><span></span><span></span></span>
          </div>
          <div id="player-progress"></div>
        </div>
      </div>
    `;
  }

  function next() {
    const textEl = document.getElementById('answer-text');
    const text = textEl?.value.trim() || '';
    const q = questions[currentIndex];

    if (!text && !answers[q.id]?.image) {
      textEl?.focus();
      textEl?.classList.add('input-error');
      setTimeout(() => textEl?.classList.remove('input-error'), 600);
      return;
    }

    answers[q.id] = { ...answers[q.id], text };
    Socket.emit('submit-answer', {
      questionId: q.id,
      text: answers[q.id].text,
      image: answers[q.id].image || null
    });

    SoundManager.click();
    currentIndex++;
    App.renderScreen(render());
  }

  function prev() {
    const textEl = document.getElementById('answer-text');
    const q = questions[currentIndex];
    if (textEl) answers[q.id] = { ...answers[q.id], text: textEl.value.trim() };

    SoundManager.click();
    currentIndex--;
    App.renderScreen(render());
  }

  function handleImage(input) {
    const file = input.files?.[0];
    if (!file) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const maxSize = 800;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      const q = questions[currentIndex];
      answers[q.id] = { ...answers[q.id], image: dataUrl };

      const area = document.getElementById('image-area');
      if (area) {
        area.classList.add('has-image');
        area.innerHTML = `<img src="${dataUrl}" alt="uploaded">`;
      }
    };

    img.src = URL.createObjectURL(file);
  }

  function updateProgress(progress) {
    const el = document.getElementById('player-progress');
    if (!el) return;

    const items = Object.entries(progress).map(([pid, p]) => {
      const done = p.answered >= p.total;
      return `<span class="status-badge ${done ? 'done' : 'waiting'}" style="margin: 4px">
        ${done ? '✓' : `${p.answered}/${p.total}`}
      </span>`;
    }).join('');

    el.innerHTML = items;
  }

  function skipAnswered(answeredIds) {
    const answeredSet = new Set(answeredIds);
    // Find the first unanswered question
    let firstUnanswered = questions.length;
    for (let i = 0; i < questions.length; i++) {
      if (!answeredSet.has(questions[i].id)) {
        firstUnanswered = i;
        break;
      }
    }
    currentIndex = firstUnanswered;
  }

  return { init, render, next, prev, handleImage, updateProgress, skipAnswered };
})();
