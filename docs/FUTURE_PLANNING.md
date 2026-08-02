# Future Planning Notes

This file collects project-shaping ideas that should survive day-to-day implementation without becoming immediate scope.

## Lo-Fi Pitch Shift (component-first)

Realtime pitch tools aimed at **abusable lo-fi character**, not transparent stretch. Build lowest modules first (buffer → varispeed → grains → grain pitch → optional spectral dirt), each useful alone, then compose.

Primary note:

```text
docs/LOFI_PITCH_SHIFT_PLAN.md
```

## CLAP host (extracted)

CLAP host experiments were moved out of this repo to
https://github.com/soundemote/soemdsp-sandbox-claphost


## Trace Pathfinding

Trace-style wires will eventually need pathfinding to become useful as a circuit-board-like connection mode.

Future trace routing should be able to:

- Find orthogonal up/down/left/right paths between patch points.
- Route around modules and reserved UI areas.
- Prefer clean grid-aligned paths with minimal bends.
- Support user-placed trace points as routing constraints or waypoints.
- Keep Cable, Wire, and Trace as distinct visual/interaction modes.

This should wait until trace behavior is ready for a focused design pass. A simple manual trace mode is not enough long term; the useful version needs routing logic.

## Visual Outputs Back Into Sound

The V1 sound-to-visual bridge lets patch signals drive visual inputs such as sandbox screen shake. The reverse direction should remain a future design pass: visual outputs, renderer state, camera motion, or interaction-derived values feeding sound/control inputs.

Future visual-to-sound routing should decide:

- Which visual values are stable enough to expose as graph outputs.
- How renderer-rate values are resampled, smoothed, and BADVAL-guarded for audio-rate DSP.
- Whether visual modules expose both sink inputs and source outputs, or whether a dedicated bridge module owns the boundary.

## Dropdown Window Buttons

Next version: consider turning Command Center buttons into dropdowns instead of opening separate floating windows for every tool.

The current floating-window direction is good enough for this release. The next pass can consolidate window bodies into button-owned dropdown panels, because the panels are already starting to look and behave like compact modules.

Keep this as a next-version cleanup, not a release blocker.
