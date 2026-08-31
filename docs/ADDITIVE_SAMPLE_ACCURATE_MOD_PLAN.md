# Plan: CPU proving ground for sample-accurate Additive modulation (GPU-shaped)

## Goal

Build **CPU infrastructure that mirrors the future GPU model**:

- Fundamental **sources** publish a compact **non-audio control packet** (recipe / state), not a cyan ZOH of the last Out sample.
- **Bubble Cutoff** (first consumer) evaluates that math **per output sample** while Yellow Graph timbre can stay quantum-rate.
- Prove the pattern with a small allowlist — not every sandbox module.

Locked product rule from prior turns: **envelopes must be sample-accurate**; cyan single-float ZOH is unacceptable for them.

---

## Mental model (correct the “512 samples” confusion)

| Layer | What crosses the bridge | Who runs the math |
|-------|-------------------------|-------------------|
| Today’s broken cyan | One float / quantum, held | Already “done” |
| **Target (GPU + CPU prove)** | Compact **control** (timings, high/low, oscillator state, …) once / quantum | **Consumer kernel** evaluates `f(i)` per sample index |
| Optional | Or a length‑N `samples[]` strip filled once / quantum | Consumer indexes `samples[i]` |

You do **not** stream one CPU→GPU float per sample. You **do** either upload uniforms+state and run equations on device, or upload an `env[0..N)` strip. CPU proving ground does the same with JS.

---

## Scope (this program of work)

### Sources (allowlist)

| Module | Type id | What the control packet carries |
|--------|---------|----------------------------------|
| **Curve Envelope** | `expAdsr` | ADSR timings + shapes + level/sustain (high/low) + runtime state; honor `UpdateOnTrigger` latch |
| **Pluck Envelope** | `pluckEnvelope` | Pluck timings / feedback / velocity / level + runtime state |
| **RobinSinusoid** | `robinSinusoid` | Freq, amplitude, phase accumulator (so consumer can `sin(φ + 2π f i/sr)` per sample) |
| **Knob** | `knob` | DOMAIN value + smoother state (offset/range already in controller sidecar). Constant within block if smoothing Off; if smoothing On, either bake N samples of the chase or expose smoother coeffs for per-sample eval |

Not in v1: every LFO, every filter, Additive Envelope twin as the long-term answer.

### Consumer (v1)

- **Bubble `cutoff` only** — map control’s 0…1 (or bipolar→unipolar) expression into Cutoff and apply **per sample** when summing / gating harmonics.
- Later: Ladder Cutoff, Out Amplitude, etc. reuse the same reader.

### Non-goals (v1)

- Full GPU / WASM port.
- Replacing Yellow Graph quantum updates.
- Making every gold Out automatically sample-accurate into Additive.

---

## Control packet schema (shared)

New small module e.g. `public/modules/additiveGraph/additive-mod-control.js` (loaded in efficient + main):

```js
// Discriminated union — GPU-shaped uniforms
{
  kind: 'adsr' | 'pluck' | 'robin' | 'scalar',
  // common:
  version: 1,
  sampleRate: number,
  // kind-specific fields + mutable state for continuity across quanta
}
```

**Evaluate API** (CPU = GPU kernel stand-in):

```js
additiveModControlValueAt(control, sampleIndex, blockFrames) -> number  // typically 0…1
```

- `adsr` / `pluck`: step or closed-form from latched params + state (Gate owned by **source** — Curve/Pluck keep their Gate/Trigger; packet carries updated state each quantum after source advances, **or** packet carries params+state at block start and consumer advances a **copy** for indices `0..N-1` so edges inside the block stay accurate).
- `robin`: `amp * sin(phase0 + 2π f i / sr)`.
- `scalar`: knob domain mapped to 0…1 (or raw domain with consumer mapping).

**Recommended Gate ownership (locked for v1):** sources keep Gate/Trigger (your “recipe includes state” idea). Each quantum the source publishes **params + state at block start**; consumer runs the same stepper for `i = 0..N-1` on a scratch copy so within-block gate edges from a **gate buffer** are optional later. v1 simplification: source also publishes `gate[0..N)` only if we need intra-block gate accuracy for plucks; otherwise state-at-block-start + per-sample advance assuming constant gate for the block is a known limitation to document and fix in phase B with a gate strip.

Prefer **phase B early** if plucks click: publish `gateSamples: Float32Array(N)` alongside recipe (still not “audio Out”, just a gate tape).

---

## Architecture on efficient CPU (mirrors GPU schedule)

```
per quantum:
  1) Controllers (Knob) → publish scalar control
  2) Envelopes / Robin → run their DSP as today for gold Out
                      → ALSO publish additiveModControl packet (+ optional gate strip)
  3) Yellow Graph sidecar → build Graph (Bubble may stamp cutoffMod: controlRef
                            instead of baking a single cutoff into amps when sample-accurate)
  4) Additive Out sum loop → for each sample i:
         cutoff = map(additiveModControlValueAt(ctrl, i, N))
         apply harmonic gate / sum with that cutoff
```

