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

**Policy direction:** module **inlets and outlets sit above** the module's **display / face** area — app-wide, not per-module one-offs.

Intent:

- Jacks (inlets and outlets) are always in the band **above** scopes, LCDs, waterfalls, and other display faces.
- Display chrome stays below the I/O band so patching and reading faces do not fight for the same vertical slot.
- Apply as a layout / chrome rule across modules; do not invent per-face exceptions without an explicit exception in `docs/APP_POLICY.md`.

Status: planning note only — not scheduled. When implemented, encode as an APP_POLICY layout rule and align `docs/MODULE_LAYOUT_PLAN.md` / module face shells.
