# Future Planning Notes

This file collects project-shaping ideas that should survive day-to-day implementation without becoming immediate scope.

## Slider buffered modulation (destination = real effective-param history)

Parked under **0.5.0 RGB**. First visual when we return: live occupancy + caret on the value axis, not a mini-scope. Do not implement until asked.

Primary note:

```text
docs/SLIDER_BUFFERED_MODULATION_PLAN.md
```

## Lo-Fi Pitch Shift (component-first)

Realtime pitch tools aimed at **abusable lo-fi character**, not transparent stretch. Build lowest modules first (buffer → varispeed → grains → grain pitch → optional spectral dirt), each useful alone, then compose.

Primary note:

```text
docs/LOFI_PITCH_SHIFT_PLAN.md
```

## Dropdown Window Buttons

Next version: consider turning Command Center buttons into dropdowns instead of opening separate floating windows for every tool.

The current floating-window direction is good enough for this release. The next pass can consolidate window bodies into button-owned dropdown panels, because the panels are already starting to look and behave like compact modules.

Keep this as a next-version cleanup, not a release blocker.

## Inlets / outlets above displays (app-wide)

**Implemented.** LayoutA (and sample / phosphor face stacks) use `header → io → face → params → lip`. Display off and Display Height 0 omit the face track; I/O stays under the header.

Standing rule: `docs/APP_POLICY.md` (LayoutA I/O above the face). Band contract: `docs/MODULE_LAYOUT_PLAN.md`.

LayoutB (ports beside the face) and InletOutletLayout (title + I/O, no face) are unchanged. Do not add a second layout or an old-patch shim for the previous face-then-I/O stack.

## Waterfall redesign (amp-per-frame bars)

**Status:** seed — direction locked below; more UI/look details TBD. Do not implement until Architect says go.

**Direction:** Make the 1D Waterfall face feel more like a classic waterfall and less like an expensive waveform/trace drawer. Drop heavy per-sample waveform ink (TraceTape discs / line traces). Each **display frame** draws **one cheap bar**, then scrolls history.

**Locked so far (Architect 2026-09-27):**

- **Bar metric = waveform peak-to-peak** for the interval since the last stamped bar: running **max − min**.
- **Accumulate as samples arrive; paint only stamps.** As each new sample (or small block) lands, update running `min`/`max`. When the display paints, stamp **one bar** from the current accumulated P2P, then **reset** the accumulator for the next interval. Do **not** defer measurement until paint and then scan a giant undrawn backlog (that would balloon cost and P2P when frames are late).
- **Display update is frame-based; accumulation is sample-driven.** Late paints mean a longer *interval* between bars (one wider time slice), not "hold megabytes and recompute later."
- **Default mapping = straight amplitude** (linear peak-to-peak → bar). No dB / RMS default.
- **Scaling is a display setting**, not baked into the default metric. Zoom / gain / range live in settings.

**Still open:** bar look (height vs fill), History / scroll contract, Sync On fate, TraceTape retirement vs optional mode, Matrix Waterfall / phosphor drawers, B-026 tie-in.

**Related:** B-026 stays its own bug unless Architect folds it in later.

**Primary file today:** `public/node-graph-module-scope-waterfall.js`
