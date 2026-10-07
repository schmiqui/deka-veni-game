// Dobrý pastier – hra DeKa tímu na Veni Sancte.
// Cieľ: pochopiteľné bez vysvetľovania. Zbieraj ovečky → doveď do ohrady → viac naraz = viac bodov.
(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;

  // ---------- Rozmery (logické súradnice, plátno sa škáluje na obrazovku) ----------
  const W = 1600;
  const H = 900;
  const FW = 1200; // šírka herného poľa, vpravo je rebríček
  const HUD_H = 78;
  const PLAY = { x0: 30, y0: HUD_H + 26, x1: FW - 30, y1: H - 30 };
  const PEN = { w: 210, h: 150 };
  PEN.x = (PLAY.x0 + PLAY.x1) / 2 - PEN.w / 2;
  PEN.y = (PLAY.y0 + PLAY.y1) / 2 - PEN.h / 2;
  const PEN_CENTER = { x: PEN.x + PEN.w / 2, y: PEN.y + PEN.h / 2 };

  const TAU = Math.PI * 2;
  const FONT = '"Avenir Next", "Avenir", "Helvetica Neue", "Segoe UI", system-ui, sans-serif';

  // Farby – jedna paleta pre celú hru.
  const C = {
    ink: '#0E1B2A',
    panel: '#14263A',
    panel2: '#1D3550',
    line: 'rgba(255,255,255,0.09)',
    text: '#F4F1EA',
    muted: '#8FA3B8',
    accent: '#F2B441',
    accentInk: '#2A1E05',
    danger: '#E8664A',
    good: '#8CCB7E',
    grassA: '#7DB36A',
    grassB: '#76AB63',
  };
  const SPACING = 30; // rozostup oviec v rade
  const SHEPHERD_SPEED = 290;
  const SHEEP_VALUE = 10;
  const GOLDEN_VALUE = 50;
  const WOLF_BONUS = 25;
  const AUTO_START = 5; // ak sa hráč nepohne, hra sa rozbehne sama
  const OVER_TIME = 2.2;
  const NAME_TIMEOUT = 30;
  const RESULTS_TIMEOUT = 20;
  const RESULT_ROWS = 11;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const inRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

  function ovce(n) {
    if (n === 1) return 'ovečka';
    if (n >= 2 && n <= 4) return 'ovečky';
    return 'oviec';
  }

  // ---------- Plátno ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const nameInput = document.getElementById('nameInput');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  // QR kódy (prihláška, Instagram…). Zobrazia sa len tie, ktorých obrázok sa načítal.
  const qrCodes = (CFG.qrCodes || []).map((q) => {
    const code = { ...q, img: new Image(), ready: false };
    code.img.onload = () => {
      code.ready = true;
      // stránka s QR kódmi sa doplní, aj keď sa obrázok načítal neskôr
      if (attract.panels.length && !attract.panels.some((p) => p.type === 'deka')) attract.panels.push({ type: 'deka', dur: 8 });
    };
    code.img.src = q.image;
    return code;
  });
  const readyQrs = () => qrCodes.filter((q) => q.ready);

  // ---------- Vstup ----------
  const held = new Set();
  const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const START_KEYS = new Set([...MOVE_KEYS, 'Enter', 'NumpadEnter', 'Space']);
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  addEventListener('keydown', (e) => {
    if (SCROLL_KEYS.has(e.code) && state !== 'name') e.preventDefault();
    held.add(e.code);
    Sound.ensure();
    onKeyDown(e);
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('pointerdown', () => {
    if (state === 'name') nameInput.focus();
  });
  addEventListener('contextmenu', (e) => e.preventDefault());

  function axis() {
    let x = 0;
    let y = 0;
    if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
    if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
    if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
    if (held.has('ArrowDown') || held.has('KeyS')) y += 1;
    return { x, y };
  }

  function enterFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else enterFullscreen();
  }

  // ---------- Stav aplikácie ----------
  // attract (ukážka) → play → over → name (s rebríčkom) → results (celé poradie) → attract
  let state = 'attract';
  let stateT = 0;
  let idleT = 0;
  let now = 0;
  let g = null; // aktuálny svet
  let attract = { panels: [], idx: 0, t: 0 };
  let result = null;
  let resultsTop = 0;
  let nameError = '';

  function setState(s) {
    state = s;
    stateT = 0;
    idleT = 0;
    Sound.setQuiet(s === 'attract');
  }

  function onKeyDown(e) {
    const k = e.code;
    idleT = 0;
    switch (state) {
      case 'attract':
        if (k === 'KeyF') return toggleFullscreen();
        if (k === 'KeyM') return Sound.toggle();
        if (START_KEYS.has(k) && stateT > 0.6) {
          // Prehliadač dovolí celú obrazovku len po stlačení klávesu, preto až tu.
          enterFullscreen();
          startGame();
        }
        break;
      case 'play':
        if (k === 'KeyM') Sound.toggle();
        break;
      case 'name':
        if (k === 'Enter' || k === 'NumpadEnter') submitName();
        else if (k === 'Escape') {
          nameInput.blur();
          enterAttract();
        }
        break;
      case 'results': {
        const n = Storage.board().length;
        if (k === 'ArrowUp' || k === 'KeyW') resultsTop = clamp(resultsTop - 1, 0, Math.max(0, n - RESULT_ROWS));
        else if (k === 'ArrowDown' || k === 'KeyS') resultsTop = clamp(resultsTop + 1, 0, Math.max(0, n - RESULT_ROWS));
        else if ((k === 'Enter' || k === 'NumpadEnter' || k === 'Space' || k === 'Escape') && stateT > 1) enterAttract();
        break;
      }
    }
  }

  nameInput.addEventListener('input', () => {
    idleT = 0;
    nameError = '';
    const clean = nameInput.value
      .replace(/[^\p{L}\p{N} _.\-!]/gu, '')
      .replace(/^\s+/, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, CFG.maxNameLength);
    if (clean !== nameInput.value) nameInput.value = clean;
    Sound.click();
  });

  // ---------- Svet ----------
  function newWorld(demo = false) {
    g = {
      demo,
      started: false,
      t: 0,
      timeLeft: CFG.roundSeconds,
      lastSec: CFG.roundSeconds,
      score: 0,
      delivered: 0,
      bestCombo: 0,
      sh: { x: PEN_CENTER.x, y: PEN.y + PEN.h + 80, face: 1, walk: 0, moving: false },
      trail: [],
      chain: [],
      sheep: [],
      wolves: [],
      particles: [],
      floaters: [],
      penSheep: [],
      spawnT: 0,
      wolfT: 2,
      goldT: rand(12, 16),
      banner: null,
    };
    g.trail.push({ x: g.sh.x, y: g.sh.y });
    for (let i = 0; i < 9; i++) spawnSheep(false, true);
  }

  function freeSpot(margin = 40, awayFromShepherd = 220) {
    for (let i = 0; i < 200; i++) {
      const p = { x: rand(PLAY.x0 + margin, PLAY.x1 - margin), y: rand(PLAY.y0 + margin, PLAY.y1 - margin) };
      if (inRect(p.x, p.y, PEN, 50)) continue;
      if (dist(p, g.sh) < awayFromShepherd) continue;
      return p;
    }
    return { x: PLAY.x0 + 60, y: PLAY.y0 + 60 };
  }

  function spawnSheep(golden, initial = false) {
    const p = freeSpot(40, initial ? 150 : 220);
    const s = {
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      state: 'wander',
      golden,
      life: golden ? 13 : Infinity,
      face: Math.random() < 0.5 ? -1 : 1,
      walk: rand(0, TAU),
      turnT: rand(0, 2),
      age: initial ? rand(0.3, 1) : 0,
    };
    g.sheep.push(s);
    if (golden) {
      addFloater(s.x, s.y - 40, 'Zlatá ovečka', C.accent, 26, 2);
      Sound.golden();
    }
    return s;
  }

  function addPenSheep(golden) {
    g.penSheep.push({
      x: rand(PEN.x + 26, PEN.x + PEN.w - 26),
      y: rand(PEN.y + 34, PEN.y + PEN.h - 18),
      face: Math.random() < 0.5 ? -1 : 1,
      golden,
      phase: rand(0, TAU),
    });
    if (g.penSheep.length > 28) g.penSheep.shift();
  }

  function spawnWolf() {
    const side = randInt(0, 3);
    let x;
    let y;
    if (side === 0) [x, y] = [-40, rand(PLAY.y0, PLAY.y1)];
    else if (side === 1) [x, y] = [FW + 40, rand(PLAY.y0, PLAY.y1)];
    else if (side === 2) [x, y] = [rand(PLAY.x0, PLAY.x1), HUD_H - 20];
    else [x, y] = [rand(PLAY.x0, PLAY.x1), H + 40];
    g.wolves.push({
      x,
      y,
      state: 'hunt',
      face: 1,
      walk: 0,
      age: 0,
      carry: null,
      bonked: false,
      speed: Math.min(230, 145 + g.t * 1.4),
    });
    Sound.howl();
  }

  // ---------- Efekty ----------
  function addFloater(x, y, text, color, size = 26, life = 1.4) {
    g.floaters.push({ x, y, text, color, size, life, max: life });
  }

  function burst(x, y, colors, n = 14, speed = 160, size = 4, life = 0.8, gravity = 0) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(speed * 0.3, speed);
      g.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.6, life),
        max: life,
        size: rand(size * 0.6, size),
        color: pick(colors),
        gravity,
        square: gravity > 0,
      });
    }
  }

  function banner(text, color = '#fff', life = 1.8) {
    g.banner = { text, color, life, max: life };
  }

  // ---------- Herná logika ----------
  function trailPoint(d) {
    let px = g.sh.x;
    let py = g.sh.y;
    for (let i = g.trail.length - 1; i >= 0; i--) {
      const q = g.trail[i];
      const seg = Math.hypot(px - q.x, py - q.y);
      if (seg >= d && seg > 0) {
        const k = d / seg;
        return { x: px + (q.x - px) * k, y: py + (q.y - py) * k };
      }
      d -= seg;
      px = q.x;
      py = q.y;
    }
    return { x: px, y: py };
  }

  function trimTrail() {
    const allowed = (g.chain.length + 4) * SPACING;
    let total = 0;
    let px = g.sh.x;
    let py = g.sh.y;
    for (let i = g.trail.length - 1; i >= 0; i--) {
      total += Math.hypot(px - g.trail[i].x, py - g.trail[i].y);
      if (total > allowed) {
        g.trail.splice(0, i);
        return;
      }
      px = g.trail[i].x;
      py = g.trail[i].y;
    }
  }

  function joinChain(s) {
    s.state = 'chain';
    s.life = Infinity;
    g.chain.push(s);
    Sound.pickup(g.chain.length);
    burst(s.x, s.y, s.golden ? [C.accent, '#FBE3A8'] : ['#ffffff', '#e8f5e9'], 8, 90, 3, 0.5);
    if (s.golden) addFloater(s.x, s.y - 30, `zlatá, ${GOLDEN_VALUE} bodov`, C.accent, 26);
  }

  function chainValue() {
    let base = 0;
    for (const s of g.chain) base += s.golden ? GOLDEN_VALUE : SHEEP_VALUE;
    return base * g.chain.length;
  }

  function deliver() {
    const n = g.chain.length;
    const pts = chainValue();
    g.score += pts;
    g.delivered += n;
    g.bestCombo = Math.max(g.bestCombo, n);
    for (const s of g.chain) {
      s.state = 'toPen';
      s.tx = rand(PEN.x + 26, PEN.x + PEN.w - 26);
      s.ty = rand(PEN.y + 34, PEN.y + PEN.h - 18);
    }
    g.chain = [];
    g.trail = [{ x: g.sh.x, y: g.sh.y }];
    Sound.deliver(n);

    addFloater(PEN_CENTER.x, PEN.y - 40, `+${pts}`, C.accent, 46, 1.8);
    if (n > 1) addFloater(PEN_CENTER.x, PEN.y - 4, `${n} naraz, krát ${n}`, '#ffffff', 22, 1.8);
    else if (!g.demo) addFloater(PEN_CENTER.x, PEN.y - 4, 'Skús ich priviesť viac naraz', '#ffffff', 22, 2);
    const praise = n >= 15 ? 'Dobrý pastier' : n >= 10 ? 'Pekné stádo' : n >= 6 ? 'Výborne' : null;
    if (praise && !g.demo) banner(praise, C.accent);
    burst(PEN_CENTER.x, PEN_CENTER.y, [C.accent, '#ffffff', '#F7D58B'], Math.min(40, 10 + n * 3), 280, 6, 1.2, 260);
  }

  function pushOutOfPen(o, pad) {
    if (!inRect(o.x, o.y, PEN, pad)) return false;
    const left = o.x - (PEN.x - pad);
    const right = PEN.x + PEN.w + pad - o.x;
    const top = o.y - (PEN.y - pad);
    const bottom = PEN.y + PEN.h + pad - o.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) o.x = PEN.x - pad;
    else if (m === right) o.x = PEN.x + PEN.w + pad;
    else if (m === top) o.y = PEN.y - pad;
    else o.y = PEN.y + PEN.h + pad;
    return true;
  }

  function nearestOf(o, list) {
    let best = null;
    let bd = Infinity;
    for (const s of list) {
      const d = dist(o, s);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // Vlk zoberie ovečku. Ak bola v rade, ovečky za ňou sa rozutekajú.
  function steal(w, sheep) {
    const ci = g.chain.indexOf(sheep);
    let scattered = 0;
    if (ci >= 0) {
      const rest = g.chain.slice(ci + 1);
      g.chain = g.chain.slice(0, ci);
      for (const s of rest) {
        const a = Math.atan2(s.y - w.y, s.x - w.x) + rand(-0.7, 0.7);
        const sp = rand(150, 210);
        s.state = 'wander';
        s.vx = Math.cos(a) * sp;
        s.vy = Math.sin(a) * sp;
        s.turnT = rand(0.7, 1.1);
        s.noPick = 0.8;
      }
      scattered = rest.length;
      trimTrail();
    }
    sheep.state = 'carried';
    w.carry = sheep;
    w.state = 'flee';
    Sound.steal();
    addFloater(w.x, w.y - 40, 'Vlk ti zobral ovečku, dobehni ho', C.danger, 24, 1.8);
    if (scattered) addFloater(w.x, w.y - 12, 'Ostatné sa rozutekali', C.danger, 20, 1.8);
  }

  function nearestWanderSheep(o) {
    let best = null;
    let bd = Infinity;
    for (const s of g.sheep) {
      if (s.state !== 'wander' || s.age < 0.5) continue;
      const d = dist(o, s);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // Autopilot pre ukážku na úvodnej obrazovke – ukazuje, ako sa hrá.
  function demoInput() {
    const target = g.chain.length >= 4 ? PEN_CENTER : nearestWanderSheep(g.sh);
    if (!target) return { x: 0, y: 0 };
    const dx = target.x - g.sh.x;
    const dy = target.y - g.sh.y;
    const d = Math.hypot(dx, dy);
    return d < 4 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
  }

  function updateShepherd(dt, input, speedMul = 1) {
    const sh = g.sh;
    const len = Math.hypot(input.x, input.y);
    sh.moving = len > 0;
    if (len) {
      const sp = SHEPHERD_SPEED * speedMul;
      sh.x = clamp(sh.x + (input.x / len) * sp * dt, PLAY.x0, PLAY.x1);
      sh.y = clamp(sh.y + (input.y / len) * sp * dt, PLAY.y0, PLAY.y1);
      if (Math.abs(input.x) > 0.2) sh.face = input.x > 0 ? 1 : -1;
      sh.walk += dt * 14;
    }

    const last = g.trail[g.trail.length - 1];
    if (Math.hypot(sh.x - last.x, sh.y - last.y) >= 4) {
      g.trail.push({ x: sh.x, y: sh.y });
      trimTrail();
    }

    for (const s of g.sheep) {
      if (s.state === 'wander' && s.age > 0.3 && !(s.noPick > 0) && dist(s, sh) < 38) joinChain(s);
    }

    if (g.chain.length && inRect(sh.x, sh.y, PEN, -10)) deliver();
  }

  function updateSheep(dt) {
    g.chain.forEach((s, i) => {
      const t = trailPoint((i + 1) * SPACING);
      const k = Math.min(1, dt * 10);
      const dx = (t.x - s.x) * k;
      const dy = (t.y - s.y) * k;
      s.x += dx;
      s.y += dy;
      if (Math.abs(dx) > 0.3) s.face = dx > 0 ? 1 : -1;
      s.walk += Math.hypot(dx, dy) * 0.35;
      s.age += dt;
    });

    for (const s of g.sheep) {
      if (s.state === 'chain' || s.state === 'carried') continue;
      s.age += dt;

      if (s.state === 'toPen') {
        const dx = s.tx - s.x;
        const dy = s.ty - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) {
          addPenSheep(s.golden);
          s.state = 'gone';
        } else {
          const sp = Math.min(d, 280 * dt);
          s.x += (dx / d) * sp;
          s.y += (dy / d) * sp;
          s.face = dx > 0 ? 1 : -1;
          s.walk += sp * 0.35;
        }
        continue;
      }

      // voľne sa túlajúca ovečka
      if (s.noPick > 0) s.noPick -= dt;
      s.turnT -= dt;
      if (s.turnT <= 0) {
        s.turnT = rand(1, 3);
        if (Math.random() < 0.3) {
          s.vx = 0;
          s.vy = 0;
        } else {
          const a = rand(0, TAU);
          const sp = rand(25, 50);
          s.vx = Math.cos(a) * sp;
          s.vy = Math.sin(a) * sp;
        }
      }
      if (s.golden) {
        const d = dist(s, g.sh);
        if (d < 200 && d > 0) {
          s.vx = ((s.x - g.sh.x) / d) * 215;
          s.vy = ((s.y - g.sh.y) / d) * 215;
          s.turnT = 0.4;
        }
        s.life -= dt;
        if (Math.random() < 0.25) {
          g.particles.push({ x: s.x + rand(-16, 16), y: s.y + rand(-16, 8), vx: 0, vy: -20, life: 0.6, max: 0.6, size: rand(2, 4), color: '#FBE3A8', gravity: 0 });
        }
        if (s.life <= 0) {
          s.state = 'gone';
          burst(s.x, s.y, [C.accent, '#FBE3A8'], 16, 120, 4, 0.7);
          continue;
        }
      }
      const speed = Math.hypot(s.vx, s.vy);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < PLAY.x0 || s.x > PLAY.x1) {
        s.vx = -s.vx;
        s.x = clamp(s.x, PLAY.x0, PLAY.x1);
      }
      if (s.y < PLAY.y0 || s.y > PLAY.y1) {
        s.vy = -s.vy;
        s.y = clamp(s.y, PLAY.y0, PLAY.y1);
      }
      if (pushOutOfPen(s, 22)) {
        s.vx = -s.vx;
        s.vy = -s.vy;
      }
      if (Math.abs(s.vx) > 2) s.face = s.vx > 0 ? 1 : -1;
      s.walk += speed * dt * 0.2;
    }
    g.sheep = g.sheep.filter((s) => s.state !== 'gone');
  }

  function updateWolves(dt) {
    const sh = g.sh;
    for (const w of g.wolves) {
      w.age += dt;
      let vx = 0;
      let vy = 0;
      let speed = w.speed;

      if (w.state === 'hunt') {
        const target = g.chain.length ? nearestOf(w, g.chain) : nearestWanderSheep(w);
        if (target) {
          const d = Math.max(1, dist(w, target));
          vx = (target.x - w.x) / d;
          vy = (target.y - w.y) / d;
          // vlk chytí hocktorú ovečku z radu, ktorej sa dotkne
          const caught = g.chain.find((s) => dist(w, s) < 24) || (d < 24 ? target : null);
          if (caught) steal(w, caught);
        } else {
          const d = Math.max(1, Math.hypot(FW / 2 - w.x, H / 2 - w.y));
          vx = (FW / 2 - w.x) / d;
          vy = (H / 2 - w.y) / d;
          speed *= 0.5;
        }
      } else {
        // útek k najbližšiemu okraju a preč od pastiera
        const exits = [
          { x: -80, y: w.y },
          { x: FW + 80, y: w.y },
          { x: w.x, y: -80 },
          { x: w.x, y: H + 80 },
        ];
        let exit = exits[0];
        for (const e of exits) if (dist(w, e) < dist(w, exit)) exit = e;
        const de = Math.max(1, dist(w, exit));
        const ds = Math.max(1, dist(w, sh));
        vx = ((exit.x - w.x) / de) * 0.7 + ((w.x - sh.x) / ds) * 0.3;
        vy = ((exit.y - w.y) / de) * 0.7 + ((w.y - sh.y) / ds) * 0.3;
        const l = Math.max(0.01, Math.hypot(vx, vy));
        vx /= l;
        vy /= l;
        speed *= w.carry ? 0.75 : 1.25;
      }

      w.x += vx * speed * dt;
      w.y += vy * speed * dt;
      pushOutOfPen(w, 14);
      if (Math.abs(vx) > 0.05) w.face = vx > 0 ? 1 : -1;
      w.walk += speed * dt * 0.08;

      if (w.carry) {
        w.carry.x = w.x + w.face * 22;
        w.carry.y = w.y - 2;
        w.carry.face = w.face;
      }

      if (dist(w, sh) < 44) {
        if (w.state === 'hunt') {
          w.state = 'flee';
          w.bonked = true;
          g.score += WOLF_BONUS;
          Sound.bonk();
          burst(w.x, w.y, ['#ffffff', '#ced4da'], 12, 160, 4, 0.5);
          addFloater(w.x, w.y - 40, `+${WOLF_BONUS}`, C.good, 24);
        } else if (w.carry) {
          const s = w.carry;
          w.carry = null;
          s.state = 'wander';
          s.vx = 0;
          s.vy = 0;
          if (!w.bonked) g.score += WOLF_BONUS;
          w.bonked = true;
          Sound.bonk();
          addFloater(w.x, w.y - 40, 'Ovečka je späť', C.good, 24);
        }
      }
    }

    g.wolves = g.wolves.filter((w) => {
      const out = w.x < -70 || w.x > FW + 70 || w.y < -70 || w.y > H + 70;
      if (out && w.state === 'flee') {
        if (w.carry) w.carry.state = 'gone';
        return false;
      }
      return true;
    });
  }

  function updateSpawning(dt) {
    g.spawnT -= dt;
    const wander = g.sheep.filter((s) => s.state === 'wander' && !s.golden).length;
    const target = Math.min(14, 9 + Math.floor(g.t / 10));
    if (g.spawnT <= 0 && wander < target) {
      spawnSheep(false);
      g.spawnT = 0.6;
    }
    if (g.demo) return;

    g.goldT -= dt;
    if (g.goldT <= 0) {
      if (!g.sheep.some((s) => s.golden && s.state === 'wander')) spawnSheep(true);
      g.goldT = rand(13, 18);
    }

    // vlci prichádzajú až po pár sekundách, aby sa hráč najprv zorientoval
    g.wolfT -= dt;
    const hunting = g.wolves.filter((w) => w.state === 'hunt').length;
    const maxWolves = g.t < 12 ? 0 : Math.min(3, 1 + Math.floor((g.t - 12) / 18));
    if (g.wolfT <= 0 && hunting < maxWolves) {
      spawnWolf();
      g.wolfT = rand(3.5, 6);
    }
  }

  function updateEffects(dt) {
    for (const p of g.particles) {
      p.life -= dt;
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    for (const f of g.floaters) {
      f.life -= dt;
      f.y -= 38 * dt;
    }
    g.floaters = g.floaters.filter((f) => f.life > 0);
    if (g.banner) {
      g.banner.life -= dt;
      if (g.banner.life <= 0) g.banner = null;
    }
  }

  function updatePlay(dt) {
    const input = axis();
    if (!g.started) {
      // čas beží až od prvého pohybu (alebo po pár sekundách)
      if (input.x || input.y || stateT > AUTO_START) {
        g.started = true;
        Sound.go();
      } else {
        updateSheep(dt);
        updateEffects(dt);
        return;
      }
    }

    g.t += dt;
    g.timeLeft -= dt;
    updateShepherd(dt, input);
    updateSheep(dt);
    updateWolves(dt);
    updateSpawning(dt);
    updateEffects(dt);

    const sec = Math.ceil(g.timeLeft);
    if (sec !== g.lastSec) {
      g.lastSec = sec;
      if (sec === 10) banner('Ešte 10 sekúnd', C.danger, 1.6);
      if (sec <= 10 && sec > 0) Sound.tick();
    }
    if (g.timeLeft <= 0) endRound();
  }

  function updateDemo(dt) {
    updateShepherd(dt, demoInput(), 0.8);
    updateSheep(dt);
    updateSpawning(dt);
    updateEffects(dt);
  }

  // ---------- Prechody medzi obrazovkami ----------
  function enterAttract() {
    newWorld(true);
    attract = { panels: buildPanels(), idx: 0, t: 0 };
    result = null;
    setState('attract');
    Storage.sync().then(() => {
      if (state === 'attract' && attract.idx === 0) attract.panels = buildPanels();
    });
  }

  function startGame() {
    newWorld(false);
    setState('play');
    Sound.count();
  }

  function endRound() {
    g.timeLeft = 0;
    const lost = g.chain.length;
    if (lost) {
      addFloater(g.sh.x, g.sh.y - 60, `${lost} ${ovce(lost)} ostali vonku`, C.danger, 24, 2.4);
      for (const s of g.chain) s.state = 'wander';
      g.chain = [];
    }
    Sound.end();
    setState('over');
  }

  function enterName() {
    nameInput.value = '';
    nameError = '';
    setState('name');
    nameInput.focus();
  }

  function submitName() {
    const name = nameInput.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      nameError = 'Najprv napíš meno';
      return;
    }
    const key = Storage.keyOf(name);
    const prevBest = Storage.bestFor(key);
    const entry = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      score: g.score,
      delivered: g.delivered,
      bestCombo: g.bestCombo,
      date: new Date().toISOString(),
    };
    Storage.add(entry);
    const board = Storage.board();
    const idx = board.findIndex((r) => r.key === key);
    result = { entry, key, prevBest, newRecord: prevBest !== null && entry.score > prevBest };
    resultsTop = clamp(idx - Math.floor(RESULT_ROWS / 2), 0, Math.max(0, board.length - RESULT_ROWS));
    nameInput.blur();
    Sound.deliver(6);
    setState('results');
  }

  // Poradie, na ktorom by skóre skončilo.
  function projectedRank(score) {
    return Storage.board().filter((r) => r.score >= score).length + 1;
  }

  // ---------- Kreslenie: pomocné ----------
  function text(str, x, y, size, color, opts = {}) {
    const { align = 'left', weight = 700, baseline = 'middle', maxW = 0, shadow = false, spacing = 0 } = opts;
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (spacing) ctx.letterSpacing = `${spacing}px`;
    if (shadow) {
      ctx.shadowColor = 'rgba(8,16,26,0.55)';
      ctx.shadowBlur = Math.max(4, size * 0.25);
      ctx.shadowOffsetY = Math.max(1, size * 0.05);
    }
    ctx.fillStyle = color;
    if (maxW) ctx.fillText(str, x, y, maxW);
    else ctx.fillText(str, x, y);
    ctx.restore();
  }

  // Malý popis veľkými písmenami (BODY, MIESTO…).
  function label(str, x, y, color = C.muted, align = 'left', size = 13) {
    text(str.toUpperCase(), x, y, size, color, { align, weight: 700, spacing: 1.6 });
  }

  function measure(str, size, weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(str).width;
  }

  function fitText(str, maxW, size, weight = 700) {
    if (measure(str, size, weight) <= maxW) return str;
    let s = str;
    while (s.length > 1 && measure(s + '…', size, weight) > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function wrap(str, maxW, size, weight = 700) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measure(test, size, weight) > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function rrect(x, y, w, h, r, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function ellipse(x, y, rx, ry, fill) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function circle(x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function hline(x, y, w, color = C.line) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
  }

  function panel(x, y, w, h) {
    rrect(x, y, w, h, 14, C.panel, C.line, 1);
  }

  function dim(alpha, y0 = 0) {
    ctx.fillStyle = `rgba(10,20,32,${alpha})`;
    ctx.fillRect(0, y0, FW, H - y0);
  }

  // Obrázok QR kódu má vlastný biely okraj, preto ho kreslíme cez celý štvorec.
  function drawQr(img, x, y, size) {
    rrect(x, y, size, size, 8, '#ffffff');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 8);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  }

  // Šípka – hlavný spôsob, ako hra ukazuje, čo robiť.
  function arrowTo(fromX, fromY, toX, toY, color, radius = 60) {
    const a = Math.atan2(toY - fromY, toX - fromX);
    const off = radius + Math.sin(now * 6) * 4;
    ctx.save();
    ctx.translate(fromX + Math.cos(a) * off, fromY + Math.sin(a) * off);
    ctx.rotate(a);
    ctx.shadowColor = 'rgba(8,16,26,0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-9, -13);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-9, 13);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function downArrow(x, y, color) {
    ctx.save();
    ctx.translate(x, y + Math.sin(now * 6) * 4);
    ctx.shadowColor = 'rgba(8,16,26,0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-12, -6);
    ctx.lineTo(0, -1);
    ctx.lineTo(12, -6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function keycap(x, y, size, pressed, angle) {
    rrect(x - size / 2, y - size / 2, size, size, 8, pressed ? C.accent : 'rgba(14,27,42,0.85)', pressed ? C.accent : 'rgba(255,255,255,0.35)', 1.5);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size * 0.16, 0);
    ctx.lineTo(-size * 0.1, -size * 0.17);
    ctx.lineTo(-size * 0.1, size * 0.17);
    ctx.closePath();
    ctx.fillStyle = pressed ? C.accentInk : C.text;
    ctx.fill();
    ctx.restore();
  }

  function keyLabel(x, y, str) {
    const w = measure(str, 14, 800) + 24;
    rrect(x, y - 16, w, 32, 6, null, 'rgba(255,255,255,0.4)', 1.5);
    text(str, x + w / 2, y + 1, 14, C.text, { align: 'center', weight: 800 });
    return w;
  }

  function drawArrowKeys(x, y, size = 44) {
    const gap = size + 6;
    keycap(x, y - gap, size, held.has('ArrowUp') || held.has('KeyW'), -Math.PI / 2);
    keycap(x - gap, y, size, held.has('ArrowLeft') || held.has('KeyA'), Math.PI);
    keycap(x, y, size, held.has('ArrowDown') || held.has('KeyS'), Math.PI / 2);
    keycap(x + gap, y, size, held.has('ArrowRight') || held.has('KeyD'), 0);
  }

  // ---------- Kreslenie: tráva (predrenderovaná, pokosené pásy) ----------
  const grass = (() => {
    const c = document.createElement('canvas');
    c.width = FW * 2;
    c.height = H * 2;
    const b = c.getContext('2d');
    b.scale(2, 2);
    const stripe = 90;
    for (let x = 0, i = 0; x < FW; x += stripe, i++) {
      b.fillStyle = i % 2 ? C.grassA : C.grassB;
      b.fillRect(x, 0, stripe, H);
    }
    b.strokeStyle = 'rgba(30,70,30,0.16)';
    b.lineWidth = 1.2;
    for (let i = 0; i < 700; i++) {
      const x = rand(0, FW);
      const y = rand(0, H);
      b.beginPath();
      b.moveTo(x, y);
      b.lineTo(x - 1.5, y - 5);
      b.moveTo(x + 2, y);
      b.lineTo(x + 3, y - 4);
      b.stroke();
    }
    b.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 60; i++) {
      b.beginPath();
      b.arc(rand(0, FW), rand(0, H), 1.6, 0, TAU);
      b.fill();
    }
    const v = b.createRadialGradient(FW / 2, H / 2, H * 0.35, FW / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,25,15,0.28)');
    b.fillStyle = v;
    b.fillRect(0, 0, FW, H);
    return c;
  })();

  // ---------- Kreslenie: postavičky ----------
  function drawSheep(x, y, face, walk, { golden = false, scale = 1, alpha = 1, bob = 0 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + bob);
    ctx.scale(face * scale, scale);
    ellipse(0, 13, 17, 5, 'rgba(0,0,0,0.18)');
    const l = Math.sin(walk) * 3;
    ctx.fillStyle = '#3b3434';
    ctx.fillRect(-10, 4 + l * 0.3, 4, 9 - l * 0.3);
    ctx.fillRect(-3, 4 - l * 0.3, 4, 9 + l * 0.3);
    ctx.fillRect(4, 4 + l * 0.3, 4, 9 - l * 0.3);
    ctx.fillRect(10, 4 - l * 0.3, 4, 9 + l * 0.3);
    const wool = golden ? '#ffd84a' : '#f7f5ee';
    const edge = golden ? '#c99a12' : '#cbc6b6';
    const puffs = [[-9, -1, 9], [0, -5, 10], [9, -1, 9], [-4, 4, 9], [6, 4, 9]];
    for (const [px, py, r] of puffs) circle(px, py, r + 1.5, edge);
    for (const [px, py, r] of puffs) circle(px, py, r, wool);
    circle(-3, -7, 4, golden ? '#ffe98a' : '#ffffff');
    ellipse(15, -4, 7, 6, '#3b3434');
    ellipse(11, -9, 3.5, 2, '#3b3434');
    circle(17, -5.5, 1.6, '#ffffff');
    if (golden) {
      ctx.strokeStyle = '#ffec99';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -20, 8, 3, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShepherd(sh) {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.scale(sh.face, 1);
    ellipse(0, 22, 18, 6, 'rgba(0,0,0,0.22)');
    const step = sh.moving ? Math.sin(sh.walk) * 4 : 0;
    ctx.fillStyle = '#5c3615';
    ctx.fillRect(-9 + step, 15, 7, 7);
    ctx.fillRect(2 - step, 15, 7, 7);
    // plášť
    ctx.beginPath();
    ctx.moveTo(-11, -6);
    ctx.lineTo(11, -6);
    ctx.lineTo(15, 18);
    ctx.lineTo(-15, 18);
    ctx.closePath();
    ctx.fillStyle = '#9c6b3c';
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-12, 4, 25, 4);
    // ruka a palica
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 22);
    ctx.lineTo(18, -26);
    ctx.arc(11, -26, 7, 0, Math.PI, true);
    ctx.stroke();
    circle(15, 0, 4.5, '#f1c27d');
    // hlava
    circle(0, -15, 10, '#f1c27d');
    ctx.beginPath();
    ctx.arc(0, -16, 11.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(11, -8);
    ctx.lineTo(-11, -8);
    ctx.closePath();
    ctx.fillStyle = '#ece4cf';
    ctx.fill();
    ctx.fillStyle = '#3d7dca';
    ctx.fillRect(-11.5, -20, 23, 3.5);
    circle(4, -13, 1.6, '#3b2a1a');
    ctx.strokeStyle = '#a0522d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(3, -10, 3, 0.2, Math.PI - 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawWolf(w) {
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(w.face, 1);
    ellipse(0, 14, 22, 6, 'rgba(0,0,0,0.2)');
    const l = Math.sin(w.walk) * 4;
    ctx.fillStyle = '#4a4e57';
    ctx.fillRect(-14, 4, 5, 10 + l * 0.4);
    ctx.fillRect(-5, 4, 5, 10 - l * 0.4);
    ctx.fillRect(6, 4, 5, 10 + l * 0.4);
    ctx.fillRect(13, 4, 5, 10 - l * 0.4);
    // chvost
    ctx.strokeStyle = '#5f6470';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.quadraticCurveTo(-32, -6 + l, -30, -18);
    ctx.stroke();
    ellipse(0, 0, 21, 11, '#6f7480');
    ellipse(2, 4, 14, 5, '#9aa0aa');
    // hlava
    circle(19, -7, 10, '#6f7480');
    ctx.beginPath();
    ctx.moveTo(24, -10);
    ctx.lineTo(36, -4);
    ctx.lineTo(24, 0);
    ctx.closePath();
    ctx.fillStyle = '#9aa0aa';
    ctx.fill();
    circle(35, -4.5, 2.2, '#222');
    ctx.fillStyle = '#5f6470';
    ctx.beginPath();
    ctx.moveTo(12, -12);
    ctx.lineTo(14, -24);
    ctx.lineTo(19, -15);
    ctx.moveTo(18, -14);
    ctx.lineTo(22, -25);
    ctx.lineTo(25, -14);
    ctx.fill();
    circle(22, -9, 2.4, '#ffd43b');
    circle(22.6, -9, 1, '#222');
    ctx.restore();
    if (w.carry) drawSheep(w.carry.x, w.carry.y, w.face, 0, { golden: w.carry.golden, scale: 0.6 });
  }

  function drawPen(glow) {
    const { x, y, w, h } = PEN;
    rrect(x, y, w, h, 6, '#D8C08A');
    ctx.fillStyle = 'rgba(120,90,40,0.1)';
    for (let i = 1; i < 6; i++) ctx.fillRect(x + 8, y + (i * h) / 6, w - 16, 2);

    if (glow) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(now * 5);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x - 10, y - 10, w + 20, h + 20, 12);
      ctx.stroke();
      ctx.restore();
    }

    for (const s of g.penSheep) {
      drawSheep(s.x, s.y, s.face, 0, { golden: s.golden, scale: 0.75, bob: Math.sin(now * 2 + s.phase) * 1.2 });
    }

    // plot s bránkami hore a dole
    const gate = 56;
    const rails = [
      [x, y, x + w / 2 - gate / 2, y],
      [x + w / 2 + gate / 2, y, x + w, y],
      [x, y + h, x + w / 2 - gate / 2, y + h],
      [x + w / 2 + gate / 2, y + h, x + w, y + h],
      [x, y, x, y + h],
      [x + w, y, x + w, y + h],
    ];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6E4A2E';
    ctx.lineWidth = 4;
    for (const [ax, ay, bx, by] of rails) {
      const offsets = ay === by ? [-5, 3] : [0];
      for (const off of offsets) {
        ctx.beginPath();
        ctx.moveTo(ax, ay + off);
        ctx.lineTo(bx, by + off);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#4E331F';
    const posts = [];
    for (let px = x; px <= x + w + 1; px += w / 6) {
      if (Math.abs(px - (x + w / 2)) > gate / 2) posts.push([px, y], [px, y + h]);
    }
    for (let py = y + h / 4; py < y + h - 1; py += h / 4) posts.push([x, py], [x + w, py]);
    for (const [px, py] of posts) {
      ctx.beginPath();
      ctx.roundRect(px - 3.5, py - 9, 7, 14, 2);
      ctx.fill();
    }

    const sx = x + w / 2;
    const sy = y - 26;
    rrect(sx - 50, sy - 13, 100, 26, 4, '#4E331F');
    text('OHRADA', sx, sy + 1, 13, '#F4F1EA', { align: 'center', weight: 800, spacing: 2 });
  }

  // Nápovedy priamo v hre – nahrádzajú vysvetľovanie pravidiel.
  function drawHints() {
    const sh = g.sh;
    if (g.chain.length) {
      arrowTo(sh.x, sh.y, PEN_CENTER.x, PEN_CENTER.y, C.accent);
      text(`Sem s nimi, +${chainValue()}`, PEN_CENTER.x, PEN.y + PEN.h + 34, 22, C.accent, { align: 'center', weight: 800, shadow: true });
    } else if (g.delivered === 0 && g.started) {
      const s = nearestWanderSheep(sh);
      if (s) {
        downArrow(s.x, s.y - 40, '#ffffff');
        if (dist(s, sh) > 120) arrowTo(sh.x, sh.y, s.x, s.y, '#ffffff');
      }
    }

    for (const w of g.wolves) {
      if (w.state === 'hunt' && w.age < 4 && w.x > 0 && w.x < FW && w.y > HUD_H && w.y < H) {
        const msg = 'Vlk, odožeň ho';
        const tw = measure(msg, 14, 800) + 24;
        rrect(w.x - tw / 2, w.y - 60, tw, 26, 13, 'rgba(14,27,42,0.88)');
        text(msg, w.x, w.y - 46, 14, C.danger, { align: 'center', weight: 800 });
      }
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FW, H);
    ctx.clip();
    ctx.drawImage(grass, 0, 0, FW, H);
    drawPen(g.chain.length > 0);

    const actors = [];
    for (const s of g.sheep) {
      if (s.state === 'carried') continue;
      actors.push({ y: s.y, draw: () => {
        const pop = s.age < 0.35 ? easeOutBack(s.age / 0.35) : 1;
        const fading = s.golden && s.state === 'wander' && s.life < 3 ? (Math.floor(now * 10) % 2 ? 0.45 : 1) : 1;
        drawSheep(s.x, s.y, s.face, s.walk, { golden: s.golden, scale: pop, alpha: fading });
      } });
    }
    actors.push({ y: g.sh.y, draw: () => drawShepherd(g.sh) });
    for (const w of g.wolves) actors.push({ y: w.y, draw: () => drawWolf(w) });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();

    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.square) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.6);
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (state === 'play') drawHints();

    for (const f of g.floaters) {
      ctx.globalAlpha = Math.min(1, (f.life / f.max) * 2);
      text(f.text, clamp(f.x, 170, FW - 170), f.y, f.size, f.color, { align: 'center', weight: 800, shadow: true });
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function hudSep(x) {
    ctx.fillStyle = C.line;
    ctx.fillRect(x, 18, 1, HUD_H - 36);
  }

  function drawHud() {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, FW, HUD_H);

    label('Body', 32, 24);
    text(String(g.score), 32, 52, 32, C.text, { weight: 800 });
    hudSep(190);
    label('Za tebou', 214, 24);
    text(`${g.chain.length} ${ovce(g.chain.length)}`, 214, 52, 24, C.text);

    const t = Math.max(0, Math.ceil(g.timeLeft));
    const urgent = t <= 10 && state === 'play';
    text(String(t), FW / 2, 34, 40, urgent ? C.danger : C.text, { align: 'center', weight: 800 });
    label('sekúnd', FW / 2, 62, C.muted, 'center', 11);

    label('V ohrade', FW - 32, 24, C.muted, 'right');
    text(String(g.delivered), FW - 32, 52, 32, C.text, { align: 'right', weight: 800 });
    hudSep(FW - 190);
    const rank = projectedRank(g.score);
    label('Miesto', FW - 214, 24, C.muted, 'right');
    text(g.score > 0 ? `${rank}.` : '-', FW - 214, 52, 32, g.score > 0 && rank <= 3 ? C.accent : C.text, { align: 'right', weight: 800 });

    // časová lišta po celej šírke
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, HUD_H - 3, FW, 3);
    ctx.fillStyle = urgent ? C.danger : C.accent;
    ctx.fillRect(0, HUD_H - 3, FW * clamp(g.timeLeft / CFG.roundSeconds, 0, 1), 3);

    if (Sound.muted) label('Zvuk vypnutý', FW - 32, HUD_H + 18, C.text, 'right', 11);
  }

  function drawReady() {
    const sh = g.sh;
    dim(0.3, HUD_H);
    drawArrowKeys(sh.x, sh.y + 120, 46);
    text('Hýb sa šípkami', sh.x, sh.y + 188, 26, C.text, { align: 'center', shadow: true });
    const msg = 'Pozbieraj ovečky a zažeň ich do ohrady';
    const w = measure(msg, 20, 700) + 48;
    rrect(FW / 2 - w / 2, PLAY.y0 + 16, w, 44, 22, 'rgba(14,27,42,0.88)');
    text(msg, FW / 2, PLAY.y0 + 39, 20, C.text, { align: 'center' });
  }

  function drawBanner() {
    if (!g.banner) return;
    const b = g.banner;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3, (b.max - b.life) * 6);
    text(b.text, FW / 2, 200, 52, b.color, { align: 'center', weight: 800, shadow: true });
    ctx.restore();
  }

  // ---------- Bočný panel s rebríčkom ----------
  function drawSidebar() {
    const x = FW;
    const sw = W - FW;
    const pad = 32;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, 0, sw, H);
    ctx.fillStyle = C.line;
    ctx.fillRect(x, 0, 1, H);

    label('Dobrý pastier', x + pad, 34, C.accent);
    text('Rebríček', x + pad, 66, 30, C.text, { weight: 800 });

    const board = Storage.board();
    const hl = result && state === 'results' ? result.key : null;
    const top = 100;
    const rowH = 44;
    for (let i = 0; i < 10; i++) {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      const r = board[i];
      if (r && r.key === hl) {
        rrect(x + 14, y + 3, sw - 28, rowH - 6, 8, C.panel2);
        ctx.fillStyle = C.accent;
        ctx.fillRect(x + 14, y + 11, 3, rowH - 22);
      }
      text(String(i + 1), x + pad + 20, cy, 17, i < 3 && r ? C.accent : C.muted, { align: 'right', weight: 800 });
      if (r) {
        text(fitText(r.name, 220, 18, 600), x + pad + 40, cy, 18, C.text, { weight: 600 });
        text(String(r.score), x + sw - pad, cy, 18, C.text, { align: 'right', weight: 800 });
      } else if (i === 0) {
        text('zatiaľ nikto', x + pad + 40, cy, 17, C.muted, { weight: 500 });
      }
      if (i < 9) hline(x + pad, y + rowH, sw - 2 * pad);
    }
    label(`Hráči ${board.length}`, x + pad, top + 10 * rowH + 24);
    label(`Hry ${Storage.totalGames}`, x + sw - pad, top + 10 * rowH + 24, C.muted, 'right');

    // DeKa tím + QR kódy
    const by = 600;
    const bh = H - by - 16;
    rrect(x + 16, by, sw - 32, bh, 12, C.panel, C.line, 1);
    text(CFG.teamName, x + pad, by + 40, 26, C.text, { weight: 800 });
    text(CFG.teamSubtitle, x + pad, by + 70, 16, C.muted, { weight: 500 });
    const qrs = readyQrs().slice(0, 2);
    if (qrs.length === 1) {
      const qs = 170;
      drawQr(qrs[0].img, x + sw - pad - qs + 6, by + bh - qs - 20, qs);
      const lines = wrap(qrs[0].caption, 110, 15, 600);
      lines.forEach((l, i) => text(l, x + pad, by + bh - 40 - (lines.length - 1 - i) * 20, 15, C.accent, { weight: 600 }));
    } else if (qrs.length === 2) {
      const qs = 142;
      const gap = 18;
      const x0 = x + (sw - (qs * 2 + gap)) / 2;
      qrs.forEach((q, i) => {
        const qx = x0 + i * (qs + gap);
        drawQr(q.img, qx, by + 92, qs);
        text(fitText(q.short || q.caption, qs + 10, 14, 700), qx + qs / 2, by + 92 + qs + 20, 14, C.accent, { align: 'center', weight: 700 });
      });
    }

    const st = Storage.status;
    circle(x + sw - 10, H - 8, 2.5, st === 'online' ? C.good : st === 'local' ? '#74c0fc' : '#ffa94d');
  }

  // ---------- Obrazovky ----------
  function buildPanels() {
    const pages = Math.min(8, Math.ceil(Storage.board().length / 10));
    // 'demo' = na ihrisku hrá ukážkový pastier, nič ho nezakrýva
    const panels = [{ type: 'demo', dur: 12 }];
    for (let p = 0; p < pages; p++) panels.push({ type: 'board', page: p, pages, dur: 6 });
    panels.push({ type: 'demo', dur: 10 });
    if (readyQrs().length) panels.push({ type: 'deka', dur: 8 });
    return panels;
  }

  function drawBoardPage(bx, by, bw, page, pages) {
    const board = Storage.board();
    label('Celé poradie', bx + 40, by + 44, C.accent);
    if (pages > 1) label(`${page + 1} / ${pages}`, bx + bw - 40, by + 44, C.muted, 'right');
    label('Meno', bx + 100, by + 84, C.muted, 'left', 11);
    label('Ovečky', bx + bw - 190, by + 84, C.muted, 'right', 11);
    label('Body', bx + bw - 40, by + 84, C.muted, 'right', 11);
    for (let i = 0; i < 10; i++) {
      const idx = page * 10 + i;
      const r = board[idx];
      if (!r) break;
      const y = by + 120 + i * 34;
      hline(bx + 40, y - 17, bw - 80);
      text(String(idx + 1), bx + 76, y, 18, idx < 3 ? C.accent : C.muted, { align: 'right', weight: 800 });
      text(fitText(r.name, 440, 19, 600), bx + 100, y, 19, C.text, { weight: 600 });
      text(String(r.delivered), bx + bw - 190, y, 17, C.muted, { align: 'right', weight: 500 });
      text(String(r.score), bx + bw - 40, y, 19, C.text, { align: 'right', weight: 800 });
    }
  }

  function drawDeka(bx, by, bw, bh) {
    const qrs = readyQrs().slice(0, 2);
    if (qrs.length === 1) {
      text(CFG.teamName, bx + 60, by + 150, 64, C.text, { weight: 800 });
      text(CFG.teamSubtitle, bx + 60, by + 210, 28, C.muted, { weight: 500 });
      hline(bx + 60, by + 260, 380);
      for (const [i, l] of wrap(qrs[0].caption, 380, 24, 600).entries()) {
        text(l, bx + 60, by + 300 + i * 32, 24, C.accent, { weight: 600 });
      }
      const qs = bh - 120;
      drawQr(qrs[0].img, bx + bw - 60 - qs, by + 60, qs);
      return;
    }
    // dva QR kódy vedľa seba, popis pod každým
    text(CFG.teamName, bx + 50, by + 205, 54, C.text, { weight: 800 });
    text(CFG.teamSubtitle, bx + 50, by + 255, 24, C.muted, { weight: 500 });
    const qs = 236;
    const gap = 34;
    const x0 = bx + bw - 50 - (qs * 2 + gap);
    const qy = by + 70;
    qrs.forEach((q, i) => {
      const qx = x0 + i * (qs + gap);
      drawQr(q.img, qx, qy, qs);
      text(q.caption, qx + qs / 2, qy + qs + 32, 22, C.accent, { align: 'center', weight: 700 });
      if (q.sub) text(q.sub, qx + qs / 2, qy + qs + 60, 17, C.muted, { align: 'center', weight: 500 });
    });
  }

  // Tri kroky – celé pravidlá hry na jeden pohľad.
  function drawSteps(y) {
    const steps = [
      [() => drawSheep(0, 0, 1, now * 6), 'Pozbieraj ovečky'],
      [() => {
        rrect(-22, -15, 44, 30, 4, '#D8C08A', '#6E4A2E', 3);
        drawSheep(0, 2, 1, 0, { scale: 0.55 });
      }, 'Zažeň ich do ohrady'],
      [() => text('×5', 0, 1, 24, C.accent, { align: 'center', weight: 800 }), 'Viac naraz, viac bodov'],
    ];
    const w = 330;
    const x0 = FW / 2 - (w * steps.length) / 2;
    steps.forEach(([icon, lbl], i) => {
      const cx = x0 + i * w;
      if (i > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(cx, y - 24, 1, 48);
      }
      ctx.save();
      ctx.translate(cx + 56, y + 2);
      icon();
      ctx.restore();
      label(`0${i + 1}`, cx + 96, y - 13, C.accent, 'left', 12);
      text(lbl, cx + 96, y + 12, 19, C.text, { weight: 700, maxW: w - 110 });
    });
  }

  function drawAttract() {
    drawWorld();
    const p = attract.panels[attract.idx];
    const boxed = p.type !== 'demo';

    let gr = ctx.createLinearGradient(0, 0, 0, 240);
    gr.addColorStop(0, 'rgba(14,27,42,0.85)');
    gr.addColorStop(1, 'rgba(14,27,42,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, FW, 240);
    gr = ctx.createLinearGradient(0, H - 300, 0, H);
    gr.addColorStop(0, 'rgba(14,27,42,0)');
    gr.addColorStop(1, 'rgba(14,27,42,0.94)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, H - 300, FW, 300);
    if (boxed) dim(0.5);

    label(`${CFG.teamName}, ${CFG.teamSubtitle}`, FW / 2, 46, C.accent, 'center', 14);
    text('Dobrý pastier', FW / 2, 98, 64, C.text, { align: 'center', weight: 800, shadow: true });

    if (boxed) {
      const bx = 150;
      const by = 160;
      const bw = 900;
      const bh = 480;
      panel(bx, by, bw, bh);
      if (p.type === 'board') drawBoardPage(bx, by, bw, p.page, p.pages);
      else drawDeka(bx, by, bw, bh);
    }

    drawSteps(H - 175);

    const cta = 'Stlač šípku a hraj';
    const cw = measure(cta, 24, 800) + 72;
    ctx.save();
    ctx.globalAlpha = 0.82 + 0.18 * Math.sin(now * 4);
    rrect(FW / 2 - cw / 2, H - 112, cw, 56, 28, C.accent);
    text(cta, FW / 2, H - 83, 24, C.accentInk, { align: 'center', weight: 800 });
    ctx.restore();
    text(`Kolo trvá ${CFG.roundSeconds} sekúnd`, FW / 2, H - 32, 14, C.muted, { align: 'center', weight: 500 });
  }

  function drawOver() {
    drawWorld();
    drawHud();
    dim(0.45, HUD_H);
    ctx.save();
    ctx.globalAlpha = Math.min(1, stateT * 3);
    text('Koniec', FW / 2, H / 2 - 30, 84, C.text, { align: 'center', weight: 800, shadow: true });
    text(g.score > 0 ? `${g.score} bodov` : 'Tentoraz nič, skús znova', FW / 2, H / 2 + 44, 32, C.accent, { align: 'center', weight: 700, shadow: true });
    ctx.restore();
  }

  // Rebríček s „duchom“ hráča na mieste, kam by sa zaradil.
  function previewRows(maxRows) {
    const board = Storage.board();
    const rank = projectedRank(g.score);
    const me = { ghost: true, rank, name: nameInput.value.trim() || 'Ty', score: g.score };
    const rows = board.map((r, i) => ({ rank: i < rank - 1 ? i + 1 : i + 2, name: r.name, score: r.score }));
    rows.splice(rank - 1, 0, me);
    if (rows.length <= maxRows) return rows;
    if (rank <= maxRows - 1) return rows.slice(0, maxRows);
    const head = rows.slice(0, 3);
    const tailLen = maxRows - 4;
    const start = clamp(rank - 1 - Math.floor(tailLen / 2), 3, rows.length - tailLen);
    return [...head, { gap: true }, ...rows.slice(start, start + tailLen)];
  }

  function listRow(x, y, w, rank, name, score, opts = {}) {
    const { mine = false, nameW = 300, extra = null } = opts;
    if (mine) {
      rrect(x, y - 22, w, 44, 8, C.panel2);
      ctx.fillStyle = C.accent;
      ctx.fillRect(x, y - 13, 3, 26);
    }
    text(String(rank), x + 44, y, 19, rank <= 3 ? C.accent : C.muted, { align: 'right', weight: 800 });
    const n = fitText(name, nameW, 20, 600);
    text(n, x + 64, y, 20, mine ? C.accent : C.text, { weight: 600 });
    if (mine) label('Ty', x + 64 + measure(n, 20, 600) + 12, y + 1, C.accent, 'left', 11);
    if (extra !== null) text(String(extra), x + w - 120, y, 17, C.muted, { align: 'right', weight: 500 });
    text(String(score), x + w - 16, y, 20, C.text, { align: 'right', weight: 800 });
  }

  function drawName() {
    drawWorld();
    dim(0.82);

    const lx = 40;
    const ly = 50;
    const lw = 560;
    const lh = 800;
    panel(lx, ly, lw, lh);
    const px = lx + 44;
    label('Tvoj výsledok', px, ly + 54, C.accent);
    text(String(g.score), px, ly + 134, 104, C.text, { weight: 800 });
    text(`bodov, ${g.delivered} ${ovce(g.delivered)} v ohrade`, px, ly + 204, 19, C.muted, { weight: 500 });
    hline(px, ly + 244, lw - 88);

    const rank = projectedRank(g.score);
    label('Miesto v rebríčku', px, ly + 284);
    const rs = `${rank}.`;
    text(rs, px, ly + 332, 48, C.accent, { weight: 800 });
    text(`z ${Storage.board().length + 1}`, px + measure(rs, 48, 800) + 14, ly + 340, 20, C.muted, { weight: 500 });

    label('Meno alebo prezývka', px, ly + 424);
    const ix = px;
    const iy = ly + 446;
    const iw = lw - 88;
    rrect(ix, iy, iw, 72, 10, C.panel2, C.accent, 2);
    const val = nameInput.value;
    text(val, ix + 22, iy + 37, 34, C.text, { maxW: iw - 50 });
    const cw = Math.min(measure(val, 34), iw - 50);
    if (Math.floor(now * 2) % 2 === 0) {
      ctx.fillStyle = C.accent;
      ctx.fillRect(ix + 24 + cw, iy + 18, 3, 38);
    }
    if (!val) text('napíš meno', ix + 34, iy + 37, 28, 'rgba(143,163,184,0.6)', { weight: 500 });
    if (nameError) text(nameError, ix, iy + 100, 17, C.danger, { weight: 600 });

    const kw = keyLabel(px, ly + 650, 'Enter');
    text('uložiť', px + kw + 12, ly + 651, 18, C.text, { weight: 600 });
    const ew = keyLabel(px + kw + 110, ly + 650, 'Esc');
    text('preskočiť', px + kw + 110 + ew + 12, ly + 651, 18, C.muted, { weight: 500 });
    label(`${Math.max(0, Math.ceil(NAME_TIMEOUT - idleT))} s`, lx + lw - 44, ly + lh - 40, C.muted, 'right', 11);

    const rx = 630;
    const ry = 50;
    const rw = 530;
    const rh = 800;
    panel(rx, ry, rw, rh);
    label('Rebríček', rx + 36, ry + 54, C.accent);
    previewRows(13).forEach((r, i) => {
      const y = ry + 110 + i * 52;
      if (r.gap) {
        text('…', rx + rw / 2, y, 22, C.muted, { align: 'center' });
        return;
      }
      if (!r.ghost) hline(rx + 36, y + 26, rw - 72);
      listRow(rx + 16, y, rw - 32, r.rank, r.name, r.score, { mine: r.ghost, nameW: 280 });
    });
  }

  function drawResults() {
    drawWorld();
    dim(0.82);
    const board = Storage.board();
    const idx = board.findIndex((r) => r.key === result.key);
    const me = board[idx];

    const lx = 40;
    const ly = 50;
    const lw = 430;
    const lh = 760;
    panel(lx, ly, lw, lh);
    const px = lx + 40;
    label('Výsledok', px, ly + 54, C.accent);
    text(fitText(result.entry.name, lw - 80, 32, 800), px, ly + 94, 32, C.text, { weight: 800 });

    label('Miesto', px, ly + 160);
    const rs = `${idx + 1}.`;
    text(rs, px, ly + 228, 92, C.accent, { weight: 800 });
    text(`z ${board.length}`, px + measure(rs, 92, 800) + 14, ly + 246, 22, C.muted, { weight: 500 });

    hline(px, ly + 300, lw - 80);
    text('Toto kolo', px, ly + 334, 18, C.muted, { weight: 500 });
    text(String(result.entry.score), lx + lw - 40, ly + 334, 20, C.text, { align: 'right', weight: 800 });
    hline(px, ly + 362, lw - 80);
    text('Ovečky v ohrade', px, ly + 390, 18, C.muted, { weight: 500 });
    text(String(result.entry.delivered), lx + lw - 40, ly + 390, 20, C.text, { align: 'right', weight: 800 });
    hline(px, ly + 418, lw - 80);

    const msgs = [];
    if (result.newRecord) msgs.push(['Tvoj nový rekord', C.accent]);
    else if (result.prevBest !== null && me) msgs.push([`Tvoj rekord je ${me.score}`, C.muted]);
    if (idx === 0) msgs.push(['Vedieš rebríček', C.accent]);
    else {
      msgs.push([`Na ${idx}. miesto ti chýba ${board[idx - 1].score - me.score + 1} bodov`, C.text]);
      if (idx >= 10) msgs.push([`Do prvej desiatky ti chýba ${board[9].score - me.score + 1} bodov`, C.text]);
    }
    let my = ly + 462;
    for (const [m, c] of msgs) {
      for (const line of wrap(m, lw - 80, 19, 600)) {
        text(line, px, my, 19, c, { weight: 600 });
        my += 28;
      }
      my += 8;
    }
    text('Skús to ešte raz', px, ly + lh - 44, 17, C.muted, { weight: 500 });

    const rx = 500;
    const ry = 50;
    const rw = 660;
    const rh = 760;
    panel(rx, ry, rw, rh);
    label('Poradie', rx + 36, ry + 54, C.accent);
    label('Meno', rx + 80, ry + 92, C.muted, 'left', 11);
    label('Ovečky', rx + rw - 136, ry + 92, C.muted, 'right', 11);
    label('Body', rx + rw - 32, ry + 92, C.muted, 'right', 11);
    for (let i = 0; i < RESULT_ROWS; i++) {
      const r = board[resultsTop + i];
      if (!r) break;
      const y = ry + 135 + i * 52;
      const mine = r.key === result.key;
      if (!mine) hline(rx + 36, y + 26, rw - 72);
      listRow(rx + 16, y, rw - 32, resultsTop + i + 1, r.name, r.score, { mine, nameW: 330, extra: r.delivered });
    }
    if (board.length > RESULT_ROWS) {
      text(`${resultsTop + 1} až ${Math.min(board.length, resultsTop + RESULT_ROWS)} z ${board.length}, šípkami hore a dole listuješ`, rx + rw / 2, ry + rh - 32, 14, C.muted, { align: 'center', weight: 500 });
    }

    const left = Math.max(0, Math.ceil(RESULTS_TIMEOUT - idleT));
    const msg = `ďalší hráč (${left} s)`;
    const total = measure('Enter', 14, 800) + 24 + 12 + measure(msg, 17, 500);
    const sx = FW / 2 - total / 2;
    const kw = keyLabel(sx, 855, 'Enter');
    text(msg, sx + kw + 12, 856, 17, C.muted, { weight: 500 });
  }

  // ---------- Hlavná slučka ----------
  let last = performance.now();
  let syncT = 0;

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    now += dt;
    stateT += dt;
    idleT += dt;

    switch (state) {
      case 'attract': {
        updateDemo(dt);
        attract.t += dt;
        if (attract.t > attract.panels[attract.idx].dur) {
          attract.t = 0;
          attract.idx++;
          if (attract.idx >= attract.panels.length) {
            attract.panels = buildPanels();
            attract.idx = 0;
          }
        }
        syncT += dt;
        if (syncT > 30) {
          syncT = 0;
          Storage.sync();
        }
        drawAttract();
        break;
      }
      case 'play':
        updatePlay(dt);
        drawWorld();
        drawHud();
        if (!g.started) drawReady();
        drawBanner();
        break;
      case 'over':
        updateSheep(dt);
        updateEffects(dt);
        if (stateT > OVER_TIME) {
          if (g.score > 0) enterName();
          else enterAttract();
        }
        drawOver();
        break;
      case 'name':
        if (document.activeElement !== nameInput) nameInput.focus();
        if (idleT > NAME_TIMEOUT) {
          if (nameInput.value.trim()) submitName();
          else enterAttract();
        }
        drawName();
        break;
      case 'results':
        updateSheep(dt);
        if (idleT > RESULTS_TIMEOUT) enterAttract();
        drawResults();
        break;
    }
    drawSidebar();
    requestAnimationFrame(frame);
  }

  // Ladenie: http://localhost:8080/?debug sprístupní stav hry v konzole.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = {
      get g() {
        return g;
      },
      get state() {
        return state;
      },
      get attract() {
        return attract;
      },
      PEN,
    };
  }

  enterAttract();
  requestAnimationFrame((ts) => {
    last = ts;
    frame(ts);
  });
})();
