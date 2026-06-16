/* ============================================================
   BOUNCY BROS  —  a Bouncy Tales × Mario mash-up
   ------------------------------------------------------------
   - Bouncy Tales DNA: the hero bounces automatically, and you
     steer the hops; momentum and air control matter.
   - Mario DNA: side-scrolling levels, coins, stompable enemies,
     question blocks, pits, and a goal flag at the end.
   Pure vanilla JS + Canvas. No build step — just open index.html.
   ============================================================ */

(() => {
  "use strict";

  // ---------- Canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 960 internal units
  const H = canvas.height;  // 540

  // ---------- Tunables (the "feel") ----------
  const CFG = {
    gravity: 0.62,
    bounceVy: -11.2,       // auto-bounce strength when landing
    jumpVy: -15.2,         // boosted jump (space) — higher than auto bounce
    stompVy: -12.5,        // pop after stomping an enemy
    moveAccel: 0.9,        // horizontal acceleration from steering
    airAccel: 0.55,
    maxRunSpeed: 6.4,
    friction: 0.80,        // ground friction when no input
    airDrag: 0.94,
    maxFallSpeed: 16,
    coyote: 6,             // frames of forgiveness for boosted jump
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
      if (k === "jump" && !keys.jumpHeld) keys.jump = true;
      if (k === "jump") keys.jumpHeld = true;
      else keys[k] = true;
      e.preventDefault();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "Enter" && state.mode === "title") startGame();
  });
  addEventListener("keyup", (e) => {
    const k = keyMap[e.code];
    if (k) {
      if (k === "jump") keys.jumpHeld = false;
      else keys[k] = false;
      e.preventDefault();
    }
  });

  // Touch controls
  document.querySelectorAll(".tbtn").forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault();
      if (k === "jump") { if (!keys.jumpHeld) keys.jump = true; keys.jumpHeld = true; }
      else keys[k] = true; };
    const off = (e) => { e.preventDefault();
      if (k === "jump") keys.jumpHeld = false; else keys[k] = false; };
    btn.addEventListener("touchstart", on, { passive: false });
    btn.addEventListener("touchend", off, { passive: false });
    btn.addEventListener("touchcancel", off, { passive: false });
    btn.addEventListener("mousedown", on);
    btn.addEventListener("mouseup", off);
    btn.addEventListener("mouseleave", off);
  });

  // ---------- Level definitions ----------
  // Legend per row string:
  //   ' ' empty   '#' ground/brick   '='  floating platform
  //   '?' coin block (pops a coin)   'o' coin   'E' walker enemy
  //   'F' flyer enemy   '^' spike    'P' player spawn   'G' goal flag
  //   'C' cloud (decor)
  const LEVELS = [
    {
      name: "Green Hills",
      sky: ["#5fb8ff", "#bdeeff"],
      rows: [
        "                                                                                            ",
        "                                                                                            ",
        "                      C                              C                                      ",
        "                                                                                          G ",
        "              ?           o o o                                                  = = =    # ",
        "                                          ====                          o o o            # ",
        "        o o          ===            o o                    ^^                             # ",
        "   P                              E            ===              E            E            # ",
        "############     ########################      ####    ##############     ################ ",
        "############     ########################      ####    ##############     ################ ",
      ],
    },
    {
      name: "Cloud Climb",
      sky: ["#8aa0ff", "#d8e6ff"],
      rows: [
        "                                                                                            ",
        "                  o                            F                                          G ",
        "          = =        ?         o o                          = =                  o o o    # ",
        "                          = =          ^^^           = =              F                   # ",
        "     o o        F                  ===                        o o            = = =        # ",
        "                       ===                   E E                                          # ",
        "  P        ===                  o o o                   ====           E       ^^         # ",
        "#####                ######            ########                 ########          ####### ",
        "#####     ^^         ######     ####    ########      ####      ########    ####   ####### ",
        "#####################################################################################______",
      ],
    },
    {
      name: "Spike Caverns",
      sky: ["#3a2a5a", "#6a4a8a"],
      rows: [
        "                                                                                            ",
        "    P                  o o                  F           F                                 G ",
        "######       ?               === === ===              o o o                       = = =  # ",
        "             o          F                    ^^^^                  E E                    # ",
        "      ===          o o            ===                    ====                  ^^^^       # ",
        "                            E              o o o                       ===                # ",
        "  o o      ====                   ^^^^             ===          E              = = =       # ",
        "                   E                                                                      # ",
        "######    ^^^^^    #######     ^^^^    ######      ^^^^^     #######     ^^^^^    ######### ",
        "##########################################################################################",
      ],
    },
  ];

  // ---------- Game state ----------
  const state = {
    mode: "title",      // title | playing | paused | message
    levelIdx: 0,
    coins: 0,
    score: 0,
    lives: 3,
  };

  let level = null;     // parsed current level
  let player = null;
  let camX = 0;
  const particles = [];
  let frame = 0;
  let shake = 0;

  // ---------- Level parsing ----------
  function buildLevel(def) {
    const T = CFG.tile;
    const solids = [];   // {x,y,w,h, kind}
    const coins = [];
    const enemies = [];
    const spikes = [];
    const blocks = [];   // ? blocks
    const clouds = [];
    let spawn = { x: T, y: 0 };
    let goal = null;

    def.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        const x = c * T, y = r * T;
        switch (ch) {
          case "#": solids.push({ x, y, w: T, h: T, kind: "ground" }); break;
          case "=": solids.push({ x, y: y + T * 0.35, w: T, h: T * 0.4, kind: "plat" }); break;
          case "o": coins.push({ x: x + T / 2, y: y + T / 2, got: false, t: Math.random() * 6 }); break;
          case "?": blocks.push({ x, y, w: T, h: T, used: false, bump: 0 }); break;
          case "E": enemies.push(makeEnemy("walker", x + T / 2, y + T)); break;
          case "F": enemies.push(makeEnemy("flyer", x + T / 2, y + T / 2)); break;
          case "^": spikes.push({ x, y: y + T * 0.5, w: T, h: T * 0.5 }); break;
          case "C": clouds.push({ x, y: y + T / 2, s: 0.5 + Math.random() * 0.6 }); break;
          case "P": spawn = { x: x + T / 2, y: y + T / 2 }; break;
          case "G": goal = { x: x + T / 2, y, h: T * 5 }; break;
        }
      }
    });

    const width = Math.max(...def.rows.map((r) => r.length)) * T;
    const height = def.rows.length * T;
    return { def, solids, coins, enemies, spikes, blocks, clouds, spawn, goal, width, height };
  }

  function makeEnemy(type, x, y) {
    if (type === "walker")
      return { type, x, y, w: 40, h: 40, vx: -1.4, vy: 0, dir: -1, alive: true, squashT: 0 };
    // flyer hovers and bobs
    return { type, x, y, w: 42, h: 36, vx: -1.0, vy: 0, baseY: y, t: Math.random() * 6,
             dir: -1, alive: true, squashT: 0 };
  }

  function makePlayer(spawn) {
    return {
      x: spawn.x, y: spawn.y, w: 38, h: 44,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      squash: 1, stretch: 1,
      coyote: 0,
      invuln: 0,
      anim: 0,
    };
  }

  // ---------- Lifecycle ----------
  function loadLevel(i) {
    state.levelIdx = i;
    level = buildLevel(LEVELS[i]);
    player = makePlayer(level.spawn);
    camX = 0;
    particles.length = 0;
    document.documentElement.style.setProperty("--sky-top", LEVELS[i].sky[0]);
    document.documentElement.style.setProperty("--sky-bot", LEVELS[i].sky[1]);
    updateHUD();
  }

  function startGame() {
    state.mode = "playing";
    state.levelIdx = 0;
    state.coins = 0;
    state.score = 0;
    state.lives = 3;
    overlay.classList.add("hidden");
    msgBox.classList.add("hidden");
    hud.classList.remove("hidden");
    if (isTouch) touch.classList.remove("hidden");
    loadLevel(0);
  }

  function loseLife(reason) {
    if (player.invuln > 0) return;
    state.lives--;
    shake = 14;
    spawnBurst(player.x, player.y, "#ff5a5f", 18);
    updateHUD();
    if (state.lives <= 0) {
      gameOver();
    } else {
      // respawn at level start, brief invulnerability
      const sp = level.spawn;
      player.x = sp.x; player.y = sp.y;
      player.vx = 0; player.vy = 0;
      player.invuln = 90;
      camX = 0;
    }
  }

  function gameOver() {
    state.mode = "message";
    showMessage("Game Over", `You scored ${state.score} points.<br>Better luck next bounce!`, "Try Again", () => startGame());
  }

  function levelClear() {
    state.mode = "message";
    state.score += 1000 + state.coins * 10;
    const last = state.levelIdx >= LEVELS.length - 1;
    if (last) {
      showMessage("YOU WIN! 🏆",
        `All worlds bounced clean!<br>Final score: <b>${state.score}</b>`,
        "Play Again", () => startGame());
    } else {
      showMessage(`Level ${state.levelIdx + 1} Clear!`,
        `Score: <b>${state.score}</b> &nbsp; 🪙 ${state.coins}<br>Next up: <b>${LEVELS[state.levelIdx + 1].name}</b>`,
        "Continue", () => { state.mode = "playing"; loadLevel(state.levelIdx + 1); });
    }
  }

  // ---------- Collision helpers ----------
  function aabb(a, b) {
    return a.x - a.w / 2 < b.x + b.w &&
           a.x + a.w / 2 > b.x &&
           a.y - a.h / 2 < b.y + b.h &&
           a.y + a.h / 2 > b.y;
  }
  // enemy/player center-based vs tile rect
  function overlaps(ax, ay, aw, ah, b) {
    return ax - aw / 2 < b.x + b.w && ax + aw / 2 > b.x &&
           ay - ah / 2 < b.y + b.h && ay + ah / 2 > b.y;
  }

  // ---------- Update ----------
  function update() {
    frame++;
    if (state.mode !== "playing") return;

    const p = player;
    p.anim += 1;
    if (p.invuln > 0) p.invuln--;

    // --- horizontal steering ---
    const accel = p.onGround ? CFG.moveAccel : CFG.airAccel;
    if (keys.left)  { p.vx -= accel; p.facing = -1; }
    if (keys.right) { p.vx += accel; p.facing = 1; }
    if (!keys.left && !keys.right) {
      p.vx *= p.onGround ? CFG.friction : CFG.airDrag;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
    p.vx = clamp(p.vx, -CFG.maxRunSpeed, CFG.maxRunSpeed);

    // --- boosted jump (the Mario-y manual hop) ---
    if (keys.jump && (p.onGround || p.coyote > 0)) {
      p.vy = CFG.jumpVy;
      p.onGround = false;
      p.coyote = 0;
      p.stretch = 1.35;
      spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 6);
    }
    keys.jump = false;
    if (p.coyote > 0) p.coyote--;

    // --- gravity ---
    p.vy += CFG.gravity;
    p.vy = Math.min(p.vy, CFG.maxFallSpeed);

    // --- integrate + collide axis by axis ---
    p.onGround = false;
    moveX(p);
    moveY(p);

    // squash/stretch easing back to normal
    p.stretch += (1 - p.stretch) * 0.2;
    p.squash += (1 - p.squash) * 0.2;

    // --- fell in a pit ---
    if (p.y - p.h / 2 > level.height + 80) loseLife("pit");

    // --- coins ---
    for (const co of level.coins) {
      if (co.got) continue;
      co.t += 0.15;
      if (Math.hypot(co.x - p.x, co.y - p.y) < 38) collectCoin(co);
    }

    // --- ? blocks (head bump) ---
    for (const b of level.blocks) {
      if (b.bump > 0) b.bump *= 0.8;
      if (!b.used &&
          overlaps(p.x, p.y, p.w, p.h, b) &&
          p.vy < 0 && p.y > b.y + b.h * 0.5) {
        b.used = true; b.bump = 8;
        p.vy = 1; // stop upward motion
        // pop a coin out
        const co = { x: b.x + CFG.tile / 2, y: b.y - 10, got: false, t: 0, pop: -7 };
        level.coins.push(co);
        spawnBurst(co.x, co.y, "#ffcc33", 10);
      }
    }
    // coins that popped from blocks arc upward then auto-collect
    for (const co of level.coins) {
      if (co.pop !== undefined && !co.got) {
        co.y += co.pop; co.pop += 0.6;
        if (co.pop > 6) collectCoin(co);
      }
    }

    // --- spikes ---
    for (const s of level.spikes) {
      if (overlaps(p.x, p.y, p.w * 0.7, p.h * 0.9, s)) loseLife("spike");
    }

    // --- enemies ---
    updateEnemies();

    // --- goal ---
    if (level.goal && Math.abs(p.x - level.goal.x) < 40 &&
        p.y + p.h / 2 > level.goal.y && p.y - p.h / 2 < level.goal.y + level.goal.h) {
      levelClear();
    }

    // --- camera follow (smoothed, clamped) ---
    const targetCam = clamp(p.x - W * 0.4, 0, Math.max(0, level.width - W));
    camX += (targetCam - camX) * 0.12;

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.3; pt.life--;
      if (pt.life <= 0) particles.splice(i, 1);
    }

    if (shake > 0) shake *= 0.85;
  }

  function moveX(p) {
    p.x += p.vx;
    for (const s of level.solids) {
      if (s.kind === "plat") continue; // platforms: no side blocking
      if (overlaps(p.x, p.y, p.w, p.h, s)) {
        if (p.vx > 0) p.x = s.x - p.w / 2;
        else if (p.vx < 0) p.x = s.x + s.w + p.w / 2;
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
        // one-way platforms: only land if we came from above
        if (s.kind === "plat" && prevBottom > s.y + 6) continue;
        p.y = s.y - p.h / 2;
        landOnGround(p);
      } else if (p.vy < 0 && s.kind !== "plat") {
        p.y = s.y + s.h + p.h / 2;
        p.vy = 0.5;
      }
    }
  }

  function landOnGround(p) {
    // The Bouncy Tales heartbeat: landing -> auto-bounce.
    p.onGround = true;
    p.coyote = CFG.coyote;
    const impact = Math.min(1, Math.abs(p.vy) / 14);
    p.squash = 1 - 0.35 * impact;     // squish on impact
    p.stretch = 1 + 0.25 * impact;
    p.vy = CFG.bounceVy;              // boing!
    if (impact > 0.4) spawnBurst(p.x, p.y + p.h / 2, "#ffffff", 4);
  }

  function updateEnemies() {
    const p = player;
    for (const e of level.enemies) {
      if (!e.alive) { e.squashT--; continue; }

      if (e.type === "walker") {
        e.vy += CFG.gravity;
        e.vy = Math.min(e.vy, CFG.maxFallSpeed);
        // horizontal
        e.x += e.vx;
        let blocked = false;
        for (const s of level.solids) {
          if (s.kind === "plat") continue;
          if (overlaps(e.x, e.y, e.w, e.h, s)) {
            if (e.vx > 0) e.x = s.x - e.w / 2; else e.x = s.x + s.w + e.w / 2;
            blocked = true;
          }
        }
        if (blocked) { e.vx *= -1; e.dir *= -1; }
        // vertical
        e.y += e.vy;
        for (const s of level.solids) {
          if (overlaps(e.x, e.y, e.w, e.h, s) && e.vy > 0) {
            e.y = s.y - e.h / 2; e.vy = 0;
          }
        }
      } else { // flyer
        e.t += 0.05;
        e.x += e.vx;
        e.y = e.baseY + Math.sin(e.t) * 40;
        if (e.x < camX - 100 || e.x < 60) { e.vx = Math.abs(e.vx); e.dir = 1; }
        if (e.x > camX + W + 100) { e.vx = -Math.abs(e.vx); e.dir = -1; }
      }

      // collide with player
      if (overlaps(p.x, p.y, p.w, p.h, { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h })) {
        const stomping = p.vy > 0 && (p.y + p.h / 2) < e.y + e.h * 0.4;
        if (stomping) {
          e.alive = false; e.squashT = 18;
          p.vy = CFG.stompVy;
          state.score += 150;
          shake = 6;
          spawnBurst(e.x, e.y, "#ffd27f", 12);
          updateHUD();
        } else {
          loseLife("enemy");
        }
      }
    }
    // cull dead squashed enemies after their animation
    for (let i = level.enemies.length - 1; i >= 0; i--) {
      if (!level.enemies[i].alive && level.enemies[i].squashT <= 0)
        level.enemies.splice(i, 1);
    }
  }

  function collectCoin(co) {
    co.got = true;
    state.coins++;
    state.score += 25;
    spawnBurst(co.x, co.y, "#ffcc33", 8);
    updateHUD();
  }

  // ---------- Particles ----------
  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.5,
        life: 20 + Math.random() * 18,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  // ---------- Render ----------
  function render() {
    ctx.clearRect(0, 0, W, H);

    // parallax sky already via CSS bg; add gradient overlay for depth
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, LEVELS[state.levelIdx]?.sky[0] || "#5fb8ff");
    g.addColorStop(1, LEVELS[state.levelIdx]?.sky[1] || "#bdeeff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (!level) return;

    ctx.save();
    let sx = -camX, sy = 0;
    if (shake > 0.5) { sx += (Math.random() - 0.5) * shake; sy += (Math.random() - 0.5) * shake; }
    ctx.translate(sx, sy);

    drawParallax();
    drawClouds();
    drawSolids();
    drawBlocks();
    drawSpikes();
    drawCoins();
    drawGoal();
    drawEnemies();
    drawParticles();
    drawPlayer();

    ctx.restore();

    if (state.mode === "paused") drawPausedBanner();
  }

  function drawParallax() {
    // distant rolling hills, scroll slower than world
    const off = camX * 0.4;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = -1; i < 12; i++) {
      const bx = i * 320 - (off % 320);
      ctx.beginPath();
      ctx.arc(bx + 160, H - 40, 180, Math.PI, 0);
      ctx.fill();
    }
    const off2 = camX * 0.65;
    ctx.fillStyle = "rgba(60,120,60,0.25)";
    for (let i = -1; i < 14; i++) {
      const bx = i * 240 - (off2 % 240);
      ctx.beginPath();
      ctx.arc(bx + 120, H + 20, 150, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawClouds() {
    for (const c of level.clouds) cloud(c.x, c.y, c.s);
  }
  function cloud(x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, 7);
    ctx.arc(x + 28 * s, y + 6 * s, 22 * s, 0, 7);
    ctx.arc(x - 28 * s, y + 6 * s, 20 * s, 0, 7);
    ctx.arc(x, y + 14 * s, 24 * s, 0, 7);
    ctx.fill();
  }

  function drawSolids() {
    for (const s of level.solids) {
      if (s.x + s.w < camX - 40 || s.x > camX + W + 40) continue;
      if (s.kind === "ground") {
        // dirt body
        ctx.fillStyle = "#8a5a2b";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        // grass cap
        ctx.fillStyle = "#4caf50";
        ctx.fillRect(s.x, s.y, s.w, 12);
        ctx.fillStyle = "#3d8b40";
        ctx.fillRect(s.x, s.y + 12, s.w, 4);
        // brick texture lines
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      } else {
        // floating wooden platform
        ctx.fillStyle = "#c8893f";
        roundRect(s.x, s.y, s.w, s.h, 6); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(s.x + 4, s.y + 4, s.w - 8, 4);
      }
    }
  }

  function drawBlocks() {
    for (const b of level.blocks) {
      if (b.x + b.w < camX - 40 || b.x > camX + W + 40) continue;
      const yo = -b.bump;
      ctx.fillStyle = b.used ? "#9c7a3c" : "#f0a500";
      roundRect(b.x + 3, b.y + 3 + yo, b.w - 6, b.h - 6, 8); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 3;
      roundRect(b.x + 3, b.y + 3 + yo, b.w - 6, b.h - 6, 8); ctx.stroke();
      ctx.fillStyle = b.used ? "#6b5526" : "#fff";
      ctx.font = "bold 30px Trebuchet MS";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(b.used ? "·" : "?", b.x + b.w / 2, b.y + b.h / 2 + yo);
    }
  }

  function drawSpikes() {
    for (const s of level.spikes) {
      if (s.x + s.w < camX - 40 || s.x > camX + W + 40) continue;
      ctx.fillStyle = "#9aa4b2";
      const n = 3, sw = s.w / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(s.x + i * sw, s.y + s.h);
        ctx.lineTo(s.x + i * sw + sw / 2, s.y);
        ctx.lineTo(s.x + (i + 1) * sw, s.y + s.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
    }
  }

  function drawCoins() {
    for (const co of level.coins) {
      if (co.got) continue;
      const wob = Math.abs(Math.cos(co.t)) * 0.8 + 0.2; // spin
      ctx.save();
      ctx.translate(co.x, co.y);
      ctx.scale(wob, 1);
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = "#c89400"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  function drawGoal() {
    if (!level.goal) return;
    const gx = level.goal.x, gy = level.goal.y, gh = level.goal.h;
    ctx.fillStyle = "#dddddd";
    ctx.fillRect(gx - 3, gy, 6, gh);           // pole
    ctx.fillStyle = "#ffcc33";
    ctx.beginPath(); ctx.arc(gx, gy, 9, 0, 7); ctx.fill(); // top ball
    // waving flag
    const wave = Math.sin(frame * 0.15) * 6;
    ctx.fillStyle = "#ff5a5f";
    ctx.beginPath();
    ctx.moveTo(gx + 3, gy + 10);
    ctx.lineTo(gx + 46 + wave, gy + 24);
    ctx.lineTo(gx + 3, gy + 40);
    ctx.closePath(); ctx.fill();
  }

  function drawEnemies() {
    for (const e of level.enemies) {
      if (e.x + e.w < camX - 60 || e.x > camX + W + 60) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (!e.alive) {
        // squashed pancake
        ctx.fillStyle = "#7a4a8a";
        ctx.beginPath();
        ctx.ellipse(0, e.h / 2 - 4, e.w / 2, 6, 0, 0, 7);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (e.type === "walker") {
        // grumpy mushroom-ish baddie
        ctx.fillStyle = "#b5485e";
        roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 10); ctx.fill();
        ctx.fillStyle = "#7a2d3f";
        ctx.fillRect(-e.w / 2, e.h / 2 - 8, e.w, 8);  // feet shadow
        eyes(e.dir, 6);
        // little feet
        ctx.fillStyle = "#3a1622";
        const f = Math.sin(frame * 0.3) * 3;
        ctx.fillRect(-12, e.h / 2 - 4, 8, 6 + f);
        ctx.fillRect(6, e.h / 2 - 4, 8, 6 - f);
      } else {
        // flying spiky bird
        ctx.fillStyle = "#5a6ec8";
        ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 7); ctx.fill();
        const flap = Math.sin(frame * 0.4) * 10;
        ctx.fillStyle = "#3f4f9c";
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-e.w / 2 - 6, -flap); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(e.w / 2 + 6, -flap); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
        eyes(e.dir, 4);
      }
      ctx.restore();
    }
  }

  function eyes(dir, yo) {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-8, -yo, 6, 0, 7); ctx.arc(8, -yo, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-8 + dir * 2, -yo, 3, 0, 7);
    ctx.arc(8 + dir * 2, -yo, 3, 0, 7);
    ctx.fill();
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / 30);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && Math.floor(frame / 4) % 2 === 0) return; // blink
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing * p.squash, p.stretch);

    const w = p.w, h = p.h;
    // body — a bouncy round hero
    ctx.fillStyle = "#ff5a5f";
    roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill();
    // belly
    ctx.fillStyle = "#ffd5c2";
    roundRect(-w / 2 + 7, 0, w - 14, h / 2 - 4, 10); ctx.fill();
    // cap
    ctx.fillStyle = "#c8202a";
    roundRect(-w / 2, -h / 2, w, 14, 8); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(w / 4, -h / 2 + 7, 5, 0, 7); ctx.fill(); // cap emblem
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(2, -h / 4, 6, 0, 7); ctx.arc(14, -h / 4, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(4, -h / 4, 3, 0, 7); ctx.arc(16, -h / 4, 3, 0, 7); ctx.fill();
    ctx.restore();

    // shadow on ground for spatial sense
    if (level) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(p.x, findShadowY(p), 18, 6, 0, 0, 7);
      ctx.fill();
    }
  }

  function findShadowY(p) {
    let best = level.height + 40;
    for (const s of level.solids) {
      if (s.kind === "plat") continue;
      if (p.x > s.x && p.x < s.x + s.w && s.y >= p.y + p.h / 2 - 2) best = Math.min(best, s.y);
    }
    return best - 2;
  }

  function drawPausedBanner() {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 56px Trebuchet MS";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", W / 2, H / 2 - 10);
    ctx.font = "20px Trebuchet MS";
    ctx.fillText("press P to resume", W / 2, H / 2 + 36);
  }

  // ---------- Canvas helpers ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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
    b.textContent = btn;
    msgBox.classList.remove("hidden");
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
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
