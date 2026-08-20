# Unconfuse / reduce / refactor plan

**Date:** 2026-08-20  
**Status:** Proposed — work this doc; check boxes as items land  
**Constraint:** Default is **behavior-preserving**. Product changes (new persist fields, stamp-preview meaning) are called out separately.

This is not a second Graphify peel list and not a core-shell rewrite.

| Existing plan | Use it for |
|---|---|
| `docs/CORE_REDUCTION_PLAN.md` | Floating chrome, satellites, net-negative *core* LOC |
| `docs/GRAPHIFY_WINS_PLAN.md` | Code Screen / view-controls / graph-utils peels |
| `docs/SCOPE_PAINT_SIMPLIFICATION_PLAN.md` | Live paint gate, freeze policy |
| `docs/CODE_CLEANUP_PASS_PLAN.md` | Dead CLAP-host leftovers, docs hygiene |
| **This doc** | Confusion that still burns: **persist**, **Display Settings**, **stamp preview names**, **phosphor leftovers** |

---

## Why zoom out now

Recent work kept hitting the same class of bug: **the UI showed one truth, refresh showed another**, or **a preview drew a different stamp than the face**.

The code is not one megaclass. It is several overlapping “almost SSOTs”:

```text
live patch  ──clone/normalize──►  workingPatch  ──JSON──►  userSession localStorage
     │                                    │
     │                                    └── sometimes skipped; other persists serialize stale workingPatch
     │
     └── Display Settings apply writes here
         session restore used to ignore selection
         Display Settings window restore ran before nodes/selection existed
```

Plus a second blob (`userUiSettings`) for FPS, global `traceSettings`, chrome colors. Dual-write is how FPS and Display Settings “didn’t survive refresh.”

Unconfusing that is worth more than splitting another 3k-line file.

---

## Non-goals

- Rewriting live worklet DSP or native WASM.
- Another scopes megacore peel (already done).
- Splitting `styles.css` or `node-graph-module-definitions.js` as a first move (catalog gravity, not confusion).
- Deleting Code Screen.
- Inventing a new persist format version unless a listed item requires it.

---

## Target truths (one sentence each)

1. **Session blob** = this browser’s work: live patch, pan/zoom, open windows, **selection**, FPS, Display Settings bags on nodes.
2. **UI-settings blob** = shipped look defaults (jack colors, expose checkboxes). Not the working patch.
3. **Display Settings** writes the selected module’s typed bag (`traceDisplaySettings` / matrix / led). Clone/normalize must keep every knob the form shows.
4. **Stamp preview** = the face’s splat, magnified nearest-neighbor. Not a second high-res disc.
5. **Boot order** = load settings → load session → hydrate → commit patch → **restore selection** → restore windows. Never persist “empty selection / empty live patch” over a good session during that window.

---

## Phase 0 — Inventory (cheap, do first)

- [x] List every `persistNodeGraphUserSession` / `saveNodeGraphWorkingPatchToUserSettings` / `scheduleNodeUiDevSettingsAutosave` caller. Mark which snapshot they intend (live vs working vs UI defaults).
- [x] List Display Settings **form type** vs **displayType** vs **settingsSchema** vs **renderer** for phosphor / Instant Trace / limiter / matrix. One table in this doc or `docs/ARCHITECTURE.md`.
- [x] Grep leftover shims: `public/node-graph-phosphor-energy-gl.js`, `node-graph-phosphor-gaussian-drawer.js`, `phosphor-draw-sample.js`, `phosphorLight` aliases, `limiterGainFace` vs `trace`.
- [x] Grep `@deprecated` no-ops in Display Settings (`changeNodeGraphTraceDisplayMode`, display-mode keys). Count call sites; delete if zero. *(Do not delete in Phase 0.)*

**Done when:** a one-page map exists; no code required except comments if a name is lying.

### Persist map (what each door actually writes)

Two blobs:

| Blob | Key / file | Intended contents |
|------|------------|-------------------|
| **Session** | `localStorage` session key (`serializeNodeGraphUserSession`) | Live graph (cloned into `workingPatch` field), pan/zoom, windows, selection, FPS *also copied here*, Display Settings bags on nodes |
| **UI settings** | `serializeNodeUiDevSettings` → local default + optional bundled `useruisettings.json` | Chrome look: jack colors, expose checkboxes, *also* global `traceSettings` + FPS (`view.moduleScopeFramesPerSecond`) |

**Lying name:** `saveNodeGraphWorkingPatchToUserSettings` does **not** write the UI-settings blob. It clones **live** `nodeGraphMvp.patch` → `workingPatch` (refuses empty-over-nonempty unless `allowEmpty`), then calls `persistNodeGraphUserSession`. File autosave helper is a no-op.

