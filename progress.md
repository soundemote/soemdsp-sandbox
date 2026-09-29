## 2026-09-28 - Instant Waterfall: paint crash + drop Persist/Bloom/Detail (local, uncommitted)

- User: typed scope draw failed displayType waterfall (vibratoGenerator / output) — empty error {}; also REMOVE Persist/Bloom/Detail, KEEP+FIX Blur (not scope1dTrace).
- Cause: duplicate `const NODE_GRAPH_WATERFALL_HISTORY_SEC_EPS` in normalize.js + waterfall.js (classic scripts) aborted waterfall.js load → ReferenceError on `nodeGraphWaterfallPaint` (console showed error as {}).
- Fix: remove redeclare in waterfall.js; strip Persist/Bloom/Detail from defaults/normalize/form/controls/paint; strengthen filled-bar Blur soft skirt; keep frac carry. Cache-bust wf-nobloom-1. No push.

﻿## 2026-09-28 - Space FX Instant Waterfall faces (local, uncommitted)

- User: Sabrina Reverb + SoEm Reverb need Instant Waterfall (displayType waterfall) same premium treatment as Vibrato; also Delay + Ping Pong Delay.
- Catalog / switch ids: sabrina_reverb→reverbEffect; soem_reverb→soemReverb; delay_effect→delayEffect; ping_pong_delay→pingPongDelay.
- Switch defs (`public/node-graph-module-definitions.js`): all four now displayType/mode/schema waterfall with stereoWaterfallPorts Mix L/R + displaySignals (premium defaults inherited from nodeGraphWaterfallSettingsDefaults). Delay had no face; Ping Pong was on LFO L/R — both now Mix Out. Cache-bust fx-instant-wf-1. No push.
## 2026-09-28 - B-084 scope1dTrace gradient â†’ TraceWoscope LUT (local, uncommitted)

- User: Tube Sat / scope1dTrace / TraceWoscope not applying Display Settings gradient. 2D Trace is NOT gradient-based â€” do not force gradient onto 2D.
- Cause: 1D points lacked energy t for LUT; Color swatches fought Gradient-owns-color; flat ink ignored stops.
- Fix: |sample| energy t on 1D points; ink peak from gradientStops; scope1dTrace colors:[]; 2D Trace untouched. Cache-bust b084-1dtrace-grad-1.
- Docs: docs/B-084_SCOPE1DTRACE_GRADIENT_LUT.md. No push.

## 2026-09-28 - Instant Waterfall blank Wave/Out (local, uncommitted)
- User: nothing on waterfall displays (Vibrato Wave / Output and similar).
- Cause: History Hz->seconds made multi-second windows common; samplesPerColumn then exceeds one undrawn chunk. Paint dropped st.frac when columns<1, so columnsFloat never reached 1 (hold stayed empty).
- Fix: carry st.frac = columnsFloat across frames until a column stamps. History seconds 0 still pauses (early freeze path unchanged). Cache-bust wf-frac-1. No push.

ï»¿## 2026-09-28 - Tube Sat TraceWoscope face blank (B-083, local, uncommitted)

- User: Tube Saturation lost TraceWoscope / scope1dTrace face on ArchIV.
- Not B-078 face-track-omitted / paint registration / missing layout:scopeFace â€” LayoutA processor mount + scopeâ†’face band OK.
- Cause: demo `tubesaturation.json` shipped `dot1Brightness: 0`; TraceWoscope skips draw when intensity â‰¤ 0 (blank face).
- Fix: restore demo crt-amber Bright=1; merge `defaultDisplaySettings` in scope1dTrace settingsForNode/clone/form defaults; `displayHeightGu: 2`; layout-band regression; cache-bust `tubesat-crt-face-1`.
- Docs: `docs/B-083_TUBE_SAT_TRACE_FACE_BLANK.md`. No push.
## 2026-09-28 - Vibrato Generator Instant Waterfall restore (local, uncommitted)

- User: give Vibrato Generator the new waterfall 1d scope treatment = Instant Waterfall (displayType waterfall / premium Blur Persist Bloom Detail ampLaw), NOT scope1dTrace.
- Cause: B-081 parked Vibrato on scope1dTrace so Size could bind TraceWoscope; Instant Waterfall redesign had dropped Trace Size.
- Fix: restore vibratoGenerator displayType/mode/schema waterfall with Wave source; inherit shared premium defaults (Blur/Persist/Bloom/Detail/ampLaw). Tube Sat / catalog 1D Trace stay on scope1dTrace (B-081 Size SSOT unchanged). Cache-bust vibrato-instant-wf-1. No push.

