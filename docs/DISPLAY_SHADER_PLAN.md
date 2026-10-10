# Display Shader Plan

**Status:** living tracker for moving display per-pixel work out of JavaScript (and off CPU/WASM fill-grid) into GLSL. M1–M10 landed (need visual check). Phase 0 infra, G-rows (`.vert` / `.frag` next to wasm), and **W-rows (one Stop/bypass face-wipe registry)** wait for Argi go on each row.

**Date:** 2026-10-06. Source: Argi via LibraryCode. GLSL-on-disk: 2026-10-09 Argi. Face wipe registry: 2026-10-09 Argi.

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

## GLSL files next to WASM

Shipped present shaders that belong to a **native module** live beside that module’s `.cpp` / `.wasm`, not as JS template strings.

Layout (Field is the pattern):

```
native_modules/<name>/
  <name>.cpp
  <name>.wasm
  <name>.vert.glsl
  <name>.frag.glsl      (or extra .frag.glsl per pass: source, blur, …)
```

**Rules**

- Text assets the face `fetch()`es. Same debug-server path as wasm. No clang, no combined link, no worklet.
- Audio stays C++. The `.glsl` is the face present only.
- One `.vert` (usually the 4-line fullscreen quad) + one `.frag` per program. Extra passes = extra `.frag` files, same folder.
- JS (`*-gl.js`) fetches, compiles on the **shared picture device**, Canvas2D/WASM fallback until the files land.
- Cache-bust with `?v=` like wasm.
- **Easy** means: a `native_modules/<name>/` folder already exists **and** that module owns the GL programs (not a shared lib).
- Shared stack (phosphor, traces, Meet, cycle-line, room dimmer, colour picker, number readout, waterfall) stays in `public/lib/…-gl.js` until someone wants a `public/shaders/` shelf. Do not invent a wasm-less `native_modules/` folder just to park GLSL.
- Live typing (Apply without reload, saved in the patch) is the parked **Screen Space Shader** host. Repo `.glsl` is the shipped default, not the live buffer.

**Easy moves**

| ID | Module folder | From | Files | Status | Notes |
|----|---------------|------|-------|--------|-------|
| G1 | `native_modules/fbm_field/` | `fbm-field-gl.js` | `fbm_field.vert.glsl`, `fbm_field.frag.glsl` | Done | 2026-10-09 Grok: Field present fetches both; fill_grid until they land. |
| G2 | `native_modules/raster_rgb/` | `raster-rgb-gl.js` | one `.vert` + `source` / `blur` / `down` / `composite` `.frag` | Done | 2026-10-09 Grok: Scan Grid present fetches five files; Canvas2D until they land. |
| G3 | `native_modules/basic_shape/` (only if cycle-line is **not** shared) | `cycle-line-gl.js` | skip unless split | Dropped | Shared by Basic Shape / SinCos / Softwave. Keep in `public/lib/visual/cycle-line-gl.js`. |
| G4 | `public/lib/trace/` (shared shelf, no wasm) | `trace-dot-sprite-gl.js` | `trace-dot-sprite.vert.glsl`, `trace-dot-sprite.frag.glsl` | Done | 2026-10-09 Grok: LED / LCD Dot / RGB Shape SDF present. Same fetch as G1. |

**Not snug (no wasm sibling, or shared lib)** — leave in JS until a native folder exists: Image Ghost, Soft Fractal / rgbFractal, Spectrogram, Phosphor, traces, LED dots, number readout, colour picker, room dimmer, waterfall.

---

## Face wipe registry (Stop / power off)

GL faces keep residual **off** the 2D canvas (FBO, rolling buffer, rAF). Stop’s generic plate fill never sees that, so each new face grew a private `wipeXScreensToColdBoot` hook. Vector RGB missed Stop until 2026-10-09 because wipe looked for `.dsp-node` and paint still `presentTo`’d the old FBO.

**Law**

| Event | Face |
|-------|------|
| Pause | Hold residual |
| Stop | Cold-boot plate (dark / idle) |
| Power off / bypass | Same as Stop **for that module** |
| Play | Paint again |

Same idea as `scopePaintIsFrozen` in `node-graph-module-scope-paint-gate.js`: one gate, no per-file pause predicates.

**Target**

```text
nodeGraphModuleScopeFaceWipes[displayType] = (canvas, bg) => { … }
```

