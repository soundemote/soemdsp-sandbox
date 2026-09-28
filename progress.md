
## 2026-09-28 — 1D Trace ≠ 1D Waterfall rename (local, uncommitted)

- Architect correction: Instant Trace / `displayType: "trace"` / module types `traceDisplay*` were **1D Waterfall** (TraceTape strip-chart), not heart-monitor 1D Trace.
- Renamed waterfall identity to `waterfall` / `waterfallStereo` / `waterfallXyz` / `waterfallRgb`; `displayType` / renderer / settingsSchema `waterfall` (plus `waterfallRgb` / `waterfallXyz` where specialized).
- True 1D Trace remains `scope1dTrace` / `scope1dTraceStereo`.
- Shared face layout id `traceDisplay` → `scopeFace` (CSS class `scope-face-layout`).
- No commit/push; no legacy remap for old `"trace"` as waterfall.
﻿# Progress Ã¢â‚¬â€ soemdsp-sandbox



### Waterfall rename finished locally (no commit)

- Identity complete: module ids `waterfall*`, `displayType`/`renderer`/`settingsSchema` `waterfall` (+ rgb/xyz), mode keys `*Waterfall` where they were Instant-Trace strip modes.
- Shared Display Settings chrome left as `nodeGraphTraceDisplay*` / `traceDisplaySettings`.
- 1D Trace (`scope1dTrace`) untouched. Layout `scopeFace`.
- Send removal on Sabrina/SoEm/Delay/PingPong preserved (no `key: "send"`).

## 2026-09-27
- **B-061 fixed** â€” small slider readout stripped scientific exponents (`String(n)` â†’ `limit_decimals` mantissa-only). Plain-decimal expand in `node-graph-slider-metadata.js`.
Branch: `master` @ `4d25266` **SPEED LIMIT FIX** (and later hygiene if present).

