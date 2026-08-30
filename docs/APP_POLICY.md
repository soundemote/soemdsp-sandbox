# App-wide policy (standing orders)

**Audience:** humans and agents working on soemdsp-sandbox.  
**Status:** binding while the app is **not feature-complete**.  
**Related:** [SANDBOX_DESIGN.md](./SANDBOX_DESIGN.md) (UI aesthetics), [WASM_SLIM_LOAD.md](./WASM_SLIM_LOAD.md), [MODULE_PATTERN_REFERENCE.md](./MODULE_PATTERN_REFERENCE.md).

When in doubt: prefer **honesty, one path, and delete over compatibility**.

---

## 0. Architecture north star

**JS is the interface. C++ runs the circuit.**

| Layer | Role |
|-------|------|
| **JS** | Authoring UI, patch document, cables/knobs, plan/serialize, scopes/faces as **observers**, host glue that talks to native |
| **C++ (WASM)** | Interpret the patch / plan: allocate module instances, wire buffers, run the realtime graph |

- The user writes a **patch in JS** (graph + params). That is not where audio is computed.
- The engine **compiles/interprets that patch into a C++ circuit** and runs it (block processing preferred).
- JS must not be a second DSP runtime that “also” evaluates the graph sample-by-sample. Transitional hosts that still dispatch per module from the worklet are **debt** toward this north star — migrate toward native graph execution, do not deepen JS DSP.

Concrete rules for the current codebase follow in §0b / §2 / §2b / §5.

---

## 0b. Minimum Viable Efficient Product (hard cutover)

The **efficient product** surface is the shippable MVEP build. Flag: `nodeGraphMvp.efficientProduct` (**default ON**). Escape hatch for full catalog: `?product=full`.

### Live-audio allowlist (SSOT)

Only these live-audio types exist in the efficient build:

