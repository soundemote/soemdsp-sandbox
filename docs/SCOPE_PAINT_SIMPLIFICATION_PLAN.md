# Scope paint simplification plan (Graphify-backed)

Refreshed: `graphify update . --force` (2026-08-09) → **7759 nodes · 13571 edges · 1198 communities**.

## Why oscilloscopes kept “only updating on Settings / Unpause”

Graphify cannot find a **directed call path** from:

- `postModuleScopeSnapshot` (worklet) → `drawNodeGraphModuleScopes` (main)
- `pushNodeGraphLiveModuleScopeSnapshot` → `drawNodeGraphTraceDisplayCanvasItem`

The live path is **not a normal call graph**. It is:

```text
worklet process()
  → captureModuleScopeFrame / visual input rings
  → postModuleScopeSnapshot  (postMessage type:"scope")
main port.onmessage
  → pushNodeGraphLiveModuleScopeSnapshot
  → scheduleNodeGraphModuleScopeDraw({ force? })
  → RAF → drawNodeGraphModuleScopes
  → typed face drawers (Trace / lineBurn / scope2d / …)
```

AST tools only see the ends of that pipe. **Policy for “are we live?” was duplicated** across:

| Concern | Files that re-implemented it |
|--------|-------------------------------|
| Engine paused (speed 0) | canvas, phosphor, orchestrator, lifecycle |
| Circuit running / AudioContext | canvas, orchestrator, waveform, wipe |
| Keep RAF alive | orchestrator keepAlive, keepDrawing, heartbeat |
| Skip Instant Trace paint | screen-items signature + metrics cache |
| Force paint on sample post | buffer-io (soft schedule only, until fixed) |
| Freeze residual (hold face) | phosphorFrozen === paused (too broad) |

Any one of those disagreeing produces: **one force paint works, continuous loop dies**.

## Graphify picture of the scope subsystem

| Metric | Value |
|--------|------|
| Scope-related files | **45** |
| Scope-related symbols | **832** |
| Largest communities | draw-burn (80), settings-window (76), normalize (64), paint-helpers (59), offline (56) |
| Total scope JS (approx) | **~760 KB** across `node-graph-module-scope-*.js` |

**Hubs (file-level degree):** paint-helpers, normalize, offline, phosphor-energy-gl, settings-window, draw-burn.

**Cross-boundary edges into scope** are almost only **header/scene binders → scope number drag / scene scope controls** — not the audio→paint path (invisible to AST).

So: **peeling settings UI was the right graph move**. The remaining pain is the **live paint policy + capture contract**, not more settings peels.

## Target architecture (less chance of freeze bugs)

### 1. Single paint gate (do first — this pass)

One module owns “should we paint / schedule / freeze?”:

```text
node-graph-module-scope-paint-gate.js
  scopePaintIsEnginePlaying()     // speed > 0 && live.node
  scopePaintIsLive()              // playing, not visual-pause
  scopePaintIsFrozen()            // intentional hold only (speed 0 / scope pause)
  scopePaintShouldFullDraw(force)
  scopePaintShouldKeepLoop()
  scopePaintOnSampleSnapshot()    // force schedule + arm RAF
```

**Rule:** no other file invents a pause/live predicate. Call the gate.

### 2. Explicit pipeline doc + debug checks (next)

Name the stages in one place (comments + short debug):

1. Capture (worklet)  
2. Snapshot (postMessage)  
3. Buffer write (main)  
4. Schedule (force on sample)  
5. Collect visible items  
6. Face paint  

Optional: `nodeGraphMvp.scopePaintDebug = { phase, lastSnapshotMs, lastDrawMs }` for one-line console.

### 3. Thin orchestrator (later)

`drawNodeGraphModuleScopes` should only:

- gate → collect items → dispatch typed drawers → reschedule  

Move “light punch”, metrics, GL clear setup into helpers **without** new predicates.

### 4. Do **not** split further without a feature

Graphify still flags **event-binder god-nodes** (`bindNodeGraphSceneMenuEvents`, header bindings). Leave them alone unless a concrete feature forces a split (same advice as `progress.md`).

Settings-ui peel is **done** — stop re-peeling settings unless a form page is unmaintainable.

### 5. Capture contract tests (later)

Smoke / unit-style checks:

- After synthetic `pushNodeGraphLiveModuleScopeSnapshot`, Trace cache invalidates and `scheduleDraw` is forced.  
- With `speedMultiplier > 0` and `live.node`, `scopePaintIsLive()` is true even if `context.state === "suspended"`.  
- 1D burn empty-points path does not clear residual.

## Implementation status

- [x] Graphify refresh (`graphify-out/`, 2026-08-09)
- [x] Document pipeline + failure mode
- [x] Introduce `node-graph-module-scope-paint-gate.js` and wire primary call sites
- [ ] Smoke test for live gate + snapshot force schedule
- [ ] Optional debug phase readout

## How to re-query after changes

```text
graphify update . --force
graphify explain "drawNodeGraphModuleScopes"
graphify explain "scopePaintIsLive"
graphify path "pushNodeGraphLiveModuleScopeSnapshot" "scheduleNodeGraphModuleScopeDraw" --undirected
```

Open `graphify-out/graph.html` (community view) for the draw-burn / paint-helpers islands.
