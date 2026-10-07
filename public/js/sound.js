// Jednoduché zvukové efekty cez WebAudio (bez zvukových súborov).
window.Sound = (() => {
  'use strict';

  let ac = null;
  let muted = false;
  let quiet = false; // ukážka na úvodnej obrazovke je potichu

  function ensure() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
    if (muted || quiet || !ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const melody = (notes, step, opts) => notes.forEach((f, i) => tone(f, step * 1.6, { ...opts, delay: i * step }));

  return {
    ensure,
    toggle() {
      muted = !muted;
      return muted;
    },
    setQuiet(v) {
      quiet = v;
    },
    get muted() {
      return muted;
    },
    pickup(n) {
      tone(440 + Math.min(n, 20) * 30, 0.09, { type: 'triangle', vol: 0.09 });
    },
    golden() {
      melody([784, 988, 1175, 1568], 0.06, { type: 'triangle', vol: 0.07 });
    },
    deliver(n) {
      const notes = n >= 10 ? [523, 659, 784, 1046, 1318, 1568] : n >= 5 ? [523, 659, 784, 1046] : [523, 784];
      melody(notes, 0.07, { type: 'triangle', vol: 0.08 });
    },
    hurt() {
      tone(220, 0.35, { type: 'sawtooth', vol: 0.06, slide: 70 });
    },
    steal() {
      tone(500, 0.3, { type: 'square', vol: 0.05, slide: 150 });
    },
    howl() {
      tone(330, 0.25, { type: 'sine', vol: 0.06, slide: 660 });
      tone(660, 0.6, { type: 'sine', vol: 0.05, slide: 520, delay: 0.25 });
    },
    bonk() {
      tone(160, 0.12, { type: 'square', vol: 0.08, slide: 90 });
      tone(900, 0.08, { type: 'triangle', vol: 0.05, delay: 0.05 });
    },
    power() {
      melody([660, 880, 1320], 0.06, { type: 'square', vol: 0.05 });
    },
    whistle() {
      tone(1400, 0.18, { type: 'sine', vol: 0.06, slide: 1900 });
      tone(1900, 0.25, { type: 'sine', vol: 0.06, slide: 1500, delay: 0.2 });
    },
    tick() {
      tone(1000, 0.05, { type: 'square', vol: 0.04 });
    },
    count() {
      tone(600, 0.15, { type: 'square', vol: 0.06 });
    },
    go() {
      tone(1200, 0.35, { type: 'square', vol: 0.06 });
    },
    end() {
      melody([784, 659, 523, 392], 0.12, { type: 'triangle', vol: 0.08 });
    },
    click() {
      tone(800, 0.04, { type: 'square', vol: 0.03 });
    },
  };
})();