- Stop walks visible face canvases (persistent map + `[data-node-type]` articles) and calls the wipe for that `displayType`, then fills the plate.
- Bypass calls the same wipe for that node only.
- Custom paint **must** early-out through the gate: stopped / bypassed → wipe + return; frozen → hold. No `presentTo` after Stop.
- No new `if (typeof wipeX === "function")` in `node-graph-module-scope-wipe.js`.
- LCD / LED / Pitch idle digits stay the one exception (idle plate, not a solid black fill). Filter-curve plots redraw, they do not black out.

**Today’s special cases to fold in:** phosphor energy destroy, waterfall history, spectrogram history, number readout idle, Field, Scan Grid, Vector RGB.

---

## Progress tracker

Full paths: `public/lib/phosphor/phosphor-energy-gl.js`, `public/lib/trace/{trace-woscope,trace-stroke,trace-tape,trace-rgb-points,trace-dot-sprite}.js`, `public/modules/spectrogram/spectrogram-display.js`, `public/modules/rasterRgb/raster-rgb-display.js`, `public/node-graph-module-scope-paint-helpers.js`, `public/node-graph-module-scope-number-readout.js`, `public/color-widget.js`, `public/boot-loading.js`. Sizes for Phase 0 rows were not given; they say TBD until someone estimates them.

