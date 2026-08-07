# Policy compliance audit — module DSP

**Date:** 2026-08-03  
**Against:** [APP_POLICY.md](./APP_POLICY.md) especially **§2** (no JS twin of native), **§5** (module DSP lives in one place), **§4** (WISIWIH).  
**Scope:** Catalog native types (~82) + pure-JS modules with dual live/worklet paths.

This is an inventory. **Aligned to §5 (main-thread WASM offline + native worklet)** as of follow-up work:

- `polyBlep` / `blit` / `osc`
- `hypersaw` (offline WASM; phosphor JS shadow bank still present — later)
- `dsfOscillator` (dead JS helpers removed)
- `additiveOsc` (dead JS helpers removed; graph CV → silence)
- `sinc` / `softwaveOsc` (new native modules)

**Left alone / under construction:** `wallDelay` (already in under-construction set).

---

## Summary

| Bucket | Count (approx) | Policy |
|--------|----------------|--------|
| Native live + native worklet (same core) | **~14** types | OK §5 |
| Native **worklet** OK, offline **JS twin** | **~63** types | **§5 fail** |
| Native + worklet **JS algorithm still in tree** (fallback or shadow) | several | **§2 / WISIWIH risk** |
| Pure JS, dual host (live + worklet copy) | softwave, sinc, curveOsc, … | OK if same source; **§5 smell** if duplicated body |
| Wall Delay inverted (JS worklet / native-ish live) | 1 | **§5 fail** |

**Headline:** Live audio for most native modules is on WASM. **Offline/Render Sample for ~60+ native modules still re-runs a different host implementation** (usually pure JS in `node-graph-*.js` or live evaluator math), not the same `.wasm` export. That is exactly the dual-core problem §5 forbids.

---

## A. Compliant pattern (reference)

**Hosts only; one core; silence if missing.**

Examples that already load/call native on **main thread** for offline (and worklet for live):

| Type | Main-thread native glue |
|------|-------------------------|
| `polyBlep`, `blit`, `osc` | `modules/polyBlep/poly-blep-live-evaluator.js` |
| `antisaw` | `node-graph-antisaw.js` |
| `bradley2a` | `node-graph-bradley-2a.js` |
| `chuaAttractor` | `node-graph-chua-attractor.js` |
| `henonMap` | `node-graph-henon-map.js` |
| `logisticMap` | `node-graph-logistic-map.js` |
| `lorenzAttractor` | `node-graph-lorenz-attractor.js` |
| `rayBouncer` | `node-graph-ray-bouncer.js` |
| `fbmField` | `node-graph-fbm-field.js` |
| `pll`, `helmholtzPitch`, `piSpigotNoise`, `reverbEffect` | respective live/native glue |
| `wallDelay` | live path has native hooks (worklet is separate issue — see C) |

---

## B. §5 violations — native module, offline still not the native core

Worklet typically calls `soemdsp_*`; offline live evaluator calls **JS** (`nodeGraph*Sample`, inlined math, or stdlib), **not** the same WASM instance.

**~63 types**, including high-traffic audio:

### Oscillators / generators
`additiveOsc`, `aliasSine`, `dsfOscillator`, `ellipsoid`, `hypersaw`, `noiseGenerator`, `phosphillator`, `robinSupersaw`, `sineWavetable`, `snowflake`, `surgeOscillator`,  
Jerobeam family: `blubb`, `boing`, `keplerBouwkamp`, `mushroom`, `nyquistShannon`, `radar`, `spiral`, `torus`, `wirdoSpiral`,  
plus `fractalSpiral`, `logSpiral`, `pulseExplosion`, `randomWalk`, `randomClock`, …

### Filters
`activeFilter`, `chaoticPhaseLockingFilter`, `flowerChildFilter`, `humanFilter`, `ladderFilter`, `papoulisFilter`, `passiveFilter`, `resonatorFilter`, `superloveFilter`, `tb303Filter`, `yellowjacketFilter`

### Delays / dynamics / utility (native in catalog)
`delayEffect`, `pingPongDelay`, `sampleDelay`, `sampleHold`, `slewLimiter`, `softClipper`,  
`expAdsr`, `linearEnvelope`, `pluckEnvelope`, `flowerChildEnvelopeFollower`,  
`clock`, `transport`, `triggerCounter`, `triggerDivider`, `delayedTrigger`,  
`comparator`, `minMax`, `metallicRatio`, `lutCell`, `chordMemory`, `chordSequencer`,  
`stepSequencer`, `turingMachine`, `pitchQuantizer`, `fractalBrownianNoise`, …

**Fix shape (same as polyBlep):** lazy `WebAssembly.instantiate` of that module’s `.wasm` on main; offline evaluator only schedules + calls exports; silence until ready. Delete or stop calling the JS twin for audio.

---

## C. Special / inverted cases

