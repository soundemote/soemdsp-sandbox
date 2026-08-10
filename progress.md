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

## Graphify

Plan: **`docs/GRAPHIFY_WINS_PLAN.md`** (primary work queue).

```text
graphify update . --force   # no LLM; AST re-extract
# → graphify-out/GRAPH_REPORT.md  (gitignored)
```

### Where we are
- **Track 1** Code Screen internal peel — 1.1 Code Box + **1.2 Lookup/helpers/snippets** landed
- Scopes / Display Settings peels done; event-binder god-nodes stay fat
- **Dead CSS** — CORE_REDUCTION Phase C (opportunistic)
- **Product backlog** — `docs/FUTURE_PLANNING.md`

## Completed (selected)

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