| Type | Role |
|------|------|
| `polyBlep` | Oscillator |
| `robinSinusoid` | Recursive sine osc |
| `robinSupersaw` | Detuned saw bank |
| `noiseGenerator` | Noise source |
| `ladderFilter` | Filter |
| `softClipper` | Dynamics |
| `reverbEffect` | Sabrina reverb |
| `pingPongDelay` | Delay |
| `attenuverter` | Scale / invert / offset |
| `range` | Linear range map |
| `inv` | Invert (`−in`) |
| `u2b` | Unipolar → bipolar |
| `b2u` | Bipolar → unipolar |
| `bias` | DC offset (`in + offset`) |
| `gain` | Master/L/R dB + mono-sum + offset |
| `slewLimiter` | Rise/fall rate limiter |
| `comparator` | Edge detector (Up/Down/Change/Steady/Sign/Thru) |
| `sampleDelay` | Fixed ring delay (Thru + Delayed) |
| `sampleHold` | Sample & hold (Trigger + optional internal clock) |
| `minMax` | 4-in Max/Min selector |
| `mix` | 4-channel mix (volumes/bias/bleeds) |
| `mixStereo` | Stereo pair mixer (true L/R) |
| `clipperLimiter` | Soft-knee clipper (M/L/R channels) |
| `midSideEncode` | L/R → Mid/Side matrix |
| `vectorscopeTransform` | L/R → X/Y vectorscope axes |
| `rotate3dTo2d` | X/Y/Z rotate → X/Y project |
| `clock` | Free-running clock (Digital / Analog / Pulse) |
| `triggerDivider` | Divide trigger edges |
| `delayedTrigger` | Delay then pulse on trigger |
| `randomClock` | Random-interval Trigger + Gate |
| `triggerCounter` | Count triggers → Pulse + Count |
| `metallicRatio` | Metallic mean (n → ratio) |
| `lutCell` | 4-in LUT + flip-flop (Out / Q) |
| `lookaheadLimiter` | True-stereo brickwall (Out / L / R / Gain) |
| `stepSequencer` | 8-step Trigger/Reset sequencer |
| `transport` | Master Clock (−1..1 / 0..1 / Trigger / f Hz) |
| `aliasSine` | Normalized-freq sine (aliases by design) |
| `blit` | Band-limited impulse-train oscillator (Saw/Ramp/Square/Tri/Sine) |
| `sineWavetable` | SinCos4 — native sin/cos → A/B/C/D by mode |
| `antisaw` | Aliased-partial saw (fundamental / reflections / tilt) |
| `archimedes` | Fixed-point quadrature sine + π / dither noise taps |
| `additiveOsc` | Native additive partial bank (free-fn; host phase) |
| `surgeOscillator` | Hard-sync PolyBLEP osc (internal or external Sync) |
| `softwaveOsc` | Soft-shaped multi-wave morph oscillator |
| `dsfOscillator` | Discrete Summation Formula oscillator |
| `hypersaw` | Stereo PolyBLEP saw bank (spread / random / drift) |
| `sinc` | Repeating sinc kernel (Ideal / Band Limit) |
| `bradley2a` | Bradley Telcom jitter/hit impairment synth |
| `ellipsoid` | RoundShape sine→square quadrature (Bi/Uni X/Y) |
| `snowflake` | L-system fractal path walker (X/Y) |
| `butterworth` | Classical Butterworth multipole (LP/HP/BP/BR) |
| `linkwitzRiley` | Linkwitz–Riley (cascaded Butterworth half-order) |
| `bessel` | Bessel multipole (flat group delay) |
| `chebyshev` | Chebyshev Type I (equiripple passband) |
| `elliptic` | Elliptic / Cauer multipole |
| `eqFilter` | ZDF SVF multi-mode EQ |
| `activeFilter` | Active multipole ladder (LP/HP/BP) |
| `passiveFilter` | Passive real-pole LP/BP/HP (native 6 dB/oct) |
| `tb303Filter` | TB-303 diode-ladder style |
| `flowerChildFilter` | Flower Child character filter |
| `yellowjacketFilter` | Yellowjacket character filter |
| `superloveFilter` | SuperLove character filter |
| `humanFilter` | Human character filter |
| `resonatorFilter` | Character resonator (sin/tri/saw) |
| `combResonator` | Delay-loop comb resonator |
| `modeResonator` | Complex 2-pole mode resonator |
| `chaoticPhaseLockingFilter` | Chaotic phase-locking filter |
| `inertialFilter` | Attack/release inertial smoother |
| `expAdsr` | Curve ADSR envelope |
| `linearEnvelope` | Linear ADSR envelope |
| `pluckEnvelope` | Pluck / decay-mod envelope |
| `flowerChildEnvelopeFollower` | Attack/hold/decay envelope follower |
| `vactrolEnvelopeCustom` | Vactrol photoconductive envelope |
| `vactrolEnvelopeSeries` | VTL5C-series preset vactrol (same native) |
| `delayEffect` | Modulated mono delay |
| `soemReverb` | SoEm multi-tap reverb (≠ sabrina `reverbEffect`) |
| `pll` | Phase-locked loop (VCO / PC / LPF / Locked) |
| `output` | Sink |

Canonical circuit:

```text
polyBlep → ladderFilter → softClipper → reverbEffect → pingPongDelay → output
(+ robinSinusoid / robinSupersaw / noiseGenerator;
   attenuverter / range / inv / u2b / b2u / bias / gain / slewLimiter / comparator /
   sampleDelay / sampleHold / minMax / mix / mixStereo / clipperLimiter /
   midSideEncode / vectorscopeTransform / rotate3dTo2d /
   clock / triggerDivider / delayedTrigger / randomClock / triggerCounter /
   metallicRatio / lutCell / lookaheadLimiter / stepSequencer / transport /
   aliasSine / blit / sineWavetable / antisaw / archimedes /
   additiveOsc / surgeOscillator / softwaveOsc / dsfOscillator / hypersaw / sinc /
   bradley2a / ellipsoid / snowflake /
   butterworth / linkwitzRiley / bessel / chebyshev / elliptic /
   eqFilter / activeFilter / passiveFilter / tb303Filter /
   flowerChildFilter / yellowjacketFilter / superloveFilter / humanFilter /
   resonatorFilter / combResonator / modeResonator /
   chaoticPhaseLockingFilter / inertialFilter /
   expAdsr / linearEnvelope / pluckEnvelope /
   flowerChildEnvelopeFollower / vactrolEnvelopeCustom / vactrolEnvelopeSeries /
   delayEffect / soemReverb / pll
   as utilities)
```

