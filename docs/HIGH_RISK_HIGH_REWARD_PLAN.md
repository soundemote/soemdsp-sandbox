# High-risk / high-reward architecture plan

**Status:** Active  
**Constraint:** Large structural change is allowed, but each phase must ship behind **parity gates** (live + offline + save/reload). No silent behavior drift.

**Related:** `docs/ARCHITECTURE.md`, `docs/PARAM_SURFACES.md`, `docs/WASM_SLIM_LOAD.md`, `docs/PATCH_MIGRATIONS.md`, `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`.

---

## North star

Stop paying dual-implementation tax and hand-maintained type lists. One evaluation model, one module role schema, one patch migration path, load only the native code you need when slim.

```text
  definitions.role ──► execution plan
        │
        ▼
  pure module eval ──► live offline path
        │              └─► worklet path (same functions)
        ▼
  patchFormat N + migrators ──► renames without fear
        │
        ▼
  wasmLoad combined | slim ──► authoring vs player load size
```

---

## Phase ranking

| # | Bet | Status |
|---|-----|--------|
| **A** | Shared live/worklet DSP | **In progress** |
| **B** | Data-driven plan roles | **Done** |
| **C** | Patch schema + migrations | **Done** (format 2, knobb rename) |
| **D** | Mechanical megacore splits | **Done** for worklet; scopes partly peeled |
| **E** | Used-modules WASM slim | **In progress** (`?wasmLoad=slim`) |
| **F** | Param surfaces (domain / mod / signal In) | **Done** (stdlib + dual-lane) |

---

## Phase A — Shared DSP truth

### Goal
Every control/bus (and eventually every module) evaluates through **pure functions** loaded in main thread + worklet Blob.

### Done
- [x] control-bus helpers, phasor helpers, param-surface helpers  
- [x] Pitch helper on many oscs; Phase/Amp SIGNAL IN on softwave / dsf / curveOsc  
- [x] Inventory: `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md`

### Next
- More oscs/filters: Phase/Amp and pure `*-math.js` peels where dual live/worklet still thick  
- Optional node smoke for pure helpers  

### Non-goals
- Single mega-file of all DSP  
- Changing formulas “while we’re here” except intentional surface contracts (F)

---

## Phase B — Plan roles — **done**

`planRole` / `planFreeRun` on definitions; plan seeds via `nodeGraphModuleIsPlanSourceType` only.

---

## Phase C — Patch migrations — **done**

- Format version **2**  
- Migrators: phosphorLight→scope2d; valueSlider→knob + face field rename  
- See `docs/PATCH_MIGRATIONS.md`

---

## Phase D — Megacore splits

### Done
- Worklet: constructor shell (~13KB) + sibling method files  
- Scopes: defaults, normalize, display-mode, phosphor, settings-form peels  

### Optional next
- Further scopes paint/capture/UI clusters (see ARCHITECTURE — “scopes paint peel”)  
- Further split of worklet evaluators map if navigation still hurts  

---

## Phase E — Used-modules WASM slim

### Goal
Load only the native WASM needed for the current patch when configured for player/embed.

### Done
- [x] `?wasmLoad=slim` / `nativeWasm` / embed-config `wasmLoad`  
- [x] `nodeGraphMvp.live.nativeWasmLoadMode` override  
- [x] Default remains **combined** for authoring  
- [x] Docs: `docs/WASM_SLIM_LOAD.md`

### Next
- clapplayer / embed defaults to slim  
- Optional metrics (bytes fetched)  
- Watch memory cap if slim loads many standalone modules  

---

## Phase F — Param surfaces — **done**

DOMAIN / MOD / SIGNAL IN contracts in `node-graph-param-surface-helpers.js`.  
See `docs/PARAM_SURFACES.md`.

---

## Working agreement

1. One phase primary at a time; small commits inside the phase.  
2. Parity gate before deleting dual paths.  
3. No formula cleanup inside pure structural PRs (except deliberate F contracts).  

---

## Success criteria

- [x] New module ships with `planRole` (no hard-coded source list)  
- [~] Live and worklet share pure eval for control/bus + growing processor set (A)  
- [x] Patch renames via migrator (C)  
- [x] worklet multi-file; scopes multi-file start (D)  
- [~] Slim native load path available (E)  
- [x] Explicit param surfaces (F)  
