# Code cleanup pass (behavior-preserving)

**Status:** Active  
**Constraint:** **No intentional behavior change.** Refactors, dead-code removal, docs hygiene, and structure only. If a change could alter audio, UI, or patch I/O, skip it or gate it behind an explicit product task.

**Context:** CLAP *host* code was extracted to [soemdsp-sandbox-claphost](https://github.com/soundemote/soemdsp-sandbox-claphost). Mainline still has feature WIP (Asciiscope, pitch quantizer face, keyboard layout, etc.) uncommitted. This pass cleans **around** that work; it does not redesign features.

Related: `docs/CORE_REDUCTION_PLAN.md` (core shell reduction). This doc is a **hygiene pass**, not a second core rewrite.

---

## Goals

1. **Dead code / dead references** after CLAP host removal and other deletions.
2. **Docs accuracy** — no instructions that start a missing companion host.
3. **progress.md** — CLAP host items read as *extracted*, not open work.
4. **Small safe consistency** — deprecated aliases used at one call site, obvious orphans.
5. **Verify** smoke_test still parses; optional targeted checks.

## Non-goals

- Changing module DSP, routing, or UI behavior.
- Splitting `node-graph-module-scopes.js` or worklet-core (high risk, separate plan).
- Deleting “under construction” product affordances (Record/Forward, Download, etc.).
- Pixelization / Asciiscope step 2.
- Force-committing feature WIP unless asked.

---

## Phase 0 — Inventory (done when this doc lands)

- [x] CLAP host paths deleted from main (`tools/webui-clap-host`, `node-graph-clap-host.js`, `clapPlugin`, plan doc).
- [x] No `clapPlugin` / `nodeGraphClap*` symbols in `public/**/*.{js,html,css}`.
- [x] Remaining “clap” mentions: fork URL, history, `makePlugin` export tooltip (keep).
- [x] `scripts/smoke_test.py` syntax OK after host strip.

---

## Phase 1 — Docs & progress hygiene

| Item | Action | Risk |
|------|--------|------|
| 1.1 | `progress.md`: collapse old CLAP host checklist into one “extracted” line; drop obsolete open-sounding host tasks | None |
| 1.2 | `README.md`: ensure single clear fork pointer (already present) | None |
| 1.3 | `docs/FUTURE_PLANNING.md` / `SANDBOX_REFERENCE.md`: host = fork only | None |
| 1.4 | Grep docs for `webui-clap-host` / `WEBUI_CLAP` paths; fix or delete dead links | None |

---

## Phase 2 — Dead code after host extraction

| Item | Action | Risk |
|------|--------|------|
| 2.1 | Confirm no callers of deleted CLAP helpers (already grepped) | None |
| 2.2 | Confirm `styles.css` has no `.node-clap-*` / `.clap-plugin-layout` | None |
| 2.3 | Confirm `index.html` has no clap script tags or host strip | None |
| 2.4 | Confirm start_sandbox_*.cmd has no CLAP companion start | None |
| 2.5 | If empty `tools/` directory remains, remove only if empty | None |

---

## Phase 3 — Tiny consistency refactors (no behavior change)

| Item | Action | Risk |
|------|--------|------|
| 3.1 | `createNodeGraphSliderWidgetBody` is a thin deprecated alias; leave definition for compat, ensure primary call sites use `createNodeGraphKnobFace` (already do) | None |
| 3.2 | Prefer not deleting deprecated wrappers in this pass (smoke/history may still name them) | — |
| 3.3 | `progress.md` / this plan: checkboxes updated as work lands | None |

**Skipped this pass (too risky / too large):**

- Splitting `node-graph-module-scopes.js`
- Unifying display settings further
- Mass console.log deletion (some are intentional diagnostics)
- CSS split of `styles.css`

---

## Phase 4 — Verification

| Item | Action |
|------|--------|
| 4.1 | `python -c "import ast; ast.parse(...smoke_test.py)"` |
| 4.2 | `rg -i clap` public js/html/css → only tooltips / none for host |
| 4.3 | Optional: run a short smoke subset if environment allows |

---

## Phase 5 — Commit strategy (when user asks)

Prefer **two commits** when ready:

1. `Remove CLAP host from mainline; point to soemdsp-sandbox-claphost`  
2. Feature WIP separately (Asciiscope, pitch quantizer UI, keyboard layout, …)

Do not mix cleanup-only and feature in one commit unless user prefers one dump.

---

## Execution log

| Date | What |
|------|------|
| 2026-08-01 | Plan written. Host extraction already on working tree. |
| 2026-08-01 | Phase 1: `progress.md` collapsed CLAP host history; README fork blurb clarified. |
| 2026-08-01 | Phase 2: Verified host paths/symbols/CSS/scripts gone; no `tools/` dir. |
| 2026-08-01 | Phase 3: Skipped risky splits; left deprecated slider alias intact. |
| 2026-08-01 | Phase 4: smoke_test.py AST parse OK; public js/html/css host-free. |
| 2026-08-01 | **Round 2:** Fixed broken `node-graph-patch-core.js` from incomplete CLAP strip (restored HEAD, re-applied removals cleanly). Syntax-check all changed JS. |
| 2026-08-01 | Retired type `clapPlugin` so old patches drop host nodes instead of `unknown node type`. |
| 2026-08-01 | Removed empty `public/modules/impulseButton` and `public/modules/knob` dirs. |
| 2026-08-01 | progress.md / README hygiene already applied. |
| 2026-08-02 | Shared **control-bus helpers** (`node-graph-control-bus-helpers.js`): Bias/In, stereo mix, external stereo frame, MIDI ports — live evaluators + worklet dispatch share one pure API. Thinned knob/plugin/output/audioInput/midiOut evaluators. Removed CLAP export JS earlier. |

---

## Success criteria

- [x] No broken imports/calls to removed CLAP host code
- [x] Docs do not instruct starting `tools/webui-clap-host` from this repo
- [x] `makePlugin` tooltip still mentions CLAP as **export target**
- [x] Smoke test file still parses
- [x] No intentional UX/audio behavior change
