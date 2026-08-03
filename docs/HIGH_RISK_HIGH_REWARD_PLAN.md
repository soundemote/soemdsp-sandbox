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
- Peel more dual live/worklet pairs onto helpers / `*-math.js` (filters, remaining oscs)
- Optional: small `node` smoke for pure helpers

**Recently shared:** phasor/pitch helpers, control-bus, param surfaces, rotate3d,
vectorscopeTransform, gain / bias / gainBias math.

**Refs:** `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`, `docs/PARAM_SURFACES.md`

---

## E — Used-modules WASM slim

**Goal:** player/embed can avoid downloading the full combined native binary.

**Still to do**
- External player shells (e.g. clapplayer) default to slim — out of this monorepo

**Done here:** `?wasmLoad=slim`, player-ish defaults, `nodeGraphLiveNativeWasmFetchReport()`.

See `docs/WASM_SLIM_LOAD.md`.

---

## D follow-up — Scopes paint peel

**Goal:** split remaining face paint/UI out of the big scopes file (maintainability only).

**Still to do**
- More buffer / sync / spectrum helpers still in `module-scopes.js`

**Peeled:** defaults, normalize, display-mode, phosphor, settings-form, settings-ui,
capture, number-readout, draw-basic, draw-burn, **paint-helpers** (1D burn, face plate,
late scope2d paths), **draw-orchestrator**

---

## Finished (not open)

| Item | Note |
|------|------|
| Worklet **evaluators.js** split | **Done** — `evaluators-sources` / `-processors` / `-utility` + thin merge shell. Further split optional only if a cluster file gets huge again. |
| Patch format migrators | Present but **not a priority**. Rename modules freely; old patches can fail. |

---

## SIGNAL IN audit (ongoing)

Oscillators should use shared helpers for `0.1V/Oct` / Phase / Amplitude jacks
(`nodeGraphParamResolveOscPitchHz`, `nodeGraphParamSignalInPhaseAdd`,
`nodeGraphParamSignalInAmplitude` / Additive).  
Pitch **processors** (e.g. pitchQuantizer) pass CV through — they do not need Hz resolve.

See `docs/PARAM_SURFACES.md`.

---

## Working agreement

1. One primary track at a time inside a session when possible.  
2. Parity before deleting dual DSP paths.  
3. Extract-only for D peels (same globals, new files, load order).  
4. Call graph nodes **modules**, not “products.”  
