# Graphify wins plan

Work from this doc. Refresh the graph after substantial peels:

```powershell
graphify update . --force
# → graphify-out/GRAPH_REPORT.md  (gitignored)
# graphify god-nodes --top 25
```

**Baseline (2026-08-09 @ README link commit era):** ~7738 nodes · ~13498 edges · ~1192 communities.

---

## What graphify is for here

Local AST map of the repo. Use it to:

1. Find **gravity wells** (files / functions with high degree)
2. Spot **symbol clusters** that can move together (peels)
3. Avoid false targets (data catalogs, event-binder shells, native reference types)

**Peel** = extract-only split by cluster. Same global function names, same behavior, new sibling files + load order. Not a product rewrite.

---

## Already done (do not re-chase)

| Win | Notes |
|-----|--------|
| Scopes megacore peel | Thin shell + many `module-scope-*` siblings |
| Display Settings peel | form-io / field-edit / apply / window / ui anchor |
| Scope paint-gate | Single live/pause/schedule policy |
| Floating window registry | CORE_REDUCTION Phase A |
| Code Screen **satellite load** | Lazy `code-screen-loader` + always-on model (Phase B) — not an internal peel yet |
| Event-binder god-nodes kept fat | `bindNodeGraphSceneMenuEvents`, header bind, etc. |

---

## Priority tracks

### Track 1 — Code Screen internal peel (primary)

**Why:** #1 public hub by graph degree (~1955 total deg, ~309 symbols, ~6k lines in `node-graph-code-screen.js`).

**What it is *not*:** The modular **Codeblock** processor (audio-thread custom code). Code Screen is the full-page editor/browser (codeblocks list, workspace script, helpers/snippets, registry, run history) plus floating **Code Box** UI.

**Constraint:** Code Screen UI stays a **satellite**. Peels must load with the satellite (update `node-graph-code-screen-loader.js` ordered script list). Always-on remains: `node-graph-code-screen-model.js` + loader only.

#### Peel slices (order of attack)

| # | Slice | Rough contents | Target file (proposed) | Status |
|---|--------|----------------|------------------------|--------|
| 1 | **Code Box window** | Floating Code Box size/chrome/draft/apply/ports/source + widget highlight | `node-graph-code-box-window.js` | **landed** |
| 2 | **Lookup / helpers / snippets** | Lookup shelf, helper/snippet insert, save+pin | `node-graph-code-screen-lookup.js` | **landed** |
| 3 | **Registry** | Draft cards, save all, duplicate, registry config | `node-graph-code-screen-registry.js` | **landed** |
| 4 | **Workspace script + autocomplete** | Apply/run/reset script, autocomplete index | `node-graph-code-screen-workspace.js` | **landed** (with 1.6) |
| 5 | **Render sections** | `renderNodeGraphCodeScreen*` list/landing/watches / codeblocks | `node-graph-code-screen-render.js` | pending |
| 6 | **Run history** | History add/load/run/restore | folded into `…-workspace.js` | **landed** |
| 7 | **Events shell** | `bindNodeGraphCodeScreenEvents`, `handleNodeGraphCodeScreenClick` | keep last in thin `node-graph-code-screen.js` | pending |

**Per-slice checklist**

- [ ] Extract cluster only (no behavior change)
- [ ] Loader loads new file **before** dependents
- [ ] Smoke: open Code Screen, open Code Box, edit codeblock, apply ports
- [ ] `graphify update . --force` after 1–2 slices; note god-node degree drop on code-screen

**Do not** casually split the click dispatcher mid-peel into many files until callees live elsewhere.

---

### Track 2 — View controls peel

**Why:** #2 hub (~1205 deg, ~237 symbols, ~3.6k lines) — visibility, full UI, MIDI dock, toggles.

**When:** After Track 1 has at least Code Box + one more slice landed, or if Code Screen work blocks.

**Approach:** Cluster by domain (visibility menu, full-UI veil, standalone MIDI, keyboard/debug toggles), not random line cuts.

---

### Track 3 — Graph face utils peel

**Why:** `node-graph-graph-utils.js` (~875 deg) — Smooth/Step Graph face: normalize vs paint vs drag.

**When:** After Track 1 or when editing graph modules again.

---

### Track 4 — Metadata editor peel

**Why:** `node-graph-metadata-editor.js` (~790 deg) — Parameter Settings UI.

**When:** When touching parameter settings UX.

**Pattern:** Mirror scope settings peel (form-io / apply / window).

---

### Track 5 — Dead CSS (Phase C)

**Why:** `styles.css` ~557 KB — not ranked well by AST graph; still a real win.

**When:** Opportunistic; delete known-dead rules when found. No big-bang CSS rewrite.

---

### Track 6 — Optional scope satellites

**Why:** paint-helpers / draw-burn still large but scopes are “done enough.”

**When:** Only if living in scope paint bugs again.

---

## Explicit non-wins

| Target | Reason |
|--------|--------|
| `bindNodeGraph*` god-nodes | Intentional shell wiring; high betweenness |
| `node-graph-module-definitions.js` | Catalog data bulk, not call-graph mess |
| `node-graph-module-store.js` | Description shelf; low peel ROI vs code-screen |
| Supersaw/Hypersaw C++ hubs | Reference / native, not sandbox UI debt |
| `file-actions.js` after explorer nuke | Already slim |
| Phosphor energy-gl | Coherent GPU kernel; don’t explode for aesthetics |

---

## Working rules

1. One primary track at a time when possible.
2. Extract-only peels: same globals, load order, smoke before commit.
3. Refresh graphify after peels that move many symbols.
4. Update this doc’s Status column and `progress.md` when a slice lands.
5. Product work (Patch page, open book) can interleave; don’t mix into Code Screen peels in the same commit if avoidable.

---

## Success metrics

- Code Screen main file line count falls as slices land (target: thin events + glue)
- `graphify god-nodes` no longer dominates with `handleNodeGraphCodeScreenClick` / file-level code-screen degree as #1 forever
- Satellite still lazy-loads; cold boot payload unchanged aside from more small files on first Code Screen open
- Smoke tests pass; Code Box + Code Screen still open and edit

---

## Session log

| Date | Change |
|------|--------|
| 2026-08-09 | Plan created from graphify refresh |
| 2026-08-09 | Track 1.1 Code Box window peel landed (~483 lines → `node-graph-code-box-window.js`; loader multi-script) |
| 2026-08-09 | Track 1.2 Lookup/helpers/snippets peel landed (~87 fns → `node-graph-code-screen-lookup.js`; main ~4.5k lines) |
| 2026-08-09 | Track 1.3 Registry peel landed (~30 fns → `node-graph-code-screen-registry.js`; main ~3.9k lines) |
| 2026-08-09 | Track 1.4+1.6 Workspace/autocomplete/run-history → `node-graph-code-screen-workspace.js`; main ~3.1k lines |