| ID | Item | Files / lines | Size | Status | Owner | Notes |
|----|------|---------------|------|--------|-------|-------|
| P0a | One shared WebGL context for every display | `phosphor-energy-gl.js`, `trace-woscope.js`, `trace-stroke.js`, `trace-tape.js`, `trace-rgb-points.js`, `cycle-line-gl.js`, `picture-device.js`, `asciiscope-gl.js`, `node-graph-module-scope-waterfall-gl.js` | TBD | Not started | — | ~7 always open + 1 per Basic Shape / SinCos / Softwave / Matrix / Waterfall / Vector RGB face; Chrome evicts past ~16 |
| P0b | Vector RGB: stop recompiling shaders every frame with 2+ faces | `trace-rgb-points.js` | TBD | Done, needs visual check | Librarian | 2026-10-06 Librarian: WeakMap keyed by face canvas keeps one GL program per canvas; switching faces no longer nulls a global device and recompiles. Files: `public/lib/trace/trace-rgb-points.js` |
| P0c | Shared canvas: grow-only or scissor instead of resize per present | `phosphor-energy-gl.js:1727`, `trace-woscope.js:609`, `trace-stroke.js:382` | TBD | Not started | — | |
| P0d | Decide: merge shared devices into one WebGL2 context | all shared GL devices | TBD | Not started | — | Decision item for Argi |
| P0e-1 | Remove retired WebGPU oscillator script and its JS DSP fallback | `public/node-graph-gpu-additive-backend.js` (+ JS fallback) | TBD | Not started | — | Also C-001 (`docs/BUG_PLAN.md` Cleanup) |
| P0e-2 | Free the boot GPU probe context | `boot-loading.js:219` | TBD | Not started | — | |
| P0e-3 | Delete stray `_fs_aug2.glsl` | `_fs_aug2.glsl` (repo root) | TBD | Not started | — | |
| P0e-4 | Remove dead functions `nodeGraphPhosphorMapEnergyToColorCanvas`, `nodeGraphNumberReadoutPresentBurnPlate`, `paintNodeGraphPhosphorLiveStampOverlay` | `node-graph-module-scope-phosphor.js:188`, `node-graph-module-scope-number-readout.js:703`, `node-graph-module-scope-draw-burn.js:551` | TBD | Not started | — | |
| M1 | Spectrogram: looping magnitude texture + shader freq mapping + colour LUT, one pass | `spectrogram-display.js:536` | S-M | Done, needs visual check | Grok Bot | Replaces per-pixel `fillRect` + rgb strings. 2026-10-06 Grok Bot: ring of raw bins + per-column settings + LUT rows, one shader pass on the shared picture device (no new context); Canvas2D kept as fallback, rebuilt from the ring on context loss. Files: new `public/modules/spectrogram/spectrogram-gl.js`; `spectrogram-display.js`; script tag in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M2 | Stereo / 3-layer Meet (R+B=G): one shared Meet GLSL for every display | `trace-meet-glsl.js` (new); `node-graph-module-scope-waterfall.js:605`; `node-graph-module-scope-waterfall-gl.js:626`, `:700`; `trace-tape.js:84` | S-M | Done, needs visual check | Librarian | Removes per-frame `getImageData` readbacks. 2026-10-06 Librarian: inventory found one live Meet site, the 1D Waterfall column bars (Output and every `stereoWaterfallPorts` face, normal and onset paths, blend R+B=G with two channels). It now draws each column once on its existing waterfall GL context; the shader picks L / R / meet colour per pixel from the shared `TraceMeetGlsl.MEET_SPAN_GLSL` (same result as the old L, R-only and overlap bar stamps, ≤1/255 rounding). Shared lib `public/lib/trace/trace-meet-glsl.js` holds both Meet formulas (`traceMeet2`/`traceMeet3` coverage mix, `traceMeetSpan2` waterfall span); `trace-tape.js` Meet programs now use it. Removed the dead per-pixel JS Meet: `TraceStroke.drawStereo` / `drawStereoRedBlueGreen` / `drawMeet` (+ mask helpers) and their only callers `TraceHistoryDraw.strokeStereo` / `strokeLayers`; dropped the earlier GPU port `trace-meet-gl.js` with them. XYZ / RGB waterfalls with R+B=G stay additive (unchanged). Files: new `public/lib/trace/trace-meet-glsl.js`; `public/node-graph-module-scope-waterfall.js`; `public/node-graph-module-scope-waterfall-gl.js`; `public/lib/trace/trace-tape.js`; `public/lib/trace/trace-stroke.js`; `public/lib/trace/trace-history-draw.js`; script tags in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M3 | Raster RGB: LUT texture + hue matrix + separable blur | `raster-rgb-display.js:262` | S-M | Done, needs visual check | LibraryCleaner | Replaces JS LUT / hue grading + `ctx.filter` blurs. 2026-10-06 LibraryCleaner: raw pixel buffer uploaded as a texture on the shared picture device (no new context); shader does nearest placement, grade LUT texture (contrast/brightness/invert), HSL hue rotate (ported per pixel: the JS hue is HSL, not a linear matrix), then separable Gaussian blur and glow (sigma = CSS px; levels halved above 6px) and plate/glow composite. Canvas2D path kept as fallback. Files: new `public/modules/rasterRgb/raster-rgb-gl.js`; `public/modules/rasterRgb/raster-rgb-display.js`; script tag in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M4 | Vector RGB / Vectorscope trails: RGB half-float phosphor fade variant | `trace-rgb-trails-gl.js` (new); `vector-rgb-display.js`; `gradient-vectorscope-display.js`; `trace-rgb-points.js` | M | Done, needs visual check | Librarian | Replaces ~8 8-bit DestFade 2D passes. 2026-10-06 Librarian: RGB dual residual (hot*keepFast, max(min(prev*keepSlow, cap))) on shared picture device FBO (half-float when EXT_color_buffer_half_float else rgba8); Vector RGB stamps points into FBO; Gradient Vectorscope still draws via TraceWoscope/2D then ingestCanvas. DestFade/TraceRgbPoints kept as fallback. Also closes P0b (WeakMap). Files: new `public/lib/trace/trace-rgb-trails-gl.js`; `public/modules/vectorRgb/vector-rgb-display.js`; `public/modules/gradientVectorscope/gradient-vectorscope-display.js`; `public/lib/trace/trace-rgb-points.js`; script tags in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M5 | LED / LCD Dot / RGB Shape: port 13 shapes to GLSL | `trace-dot-sprite-gl.js` (new); `trace-dot-sprite.js` | M | Done, needs visual check | Librarian | Must use the shared context. 2026-10-06 Librarian: 13 stamp shapes (circle/oval, pill, squircle, ngon, star, heart, trapezoid, diamond, cross, ring, teardrop, flower) evaluated as SDF in one fragment shader on the shared picture device; live TraceDotSprite.draw prefers GL and skips JS bake; CPU bake kept as fallback. Files: new `public/lib/trace/trace-dot-sprite-gl.js`; `public/lib/trace/trace-dot-sprite.js`; script tags in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M6 | Number Readout / Value LCD / Pitch digits: SDF glyph atlas + exp glow | `number-readout-gl.js` (new); `node-graph-module-scope-number-readout.js` | M-L | Done, needs visual check | Librarian | 2026-10-06 Librarian: DSEG/mono SDF glyph atlas (EDT bake) on shared picture device; glow=exp(-d^2/sigma^2), core=smoothstep; LCD inner shadow via rounded-box SDF (no fillText/shadowBlur/ctx.filter when GL works). Canvas2D kept as fallback. Files: new `public/modules/numberReadout/number-readout-gl.js`; `public/node-graph-module-scope-number-readout.js`; script tags in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M7 | Colour picker plane in a shader | `color-widget-plane-gl.js` (new); `color-widget.js` | S | Done, needs visual check | Librarian | 2026-10-06 Librarian: colour plane is a fullscreen quad on the shared picture device (HSV plane / HSL lamp / BW from UV + hue uniform); Canvas2D putImageData kept as fallback. Files: new `public/lib/visual/color-widget-plane-gl.js`; `public/color-widget.js`; script tags in `public/index.html` + `public/perform.html`; `scripts/smoke_test.py` PUBLIC_SCRIPT_PATHS |
| M8 | Room dimmer: pack 128 rects into a texture or cull per tile | `node-graph-room-dimmer.js` | S | Done, needs visual check | Librarian | 2026-10-06 Librarian: pack up to 128 rects into a 2-row data texture (float preferred, RGBA8 fallback) instead of ~512 uniforms; fragment loop unchanged (same rounded-box SDF look). Files: `public/node-graph-room-dimmer.js` (SHADER_REV 16); script tag version bump in `public/index.html` + `public/perform.html` |
| M9 | Fractal Brownian Field: fBm per texel in GLSL from uniforms | `fbm-field-gl.js`; `fbm-field-display.js`; `fbm_field.cpp` fill_grid | M | Done, needs visual check | Librarian | 2026-10-06 Librarian: face present evaluates fBm in the fragment shader on the shared picture device (no new context); fill_grid WASM only for Canvas2D fallback. Audio X/Y/Z probes stay in C++/WASM (fieldAt / eval_at / sample) — WISIWIH approximate (GL float hash vs C++ uint32). 2026-10-09 Grok: present source extracted to `native_modules/fbm_field/fbm_field.{vert,frag}.glsl` (G1); `fbm-field-gl.js` fetches. Files: `public/modules/fbmField/fbm-field-gl.js`; `public/modules/fbmField/fbm-field-display.js`; `native_modules/fbm_field/fbm_field.vert.glsl`; `native_modules/fbm_field/fbm_field.frag.glsl` |
| M10 | Image Ghost: dry flash + contrast in PRESENT shader (zero hot-path getImageData) | `image-burn-gl.js`; `image-burn-display.js` | M | Done, needs visual check | Librarian | 2026-10-06 Librarian: residual path already GL; DrawDry contrast/brightness moved into PRESENT_FRAG screen composite so live frames do no getImageData when GL works; Canvas2D/getImageData kept as fallback. Files: `public/modules/imageBurn/image-burn-gl.js`; `public/modules/imageBurn/image-burn-display.js`; script tag version bump in `public/index.html` + `public/perform.html` |
| G1 | Field present `.vert` + `.frag` next to wasm | `native_modules/fbm_field/fbm_field.{vert,frag}.glsl`; `fbm-field-gl.js` | S | Done | Grok Bot | 2026-10-09 Grok: fetch + compile; fill_grid until files land. Pattern for G2. |
| G2 | Scan Grid present shaders next to wasm | `native_modules/raster_rgb/`; `raster-rgb-gl.js` | S | Done | Grok Bot | 2026-10-09 Grok: `raster_rgb.vert.glsl` + `source` / `blur` / `down` / `composite` `.frag.glsl`. Fetch + compile; Canvas2D until they land. Blur tap loop is literal 24 (matches MAX_TAPS_RADIUS). |
| G4 | LED Dot SDF present `.vert` + `.frag` on the shared shelf | `public/lib/trace/trace-dot-sprite.{vert,frag}.glsl`; `trace-dot-sprite-gl.js` | S | Done | Grok Bot | 2026-10-09 Grok: no wasm sibling; LED / LCD / Pulse / RGB Shape share one SDF program. Fetch + compile; JS bake until files land. |
| W1 | Face wipe registry: Stop / bypass / power-off through `nodeGraphModuleScopeFaceWipes[displayType]` | `node-graph-module-scope-wipe.js`; `node-graph-module-scope-paint-gate.js`; Field / Scan Grid / Vector RGB / phosphor / waterfall / spectrogram / number readout | M | Done | Grok Bot | 2026-10-09 Grok: `nodeGraphModuleScopeRegisterFaceWipe` / `WipeCanvas` / `WipeNode`. Pause holds (`scopePaintIsFrozen`). Stop + orchestrator early-out + power-off call the registry. LCD idle exception kept. |
| W2 | Fold existing special-case wipes into W1 and delete the `if (typeof wipeX)` list | same as W1 | S | Done | Grok Bot | 2026-10-09 Grok: Field / Scan Grid / Vector RGB register; phosphor / waterfall / spectrogram / LCD builtins in wipe.js. Removed the `if (typeof wipeX)` tail. |
