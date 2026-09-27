# B-050 — Workspace zoom past ~10× stutters badly

**Status:** open (unfixed)  
**Severity:** see  
**Source:** user 2026-09-27  
**Related:** `docs/ZOOM_PAN_MAGNIFIER_PERF_PLAN.md` (2026-08-20 camera/pan workstream — implemented, status header partially stale); B-041 (dimmer cutouts vs zoom/pan, fixed); display-ink policy in `docs/DISPLAY_SCALE_REWRITE.md` (not a stutter fix)

## Actual broken UI (user-reported 2026-09-27)

**Zooming the workspace in past about 10×** makes the app **stutter horribly** — frame rate collapses during / after zoom-in. Zoom max remains **100** (`nodeGraphZoomLimits.max`); the cliff is around **10×**, not the hard cap.

This is the **graph camera** (wheel / pinch / smooth-zoom / pan while zoomed), not magnifier optics and not per-module face “Zoom Min/Max” display settings.

Repro:

1. Load any non-trivial patch (text + jacks alone is enough to stress the camera; phosphor faces make it worse).
2. Wheel or button-zoom past ~10× (1000% readout).
3. Pan or keep zooming. Observe severe stutter / unusable interaction.
4. Zoom back toward 1× — interaction recovers.

## Product intent

- High zoom must stay interactive (pointer tracking usable), including past 10× when the product allows up to 100×.
- **Do not** freeze phosphor / Instant Trace / other live faces during graph zoom or pan (policy from the 2026-08-20 plan — still in force).
- **Do not** “fix” this by lowering `nodeGraphZoomLimits.max` alone.
- Audio / DSP must not change.

## Suspected mechanics (hypotheses — unproven for the >10× cliff)

| Piece | Role |
|-------|------|
| World-layer `translate3d` + `scale(zoom)` | Compositor still scales a large AABB; cost grows with zoom even with cull |
| Live face RAF while zoomed | Phosphor / WebGL / RoundShape keep drawing on **visible** modules (required); GPU cost rises with scaled pixels |
| Stroke / outline `1/zoom` compensate | Live `--node-graph-zoom` restyle was already called out as **costly at 10–20×**; mid-zoom freeze helps only during the gesture |
| Cull gaps | Modules that should be asleep still in the scaled layer → pan/zoom feels “laggy for no reason” (code comments) |
| Heatmap / readouts / layout | Mid-gesture paths try to skip these; any leakage at high zoom is expensive |
| Magnifier | **Not** on the normal zoom/pan path; only if class/clone leaked (prior probe theory) |

## Files touched or implicated

Prior zoom-perf work landed mainly in:

- `public/node-graph-viewport-perf.js` — light CSS vs heavy rAF coalesce; gesture classes; mid-zoom stroke freeze; viewport cull
- `public/node-graph-workspace-zoom.js` — apply/set zoom; skipHeavy / gestureKind
- `public/node-graph-workspace-view.js` — pan/view; hot-path logging avoided
- `public/node-graph-workspace-geometry.js` — `nodeGraphZoomLimits` (min 0.1, **max 100**)
- `public/styles.css` — `.node-graph-world-layer` camera; `.viewport-zooming` / `.viewport-asleep`; `.pixelated-canvas-zoom`
- `public/node-graph-magnifier.js` — glass path (snapshot); not primary for this bug
- `public/node-graph-module-scope-paint-gate.js` — `nodeGraphDisplaysFrozen()` currently always `false` (live faces never freeze for glass; lens is snapshot)

Canonical list remains in `docs/BUG_PLAN.md` under **B-050**. This file is the working design / attempt log.

## Attempts so far (pre-B-050; from git + docs)

Honest summary: **agents already spent a large camera/pan performance pass**. That work improved zoomed pan vs the old CSS-`zoom` raster path, but the **user-visible stutter past ~10× is still open** — no dedicated ticket existed until B-050.

### Attempt A — Coalesce viewport pan/zoom (light CSS, heavy on settle)

- **Commit:** `67ca1a53` — *Coalesce viewport pan/zoom so wheel and drag stay light.*
- **What:** During gestures, only CSS zoom/pan (+ lite wires) update each frame; hit paths, selection chrome, scopes, settings wait until settle. Introduced `node-graph-viewport-perf.js`.
- **Outcome:** **Partial.** Gesture path is lighter; does not by itself make >10× smooth.

### Attempt B — Cull off-screen modules during zoomed pan

- **Commits:** `2735834a` (*Cull off-screen modules…*); expanded in `af49a289`.
- **What:** Mid-gesture cull; asleep modules leave the paint tree. `content-visibility:hidden` alone **failed** (chrome/jacks still in the zoomed compositor layer). Current CSS: `.dsp-node.viewport-asleep { display: none !important; }`.
- **Outcome:** **Partial / necessary.** Comments still warn that skipping cull while zoomed-in pan looks like “laggy for no reason.” Does not eliminate the >10× cliff.