`persistNodeGraphUserSession` serializes via `nodeGraphPatchSourceForUserSession()`: **live if it has nodes**, else last `workingPatch`.

#### `persistNodeGraphUserSession` callers (session blob)

| Site | Intends |
|------|---------|
| `file-actions.js` `saveNodeGraphWorkingPatchToUserSettings` | **Live** graph (via clone) |
| `file-actions.js` `clearNodeGraphWorkingPatchFromUserSettings` | Clear working + persist empty session field |
| `ui-settings-persistence.js` definition; `saveNodeGraphWorkspaceWindowStatesToUserSettings`; `saveNodeGraphWorkspaceViewToUserSettings` | **Session** seats / pan-zoom (comment: must not overwrite shipped UI preset) |
| `ui-settings-persistence.js` boot (~2189) | Re-write session after hydrate if load succeeded |
| `selection.js` `scheduleNodeGraphSelectionSessionPersist` | **Session** selection |
| `settings-view.js` command-center page change | **Session** (open inspector page) |
| `module-store.js` `saveNodeGraphModuleStoreStateToUserSettings` | **Session** shop department |
| `view-controls.js` `persistNodeGraphModuleScopeFramesPerSecondSetting` | **Dual-write:** UI settings *and* session (FPS hydrates from UI settings) |
| `view-controls.js` workspace-view persist (~3930) | **Session** view |

#### `saveNodeGraphWorkingPatchToUserSettings` callers (intend **live** patch → session)

All of these mean “the graph the user is editing,” not UI defaults:

| Site | Notes |
|------|--------|
| `file-actions.js` current-filename / dirty-state / unload flush | Unload `pagehide`/`beforeunload`/`visibilitychange` |
| `patch-core.js` commit debounce (~1283, ~1420) | After graph commit |
| `history.js` `scheduleNodeGraphHistoryAutosave` | Undo/redo |
| `slider-dragging.js` (3) | Param drag end / live |
| `samples.js` (2) | Sample attach (`immediateFile: true` ignored for file) |
| `phosphor-waveform.js` (2) | Music-player waveform look on node |
| `module-scope-sync.js` source-sync toggle | Node display bag |
| `settings-apply.js` `persistNodeGraphTraceDisplaySettingsSoon` | Node bags + **also** `scheduleNodeUiDevSettingsAutosave` (global `traceSettings`) |
| `view-controls.js` dock split / tooltip embed resize (3) | Chrome sizes stored on session via working-patch door |
| `modules/audioPlayer/audio-player-playlist.js` (4) | Playlist on node |

#### `scheduleNodeUiDevSettingsAutosave` callers (intend **UI defaults** blob)

| Site | Notes |
|------|--------|
| `ui-settings-persistence.js` definition; after `applyNodeUiDevSettings`; native settings file load | Look defaults |
| `ui-settings-sync.js` wires-follow-port-colors, fully-opaque-wires, color/roundness header (~765) | Chrome |
| `ui-settings-panels.js` expose checkboxes | UI Settings expose flags |
| `file-actions.js` `rememberNodeGraphFilePickerMeta` | File-picker names (also lives on session) |
| `view-controls.js` FPS | Dual-write with session |
| `settings-apply.js` Display Settings persist | Dual-write global `traceSettings` (Phase 1.3) |

### Display Settings vocabulary (phosphor / Instant Trace / limiter / matrix)

Form type = `nodeGraphModuleDisplaySettingsSchemaForNode` = selected mode `settingsSchema` (or renderer). Body mounts on `dataset.displaySettingsType`. One face per module: extra `displayModes` entries are ignored (`nodeGraphModuleDisplayModesForType` keeps `defaultDisplayMode` or first).

| Face (user name) | Module `displayType` | Mode `renderer` | `settingsSchema` / form type | Patch bag | Paint |
|------------------|----------------------|-----------------|------------------------------|-----------|--------|
| **2D Phosphor** | `scope2d` | `scope2d` | `scope2d` | `traceDisplaySettings` (scope2d normalize) | Phosphor energy-GL / drawer |
| **Instant Trace** (XY) | `scope2dTrace` | `scope2dTrace` | `scope2dTrace` | `traceDisplaySettings` | Instant Trace stroke (not phosphor stamp) |
| Oscillator default XY | `scope2d` | first mode `scope2d` (`xyBurn`) | `scope2d` | same | Phosphor; `xyTrace` mode is **not** selected |
| **1D Instant Trace** | `trace` | `trace` | `trace` | `traceDisplaySettings` | Instant Trace |
| **Limiter Gain** | **`trace`** (`lookaheadLimiter`) | `trace` (`gain`) | **`trace`** | `traceDisplaySettings` | **Mismatch:** form-io/apply/clone/custom renderer still know `limiterGainFace`; HTML helper still tags `limiterGainFace`; `display-mode.js` lists it; face self-registers `limiterGainFace` |
| **Matrix Waterfall** | `matrixWaterfallFace` | implicit same | `matrixWaterfallFace` | `matrixWaterfall` | matrix rain |
| **Matrix Display** | `matrixDisplayFace` | implicit same | `matrixDisplayFace` | `matrixDisplay` | info/serial plate |
| Legacy **phosphorLight** | catalog `displayType: "scope2d"`; patches migrate to `scope2d` | leftover `phosphorLight` renderer alias | form-io/apply treat as **scope2d** | `traceDisplaySettings` | `phosphor-light-display.js` aliases renderer → scope2d draw |

