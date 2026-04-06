const SoundManager = (() => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let enabled = true;

  function playTone(freq, duration, type = 'sine', volume = 0.15) {
    if (!enabled) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* ignore audio errors */ }
  }

  function playSequence(notes, interval = 150) {
    notes.forEach(([freq, dur, type], i) => {
      setTimeout(() => playTone(freq, dur, type), i * interval);
    });
  }

  return {
    enable() { enabled = true; },
    disable() { enabled = false; },
    toggle() { enabled = !enabled; return enabled; },

    join() {
      playSequence([[523, 0.15, 'sine'], [659, 0.15, 'sine'], [784, 0.2, 'sine']], 100);
    },

    correct() {
      playSequence([[523, 0.1, 'sine'], [659, 0.1, 'sine'], [784, 0.2, 'sine']], 80);
    },

    wrong() {
      playSequence([[300, 0.15, 'square'], [250, 0.2, 'square']], 120);
    },

    tick() {
      playTone(800, 0.05, 'sine', 0.1);
    },

    countdown() {
      playTone(440, 0.1, 'square', 0.12);
    },

    victory() {
      playSequence([
        [523, 0.15, 'sine'], [587, 0.15, 'sine'],
        [659, 0.15, 'sine'], [784, 0.15, 'sine'],
        [1047, 0.4, 'sine']
      ], 120);
    },

    reveal() {
      playTone(600, 0.3, 'triangle', 0.1);
    },

    click() {
      playTone(1000, 0.03, 'sine', 0.08);
    },

    resume() {
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
  };
})();
