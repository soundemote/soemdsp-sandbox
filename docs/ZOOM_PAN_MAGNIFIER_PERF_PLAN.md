# Zoom / pan + magnifier performance plan

**Date:** 2026-08-20  
**Status:** Implemented — camera is CSS `zoom` on a clipped (workspace/zoom) box, not `transform: scale` (that path exploded the compositor layer). Magnifier freeze-all. No freeze on zoom/pan.  
**Constraint:** Planning only. Do not amend `docs/UNCONFUSE_REFACTOR_PLAN.md` or `docs/DEBUG_LOG_PERFORMANCE_PLAN.md`.

---

## Problem

Two related issues, both in scope:

1. **Graph zoom pan ~1 fps** — after zooming in, panning is unusable. Happens even when the view is only text and inlets/outlets (no phosphor, no Instant Trace). User suspects the magnifying glass; that may or may not be the cause.
2. **Magnifying glass should freeze every display** — while the glass is held, freeze phosphor, Instant Trace, **and** cheap vector faces (RoundShape and everything else). Intent: a cheap “look at the current frame” interaction, not a second live graph.

Audio / DSP must not change. Visualization freeze only.

---

## Current facts (code)

### Magnifier (`public/node-graph-magnifier.js`)

- Starts on **right-button** empty-workspace press (`beginNodeGraphMagnifier`). Ends on pointerup.
- One `workspace.cloneNode(true)` into `.node-graph-magnifier-world`, then CSS `scale(mag)` under a circular clip.
- Canvas pixels copied via `copyNodeGraphCameraWorldCanvases` (skips WebGL / phosphor / module-scope canvases by default).
- Body class `node-graph-magnifying-active` → `cursor: none` on `body *` (styles.css ~6457). That selector is only while the glass is active.
- **Does not** set `scopePaintIsFrozen` / `nodeGraphModuleScopePhosphorFrozen`. Live faces keep painting under the clone and under the real graph.

The magnifier is **not** running during a normal zoom-then-pan (middle/space/empty-drag). If 1 fps happens without RMB glass, the glass is not on the hot path.

### Graph zoom / pan

- Light path: CSS vars `--node-graph-zoom` / `--node-graph-pan-x/y` (`node-graph-viewport-perf.js` `applyNodeGraphViewportCssLight`).
- Surface (`styles.css` `.node-graph-zoom-surface`):

  - `width/height: calc(100% / var(--node-graph-zoom))`
  - `zoom: var(--node-graph-zoom)`
  - pan: `transform: translate3d(pan / zoom, 0)`

- Gestures: `skipHeavy`, hide wires/jacks on zoom (not pan), heatmap lite (grid phase only), wires frozen until pointer-up / wheel settle.
- `pixelated-canvas-zoom` at zoom ≥ 2.5 (nearest-neighbor on canvases).
- Phosphor / RoundShape **keep their own RAF** while transport is live. Gesture does **not** freeze faces.

### Freeze SSOT today

- `scopePaintIsFrozen()` in `node-graph-module-scope-paint-gate.js` = visual pause **or** engine speed 0 with live node.
- `nodeGraphModuleScopePhosphorFrozen()` is that same predicate.
- RoundShape (`modules/ellipsoid/ellipsoid-display.js`) uses its own `nodeGraphRoundShapeLivePlaying()` + RAF. It does **not** consult phosphor-frozen. LCD/LED/filter/XY/etc. similarly have independent loops.

---

## Diagnosis (why zoomed pan is 1 fps even on text)

Most likely: **CSS `zoom` on the whole zoom surface**, not the magnifier clone.

Chromium `zoom` rasterizes the subtree at the scaled size. At high zoom the compositor (or CPU raster) is filling a huge layer every pan sample even if the visible window is small. Text + outlets still sit inside that layer, so empty-looking views still tank.

Contributing (not mutually exclusive):

