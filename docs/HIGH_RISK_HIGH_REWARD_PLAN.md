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
| **B** | Data-driven plan roles | No more 5× type lists | Mute whole shelves if wrong | **2 — next** |
| **C** | Patch schema + migrations | Free renames (Knob type id, params) | Bad migration = lost patches | **3** |
| **D** | Mechanical megacore splits | Maintainability | Load-order / missing registers | **4** |
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

### Next slices (A1–A4)
| Slice | Work | Gate |
|-------|------|------|
| **A1** | Inventory modules that still duplicate live vs worklet (osc family, filters mono/L/R) | Grep report |
| **A2** | Extract next pure batch (e.g. mono/L/R filter passthrough skeleton, pitch helpers already partial) | Same output sample-for-sample on a fixed patch |
| **A3** | Convention: new modules **must** ship pure eval + thin adapters only | Doc in MODULE_PATTERN_REFERENCE |
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
1. **B0** — Add fields to definitions for all current types that appear in lists; defaults preserve today’s behavior.
2. **B1** — Plan code: `if (def.planRole === "source" || legacyList.has(type))` — dual path.
3. **B2** — Log/assert any type that legacy and def disagree.
4. **B3** — Remove legacy lists once zero disagreements for a soak period.

### Gate
- Fixed regression patches: oscillator → filter → Output plays
- Unwired scope/monitor still paints when it does today
- Plugin Output still reachable

---

## Phase C — Patch format + migrations

### Goal
```js
patch.patchFormat = 1; // integer, bumped on breaking shape changes
```

Migrators run on load **before** unknown-type throws:

```text
load → migrate to current → normalize → compile
```

### First migrations (examples)
| From | To |
|------|-----|
| (implicit 0) | `patchFormat: 1` |
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

1. Commit + push current WIP (modules, helpers, Plugin shelf, snowflake native, cleanup).
2. Land this plan doc.
3. Begin **B0**: design `planRole` fields and annotate modules already on legacy lists (no plan logic switch yet).
4. Continue **A**: document helper convention; next duplicate batch as capacity allows.

---

## Success criteria (program-level)

- [ ] New module can ship without editing `sourceNodes` hard-coded list (Phase B complete)
- [ ] Live and worklet share pure eval for all control/bus + majority of processors (Phase A mature)
- [ ] Patch renames possible via migrator (Phase C)
- [ ] worklet-core and scopes are multi-file without behavior change (Phase D)
