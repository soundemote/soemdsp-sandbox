# Core reduction plan (not modules)

**Premise:** The app is a modular patcher + live audio. The core shell that *unites* modules should stay small and simple. `modules/**` may grow forever; core should not.

**Status:** Active. Work against this doc; update checkboxes as items land.

---

## Goals

1. **Net-negative core LOC** on shell work (exclude `public/modules/**`).
2. **One way** to do floating-window chrome, drag, resize, open/stack.
3. **Satellites** for unfinished or heavy product (Code Screen) — keep the code, do not pay for it on every boot.
4. **No early-kill** of unfinished product (Code Screen stays).

---

## Non-goals

- Gutting / deleting Code Screen.
- Rewriting worklet DSP for size.
- Splitting files for purity without deleting wrappers.
- Growing new floating windows outside the registry.

---

## Architecture

| Layer | Always loaded? | Contents |
|---|---|---|
| **Core** | Yes | Graph, modules, wires, live audio, essential inspectors |
| **Floating shell** | Yes | Single registry + shared drag/resize/stack/chrome |
| **Satellite: Code Screen** | On demand | `node-graph-code-screen.js` (+ UI) when Code Screen / Code Box needed |
| **Catalog** | Per module | `modules/**` |

Patch serialization keeps a **thin** always-on model (`node-graph-code-screen-model.js`) so patches with `codeScreen` data still load without the full UI.

---

## Work items

### Phase A — Floating window registry (primary reduction)

- [x] Single registry of workspace floating windows (element id, drag/resize state keys, size axes, workspace key).
- [x] Keyboard nudge targets derived from that registry (no parallel list).
- [x] One document-level pointermove / pointerup / pointercancel bridge for all registered drag+resize.
- [x] Thin begin helpers + drop per-window document listeners where the bridge covers them.
- [x] `nodeGraphWorkspaceWindowElements` remains compatible (unchanged map; registry keys align).

**Do not** force canvas/shader dialogs into the registry until they share the same persist model (optional later).

### Phase B — Code Screen satellite

- [x] Keep `node-graph-code-screen-model.js` always on (normalize for patches).
- [x] Lazy-load `node-graph-code-screen.js` on first need (open Code Box / Code Screen view / bind / render).
- [x] Loader stubs so callers keep working (`typeof` / direct calls).
- [x] No new Code Screen features outside Code Screen files while unfinished.

**Landed:** `docs/CORE_REDUCTION_PLAN.md`, registry + bridge in `node-graph-floating-windows.js`, `node-graph-code-screen-loader.js`, index.html always-on script drop for code-screen UI.

### Phase C — Chrome discipline (already started)

- [x] Shared title bar: `.scene-context-heading` / drag / title / close.
- [x] Shared resize grip: `.scene-context-resize-handle`.
- [x] Unified nav without per-window ID stacks.
- [ ] Ongoing: delete dead CSS when found; do not add `*-heading` for floating chrome.

### Phase D — Later (not this pass)

- [ ] Scopes megafile: lazy rare display modes (careful).
- [ ] Optional CSS split of `styles.css`.
- [ ] Shell freeze policy in review of new features.

### Never for “reduction”

- Worklet-core rewrites without audio need.
- Deleting Code Screen before it is finished or intentionally cut as a product.

---

## How we measure

Before/after a reduction PR (approximate is fine):

```text
Core public/*.js lines (exclude modules/**)
styles.css lines
Always-on script count / bytes in index.html for shell
```

Target for each shell PR: **core lines ≤ previous**, or always-on boot bytes down (lazy load counts as a win even if disk total is similar).

---

## Implementation notes (this pass)

1. **`node-graph-floating-windows.js`** — registry + pointer bridge; keyboard targets read registry.
2. **`node-graph-code-screen-loader.js`** — dynamic import/script inject of code-screen UI.
3. **`index.html`** — drop always-on `node-graph-code-screen.js`; load loader instead; keep model.
4. **Call sites** — use loader-safe entry points; patch-core still guards `typeof renderNodeGraphCodeScreen`.

---

## Rule for future agents

If you add a floating inspector:

1. Register it in the floating-window registry.
2. Use `.scene-context-heading` chrome and `.scene-context-resize-handle`.
3. Do not add a new multi-selector heading class or a private drag state machine.
4. If the feature is large/unfinished, load it as a satellite like Code Screen.
