## 2026-09-28 - B-079 Choices range clamp subset remap (local, uncommitted)

- User: Limiting choices param range (PolyBLEP Waveform 4-5 Tri/Sine) left full-catalog dividers/labels.
- Cause: Discrete choice index required span===choices.length; clamp fell through to proportional map over full list; dividers used full catalog length.
- Fix: nodeGraphResolveChoiceSet + choiceOriginMin; index/label/type-in/dividers use filtered subset; persist origin in paramMeta/slider/factories/editor. Cache-bust b079-choice-range-1.
- Verify: node scripts/test_b079_choice_range_remap.js (+ test_knob_choice_neg.js). Doc docs/B-079_CHOICES_RANGE_CLAMP_SUBSET.md. No push.


## 2026-09-28 � Trace/Phosphor faces lost after waterfall rename (local, uncommitted)

- Cause: WIP waterfall rename replaced `NODE_GRAPH_MODULE_WIDGET_BAND_ID.trace ? face` with `waterfall ? face`, but `scopeFace` layout still emitted band id `"trace"`. LayoutA `faceBandVisible` only checked `band.id === "face"`, so Trace / Phosphor / Instant Waterfall monitors got `face-track-omitted` ? CSS `display:none` on the face.
- Not displayType/settingsSchema stripping; defs still had `displayType` + `layout: "scopeFace"`.
- Fix: scopeFace band id `"face"`; restore `trace: "face"` alias; canonical `faceBandVisible`. Also register `scope1dTrace` / stereo thrus + WiredInputs.
- Verify: `node scripts/test_module_layout_bands.js`. No push.

## 2026-09-28 — Acoustic Pluck native module (local, uncommitted)

- Baked `patches/modulator breadboards/pluck envelope.json` feedback AR into native **Acoustic Pluck** (`acousticPluck` / opcode 198).
- Algorithm: Curve AR + env→invert→atten(Feedback,Bias)→Amp Curve Exp→unit-MOD Release (128-sample fb delay). Demo keyboard/PolyBLEP/filter/portals/orphan KT attack path discarded.
- Files: `native_modules/acoustic_pluck/`, defs/store/efficient allowlist, graph_engine + combined wasm, face PreviewCurve, smoke `scripts/smoke_graph_acoustic_pluck.mjs`.
- Breadboard patch left intact (portal-splice smoke still green). No commit/push.



## 2026-09-28 — Tube Sat 1D Trace + crt-amber (local, uncommitted)

- Restored Tube Saturation face as **scope1dTrace** (TraceWoscope), not lineBurn phosphor / not curve canvas.
- New shared colormap `crt-amber` / kind `crtAmber`; Tube Sat `defaultDisplaySettings.gradientStops` seeds it.
- Docs: `docs/FEATURE_TUBE_SAT_CRT_AMBER.md`. No PR/push.

## 2026-09-28 — B-077 Keyboard Inc host CV (local, uncommitted)

- User: Keyboard not sending out Inc.
- Cause: efficient sidecar `buildCv` computed `increment` but never published `outs.inc` (retired keyboard live evaluator did). Same host-CV class as B-070 keypad, different port.
- Fix: publish `outs.inc = cv.increment` Pass 1 + Pass 2 for `keyboard`; cache-bust `keyboard-inc-1`. No JS DSP evaluator restore.
- Docs: `docs/B-077_KEYBOARD_INC_HOST_CV_MISSING.md`; BUG_PLAN inventory/inbox/detail.
- No PR/push.


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
