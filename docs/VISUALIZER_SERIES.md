# Visualizer series (individual visual modules)

**Status:** plan only (no code yet). Parallel track to the C++ DSP allowlist — not Batch 13.

**Policy anchors:** `APP_POLICY` §0 (JS = observers), §3 (prefer GPU), §5 (one sim, many observers). Scopes paint gate: `docs/SCOPE_PAINT_SIMPLIFICATION_PLAN.md`.

---

## What this is

Visualizers are **modules in the visual sense**, not audio DSP:

| Layer | Owns | Does not own |
|-------|------|----------------|
| C++ / worklet | One dynamical run; publish rings / taps | Face shaders, phosphor decay, CRT look |
| Visual module | Read rings → paint (GPU preferred) | Second phase / noise / integrator for “pretty” |

**Phosphor ≠ Trace.** Already peeled that way:

- `public/lib/phosphor/` — energy residual, drawer, shared WebGL device
- `public/lib/trace/` — waveform, stroke, tape, history, woscope, shape, dots
- `public/node-graph-module-scope-*.js` — host glue (defaults, normalize, paint gate, orchestrator, settings)
- Face folders under `public/modules/*` — catalog-facing displays (e.g. `phosphorLight`, `traceXyz`, `asciiscope`, `videoscope`, `oscilloscopeBank`, `gradientVectorscope`)

The series is: **one visual concern → one (or a tight cluster of) file(s)**, with a thin host adapter — same spirit as “efficientProduct” for DSP, but for observers.

---

## Non-goals

- No Three.js / regl / twgl / Pixi / Babylon / gl-matrix scene graphs for live faces.
- No middleman “render pipeline” frameworks that copy buffers for aesthetics.
- No JS twin that re-simulates the graph for video (policy §5).
- No inventing stereo / channels on the visual side that the audio type does not publish.
- Do not re-peel settings UI unless a form page is unmaintainable (settings peel is landed).

---

## Close-to-metal rules (maintainable)

**Allowed (preferred):**

- Raw WebGL1/2: `getContext`, own shaders, FBOs, `bufferData` / `texImage2D`, shared context when browser limits bite (already: one shared phosphor energy device).
- Typed arrays + ring snapshots from the worklet (existing scope-io / scope-snapshot path).
- Small local helpers in the same folder (compileShader, LUT upload) — not a general graphics engine.

**Avoid:**

- Framework scene graphs, reactive render trees, or “effect composers” between ring and fragment.
- Per-face WebGL contexts (context exhaustion); share a device, own FBO/state per face.
- CPU full-frame pixel loops for the live image when a GPU path exists or is the series target.
- Extra CPU↔GPU copies “for convenience” (e.g. canvas2d readback every frame).

**Maintainability bar:** a new face author should open **one primary file** (+ optional `*-settings.js` / shader string block) and see: input contract → upload → draw → present. Shared metal lives in `lib/phosphor` / `lib/trace` / a future `lib/visual/` only when ≥2 faces need the same kernel.

---

## Target layout (series shape)

```text
public/lib/phosphor/     # residual / energy phosphor kernels (shared metal)
public/lib/trace/        # 1D/2D/XYZ trace kernels (shared metal)
public/lib/visual/       # OPTIONAL later: shared ring upload, shared GL device helpers
                         #   only if phosphor+trace+faces need the same bit — do not invent early

public/modules/<face>/   # catalog visual modules (display only)
  <face>-display.js      # face paint entry (calls lib/*)
  <face>-gl.js           # optional: face-local shaders / programs
  <face>-settings.js     # optional: schema / form adapters

public/node-graph-module-scope-*.js   # host: gate, schedule, snapshot, settings shell
                                     # stay thin; do not grow new face math here
```

**Naming:** treat each face as a **visual module id** (catalog / displayType), distinct from audio type ids. DSP modules may *attach* a default face; the face does not become DSP.

---

## Capture → paint contract (shared, not a framework)

Stages stay explicit (from paint-gate plan):

1. **Capture** (worklet) — rings / taps from the one sim  
2. **Snapshot** (postMessage)  
3. **Buffer write** (main)  
4. **Schedule** (paint gate: live / freeze / force)  
5. **Dispatch** — typed drawer for that visual module  
6. **Face paint** — `lib/*` or `modules/<face>/*` only  

Rule: face code never invents pause/live predicates; call `scopePaint*` gate.

---

## Catalog (first series candidates)

Order = clarity of existing peel + observer purity (easy → harder). **V-batches** are visual-only; they do not advance the C++ audio allowlist.

| Batch | Visual module | Primary home today | Series intent |
|------:|---------------|--------------------|---------------|
| **V1** | Phosphor energy | `lib/phosphor/phosphor-energy-gl.js` (+ drawer) | Canonical: document contract; trim any host middlemen; keep raw GL |
| **V2** | Trace (1D / Instant Trace) | `lib/trace/*` + scope host | Same: one entry face file story; waveform/stroke stay metal |
| **V3** | PhosphorLight / scope2d face | `modules/phosphorLight/` | Thin display → lib/phosphor only |
| **V4** | TraceXyz | `modules/traceXyz/` | XYZ observe; no second sim |
| **V5** | Oscilloscope bank | `modules/oscilloscopeBank/` | Multi-slot observer; shared GL discipline |
| **V6** | Asciiscope | `modules/asciiscope/` (already has `*-gl.js`) | Align with series file rules; GPU path first |
| **V7** | Videoscope / gradient vectorscope | `modules/videoscope/`, `gradientVectorscope/` | Observer of L/R or XY taps; audio `vectorscopeTransform` stays DSP |
| **V8+** | Spectrogram, matrix, RGB faces, radar, … | various | One face per batch when needed; fold shared upload into `lib/visual/` only if duplicated thrice |

**DSP note:** types like `vectorscopeTransform` / `rotate3dTo2d` remain **audio** allowlist items. Visualizers **read** their outputs (or dedicated scope taps); they do not reimplement the transform in JS for the live face.

---

## Per-batch checklist (when coding starts)

1. Identify the **visual module** and its ring/tap inputs (ports or scope snapshot fields).  
2. Confirm **no second sim** (grep for local oscillators / noise used as “the” signal).  
3. Paint path: **raw WebGL** or documented temporary CPU exception.  
4. File layout: primary display file + optional gl/settings; shared kernel only in `lib/*`.  
5. Host stays: gate + schedule + settings shell — no new face math in `node-graph-module-scope-*.js`.  
6. Smoke: live while playing, freeze when paused (paint gate), no extra WebGL context per instance.  
7. Do not touch DSP Batch N unless the face requires a new **native tap publish** (then a thin C++ publish-only change, not a visual twin).

---

## Relationship to other tracks

| Track | Continues independently |
|-------|-------------------------|
| C++ efficientProduct / Batches 13+ | Audio natives on allowlist |
| Visualizer series V1… | Observer faces / lib kernels |
| Scope paint gate / capture tests | Host reliability (optional smokes) |

Starting V1 does **not** require finishing the ~72 remaining audio natives. Pausing visuals and continuing Batch 13 is also fine.

---

## First action when greenlit

**V1 — Phosphor energy:** read `phosphor-energy-gl.js` + `phosphor-drawer.js` + face call sites; write a short “input → FBO → present” contract at the top of the series doc or file header; remove any accidental host duplication; no framework; no new DSP. Stop when phosphor is clearly one visual module with a single metal path.

Until then: this file is the plan; **no code**.