## 2026-09-28 - Patch save dialog suggestedName = patch name.json (local, uncommitted)

- Native Save Patch (showSaveFilePicker) autofills filename from live patch name + .json (FS-unsafe chars sanitized). Download fallback uses same name.
- Also fixed duplicate `nodeGraphDownloadTextFile` arg-order clash (text,filename vs filename,text).
- Files: `public/node-graph-file-actions.js`; cache-bust `patch-save-suggested-name-1` in index/perform. No push.
## 2026-09-28 - B-082 param MOD clamp to [min,max] (local, uncommitted)

- User: Keyboard Gate + Toggle into PolyBLEP Amplitude â€” both ON must not exceed Amp max (usually 1).
- Cause: Host packed modClamp:false as unbounded; native control_effective skipped unit-band clamp.
- Fix: SSOT unit-band always clamps in control_effective (graph v156); host domain flags always bit1 for unit-band; helpers nodeGraphParamModClamp always true; PolyBLEP Amp meta + PARAM_SURFACES. Smoke scripts/smoke_b082_amp_mod_clamp.mjs. No JS DSP. Cache-bust b082-mod-clamp-1.
- Docs: docs/B-082_PARAM_MOD_CLAMP_MIN_MAX.md; BUG_PLAN. No push.

## 2026-09-28 - B-081 scope1dTrace Size / Vibrato thickness (local, uncommitted)

- User: Vibrato can't set trace thickness; possibly all 1D Trace Size/blur drawers broken; full-height signal (no amp shrink on Y).
- Cause: Vibrato locked on Instant Waterfall (Size dropped); scope1dTrace Size lacked Bright-style SSOT into TraceWoscope; SampleToY honored Scale <1.
- Fix: Vibrato -> scope1dTrace; nodeGraphScope1dTraceSizePx + intensity alias; Y floor Scale at 1; metrics Size signature; cache-bust b081-1dtrace-size-1.
- Docs: docs/B-081_SCOPE1DTRACE_SIZE_THICKNESS.md; BUG_PLAN inventory/detail/fixed. No push.

## 2026-09-28 - B-079 Choices range clamp subset remap (local, uncommitted)

- User: Limiting choices param range (PolyBLEP Waveform 4-5 Tri/Sine) left full-catalog dividers/labels.
- Cause: Discrete choice index required span===choices.length; clamp fell through to proportional map over full list; dividers used full catalog length.
- Fix: nodeGraphResolveChoiceSet + choiceOriginMin; index/label/type-in/dividers use filtered subset; persist origin in paramMeta/slider/factories/editor. Cache-bust b079-choice-range-1.
- Verify: node scripts/test_b079_choice_range_remap.js (+ test_knob_choice_neg.js). Doc docs/B-079_CHOICES_RANGE_CLAMP_SUBSET.md. No push.


## 2026-09-28 Â— Trace/Phosphor faces lost after waterfall rename (local, uncommitted)

- Cause: WIP waterfall rename replaced `NODE_GRAPH_MODULE_WIDGET_BAND_ID.trace ? face` with `waterfall ? face`, but `scopeFace` layout still emitted band id `"trace"`. LayoutA `faceBandVisible` only checked `band.id === "face"`, so Trace / Phosphor / Instant Waterfall monitors got `face-track-omitted` ? CSS `display:none` on the face.
- Not displayType/settingsSchema stripping; defs still had `displayType` + `layout: "scopeFace"`.
- Fix: scopeFace band id `"face"`; restore `trace: "face"` alias; canonical `faceBandVisible`. Also register `scope1dTrace` / stereo thrus + WiredInputs.
- Verify: `node scripts/test_module_layout_bands.js`. No push.

## 2026-09-28 Ã¢Â€Â” Acoustic Pluck native module (local, uncommitted)

- Baked `patches/modulator breadboards/pluck envelope.json` feedback AR into native **Acoustic Pluck** (`acousticPluck` / opcode 198).
- Algorithm: Curve AR + envÃ¢Â†Â’invertÃ¢Â†Â’atten(Feedback,Bias)Ã¢Â†Â’Amp Curve ExpÃ¢Â†Â’unit-MOD Release (128-sample fb delay). Demo keyboard/PolyBLEP/filter/portals/orphan KT attack path discarded.
- Files: `native_modules/acoustic_pluck/`, defs/store/efficient allowlist, graph_engine + combined wasm, face PreviewCurve, smoke `scripts/smoke_graph_acoustic_pluck.mjs`.
- Breadboard patch left intact (portal-splice smoke still green). No commit/push.



