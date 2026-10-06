# Display Shader Plan

**Status:** plan only. Nothing built. Do not start an item until Argi says go.

**Date:** 2026-10-06. Source: Argi via LibraryCode.

**Related:** `docs/APP_POLICY.md` (no JS DSP, no GPU audio, no worklet / JS special cases); `docs/BUG_PLAN.md` → **Cleanup** → **C-001** (JS DSP removal; overlaps P0e-1); `docs/SCOPE_PAINT_SIMPLIFICATION_PLAN.md`; `docs/FUTURE_PLANNING.md` §Display shaders.

---

## How to update this file

- Agents and Argi change the **Status** cell of a row and add a dated note in **Notes** (e.g. `2026-10-07 LibraryCode: shared context landed for Phosphor + Trace`). Set **Owner** when you start.
- Status values: **Not started** / **In progress** / **Done** / **Dropped**. Dropped needs a one-line reason in Notes.
- Do not delete rows. Add new rows with the next free ID.
- **Argi commits.** Agents edit locally and do not commit or push.

---

## Goal

Move the per-pixel math that JavaScript does today into GLSL fragment shaders. This is not about faster drawing calls: the per-pixel work itself moves to the GPU. Every display shares **one** WebGL context.

Audio stays native C++/WASM and never runs on the GPU. This is consistent with `docs/APP_POLICY.md`: no JS DSP, no GPU audio.

---

## Rules

- Per APP_POLICY: no worklet or JS special cases. The display reads what the native engine already publishes; it never computes or re-simulates audio.
- The face / patch drives the display. A shader is a renderer for a face's settings, not a new source of truth for them.
- **The shared context is mandatory for every new GL face.** No new `getContext("webgl")` per canvas.
- Audio never runs on the GPU (no WebGPU/WebGL audio kernels).
- Line numbers below are from Argi's uncommitted tree as of 2026-10-06 and may drift. Re-check before editing.

Size key: **S** = small, **M** = medium, **L** = large (combinations like S-M mean between the two).

---

## What uses shaders today

15 WebGL1 programs. No WebGL2 anywhere.

| Display | File | Context |
|---------|------|---------|
| Phosphor | `public/lib/phosphor/phosphor-energy-gl.js` | shared |
| Trace | `public/lib/trace/trace-woscope.js`, `trace-stroke.js`, `trace-tape.js` | shared contexts |
| Vector RGB | `public/lib/trace/trace-rgb-points.js` | one context **per face** |
| Basic Shape / Sin/Cos / Softwave | `public/lib/visual/cycle-line-gl.js` | one per canvas, **no fallback** |
| Picture | `public/lib/visual/picture-device.js` | shared 4096×4096 canvas (about 64 MB). Image Ghost, Soft Fractal and fbm Field draw through it |
| Matrix | `public/modules/asciiscope/asciiscope-gl.js` | one per canvas |
| Waterfall | `public/node-graph-module-scope-waterfall-gl.js` | one per canvas |
| Others | `public/node-graph-module-scope-webgl.js` (overlay), `public/node-graph-room-dimmer.js`, legacy `public/node-graph-module-scope-draw-burn.js` | — |
| WebGPU | `public/node-graph-gpu-additive-backend.js` | for the retired `gpuAdditiveOsc`. Its script still loads |

---

## Phase 0: infrastructure and risk

- **P0a. One shared WebGL context for every display.** About 7 contexts are always open, plus one per Basic Shape / SinCos / Softwave / Matrix / Waterfall / Vector RGB face. Past about 16, Chrome evicts the oldest contexts (the shared ones), and those can keep evicting each other.
- **P0b. Vector RGB recompiles its shaders every frame** once there are 2+ faces (`trace-rgb-points.js:53-83`, `109-117`). Fix.
- **P0c. Stop the shared canvas being resized on each present** (`phosphor-energy-gl.js:1727`, `trace-woscope.js:609`, `trace-stroke.js:382`). Use grow-only sizing or a scissor rect.
- **P0d. Consider merging the shared devices into one WebGL2 context.** Decision item.
- **P0e. Cleanups** (separate tracker rows):
  - P0e-1: remove the retired WebGPU oscillator script and its JS DSP fallback. It is JS DSP, so it is also part of C-001 in `docs/BUG_PLAN.md`.
  - P0e-2: free the boot GPU probe context (`boot-loading.js:219`).
  - P0e-3: delete the stray `_fs_aug2.glsl` (repo root).
  - P0e-4: remove dead functions `nodeGraphPhosphorMapEnergyToColorCanvas`, `nodeGraphNumberReadoutPresentBurnPlate`, `paintNodeGraphPhosphorLiveStampOverlay`.

## Migration items (ranked)