| Rank | Mechanism | Why it hurts zoomed pan |
|------|-----------|-------------------------|
| 1 | CSS `zoom` + full-graph layer | Giant raster / GPU fill of the entire module tree |
| 2 | Live canvas RAF while zoomed | Phosphor/WebGL/RoundShape keep drawing (required). May add GPU cost; **must not** be “fixed” by freezing on zoom |
| 3 | `will-change: transform` on `.viewport-gesturing` | Can promote an even larger layer |
| 4 | Heatmap lite still writes CSS vars every move | Cheap vs (1), keep unless profiling says otherwise |
| 5 | Magnifier `cloneNode(true)` | Only while RMB glass; duplicate DOM + leftover canvases. Not the graph-pan path |
| 6 | `body.node-graph-magnifying-active * { cursor: none }` | Only while glass; expensive universal selector, still not graph-pan |

**Do not assume the magnifier caused the zoom-pan regression.** Fix zoom compositing and freeze-while-magnifying as two workstreams. If a bisect later shows glass code on the pan path (leaked class, leaked clone), treat that as a bug in stream A.

---

## Policy

1. **Graph zoom pan must stay interactive** at high zoom on a text/outlet view. Target: pan follows the pointer (not 1 fps).
2. **Do not freeze displays during graph zoom or pan.** Phosphor, Instant Trace, RoundShape, and every other face stay live while the user zooms/pans. Gesture freeze is **rejected**.
3. **While the magnifying glass is active, freeze all displays** — phosphor, Instant Trace, residual, RoundShape, LCD, LED, filter curves, XY pads, number readouts, RGB/FBM faces, anything that has a draw loop. Snapshot = last painted frame. Audio keeps running.
4. Vector faces freeze **because** the glass is a “current frame” look, not because they are expensive. That freeze is **glass-only**.
5. Freeze **ends** when the glass ends. Do not leave residual-hold stuck (same rule as Full Stop vs pause in paint-gate). Zoom/pan must not enter that hold.
6. Magnifier must not `cloneNode` a live, still-animating graph. Prefer a frozen bitmap / already-frozen DOM.
7. Do not change DSP, jack colors, display settings, or stamp preview in this work.

---

## Workstream A — zoomed pan (graph camera)

### A1. Confirm with a cheap probe (first implement step)

Temporary, removed before merge:

- Log once per pan gesture: zoom value, `nodeGraphMagnifierIsActive()`, `document.body.classList.contains("node-graph-magnifying-active")`, whether a `.node-graph-magnifier-world` exists.
- If glass is never true during the 1 fps pan, drop magnifier from the pan theory.

### A2. ~~Stop live paints during graph pan/zoom~~ **REJECTED**

Do **not** add `nodeGraphViewportGestureActive()` to the freeze gate. Do **not** pause phosphor / traces / RoundShape / other faces because the user is zooming or panning.

Live canvas RAF while zoomed may still cost GPU, but the product rule is: **zoom and pan keep live displays**. Fix pan fps with camera compositing (A3), viewport culling, and magnifier-only freeze (B) — not by freezing the graph during zoom.

### A3. CSS zoom compositing (the likely 1 fps on text)

Investigate in this order; pick the smallest change that restores pan:

1. **Avoid promoting the whole graph as one zoomed bitmap.** Options:
   - Pan-only: keep `translate3d`; do **not** also rely on CSS `zoom` to scale a giant layer. Prefer `transform: translate3d(...) scale(zoom)` with `transform-origin: 0 0` on a 1× layout surface (layout in world px, scale in compositor). Today we **both** shrink layout (`width: 100%/zoom`) **and** apply CSS `zoom`, then divide pan by zoom — that pattern is known to rasterize large.
   - If switching to `scale()`, preserve pointer math (`nodeGraphZoom()`, pan, origin marker, heatmap phase). One SSOT for camera.
2. **While gesturing**, optionally `contain: strict` / skip non-visible modules more aggressively (`viewport-asleep` already exists). Off-screen faces should not be in the scaled layer if possible.
3. Drop `will-change: transform` if it enlarges the layer; measure before/after.
4. Do **not** solve this by lowering max zoom.

Acceptance for A: zoom in on a patch of **only** labels + jacks, pan — pointer tracking stays usable. Same after settle (wires/jacks return).

---

## Workstream B — magnifier freezes all displays

### B1. Gate

`nodeGraphMagnifierIsActive()` → `nodeGraphDisplaysFrozen() === true`.