## 2026-09-28 Ã¢Â€Â” Tube Sat 1D Trace + crt-amber (local, uncommitted)

- Restored Tube Saturation face as **scope1dTrace** (TraceWoscope), not lineBurn phosphor / not curve canvas.
- New shared colormap `crt-amber` / kind `crtAmber`; Tube Sat `defaultDisplaySettings.gradientStops` seeds it.
- Docs: `docs/FEATURE_TUBE_SAT_CRT_AMBER.md`. No PR/push.

## 2026-09-28 Ã¢Â€Â” B-077 Keyboard Inc host CV (local, uncommitted)

- User: Keyboard not sending out Inc.
- Cause: efficient sidecar `buildCv` computed `increment` but never published `outs.inc` (retired keyboard live evaluator did). Same host-CV class as B-070 keypad, different port.
- Fix: publish `outs.inc = cv.increment` Pass 1 + Pass 2 for `keyboard`; cache-bust `keyboard-inc-1`. No JS DSP evaluator restore.
- Docs: `docs/B-077_KEYBOARD_INC_HOST_CV_MISSING.md`; BUG_PLAN inventory/inbox/detail.
- No PR/push.


## 2026-09-28 Ã¢Â€Â” 1D Trace Ã¢Â‰Â  1D Waterfall rename (local, uncommitted)

- Architect correction: Instant Trace / `displayType: "trace"` / module types `traceDisplay*` were **1D Waterfall** (TraceTape strip-chart), not heart-monitor 1D Trace.
- Renamed waterfall identity to `waterfall` / `waterfallStereo` / `waterfallXyz` / `waterfallRgb`; `displayType` / renderer / settingsSchema `waterfall` (plus `waterfallRgb` / `waterfallXyz` where specialized).
- True 1D Trace remains `scope1dTrace` / `scope1dTraceStereo`.
- Shared face layout id `traceDisplay` Ã¢Â†Â’ `scopeFace` (CSS class `scope-face-layout`).
- No commit/push; no legacy remap for old `"trace"` as waterfall.
Ã¯Â»Â¿# Progress ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â soemdsp-sandbox



### Waterfall rename finished locally (no commit)

- Identity complete: module ids `waterfall*`, `displayType`/`renderer`/`settingsSchema` `waterfall` (+ rgb/xyz), mode keys `*Waterfall` where they were Instant-Trace strip modes.
- Shared Display Settings chrome left as `nodeGraphTraceDisplay*` / `traceDisplaySettings`.
- 1D Trace (`scope1dTrace`) untouched. Layout `scopeFace`.
- Send removal on Sabrina/SoEm/Delay/PingPong preserved (no `key: "send"`).

## 2026-09-27
- **B-061 fixed** ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â€Â small slider readout stripped scientific exponents (`String(n)` ÃƒÂ¢Ã¢Â€Â Ã¢Â€Â™ `limit_decimals` mantissa-only). Plain-decimal expand in `node-graph-slider-metadata.js`.
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
- Never put JavaScript on the audio path: no JS DSP evaluators, no restoring `create*State` / worklet-evaluator twins for allowlisted natives. Fix `setPlan` / native GraphEngine instead. Missing native = silence or refuse ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â never stubs.

## Bugs

Plan: **`docs/BUG_PLAN.md`** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â numbered inventory (B-001ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ‚Ã‚Â¦). User reports go in that fileÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â€ÂžÃ‚Â¢s Inbox; do not start a second list.

## Graphify

Plan: **`docs/GRAPHIFY_WINS_PLAN.md`** (primary work queue).

```text
graphify update . --force   # no LLM; AST re-extract
# ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â„Â¢ graphify-out/GRAPH_REPORT.md  (gitignored)
```

### Parked (0.5.0 RGB)

- [ ] **Slider buffered modulation** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â destination slider paints the real `readEffectiveParameter` buffer (occupancy + caret). Plan: `docs/SLIDER_BUFFERED_MODULATION_PLAN.md`. Do not start unless asked.