**Bubble change:** when Cutoff’s mod source is an allowlisted control packet:

- Do **not** fold a single ZOH float into `eff(cutoff)` for the whole quantum.
- Stamp `graph.cutoffControl = control` (or side map `nodeId → control`).
- Leave harmonic amps as pre-cutoff (or store base amps); **Out** applies `harmonicCountGain` (or Bubble’s amp gate) using `cutoff(i)` per sample.

When mod source is ordinary Knob scalar with no need for audio-rate: keep current quantum `eff()` path (Knob is interface control — OK at block rate unless smoother demands per-sample chase).

---

## Source publish hooks

| Source | Where to attach publish |
|--------|-------------------------|
| Knob | Extend `processControllerEfficientSidecar` — already publishes Bias/Out; add `modControl: { kind:'scalar', ... }` |
| Curve Envelope | After native/JS block (or harvest): build ADSR control from params + JS/native-mirrored state; set on `nodeOutputs` |
| Pluck Envelope | Same pattern; may need JS state mirror if native-only |
| RobinSinusoid | Publish robin control from frequency/amplitude/phaseAcc after block |

Gold **Out** audio unchanged for the rest of the sandbox.

Deprecate long-term role of **`additiveCurveEnvelope`** once `expAdsr` publishes controls — keep until Bubble Cutoff path is proven.

---

## Mapping control → Bubble Cutoff

- Envelope / pluck / robin unipolar 0…1 → Cutoff 0…1 directly (natural pluck).
- Robin bipolar: `0.5 + 0.5*x` or depth knob later.
- Knob DOMAIN: existing `nodeGraphParamFoldModSources` / unit-band rules; for sample-accurate scalar just evaluate domain each sample if chasing.

---

## Phased delivery

### Phase 0 — Schema + evaluator (no wiring)
- Add `additive-mod-control.js`: kinds, `valueAt`, copy/scratch state.
- Unit-style node smoke tests: ADSR ramp over N, Robin period count.

### Phase 1 — Publishers
- Knob → scalar control on `nodeOutputs`.
- Curve Envelope → `adsr` control (+ document UpdateOnTrigger in packet).
- RobinSinusoid → `robin` control.
- Pluck Envelope → `pluck` control (JS state path first if native state opaque).

### Phase 2 — Bubble Cutoff consumer (proving ground)
- Detect control packet on Cutoff mod connection.
- Bypass single-float ZOH for that path.
- Additive Out (or sidecar sum) applies sample-accurate cutoff gate from `valueAt(i)`.
- Face / audition: pluck should lose staircase on Cutoff.

### Phase 3 — Hardening
- Optional `gateSamples[N]` for intra-block Gate.
- Param smoothing: for scalar/knob, per-sample chase inside `valueAt` or prebake strip.
- Retire Additive Envelope as required bridge.
- Extend same reader to Ladder Cutoff.

### Phase 4 — GPU handoff (later, out of this PR train)
- Same packet → GPU uniforms/SSBO; same equations in WGSL/CUDA/Metal.
- Graph buffer + control buffer bind once per quantum.

---

## Files likely touched

- **New:** `public/modules/additiveGraph/additive-mod-control.js`
- **Publish:** `controller-efficient-sidecar.js`, `expAdsr` worklet/live, `pluckEnvelope` worklet/live, `robinSinusoid` worklet/live, native harvest glue if needed
- **Consume:** `additive-yellow-graph-sidecar.js`, `additive-graph-math.js` (per-sample gate helper), `additive-out` sum path / growl apply split
- **Defs / docs:** Bubble tooltip; `docs/CYAN_BLOCK_RATE_FROM_AUDIO.md` → update to “control packet + per-sample eval”
- **Tests:** small node harness for `valueAt` continuity across quantum boundaries

---

## Risks

| Risk | Mitigation |
|------|------------|
| Native envelope state not readable from JS | Mirror state in JS when publishing, or step JS twin for control only |
| Bubble bakes cutoff into Graph today | Split “recipe Graph” vs “express cutoff at sum” |
| CPU cost of per-sample cutoff gate | Cap H; vectorize later; GPU is the end state |
| Knob smoothing vs block | Explicit scalar chase in `valueAt` |

---

## Success criteria

1. Gate → Curve Envelope → Bubble Cutoff (control packet) → pluck **without** ~3 ms cutoff staircase.
2. RobinSin → Bubble Cutoff wobbles smoothly at audio rates.
3. Knob → Bubble Cutoff still works (scalar / quantum or smoothed).
4. Pluck Envelope → Bubble Cutoff works for one-shot plucks.
5. Same packet shape is documented as what a GPU kernel will bind.

---

## Implementation order (when executing)

1. Schema + `valueAt` + tests  
2. Publishers (Knob, Curve, Robin, Pluck)  
3. Bubble Cutoff sample-accurate consume at Out  
4. Docs + deprecate Additive Envelope bridge  
