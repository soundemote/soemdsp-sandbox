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

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** Make the 1D Waterfall face feel more like a classic waterfall and less like an expensive waveform/trace drawer. Drop (or stop relying on) heavy per-sample waveform ink. Instead, each display frame contributes **one cheap amplitude sample** drawn as a **single bar** (or equivalent column ink), then scroll history like a strip chart.

**Why:** Current face (`public/node-graph-module-scope-waterfall.js`) is a strip chart with Sync Off/On, History Hz / Cycles, and **TraceTape WebGL discs** for waveform ink (min/max column envelopes, phase-lock path). That is waveform-shaped and costly. Architect wants amplitude-per-frame bars instead.

**Out of scope until specified:** exact amp metric (peak / abs / RMS / dB), bar vs brightness column, Sync On fate, TraceTape retirement vs mode, Matrix Waterfall / phosphor drawers, and any tie-in to B-026 drawer rearm.

**Related:** B-026 (Pause → Stop → Play leaves value faces / waterfall drawers dark) stays its own bug; this redesign does not claim that fix unless Architect says so later.

**Primary file today:** `public/node-graph-module-scope-waterfall.js`
