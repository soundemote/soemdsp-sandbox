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


## Instant Waterfall Display Settings (premium look + amp law)

**Status:** **Implemented** on ArchIV (Website & UI, 2026-09-28, local, no PR). Display/UI only — **no JS audio DSP**.

**Scope:** Instant Waterfall schemas only (`waterfall` / `waterfallRgb` / `waterfallXyz`). Does **not** change `scope1dTrace`.

**Done:**
- Premium Instant Waterfall controls: **Blur** (soft vertical skirt on filled bars) + **Bright** for mono/stereo/XYZ/RGB. **Persist / Bloom / Detail removed** (2026-09-28).
- Display Settings waterfall-first (History / Scale / Amp law / Bright / Blur). Dropped Trace Size / Persist / Bloom / Detail / stamp-density from the Instant Waterfall form.
- Visual amplitude compression for painted height only: Amp law **Linear / Sqrt / Log / mu-law** (`ampLaw`). Scales face energy, not audio.
- Wired via `normalizeNodeGraphWaterfallSettings` + Canvas2D hold paint (same Bright path as existing ink). Defaults / cache-bust updated.

**Files:** `node-graph-module-scope-defaults.js`, `…-normalize.js`, `…-waterfall.js`, `…-trace-controls.js`, `…-settings-form.js`, `…-settings-controls.js`, `…-metrics.js`, `index.html`.

## Waterfall redesign (amp-per-frame bars)

**Status:** **Implemented** on ArchIV (Website & UI, 2026-09-28, local, no PR). Filled-bar strip contract 2026-09-28.

**Done:**
- `public/node-graph-module-scope-waterfall.js` — classic waterfall: **solid filled** peak-to-peak column rects (`fillRect` min..max Y), stamp on the **right**, history **scrolls left** on a Canvas2D hold plate. **No full-face redraw** (Sync no longer ClearTapes+rebuild). Freerun fractional `barAcc` seeds column 0.
- Vibrato Generator face set to waterfall (was misnamed Instant Trace) as reference consumer.
- Preserved: color, blend (Add/Multiply; Meet≈lighter on filled bars), scale, History Hz, now-line, hold, stereo/XYZ/RGB.

**Decision (2026-09-29):** Remove Sync from waterfall scopes. It is fundamentally incompatible with them. No Sync control, Sync Off/On, or cycle-lock on these scopes. Planning record only; code not changed here.

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

## Name-based choice persistence

**Status:** standing policy in `docs/APP_POLICY.md` (Choice / enum persistence). Follow-up work: audit and migrate any remaining **index-based** saved choices so reordering options cannot break patches.

**Direction:** All discrete UI choices store stable names/keys; no index-as-identity. One-shot migrations only when Architect asks — no dual-key shims (§1).

## AcidSequencer

**Status:** implemented locally, not tested by Argi, and not complete. Do **not** mark complete until Argi has tested a build.

Primary note:

```text
docs/ACID_SEQUENCER_PLAN.md
```

**Direction:** Own module (`acidSequencer`), not a change to **Sequencer** (`sequencer` piano roll). TB-303-style step sequencer: 13-note C–C piano grid with four per-step modifiers above it. Native C++/WASM DSP only; face/UI in JS; no JS DSP twin; no shims.

**Locked (Argi):**

- **Step length** (active step count) **1–32**, default **16**.
- Per-step modifiers: **Gate** (on / off / tie), **Accent** (Trigger), **Slide**, **Octave** (−1 / 0 / +1).
- **Tie does not hold pitch.** Tie = Gate stays high / no envelope retrigger across the boundary. Pitch may still change (piano note and/or Octave); Slide still applies when flagged.
- Params: local **bpm** (1-320, default 120), step length, Gate height 0-1, Accent height 0-1, Slide time (default 0.06 s), **semitone offset** integer -48..+48 default 0. Per-step Octave stays.
- **Left/right** rotate all 32 stored steps (wrap), not a viewport.
- Base grid **C2-C3** (MIDI 36-48). Outs **Gate, Trigger, pitch, f, inc**. No Clock/Reset jacks. One step = one 16th, transport start/stop. Accent = 1 ms trigger when Gate is on or tie. Slide = linear glide to the next step. Gate off holds pitch and kills Accent.

