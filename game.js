/* ============================================================
   BOUNCY BROS  —  a Bouncy Tales × Mario mash-up  (v2 "juiced")
   ------------------------------------------------------------
   Senior-dev pass adds: procedural WebAudio SFX + music, combo
   multiplier with floating score, hit-stop & screen flash,
   shield/star power-ups, checkpoints, bounce pads, moving
   platforms, camera look-ahead, per-level timer + localStorage
   best score/time, and a pause menu with mute.
   Pure vanilla JS + Canvas — no build step, no asset files.
   ============================================================ */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // ---------- Feel / tuning ----------
  const CFG = {
    gravity: 0.55,
    bounceVy: -12.4,
    jumpVy: -16.4,
    airJumpVy: -13.6,
    stompVy: -13.5,
    springVy: -20.5,      // bounce-pad launch
    moveAccel: 1.05,
    airAccel: 0.78,
    maxRunSpeed: 6.6,
    starSpeed: 8.4,
    friction: 0.82,
    airDrag: 0.96,
    maxFallSpeed: 15,
    coyote: 10,
    tile: 48,
    comboWindow: 150,     // frames a combo stays alive
    starTime: 540,        // ~9s of invincibility
  };

  // ============================================================
  //  AUDIO  —  tiny synth engine (no files). Lazily started on
  //  the first user gesture so browsers allow it.
  // ============================================================
  const Sound = (() => {
    let ac, master, music, muted = false, ready = false;
    function init() {
      if (ready) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
        music = ac.createGain(); music.gain.value = 0.5; music.connect(master);
        ready = true;
      } catch (e) { ready = false; }
    }
    function resume() { if (ready && ac.state === "suspended") ac.resume(); }
    function note(freq, dur, type = "square", vol = 0.25, slideTo = null, bus = master) {
      if (!ready || muted) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur = 0.15, vol = 0.25, hp = 700) {
      if (!ready || muted) return;
      const t = ac.currentTime, len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource(); s.buffer = buf;
      const g = ac.createGain(); g.gain.value = vol;
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }
    const seq = (notes, gap, dur, type, vol) =>
      notes.forEach((f, i) => setTimeout(() => note(f, dur, type, vol), i * gap));
    const sfx = {
      jump:  () => note(420, 0.13, "square", 0.22, 760),
      djump: () => note(560, 0.13, "triangle", 0.2, 940),
      bounce:() => note(280, 0.08, "sine", 0.14, 440),
      spring:() => seq([330, 660, 990], 45, 0.12, "square", 0.22),
      coin:  () => { note(988, 0.06, "square", 0.18); setTimeout(() => note(1319, 0.09, "square", 0.18), 55); },
      stomp: () => { noise(0.12, 0.22); note(200, 0.14, "square", 0.2, 70); },
      hurt:  () => note(300, 0.3, "sawtooth", 0.28, 80),
      power: () => seq([523, 659, 784, 1047, 1319], 65, 0.13, "square", 0.24),
      shield:() => seq([784, 988], 70, 0.16, "triangle", 0.24),
      check: () => seq([659, 988, 1319], 90, 0.14, "triangle", 0.24),
      block: () => note(170, 0.09, "square", 0.22, 110),
      win:   () => seq([523, 659, 784, 1047, 784, 1047, 1319], 110, 0.17, "square", 0.26),
      lose:  () => seq([392, 330, 262, 196], 150, 0.22, "sawtooth", 0.26),
      ui:    () => note(660, 0.07, "square", 0.18),
    };
    // ---- looping background music (frame-driven sequencer) ----
    const SCALES = {
      meadow: [392, 440, 523, 587, 659, 784],
      sky:    [440, 494, 587, 659, 740, 880],
      cave:   [294, 330, 392, 440, 523, 587],
    };
    const LEAD = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 5, 4, 2, 1, 0];
    let lead = SCALES.meadow, root = 196, tempo = 15, beat = 0, acc = 0, playing = false;
    function setTheme(th) { lead = SCALES[th] || SCALES.meadow; root = lead[0] / 2; tempo = th === "cave" ? 17 : 15; }
    function play() { playing = true; }
    function stop() { playing = false; }
    function step() {
      if (!playing || !ready || muted) return;
      if (++acc < tempo) return; acc = 0;
      const i = beat % 16;
      note(lead[LEAD[i] % lead.length], 0.16, "triangle", 0.06, null, music);
      if (i % 4 === 0) note(root, 0.24, "sine", 0.08, null, music);
      if (i % 8 === 4) note(root * 1.5, 0.18, "sine", 0.05, null, music);
      beat++;
    }
    return {
      init, resume, step, sfx, setTheme, play, stop,
      toggle() { muted = !muted; if (ready) master.gain.value = muted ? 0 : 0.5; return muted; },
      isMuted: () => muted,
    };
  })();

  // ============================================================
  //  STORAGE  —  best score & per-level best time
  // ============================================================
  const Store = {
    key: "bouncyBros.v2",
    get() { try { return JSON.parse(localStorage.getItem(this.key) || "{}"); } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem(this.key, JSON.stringify(o)); } catch (e) {} },
  };
  let best = Object.assign({ score: 0, times: {} }, Store.get());

  // ---------- Input ----------
  const keys = { left: false, right: false, jump: false, jumpHeld: false };
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
                   Space: "jump", ArrowUp: "jump", KeyW: "jump" };
  addEventListener("keydown", (e) => {
    Sound.init(); Sound.resume();
    const k = keyMap[e.code];
    if (k) { if (k === "jump") { if (!keys.jumpHeld) keys.jump = true; keys.jumpHeld = true; } else keys[k] = true; e.preventDefault(); }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyM") setMute(Sound.toggle());
    if (e.code === "KeyR" && (state.mode === "playing" || state.mode === "paused")) restartLevel();
    if (e.code === "Enter" && state.mode === "title") startGame();
  });
  addEventListener("keyup", (e) => {
    const k = keyMap[e.code];
    if (k) { if (k === "jump") keys.jumpHeld = false; else keys[k] = false; e.preventDefault(); }
  });
  document.querySelectorAll(".tbtn").forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); Sound.init(); Sound.resume();
      if (k === "jump") { if (!keys.jumpHeld) keys.jump = true; keys.jumpHeld = true; } else keys[k] = true; };
    const off = (e) => { e.preventDefault(); if (k === "jump") keys.jumpHeld = false; else keys[k] = false; };
    btn.addEventListener("touchstart", on, { passive: false });
    btn.addEventListener("touchend", off, { passive: false });
    btn.addEventListener("touchcancel", off, { passive: false });
    btn.addEventListener("mousedown", on);
    btn.addEventListener("mouseup", off);
    btn.addEventListener("mouseleave", off);
  });

  // ============================================================
  //  LEVEL SPECS (tile grid — every pit <= 3 tiles = jumpable)
  // ============================================================
  const GROUND_ROW = 8;
  const SPECS = [
    {
      name: "Sunny Meadows", theme: "meadow", sky: ["#6cc6ff", "#cdeeff"],
      length: 64, spawn: 2, goal: 61,
      gaps: [{ from: 14, to: 16 }, { from: 30, to: 33 }, { from: 46, to: 48 }],
      platforms: [{ x: 8, y: 6, w: 3 }, { x: 20, y: 5, w: 3 }, { x: 25, y: 6, w: 2 },
                  { x: 38, y: 6, w: 3 }, { x: 52, y: 5, w: 3 }],
      blocks: [{ x: 9, y: 4 }, { x: 21, y: 3 }, { x: 53, y: 3 }],
      coins: [{ x: 25.5, y: 4.5 }],
      coinArcs: [{ from: 14, to: 16 }, { from: 30, to: 33 }, { from: 46, to: 48 }],
      coinRows: [{ x: 4, n: 4, y: 6.5 }, { x: 38, n: 3, y: 4.5 }],
      walkers: [11, 27, 42, 56], flyers: [], spikes: [],
      springs: [40], checkpoints: [28],
      powerups: [{ x: 24, y: 4, type: "shield" }],
      movers: [{ x: 18, y: 5, w: 2, axis: "x", range: 2.5, speed: 0.025 }],
    },
    {
      name: "Cloud Kingdom", theme: "sky", sky: ["#8fb0ff", "#e0ecff"],
      length: 70, spawn: 2, goal: 67,
      gaps: [{ from: 12, to: 14 }, { from: 24, to: 27 }, { from: 38, to: 40 }, { from: 52, to: 55 }],
      platforms: [{ x: 6, y: 6, w: 2 }, { x: 16, y: 5, w: 3 }, { x: 20, y: 4, w: 2 },
                  { x: 32, y: 6, w: 3 }, { x: 36, y: 4, w: 2 }, { x: 45, y: 5, w: 3 },
                  { x: 58, y: 6, w: 3 }, { x: 62, y: 5, w: 2 }],
      blocks: [{ x: 17, y: 3 }, { x: 33, y: 4 }, { x: 59, y: 4 }],
      coins: [{ x: 20.5, y: 2.5 }, { x: 36.5, y: 2.5 }],
      coinArcs: [{ from: 12, to: 14 }, { from: 24, to: 27 }, { from: 38, to: 40 }, { from: 52, to: 55 }],
      coinRows: [{ x: 6, n: 2, y: 4.5 }, { x: 45, n: 3, y: 3.5 }],
      walkers: [9, 48, 60], flyers: [{ x: 22, y: 3 }, { x: 49, y: 3 }], spikes: [],
      springs: [9], checkpoints: [36],
      powerups: [{ x: 20, y: 2.5, type: "star" }],
      movers: [{ x: 30, y: 5, w: 2, axis: "x", range: 3, speed: 0.03 },
               { x: 43, y: 6, w: 2, axis: "y", range: 2, speed: 0.028 }],
    },
    {
      name: "Crystal Caverns", theme: "cave", sky: ["#241845", "#4a2f7a"],
      length: 74, spawn: 2, goal: 71,
      gaps: [{ from: 18, to: 20 }, { from: 34, to: 37 }, { from: 54, to: 56 }],
      platforms: [{ x: 7, y: 6, w: 2 }, { x: 12, y: 5, w: 2 }, { x: 24, y: 6, w: 3 },
                  { x: 28, y: 4, w: 2 }, { x: 42, y: 6, w: 3 }, { x: 47, y: 5, w: 2 },
                  { x: 60, y: 6, w: 3 }, { x: 65, y: 5, w: 2 }],
      blocks: [{ x: 13, y: 3 }, { x: 29, y: 2 }, { x: 61, y: 4 }],
      coins: [{ x: 28.5, y: 2.5 }],
      coinArcs: [{ from: 18, to: 20 }, { from: 34, to: 37 }, { from: 54, to: 56 }],
      coinRows: [{ x: 24, n: 3, y: 4.5 }, { x: 42, n: 3, y: 4.5 }],
      walkers: [10, 31, 50, 64], flyers: [{ x: 22, y: 3 }, { x: 45, y: 3 }, { x: 58, y: 3 }],
      spikes: [16, 33, 52, 68],
      springs: [24], checkpoints: [38],
      powerups: [{ x: 26, y: 3, type: "shield" }],
      movers: [{ x: 42, y: 6, w: 2, axis: "x", range: 3, speed: 0.035 }],
    },
  ];

  function compile(spec) {
    const T = CFG.tile, gy = GROUND_ROW * T;
    const solids = [], coins = [], enemies = [], spikes = [], blocks = [],
          crystals = [], springs = [], movers = [], checkpoints = [], powerups = [];
    const isGap = (c) => spec.gaps.some((g) => c >= g.from && c < g.to);

    for (let c = 0; c < spec.length; c++)
      if (!isGap(c)) solids.push({ x: c * T, y: gy, w: T, h: T * 3, kind: "ground" });
    for (const p of spec.platforms)
      for (let i = 0; i < p.w; i++)
        solids.push({ x: (p.x + i) * T, y: p.y * T + T * 0.35, w: T, h: T * 0.45, kind: "plat" });
    for (const b of spec.blocks)
      blocks.push({ x: b.x * T, y: b.y * T, w: T, h: T, used: false, bump: 0,
        gives: b.gives || "coin" });
    for (const co of (spec.coins || [])) coins.push(mkCoin(co.x * T + T / 2, co.y * T + T / 2));
    for (const r of (spec.coinRows || []))
      for (let i = 0; i < r.n; i++) coins.push(mkCoin((r.x + i) * T + T / 2, r.y * T + T / 2));
    for (const a of (spec.coinArcs || [])) {
      const span = a.to - a.from, n = span + 2;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const cx = (a.from - 0.5 + t * (span + 1)) * T + T / 2;
        const cy = (GROUND_ROW - 0.6) * T - Math.sin(t * Math.PI) * T * 2.1;
        coins.push(mkCoin(cx, cy));
      }
    }
    for (const sx of (spec.spikes || [])) spikes.push({ x: sx * T, y: gy - T * 0.5, w: T, h: T * 0.5 });
    for (const sx of (spec.springs || [])) springs.push({ x: sx * T, y: gy, w: T, c: 0 });
    for (const wx of (spec.walkers || [])) enemies.push(mkEnemy("walker", wx * T + T / 2, gy - 20));
    for (const f of (spec.flyers || [])) enemies.push(mkEnemy("flyer", f.x * T + T / 2, f.y * T + T / 2));
    for (const cx of (spec.checkpoints || []))
      checkpoints.push({ x: cx * T + T / 2, y: gy - T * 2.6, active: false });
    for (const pu of (spec.powerups || []))
      powerups.push({ x: pu.x * T + T / 2, y: pu.y * T + T / 2, type: pu.type, t: 0, got: false });
    for (const m of (spec.movers || [])) {
      const mv = { x: m.x * T, y: m.y * T + T * 0.35, w: m.w * T, h: T * 0.45, kind: "mover",
        bx: m.x * T, by: m.y * T + T * 0.35, axis: m.axis, range: m.range * T, speed: m.speed,
        phase: Math.random() * 6, dx: 0, dy: 0 };
      movers.push(mv); solids.push(mv);
    }
    for (let c = 1; c < spec.length; c++) {
      if (isGap(c)) continue;
      if (Math.random() < (spec.theme === "cave" ? 0.16 : 0.12))
        crystals.push({ x: c * T + T * 0.5, y: gy, h: 10 + Math.random() * 22, hue: Math.random() });
    }
    const width = spec.length * T, height = (GROUND_ROW + 3) * T;
    const spawn = { x: spec.spawn * T + T / 2, y: gy - 60 };
    const goal = { x: spec.goal * T + T / 2, y: gy - T * 4, h: T * 4 };
    return { spec, solids, coins, enemies, spikes, blocks, crystals, springs, movers,
      checkpoints, powerups, spawn, respawn: { ...spawn }, goal, width, height };
  }

  function mkCoin(x, y) { return { x, y, got: false, t: Math.random() * 6 }; }
  function mkEnemy(type, x, y) {
    if (type === "walker") return { type, x, y, w: 42, h: 40, vx: -1.3, vy: 0, dir: -1, alive: true, squashT: 0 };
    return { type, x, y, w: 44, h: 36, vx: -1.1, vy: 0, baseY: y, t: Math.random() * 6, dir: -1, alive: true, squashT: 0 };
  }
  function mkPlayer(sp) {
    return { x: sp.x, y: sp.y, w: 38, h: 44, vx: 0, vy: 0, onGround: false, facing: 1,
      squash: 1, stretch: 1, coyote: 0, airJumps: 0, invuln: 0, anim: 0, eyeX: 0,
      shield: false, star: 0, ride: null, dust: 0 };
  }

  // ---------- State ----------
  const state = { mode: "title", levelIdx: 0, coins: 0, score: 0, lives: 3,
    time: 0, combo: 0, comboTimer: 0 };
  let level = null, player = null, camX = 0, frame = 0, shake = 0,
      hitstop = 0, flash = 0, flashColor = "#fff", fade = 0;
  const particles = [], ambient = [], floats = [];

  function loadLevel(i) {
    state.levelIdx = i;
    level = compile(SPECS[i]);
    player = mkPlayer(level.spawn);
    camX = clamp(player.x - W * 0.4, 0, Math.max(0, level.width - W));
    particles.length = 0; floats.length = 0;
    state.combo = 0; state.comboTimer = 0; state.time = 0;
    fade = 1;
    seedAmbient(SPECS[i].theme);
    Sound.setTheme(SPECS[i].theme);
    document.documentElement.style.setProperty("--sky-top", SPECS[i].sky[0]);
    document.documentElement.style.setProperty("--sky-bot", SPECS[i].sky[1]);
    updateHUD();
  }
  function seedAmbient(theme) {
    ambient.length = 0;
    for (let i = 0; i < 46; i++)
      ambient.push({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random() * 1.6,
        vy: 0.2 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.4, theme });
  }

  function startGame() {
    state.mode = "playing"; state.levelIdx = 0; state.coins = 0; state.score = 0; state.lives = 3;
    overlay.classList.add("hidden"); msgBox.classList.add("hidden"); pauseMenu.classList.add("hidden");
    hud.classList.remove("hidden"); topbtns.classList.remove("hidden");
    if (isTouch) touch.classList.remove("hidden");
    Sound.init(); Sound.resume(); Sound.play();
    loadLevel(0);
  }
  function restartLevel() {
    if (state.mode === "paused") { state.mode = "playing"; pauseMenu.classList.add("hidden"); }
    Sound.sfx.ui(); loadLevel(state.levelIdx);
  }
  function quitToMenu() {
    state.mode = "title"; Sound.stop();
    pauseMenu.classList.add("hidden"); hud.classList.add("hidden"); topbtns.classList.add("hidden");
    touch.classList.add("hidden"); overlay.classList.remove("hidden"); refreshTitleBest();
  }

  function hurt() {
    const p = player;
    if (p.invuln > 0 || p.star > 0) return;
    state.combo = 0;
    if (p.shield) {
      p.shield = false; p.invuln = 70; flash = 0.5; flashColor = "#7fe3ff"; shake = 9; hitstop = 6;
      Sound.sfx.shield(); spawnBurst(p.x, p.y, "#7fe3ff", 18); floatText(p.x, p.y - 24, "SHIELD!", "#7fe3ff");
      return;
    }
    loseLife();
  }
  function loseLife() {
    state.lives--; shake = 16; flash = 0.6; flashColor = "#ff5a5f"; hitstop = 8;
    Sound.sfx.hurt(); spawnBurst(player.x, player.y, "#ff5a5f", 20); updateHUD();
    if (state.lives <= 0) return gameOver();
    const r = level.respawn;
    player.x = r.x; player.y = r.y; player.vx = 0; player.vy = 0;
    player.invuln = 100; player.star = 0; player.ride = null;
    camX = clamp(r.x - W * 0.4, 0, Math.max(0, level.width - W)); fade = 1;
  }
  function gameOver() {
    state.mode = "message"; Sound.stop(); Sound.sfx.lose();
    saveBest();
    showMessage("Game Over", `You scored <b>${state.score}</b>.<br>Best: ${best.score}`, "Try Again", startGame);
  }
  function levelClear() {
    state.mode = "message"; Sound.sfx.win();
    state.score += 1000 + state.coins * 10;
    const secs = Math.floor(state.time / 60);
    const prevT = best.times[state.levelIdx];
    let timeLine = `Time ${fmtTime(state.time)}`;
    if (prevT === undefined || secs < prevT) { best.times[state.levelIdx] = secs; timeLine += " ✨ new best!"; }
    saveBest();
    const last = state.levelIdx >= SPECS.length - 1;
    if (last) {
      Sound.stop();
      showMessage("YOU WIN! 🏆",
        `Every world bounced clean!<br>Final score <b>${state.score}</b><br>${timeLine}`,
        "Play Again", startGame);
    } else {
      showMessage(`Level ${state.levelIdx + 1} Clear!`,
        `Score <b>${state.score}</b> &nbsp; 🪙 ${state.coins}<br>${timeLine}<br>Next: <b>${SPECS[state.levelIdx + 1].name}</b>`,
        "Continue", () => { state.mode = "playing"; loadLevel(state.levelIdx + 1); });
    }
  }
  function saveBest() {
    if (state.score > best.score) best.score = state.score;
    Store.set(best);
  }

  // ---------- Helpers ----------
  function overlaps(ax, ay, aw, ah, b) {
    return ax - aw / 2 < b.x + b.w && ax + aw / 2 > b.x &&
           ay - ah / 2 < b.y + b.h && ay + ah / 2 > b.y;
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function springAt(x) {
    for (const s of level.springs) if (x > s.x && x < s.x + s.w) return s;
    return null;
  }
  function fmtTime(frames) {
    const s = Math.floor(frames / 60), m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // ---------- Update ----------
  function update() {
    frame++;
    Sound.step();
    updateAmbient();
    if (fade > 0) fade = Math.max(0, fade - 0.05);
    if (flash > 0) flash = Math.max(0, flash - 0.06);
    if (shake > 0.5) shake *= 0.85;
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.y += f.vy; f.vy *= 0.94; f.life--; if (f.life <= 0) floats.splice(i, 1);
    }
    updateParticles();
    if (state.mode !== "playing") return;
    if (hitstop > 0) { hitstop--; return; }

    state.time++;
    if (state.comboTimer > 0 && --state.comboTimer === 0) state.combo = 0;

    const p = player;
    p.anim++;
    if (p.invuln > 0) p.invuln--;
    if (p.star > 0) { p.star--; if (p.star === 0) Sound.setTheme(SPECS[state.levelIdx].theme); }

    // moving platforms first, then carry the rider
    updateMovers();
    if (p.ride) { p.x += p.ride.dx; p.y += p.ride.dy; p.ride = null; }

    // steer
    const cap = p.star > 0 ? CFG.starSpeed : CFG.maxRunSpeed;
    const accel = p.onGround ? CFG.moveAccel : CFG.airAccel;
    if (keys.left)  { p.vx -= accel; p.facing = -1; }
    if (keys.right) { p.vx += accel; p.facing = 1; }
    if (!keys.left && !keys.right) { p.vx *= p.onGround ? CFG.friction : CFG.airDrag; if (Math.abs(p.vx) < 0.05) p.vx = 0; }
    p.vx = clamp(p.vx, -cap, cap);
    p.eyeX += (clamp(p.vx / 3, -1, 1) - p.eyeX) * 0.2;

    // jump
    if (keys.jump) {
      if (p.onGround || p.coyote > 0) {
        p.vy = CFG.jumpVy; p.onGround = false; p.coyote = 0; p.stretch = 1.4;
        Sound.sfx.jump(); spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 6);
      } else if (p.airJumps > 0) {
        p.vy = CFG.airJumpVy; p.airJumps--; p.stretch = 1.35; Sound.sfx.djump(); spawnRing(p.x, p.y + p.h / 2);
      }
    }
    keys.jump = false;
    if (p.coyote > 0) p.coyote--;

    p.vy = Math.min(p.vy + CFG.gravity, CFG.maxFallSpeed);
    p.onGround = false;
    moveX(p); moveY(p);
    p.stretch += (1 - p.stretch) * 0.2;
    p.squash += (1 - p.squash) * 0.2;

    // run dust
    if (p.onGround && Math.abs(p.vx) > 4 && frame % 5 === 0)
      particles.push({ x: p.x - p.facing * 10, y: p.y + p.h / 2, vx: -p.facing * 0.6, vy: -0.4,
        life: 14, color: "rgba(255,255,255,0.6)", r: 2 + Math.random() * 2, g: 0.05 });

    if (p.y - p.h / 2 > level.height + 80) loseLife();

    // springs animate back
    for (const s of level.springs) if (s.c > 0) s.c *= 0.8;

    // coins
    for (const co of level.coins) {
      if (co.got) continue;
      co.t += 0.15;
      if (co.pop !== undefined) { co.y += co.pop; co.pop += 0.6; if (co.pop > 6) { collectCoin(co); continue; } }
      if ((co.x - p.x) ** 2 + (co.y - p.y) ** 2 < 40 * 40) collectCoin(co);
    }
    // ? blocks
    for (const b of level.blocks) {
      if (b.bump > 0) b.bump *= 0.8;
      if (!b.used && overlaps(p.x, p.y, p.w, p.h, b) && p.vy < 0 && p.y > b.y + b.h * 0.5) {
        b.used = true; b.bump = 8; p.vy = 1; Sound.sfx.block();
        const co = mkCoin(b.x + CFG.tile / 2, b.y - 10); co.pop = -7; level.coins.push(co);
        spawnBurst(co.x, co.y, "#ffcc33", 10);
      }
    }
    // power-ups
    for (const pu of level.powerups) {
      if (pu.got) continue;
      pu.t += 0.08;
      if (overlaps(p.x, p.y, p.w, p.h, { x: pu.x - 18, y: pu.y - 18, w: 36, h: 36 })) applyPower(pu);
    }
    // checkpoints
    for (const cp of level.checkpoints) {
      if (!cp.active && p.x > cp.x) {
        cp.active = true; level.respawn = { x: cp.x, y: GROUND_ROW * CFG.tile - 60 };
        Sound.sfx.check(); flash = 0.25; flashColor = "#aef7c0";
        floatText(cp.x, cp.y - 30, "CHECKPOINT", "#aef7c0");
        for (let i = 0; i < 14; i++) spawnBurst(cp.x, cp.y - 20, "#aef7c0", 1);
      }
    }
    // spikes
    for (const s of level.spikes) if (overlaps(p.x, p.y, p.w * 0.6, p.h * 0.85, s)) { hurt(); break; }
    // enemies + goal
    updateEnemies();
    if (level.goal && Math.abs(p.x - level.goal.x) < 42 &&
        p.y + p.h / 2 > level.goal.y && p.y - p.h / 2 < level.goal.y + level.goal.h) levelClear();

    // camera with look-ahead
    const look = p.facing * 130 + p.vx * 8;
    const target = clamp(p.x + look - W * 0.5, 0, Math.max(0, level.width - W));
    camX += (target - camX) * 0.09;
  }

  function updateMovers() {
    for (const m of level.movers) {
      m.phase += m.speed;
      const off = Math.sin(m.phase) * m.range;
      if (m.axis === "x") { const nx = m.bx + off; m.dx = nx - m.x; m.x = nx; m.dy = 0; }
      else { const ny = m.by + off; m.dy = ny - m.y; m.y = ny; m.dx = 0; }
    }
  }

  function moveX(p) {
    p.x += p.vx;
    for (const s of level.solids) {
      if (s.kind === "plat" || s.kind === "mover") continue;
      if (overlaps(p.x, p.y, p.w, p.h, s)) {
        if (p.vx > 0) p.x = s.x - p.w / 2; else if (p.vx < 0) p.x = s.x + s.w + p.w / 2;
        p.vx = 0;
      }
    }
    p.x = clamp(p.x, p.w / 2, level.width - p.w / 2);
  }
  function moveY(p) {
    const prevBottom = p.y + p.h / 2 - p.vy;
    p.y += p.vy;
    for (const s of level.solids) {
      if (!overlaps(p.x, p.y, p.w, p.h, s)) continue;
      const oneWay = s.kind === "plat" || s.kind === "mover";
      if (p.vy > 0) {
        if (oneWay && prevBottom > s.y + 6) continue;
        p.y = s.y - p.h / 2; onLand(p, s);
      } else if (p.vy < 0 && !oneWay) { p.y = s.y + s.h + p.h / 2; p.vy = 0.5; }
    }
  }
  function onLand(p, s) {
    p.onGround = true; p.coyote = CFG.coyote; p.airJumps = 1;
    if (s.kind === "mover") p.ride = s;
    const impact = Math.min(1, Math.abs(p.vy) / 14);
    p.squash = 1 - 0.35 * impact; p.stretch = 1 + 0.25 * impact;
    const spring = s.kind === "ground" ? springAt(p.x) : null;
    if (spring) {
      p.vy = CFG.springVy; spring.c = 1; p.airJumps = 1;
      Sound.sfx.spring(); spawnBurst(p.x, p.y + p.h / 2, "#9be7ff", 12);
      floatText(p.x, p.y - 20, "BOING!", "#9be7ff");
    } else {
      p.vy = CFG.bounceVy;
      if (impact > 0.5) { Sound.sfx.bounce(); spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 4); }
    }
  }

  function groundAt(x, yBelow) {
    for (const s of level.solids) {
      if (s.kind === "plat" || s.kind === "mover") continue;
      if (x > s.x && x < s.x + s.w && yBelow >= s.y - 2 && yBelow <= s.y + s.h) return true;
    }
    return false;
  }
  function updateEnemies() {
    const p = player;
    for (const e of level.enemies) {
      if (!e.alive) { e.squashT--; continue; }
      if (e.type === "walker") {
        const aheadX = e.x + e.dir * (e.w / 2 + 6);
        if (!groundAt(aheadX, e.y + e.h / 2 + 6)) { e.dir *= -1; e.vx = Math.abs(e.vx) * e.dir; }
        e.vy = Math.min(e.vy + CFG.gravity, CFG.maxFallSpeed);
        e.x += e.vx; e.vx = Math.abs(e.vx) * e.dir;
        for (const s of level.solids) {
          if (s.kind === "plat" || s.kind === "mover") continue;
          if (overlaps(e.x, e.y, e.w, e.h, s)) {
            if (e.vx > 0) e.x = s.x - e.w / 2; else e.x = s.x + s.w + e.w / 2;
            e.dir *= -1; e.vx = Math.abs(e.vx) * e.dir;
          }
        }
        e.y += e.vy;
        for (const s of level.solids) {
          if (s.kind === "mover") continue;
          if (overlaps(e.x, e.y, e.w, e.h, s) && e.vy > 0) { e.y = s.y - e.h / 2; e.vy = 0; }
        }
      } else {
        e.t += 0.05; e.x += e.vx; e.y = e.baseY + Math.sin(e.t) * 42;
        if (e.x < 60) { e.vx = Math.abs(e.vx); e.dir = 1; }
        if (e.x > level.width - 60) { e.vx = -Math.abs(e.vx); e.dir = -1; }
      }
      const box = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
      if (!overlaps(p.x, p.y, p.w, p.h, box)) continue;
      const stomping = p.vy > 0 && (p.y + p.h / 2) < e.y + e.h * 0.45;
      if (stomping || p.star > 0) {
        killEnemy(e, stomping);
      } else {
        hurt();
      }
    }
    for (let i = level.enemies.length - 1; i >= 0; i--)
      if (!level.enemies[i].alive && level.enemies[i].squashT <= 0) level.enemies.splice(i, 1);
  }
  function killEnemy(e, stomping) {
    e.alive = false; e.squashT = 18;
    const p = player;
    if (stomping) { p.vy = CFG.stompVy; p.airJumps = 1; }
    hitstop = 4; shake = 6;
    // combo
    state.combo++; state.comboTimer = CFG.comboWindow;
    const mult = state.combo;
    const gained = 150 * mult;
    state.score += gained;
    Sound.sfx.stomp();
    spawnBurst(e.x, e.y, "#ffd27f", 12);
    floatText(e.x, e.y - 16, mult > 1 ? `+${gained}  x${mult}` : `+${gained}`,
      mult > 1 ? "#ffd166" : "#ffffff");
    updateHUD();
  }

  function applyPower(pu) {
    pu.got = true;
    const p = player;
    flash = 0.4; flashColor = "#fff7cc"; Sound.sfx.power();
    for (let i = 0; i < 18; i++) spawnBurst(pu.x, pu.y, pu.type === "star" ? "#ffe066" : "#7fe3ff", 1);
    if (pu.type === "shield") { p.shield = true; floatText(p.x, p.y - 24, "SHIELD UP!", "#7fe3ff"); }
    else { p.star = CFG.starTime; p.invuln = Math.max(p.invuln, 8); floatText(p.x, p.y - 24, "INVINCIBLE!", "#ffe066"); }
    state.score += 200; updateHUD();
  }

  function collectCoin(co) {
    co.got = true; state.coins++; state.score += 25;
    state.combo = Math.max(state.combo, 1); state.comboTimer = CFG.comboWindow;
    Sound.sfx.coin(); spawnBurst(co.x, co.y, "#ffcc33", 8); updateHUD();
  }

  // ---------- Particles / floats ----------
  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.5;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: 22 + Math.random() * 16, color, r: 2 + Math.random() * 3 });
    }
  }
  function spawnRing(x, y) { particles.push({ x, y, vx: 0, vy: 0, g: 0, life: 16, color: "#fff", r: 6, r2: 6, ring: true }); }
  function floatText(x, y, text, color) { floats.push({ x, y, text, color, vy: -1.1, life: 52 }); }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.g ?? 0.3; pt.life--;
      if (pt.r2 !== undefined) pt.r2 += 1.4;
      if (pt.life <= 0) particles.splice(i, 1);
    }
  }
  function updateAmbient() {
    for (const a of ambient) {
      a.y += a.vy; a.x += a.vx + Math.sin((frame + a.x) * 0.02) * 0.2;
      if (a.y > H + 6) { a.y = -6; a.x = Math.random() * W; }
      if (a.x < -6) a.x = W + 6; if (a.x > W + 6) a.x = -6;
    }
  }

  // ============================================================
  //  RENDER
  // ============================================================
  function render() {
    const sky = SPECS[state.levelIdx]?.sky || ["#6cc6ff", "#cdeeff"];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!level) return;
    const theme = SPECS[state.levelIdx].theme;
    drawSkyDecor(theme);

    ctx.save();
    let sx = -camX, sy = 0;
    if (shake > 0.5) { sx += (Math.random() - 0.5) * shake; sy += (Math.random() - 0.5) * shake; }
    ctx.translate(sx, sy);

    drawHills(theme);
    drawCrystals(theme);
    drawSolids(theme);
    drawMovers();
    drawSprings();
    drawBlocks();
    drawSpikes();
    drawCheckpoints();
    drawCoins();
    drawPowerups();
    drawGoal();
    drawEnemies();
    drawParticles();
    drawPlayer();
    drawFloats();
    ctx.restore();

    drawAmbient(theme);
    drawCombo();
    drawGoalArrow();
    drawVignette();
    if (flash > 0.01) { ctx.globalAlpha = flash; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (fade > 0.01) { ctx.globalAlpha = fade; ctx.fillStyle = "#0a0e1e"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (state.mode === "paused") drawPausedDim();
  }

  function drawSkyDecor(theme) {
    if (theme === "cave") {
      const cx = 150, cy = 110;
      const rg = ctx.createRadialGradient(cx, cy, 6, cx, cy, 90);
      rg.addColorStop(0, "rgba(180,140,255,0.7)"); rg.addColorStop(1, "rgba(180,140,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, 7); ctx.fill();
    } else {
      const cx = W - 140, cy = 110, r = 46;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(frame * 0.002);
      ctx.fillStyle = "rgba(255,236,150,0.35)";
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillRect(-6, -r - 40, 12, 30); }
      ctx.restore();
      const rg = ctx.createRadialGradient(cx, cy, 8, cx, cy, r + 24);
      rg.addColorStop(0, "#fff7d6"); rg.addColorStop(0.6, "#ffe27a"); rg.addColorStop(1, "rgba(255,226,122,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r + 24, 0, 7); ctx.fill();
    }
  }
  function drawHills(theme) {
    const pals = { meadow: ["rgba(120,200,120,0.45)", "rgba(80,170,90,0.55)"],
      sky: ["rgba(255,255,255,0.5)", "rgba(210,225,255,0.6)"],
      cave: ["rgba(70,50,110,0.55)", "rgba(50,35,85,0.7)"] }[theme];
    let off = camX * 0.35; ctx.fillStyle = pals[0];
    for (let i = -1; i < Math.ceil(W / 300) + 3; i++) {
      const bx = i * 300 - (off % 300) + camX;
      ctx.beginPath(); ctx.arc(bx + 150, H - 30, 200, Math.PI, 0); ctx.fill();
    }
    off = camX * 0.6; ctx.fillStyle = pals[1];
    for (let i = -1; i < Math.ceil(W / 230) + 3; i++) {
      const bx = i * 230 - (off % 230) + camX;
      ctx.beginPath(); ctx.arc(bx + 115, H + 10, 165, Math.PI, 0); ctx.fill();
    }
  }
  function drawCrystals(theme) {
    for (const c of level.crystals) {
      if (c.x < camX - 40 || c.x > camX + W + 40) continue;
      if (theme === "cave") {
        const hue = 200 + c.hue * 120;
        ctx.fillStyle = `hsla(${hue},80%,70%,0.95)`;
        ctx.beginPath(); ctx.moveTo(c.x, c.y - c.h); ctx.lineTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `hsla(${hue},90%,85%,0.9)`; ctx.fillRect(c.x - 1, c.y - c.h, 2, c.h);
      } else {
        ctx.strokeStyle = theme === "sky" ? "rgba(255,255,255,0.7)" : "rgba(60,150,70,0.9)"; ctx.lineWidth = 2;
        for (let b = -1; b <= 1; b++) {
          ctx.beginPath(); ctx.moveTo(c.x + b * 4, c.y);
          ctx.quadraticCurveTo(c.x + b * 6, c.y - c.h, c.x + b * 9, c.y - c.h * 0.8); ctx.stroke();
        }
        if (c.hue > 0.6) { ctx.fillStyle = ["#ff7aa2", "#ffd166", "#9ad0ff"][Math.floor(c.hue * 3) % 3];
          ctx.beginPath(); ctx.arc(c.x, c.y - c.h, 4, 0, 7); ctx.fill(); }
      }
    }
  }
  function drawSolids(theme) {
    const dirt = theme === "cave" ? "#3a2c52" : "#9b6b3a";
    const dirt2 = theme === "cave" ? "#2c2140" : "#7d521f";
    const cap = theme === "cave" ? "#6a4f9c" : theme === "sky" ? "#cfe3ff" : "#5ec45e";
    const cap2 = theme === "cave" ? "#4f3a78" : theme === "sky" ? "#a9c8f5" : "#3ea043";
    for (const s of level.solids) {
      if (s.kind === "mover") continue;
      if (s.x + s.w < camX - 40 || s.x > camX + W + 40) continue;
      if (s.kind === "ground") {
        ctx.fillStyle = dirt; ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = dirt2;
        for (let i = 0; i < 3; i++) ctx.fillRect(s.x + 6 + i * 16, s.y + 22 + (i % 2) * 18, 6, 6);
        ctx.fillStyle = cap; ctx.fillRect(s.x, s.y, s.w, 14);
        ctx.fillStyle = cap2; ctx.fillRect(s.x, s.y + 14, s.w, 5);
      } else {
        ctx.fillStyle = theme === "cave" ? "#8a6bbf" : "#c8893f";
        roundRect(s.x, s.y, s.w, s.h, 6); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(s.x + 4, s.y + 4, s.w - 8, 4);
      }
    }
  }
  function drawMovers() {
    for (const m of level.movers) {
      if (m.x + m.w < camX - 40 || m.x > camX + W + 40) continue;
      ctx.fillStyle = "#7d8aa6"; roundRect(m.x, m.y, m.w, m.h, 6); ctx.fill();
      ctx.fillStyle = "#aab6cf"; ctx.fillRect(m.x + 4, m.y + 4, m.w - 8, 4);
      ctx.fillStyle = "#5a6680"; ctx.fillRect(m.x, m.y + m.h - 4, m.w, 4);
      // direction chevrons
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const cxm = m.x + m.w / 2, cym = m.y + m.h / 2;
      if (m.axis === "x") { tri(cxm - 10, cym, -1); tri(cxm + 10, cym, 1); }
      else { triV(cxm, cym - 6, -1); triV(cxm, cym + 6, 1); }
    }
  }
  function tri(x, y, dir) { ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + dir * 6, y); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill(); }
  function triV(x, y, dir) { ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x, y + dir * 6); ctx.lineTo(x + 5, y); ctx.closePath(); ctx.fill(); }

  function drawSprings() {
    for (const s of level.springs) {
      if (s.x + s.w < camX - 40 || s.x > camX + W + 40) continue;
      const cx = s.x + s.w / 2, top = s.y - 18 + s.c * 10;
      ctx.fillStyle = "#444b5e"; ctx.fillRect(s.x + 8, s.y - 6, s.w - 16, 8); // base
      ctx.strokeStyle = "#9be7ff"; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) { const yy = s.y - 6 - i * (12 - s.c * 6);
        ctx.moveTo(s.x + 10, yy); ctx.lineTo(s.x + s.w - 10, yy - 4); }
      ctx.stroke();
      ctx.fillStyle = "#cfeeff"; roundRect(cx - 16, top, 32, 8, 4); ctx.fill();
    }
  }
  function drawBlocks() {
    for (const b of level.blocks) {
      if (b.x + b.w < camX - 40 || b.x > camX + W + 40) continue;
      const yo = -b.bump;
      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      if (b.used) { grad.addColorStop(0, "#a98b52"); grad.addColorStop(1, "#7a6230"); }
      else { grad.addColorStop(0, "#ffcf52"); grad.addColorStop(1, "#e8950d"); }
      ctx.fillStyle = grad; roundRect(b.x + 3, b.y + 3 + yo, b.w - 6, b.h - 6, 8); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 3;
      roundRect(b.x + 3, b.y + 3 + yo, b.w - 6, b.h - 6, 8); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      [[8, 8], [b.w - 8, 8], [8, b.h - 8], [b.w - 8, b.h - 8]].forEach(([rx, ry]) =>
        { ctx.beginPath(); ctx.arc(b.x + rx, b.y + ry + yo, 2.4, 0, 7); ctx.fill(); });
      ctx.fillStyle = b.used ? "#5d491f" : "#fff"; ctx.font = "bold 28px Trebuchet MS";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.used ? "·" : "?", b.x + b.w / 2, b.y + b.h / 2 + yo + 1);
    }
  }
  function drawSpikes() {
    for (const s of level.spikes) {
      if (s.x + s.w < camX - 40 || s.x > camX + W + 40) continue;
      const n = 3, sw = s.w / n;
      for (let i = 0; i < n; i++) {
        const grad = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
        grad.addColorStop(0, "#e6ebf2"); grad.addColorStop(1, "#8a94a3"); ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(s.x + i * sw, s.y + s.h); ctx.lineTo(s.x + i * sw + sw / 2, s.y);
        ctx.lineTo(s.x + (i + 1) * sw, s.y + s.h); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#5b6472"; ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
    }
  }
  function drawCheckpoints() {
    for (const cp of level.checkpoints) {
      if (cp.x < camX - 40 || cp.x > camX + W + 40) continue;
      ctx.fillStyle = "#cfd6e2"; ctx.fillRect(cp.x - 2, cp.y, 4, CFG.tile * 2.4);
      ctx.fillStyle = cp.active ? "#43d17a" : "#9aa4b2";
      const wave = cp.active ? Math.sin(frame * 0.15) * 4 : 0;
      ctx.beginPath(); ctx.moveTo(cp.x + 2, cp.y + 4); ctx.lineTo(cp.x + 26 + wave, cp.y + 12);
      ctx.lineTo(cp.x + 2, cp.y + 22); ctx.closePath(); ctx.fill();
      if (cp.active) { ctx.fillStyle = "rgba(67,209,122,0.5)"; ctx.beginPath(); ctx.arc(cp.x, cp.y, 7, 0, 7); ctx.fill(); }
    }
  }
  function drawCoins() {
    for (const co of level.coins) {
      if (co.got) continue;
      const wob = Math.abs(Math.cos(co.t)) * 0.85 + 0.15;
      ctx.save(); ctx.translate(co.x, co.y); ctx.scale(wob, 1);
      const grad = ctx.createRadialGradient(-3, -3, 1, 0, 0, 13);
      grad.addColorStop(0, "#fff4b0"); grad.addColorStop(0.6, "#ffcc33"); grad.addColorStop(1, "#d99300");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = "#b87d00"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.stroke();
      ctx.restore();
      if ((frame + Math.floor(co.x)) % 70 < 8) { ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(co.x + 6, co.y - 8, 2, 0, 7); ctx.fill(); }
    }
  }
  function drawPowerups() {
    for (const pu of level.powerups) {
      if (pu.got) continue;
      const by = pu.y + Math.sin(pu.t) * 5;
      const glow = pu.type === "star" ? "rgba(255,224,102,0.5)" : "rgba(127,227,255,0.5)";
      const rg = ctx.createRadialGradient(pu.x, by, 2, pu.x, by, 26);
      rg.addColorStop(0, glow); rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(pu.x, by, 26, 0, 7); ctx.fill();
      if (pu.type === "star") {
        ctx.save(); ctx.translate(pu.x, by); ctx.rotate(pu.t * 0.6);
        ctx.fillStyle = "#ffe066"; star5(0, 0, 14, 6); ctx.fill();
        ctx.fillStyle = "#fff3b0"; star5(0, 0, 7, 3); ctx.fill(); ctx.restore();
      } else {
        ctx.fillStyle = "rgba(127,227,255,0.35)"; ctx.beginPath(); ctx.arc(pu.x, by, 15, 0, 7); ctx.fill();
        ctx.strokeStyle = "#7fe3ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pu.x, by, 15, 0, 7); ctx.stroke();
        ctx.fillStyle = "#eaffff"; ctx.font = "bold 16px Trebuchet MS"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🛡", pu.x, by + 1);
      }
    }
  }
  function star5(cx, cy, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rad = i % 2 ? r : R, a = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function drawGoal() {
    if (!level.goal) return;
    const gx = level.goal.x, gy = level.goal.y, gh = level.goal.h;
    ctx.fillStyle = "#caa84a"; roundRect(gx - 26, gy + gh - 6, 52, 26, 6); ctx.fill();
    ctx.fillStyle = "#e9eef5"; ctx.fillRect(gx - 3, gy, 6, gh);
    ctx.fillStyle = "#ffcc33"; ctx.beginPath(); ctx.arc(gx, gy, 9, 0, 7); ctx.fill();
    const wave = Math.sin(frame * 0.15) * 5, fw = 46, fh = 30;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#ff5a5f" : "#fff";
      ctx.fillRect(gx + 4 + (c / 5) * fw + (c / 5) * wave, gy + 8 + (r / 4) * fh, fw / 5 + 1, fh / 4 + 1);
    }
  }
  function drawEnemies() {
    for (const e of level.enemies) {
      if (e.x + e.w < camX - 60 || e.x > camX + W + 60) continue;
      ctx.save(); ctx.translate(e.x, e.y);
      if (!e.alive) { ctx.fillStyle = "#7a4a8a"; ctx.beginPath();
        ctx.ellipse(0, e.h / 2 - 4, e.w / 2, 6, 0, 0, 7); ctx.fill(); ctx.restore(); continue; }
      if (e.type === "walker") {
        const grad = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
        grad.addColorStop(0, "#c85870"); grad.addColorStop(1, "#8d3550");
        ctx.fillStyle = grad; roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 12); ctx.fill();
        eyes(e.dir, 6);
        ctx.strokeStyle = "#3a1622"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-13, -12); ctx.lineTo(-3, -8); ctx.moveTo(13, -12); ctx.lineTo(3, -8); ctx.stroke();
        const f = Math.sin(frame * 0.3) * 3; ctx.fillStyle = "#3a1622";
        ctx.fillRect(-13, e.h / 2 - 4, 9, 6 + f); ctx.fillRect(5, e.h / 2 - 4, 9, 6 - f);
      } else {
        ctx.fillStyle = "#5a6ec8"; ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 7); ctx.fill();
        const flap = Math.sin(frame * 0.4) * 11; ctx.fillStyle = "#3f4f9c";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-e.w / 2 - 8, -flap); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.w / 2 + 8, -flap); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
        eyes(e.dir, 3);
      }
      ctx.restore();
    }
  }
  function eyes(dir, yo) {
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-8, -yo, 6, 0, 7); ctx.arc(8, -yo, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath();
    ctx.arc(-8 + dir * 2, -yo, 3, 0, 7); ctx.arc(8 + dir * 2, -yo, 3, 0, 7); ctx.fill();
  }
  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / 26);
      if (pt.ring) { ctx.strokeStyle = pt.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r2, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function drawFloats() {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life / 22);
      ctx.font = "bold 20px Trebuchet MS";
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && p.star === 0 && Math.floor(frame / 4) % 2 === 0) return;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(p.x, shadowY(p), 18, 6, 0, 0, 7); ctx.fill();

    // star aura
    if (p.star > 0) {
      const hue = (frame * 8) % 360;
      ctx.globalAlpha = 0.5 + Math.sin(frame * 0.3) * 0.2;
      ctx.fillStyle = `hsl(${hue},90%,65%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 32, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      if (frame % 3 === 0) particles.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30,
        vx: 0, vy: -0.5, life: 16, color: `hsl(${hue},90%,70%)`, r: 2, g: 0 });
    }

    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing * p.squash, p.stretch);
    const w = p.w, h = p.h;
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (p.star > 0) { const hue = (frame * 8) % 360; body.addColorStop(0, `hsl(${hue},90%,70%)`); body.addColorStop(1, `hsl(${(hue + 60) % 360},90%,55%)`); }
    else { body.addColorStop(0, "#ff7a7f"); body.addColorStop(1, "#e23b41"); }
    ctx.fillStyle = body; roundRect(-w / 2, -h / 2, w, h, 15); ctx.fill();
    ctx.fillStyle = "#ffd9cb"; roundRect(-w / 2 + 7, 2, w - 14, h / 2 - 6, 10); ctx.fill();
    ctx.fillStyle = "#c8202a"; roundRect(-w / 2, -h / 2, w, 15, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(w / 4, -h / 2 + 7, 5, 0, 7); ctx.fill();
    const ex = p.eyeX * 2;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(2, -h / 4, 6, 0, 7); ctx.arc(14, -h / 4, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(3 + ex, -h / 4, 3, 0, 7); ctx.arc(15 + ex, -h / 4, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = "#7a1c20"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, -h / 8 + 6, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();

    // shield bubble
    if (p.shield) {
      ctx.strokeStyle = `rgba(127,227,255,${0.6 + Math.sin(frame * 0.2) * 0.2})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(127,227,255,0.12)"; ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, 7); ctx.fill();
    }
  }
  function shadowY(p) {
    let best2 = level.height + 40;
    for (const s of level.solids) {
      if (s.kind === "plat" || s.kind === "mover") continue;
      if (p.x > s.x && p.x < s.x + s.w && s.y >= p.y + p.h / 2 - 2) best2 = Math.min(best2, s.y);
    }
    return best2 - 2;
  }
  function drawAmbient(theme) {
    for (const a of ambient) {
      if (theme === "cave") ctx.fillStyle = `rgba(200,170,255,${0.25 + a.s * 0.2})`;
      else if (theme === "sky") ctx.fillStyle = `rgba(255,255,255,${0.35 + a.s * 0.2})`;
      else ctx.fillStyle = `rgba(255,240,170,${0.3 + a.s * 0.2})`;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.s * (theme === "sky" ? 1.4 : 1), 0, 7); ctx.fill();
    }
  }
  function drawCombo() {
    if (state.combo < 2) return;
    const t = state.comboTimer / CFG.comboWindow;
    const pop = 1 + Math.max(0, (state.comboTimer - (CFG.comboWindow - 12)) / 12) * 0.5;
    ctx.save(); ctx.translate(W / 2, 70); ctx.scale(pop, pop);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 30px Trebuchet MS";
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillText(`COMBO x${state.combo}`, 1, 1);
    ctx.fillStyle = "#ffd166"; ctx.fillText(`COMBO x${state.combo}`, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(255,209,102,0.8)"; ctx.fillRect(W / 2 - 60, 90, 120 * t, 4);
  }
  function drawGoalArrow() {
    if (!level.goal || level.goal.x - camX < W - 60) return;
    const y = 120, x = W - 40, b = Math.sin(frame * 0.12) * 4;
    ctx.fillStyle = "rgba(255,204,51,0.9)";
    ctx.beginPath(); ctx.moveTo(x - 14 + b, y - 12); ctx.lineTo(x + b, y); ctx.lineTo(x - 14 + b, y + 12); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 30 + b, y - 5, 18, 10);
    ctx.font = "13px Trebuchet MS"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("🏁", x - 34 + b, y);
  }
  function drawVignette() {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  function drawPausedDim() {
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- HUD / overlays ----------
  const overlay = document.getElementById("overlay");
  const hud = document.getElementById("hud");
  const msgBox = document.getElementById("message");
  const pauseMenu = document.getElementById("pausemenu");
  const topbtns = document.getElementById("topbtns");
  const touch = document.getElementById("touch");
  const muteBtn = document.getElementById("mute-btn");
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  function updateHUD() {
    document.getElementById("hud-coins").textContent = state.coins;
    document.getElementById("hud-lives").textContent = state.lives;
    document.getElementById("hud-score").textContent = state.score;
    document.getElementById("hud-level").textContent = state.levelIdx + 1;
  }
  function showMessage(title, body, btn, cb) {
    document.getElementById("msg-title").innerHTML = title;
    document.getElementById("msg-body").innerHTML = body;
    const b = document.getElementById("msg-btn");
    b.textContent = btn; msgBox.classList.remove("hidden");
    b.onclick = () => { Sound.sfx.ui(); msgBox.classList.add("hidden"); cb(); };
  }
  function togglePause() {
    if (state.mode === "playing") { state.mode = "paused"; pauseMenu.classList.remove("hidden"); Sound.stop(); Sound.sfx.ui(); }
    else if (state.mode === "paused") { state.mode = "playing"; pauseMenu.classList.add("hidden"); Sound.play(); Sound.sfx.ui(); }
  }
  function setMute(m) { muteBtn.textContent = m ? "🔇" : "🔊"; }
  function refreshTitleBest() {
    document.getElementById("title-best").textContent = best.score > 0 ? `Best score: ${best.score}` : "";
  }

  document.getElementById("start-btn").onclick = startGame;
  document.getElementById("resume-btn").onclick = togglePause;
  document.getElementById("restart-btn").onclick = restartLevel;
  document.getElementById("quit-btn").onclick = quitToMenu;
  muteBtn.onclick = () => { Sound.init(); setMute(Sound.toggle()); };
  document.getElementById("pause-btn").onclick = togglePause;
  refreshTitleBest();

  // ---------- Main loop ----------
  let acc = 0, last = performance.now();
  const STEP = 1000 / 60;
  function loop(now) {
    acc += Math.min(now - last, 100); last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    // live HUD bits that change every frame
    if (state.mode === "playing") document.getElementById("hud-time").textContent = fmtTime(state.time);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
