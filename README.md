# 🎮 Bouncy Bros

A browser platformer that mashes up **Bouncy Tales** (you bounce
*automatically* and steer the hops, momentum matters) with **Mario**
(side-scrolling worlds, coins, `?` blocks, stompable enemies, pits, and a
goal flag at the end of each level).

No build step, no dependencies — pure HTML5 Canvas + vanilla JavaScript.

## ▶ Play

Just open `index.html` in any modern browser:

```bash
# from the repo root
python3 -m http.server 8000
# then visit http://localhost:8000
```

…or simply double-click `index.html`.

## 🕹️ Controls

| Action | Keys |
| --- | --- |
| Steer left / right | `←` `→` or `A` `D` |
| Jump (tap again mid-air = double-jump) | `Space`, `↑`, or `W` |
| Pause | `P` |
| Mute sound | `M` |
| Restart level | `R` |
| Start | `Enter` / **PLAY** button |

On touch devices, on-screen pads appear automatically.

## 🎯 How it plays

- **You bounce on your own.** Every landing springs you back up — like
  Bouncy Tales. Your job is to *aim* the bounces with left/right and use
  the boosted jump (and mid-air double-jump) to clear bigger gaps.
- **Chain stomps** for a **combo multiplier** — each enemy popped within
  the window is worth more, with floating score popups.
- **Grab power-ups**: 🛡️ **shield** blocks one hit, ⭐ **star** makes you
  briefly invincible (run straight through enemies).
- **Use the gadgets**: 🎪 **bounce pads** fling you sky-high, and **moving
  platforms** ferry you across.
- **Hit checkpoints** (🚩 mid-level flags) so a stumble doesn't send you
  back to the start.
- **Grab coins** and smack `?` blocks from below to pop bonus coins.
- **Reach the goal 🏁** to clear the level. Clear all three to win — and
  beat your **best score & time** (saved locally).

## ✨ Game feel

Procedural **WebAudio** sound effects + looping music (no audio files),
hit-stop on impacts, screen shake & flash, squash-and-stretch, particle
bursts, parallax backgrounds, ambient particles, and a camera that looks
ahead in the direction you're moving.

## 🗺️ Levels

1. **Sunny Meadows** — a gentle intro to bouncing.
2. **Cloud Kingdom** — floating/moving platforms and flyers.
3. **Crystal Caverns** — tight hops over spike fields.

Levels are defined as structured specs on a **tile grid** in `game.js`
(`SPECS`) and compiled by `compile()`. Every pit is guaranteed ≤ 3 tiles
(always jumpable) and coin trails arc over each gap to show the path, so
adding a balanced level is just data — `gaps`, `platforms`, `coins`,
`blocks`, `walkers`/`flyers`, `spikes`, `springs`, `movers`,
`checkpoints`, `powerups`, plus `spawn`/`goal`.

## 📁 Files

- `index.html` — markup, HUD, overlays, pause menu, touch pads
- `style.css` — layout, theming, responsive letterboxing
- `game.js` — the whole engine (audio, input, physics, levels, rendering)

Have fun bouncing! 🟥
