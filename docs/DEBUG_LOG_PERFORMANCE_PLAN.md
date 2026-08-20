# Debug log performance plan

**Date:** 2026-08-20  
**Status:** Proposed — implement only when granted  
**Constraint:** Planning only until an explicit implement pass.

This is a **new** plan. It does not amend `docs/UNCONFUSE_REFACTOR_PLAN.md`.

---

## Problem

The 🐞 in-app console (`public/node-graph-debug-console.js`, `window.SE`) is always on unless `localStorage.seDebug === "0"`. Default is **on**.

Two costs stack:

1. **Writing** — every `SE.INFO` / hooked `console.*` allocates, stacks, and stores a line (cap **4000**).
2. **The list** — when the panel is open, each line becomes a DOM row. `rebuild()` concatenates **all** matching rows into `innerHTML`. A long text list is layout-heavy.

Hot paths currently log:

| Source | What | Frequency |
|--------|------|-----------|
| `setNodeGraphPan` / `nodeGraphLogModularViewPan` | `SE.INFO("Pan")` | Every non-gesture pan; also pan **begin** |
| `nodeGraphGraphDebugTrace` | `SE.INFO` + `JSON.stringify` | Graph face **pointermove** (every move while dragging a graph point) |
| Console hook | `console.log/info/warn/error` → `push()` | Every console write, including leftover boot `console.info` |
| `callerLoc()` | `new Error().stack` | **Every** `SE.*` push |

Graph pointermove is enough to tank a drag. Pan INFO plus a growing DOM list is enough to tank view motion. Boot `console.info` (phosphor-energy-gl, wasm fetch) is smaller but still feeds the same pipe.

---

## Policy (agreed direction)

Happy path: **silent**.

- Do **not** log pan, pointermove, or “module loaded” on a stable build.
- Investigation: add a log, then remove it when the bug is closed.
- Failures (`console.warn`/`error` on persist refuse, shader compile, patch load) may stay — they are rare. They must **not** run in a per-frame loop.

The 🐞 panel stays a **product** (Show Debug). It must not be a live tape of the engine.

---

## Target behavior

```text
Default (release and debug boot):
  SE.push is a no-op except ERROR/FAIL
  console hook off (or only error)
  no stack capture
  panel closed, empty, no 4000-row DOM

When 🐞 is open (or seDebug explicitly on):
  INFO/LOG/WARN record
  still no pointermove / pan spam
  list: cap visible rows (~200), virtualize or prepend-only, never innerHTML of 4000
```

---

## Work items (when implementing)

| ID | Change | Why |
|----|--------|-----|
| D1 | **Mute hot paths now.** Remove or gate `nodeGraphLogModularViewPan` and `nodeGraphGraphDebugTrace` on pointermove. Keep trace behind an explicit flag if still needed. | Biggest CPU win; one drag should not write hundreds of INFO lines |
| D2 | **Default off.** `seDevEnabled()` today returns true unless `seDebug=0`. Flip: logging/UI only when panel open or `seDebug=1`. | Stop headless recording of 4000 lines on every user |
| D3 | **Do not `callerLoc()` on INFO/LOG.** Stack only for ERROR/FAIL, or never. | `new Error().stack` per pan/move is a tax |
| D4 | **Console hook.** Stop mirroring `console.log`/`info`. Optional: `warn`/`error` only, and only while panel is open. | Boot `console.info` currently becomes SE rows |
| D5 | **Visible list.** Cap painted rows (e.g. 200). `rebuild()` must not dump 4000 HTML strings. Prefer prepend one row; drop oldest DOM node. | Fixes “long list of text killing performance” |
| D6 | **Happy-path `console.info`.** Delete phosphor-energy-gl “loaded…”, jack hidden sample, wasm fetch report unless behind a flag. | Same pipe as D4 |
| D7 | **Smoothing watch** stays opt-in (already is). Must not flood `setPlan` lines. | Already gated; leave unless it still floods |

Do **not** delete `window.SE` or the 🐞 button. Thin it.

Do **not** strip persist/shader/patch-load **warns** in the same pass as a blind `console.*` purge.

---

## Order

1. D1 (hot-path mute) — feel it immediately  
2. D2 + D3 + D4 — stop the recorder  
3. D5 — stop the list  
4. D6 — leftover boot noise  

---

## Verify

- Pan the graph: no log growth, no hitch from the panel.  
- Drag a graph-module breakpoint: no per-move INFO.  
- Open 🐞: still shows ERROR/FAIL; list stays short.  
- Refresh: log empty (already cleared on startup).  
- Quota / shader fail: still a warn, still in 🐞 if open.

---

## Related files

- `public/node-graph-debug-console.js` — SE, hook, render, 4000 cap  
- `public/node-graph-workspace-view.js` — `SE.INFO("Pan")`  
- `public/node-graph-graph-utils.js` — `nodeGraphGraphDebugTrace` on pointermove  
- `public/lib/phosphor/phosphor-energy-gl.js` — boot `console.info`  
- `public/node-graph-live-runtime.js` — wasm `console.debug`/`info`  
- `public/node-graph-jack-chrome.js` — hidden-jack `console.info`  