### Leftover shims / files

| Path | Role | Load |
|------|------|------|
| `public/lib/phosphor/phosphor-energy-gl.js` | **SSOT** energy-GL | `index.html` |
| `public/node-graph-phosphor-energy-gl.js` | **14-line shim** (warns if SSOT missing) | **still** loaded *after* lib in `index.html`; smoke_test still asserts old API strings **inside the shim file** (will fail if shim stays empty) |
| `public/lib/phosphor/phosphor-drawer.js` | **SSOT** drawer | `index.html` |
| `public/node-graph-phosphor-gaussian-drawer.js` | **Live** canvas gaussian stamps; **no other JS callers** of `nodeGraphPhosphorGaussian*` | still in `index.html` |
| `public/node-graph-phosphor-draw-sample.js` | Pack/unpack float64 draw-head; **no other public/ callers** of encode/decode | still in `index.html` (Phosphillator format; unused from other modules today) |
| `phosphorLight` | Alias of `scope2d` in clone/apply/form-io/trace-controls/execution-plan/offline renderer list/default-patch migrate | shop hidden; migrator in `patch-migrations.js` / `patch-core.js` |
| `limiterGainFace` | See table; **not** limiter `displayType` | Phase 2.5 |

### `@deprecated` Display Settings no-ops (do not delete here)

| Symbol | File | JS callers besides definition | Smoke |
|--------|------|-------------------------------|-------|
| `changeNodeGraphTraceDisplayMode` | `settings-apply.js` | **0** | — |
| `assignNodeGraphDisplayModeKeyToNode` / `Everywhere` | `settings-apply.js` | **0** (Everywhere only calls ToNode) | smoke_test still wants `assignNodeGraphDisplayModeKeyEverywhere(node, select.value)` in concatenated source |
| `setNodeGraphTraceDisplayModeSelectorVisible` | `settings-window.js` | **2**: `macro-controls-settings.js`, `keyboard-layout-settings.js` | — |
| `syncNodeGraphTraceDisplayModeSelector` | `settings-window.js` | **0** | smoke_test still wants old `function syncNodeGraphTraceDisplayModeSelector(node = null)` signature |

Phase 4.1: delete the **zero-caller** trio after smoke_test strings are updated. Keep the selector-visible helper until those two modules stop calling it.

---

## Phase 1 — Persist is one door (highest unconfuse)

**Pain:** Display Settings, FPS, selection, and window seat each had a special write. Refresh restored a different object.

**Landed recently (keep; do not regress):**

- Session snapshot prefers **live** patch when it has nodes.
- Selection + last module in session; restore **after** patch commit, **before** window restore.
- Hydration persist must not wipe pending selection (fall back to `sessionSelection` if live is empty).
- Display Settings apply still clones live via working-patch save.

**Remaining:**

| ID | Win | Files | Risk |
|----|-----|-------|------|
| 1.1 | One helper: `persistSession({ reason })`. Callers stop choosing between session / UI-settings / workingPatch by accident. | `ui-settings-persistence.js`, `file-actions.js` | Low if it only wraps |
| 1.2 | Document boot order in `ARCHITECTURE.md` (10 lines). | docs | None |
| 1.3 | Stop dual-writing global `traceSettings` into the UI-settings blob unless that blob is the SSOT. Pick **session**. | persistence, settings-apply | Medium — Clear Startup / bundled preset |
| 1.4 | Window restore must not `remember(..., targetNode: "")` during boot before nodes exist (that can persist a blank Display Settings target). | settings-window.js | Medium |
| 1.5 | `cloneNodeGraphTypedDisplaySettings`: one switch per `settingsSchema`; add missing schemas in the same list as assign/form-io (lineBurn, limiter, matrix residual if any). No `Object.hasOwn` traps that drop first-time bags incorrectly. | `patch-clone.js`, `settings-apply.js`, `settings-form-io.js` | Medium — round-trip a phosphor + Instant Trace node |

**Verify:** change Bright/Ghost/Blur, select a module, refresh. Panel, knobs, selection, window page match.

---

## Phase 2 — Display Settings vocabulary

