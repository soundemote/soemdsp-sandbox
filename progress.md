# Progress — soemdsp-sandbox

Branch: `master` @ `946f964` **BEST SOFT FRACTAL** (and later hygiene if present).

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

## Graphify (refreshed 2026-08-08)

```text
graphify update .   # no LLM; AST re-extract
# → graphify-out/GRAPH_REPORT.md  (gitignored)
# 7457 nodes · 13069 edges · 1137 communities
# Built from: 946f964 BEST SOFT FRACTAL
```

### Where we are
- **Modules are healthy communities** — Soft Fractal (`rgbFractal`) is a tight island: display / gl / ui / register / math / worklet. Good.
- **Core gravity wells** (largest files / hubs): module-definitions, code-screen (satellite), module-store, view-controls, live-runtime; settings-ui peeled into satellites.
- **Cross-community bridges (god-nodes)**: `bindNodeGraphSceneMenuEvents` (81), `bindNodeGraphHeaderControlEvents` (74), `bindNodeGraphMvpEvents` — high betweenness; treat as shell wiring, not casual split targets.
- **Scopes peel**: largely done; **settings-ui peel landed** (form-io / field-edit / apply / window).
- **Import cycles**: none detected.
- **Soft Fractal cost model**: fixed layout×DPR buffer + CSS pixelate on app zoom (resource-agnostic).

### Suggested improvement tracks (graph-backed)
1. **Dead CSS / chrome discipline** — CORE_REDUCTION Phase C ongoing.
2. **Leave event-binder god-nodes alone** unless a concrete feature forces a split with tests.
3. **Optional**: module-store catalog vs UI split if search/catalog work continues.
4. **Product backlog** — see `docs/FUTURE_PLANNING.md` (lo-fi pitch, trace pathfinding, visual→sound).

## Completed (selected)

- [x] **CLAP host extracted** — https://github.com/soundemote/soemdsp-sandbox-claphost
- [x] **Code cleanup pass plan** — `docs/CODE_CLEANUP_PASS_PLAN.md`
- [x] **Core reduction** Phase A/B (floating window registry, Code Screen satellite)
- [x] **Soft Fractal** WebGL face, blur, pan, params, resource-agnostic pixelated app zoom
- [x] Graphify re-index after Soft Fractal land

## Active / hygiene

- [x] Peel `node-graph-module-scope-settings-ui.js` by symbol cluster (form-io / field-edit / apply / window)
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
