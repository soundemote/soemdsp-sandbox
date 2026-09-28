# B-059 — Alt+click jack "orphan" dot is the scope-monitor pip

**Status:** removed (feature deleted 2026-09-27)  
**Severity:** see  
**Source:** user 2026-09-27 (initial abandoned-wire report; corrected to Alt+click jack)

## Outcome

The Alt+click jack **scope-monitor** feature was **removed** from local `soemdsp-sandbox` (not wontfix). User asked for full deletion: toggle, pip CSS, `patch.monitors` persistence, listeners, and docs.

## What was removed

| Piece | Role (former) |
|-------|------|
| `toggleNodeGraphMonitorFromPortEvent` / `toggleNodeGraphMonitorForPort` | Alt+click toggle on inlet/outlet/MOD |
| `syncNodeGraphMonitorIndicators` | Applied `.monitored-port` + `data-monitor-state` |
| CSS `.monitored-port` pip/glow | Cyan center pip / glow (`--node-monitor-color`) |
| `patch.monitors` read/write | Persist custom monitor endpoints |
| Module-rendering `pointerdown` listeners | Wired the Alt+click toggle |

Load/clone/serialize **omit** `monitors` so old patches with that field still load and do not re-save it.

## What was kept

- Real cable wiring (unchanged).
- Scope/waterfall **face** capture via `nodeGraphDefaultModuleScopeMonitors` (internal endpoints only; not jack UI).
- Helpers in `node-graph-module-scope-monitors.js` still used by the capture pipeline (`nodeGraphRenderedScopeMonitorValue`, fingerprints, live capacity).

## Verification

1. Alt+click an unconnected inlet/outlet/MOD → **no** cyan pip; no "monitor added" status.
2. No orphan cyan jack dots from this path.
3. Patches without `monitors` (and old patches that had them) still load; faces still draw from defaults.
