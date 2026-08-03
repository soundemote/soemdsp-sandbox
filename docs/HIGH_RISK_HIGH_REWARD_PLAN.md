# High-risk / high-reward architecture plan

**Status:** Active — started 2026-08-02  
**Constraint:** Large structural change is allowed, but each phase must ship behind **parity gates** (live + offline + save/reload). No silent behavior drift.

**Related:** `docs/CODE_CLEANUP_PASS_PLAN.md` (hygiene), this doc (structural bets).

---

## North star

Stop paying dual-implementation tax and hand-maintained type lists. One evaluation model, one module role schema, one patch migration path.

```text
  definitions.role ──► execution plan
        │
        ▼
  pure module eval ──► live offline path
        │              └─► worklet path (same functions)
        ▼
  patchFormat N + migrators ──► renames without fear
```

---

## Phase ranking

| # | Bet | Reward | Risk | Start order |
|---|-----|--------|------|-------------|
| **A** | Shared live/worklet DSP (continue) | One bug class dies; faster modules | Worklet Blob globals | **1 — in progress** |
| **B** | Data-driven plan roles | No more 5× type lists | Mute whole shelves if wrong | **2 — B3 plan list retired** |
| **C** | Patch schema + migrations | Free renames (Knob type id, params) | Bad migration = lost patches | **3 — C0 pipeline landed** |
| **D** | Mechanical megacore splits | Maintainability | Load-order / missing registers | **4 — evaluators extract done** |
| **E** | Used-modules WASM slim | Load size / player readiness | Incomplete dep walk | Later |
| **F** | Param surface model (In vs mod) | End slider≠readout class | Feel shift on all patches | Later, explicit product |

---

## Phase A — Shared DSP truth (continue)

### Goal
Every control/bus (and eventually every module) evaluates through **pure functions** loaded in:

1. Main thread (`index.html`)
2. Worklet Blob (`nodeGraphLiveWorkletSourceFiles`, **before** worklet-core)

### Done so far
- [x] `node-graph-control-bus-helpers.js` — Bias/In, stereo mix, external stereo, MIDI ports
- [x] Thinned live evaluators: valueSlider, plugin*, output, audioInput, midiOut
- [x] Worklet dispatch uses same helpers for those types
- [x] Restored full `curveOsc` + `snowflake` definitions (catalog was labels/store-only)

### Next slices (A1–A4)
| Slice | Work | Gate |
|-------|------|------|
| **A1** | [x] Inventory — `docs/A1_LIVE_WORKLET_DSP_INVENTORY.md` | Grep report |
| **A2** | [~] Live + worklet pitch helper batch (many oscs); continue remainder | Sample parity |
| **A3** | [x] Convention in MODULE_PATTERN_REFERENCE + ARCHITECTURE.md | Doc |
| **A4** | Optional: worklet unit smoke that imports helpers and checks a few vectors | `node` smoke script |

### Non-goals this phase
- Single mega-file of all DSP
- Changing formulas “while we’re here”

---

## Phase B — Data-driven execution plan roles

### Goal
Replace hard-coded type lists in:

- `compileNodeGraphExecutionPlan` source filter
- `nodeGraphModuleProducesOutputWithoutSignalInput` set
- Similar allow-lists as discovered

…with **declaration on the module definition**:

```js
// conceptual
{
  planRole: "source" | "processor" | "sink" | "monitor" | "always",
  // optional refinements:
  planSink: true,           // audio out / pluginOutput
  planAlwaysEvaluate: true, // interactive faces even if unwired
}
```

### Rollout (critical)
1. **B0** — [x] `planRole` on definitions + chromeless registers; `node-graph-plan-roles.js` helpers.
2. **B1** — [x] Dual path (historical).
3. **B2** — [x] `nodeGraphPlanRoleLegacyDisagreements()` for console soak.
4. **B3** — [x] Plan `sourceNodes` uses **only** `nodeGraphModuleIsPlanSourceType`.  
5. **B3b** — [x] Removed `NODE_GRAPH_PLAN_LEGACY_SOURCE_TYPES`; roles come from `planRole` (+ realtime-osc / sink / monitor / chromeless fallbacks). Coverage: `nodeGraphPlanRoleCoverageReport()`.
6. **B4** — [x] Bulk-annotate remaining defs (~90); free-run via roles + residual set.
7. **B5** — [x] Residual set removed; free-runners declare `planFreeRun: true` (incl. chromeless stepGrid/groupOutput).

