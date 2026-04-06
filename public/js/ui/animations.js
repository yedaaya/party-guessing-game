const Animations = (() => {
  const CONFETTI_COLORS = [
    '#6c63ff', '#ff6584', '#43e97b', '#f7971e', '#00c9ff',
    '#ffd700', '#ff3cac', '#38f9d7', '#a18cd1', '#fbc2eb'
  ];

  function launchConfetti(duration = 3000) {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    const count = 80;
    const pieces = [];

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const size = 6 + Math.random() * 8;
      const left = Math.random() * 100;
      const animDuration = 2 + Math.random() * 2;
      const delay = Math.random() * (duration / 1000);
      const shape = Math.random() > 0.5 ? '50%' : '0';

      piece.style.cssText = `
        left: ${left}%;
        width: ${size}px;
        height: ${size * 0.6}px;
        background: ${color};
        border-radius: ${shape};
        animation-duration: ${animDuration}s;
        animation-delay: ${delay}s;
      `;
      container.appendChild(piece);
      pieces.push(piece);
    }

    setTimeout(() => {
      pieces.forEach(p => p.remove());
    }, duration + 4000);
  }

  function animateScore(element, from, to, duration = 800) {
    const start = performance.now();
    const diff = to - from;

    function step(timestamp) {
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(from + diff * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function staggerReveal(container, delayBetween = 150) {
    const children = container.children;
    Array.from(children).forEach((child, i) => {
      child.style.animationDelay = `${i * delayBetween}ms`;
    });
  }

  return { launchConfetti, animateScore, staggerReveal };
})();