**Also allowed (non-DSP):** scope / monitor faces that **only read** engine buffers. Layout chrome such as `textBox` may remain. `audioInput` is **not** on the allowlist unless a demo explicitly needs it (strip with other DSP for now).

**SSOT:** `public/node-graph-efficient-product.js` — used by module shop / Add Module **and** live plan refuse (host + worklet `setPlan`).

### Hard cutover rules

- When `efficientProduct` is on, Add Module / shop catalog offer **only** the allowlist (+ observers).
- Live plan apply / worklet `setPlan` **refuse** foreign types with status **`not in efficient build`**. Do **not** run JS DSP for missing natives or hidden types.
- Dual JS+C++ audio paths are **not** the product. Convert the next type into the allowlist (native + catalog) — never reintroduce a JS twin to “make it work.”
- **Smoother manager is audio/C++ only** on the efficient path. JS may write Control **targets** and **smoothing-time** into engine memory on change; JS must **not** own or step the smoother chase list. (Legacy `?product=full` JS smoothers are debt until removed.)
- **Efficient AudioWorklet blob does not load JS DSP evaluators** (`node-live-audio-worklet-evaluators*`, `evaluate-frame.js`, or per-module `*-worklet-evaluator.js`). Audio is **native graph only** (`processNativeGraphQuantum`); `process()` early-returns after that path and never calls `evaluateFrame`. Legacy evaluator sources load only for `?product=full`.

---

## 1. No patch backwards compatibility (pre–feature-complete)

While the product is not feature-complete:

- **Do not** add rename bridges, dual param keys, migration layers, or “read `level` if `brightness` missing” shims.
- **Do not** keep dead aliases so old saved patches keep working after intentional renames.
- Renames are **clean**: one key, one label, one code path. Old patches may reset that knob to default — acceptable.

When feature-complete (or when explicitly chosen later): introduce migrations deliberately (versioned patch format), not ad-hoc fallbacks.

---

## 2. C++ owns the circuit; JS does not compute audio

This app is a **C++ DSP engine with a JS interface** (§0). JS authors and observes; C++ wires and runs.

- **JS must not implement module audio** (per-sample or per-block kernels): no filters, delays, oscillators, clippers, reverbs, or other signal math in the AudioWorklet / offline “DSP” path.
- **Module DSP lives in native/WASM (C++)** under `native_modules/…` (and soemdsp atoms where applicable).
- Until the full graph runs in C++, the JS worklet is only a **host**: resolve Control/Live params, call native `process` / `process_block`, pass buffers, observe for scopes/UI — not a JS interpreter of the circuit.
- Prefer **`process_block` (quantum-sized)** over per-sample WASM exports when feedback rules allow.
- **No JS twin** “in case native fails.” If native is missing or cold: **silence / black / inert** (optional status), not a second algorithm.
- Face/display may present native results but must **not** re-implement the audio kernel in JS or GLSL for “looks only.”
- Same rule offline: Render Sample uses the **same native core** (see §5).
- **Match the module’s channel model — do not invent stereo inside natives.** A mono utility stays mono-per-handle (`process_block` on one buffer). The graph folds Mono+L+R and fans Out when the patch presents stereo jacks (same pattern as attenuverter / range / bias). True-stereo modules keep independent L/R state because the algorithm is stereo — not because the UI has Left/Right jacks.

---

## 2b. Delay / large buffers: pay for what you use

- **Delay time does not add CPU.** A longer delay is the same per-sample work (write + read + any once-per-sample FX). Do not treat max delay as a CPU cost.
- **RAM must match the live delay need**, not a worst-case slot reserved forever.
  - If the delay is 1 s, hold about **1 s** of ring (plus small modulation/headroom margin), not 8 s “just in case.”
  - Do **not** bake `kMaxInstances × kMaxDelaySeconds` stereo rings into BSS when most slots are empty.