**Pain:** Phosphor preview was named Instant Trace. `lineThickness` is Blur on phosphor and Instant Trace. `phosphorLight` is a legacy alias of `scope2d`. Limiter Gain is Instant Trace but leftover `limiterGainFace` paths remain.

| ID | Win | Notes |
|----|-----|--------|
| 2.1 | Rename **internal** stamp-preview symbols to `stampPreview` (`syncNodeGraphStampPreview`, `data-stamp-preview`). Keep one deprecated alias if callers are wide. | form.js, form-io, apply |
| 2.2 | One function: `displaySettingsSchemaForNode(node)` used by clone, assign, form read/write, preview kind. Delete parallel `displayType` fall-throughs where they disagree. | display-mode.js is already close |
| 2.3 | Stamp preview stays: **native splat → nearest-neighbor plate**. Do not reintroduce “fit disc to plate” radius math. | already landed; protect in review |
| 2.4 | `lineThickness` clamp: phosphor + Instant Trace both 0…1 linear unit drag (Blur). RoundShape / LED keep their own meaning. | settings-controls.js |
| 2.5 | Delete or fold `limiterGainFace` if limiter is `displayType: "trace"` everywhere (clone, form-io, assign, HTML). | grep `limiterGainFace` |

**Verify:** PolyBLEP Display Settings: Blur 0→0.5 stays; Size down pixelates the preview; limiter still Instant Trace.

---

## Phase 3 — Phosphor leftovers (reduce)

| ID | Win | Files |
|----|-----|--------|
| 3.1 | Confirm `public/node-graph-phosphor-energy-gl.js` (shim) vs `lib/phosphor/phosphor-energy-gl.js` (SSOT). Delete shim if index.html only loads lib. | 14-line file |
| 3.2 | Same for gaussian-drawer / draw-sample if unused. | grep callers |
| 3.3 | `PhosphorDrawer.stepDots` `Math.max(0.35, radius)` vs energy-GL `radius > 0`. Pick **one** floor (Size 0 = gone). | drawer.js, energy-gl.js, draw-burn.js |
| 3.4 | `phosphorLight` only in migration + alias table, not a third schema. | clone, assign, form-io, definitions |

**Verify:** 1D + 2D phosphor still paint; Size 0 vanishes; old phosphorLight patches migrate.

---

## Phase 4 — Cheap delete / rename (reduce without peels)

Do not split 11k-line `module-definitions.js` here.

| ID | Win |
|----|-----|
| 4.1 | Remove Display Settings `@deprecated` no-ops with **zero** remaining callers. |
| 4.2 | One debounce helper for session persist (selection, display, pan already each have a timer). Optional; only if it deletes net lines. |
| 4.3 | Comment-only: `workingPatch` means “last session snapshot,” not a second live graph. `assignEverywhere` writing both is the confused part — either document or stop writing workingPatch in apply (session persist clones live). |
| 4.4 | Opportunistic dead CSS for `.node-trace-display-preview-*` old rules if duplicates remain. |

---

## Phase 5 — Later (not this pass)

- Persistence file peel (`ui-settings-persistence.js` ~2400 lines): session vs UI-settings vs boot. Mirror Display Settings peel **after** Phase 1 truths are stable.
- `settings-form-io.js` (~1900) + `normalize.js` (~1700): generated field table instead of three switches. Only when adding a new face hurts.
- Graphify Track 2 (view-controls) — size, not the persist class of bugs.
- CSS split.

---

## Order of attack

```text
0 inventory
1 persist door + boot order + clone schema list     ← most user-visible refresh bugs
2 Display Settings names + limiter/phosphor aliases
3 phosphor shims + radius floor SSOT
4 deprecated deletes
5 (optional) persistence peel
```

Stop after 1 if the refresh/selection/Display Settings story is quiet. 2–4 are mop-up.

---

## Success

- Refresh: same selection, same Display Settings page/module, same knobs, same stamp look.
- One grep for “where does this persist?” answers **session** or **UI-settings**, never both by accident.
- Stamp preview code fits in one short comment at the top of the preview block; no fit-to-plate / Instant-Trace-named phosphor path.
- No new behavior except where a listed item says so.

---

## Related files (gravity)

| File | Why it is in this plan |
|------|------------------------|
| `public/node-graph-ui-settings-persistence.js` | Session vs UI-settings vs boot |
| `public/node-graph-file-actions.js` | Working-patch clone + unload flush |
| `public/node-graph-bootstrap.js` | Commit patch → selection → windows |
| `public/node-graph-selection.js` | Selection persist |
| `public/node-graph-patch-clone.js` | Typed display bags on clone |
| `public/node-graph-module-scope-settings-*.js` | Form / apply / window |
| `public/lib/phosphor/*` | Stamp SSOT |