**Still open:** Argi has not tested the build. Do not mark this item complete.

## VU meter

**Status:** seed only — details TBD; do not implement until Architect expands this.

**Direction:** A VU meter. Architect named it on 2026-09-29. Behavior, face, ports, and what it reads are not specified yet.

**Still open:** module vs a display on an existing face, needle vs bar, mono/stereo, ballistics, scale, and the signal it measures.

## Varispeed Delay

**Status:** plan in `docs/VARISPEED_DELAY_PLAN.md`. Do not build until Architect says so.

**Direction:** Stereo live-buffer pitch by read-head speed, not by moving delay time. Locked params: Memory (seconds), Mix, Speed (0.5, -2 to +2), Filter Slope (1 to 4), LPF, HPF, Saturation, Amplitude. Chain is HPF then LPF then saturation then Amplitude. Waterfall is pre-Amplitude. Playhead running out is silence, no click avoidance. Do not implement yet. Doppler is a separate parked Space card, not this DSP.

## Doppler

**Status:** under-construction module in Space. No DSP. Not Varispeed.

**Direction:** A parked card so the name exists. Moving delay-time pitch only. Do not implement the varispeed read head here.

## Unipolar switch on 1D displays

**Status:** not implemented. Plan only. Dated 2026-09-29. Do not implement until Architect expands this.

**Request (Argi, 2026-09-29):** a unipolar switch on every 1D display.

**Proposed meaning (not locked):** the repo already uses bipolar as -1...+1 and unipolar as 0...+1 (U2B / B2U; Sample Hold Polarity). 1D paint currently centers a bipolar span: 1D Phosphor clamps the sample to -1...1 around mid-height, and Instant Waterfall uses midY - bipolar * halfHeight (comment: bipolar +/-1 reaches the face edges). Reading the switch as "draw 0...+1 instead of -1...+1" is a proposal only. Argi did not specify the exact range or where the control sits.

**1D kinds found:** catalog labels in `public/node-graph-module-store.js` — 1D Waterfall (`waterfall`), 1D Waterfall Stereo (`waterfallStereo`), 1D Waterfall RGB (`waterfallRgb`), 1D Waterfall XYZ (`waterfallXyz`), 1D Phosphor (`lineBurnOscilloscope`), 1D Trace (`scope1dTrace`), 1D Trace Stereo (`scope1dTraceStereo`). Display Settings clipboard families in `public/node-graph-module-scope-trace-controls.js` also name 1D Phosphor (`lineBurn`, `oscilloscopeBankBurn`), 1D Waterfall (`waterfall`, `waterfallRgb`, and `value`), and 1D Trace (`scope1dTrace`). `waterfallXyz` is catalog-labeled 1D Waterfall XYZ but that clipboard family returns 2D Instant Waterfall, so its membership is not locked. 2D Phosphor and 2D Trace are separate. No display-settings unipolar switch exists. Sample Hold Polarity remaps audio outs; its tooltip says the face/waterfall stays bipolar full height and ignores Polarity. `nodeGraphModuleScopeUnipolarTypes` is a module-id set and is not used by face paint.

**Still open:** exact range, which of the named 1D faces (including the waterfall-labeled ones and the XYZ mismatch), and control placement. Do not fold 1D Trace into the Instant Waterfall settings schema (`docs/APP_POLICY.md` section 15a). This seed does not prescribe DSP, worklet, or audio-thread changes.

## Display shaders

**Status:** plan + progress tracker in `docs/DISPLAY_SHADER_PLAN.md` (2026-10-06): move per-pixel display math into GLSL on one shared WebGL context; audio stays native C++/WASM. Do not build until Argi says go.