- Prefer **per-instance buffers** sized to that instance’s current max needed length; grow with `memory.grow` (or an equivalent arena) when the delay setting increases; release or recycle on destroy.
- A single shared arena + offsets is optional packing — **not** required for speed. Correct sizing per live delay is the requirement; layout is secondary.
- Hard caps (max delay seconds, max concurrent instances) may exist as safety limits, but unused capacity must not sit pre-reserved for idle instances.

---

## 3. Prefer GPU for module display graphics

- Module faces, scopes, fields, phosphor-style displays: **prefer GPU** (WebGL / existing scope GPU paths).
- Avoid CPU pixel loops / 2D canvas full-frame paint for live module displays when a GPU path exists or can be added.
- CPU is OK for: one-shot layout, debug overlays, tiny markers, metadata — not the main live image.

---

## 4. What I See Is What I Hear (WISIWIH)

- Face and audio outputs must share the **same domain mapping and kernel** for a given module (or document a deliberate, labeled exception).
- Do **not** give the face a prettier separate noise/field while jacks sample something else.
- Display-only knobs that change look without affecting the shared signal are a **WISIWIH smell** — either wire them into the shared path or make clear they are cosmetic (prefer wire).

---

## 5. Module DSP lives in one place (C++)

**Hosts are not DSP.** Live AudioWorklet, offline/Render Sample, and main-thread code are **hosts** that call one C++ implementation. They must not each own a different formula for the same module type.

### Single core

- **Module DSP lives in one place: native/WASM (C++)** (`native_modules/…` / soemdsp). Not a worklet JS copy and a render JS copy that can drift.
- Legacy `*-math.js` helpers are **not** a second approved DSP home for new work; migrate them into C++ and delete the twin.
- Offline and realtime **reference that same native core**. The only intentional difference is **scheduling** (device quantum vs bounce length / block size), not the waveshaper, filter, or feedback math.
- Do **not** maintain diverging “worklet version” vs “render version” of the same module without a tracked, labeled reason (and fix the split rather than document it as normal).

### Live chaos and video (one universe)

- While playing: **one** dynamical evaluation (the worklet). Faces, scopes, phosphor, and video **observe** that run (buffers / rings from the worklet). They must not re-simulate the graph with a second set of phases, noise seeds, or integrators.
- **What I see is what I hear** under feedback and chaos requires **one state**, not “same knobs, two sims.”

### Offline / Render Sample

- Offline is the **same modules, same core**, stepped without the audio device clock — not a parallel JS approximation of the live native path.
- Prefer the **same native export** on main thread for render when the live path is native (lazy instantiate WASM; silence until ready — see §2). Do not invent a second algorithm “so offline works before WASM loads.”
- A bounce may be a **new take** (new seeds / cold start). That is still the same engine; it is not license to use different math.

### Dual evaluation is not the goal

- Live A/V sync is **one sim, many observers** — not two full graphs forced to stay identical.
- “Identical pure functions on two threads” still yields two trajectories under chaos if both step state. Prefer capture over re-run for live display.

---

## 6. Transport and status UI must match engine reality

- Play / pause / stop / Output labels and colors follow **actual** live node + output state, not optimistic or stuck UI.
- Do not leave “zombie” engines (muted worklet still up, UI says Off) or green transport when cold.
- Prefer full teardown on failure over silent mute + misleading chrome.

---

## 7. No artificial smoothness on discontinuous domain params

- Parameters that **reshape the domain** (scale, lacunarity, zoom, seed, octaves, …) may jump the field when scrubbed — that is often **correct**.
- Do not invent crossfades or dual-field morphs solely to hide that unless product asks for it.
- Parameter-edit smoothers (one-pole, etc.) are optional UX; they are not a substitute for honest domain math.

---

## 8. Diagnostics and teaching graphics: debug-only

- Probe markers, mode tags, self-test chrome, evidence dumps: **debug UI on** only (e.g. `node-debug-only` / not under `keyboard-debug-hidden`).
- Production/default face stays clean.

---

## 9. Build identity and cache honesty

