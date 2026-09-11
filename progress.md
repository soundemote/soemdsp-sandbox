# Progress — soemdsp-sandbox

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

## Bugs

Plan: **`docs/BUG_PLAN.md`** — numbered inventory (B-001…). User reports go in that file’s Inbox; do not start a second list.

## Graphify

Plan: **`docs/GRAPHIFY_WINS_PLAN.md`** (primary work queue).

```text
graphify update . --force   # no LLM; AST re-extract
# → graphify-out/GRAPH_REPORT.md  (gitignored)
```

### Parked (0.5.0 RGB)

- [ ] **Slider buffered modulation** — destination slider paints the real `readEffectiveParameter` buffer (occupancy + caret). Plan: `docs/SLIDER_BUFFERED_MODULATION_PLAN.md`. Do not start unless asked.

### Where we are
- **Track 1** Code Screen peel — **complete enough**: Box, Lookup, Registry, Workspace, Render (main shell ~1.8k events + script APIs)
- Scopes / Display Settings peels done; event-binder god-nodes stay fat
- **Dead CSS** — CORE_REDUCTION Phase C (opportunistic)
- **Product backlog** — `docs/FUTURE_PLANNING.md`

## Completed (selected)

### C++ AUDIO ENGINE CLEANING (2026-09-10, `execute-plan/papoulis-filter-finish`)
- Control chase SSOT: `control_frame` (all continuous Controls per sample; not per-knob)
- Sample-path gate: `node_needs_sample_accurate_controls` (Control sink / live IN / chase)
- Unified edges Port|Control + 1-sample / histBuf feedback (self-mod + cycle FM)
- Sine SSOT wavetable; PolyBLEP sine click fixed; JS DSP twins retired
- Contracts: `check_graph_engine_contracts.py` + ParamMod/self-mod/cycle smokes in native build
- Tip commits: `e03ee57c` … `b6412277`

### MODULE DELETE DOES NOT (should not) RESET AUDIO ENGINE (2026-09-10)
- Deleting any module (even unconnected) used `soemdsp_graph_clear` and recreated every native instance
- Fix: `soemdsp_graph_remove_node` + `clear_connections` + surgical `syncNativeGraphFromPlan`
- Survivors keep env/phase/filter state; smoke `smoke_remove_node_preserves_state.mjs`
- Commit: `5a6e8fbb`

### NORMALIZING DISPLAY SETTINGS UX (2026-09-10)
- Every module opens Display Settings (blank + Show in canvas if no face schema)
- Stop inventing Instant Trace settings for custom layout faces (envelopeCurve / filterCurve)
- Instant Trace monitors (Flower Child, …) keep Instant Trace face + Instant Trace settings
- Right-click on display faces → Display Settings (not Module Settings)
- Layout canvas Phase 1: Show in canvas + phone/F; condensed phone frame removed
- Commits: `4f6d8c93` … `b60b747e`



- [x] **CLAP host extracted** — https://github.com/soundemote/soemdsp-sandbox-claphost
- [x] **Code cleanup pass plan** — `docs/CODE_CLEANUP_PASS_PLAN.md`
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

- [ ] **Sabrina instance handles** — multi-instance (`docs/INSTANCE_HANDLE_PATTERN.md`)
- [ ] Lo-Fi Pitch Shift component-first (`docs/LOFI_PITCH_SHIFT_PLAN.md`)
- [ ] Trace pathfinding (orthogonal routing)
- [ ] Visual outputs back into sound

## Notes

- Plugin export / host packaging is **out of scope** for this repo (Make Plugin stays disabled placeholder).
- Use `graphify update .` after substantial code changes; open `graphify-out/GRAPH_REPORT.md` or `graphify god-nodes` / `graphify query "..."`.
