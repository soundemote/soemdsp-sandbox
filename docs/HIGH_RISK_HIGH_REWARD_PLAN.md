# Architecture plan — remaining work

Active bets only. Finished work lives in git history and `docs/ARCHITECTURE.md`.
**Session map:** `docs/SESSION_PROGRESS_2026-08-02.md`.

**Constraint:** live/offline/worklet parity for DSP you change.  
**Patch compatibility:** not a goal right now — **old patches may break** when module
types, ports, or format change. Prefer clean current graph over migrators.

---

## A — Shared live / worklet DSP

**Goal:** one pure formula path; thin live + worklet adapters.

**Still to do**
- Peel more dual live/worklet pairs onto helpers / `*-math.js` (filters, envelopes)
- Optional: small `node` smoke for pure helpers

**Shared recently:** gain/bias/gainBias, softClipper, comparator, sampleDelay, slewLimiter,
inertialFilter, sampleHold math; rotate3d, vectorscope, speedColorInertia (uses inertial math).

**Refs:** `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`, `docs/PARAM_SURFACES.md`

---

## E — Used-modules WASM slim

**Goal:** player/embed can avoid downloading the full combined native binary.

**Still to do**
- External player shells (e.g. clapplayer) default to slim — **out of this monorepo**

**Done in sandbox:** `?wasmLoad=slim`, player-ish query defaults, embed-config.example.json,
fetch report / `?wasmStats=1`, `nodeGraphLiveGetNativeWasmLoadMode()` on window after resolve.

See `docs/WASM_SLIM_LOAD.md`.

---

## D follow-up — Scopes paint peel

**Goal:** split remaining face paint/UI out of the big scopes file (maintainability only).

**Still to do**
- Remaining wipe-buffers / settings-local / canvas-lifecycle helpers in `module-scopes.js`

**Peeled:** … slots, buffer-view, **monitors**, **scene-controls**, **shader-settings**,
paint-helpers, draw-orchestrator (+ earlier peels)

---

## Finished (not open)

| Item | Note |
|------|------|
| Worklet **evaluators.js** split | Done — sources / processors / utility + shell |
| Patch format migrators | Not a priority; old patches may break |
| Osc SIGNAL IN pitch resolve | Major oscs on `nodeGraphParamResolveOscPitchHz` |
| Up/Down Slew + Inertial Filter | Both in **Filter** shelf for A/B |

---

## SIGNAL IN audit (ongoing)

Oscillators: shared pitch / Phase / Amp helpers.  
Pitch **processors** (pitchQuantizer, keyboard CV, …) pass `0.1V/Oct` through — no Hz resolve.

See `docs/PARAM_SURFACES.md`.

---

## Working agreement

1. One primary track at a time when possible.  
2. Parity before deleting dual DSP paths.  
3. Extract-only for D peels (same globals, new files, load order).  
4. Call graph nodes **modules**, not “products.”  
