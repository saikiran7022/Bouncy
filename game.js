/* ============================================================
   BOUNCY BROS  —  a Bouncy Tales × Mario mash-up
   ------------------------------------------------------------
   - Bouncy Tales DNA: the hero bounces automatically; you steer
     the hops, and momentum/air-control carry you.
   - Mario DNA: side-scrolling worlds, coins, ? blocks, stompable
     enemies, a goal flag.
   Levels are built on a clean TILE GRID from structured specs,
   so every gap is provably jumpable and spacing is consistent.
   Pure vanilla JS + Canvas — no build step.
   ============================================================ */

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 960
  const H = canvas.height;  // 540

  // ---------- Feel / tuning (generous, easy to play) ----------
  const CFG = {
    gravity: 0.55,
    bounceVy: -12.4,     // automatic boing on every landing
    jumpVy: -16.4,       // boosted manual jump (clears big gaps)
    airJumpVy: -13.6,    // recovery double-jump in mid-air
    stompVy: -13.5,      // pop after stomping
    moveAccel: 1.05,
    airAccel: 0.78,      // strong air control = forgiving
    maxRunSpeed: 6.6,
    friction: 0.82,
    airDrag: 0.96,
    maxFallSpeed: 15,
    coyote: 10,          // generous landing forgiveness
    tile: 48,
  };

  // ---------- Input ----------
  const keys = { left: false, right: false, jump: false, jumpHeld: false };
  const keyMap = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "jump", ArrowUp: "jump", KeyW: "jump",
  };
  addEventListener("keydown", (e) => {
    const k = keyMap[e.code];
    if (k) {
      if (k === "jump") { if (!keys.jumpHeld) keys.jump = true; keys.jumpHeld = true; }
      else keys[k] = true;
      e.preventDefault();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "Enter" && state.mode === "title") startGame();
  });
  addEventListener("keyup", (e) => {
    const k = keyMap[e.code];
    if (k) { if (k === "jump") keys.jumpHeld = false; else keys[k] = false; e.preventDefault(); }
  });
  document.querySelectorAll(".tbtn").forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault();
      if (k === "jump") { if (!keys.jumpHeld) keys.jump = true; keys.jumpHeld = true; }
      else keys[k] = true; };
    const off = (e) => { e.preventDefault(); if (k === "jump") keys.jumpHeld = false; else keys[k] = false; };
    btn.addEventListener("touchstart", on, { passive: false });
    btn.addEventListener("touchend", off, { passive: false });
    btn.addEventListener("touchcancel", off, { passive: false });
    btn.addEventListener("mousedown", on);
    btn.addEventListener("mouseup", off);
    btn.addEventListener("mouseleave", off);
  });

  // ============================================================
  //  LEVEL SPECS  —  tile coordinates, consistent spacing.
  //  Rules that keep it easy & fair:
  //   • Ground is continuous except for explicit pits (gaps).
  //   • Every pit is <= 3 tiles wide (always clearable).
  //   • Coin arcs are auto-drawn over pits to show the jump path.
  //   • Platforms sit within an easy hop of the ground.
  //  Grid: tile = 48px. groundRow = top row of the ground band.
  // ============================================================
  const GROUND_ROW = 8;          // ground top at y = 8*48 = 384
  const SPECS = [
    {
      name: "Sunny Meadows",
      theme: "meadow",
      sky: ["#6cc6ff", "#cdeeff"],
      length: 62,
      spawn: 2,
      goal: 59,
      gaps: [{ from: 14, to: 16 }, { from: 30, to: 33 }, { from: 44, to: 46 }],
      platforms: [
        { x: 8, y: 6, w: 3 }, { x: 20, y: 5, w: 3 }, { x: 25, y: 6, w: 2 },
        { x: 36, y: 6, w: 3 }, { x: 50, y: 5, w: 3 },
      ],
      blocks: [{ x: 9, y: 4 }, { x: 21, y: 3 }, { x: 51, y: 3 }],
      coins: [{ x: 25.5, y: 4.5 }],
      coinArcs: [{ from: 14, to: 16 }, { from: 30, to: 33 }, { from: 44, to: 46 }],
      coinRows: [{ x: 4, n: 4, y: 6.5 }, { x: 36, n: 3, y: 4.5 }],
      walkers: [11, 27, 41, 54],
      flyers: [],
      spikes: [],
    },
    {
      name: "Cloud Kingdom",
      theme: "sky",
      sky: ["#8fb0ff", "#e0ecff"],
      length: 68,
      spawn: 2,
      goal: 65,
      gaps: [{ from: 12, to: 14 }, { from: 24, to: 27 }, { from: 38, to: 40 }, { from: 50, to: 53 }],
      platforms: [
        { x: 6, y: 6, w: 2 }, { x: 16, y: 5, w: 3 }, { x: 20, y: 4, w: 2 },
        { x: 30, y: 6, w: 3 }, { x: 34, y: 4, w: 2 }, { x: 43, y: 5, w: 3 },
        { x: 55, y: 6, w: 3 }, { x: 60, y: 5, w: 2 },
      ],
      blocks: [{ x: 17, y: 3 }, { x: 31, y: 4 }, { x: 56, y: 4 }],
      coins: [{ x: 20.5, y: 2.5 }, { x: 34.5, y: 2.5 }],
      coinArcs: [{ from: 12, to: 14 }, { from: 24, to: 27 }, { from: 38, to: 40 }, { from: 50, to: 53 }],
      coinRows: [{ x: 6, n: 2, y: 4.5 }, { x: 43, n: 3, y: 3.5 }],
      walkers: [9, 46, 58],
      flyers: [{ x: 22, y: 3 }, { x: 47, y: 3 }],
      spikes: [],
    },
    {
      name: "Crystal Caverns",
      theme: "cave",
      sky: ["#241845", "#4a2f7a"],
      length: 72,
      spawn: 2,
      goal: 69,
      gaps: [{ from: 18, to: 20 }, { from: 34, to: 37 }, { from: 52, to: 54 }],
      platforms: [
        { x: 7, y: 6, w: 2 }, { x: 12, y: 5, w: 2 }, { x: 24, y: 6, w: 3 },
        { x: 28, y: 4, w: 2 }, { x: 40, y: 6, w: 3 }, { x: 45, y: 5, w: 2 },
        { x: 58, y: 6, w: 3 }, { x: 63, y: 5, w: 2 },
      ],
      blocks: [{ x: 13, y: 3 }, { x: 29, y: 2 }, { x: 59, y: 4 }],
      coins: [{ x: 28.5, y: 2.5 }],
      coinArcs: [{ from: 18, to: 20 }, { from: 34, to: 37 }, { from: 52, to: 54 }],
      coinRows: [{ x: 24, n: 3, y: 4.5 }, { x: 40, n: 3, y: 4.5 }],
      walkers: [10, 31, 48, 62],
      flyers: [{ x: 22, y: 3 }, { x: 43, y: 3 }, { x: 56, y: 3 }],
      // spikes on the ground surface — hop over them
      spikes: [16, 32, 50, 66],
    },
  ];

  // ---------- Compile a spec into world objects ----------
  function compile(spec) {
    const T = CFG.tile;
    const solids = [], coins = [], enemies = [], spikes = [], blocks = [], crystals = [];
    const gy = GROUND_ROW * T;
    const isGap = (c) => spec.gaps.some((g) => c >= g.from && c < g.to);

    // continuous ground band (3 tiles tall) minus pits
    for (let c = 0; c < spec.length; c++) {
      if (!isGap(c)) solids.push({ x: c * T, y: gy, w: T, h: T * 3, kind: "ground" });
    }
    // one-way platforms
    for (const p of spec.platforms) {
      for (let i = 0; i < p.w; i++)
        solids.push({ x: (p.x + i) * T, y: p.y * T + T * 0.35, w: T, h: T * 0.45, kind: "plat" });
    }
    // ? blocks
    for (const b of spec.blocks) blocks.push({ x: b.x * T, y: b.y * T, w: T, h: T, used: false, bump: 0 });
    // explicit coins
    for (const co of (spec.coins || [])) coins.push(mkCoin(co.x * T + T / 2, co.y * T + T / 2));
    // coin rows
    for (const r of (spec.coinRows || []))
      for (let i = 0; i < r.n; i++) coins.push(mkCoin((r.x + i) * T + T / 2, r.y * T + T / 2));
    // coin arcs over pits (guide the jump)
    for (const a of (spec.coinArcs || [])) {
      const span = a.to - a.from;
      const n = span + 2;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const cx = (a.from - 0.5 + t * (span + 1)) * T + T / 2;
        const arc = Math.sin(t * Math.PI);          // parabola
        const cy = (GROUND_ROW - 0.6) * T - arc * T * 2.1;
        coins.push(mkCoin(cx, cy));
      }
    }
    // ground spikes (sit on top of ground)
    for (const sx of (spec.spikes || []))
      spikes.push({ x: sx * T, y: gy - T * 0.5, w: T, h: T * 0.5 });
    // enemies
    for (const wx of (spec.walkers || []))
      enemies.push(mkEnemy("walker", wx * T + T / 2, gy - 20));
    for (const f of (spec.flyers || []))
      enemies.push(mkEnemy("flyer", f.x * T + T / 2, f.y * T + T / 2));

    // decorative crystals / tufts along the ground for flavor
    for (let c = 1; c < spec.length; c += 1) {
      if (isGap(c)) continue;
      if (Math.random() < (spec.theme === "cave" ? 0.16 : 0.12))
        crystals.push({ x: c * T + T * 0.5, y: gy, h: 10 + Math.random() * 22, hue: Math.random() });
    }

    const width = spec.length * T;
    const height = (GROUND_ROW + 3) * T;
    const spawn = { x: spec.spawn * T + T / 2, y: gy - 60 };
    const goal = { x: spec.goal * T + T / 2, y: gy - T * 4, h: T * 4 };
    return { spec, solids, coins, enemies, spikes, blocks, crystals, spawn, goal, width, height };
  }

  function mkCoin(x, y) { return { x, y, got: false, t: Math.random() * 6 }; }
  function mkEnemy(type, x, y) {
    if (type === "walker")
      return { type, x, y, w: 42, h: 40, vx: -1.3, vy: 0, dir: -1, alive: true, squashT: 0 };
    return { type, x, y, w: 44, h: 36, vx: -1.1, vy: 0, baseY: y, t: Math.random() * 6, dir: -1, alive: true, squashT: 0 };
  }
  function mkPlayer(spawn) {
    return { x: spawn.x, y: spawn.y, w: 38, h: 44, vx: 0, vy: 0,
      onGround: false, facing: 1, squash: 1, stretch: 1, coyote: 0, airJumps: 0,
      invuln: 0, anim: 0, eyeX: 0 };
  }

  // ---------- Game state ----------
  const state = { mode: "title", levelIdx: 0, coins: 0, score: 0, lives: 3 };
  let level = null, player = null, camX = 0, frame = 0, shake = 0;
  const particles = [], ambient = [];

  function loadLevel(i) {
    state.levelIdx = i;
    level = compile(SPECS[i]);
    player = mkPlayer(level.spawn);
    camX = 0;
    particles.length = 0;
    seedAmbient(SPECS[i].theme);
    document.documentElement.style.setProperty("--sky-top", SPECS[i].sky[0]);
    document.documentElement.style.setProperty("--sky-bot", SPECS[i].sky[1]);
    updateHUD();
  }
  function seedAmbient(theme) {
    ambient.length = 0;
    const n = 46;
    for (let i = 0; i < n; i++)
      ambient.push({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random() * 1.6,
        vy: 0.2 + Math.random() * 0.7, vx: (Math.random() - 0.5) * 0.4, theme });
  }

  function startGame() {
    state.mode = "playing"; state.levelIdx = 0; state.coins = 0; state.score = 0; state.lives = 3;
    overlay.classList.add("hidden"); msgBox.classList.add("hidden"); hud.classList.remove("hidden");
    if (isTouch) touch.classList.remove("hidden");
    loadLevel(0);
  }
  function loseLife() {
    if (player.invuln > 0) return;
    state.lives--; shake = 14; spawnBurst(player.x, player.y, "#ff5a5f", 18); updateHUD();
    if (state.lives <= 0) return gameOver();
    const sp = level.spawn;
    player.x = sp.x; player.y = sp.y; player.vx = 0; player.vy = 0; player.invuln = 100; camX = 0;
  }
  function gameOver() {
    state.mode = "message";
    showMessage("Game Over", `You scored ${state.score} points.<br>Give it another bounce!`, "Try Again", startGame);
  }
  function levelClear() {
    state.mode = "message";
    state.score += 1000 + state.coins * 10;
    const last = state.levelIdx >= SPECS.length - 1;
    if (last) showMessage("YOU WIN! 🏆", `Every world bounced clean!<br>Final score: <b>${state.score}</b>`, "Play Again", startGame);
    else showMessage(`Level ${state.levelIdx + 1} Clear!`,
      `Score <b>${state.score}</b> &nbsp; 🪙 ${state.coins}<br>Next: <b>${SPECS[state.levelIdx + 1].name}</b>`,
      "Continue", () => { state.mode = "playing"; loadLevel(state.levelIdx + 1); });
  }

  // ---------- Collision ----------
  function overlaps(ax, ay, aw, ah, b) {
    return ax - aw / 2 < b.x + b.w && ax + aw / 2 > b.x &&
           ay - ah / 2 < b.y + b.h && ay + ah / 2 > b.y;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---------- Update ----------
  function update() {
    frame++;
    updateAmbient();
    if (state.mode !== "playing") return;
    const p = player;
    p.anim++;
    if (p.invuln > 0) p.invuln--;

    // steer
    const accel = p.onGround ? CFG.moveAccel : CFG.airAccel;
    if (keys.left)  { p.vx -= accel; p.facing = -1; }
    if (keys.right) { p.vx += accel; p.facing = 1; }
    if (!keys.left && !keys.right) { p.vx *= p.onGround ? CFG.friction : CFG.airDrag; if (Math.abs(p.vx) < 0.05) p.vx = 0; }
    p.vx = clamp(p.vx, -CFG.maxRunSpeed, CFG.maxRunSpeed);
    p.eyeX += (clamp(p.vx / 3, -1, 1) - p.eyeX) * 0.2;

    // jump: ground/coyote → big jump; else one air (double) jump
    if (keys.jump) {
      if (p.onGround || p.coyote > 0) {
        p.vy = CFG.jumpVy; p.onGround = false; p.coyote = 0; p.stretch = 1.4;
        spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 6);
      } else if (p.airJumps > 0) {
        p.vy = CFG.airJumpVy; p.airJumps--; p.stretch = 1.35;
        spawnRing(p.x, p.y + p.h / 2);
      }
    }
    keys.jump = false;
    if (p.coyote > 0) p.coyote--;

    // gravity + integrate
    p.vy = Math.min(p.vy + CFG.gravity, CFG.maxFallSpeed);
    p.onGround = false;
    moveX(p); moveY(p);
    p.stretch += (1 - p.stretch) * 0.2;
    p.squash += (1 - p.squash) * 0.2;

    if (p.y - p.h / 2 > level.height + 80) loseLife();

    // coins
    for (const co of level.coins) {
      if (co.got) continue;
      co.t += 0.15;
      if ((co.x - p.x) ** 2 + (co.y - p.y) ** 2 < 40 * 40) collectCoin(co);
    }
    // ? blocks
    for (const b of level.blocks) {
      if (b.bump > 0) b.bump *= 0.8;
      if (!b.used && overlaps(p.x, p.y, p.w, p.h, b) && p.vy < 0 && p.y > b.y + b.h * 0.5) {
        b.used = true; b.bump = 8; p.vy = 1;
        const co = mkCoin(b.x + CFG.tile / 2, b.y - 10); co.pop = -7; level.coins.push(co);
        spawnBurst(co.x, co.y, "#ffcc33", 10);
      }
    }
    for (const co of level.coins) {
      if (co.pop !== undefined && !co.got) { co.y += co.pop; co.pop += 0.6; if (co.pop > 6) collectCoin(co); }
    }
    // spikes
    for (const s of level.spikes) if (overlaps(p.x, p.y, p.w * 0.6, p.h * 0.85, s)) loseLife();
    // enemies + goal
    updateEnemies();
    if (level.goal && Math.abs(p.x - level.goal.x) < 42 &&
        p.y + p.h / 2 > level.goal.y && p.y - p.h / 2 < level.goal.y + level.goal.h) levelClear();

    // camera
    const target = clamp(p.x - W * 0.4, 0, Math.max(0, level.width - W));
    camX += (target - camX) * 0.12;

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.g ?? 0.3; pt.life--;
      if (pt.r2 !== undefined) pt.r2 += 1.4;
      if (pt.life <= 0) particles.splice(i, 1);
    }
    if (shake > 0.5) shake *= 0.85;
  }

  function moveX(p) {
    p.x += p.vx;
    for (const s of level.solids) {
      if (s.kind === "plat") continue;
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
      if (p.vy > 0) {
        if (s.kind === "plat" && prevBottom > s.y + 6) continue;
        p.y = s.y - p.h / 2; landGround(p);
      } else if (p.vy < 0 && s.kind !== "plat") { p.y = s.y + s.h + p.h / 2; p.vy = 0.5; }
    }
  }
  function landGround(p) {
    p.onGround = true; p.coyote = CFG.coyote; p.airJumps = 1;   // refill double-jump
    const impact = Math.min(1, Math.abs(p.vy) / 14);
    p.squash = 1 - 0.35 * impact; p.stretch = 1 + 0.25 * impact;
    p.vy = CFG.bounceVy;                                        // boing!
    if (impact > 0.4) spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 4);
  }

  function groundAt(x, yBelow) {
    for (const s of level.solids) {
      if (s.kind === "plat") continue;
      if (x > s.x && x < s.x + s.w && yBelow >= s.y - 2 && yBelow <= s.y + s.h) return true;
    }
    return false;
  }
  function updateEnemies() {
    const p = player;
    for (const e of level.enemies) {
      if (!e.alive) { e.squashT--; continue; }
      if (e.type === "walker") {
        // turn at walls AND at ledges (don't walk off into pits)
        const aheadX = e.x + e.dir * (e.w / 2 + 6);
        if (!groundAt(aheadX, e.y + e.h / 2 + 6)) { e.dir *= -1; e.vx = Math.abs(e.vx) * e.dir; }
        e.vy = Math.min(e.vy + CFG.gravity, CFG.maxFallSpeed);
        e.x += e.vx; e.vx = Math.abs(e.vx) * e.dir;
        for (const s of level.solids) {
          if (s.kind === "plat") continue;
          if (overlaps(e.x, e.y, e.w, e.h, s)) {
            if (e.vx > 0) e.x = s.x - e.w / 2; else e.x = s.x + s.w + e.w / 2;
            e.dir *= -1; e.vx = Math.abs(e.vx) * e.dir;
          }
        }
        e.y += e.vy;
        for (const s of level.solids) if (overlaps(e.x, e.y, e.w, e.h, s) && e.vy > 0) { e.y = s.y - e.h / 2; e.vy = 0; }
      } else {
        e.t += 0.05; e.x += e.vx; e.y = e.baseY + Math.sin(e.t) * 42;
        if (e.x < 60) { e.vx = Math.abs(e.vx); e.dir = 1; }
        if (e.x > level.width - 60) { e.vx = -Math.abs(e.vx); e.dir = -1; }
      }
      const box = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
      if (overlaps(p.x, p.y, p.w, p.h, box)) {
        if (p.vy > 0 && (p.y + p.h / 2) < e.y + e.h * 0.45) {
          e.alive = false; e.squashT = 18; p.vy = CFG.stompVy; p.airJumps = 1;
          state.score += 150; shake = 6; spawnBurst(e.x, e.y, "#ffd27f", 12); updateHUD();
        } else loseLife();
      }
    }
    for (let i = level.enemies.length - 1; i >= 0; i--)
      if (!level.enemies[i].alive && level.enemies[i].squashT <= 0) level.enemies.splice(i, 1);
  }

  function collectCoin(co) {
    co.got = true; state.coins++; state.score += 25; spawnBurst(co.x, co.y, "#ffcc33", 8); updateHUD();
  }

  // ---------- Particles ----------
  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.5;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: 22 + Math.random() * 16, color, r: 2 + Math.random() * 3 });
    }
  }
  function spawnRing(x, y) { particles.push({ x, y, vx: 0, vy: 0, g: 0, life: 16, color: "#ffffff", r: 6, r2: 6, ring: true }); }
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
    drawBlocks();
    drawSpikes();
    drawCoins();
    drawGoal();
    drawEnemies();
    drawParticles();
    drawPlayer();
    ctx.restore();

    drawAmbient(theme);
    drawGoalArrow();
    drawVignette();
    if (state.mode === "paused") drawPaused();
  }

  function drawSkyDecor(theme) {
    if (theme === "cave") {
      // glowing orb + sparkles
      const cx = 150, cy = 110;
      const rg = ctx.createRadialGradient(cx, cy, 6, cx, cy, 90);
      rg.addColorStop(0, "rgba(180,140,255,0.7)"); rg.addColorStop(1, "rgba(180,140,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, 7); ctx.fill();
    } else {
      // sun with soft rays
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
    const pals = {
      meadow: ["rgba(120,200,120,0.45)", "rgba(80,170,90,0.55)"],
      sky: ["rgba(255,255,255,0.5)", "rgba(210,225,255,0.6)"],
      cave: ["rgba(70,50,110,0.55)", "rgba(50,35,85,0.7)"],
    }[theme] || ["rgba(120,200,120,0.45)", "rgba(80,170,90,0.55)"];
    // far layer
    let off = camX * 0.35;
    ctx.fillStyle = pals[0];
    for (let i = -1; i < Math.ceil(W / 300) + 3; i++) {
      const bx = i * 300 - (off % 300) + camX;
      ctx.beginPath(); ctx.arc(bx + 150, H - 30, 200, Math.PI, 0); ctx.fill();
    }
    // near layer
    off = camX * 0.6;
    ctx.fillStyle = pals[1];
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
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - c.h); ctx.lineTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `hsla(${hue},90%,85%,0.9)`;
        ctx.fillRect(c.x - 1, c.y - c.h, 2, c.h);
      } else {
        // grass tufts / small flowers
        ctx.strokeStyle = theme === "sky" ? "rgba(255,255,255,0.7)" : "rgba(60,150,70,0.9)";
        ctx.lineWidth = 2;
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
      // rivets
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
        grad.addColorStop(0, "#e6ebf2"); grad.addColorStop(1, "#8a94a3");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(s.x + i * sw, s.y + s.h);
        ctx.lineTo(s.x + i * sw + sw / 2, s.y);
        ctx.lineTo(s.x + (i + 1) * sw, s.y + s.h);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#5b6472"; ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
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
      // sparkle
      if ((frame + Math.floor(co.x)) % 70 < 8) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(co.x + 6, co.y - 8, 2, 0, 7); ctx.fill();
      }
    }
  }

  function drawGoal() {
    if (!level.goal) return;
    const gx = level.goal.x, gy = level.goal.y, gh = level.goal.h;
    // base block
    ctx.fillStyle = "#caa84a"; roundRect(gx - 26, gy + gh - 6, 52, 26, 6); ctx.fill();
    // pole
    ctx.fillStyle = "#e9eef5"; ctx.fillRect(gx - 3, gy, 6, gh);
    ctx.fillStyle = "#ffcc33"; ctx.beginPath(); ctx.arc(gx, gy, 9, 0, 7); ctx.fill();
    // checkered waving flag
    const wave = Math.sin(frame * 0.15) * 5, fw = 46, fh = 30;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#ff5a5f" : "#fff";
      const px = gx + 4 + (c / 5) * fw + (c / 5) * wave;
      const py = gy + 8 + (r / 4) * fh;
      ctx.fillRect(px, py, fw / 5 + 1, fh / 4 + 1);
    }
  }

  function drawEnemies() {
    for (const e of level.enemies) {
      if (e.x + e.w < camX - 60 || e.x > camX + W + 60) continue;
      ctx.save(); ctx.translate(e.x, e.y);
      if (!e.alive) {
        ctx.fillStyle = "#7a4a8a"; ctx.beginPath();
        ctx.ellipse(0, e.h / 2 - 4, e.w / 2, 6, 0, 0, 7); ctx.fill(); ctx.restore(); continue;
      }
      if (e.type === "walker") {
        const grad = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
        grad.addColorStop(0, "#c85870"); grad.addColorStop(1, "#8d3550");
        ctx.fillStyle = grad; roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 12); ctx.fill();
        // angry brow + eyes
        eyes(e.dir, 6);
        ctx.strokeStyle = "#3a1622"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-13, -12); ctx.lineTo(-3, -8); ctx.moveTo(13, -12); ctx.lineTo(3, -8); ctx.stroke();
        const f = Math.sin(frame * 0.3) * 3;
        ctx.fillStyle = "#3a1622"; ctx.fillRect(-13, e.h / 2 - 4, 9, 6 + f); ctx.fillRect(5, e.h / 2 - 4, 9, 6 - f);
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
      if (pt.ring) {
        ctx.strokeStyle = pt.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r2, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && Math.floor(frame / 4) % 2 === 0) return;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(p.x, shadowY(p), 18, 6, 0, 0, 7); ctx.fill();

    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing * p.squash, p.stretch);
    const w = p.w, h = p.h;
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, "#ff7a7f"); body.addColorStop(1, "#e23b41");
    ctx.fillStyle = body; roundRect(-w / 2, -h / 2, w, h, 15); ctx.fill();
    ctx.fillStyle = "#ffd9cb"; roundRect(-w / 2 + 7, 2, w - 14, h / 2 - 6, 10); ctx.fill();
    // cap
    ctx.fillStyle = "#c8202a"; roundRect(-w / 2, -h / 2, w, 15, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(w / 4, -h / 2 + 7, 5, 0, 7); ctx.fill();
    // eyes (look toward motion)
    const ex = p.eyeX * 2;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(2, -h / 4, 6, 0, 7); ctx.arc(14, -h / 4, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(3 + ex, -h / 4, 3, 0, 7); ctx.arc(15 + ex, -h / 4, 3, 0, 7); ctx.fill();
    // smile
    ctx.strokeStyle = "#7a1c20"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, -h / 8 + 6, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }
  function shadowY(p) {
    let best = level.height + 40;
    for (const s of level.solids) {
      if (s.kind === "plat") continue;
      if (p.x > s.x && p.x < s.x + s.w && s.y >= p.y + p.h / 2 - 2) best = Math.min(best, s.y);
    }
    return best - 2;
  }

  function drawAmbient(theme) {
    ctx.save();
    for (const a of ambient) {
      if (theme === "cave") { ctx.fillStyle = `rgba(200,170,255,${0.25 + a.s * 0.2})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.s, 0, 7); ctx.fill(); }
      else if (theme === "sky") { ctx.fillStyle = `rgba(255,255,255,${0.35 + a.s * 0.2})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.s * 1.4, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = `rgba(255,240,170,${0.3 + a.s * 0.2})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.s, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  // little arrow pointing to the goal when it's off-screen to the right
  function drawGoalArrow() {
    if (!level.goal) return;
    const onScreen = level.goal.x - camX < W - 60;
    if (onScreen) return;
    const y = 70, x = W - 40, b = Math.sin(frame * 0.12) * 4;
    ctx.fillStyle = "rgba(255,204,51,0.9)";
    ctx.beginPath(); ctx.moveTo(x - 14 + b, y - 12); ctx.lineTo(x + b, y); ctx.lineTo(x - 14 + b, y + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,204,51,0.9)"; ctx.fillRect(x - 30 + b, y - 5, 18, 10);
    ctx.fillStyle = "#1a1f3a"; ctx.font = "bold 13px Trebuchet MS"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("🏁", x - 34 + b, y);
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  function drawPaused() {
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.font = "bold 56px Trebuchet MS"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", W / 2, H / 2 - 10);
    ctx.font = "20px Trebuchet MS"; ctx.fillText("press P to resume", W / 2, H / 2 + 36);
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
  const touch = document.getElementById("touch");
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
    b.onclick = () => { msgBox.classList.add("hidden"); cb(); };
  }
  function togglePause() {
    if (state.mode === "playing") state.mode = "paused";
    else if (state.mode === "paused") state.mode = "playing";
  }
  document.getElementById("start-btn").onclick = startGame;

  // ---------- Main loop (fixed timestep) ----------
  let acc = 0, last = performance.now();
  const STEP = 1000 / 60;
  function loop(now) {
    acc += Math.min(now - last, 100); last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
