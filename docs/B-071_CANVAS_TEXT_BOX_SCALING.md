# B-071 — Canvas-mode Text Box does not scale with the tile (WYSIWIS)

Report ID: B-071  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28  
Related: B-068 (canvas slider/knob/text display scaling — shared canvas stage, different paint path); B-064 (Text Box hidden-title overflow); B-055 (Text Box annotation layer)

## User symptom

Text Box in canvas mode (layout canvas / Show in canvas / F arrange, and the same face path on metamodule / screen-solo) does not take scaling into account. The tile stretches, but glyphs stay at plate absolute size.

## Repro

1. Enable **Show in canvas** on a Text Box (Display Settings).
2. Enter canvas mode (F) and resize the Text Box tile larger or smaller than the plate face.
3. Observe that the body fills the tile but the text size stays roughly the plate size (not WYSIWIS with the scaled chrome).
4. Compare with a knob/slider face on the same canvas: those use face `cqmin` and track the tile.

## Expected behavior

Text Box glyphs scale with the canvas tile the same way other module chrome does — WYSIWIS: what is visible on the plate, scaled by the tile box, is what canvas mode shows.

## Root cause

Text Box type is authored as `font-size: calc(var(--node-grid-size) * 0.36 * font-scale)` on the plate. Knobs/sliders use **container query units** (`cqmin`) on the face, so layout-canvas tile stretch scales their type automatically.

Text Box never joined that pipeline: reparenting the face into a `.node-layout-canvas-tile` changes the CSS box, but glyphs keep the workspace grid-size absolute length. That is a **separate paint path** from B-068's knob/slider geometry (not the same scale leak), so this is tracked as B-071 rather than folded into B-068.

## Fix

- Capture plate `--node-text-box-source-min` (min edge) and `--node-text-box-source-font-px` (`grid-size * 0.36`) **before** reparent (`nodeGraphTextBoxCaptureCanvasScaleSource`).
- In layout-canvas / metamodule / screen-solo contexts only, make `.node-text-box-body` a size container and size type as  
  `source-font-px * font-scale * 100cqmin / source-min`.
- Clear the capture vars on restore (`nodeGraphTextBoxClearCanvasScaleSource`) so the plate formula returns.
- Metamodule tiles now also pass `savedFaceDom` so style restore matches layout-canvas / solo.
- No audio / WASM / DSP changes.

## Files

- `public/modules/textBox/text-box-widget.js` — capture/clear helpers
- `public/styles.css` — canvas-scoped cqmin font-size
- `public/node-graph-layout-canvas.js` — capture before tile reparent
- `public/node-graph-screen-solo.js` — capture + clear on restore
- `public/modules/metamodule/metamodule-display-mirror.js` — capture + savedFaceDom

## Verify

1. Plate Text Box: text size unchanged vs before (still grid-size × textSizePercent).
2. Canvas: grow tile → glyphs grow; shrink tile → glyphs shrink; aspect stretch follows min-edge (cqmin).
3. Exit canvas / F off: plate size restored; no sticky canvas font vars.
4. Metamodule Show-in-canvas child Text Box: same tile scaling.
5. No change to audio path.