### `wallDelay`
- **Live** evaluator: native/wasm-related path present.  
- **Worklet:** large **JS port** of room + DSP (`wall-delay-worklet-evaluator.js` comments say 1:1 port from main).  
- Violates “one core”: two full implementations; risk of drift. Prefer one WASM (or one pure core loaded both places), not dual full ports.

### `hypersaw`
- **Worklet audio:** native-only (throws if not ready — harsh vs §2 “silence”, but not a JS audio twin).  
- **Worklet display:** `hypersawAdvanceVoices` — **JS shadow bank for phosphor** (comment: not audio fallback). **WISIWIH risk** if face phases ≠ native audio voices.  
- **Offline:** `nodeGraphHypersawSample` — **JS**, not `hypersaw.wasm` → **§5 fail** for Render Sample.

### `additiveOsc`
- **Worklet (no graph CV):** native sample, else **0** (good §2).  
- **Offline:** `nodeGraphAdditiveOscillatorSample` — **JS** → **§5 fail**.  
- File still contains large **JS harmonic tables** (`additiveWaveformHarmonic`, …) — dead or graph-path risk; §2 hygiene: remove if unused.

### `dsfOscillator`
- **Worklet:** native preferred, then **`{ Out: 0 }`** (good). JS Dirichlet helpers remain in file (dead twin hygiene).  
- **Offline:** pure JS state machine → **§5 fail**.

### `sineWavetable` (SinCos)
- Worklet builds a **JS wavetable** (`Math.sin` fill) and may also touch native — dual story. Offline uses main-thread table helpers in `node-graph-oscillator-runtime.js`.  
- Needs explicit “single table/core” decision.

### `blit` / `osc`
- No separate module folders; shared polyBlep evaluators. **Now** main-thread native (post-fix). OK if kept that way.

---

## D. §2 — JS twin of native (worklet)

Policy: if native exists, **no parallel JS algorithm** for audio when native fails → silence.

| Severity | Examples |
|----------|----------|
| **Clear dual audio path** | Any worklet that still **computes** the sound in JS when native is cold (audit candidates evolve; re-grep `fallback` + `Math.sin` + `soemdsp_`). Prefer silence. |
| **Dead twin code** | Full JS bodies left after switching to native+silence (`additiveOsc` harmonic helpers, `dsf` pure-saw eng, etc.) — delete to prevent reuse. |
| **Display twin** | `hypersaw` voice shadow for phosphor — document or drive display from native exports only. |
| **Throw instead of silence** | `hypersawSample` throws if native not ready — can kill worklet; §2 prefers silence + status. |

---

## E. Pure-JS modules (no native catalog entry)

Not §2 (no native). Still §5: **one math, two thin hosts**.

| Module | Notes |
|--------|--------|
| `sinc` | Stdlib kernel + worklet inlines Dirichlet (comment: keep in step with live). **Duplicated body** risk — should call shared `node-graph-sinc-kernel.js` in both hosts if Blob allows, or one shared function string. |
| `softwaveOsc` | Live + worklet both implement DistortionOscillator-style shapes; no `*-math.js` single file. |
| `curveOsc` | Dual host pattern. |
| `cookbookFilter` | Dual host. |
| `gpuAdditiveOsc` | Shares additive live evaluator; GPU queue on worklet — intentional second path for GPU product. |

~33 modules have `*-math.js` (good A3 pattern). Prefer that for all pure-JS DSP.

---

## F. Live chaos / video (policy §5 “one universe”)

This audit did **not** prove every scope only reads worklet rings.  
Known-good direction: worklet `scope-io` / visual buffers.  
Risk: any main-thread free-run that **re-evaluates** processors for faces while audio is live.

**Not fully audited here** — flag as separate pass (faces + `planRole: monitor` + free-run).

---

## G. Priority fix order (recommended)

1. **High audio / render parity** (same as polyBlep pattern)  
   `dsfOscillator`, `additiveOsc`, `hypersaw`, `robinSupersaw`, `sineWavetable`, `surgeOscillator`, major **filters** used in feedback (`ladderFilter`, `resonatorFilter`, `yellowjacketFilter`, `superloveFilter`, `chaoticPhaseLockingFilter`, …).

2. **Remove dead JS twins** in worklets already native+silence.

3. **wallDelay** — pick one engine (native or pure), both hosts call it.

4. **Pure JS** — peel softwave/sinc/curveOsc into single `*-math.js` / stdlib, thin adapters only.

5. **WISIWIH** — hypersaw (and similar) display must not invent a second voice bank.

6. **Chaos A/V** — audit monitors: observe worklet only.

---

## H. How to re-run this audit

```text
- native list: public/native-modules-catalog.json → targetType
- offline native? live evaluator or node-graph-*.js contains WebAssembly / soemdsp_
- worklet native? *-worklet-evaluator.js contains soemdsp_ / native*Ready
- twin? both soemdsp_ and substantial Math.sin / harmonic loops for audio
```

Update this file when a family is migrated so the “~63” list shrinks.