## Agent Rules
- Do not ask questions unless truly blocked.
- Make reasonable assumptions and continue.
- Work on unfinished TODOs in order.
- Mark completed TODOs with [x].
- Add new bugs, ideas, or follow-up work as TODOs.
- Run smoke tests (`python scripts\smoke_test.py`) after each fix.
- Build native modules after editing `native_modules/*.cpp`.
- Do not run destructive commands, force pushes, production deploys, or database resets.
- When editing sandbox source, restore `public/presets/useruisettings.json` and `useruisettings.js` from commit `4639c84` before running smoke tests (the test's UI settings update contract writes them back dirty).
- Never put JavaScript on the audio path: no JS DSP evaluators, no restoring `create*State` / worklet-evaluator twins for allowlisted natives. Fix `setPlan` / native GraphEngine instead. Missing native = silence or refuse Ã¢â‚¬â€ never stubs.

## Bugs

Plan: **`docs/BUG_PLAN.md`** Ã¢â‚¬â€ numbered inventory (B-001Ã¢â‚¬Â¦). User reports go in that fileÃ¢â‚¬â„¢s Inbox; do not start a second list.

## Graphify

Plan: **`docs/GRAPHIFY_WINS_PLAN.md`** (primary work queue).

```text
graphify update . --force   # no LLM; AST re-extract
# Ã¢â€ â€™ graphify-out/GRAPH_REPORT.md  (gitignored)
```

### Parked (0.5.0 RGB)

- [ ] **Slider buffered modulation** Ã¢â‚¬â€ destination slider paints the real `readEffectiveParameter` buffer (occupancy + caret). Plan: `docs/SLIDER_BUFFERED_MODULATION_PLAN.md`. Do not start unless asked.

### Where we are
- **Track 1** Code Screen peel Ã¢â‚¬â€ **complete enough**: Box, Lookup, Registry, Workspace, Render (main shell ~1.8k events + script APIs)
- Scopes / Display Settings peels done; event-binder god-nodes stay fat
- **Dead CSS** Ã¢â‚¬â€ CORE_REDUCTION Phase C (opportunistic)
- **Product backlog** Ã¢â‚¬â€ `docs/FUTURE_PLANNING.md`

## Completed (selected)

### C++ AUDIO ENGINE CLEANING (2026-09-10, `execute-plan/papoulis-filter-finish`)
- Control chase SSOT: `control_frame` (all continuous Controls per sample; not per-knob)
- Sample-path gate: `node_needs_sample_accurate_controls` (Control sink / live IN / chase)
- Unified edges Port|Control + 1-sample / histBuf feedback (self-mod + cycle FM)
- Sine SSOT wavetable; PolyBLEP sine click fixed; JS DSP twins retired
- Contracts: `check_graph_engine_contracts.py` + ParamMod/self-mod/cycle smokes in native build
- Tip commits: `e03ee57c` Ã¢â‚¬Â¦ `b6412277`

### MODULE DELETE DOES NOT (should not) RESET AUDIO ENGINE (2026-09-10)
- Deleting any module (even unconnected) used `soemdsp_graph_clear` and recreated every native instance
- Fix: `soemdsp_graph_remove_node` + `clear_connections` + surgical `syncNativeGraphFromPlan`
- Survivors keep env/phase/filter state; smoke `smoke_remove_node_preserves_state.mjs`
- Commit: `5a6e8fbb`

### NORMALIZING DISPLAY SETTINGS UX (2026-09-10)
- Every module opens Display Settings (blank + Show in canvas if no face schema)
- Stop inventing Instant Waterfall settings for custom layout faces (envelopeCurve / filterCurve)
- Instant Waterfall monitors (Flower Child, Ã¢â‚¬Â¦) keep Instant Waterfall face + Instant Waterfall settings
- Right-click on display faces Ã¢â€ â€™ Display Settings (not Module Settings)
- Layout canvas Phase 1: Show in canvas + phone/F; condensed phone frame removed
- Commits: `4f6d8c93` Ã¢â‚¬Â¦ `b60b747e`



- [x] **CLAP host extracted** Ã¢â‚¬â€ https://github.com/soundemote/soemdsp-sandbox-claphost
- [x] **Code cleanup pass plan** Ã¢â‚¬â€ `docs/CODE_CLEANUP_PASS_PLAN.md`
- [x] **Core reduction** Phase A/B (floating window registry, Code Screen satellite)
- [x] **Soft Fractal** WebGL face, blur, pan, params, resource-agnostic pixelated app zoom
- [x] Graphify re-index after Soft Fractal land
- [x] Graphify re-index + scope paint-gate after oscilloscope freeze hunt

## Active / hygiene

- [x] Peel `node-graph-module-scope-settings-ui.js` by symbol cluster (form-io / field-edit / apply / window)
- [x] Speed Limit runtime-only; EQ 0 Hz; UI Settings action row fixed height (`4d25266`)
- [x] Scope paint gate (single live/pause/schedule policy)
- [ ] Ongoing: dead CSS when found (CORE_REDUCTION Phase C)
- [x] `graphify-out/` gitignored (local analysis only)

## Backlog Ideas
- Delay with exposed feedback path â€” insert arbitrary modules in the loop (seed in `docs/FUTURE_PLANNING.md`).
- Dimensional parameter prototyping â€” different settings across frequency/pitch (seed in ``docs/FUTURE_PLANNING.md``).
- Circuits on a keyboard â€” play circuits like a sample library (seed in ``docs/FUTURE_PLANNING.md``).
- Keytracking / pitch-tracking modulation UI (seed in ``docs/FUTURE_PLANNING.md``).
- True metamodule parameter mirror: outer `mx_*` edits/menus target inner child (one conceptual param); nested parent-unexpose vs grandparent-expose stays explicit (seed in `docs/FUTURE_PLANNING.md`). Website limited checkbox mirror ships first.
- Waterfall redesign (P2P bars): **implemented** on ArchIV — visual glance after reload (`docs/FUTURE_PLANNING.md`).

- [ ] Inlets/outlets above displays, app-wide (`docs/FUTURE_PLANNING.md`)
- [ ] **Sabrina instance handles** Ã¢â‚¬â€ multi-instance (`docs/INSTANCE_HANDLE_PATTERN.md`)
- [ ] Lo-Fi Pitch Shift component-first (`docs/LOFI_PITCH_SHIFT_PLAN.md`)

## Notes

- Plugin export / host packaging is **out of scope** for this repo (Make Plugin stays disabled placeholder).
- Use `graphify update .` after substantial code changes; open `graphify-out/GRAPH_REPORT.md` or `graphify god-nodes` / `graphify query "..."`.