### Gate
- Fixed regression patches: oscillator → filter → Output plays
- Unwired scope/monitor still paints when it does today
- Plugin Output still reachable

---

## Phase C — Patch format + migrations

### Goal
```js
patch.format = { kind: "soemdsp-sandbox-node-patch", version: N };
```

Migrators run on load **before** unknown-type throws:

```text
load → migrateNodeGraphPatchToCurrent → validate/normalize → compile
```

### Done (C0)
- [x] `public/node-graph-patch-migrations.js` — version climb + phosphorLight rename
- [x] Wired at start of `validateNodeGraphPatch`
- [x] `index.html` loads migrations before patch-core

### First migrations (examples)
| From | To |
|------|-----|
| (implicit 0) | `format.version: 1` + phosphorLight→scope2d |
| Future: `valueSlider` type rename | `knob` + face field rename |
| Future: param key renames | mapped with defaults |

### Gate
- Old patches from 0.4.3 open without data loss
- Retired types still drop cleanly (`clapPlugin`, etc.)

---

## Phase D — Mechanical megacore splits

### Goal
Split without behavior change:

1. `node-live-audio-worklet-core.js` → native load / process / evaluators map (files only)
2. `node-graph-module-scopes.js` → settings schemas vs paint vs capture (files only)

### Done
- [x] `buildLiveModuleEvaluators` → `…-evaluators.js`
- [x] `applyNativeModuleExports` → `…-native-exports.js`
- [x] `setPlan` / `clearPlan` / `handleMessage` / `postModuleScopeSnapshot`
- [x] `evaluateFrame` / `process` → dedicated files
- [x] Graph math cluster → `node-live-audio-worklet-graph.js`
- [x] Parameter smoother cluster → `node-live-audio-worklet-smoother.js`
- [x] Native destroy* cluster → `node-live-audio-worklet-destroy.js` (~72 methods)
- [x] visual / scope-io / native-load / analog / param-map / events / dsp-state
- [x] scopes pure defaults → `scope-defaults.js`
- [x] scopes normalize* + display-mode helpers → `scope-normalize.js` / `scope-display-mode.js`
- [x] scopes phosphor energy + settings-form HTML peels
- [x] worklet-core slimmed to **~13KB** constructor shell (all methods on prototype siblings)
- Original megacore ~363KB → modular tree; scopes ~556KB → ~539KB (+ peels)

### Next D slices
- [ ] scopes: remaining paint/capture HTML (optional)
- [ ] worklet: evaluators map / setPlan further subdiv if needed

### Rule
**Extract only** in first PR: same functions, new files, same load order. No renames of public globals until extract settles.

---

## Phase E / F — Later

- **E:** Used-module WASM subset for load time + clapplayer.
- **F:** Explicit param surfaces (signal In / unit mod / domain knob) — product-visible; schedule deliberately.

---

## Working agreement

1. **One phase primary** at a time; small PRs inside the phase.
2. **Parity gate** before deleting dual paths or legacy lists.
3. **No formula “cleanup”** inside structural PRs.
4. Commit messages: `refactor(plan): …` / `feat(patch): format N migration` — not mixed with feature modules unless necessary.

---

## Immediate start (this session)

1. [x] Commit + push Plugin shelf / control-bus / plan B0 (`322a111`).
2. [x] Land this plan doc.
3. [x] **B0/B1/B3**: plan roles; restore curveOsc/snowflake; retire plan OR-chain.
4. [x] **C0** migrator pipeline; **D** evaluators extract; **A1** inventory + pitch helper on new oscs.
5. [x] B legacy set removed; free-run residual thinned; worklet graph+smoother extracted; ARCHITECTURE.md.
6. [x] residual → `planFreeRun`; destroy* extract; free-run declaration-complete.
7. [x] More worklet clusters + scopes defaults peel.
8. [x] scopes normalize + display-mode; worklet events/dsp-state; core shell ~13KB.
9. **Next:** optional scopes paint split; C1 renames when product-ready.

---

## Success criteria (program-level)

- [x] New module can ship without editing `sourceNodes` hard-coded list (annotate `planRole: "source"`)
- [ ] Live and worklet share pure eval for all control/bus + majority of processors (Phase A mature)
- [x] Patch renames possible via migrator (Phase C0 pipeline; C1 renames TBD)
- [x] worklet-core multi-file (core + 8 method modules); scopes still monolith (Phase D)