**Not** viewport pan/zoom. The helper must be false during a normal zoom/pan gesture.

Wire into `scopePaintIsFrozen` **or** a wider display-hold used by every face loop (preferred: one function, many callers).

Begin glass: freeze **before** clone (so clone captures a still frame).  
End glass: unfreeze; next live tick resumes (no force-repaint storm; normal FPS clocks).

### B2. What “freeze” means per drawer

| Drawer | Hold |
|--------|------|
| Phosphor energy-GL | no new deposits; residual stays |
| Instant Trace | no rewrite; last strokes stay |
| RoundShape | cancel playhead RAF; last canvas bitmap |
| LCD / LED / number / filter / XY / RGB / FBM / etc. | skip draw unless `force` |
| Wires / heatmap | unchanged except existing gesture rules (glass is not a pan) |

Do **not** call Clear / wipe. Do **not** resize canvases.

### B3. Magnifier clone cost

After freeze:

- Keep clone-of-DOM **or** replace with a single `drawWindow`/offscreen snapshot of the workspace. Prefer **not** cloning live canvases that then keep compositing.
- If DOM clone stays: skip expensive canvases (already) **and** skip cloning `.node-module-scope-*` WebGL wrappers; show the 2D fallback bitmap if present.
- Do not copy pixels every `pointermove`. Layout = CSS transform of the one clone (`applyNodeGraphMagnifierLayout` already does this).

### B4. Cursor CSS

`body.node-graph-magnifying-active * { cursor: none !important; }` is a universal rule. Narrow to `body.node-graph-magnifying-active, body.node-graph-magnifying-active .node-graph-workspace, …` if we touch that file. Not the 1 fps pan fix.

---

## Files (expected)

| File | Role |
|------|------|
| `public/node-graph-module-scope-paint-gate.js` | `nodeGraphDisplaysFrozen` — **magnifier only**, not zoom/pan |
| `public/node-graph-magnifier.js` | freeze on begin, unfreeze on end; clone after freeze |
| `public/node-graph-viewport-perf.js` | camera/heatmap only; **do not** freeze faces on gesture |
| `public/node-graph-workspace-zoom.js` / `workspace-view.js` | camera CSS if A3 changes zoom/pan |
| `public/styles.css` | `.node-graph-zoom-surface` camera; magnifier cursor |
| `public/modules/ellipsoid/ellipsoid-display.js` | RoundShape respects display-frozen |
| Other face RAF schedulers (LCD, LED, filter, …) | same helper — grep for `requestAnimationFrame` + `LivePlaying` |

Grep for draw loops that **do not** call `scopePaintIsFrozen` and add the helper. Incomplete freeze = RoundShape still spinning under the glass.

---

## Verification (implement pass)

1. **Pan at high zoom, text/outlets only** — no glass. Must not be ~1 fps.
2. **Pan / zoom at high zoom over phosphor** — displays **keep drawing** the whole gesture. Must not freeze. Pan still usable.
3. **Hold magnifying glass** — all faces frozen (phosphor residual + RoundShape orbit + traces). Move the glass; still frozen. Release; live again.
4. Glass over empty workspace vs over a module — freeze is global, not hover-based.
5. Visual pause / engine pause still freeze after glass ends (no double-unfreeze bug).
6. Full Stop still cold-boots plates (existing paint-gate rule).
7. Wires/jacks still hide during **zoom** gesture and return on settle.
8. No DSP / param / audio change.

---

## Out of scope

- Stamp preview, Dot Budget, display-settings clipboard, jack RGB, debug console.
- Replacing CSS zoom with a camera canvas (full WebGL world) unless A3 `scale()` is not enough.
- Changing magnifier optics (mag limits, rim, size sliders).

---

## Suggested implement order

1. B1 + B2 — freeze-all while glass only (not zoom/pan).
2. A1 probe if needed (is glass class leaked during pan?).
3. A3 — CSS camera (`scale` vs `zoom`) — this is the zoomed-pan fix; A2 is not used.
4. B3 clone cheapening.
5. B4 cursor selector if touching CSS anyway.

Do not implement until granted.