- **M1. Spectrogram** (`spectrogram-display.js:536`). Today: per-pixel `fillRect` plus rgb strings. Move to a looping magnitude texture, frequency mapping in the shader, and a colour LUT, in one shader pass. **S-M.**
- **M2. Stereo / 3-layer Trace Meet** (`trace-stroke.js:782`, `:895`). Today: `getImageData` readbacks every frame. Reuse `MEET_FRAG` from `trace-tape.js:81` and add the 3-layer case. **S-M.**
- **M3. Raster RGB** (`raster-rgb-display.js:262`). Today: JS LUT / hue grading and `ctx.filter` blurs. Move to a LUT texture, a hue matrix, and a separable blur. **S-M.**
- **M4. Vector RGB / Vectorscope trails** (`scope-paint-helpers.js:981`). Today: about 8 2D passes, 8-bit. Move to an RGB half-float variant of the phosphor fade shader. **M.**
- **M5. LED / LCD Dot / RGB Shape** (`trace-dot-sprite.js:258`). Today: JS shape SDF baked per pixel, with cache misses when modulated. Port the 13 shapes to GLSL. **M.** Must use the shared context.
- **M6. Number Readout / Value LCD / Pitch digits** (`number-readout.js:1725`). Today: `fillText` plus `shadowBlur`. Move to an SDF glyph atlas with exp glow. **M-L.** Caching glyph sprites first is cheaper.
- **M7. Colour picker plane** (`color-widget.js:851`). HSL computed per pixel. **S**, low priority.
- **M8. Room dimmer.** 128 rects in about 512 uniforms. Pack into a texture or cull per tile. **S.**

## Not worth moving

- GPU paths that already have a 2D fallback.
- SVG wires.
- Small or cached plots.

---

## Progress tracker

Full paths: `public/lib/phosphor/phosphor-energy-gl.js`, `public/lib/trace/{trace-woscope,trace-stroke,trace-tape,trace-rgb-points,trace-dot-sprite}.js`, `public/modules/spectrogram/spectrogram-display.js`, `public/modules/rasterRgb/raster-rgb-display.js`, `public/node-graph-module-scope-paint-helpers.js`, `public/node-graph-module-scope-number-readout.js`, `public/color-widget.js`, `public/boot-loading.js`. Sizes for Phase 0 rows were not given; they say TBD until someone estimates them.

| ID | Item | Files / lines | Size | Status | Owner | Notes |
|----|------|---------------|------|--------|-------|-------|
| P0a | One shared WebGL context for every display | `phosphor-energy-gl.js`, `trace-woscope.js`, `trace-stroke.js`, `trace-tape.js`, `trace-rgb-points.js`, `cycle-line-gl.js`, `picture-device.js`, `asciiscope-gl.js`, `node-graph-module-scope-waterfall-gl.js` | TBD | Not started | — | ~7 always open + 1 per Basic Shape / SinCos / Softwave / Matrix / Waterfall / Vector RGB face; Chrome evicts past ~16 |
| P0b | Vector RGB: stop recompiling shaders every frame with 2+ faces | `trace-rgb-points.js:53-83`, `109-117` | TBD | Not started | — | |
| P0c | Shared canvas: grow-only or scissor instead of resize per present | `phosphor-energy-gl.js:1727`, `trace-woscope.js:609`, `trace-stroke.js:382` | TBD | Not started | — | |
| P0d | Decide: merge shared devices into one WebGL2 context | all shared GL devices | TBD | Not started | — | Decision item for Argi |
| P0e-1 | Remove retired WebGPU oscillator script and its JS DSP fallback | `public/node-graph-gpu-additive-backend.js` (+ JS fallback) | TBD | Not started | — | Also C-001 (`docs/BUG_PLAN.md` Cleanup) |
| P0e-2 | Free the boot GPU probe context | `boot-loading.js:219` | TBD | Not started | — | |
| P0e-3 | Delete stray `_fs_aug2.glsl` | `_fs_aug2.glsl` (repo root) | TBD | Not started | — | |
| P0e-4 | Remove dead functions `nodeGraphPhosphorMapEnergyToColorCanvas`, `nodeGraphNumberReadoutPresentBurnPlate`, `paintNodeGraphPhosphorLiveStampOverlay` | `node-graph-module-scope-phosphor.js:188`, `node-graph-module-scope-number-readout.js:703`, `node-graph-module-scope-draw-burn.js:551` | TBD | Not started | — | |
| M1 | Spectrogram: looping magnitude texture + shader freq mapping + colour LUT, one pass | `spectrogram-display.js:536` | S-M | Not started | — | Replaces per-pixel `fillRect` + rgb strings |
| M2 | Stereo / 3-layer Trace Meet: reuse `MEET_FRAG`, add 3-layer case | `trace-stroke.js:782`, `:895`; `trace-tape.js:81` | S-M | Not started | — | Removes per-frame `getImageData` readbacks |
| M3 | Raster RGB: LUT texture + hue matrix + separable blur | `raster-rgb-display.js:262` | S-M | Not started | — | Replaces JS LUT / hue grading + `ctx.filter` blurs |
| M4 | Vector RGB / Vectorscope trails: RGB half-float phosphor fade variant | `scope-paint-helpers.js:981` | M | Not started | — | Replaces ~8 8-bit 2D passes |
| M5 | LED / LCD Dot / RGB Shape: port 13 shapes to GLSL | `trace-dot-sprite.js:258` | M | Not started | — | Must use the shared context |
| M6 | Number Readout / Value LCD / Pitch digits: SDF glyph atlas + exp glow | `number-readout.js:1725` | M-L | Not started | — | Caching glyph sprites first is cheaper |
| M7 | Colour picker plane in a shader | `color-widget.js:851` | S | Not started | — | Low priority |
| M8 | Room dimmer: pack 128 rects into a texture or cull per tile | `node-graph-room-dimmer.js` | S | Not started | — | Today ~512 uniforms |