- Serve a rolling **build token** (and no-store on shell) so humans can confirm they loaded the build they think they loaded.
- When changing public JS that must not be cached stale, bump cache-bust query (or rely on build-token bust of scripts).

---

## 10. Prefer delete and simplify over soft recovery

- Invalid patches / failed loads: **hard fail with clear status**, not silent soft recovery that leaves unknown state.
- Prefer one obvious error path over multiple “best effort” branches that hide bugs.

---

## 11. Naming

- Prefer full, consistent product names where modules are siblings (e.g. **Fractal Brownian Field** next to **Fractal Brownian Motion**).
- Internal type ids (`fbmField`) may stay short; **user-facing labels** should not be cryptic abbreviations unless established brand.

---

## 12. UI stability (see also SANDBOX_DESIGN)

- No mouse-following tooltips / `title` hover clutter.
- No layout jitter from changing labels.
- Calm idle chrome; earn brightness with state.

---

## 13. Stereo jacks: M / L / R (not L / M / R)

App-wide stack order and jack chrome. Names keep their color; **Mono is always first**.

| Order | Channel | Jack RGB |
| --- | --- | --- |
| 1st | Mono (`M`, `In`/`Out` labeled Mono) | Green |
| 2nd | Left (`L`) | Red |
| 3rd | Right (`R`) | Blue |

RGB modules: `R` red, `G` green, `B` blue (`R` is never Right).

Chaos XYZ is RGB **by name**, not by slot: **X red, Y blue, Z green**. Unlabeled `Out` stays green.

- RGB chrome on **inlets and outlets**. Analog inlets stay cyan; analog outlets gold.
- Cables follow jack colors when UIDEV **wires follow port colors** is on (default). Dual-color gradient still matches both ends. Digital stays white. Off = gold analog / white digital.
- Full write-up: [MODULE_LAYOUT_PLAN.md](./MODULE_LAYOUT_PLAN.md) §11.

---

## 14. Resize widgets: hover only

- Floating-window SE grips (`.scene-context-resize-handle`), phone/condensed frame resize (`.node-graph-resize-handle`), and other app resize grips stay **visually hidden when idle**.
- **Show** on parent hover, handle hover / focus, or while actively dragging (`.dragging` / workspace `.resizing`).
- Hit targets may remain live under opacity `0` so the corner is still findable; locked windows stay non-interactive.
- Do not leave always-on glowing resize chrome on idle panels.

---

## Quick “should I?” checklist

| Idea | Usually |
|------|---------|
| Keep old param key so last week’s patch works | **No** (pre-feature-complete) |
| JS noise if WASM not ready | **No** — silence / black |
| CPU full-face fractal every frame | **No** — GPU / native grid |
| Face noise ≠ jack kernel | **No** — WISIWIH |
| Smooth scale scrub so it “sounds nice” | **No** unless product asks |
| Probe reticles always on | **No** — debug only |
| Dual path “just in case” | **No** — one path |
| Second formula for offline/render | **No** — same core as live (§5) |
| Re-sim graph for live video/scopes | **No** — observe worklet buffers (§5) |
| JS twin of native “so render works” | **No** — silence until WASM (§2 / §5) |
| JS computes the audio graph / per-sample DSP | **No** — JS is interface; C++ runs the circuit (§0 / §2) |
| Offer non-allowlisted DSP in efficient product shop | **No** — allowlisted live-audio types + observers (§0b) |
| Apply plan with foreign audio types in efficient mode | **No** — refuse: `not in efficient build` (§0b) |
| JS DSP fallback when type is off the efficient allowlist | **No** — hard cutover (§0b) |
| New `*-math.js` audio kernel instead of C++ | **No** — native only (§5) |
| Prefer `*_sample` WASM when `process_block` exists | **No** — use block boundary (§2) |
| Reserve 8 s × N delay rings in BSS for empty slots | **No** — size to live delay (§2b) |
| “Longer delay = more CPU” | **No** — same tap math (§2b) |
| Always-visible resize grip on panels | **No** — hover / drag only (§14) |

---

## Amendments

Add new rules here when the same class of mistake happens twice. Keep this file short and enforceable.
