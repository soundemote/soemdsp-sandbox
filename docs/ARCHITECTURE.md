# soemdsp-sandbox architecture map

North-star layout after the high-risk refactor track (`docs/HIGH_RISK_HIGH_REWARD_PLAN.md`).
Prefer this over outdated “four edit points” mental models when they conflict.

## Layers

```text
┌─────────────────────────────────────────────────────────────┐
│  UI / chrome                                                │
│  modules/*/register + ui · chromeless registry · LayoutA/B  │
├─────────────────────────────────────────────────────────────┤
│  Patch model                                                │
│  format.version + migrators → validate → normalize → plan   │
├─────────────────────────────────────────────────────────────┤
│  Execution plan                                             │
│  planRole (source|processor|sink|monitor|always)            │
│  free-run: role / planFreeRun / visualSink / empty inputs   │
├─────────────────────────────────────────────────────────────┤
│  DSP evaluation (two lanes, same formulas)                  │
│  · Offline / render: live evaluators + pure stdlib          │
│  · Live: AudioWorklet Blob (stdlib → core → method files)   │
├─────────────────────────────────────────────────────────────┤
│  Faces / scopes                                             │
│  module-scopes (still large) · per-module display/GL        │
└─────────────────────────────────────────────────────────────┘
```

## Module contract (new modules)

1. **Definition** — `planRole`, ports, parameters (in `module-definitions.js` or chromeless `register`).
2. **Catalog** — store entry / chromeless catalog (browser metadata).
3. **Pure math** (when non-trivial) — `modules/<type>/*-math.js` or stdlib helper; load on main + worklet Blob.
4. **Thin live evaluator** — `modules/<type>/*-live-evaluator.js` → `nodeGraphLiveModuleEvaluators`.
5. **Thin worklet evaluator** — prototype method or map entry; prefer shared pure functions.
6. **Face** (optional) — ui + display/GL; visual sinks set `visualSink` + usually `planRole: "monitor"`.

Do **not** edit hard-coded `sourceNodes` lists (retired). Annotate `planRole: "source"` instead.

## Plan roles

| Role | Meaning |
|------|---------|
| `source` | Free-running seed (osc, controls, generators) |
| `processor` | Needs graph connectivity; free-runners declare `planFreeRun: true` |
| `sink` | Audio out / plugin out |
| `monitor` | Visual / meter sinks that still evaluate |
| `always` | Interactive shell even when sparsely wired |

Helpers: `public/node-graph-plan-roles.js`  
Coverage: `nodeGraphPlanRoleCoverageReport()` in console.

## Patch pipeline

```text
load → migrateNodeGraphPatchToCurrent → validateNodeGraphPatch → compileNodeGraphExecutionPlan
```

See `docs/PATCH_MIGRATIONS.md`.

## AudioWorklet Blob order (Phase D)

```text
phasor-helpers · control-bus-helpers · parameter-smoother-filters
node-live-audio-worklet-core.js          (~13KB: consts + class + constructor)
  · graph · smoother · param-map · destroy · analog · dsp-state
  · events · visual · scope-io · native-load
  · evaluators · native-exports · set-plan · clear-plan
  · handle-message · scope-snapshot · evaluate-frame · process
per-module *-worklet-evaluator.js
node-live-audio-worklet-register.js      (registerProcessor last)
```

Main-thread faces load order:

```text
scope-defaults → normalize → display-mode → phosphor → settings-form
  → settings-ui → capture → number-readout → draw-basic → draw-burn
  → scopes.js → spectrum → buffer-io → sync → metrics → geometry
  → webgl → vertices → offline → screen-items → slots → buffer-view
  → monitors → scene-controls → shader-settings
  → paint-helpers → draw-orchestrator
```

Mechanical rule: **extract only** — same method bodies on `NodeLiveAudioProcessor.prototype`.

## Shared DSP (Phase A + F)

| File | Responsibility |
|------|----------------|
| `stdlib/node-graph-phasor-helpers.js` | wrap01, trisaw, pitched frequency, phase advance |
| `stdlib/node-graph-control-bus-helpers.js` | Bias/In, stereo mix, external in, MIDI ports |
| `stdlib/node-graph-param-surface-helpers.js` | **DOMAIN / MOD / SIGNAL IN** contracts (Phase F) |
| `stdlib/node-graph-shared-dsp-helpers.js` | trigger divider, one-pole, noise channel state |
| `stdlib/node-graph-analog-filter-helpers.js` | analog filter math |

New DSP should land as pure functions first, then thin adapters.

**Param surfaces:** see `docs/PARAM_SURFACES.md`.

## Scopes paint peel (optional Phase D follow-up)

`node-graph-module-scopes.js` still holds most **paint / capture / phosphor draw /
settings chrome** after peels for defaults, normalize, display-mode, phosphor
helpers, and form HTML builders.

A “paint peel” means extracting more **symbol clusters** (e.g. capture pipeline,
scope2d burn paint, number-readout paint) into sibling files — **not** a random
line-cut. Goal: smaller files to navigate; same globals and load order.

Not required for sound or patches; pure maintainability.

## Still large (optional)

- Further scopes paint/capture clusters  
- Worklet `evaluators.js` map split if still painful

## Related docs

- `HIGH_RISK_HIGH_REWARD_PLAN.md` — phased bets and gates  
- `MODULE_PATTERN_REFERENCE.md` — module translation patterns  
- `ADDING_HARDCODED_SANDBOX_MODULE.md` — step-by-step add  
- `A1_LIVE_WORKLET_DSP_INVENTORY.md` — dual-lane inventory  
- `PATCH_MIGRATIONS.md` — format migrators  
