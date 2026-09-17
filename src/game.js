/* NOOP — a tiny first-person shooter inside a CPU.
   You are a NOOP instruction. Everything else is trying to do something. Stop it.
   Original code, no engine, no assets: walls, monsters and sounds are generated at boot.
   MIT — github.com/Lindophx/noop */
(function () {
  'use strict';

  // ---------- constants ----------
  const W = 320, H = 200, HUD_H = 32, VIEW_H = H - HUD_H;
  const FOV = Math.PI / 3, HALF = FOV / 2;
  const TEX = 64, SPR = 64;
  const TAU = Math.PI * 2;

  const TYPES = {
    ADD: { hp: 2, speed: 1.1, dmg: 8, color: '#37c46b', text: '#08140c', size: 1.0, pts: 1 },
    MOV: { hp: 1, speed: 2.4, dmg: 5, color: '#f5b431', text: '#1a1200', size: 0.8, pts: 1 },
    JMP: { hp: 3, speed: 0.9, dmg: 12, color: '#8f6bff', text: '#0d0620', size: 1.0, pts: 2, jump: true },
    MUL: { hp: 4, speed: 0.8, dmg: 10, color: '#ff5fa2', text: '#200612', size: 1.15, pts: 3, split: true },
    RUG: { hp: 45, speed: 0.75, dmg: 20, color: '#e4322b', text: '#fff', size: 2.2, pts: 25, boss: true },
    SELL: { hp: 1, speed: 4.5, dmg: 15, color: '#ff2a2a', text: '#fff', size: 0.45, pts: 0, bullet: true },
  };

  const LEVELS = [
    { name: 'THE MEMPOOL', size: 15, spawn: { ADD: 4, MOV: 3 }, tex: 1, tip: 'Halt every instruction.' },
    { name: 'THE BONDING CURVE', size: 19, spawn: { ADD: 5, MOV: 4, JMP: 3 }, tex: 2, tip: 'JMP teleports. Keep moving.' },
    { name: 'THE CPU CORE', size: 23, spawn: { ADD: 5, MOV: 5, JMP: 4, MUL: 3 }, tex: 3, tip: 'MUL splits when hit. Finish it.' },
    { name: 'RUG', size: 15, spawn: { RUG: 1 }, tex: 4, boss: true, tip: 'It wants your liquidity.' },
  ];

  // ---------- tiny seeded RNG ----------
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = W; canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- textures (procedural) ----------
  const textures = [];
  function makeTextures() {
    const r = rng(7);
    // 0 unused; 1 PCB, 2 chip, 3 memory, 4 warning
    for (let t = 0; t <= 4; t++) {
      const c = mk(TEX, TEX), g = c.getContext('2d');
      if (t === 1) {
        g.fillStyle = '#0d3b2e'; g.fillRect(0, 0, TEX, TEX);
        g.strokeStyle = '#1f7f5c'; g.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          g.beginPath(); let x = (r() * TEX) | 0, y = (r() * TEX) | 0; g.moveTo(x, y);
          for (let k = 0; k < 3; k++) { if (r() < 0.5) x = (r() * TEX) | 0; else y = (r() * TEX) | 0; g.lineTo(x, y); }
          g.stroke(); g.fillStyle = '#d9b03a'; g.fillRect(x - 2, y - 2, 4, 4);
        }
        g.fillStyle = '#082a20'; g.fillRect(0, 0, TEX, 2); g.fillRect(0, 0, 2, TEX);
      } else if (t === 2) {
        g.fillStyle = '#15161c'; g.fillRect(0, 0, TEX, TEX);
        g.fillStyle = '#2a2c36'; g.fillRect(10, 10, 44, 44);
        g.fillStyle = '#8c8f9c';
        for (let i = 0; i < 8; i++) { g.fillRect(2, 12 + i * 5, 8, 2); g.fillRect(54, 12 + i * 5, 8, 2); g.fillRect(12 + i * 5, 2, 2, 8); g.fillRect(12 + i * 5, 54, 2, 8); }
        g.fillStyle = '#5ee0c2'; g.font = 'bold 9px monospace'; g.fillText('NOP', 22, 36);
        g.fillStyle = '#0e0f13'; g.fillRect(0, 0, TEX, 1); g.fillRect(0, 0, 1, TEX);
      } else if (t === 3) {
        g.fillStyle = '#101a2e'; g.fillRect(0, 0, TEX, TEX);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const on = r() < 0.35; g.fillStyle = on ? '#3f7bff' : '#182548'; g.fillRect(x * 8 + 1, y * 8 + 1, 6, 6);
        }
        g.fillStyle = '#0a1120'; g.fillRect(0, 0, TEX, 1); g.fillRect(0, 0, 1, TEX);
      } else if (t === 4) {
        g.fillStyle = '#2a0b0b'; g.fillRect(0, 0, TEX, TEX);
        g.fillStyle = '#b3261e';
        for (let i = -TEX; i < TEX * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 - TEX, TEX); g.lineTo(i - TEX, TEX); g.fill(); }
        g.fillStyle = '#ffd7d7'; g.font = 'bold 10px monospace'; g.fillText('SELL', 18, 36);
      } else { g.fillStyle = '#222'; g.fillRect(0, 0, TEX, TEX); }
      // darker version for N/S vs E/W shading
      const d = mk(TEX, TEX), dg = d.getContext('2d');
      dg.drawImage(c, 0, 0); dg.fillStyle = 'rgba(0,0,0,0.35)'; dg.fillRect(0, 0, TEX, TEX);
      textures[t] = [c, d];
    }
  }

  // ---------- sprites (procedural monsters) ----------
  const sprites = {};
  function drawMonster(g, type, halted) {
    const T = TYPES[type];
    g.clearRect(0, 0, SPR, SPR);
    const col = halted ? '#4a4d57' : T.color, txt = halted ? '#9a9da8' : T.text;
    if (T.bullet) {
      g.fillStyle = col; g.fillRect(8, 24, 48, 16);
      g.fillStyle = '#fff'; g.font = 'bold 12px monospace'; g.fillText('SELL', 14, 36);
      return;
    }
    // legs
    g.fillStyle = halted ? '#2c2e35' : '#111';
    g.fillRect(16, 52, 8, 12); g.fillRect(40, 52, 8, 12);
    // body chip
    g.fillStyle = col; g.fillRect(6, 12, 52, 42);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(6, 48, 52, 6);
    // pins
    g.fillStyle = '#c9ccd6';
    for (let i = 0; i < 6; i++) { g.fillRect(0, 16 + i * 6, 6, 3); g.fillRect(58, 16 + i * 6, 6, 3); }
    // eyes
    g.fillStyle = '#fff';
    if (halted) { g.strokeStyle = '#9a9da8'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, 20); g.lineTo(26, 28); g.moveTo(26, 20); g.lineTo(18, 28); g.moveTo(38, 20); g.lineTo(46, 28); g.moveTo(46, 20); g.lineTo(38, 28); g.stroke(); }
    else { g.fillRect(16, 19, 12, 10); g.fillRect(36, 19, 12, 10); g.fillStyle = '#111'; g.fillRect(21, 22, 5, 6); g.fillRect(39, 22, 5, 6); g.fillStyle = col; g.beginPath(); g.moveTo(14, 17); g.lineTo(30, 21); g.lineTo(14, 23); g.fill(); g.beginPath(); g.moveTo(50, 17); g.lineTo(34, 21); g.lineTo(50, 23); g.fill(); }
    // label
    g.fillStyle = txt; g.font = 'bold 13px monospace'; g.textAlign = 'center';
    g.fillText(halted ? 'NOP' : type, 32, 44); g.textAlign = 'left';
  }
  function makeSprites() {
    for (const t in TYPES) {
      const a = mk(SPR, SPR), h = mk(SPR, SPR);
      drawMonster(a.getContext('2d'), t, false);
      drawMonster(h.getContext('2d'), t, true);
      sprites[t] = { alive: a, halted: h };
    }
  }

  // ---------- weapon ----------
  const gun = mk(96, 64);
  const scratch = mk(SPR, SPR), sctx = scratch.getContext('2d');
  function makeGun() {
    const g = gun.getContext('2d');
    g.fillStyle = '#23252d'; g.fillRect(28, 20, 40, 44);
    g.fillStyle = '#3a3d48'; g.fillRect(34, 8, 28, 20);
    g.fillStyle = '#5ee0c2'; g.fillRect(40, 12, 16, 4);
    g.fillStyle = '#c9ccd6'; for (let i = 0; i < 4; i++) g.fillRect(30 + i * 10, 26, 4, 3);
    g.fillStyle = '#5ee0c2'; g.font = 'bold 10px monospace'; g.fillText('NOP', 38, 44);
    g.fillStyle = '#111'; g.fillRect(44, 0, 8, 10);
  }

  // ---------- audio (procedural) ----------
  let AC = null;
  function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = false; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function beep(f0, f1, dur, type, vol) {
    const ac = audio(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, ac.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ac.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  }
  const SFX = {
    shoot: () => beep(900, 180, 0.08, 'square', 0.05),
    hit: () => beep(300, 120, 0.06, 'sawtooth', 0.05),
    halt: () => { beep(600, 60, 0.25, 'triangle', 0.08); },
    hurt: () => beep(120, 50, 0.25, 'sawtooth', 0.1),
    jump: () => beep(200, 1200, 0.12, 'sine', 0.06),
    boss: () => { beep(80, 40, 0.6, 'sawtooth', 0.12); setTimeout(() => beep(60, 30, 0.6, 'square', 0.1), 150); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, f, 0.18, 'square', 0.06), i * 120)); },
    level: () => { [392, 523].forEach((f, i) => setTimeout(() => beep(f, f, 0.12, 'square', 0.05), i * 100)); },
  };

  // ---------- map generation ----------
  function genMap(level, seed) {
    const n = level.size, r = rng(seed);
    const m = new Array(n * n).fill(1);
    const at = (x, y) => m[y * n + x];
    const set = (x, y, v) => { m[y * n + x] = v; };
    if (level.boss) {
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) set(x, y, 0);
      for (let y = 3; y < n - 3; y += 4) for (let x = 3; x < n - 3; x += 4) set(x, y, 1);
    } else {
      // recursive backtracker on odd cells
      const stack = [[1, 1]]; set(1, 1, 0);
      while (stack.length) {
        const [x, y] = stack[stack.length - 1];
        const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx > 0 && ny > 0 && nx < n - 1 && ny < n - 1 && at(nx, ny) === 1; });
        if (!dirs.length) { stack.pop(); continue; }
        const [dx, dy] = dirs[(r() * dirs.length) | 0];
        set(x + dx / 2, y + dy / 2, 0); set(x + dx, y + dy, 0); stack.push([x + dx, y + dy]);
      }
      // knock out extra walls for loops and rooms
      const extra = (n * n * 0.06) | 0;
      for (let i = 0; i < extra; i++) { const x = 1 + ((r() * (n - 2)) | 0), y = 1 + ((r() * (n - 2)) | 0); if (x > 0 && y > 0 && x < n - 1 && y < n - 1) set(x, y, 0); }
      for (let k = 0; k < 3; k++) { const rx = 1 + ((r() * (n - 5)) | 0), ry = 1 + ((r() * (n - 5)) | 0); for (let y = ry; y < ry + 3; y++) for (let x = rx; x < rx + 3; x++) set(x, y, 0); }
    }
    // texture ids on walls
    for (let i = 0; i < m.length; i++) if (m[i]) m[i] = level.tex;
    return { n, m, at, set, r };
  }

  // ---------- game state ----------
  const G = {
    state: 'title', // title | play | dead | win | between
    level: 0, map: null, ents: [], player: null, msg: '', msgT: 0, halted: 0, totalHalted: 0,
    fireT: 0, flash: 0, hurtT: 0, bob: 0, startTime: 0, endTime: 0, betweenT: 0, minimap: false,
  };
  const keys = {};
  const zbuf = new Float32Array(W);
  let mouseDX = 0, touch = { move: null, look: null, fire: false };

  function newPlayer(map) {
    let x = 1.5, y = 1.5;
    if (G.map.n && LEVELS[G.level].boss) { x = 1.5; y = (map.n / 2) | 0; y += 0.5; }
    return { x, y, a: 0, hp: 100, speed: 3.2, turn: 2.6 };
  }

  function spawnEnts(level, map) {
    const ents = [], r = map.r;
    const free = [];
    for (let y = 1; y < map.n - 1; y++) for (let x = 1; x < map.n - 1; x++) if (map.at(x, y) === 0 && (x + y) > 7) free.push([x + 0.5, y + 0.5]);
    for (const type in level.spawn) {
      for (let i = 0; i < level.spawn[type]; i++) {
        let p;
        if (TYPES[type].boss) p = [map.n - 3.5, ((map.n / 2) | 0) + 0.5];
        else p = free.splice((r() * free.length) | 0, 1)[0] || [map.n - 2.5, map.n - 2.5];
        ents.push(makeEnt(type, p[0], p[1]));
      }
    }
    return ents;
  }
  function makeEnt(type, x, y) { const T = TYPES[type]; return { type, x, y, hp: T.hp, maxHp: T.hp, alive: true, dieT: 0, hitT: 0, cd: 0, t: 0, vx: 0, vy: 0, dir: Math.random() * TAU }; }

  function startLevel(i) {
    G.level = i; const L = LEVELS[i];
    G.map = genMap(L, 1000 + i * 77);
    G.player = newPlayer(G.map);
    G.ents = spawnEnts(L, G.map);
    G.halted = 0; G.state = 'play';
    say(L.name + (L.tip ? '  ·  ' + L.tip : ''), 3.5);
    if (L.boss) SFX.boss(); else SFX.level();
  }
  function startGame() { G.totalHalted = 0; G.startTime = performance.now(); startLevel(0); }
  function say(m, t) { G.msg = m; G.msgT = t; }

  // ---------- helpers ----------
  const wall = (x, y) => { const m = G.map; const ix = x | 0, iy = y | 0; return ix < 0 || iy < 0 || ix >= m.n || iy >= m.n || m.m[iy * m.n + ix] !== 0; };
  function move(e, dx, dy, rad) {
    if (!wall(e.x + dx + Math.sign(dx) * rad, e.y)) e.x += dx;
    if (!wall(e.x, e.y + dy + Math.sign(dy) * rad)) e.y += dy;
  }
  function los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), steps = Math.ceil(d * 8);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (wall(x0 + dx * t, y0 + dy * t)) return false; }
    return true;
  }
  function castRay(a) {
    // DDA; returns {dist, side, tx}
    const p = G.player, sin = Math.sin(a), cos = Math.cos(a);
    let mx = p.x | 0, my = p.y | 0;
    const ddx = Math.abs(1 / cos), ddy = Math.abs(1 / sin);
    let sx, sy, sdx, sdy;
    if (cos < 0) { sx = -1; sdx = (p.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - p.x) * ddx; }
    if (sin < 0) { sy = -1; sdy = (p.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - p.y) * ddy; }
    let side = 0, tex = 1;
    for (let i = 0; i < 64; i++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= G.map.n || my >= G.map.n) { tex = 1; break; }
      const v = G.map.m[my * G.map.n + mx]; if (v) { tex = v; break; }
    }
    let dist, wx;
    if (side === 0) { dist = (mx - p.x + (1 - sx) / 2) / cos; wx = p.y + dist * sin; }
    else { dist = (my - p.y + (1 - sy) / 2) / sin; wx = p.x + dist * cos; }
    wx -= Math.floor(wx);
    return { dist, side, tx: (wx * TEX) | 0, tex };
  }

  // ---------- update ----------
  function update(dt) {
    if (G.msgT > 0) G.msgT -= dt;
    if (G.state !== 'play') { if (G.state === 'between') { G.betweenT -= dt; if (G.betweenT <= 0) startLevel(G.level + 1); } return; }
    const p = G.player, L = LEVELS[G.level];
    // input
    let fwd = 0, strafe = 0, turn = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1; if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyA) strafe -= 1; if (keys.KeyD) strafe += 1;
    if (keys.ArrowLeft || keys.KeyQ) turn -= 1; if (keys.ArrowRight || keys.KeyE) turn += 1;
    if (touch.move) { fwd += -touch.move.dy; strafe += touch.move.dx; }
    if (touch.look) { turn += touch.look.dx * 2.2; }
    p.a += turn * p.turn * dt + mouseDX * 0.0035; mouseDX = 0;
    const cos = Math.cos(p.a), sin = Math.sin(p.a);
    const mv = Math.min(1, Math.hypot(fwd, strafe)) * p.speed * dt;
    if (mv > 0) {
      const ang = Math.atan2(strafe, fwd);
      const dx = Math.cos(p.a + ang) * mv, dy = Math.sin(p.a + ang) * mv;
      move(p, dx, dy, 0.25); G.bob += dt * 9;
    }
    // fire
    G.fireT -= dt;
    const firing = keys.ControlLeft || keys.ControlRight || keys.Space || keys.Mouse0 || touch.fire;
    if (firing && G.fireT <= 0) { G.fireT = 0.22; G.flash = 0.06; SFX.shoot(); shoot(); }
    if (G.flash > 0) G.flash -= dt;
    if (G.hurtT > 0) G.hurtT -= dt;
    // entities
    const spawnQ = [];
    for (const e of G.ents) {
      const T = TYPES[e.type]; e.t += dt;
      if (e.hitT > 0) e.hitT -= dt;
      if (!e.alive) { if (e.dieT > 0) e.dieT -= dt; continue; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      if (T.bullet) {
        const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
        if (wall(nx, ny) || e.t > 4) { e.alive = false; e.dieT = 0; e.gone = true; continue; }
        e.x = nx; e.y = ny;
        if (d < 0.4) { hurt(T.dmg); e.alive = false; e.gone = true; }
        continue;
      }
      const sees = d < 12 && los(e.x, e.y, p.x, p.y);
      if (sees) e.dir = Math.atan2(dy, dx); else if (Math.random() < dt * 0.6) e.dir += (Math.random() - 0.5) * 2;
      let sp = T.speed * (sees ? 1 : 0.5);
      if (T.boss) { sp *= (e.hp < e.maxHp * 0.4) ? 1.5 : 1; }
      if (d > 0.7) {
        const mx = Math.cos(e.dir) * sp * dt, my = Math.sin(e.dir) * sp * dt;
        const ox = e.x, oy = e.y; move(e, mx, my, 0.3);
        if (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 0.001) e.dir += (Math.random() - 0.5) * 3;
      }
      // JMP: teleport toward player every ~3.2 s if far
      if (T.jump && sees && d > 3 && e.t > 3.2) { e.t = 0; const step = Math.min(d - 1.2, 3); const nx = e.x + Math.cos(e.dir) * step, ny = e.y + Math.sin(e.dir) * step; if (!wall(nx, ny)) { e.x = nx; e.y = ny; SFX.jump(); } }
      // melee
      e.cd -= dt;
      if (d < 0.75 && e.cd <= 0) { e.cd = 1.0; hurt(T.dmg); }
      // boss: fire SELL orders, spawn MOVs
      if (T.boss) {
        e.fire = (e.fire || 0) - dt; e.spawn = (e.spawn || 0) - dt;
        if (e.fire <= 0 && sees) { e.fire = e.hp < e.maxHp * 0.4 ? 0.9 : 1.6; const b = makeEnt('SELL', e.x, e.y); const a = Math.atan2(dy, dx); b.vx = Math.cos(a) * TYPES.SELL.speed; b.vy = Math.sin(a) * TYPES.SELL.speed; spawnQ.push(b); }
        if (e.spawn <= 0) { e.spawn = 7; if (G.ents.filter(z => z.alive && z.type === 'MOV').length < 4) { spawnQ.push(makeEnt('MOV', e.x + 0.6, e.y + 0.6)); spawnQ.push(makeEnt('MOV', e.x - 0.6, e.y - 0.6)); } }
      }
    }
    G.ents.push(...spawnQ);
    G.ents = G.ents.filter(e => !e.gone);
    // win check
    const left = G.ents.filter(e => e.alive && !TYPES[e.type].bullet).length;
    if (left === 0) {
      if (L.boss) { G.state = 'win'; G.endTime = performance.now(); SFX.win(); }
      else { G.state = 'between'; G.betweenT = 2.2; say('HALTED. NOTHING HAPPENED.', 2.2); SFX.level(); }
    }
  }
  function hurt(n) { const p = G.player; p.hp -= n; G.hurtT = 0.25; SFX.hurt(); if (p.hp <= 0) { p.hp = 0; G.state = 'dead'; G.endTime = performance.now(); } }
  function shoot() {
    const p = G.player; let best = null, bd = 1e9;
    const wd = castRay(p.a).dist;
    for (const e of G.ents) {
      if (!e.alive || TYPES[e.type].bullet) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      let rel = Math.atan2(dy, dx) - p.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const half = Math.atan2(0.35 * TYPES[e.type].size, d);
      if (Math.abs(rel) < half && d < wd && d < bd) { best = e; bd = d; }
    }
    if (!best) return;
    best.hp -= 1; best.hitT = 0.12; SFX.hit();
    const T = TYPES[best.type];
    if (T.split && best.hp > 0) { const m = makeEnt('MOV', best.x, best.y); m.hp = 1; G.ents.push(m); }
    if (best.hp <= 0) { best.alive = false; best.dieT = 0.4; G.halted++; G.totalHalted += T.pts; SFX.halt(); if (T.boss) say('RUG HALTED.', 3); }
  }

  // ---------- render ----------
  function render() {
    const p = G.player;
    // ceiling / floor
    const L = LEVELS[G.level] || LEVELS[0];
    ctx.fillStyle = L.boss ? '#1a0606' : '#05070d'; ctx.fillRect(0, 0, W, VIEW_H / 2);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(${L.boss ? '60,10,10' : '10,18,30'},${0.15 + i * 0.12})`; ctx.fillRect(0, VIEW_H / 2 + i * (VIEW_H / 12), W, VIEW_H / 12 + 1); }
    if (!G.map) return;
    // walls
    const bob = Math.sin(G.bob) * 2;
    for (let x = 0; x < W; x++) {
      const a = p.a + Math.atan((x - W / 2) / (W / 2) * Math.tan(HALF));
      const r = castRay(a); const dist = r.dist * Math.cos(a - p.a); zbuf[x] = dist;
      const h = Math.min(VIEW_H * 3, (VIEW_H / Math.max(0.05, dist)) | 0);
      const top = ((VIEW_H - h) / 2 + bob) | 0;
      const tx = textures[r.tex] || textures[1];
      ctx.drawImage(tx[r.side], r.tx, 0, 1, TEX, x, top, 1, h);
      const fog = Math.min(0.85, dist / 14);
      if (fog > 0.05) { ctx.fillStyle = `rgba(0,0,0,${fog})`; ctx.fillRect(x, top, 1, h); }
    }
    // sprites sorted far → near
    const list = G.ents.map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).sort((a, b) => b.d - a.d);
    for (const { e, d } of list) {
      const T = TYPES[e.type];
      let rel = Math.atan2(e.y - p.y, e.x - p.x) - p.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > HALF + 0.5 || d < 0.2) continue;
      const dist = d * Math.cos(rel);
      const scr = (W / 2) * (1 + Math.tan(rel) / Math.tan(HALF));
      let size = (VIEW_H / dist) * T.size; if (!e.alive && e.dieT > 0) size *= 0.6 + e.dieT;
      size |= 0; if (size < 2) continue;
      const img = e.alive ? sprites[e.type].alive : sprites[e.type].halted;
      const x0 = (scr - size / 2) | 0, y0 = ((VIEW_H - size) / 2 + bob + (T.bullet ? 0 : size * 0.0)) | 0;
      const step = Math.max(1, (size / SPR) | 0);
      const alpha = e.alive ? 1 : (e.dieT > 0 ? 0.6 + e.dieT : 0.9);
      const fog = Math.min(0.8, dist / 14);
      // tint the sprite on a scratch canvas (only its opaque pixels), then draw it column by column against the z-buffer
      sctx.clearRect(0, 0, SPR, SPR); sctx.drawImage(img, 0, 0);
      if (fog > 0.05 || (e.hitT > 0 && e.alive)) {
        sctx.globalCompositeOperation = 'source-atop';
        sctx.fillStyle = (e.hitT > 0 && e.alive) ? 'rgba(255,255,255,0.55)' : `rgba(0,0,0,${fog})`;
        sctx.fillRect(0, 0, SPR, SPR); sctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = alpha;
      for (let sx = 0; sx < size; sx += step) {
        const col = x0 + sx; if (col < 0 || col >= W) continue;
        if (zbuf[col] <= dist) continue;
        const u = ((sx / size) * SPR) | 0;
        ctx.drawImage(scratch, u, 0, 1, SPR, col, y0, step, size);
      }
      ctx.globalAlpha = 1;
    }
    // weapon
    const gy = VIEW_H - 60 + Math.abs(Math.sin(G.bob)) * 4 + (G.flash > 0 ? 6 : 0);
    if (G.flash > 0) { ctx.fillStyle = '#c9fff2'; ctx.beginPath(); ctx.arc(W / 2 + 4, gy + 2, 10 + Math.random() * 6, 0, TAU); ctx.fill(); }
    ctx.drawImage(gun, (W / 2 - 44) | 0, gy | 0);
    // crosshair
    ctx.fillStyle = '#5ee0c2'; ctx.fillRect(W / 2 - 1, VIEW_H / 2 - 5, 2, 3); ctx.fillRect(W / 2 - 1, VIEW_H / 2 + 2, 2, 3); ctx.fillRect(W / 2 - 5, VIEW_H / 2 - 1, 3, 2); ctx.fillRect(W / 2 + 2, VIEW_H / 2 - 1, 3, 2);
    // hurt flash
    if (G.hurtT > 0) { ctx.fillStyle = `rgba(228,50,43,${G.hurtT * 1.6})`; ctx.fillRect(0, 0, W, VIEW_H); }
    // minimap
    if (G.minimap) drawMinimap();
  }
  function drawMinimap() {
    const m = G.map, s = 3, ox = W - m.n * s - 4, oy = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ox - 2, oy - 2, m.n * s + 4, m.n * s + 4);
    for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) if (m.m[y * m.n + x]) { ctx.fillStyle = '#3a4a6a'; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
    for (const e of G.ents) if (e.alive) { ctx.fillStyle = TYPES[e.type].color; ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 2, 2); }
    ctx.fillStyle = '#5ee0c2'; ctx.fillRect(ox + G.player.x * s - 1, oy + G.player.y * s - 1, 3, 3);
  }
  function text(s, x, y, color, size, align) {
    ctx.font = `${size || 8}px monospace`; ctx.textAlign = align || 'left'; ctx.fillStyle = color || '#e8ecf5'; ctx.fillText(s, x, y); ctx.textAlign = 'left';
  }
  function hud() {
    ctx.fillStyle = '#0b0d13'; ctx.fillRect(0, VIEW_H, W, HUD_H);
    ctx.fillStyle = '#1f2430'; ctx.fillRect(0, VIEW_H, W, 1);
    const p = G.player; if (!p) return;
    text('LIQUIDITY', 6, VIEW_H + 11, '#8a93a8', 7);
    ctx.fillStyle = '#1c2230'; ctx.fillRect(6, VIEW_H + 15, 80, 8);
    ctx.fillStyle = p.hp > 40 ? '#5ee0c2' : '#e4322b'; ctx.fillRect(6, VIEW_H + 15, (80 * p.hp / 100) | 0, 8);
    text(p.hp + '%', 90, VIEW_H + 22, '#e8ecf5', 8);
    const left = G.ents.filter(e => e.alive && !TYPES[e.type].bullet).length;
    text('NOTHING DONE', W / 2, VIEW_H + 11, '#8a93a8', 7, 'center');
    text(String(G.totalHalted), W / 2, VIEW_H + 25, '#e8ecf5', 12, 'center');
    text('RUNNING ' + left, W - 6, VIEW_H + 11, '#8a93a8', 7, 'right');
    text('NOPs ∞', W - 6, VIEW_H + 24, '#5ee0c2', 8, 'right');
    const L = LEVELS[G.level];
    if (L && L.boss) { const b = G.ents.find(e => e.type === 'RUG'); if (b && b.alive) { ctx.fillStyle = '#1c2230'; ctx.fillRect(W / 2 - 60, 6, 120, 6); ctx.fillStyle = '#e4322b'; ctx.fillRect(W / 2 - 60, 6, (120 * b.hp / b.maxHp) | 0, 6); text('RUG', W / 2, 20, '#ff9a95', 8, 'center'); } }
    if (G.msgT > 0 && G.msg) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 28, W, 16); text(G.msg, W / 2, 40, '#e8ecf5', 9, 'center'); }
  }
  function overlay() {
    ctx.fillStyle = 'rgba(3,5,10,0.82)'; ctx.fillRect(0, 0, W, H);
    if (G.state === 'title') {
      text('NOOP', W / 2, 70, '#5ee0c2', 40, 'center');
      text('Does nothing. Forever.', W / 2, 92, '#e8ecf5', 10, 'center');
      text('You are a NOOP instruction inside a CPU.', W / 2, 118, '#8a93a8', 8, 'center');
      text('Every other instruction is trying to do something. Stop it.', W / 2, 130, '#8a93a8', 8, 'center');
      text(isTouch ? 'TAP TO START' : 'CLICK OR PRESS ENTER TO START', W / 2, 158, '#e8ecf5', 9, 'center');
      text(isTouch ? 'left: move   right: look   button: halt' : 'WASD move · mouse/arrows look · click/ctrl halt · M map', W / 2, 176, '#5a6275', 7, 'center');
    } else if (G.state === 'dead') {
      text('RUGGED.', W / 2, 80, '#e4322b', 32, 'center');
      text('Your liquidity did something. It left.', W / 2, 104, '#e8ecf5', 9, 'center');
      text('Nothing done: ' + G.totalHalted + '   ·   ' + fmtTime(), W / 2, 124, '#8a93a8', 8, 'center');
      text('CLICK OR PRESS ENTER TO RETRY', W / 2, 156, '#e8ecf5', 9, 'center');
    } else if (G.state === 'win') {
      text('NOTHING HAPPENED.', W / 2, 74, '#5ee0c2', 22, 'center');
      text('YOU WIN.', W / 2, 96, '#e8ecf5', 14, 'center');
      text('Nothing done: ' + G.totalHalted + '   ·   ' + fmtTime(), W / 2, 122, '#8a93a8', 8, 'center');
      text('Every halted instruction stays halted. Forever.', W / 2, 136, '#8a93a8', 8, 'center');
      text('CLICK OR PRESS ENTER TO DO IT AGAIN', W / 2, 162, '#e8ecf5', 9, 'center');
    }
  }
  function fmtTime() { const s = ((G.endTime - G.startTime) / 1000) | 0; return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    if (G.map) { render(); hud(); } else { ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H); }
    if (G.state !== 'play' && G.state !== 'between') overlay();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const isTouch = ('ontouchstart' in window) && navigator.maxTouchPoints > 0;
  function primary() {
    audio();
    if (G.state === 'title' || G.state === 'dead' || G.state === 'win') { startGame(); return true; }
    return false;
  }
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { if (G.state === 'play') { G.state = 'title'; if (document.pointerLockElement) document.exitPointerLock(); } return; }
    if (e.code === 'Enter') { primary(); return; }
    if (e.code === 'KeyM') { G.minimap = !G.minimap; }
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('mousedown', e => {
    if (isTouch) return;
    if (primary()) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
    if (G.state === 'play') { if (!document.pointerLockElement && canvas.requestPointerLock) canvas.requestPointerLock(); keys.Mouse0 = true; }
  });
  window.addEventListener('mouseup', () => { keys.Mouse0 = false; });
  window.addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) mouseDX += e.movementX; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // touch: left half = move stick, right half = look drag; fire button element
  const active = {};
  function tpos(t) { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height }; }
  canvas.addEventListener('touchstart', e => {
    e.preventDefault(); audio();
    if (primary()) return;
    for (const t of e.changedTouches) { const p = tpos(t); active[t.identifier] = { side: p.x < 0.5 ? 'move' : 'look', sx: p.x, sy: p.y, x: p.x, y: p.y }; }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) { const a = active[t.identifier]; if (!a) continue; const p = tpos(t); a.x = p.x; a.y = p.y; }
    touch.move = null; touch.look = null;
    for (const id in active) { const a = active[id]; const dx = (a.x - a.sx) * 6, dy = (a.y - a.sy) * 6; if (a.side === 'move') touch.move = { dx: clamp(dx, -1, 1), dy: clamp(dy, -1, 1) }; else { touch.look = { dx: clamp(dx, -1.5, 1.5) }; a.sx = a.x; } }
  }, { passive: false });
  const endTouch = e => { for (const t of e.changedTouches) delete active[t.identifier]; if (!Object.keys(active).length) { touch.move = null; touch.look = null; } };
  canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
  const fireBtn = document.getElementById('fire');
  if (fireBtn) {
    fireBtn.addEventListener('touchstart', e => { e.preventDefault(); if (!primary()) touch.fire = true; }, { passive: false });
    fireBtn.addEventListener('touchend', e => { e.preventDefault(); touch.fire = false; }, { passive: false });
    if (isTouch) fireBtn.style.display = 'block';
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- boot ----------
  makeTextures(); makeSprites(); makeGun();
  G.map = genMap(LEVELS[0], 1000); G.player = newPlayer(G.map); G.ents = spawnEnts(LEVELS[0], G.map);
  requestAnimationFrame(frame);
  window.NOOP_GAME = { G, LEVELS, TYPES, startGame, keys, debug: { sprites, zbuf, textures, scratch }, step: dt => { update(dt); if (G.map) { render(); hud(); } if (G.state !== 'play' && G.state !== 'between') overlay(); } };
})();
