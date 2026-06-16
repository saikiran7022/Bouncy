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
| Extra (boosted) jump | `Space`, `↑`, or `W` |
| Pause | `P` |
| Start | `Enter` / **PLAY** button |

On touch devices, on-screen pads appear automatically.

## 🎯 How it plays

- **You bounce on your own.** Every landing springs you back up — like
  Bouncy Tales. Your job is to *aim* the bounces with left/right and use
  the boosted jump to clear bigger gaps.
- **Stomp enemies** from above (Mario-style) to pop them; touching them
  from the side costs a life.
- **Grab coins** and smack `?` blocks from below to pop bonus coins.
- **Avoid spikes and pits.**
- **Reach the 🚩** to clear the level. Clear all three to win.

## 🗺️ Levels

1. **Green Hills** — a gentle intro to bouncing.
2. **Cloud Climb** — floating platforms and flyers.
3. **Spike Caverns** — tight hops over spike fields.

Levels are simple ASCII maps in `game.js` (`LEVELS`), so adding new ones
is easy — each character is a tile (`#` ground, `=` platform, `o` coin,
`?` block, `E`/`F` enemies, `^` spikes, `P` spawn, `G` goal).

## 📁 Files

- `index.html` — markup, HUD, overlays, touch pads
- `style.css` — layout, theming, responsive letterboxing
- `game.js` — the whole engine (input, physics, levels, rendering)

Have fun bouncing! 🟥
