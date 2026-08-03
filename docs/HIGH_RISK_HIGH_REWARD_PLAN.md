# Architecture plan — remaining work

Active bets only. Finished work lives in git history and `docs/ARCHITECTURE.md`.
**2026-08-02 session map:** `docs/SESSION_PROGRESS_2026-08-02.md`.

**Constraint:** parity gates (live + offline + save/reload). No silent behavior drift.

---

## A — Shared live / worklet DSP

**Goal:** one pure formula path; thin live + worklet adapters.

**Still to do**
- Peel more dual live/worklet pairs onto helpers / `*-math.js` (Phase/Amp, pitch, filters)
- Optional: small `node` smoke for pure helpers

**Recently shared:** phasor/pitch helpers, control-bus, param surfaces, rotate3dTo2d + vectorscopeTransform math.

**Refs:** `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`, `docs/PARAM_SURFACES.md`

---

## E — Used-modules WASM slim

**Goal:** player/embed can avoid downloading the full combined native binary.

**Still to do**
- clapplayer / external player shell default to slim (not this monorepo)
- Optional: bytes-fetched metrics / diagnostics  

**How it works:** patch decides types → slim fetches those WASM only.  
Not module-browser filtering. See `docs/WASM_SLIM_LOAD.md`.

**In code:** `?wasmLoad=slim`, player-ish query defaults (`hideui`/`autostart`/`player`), embed-config, live override.

---

## D follow-up — Scopes paint peel

**Goal:** split remaining face paint/capture/UI out of the big scopes file for maintainability only (no sound change).

**Still to do**
- Trace display settings UI chrome (forms already partly peeled)
- Remaining orchestrator / typed-item dispatch in scopes.js

**Peeled:** defaults, normalize, display-mode, phosphor, settings-form, capture, number-readout, **draw-basic**, **draw-burn**

---

## Optional / later

| Item | Note |
|------|------|
| Worklet `evaluators.js` further split | Navigation only |
| Param surface SIGNAL IN audit | All Phase/Amp jacks consistent |
| Product renames via migrators | **Format 3+ only when we rename types/ports on purpose** — load-time pure map so old patches open. Format 2 already did `valueSlider`→`knob`. Not a standing backlog task. |

---

## Working agreement

1. One primary track at a time inside a session.  
2. Parity before deleting dual paths.  
3. Extract-only for D peels (same globals, new files, load order).  
