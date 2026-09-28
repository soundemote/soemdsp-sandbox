# Future Planning Notes

This file collects project-shaping ideas that should survive day-to-day implementation without becoming immediate scope.

## Slider buffered modulation (destination = real effective-param history)

Parked under **0.5.0 RGB**. First visual when we return: live occupancy + caret on the value axis, not a mini-scope. Do not implement until asked.

Primary note:

```text
docs/SLIDER_BUFFERED_MODULATION_PLAN.md
```

## Lo-Fi Pitch Shift (component-first)

Realtime pitch tools aimed at **abusable lo-fi character**, not transparent stretch. Build lowest modules first (buffer â†’ varispeed â†’ grains â†’ grain pitch â†’ optional spectral dirt), each useful alone, then compose.

Primary note:

```text
docs/LOFI_PITCH_SHIFT_PLAN.md
```

## Dropdown Window Buttons

Next version: consider turning Command Center buttons into dropdowns instead of opening separate floating windows for every tool.

The current floating-window direction is good enough for this release. The next pass can consolidate window bodies into button-owned dropdown panels, because the panels are already starting to look and behave like compact modules.

Keep this as a next-version cleanup, not a release blocker.

## Inlets / outlets above displays (app-wide)

**Implemented.** LayoutA (and sample / phosphor face stacks) use `header â†’ io â†’ face â†’ params â†’ lip`. Display off and Display Height 0 omit the face track; I/O stays under the header.

Standing rule: `docs/APP_POLICY.md` (LayoutA I/O above the face). Band contract: `docs/MODULE_LAYOUT_PLAN.md`.

LayoutB (ports beside the face) and InletOutletLayout (title + I/O, no face) are unchanged. Do not add a second layout or an old-patch shim for the previous face-then-I/O stack.

## Waterfall redesign (amp-per-frame bars)

**Status:** **Implemented** on ArchIV (Website & UI, 2026-09-28, local, no PR). Needs Architect visual glance after reload.

**Done:**
- `public/node-graph-module-scope-waterfall.js` — all Waterfall scopes use peak-to-peak bars (running min/max → one bar per History paint → reset). No backlog scan; no dual TraceTape shim.
- Vibrato Generator face set to trace/Waterfall as reference consumer.
- Preserved: color, blend/Meet/CMY, Size/Blur/density, scale, History Hz, Sync/Cycles, now-line, hold, stereo/XYZ/RGB.

**Backup:** `_wip/node-graph-module-scope-waterfall.js.bak`

## True metamodule parameter mirror

**Status:** planned follow-up — not now. Website is shipping a **limited** mirror first (outer Show-on-metamodule checkbox resolves via `metaExpose` to the inner expose target). This item is the later **true** mirror.

**Today (limited):**
- Inner child params are exposed with `paramVisibility["childId|paramKey"]`.
- Outer UI is a synthetic `mx_*` shell param: mirrored **values**, but separate `paramMeta` / context-menu identity (two records that happen to share a value).

**Goal (true mirror):**
- Right-click / edit / menus on an outer `mx_*` metaparameter behave as if targeting the **inner child parameter** — one conceptual parameter (metadata, visibility semantics, related menus), not two forked records.
- Nested metamodule ambiguity stays **explicit**: unexpose on the parent vs expose the shell upward to a grandparent must remain distinguishable actions/UX, not collapsed into one vague toggle.

**Out of scope for this seed:** implementing code; changing the limited checkbox path Website is doing now.

**Owner / path:** planning SSOT here; implement later on ArchIV (direct local edits, no PR unless Architect asks). Repo `soundemote/soemdsp-sandbox`.

## Keytracking / pitch-tracking modulation UI

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** UI for modulating parameters from pitch / keytracking (tracked pitch or keyboard note as a modulation source), so settings can follow note/frequency without hand-wiring every destination each time.

**Still open:** source (MIDI note vs tracked pitch vs both), mapping curve, per-param vs global routing, overlap with existing CV / modulation paths.

## Circuits on a keyboard (play like a sample library)

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** Put circuits (patches / metamodule graphs) onto a keyboard and play them like a sample library — each key or zone triggers / voices a circuit the way a sampler triggers samples.

**Still open:** one circuit vs many mapped across keys, voice management, how a “circuit preset” is stored/selected, MIDI vs on-screen keyboard, relation to existing patch / metamodule load paths.

## Dimensional parameter prototyping

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** Help the case “these settings sound right at this frequency, but other frequencies need different settings.” Prototype parameters along a dimension (typically pitch / frequency) so values can vary across that axis instead of a single global knob.

**Still open:** which params are dimensional, interpolation vs breakpoints, authoring UI, runtime evaluation, overlap with keytracking modulation UI (may share infrastructure later; keep as separate seeds for now).

## Delay with exposed feedback path

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** A delay module that exposes a **feedback output** (and matching return) so the user can insert arbitrary modules into the feedback path — filters, distortion, pitch tools, etc. — instead of a closed internal feedback loop only.

**Still open:** wet/dry and time controls vs feedback jacks, mono/stereo, max delay, anti-howl / clip behavior, relation to existing delay / ping-pong modules.