### Attempt C — Camera rewrite: drop CSS `zoom`, use `transform: scale`

- **Commit:** `af49a289` — *…camera cull, magnifier snapshot-only* (styles rewrite).
- **What:** Removed `width/height: 100%/zoom` + CSS `zoom: var(--node-graph-zoom)` on the zoom surface. World layer is **1× layout** + `translate3d(pan) scale(zoom)`. Wire SVGs stay screen-space siblings (not CSS-scaled). Removed gesture `will-change: transform` on the zoom surface (was enlarging the layer).
- **Note:** `docs/ZOOM_PAN_MAGNIFIER_PERF_PLAN.md` header still says “camera is CSS zoom … not transform: scale” — that header is **stale**; tree matches Attempt C.
- **Outcome:** **Partial.** Fixed the old “CSS zoom rasterizes zoom× pixels and pan dies” failure mode. User still reports horrible stutter past ~10× on current camera.

### Attempt D — Mid-zoom stroke compensate freeze + hide wires/jacks

- **Where:** `markNodeGraphViewportGesture` / `.viewport-zooming` in viewport-perf + styles.
- **What:** Snapshot `1/zoom` into a frozen CSS var once per zoom gesture so outlines do not restyle every `--node-graph-zoom` tick (**comment: costly at 10–20×**). Hide wires + port jacks while zooming; restore on settle.
- **Outcome:** **Partial.** Targets a known 10–20× cost; stutter past 10 remains.

### Attempt E — Pixelated canvas zoom (nearest-neighbor)

- **Where:** `pixelated-canvas-zoom` when `zoom > 1` (was a higher cliff ~2.5 earlier; lowered so density-reduced faces stay crisp).
- **Outcome:** **Visual quality**, not a stutter fix. May slightly change GPU sampling cost; not claimed as the cure.

### Attempt F — Magnifier freeze-all / snapshot

- **Plan workstream B** + `af49a289` magnifier snapshot-only.
- **What:** Glass path cheapened; `nodeGraphDisplaysFrozen()` is now hard `false` (live graph keeps drawing; lens clones a snapshot).
- **Outcome:** **Out of path** for normal zoom-past-10. Do not chase magnifier unless a leak is proven.

### Attempt G — Rejected / not done

- **Freeze live displays during zoom/pan** — explicitly **rejected** in the 2026-08-20 plan; must not be the fix.
- **Lower max zoom** — plan: do **not** solve by capping zoom; limits still max **100**.
- **LOD / face simplification at high zoom** — **not found** as an implemented attempt (no LOD switch in viewport-perf / world-layer).
- **Dedicated BUG_PLAN row for “past 10 stutter”** — **missing until B-050** (2026-09-27).

### Face-level zoom fixes (not this bug)

Number Readout sizing, phosphor residual copy, scope draw in buffer space, wire jitter at high zoom, dimmer cutouts (B-041), etc. Those fixed **wrong pictures**, not the workspace camera stutter cliff.

## What not to do next

- Do not mark B-050 fixed from smoke alone — needs **manual** zoom past ~10× with pan.
- Do not freeze phosphor / traces / RoundShape because the user is zooming (policy).
- Do not only lower `nodeGraphZoomLimits.max` and call it done.
- Do not rewrite display-ink / `DISPLAY_SCALE_REWRITE` as a stutter project.
- Do not assume the magnifier is on the hot path without a probe.
- Do not put JavaScript DSP on the audio path while chasing this.

## Likely next investigation (unproven)

1. Profile at zoom 1 / 5 / 10 / 20 / 50: compositor layer size, paint time, face RAF cost on **visible-only** modules.
2. Confirm cull: at high zoom, only on-screen modules lack `viewport-asleep`; no zero-size workspace wake-all leak.
3. Measure whether live face draws (phosphor GL, etc.) dominate past 10× vs pure CSS scale of chrome.
4. Re-check stroke compensate / any other `1/zoom` or per-module style thrash outside `.viewport-zooming`.
5. If scale AABB is still huge, consider further layer splits or coarser mid-gesture presentation **without** freezing required live faces after settle.

## Smoke / verification

- Automated smoke does **not** cover interactive zoom FPS.
- Manual gate: zoom past ~10× on a typical patch; pan; zoom further toward max; return to 1×. Interaction must stay usable; audio unchanged.

## Pointers

- Index: `docs/BUG_PLAN.md` → B-050 (status **open**)
- Prior plan (implemented, header stale): `docs/ZOOM_PAN_MAGNIFIER_PERF_PLAN.md`
- Display vs camera policy (not the fix): `docs/DISPLAY_SCALE_REWRITE.md`
- Agent rules / progress: `progress.md`
