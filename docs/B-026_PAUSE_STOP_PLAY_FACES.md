# B-026 — Pause → Stop → Play leaves waterfall drawers dark / idle

**Status:** open (unfixed)  
**Severity:** see  
**Source:** hunt-2026-08-12; symptom corrected by user 2026-09-27  
**Related:** B-020 / B-022 / B-024 (value-face light/hold family — keep separate); B-021 (spectrogram Clear / waterfall history); B-054 (Output pause emoji — separate UI chrome)

## Actual broken UI (user-confirmed 2026-09-27)

After **Pause → Stop → Play**, **waterfall drawers** stay **dark or idle** — veiled by the room dimmer or stuck without a punch reopen / redraw — even though audio may be running again.

**Not the bug (user-tested 2026-09-27):** Value **LED** recovers fine. Earlier attempts that chased Value LCD/LED were aiming at the wrong surface for this failure mode.

Still unchecked by this clarification: Value LCD, Pitch Detector, and Trace faces. The Output-display pause-emoji symptom is now tracked separately as B-054.

Repro:

1. Load a patch with a waterfall face visible.
2. Optional: room dimmer on.
3. Pause live audio.
4. Stop.
5. Play again.
6. Observe waterfall drawer still dark / not redrawing as live. Value LED should look OK.

## Product intent

- Pause should freeze hold / residual reading where that is intentional.
- Stop should wipe live face / drawer state that must reset.
- Play must **reopen** screen lights (dimmer punches) and resume **waterfall** painting without a manual UI poke.
- Soft unpause (Pause → Play without Stop) must **not** wipe value-face residual hold (`lastGoodValueText`).

## Suspected mechanics

| Piece | Role |
|-------|------|
| Waterfall tape / buffer-view | Scroll / present path may not hard-rearm after Stop wipe |
| `lightStrength` / room dimmer punches | Canvases under the dimmer need a punch reopen; Stop can leave strength at 0 |
| Paint-gate | May still treat the waterfall face as paused/frozen after Play |
| Play without 0→1 edge | If transport already non-zero, Play may not fire a hard rearm for drawers |
| Value LED path | Separate; already recovers — do not use as primary test for this bug |

## Files touched or implicated

- `public/node-graph-module-scope-waterfall.js` — waterfall face drawer
- `public/node-graph-module-scope-buffer-view.js` — buffer / waterfall view (`?v=waterfall-1`)
- `public/lib/phosphor/phosphor-drawer.js` — waterfall / Instant Waterfall tape helpers
- `public/node-graph-live-runtime.js` — live start / cold rearm / transport
- `public/node-graph-module-scope-draw-orchestrator.js` — wipe / screen-light rearm helpers
- `public/node-graph-module-scope-wipe.js` — Stop wipe
- `public/node-graph-module-scope-paint-gate.js` — live/pause paint policy
- `public/node-graph-room-dimmer.js` — `setLightStrength`, dimmer redraw

Canonical list remains in `docs/BUG_PLAN.md` under **B-026**. This file is the working design / attempt log.

## Attempts so far (2026-09-27)

### Attempt A — Hard vs soft rearm + lightStrength refresh (Value LCD/LED)

Aimed at Value LCD/LED number readouts. **Did not fix** the user-visible failure (now known to be waterfall).

### Attempt B — LED punch path + screen-light rearm after live start

Routed Value LED through `setNodeGraphLightStrength`, added screen-light rearm after live start. **Did not fix** waterfall. User later confirmed Value LED was never the broken surface.

## What not to do next

- Do not mark B-026 fixed from smoke alone — needs **manual** Pause → Stop → Play with a **waterfall** face (room dimmer on recommended).
- Do not keep chasing Value LED as the failing surface.
- Do not put JavaScript DSP on the audio path while chasing this (UI/light / drawer only).
- Do not regress pause residual hold on value faces when fixing Stop→Play for waterfall.

## Likely next investigation (unproven)

1. Trace Pause→Stop→Play on `node-graph-module-scope-waterfall.js` / buffer-view: wipe clears history or lightStrength without a Play rearm.
2. Confirm whether the veil is room-dimmer punches, canvas clear without redraw, or paint-gate still treating waterfall as paused.
3. Diff Pause→Play (waterfall OK?) vs Pause→Stop→Play (broken) for drawer-specific flags.
4. Optionally re-check Value LCD / Trace once waterfall is fixed — separate tickets if still broken.

## Smoke / verification

- Automated smoke does **not** cover this visual path.
- Manual gate: Pause → Stop → Play, room dimmer on, **waterfall drawer** visible; Value LED as a non-regression check only.

## Pointers

- Index: `docs/BUG_PLAN.md` → B-026 (status **open**)
- Agent rules / progress: `progress.md`
