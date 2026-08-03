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
- Peel more dual live/worklet pairs onto helpers / `*-math.js` (filters, pluck envelope, heavier sources)
- Optional: small `node` smoke for pure helpers

**Shared extensively:** utilities, clocks, sequencers, chaos maps/attractors (henon, logistic, lorenz, chua), envelopes (linear, exp ADSR), noise, slews, etc.  
**Refs:** `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`, `docs/PARAM_SURFACES.md`

---

## E — Used-modules WASM slim

**Goal:** player/embed can avoid downloading the full combined native binary.

**Still to do**
- External player shells (e.g. clapplayer) default to slim — **out of this monorepo**

**Done in sandbox:** slim mode, player-ish defaults, embed-config.example.json, fetch
report / `?wasmStats=1`, window APIs, plan status `/ wasm slim|combined [KiB]`,
`nodeGraphMvp.live.nativeWasmLoadMode` mirror.

See `docs/WASM_SLIM_LOAD.md`.

---

## D follow-up — Scopes paint peel

**Goal:** split face paint/UI out of the megacore scopes file.

**Status:** **Effectively complete.** Core `module-scopes.js` is now a thin shell
(~state + snapshot listeners + scalar helper + drawFrame entry, ~5–6KB).

**Peeled files:** defaults, normalize, display-mode, phosphor, settings-form,
settings-ui, capture, number-readout, draw-basic, draw-burn, spectrum, buffer-io,
sync, metrics, geometry, webgl, vertices, offline, screen-items, slots,
buffer-view, monitors, scene-controls, shader-settings, trace-controls, wipe,
graph-query, **settings**, **lifecycle**, **canvas**, paint-helpers, draw-orchestrator.

**Optional later:** further split of any still-large peel (offline, vertices, settings-ui).

---

## Finished (not open)

| Item | Note |
|------|------|
| Worklet **evaluators.js** split | Done — sources / processors / utility + shell |
| Patch format migrators | Not a priority; old patches may break |
| Osc SIGNAL IN pitch resolve | Major oscs on `nodeGraphParamResolveOscPitchHz` |
| Up/Down Slew + Inertial Filter | Both in **Filter** shelf for A/B |
| Scopes megacore peel | Done (thin shell remains) |

---

## SIGNAL IN audit (ongoing)

Oscillators: shared pitch / Phase / Amp helpers.  
Pitch **processors** pass CV through — no Hz resolve.

See `docs/PARAM_SURFACES.md`.

---

## Working agreement

1. One primary track at a time when possible.  
2. Parity before deleting dual DSP paths.  
3. Extract-only for D peels (same globals, new files, load order).  
4. Call graph nodes **modules**, not “products.”  