### Where we are
- **Track 1** Code Screen peel ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â **complete enough**: Box, Lookup, Registry, Workspace, Render (main shell ~1.8k events + script APIs)
- Scopes / Display Settings peels done; event-binder god-nodes stay fat
- **Dead CSS** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â CORE_REDUCTION Phase C (opportunistic)
- **Product backlog** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â `docs/FUTURE_PLANNING.md`

## Completed (selected)

### C++ AUDIO ENGINE CLEANING (2026-09-10, `execute-plan/papoulis-filter-finish`)
- Control chase SSOT: `control_frame` (all continuous Controls per sample; not per-knob)
- Sample-path gate: `node_needs_sample_accurate_controls` (Control sink / live IN / chase)
- Unified edges Port|Control + 1-sample / histBuf feedback (self-mod + cycle FM)
- Sine SSOT wavetable; PolyBLEP sine click fixed; JS DSP twins retired
- Contracts: `check_graph_engine_contracts.py` + ParamMod/self-mod/cycle smokes in native build
- Tip commits: `e03ee57c` ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ‚Ã‚Â¦ `b6412277`

### MODULE DELETE DOES NOT (should not) RESET AUDIO ENGINE (2026-09-10)
- Deleting any module (even unconnected) used `soemdsp_graph_clear` and recreated every native instance
- Fix: `soemdsp_graph_remove_node` + `clear_connections` + surgical `syncNativeGraphFromPlan`
- Survivors keep env/phase/filter state; smoke `smoke_remove_node_preserves_state.mjs`
- Commit: `5a6e8fbb`

### NORMALIZING DISPLAY SETTINGS UX (2026-09-10)
- Every module opens Display Settings (blank + Show in canvas if no face schema)
- Stop inventing Instant Waterfall settings for custom layout faces (envelopeCurve / filterCurve)
- Instant Waterfall monitors (Flower Child, ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ‚Ã‚Â¦) keep Instant Waterfall face + Instant Waterfall settings
- Right-click on display faces ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â„Â¢ Display Settings (not Module Settings)
- Layout canvas Phase 1: Show in canvas + phone/F; condensed phone frame removed
- Commits: `4f6d8c93` ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ‚Ã‚Â¦ `b60b747e`



- [x] **CLAP host extracted** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â https://github.com/soundemote/soemdsp-sandbox-claphost
- [x] **Code cleanup pass plan** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â `docs/CODE_CLEANUP_PASS_PLAN.md`
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
- Name-based choice persistence â€” audit/migrate index-based saves (`docs/APP_POLICY.md` + `docs/FUTURE_PLANNING.md`).
- Delay with exposed feedback path ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â€Â insert arbitrary modules in the loop (seed in `docs/FUTURE_PLANNING.md`).
- Dimensional parameter prototyping ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â€Â different settings across frequency/pitch (seed in ``docs/FUTURE_PLANNING.md``).
- Circuits on a keyboard ÃƒÂ¢Ã¢Â‚Â¬Ã¢Â€Â play circuits like a sample library (seed in ``docs/FUTURE_PLANNING.md``).
- Keytracking / pitch-tracking modulation UI (seed in ``docs/FUTURE_PLANNING.md``).
- True metamodule parameter mirror: outer `mx_*` edits/menus target inner child (one conceptual param); nested parent-unexpose vs grandparent-expose stays explicit (seed in `docs/FUTURE_PLANNING.md`). Website limited checkbox mirror ships first.
- Waterfall redesign (P2P bars): **implemented** on ArchIV Ã¢Â€Â” visual glance after reload (`docs/FUTURE_PLANNING.md`).

- [ ] Inlets/outlets above displays, app-wide (`docs/FUTURE_PLANNING.md`)
- [ ] **Sabrina instance handles** ÃƒÂƒÃ‚Â¢ÃƒÂ¢Ã¢Â€ÂšÃ‚Â¬ÃƒÂ¢Ã¢Â‚Â¬Ã‚Â multi-instance (`docs/INSTANCE_HANDLE_PATTERN.md`)
- [ ] Lo-Fi Pitch Shift component-first (`docs/LOFI_PITCH_SHIFT_PLAN.md`)

## Notes

- Plugin export / host packaging is **out of scope** for this repo (Make Plugin stays disabled placeholder).
- Use `graphify update .` after substantial code changes; open `graphify-out/GRAPH_REPORT.md` or `graphify god-nodes` / `graphify query "..."`.


