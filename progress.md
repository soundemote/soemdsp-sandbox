# Progress — soemdsp-sandbox Bugfixes

Branch: `void/sandbox-bugfixes` (off `codex/restore-before-formula-visual`)
Base: commit `ed2533f Add Sabrina reverb WIP module`

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

## Completed (selected)

- [x] **CLAP host extracted** — Host / `clapPlugin` / companion process removed from this repo. Lives in https://github.com/soundemote/soemdsp-sandbox-claphost (historical host bugfixes B/I/J/E/O and host UI were for that stack; not open work here).
- [x] **0b** — Stale smoke anchor: capability-based canvas check.
- [x] **A** — Patch serialization: `graphConnections`, `codeScreen`, `windows`.
- [x] **K** — Worklet stop session gate (`sessionId` / `planSerial`).
- [x] **F** — Unsupported-source gate from module definitions (no 45-type whitelist).
- [x] **G** — Graph connections silent dedupe (match signal/mod).
- [x] **H** — Shared `nodeGraphRetiredNodeTypes`.
- [x] **M** — Sabrina native cleanup (sample rate cap 192 kHz).
- [x] **C** — Dead rendered playback cursor helpers removed.
- [x] **N** — Stale doc paths fixed.
- [x] **L** — Double normalize on commit audited; kept defensive.
- [x] Module pattern + translation + instance-handle docs.
- [x] Smoke test green on last full run of that branch.

## Active / hygiene

- [x] **Code cleanup pass plan** — `docs/CODE_CLEANUP_PASS_PLAN.md` (behavior-preserving).
- [ ] Commit strategy: separate CLAP extraction vs feature WIP when ready to push master.

## Backlog Ideas

- [ ] **D (DENIED as stated)** — Ellipsoid native file-scope globals (future risk only).
- [ ] **Sabrina instance handles** — Multi-instance handle model (see `docs/INSTANCE_HANDLE_PATTERN.md`).
- [ ] Core reduction ongoing items — `docs/CORE_REDUCTION_PLAN.md` Phase C dead CSS when found.

## Notes

- Branch history below may still mention older `void/sandbox-bugfixes` state; treat **current master WIP** as source of truth for uncommitted Asciiscope / quantizer / keyboard / CLAP strip.
- Plugin export / host packaging is **out of scope** for this repo (Make Plugin stays disabled placeholder).
