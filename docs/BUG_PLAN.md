# soemdsp-sandbox bug plan

Working inventory. Implementation happens in this repo; this file is the durable list.

Started 2026-08-12 from an independent hunt (working tree included uncommitted LCD/LED/playlist/dimmer work). **User reports go in the same numbered list** — do not start a second file.

## How to add a bug

Append the next free `B-xxx` at the bottom of **Open bugs** (or drop a stub in **Inbox** and an agent will number it). Minimum:

```md
### B-xxx — short title
- Status: open
- Severity: hear | see | load | likely
- Source: user
- Files:
- What:
- Repro:
- Fix shape:
```

Severity:

| Tag | Meaning |
|-----|---------|
| **hear** | Wrong or missing audio |
| **see** | Wrong or missing face / chrome |
| **load** | Patch/plan/save fails or silently keeps old graph |
| **likely** | Strong code evidence; wants a patch to prove |

Status: `open` · `wip` · `fixed` · `wontfix` · `dup of B-xxx`

When fixing: mark `fixed`, one-line what changed, run `python scripts\smoke_test.py`. Native C++ changes need a module rebuild.

## Suggested fix clusters (not a schedule)

1. **Live plan sync** — B-002 tempo, B-003 bypass, B-016 stale send, B-017 smoother reset, B-006 pitch ref
2. **MOD SSOT** — B-001 (plus docs/tooltips)
3. **Disconnect / load** — B-004 comparator, B-014 retired graph wires, B-015 module groups
4. **Native IIR / delay / crossover** — B-008–B-013
5. **Playlist / Clear / LED / spectrogram** — B-018–B-025
6. **Layout / text box / hide-display** — B-031, B-032, B-036 (likely one height/grid bug)
7. **Patch persistence** — B-038 Visibility window (includes B-034 wires), B-035 RobinSinusoid history
8. **Policy / twins** — B-029 when it is time

**2026-08-12 run:** all hunt items except **B-010** (standby). Native instance/buffer raises (B-012/B-013) reverted — combined WASM memory cap. B-028/B-029 not in this run.

---

## Index

| ID | Sev | Status | Title |
|----|-----|--------|-------|
| B-001 | hear | fixed | MOD apply cliff / unipolar clip / docs lie |
| B-002 | hear | fixed | Patch / header BPM never reaches worklet |
| B-003 | hear | fixed | Bypass after start does not reach live audio |
| B-004 | hear | fixed | Unwire Comparator In keeps previous live graph |
| B-005 | hear | fixed | Stereo host input: right 0 becomes left |
| B-006 | hear | fixed | Patch pitch reference posted, never stored |
| B-007 | hear | fixed | 0.1V/Oct clamped to [−1, 1] |
| B-008 | hear | fixed | Scientific IIR zeros z on every cutoff tick |
| B-009 | hear | fixed | Linkwitz–Riley order 2 is actually LR4 |
| B-010 | hear | fixed | Sample Delay delay&lt;1 reads far end of ring |
| B-011 | hear | fixed | Crossover mono shortcut freezes right IIR |
| B-012 | hear | open | Native instance pools tiny then silent |
| B-013 | hear | open | SoEm Reverb delay mem is 1 s @ 48 kHz |
| B-014 | load | fixed | Graph wires to retired nodes abort load |
| B-015 | load | fixed | moduleGroup.sourcePatch not validated with parent |
| B-016 | load | fixed | Overlapping sendNodeGraphLivePlan can apply stale graph |
| B-017 | hear | fixed | setPlan resets smoother time to 16 ms |
| B-018 | see | fixed | Playlist double-click never plays |
| B-019 | see | fixed | Playlist highlight is also the playhead |
| B-020 | see | fixed | Clear blanks Value LCD/LED while paused |
| B-021 | see | fixed | Clear does not wipe spectrogram history |
| B-022 | see | fixed | LED treats lightTarget 0 as missing |
| B-023 | see | fixed | Spectrogram columns peak-normalized |
| B-024 | see | fixed | Room dimmer hard-caps 48 punches |
| B-025 | see | fixed | Playlist RAM table innerHTML XSS |
| B-026 | see | open | Pause → Stop → Play: waterfall drawers fail (LED values OK) |
| B-027 | hear | fixed | Header Speed 2.0 slows the patch |
| B-028 | hear | open | Chebyshev / Elliptic / high-order BP are RBJ stand-ins |
| B-029 | hear | fixed | Offline/Render JS twins ≠ live native (~60 types) |
| B-030 | hear | fixed | dsp_floor via long long UB for huge \|x\| |
| B-031 | see | fixed | Text Box settings: each character tanks framerate |
| B-032 | see | verify | Text Box resize / text clips into window |
| B-033 | hear | open | Fractal Brownian Motion has no X Y Z outputs |
| B-034 | load | dup of B-038 | Show/hide wires not saved with the patch |
| B-035 | load | fixed | RobinSinusoid oscilloscope history amount not saved |
| B-036 | see | verify | Hide display: sliders and I/O overlap (app-wide) |
| B-037 | hear | fixed | Passive Filter LP (LP6) is broken |
| B-038 | load | fixed | Visibility window settings not saved with the patch |
| B-039 | hear | fixed | Sabrina diffusion / seed / param timing |
| B-040 | see | fixed | Copy LCD does not copy size/colors |
| B-041 | see | fixed | Room dimmer cutouts ignore zoom/pan |
| B-042 | hear | fixed | Parameter smoothing intermittently snaps |
| B-043 | hear | fixed | Control chase not sample-accurate by default (Output Volume repro) |
| B-044 | hear | fixed | PolyBLEP Sine clicks once per cycle (Taylor ±π) |
| B-045 | hear | fixed | Self-mod (outlet→own param) silent — buf zeroed before stamp |
| B-046 | see | fixed | Shell doctype missing leading < → literal !doctype html> after start menu |
| B-047 | hear | fixed | Arp Inc Out broken after f→inc remap (Hz/sr on ƒ cables; face Ramp unpublished) |
| B-048 | see | fixed | Module settings enable/disable control does not mirror module button (2026-10-01 Module Actions host) |
| B-049 | hear | fixed | Softwave ignored Increment (Arp.inc OK on polyBlep only) |
| B-050 | see | open | Workspace zoom past ~10× stutters badly |
| B-051 | see | open | Softwave oscillator display needs unrelated EQ Frequency refresh |
| B-052 | see | fixed | Portal Out rename to ChordKeys skips outlet color/shape |
| B-053 | see | fixed | Catalog Portal In/Out replaced by linked Portal IO |
| B-054 | see | open | Output display keeps pause emoji after Stop/Play |
| B-055 | see | fixed | Text Box covers wires (UI z-order) |
| B-056 | see | fixed | Default filter drawer pollutes basic displays / Softclipper display jitters |
| B-057 | see | fixed | Hide unused leaves oversized bottom lip |
| B-058 | hear | open | Voice parameter modulation misses active and idle voice updates |
| B-059 | see | removed | Alt+click jack scope-monitor feature deleted (was pip, not orphan wire) |
| B-060 | hear | open | Pulse Explosion does not modulate PolyBLEP amplitude (likely no output) |
| B-061 | see | fixed | Small slider values show mantissa (8.0357) — scientific exponent stripped |
| B-062 | hear | open | Non-audio UI changes restart audio engine |
| B-063 | hear | fixed | Robin Oscillator Morph MOD silent (ParamModEdge → WIDTH, not SHAPE) |
| B-064 | see | fixed | Text Box background overflows outline when title is hidden |
| B-065 | see | open | Multi-wire portal action creates duplicate portals instead of one Portal In / multiple Portal Outs |
| B-066 | see | open | Multi-select Portal settings hides Title and locks Display |
| B-067 | see | open | Bottom lip can leave less than 2 px clearance |
| B-068 | see | open | Canvas-mode slider/knob/text display scaling is not WYSIWYG |
| B-069 | see | open | Canvas mode omits displays that are not in view |
| B-070 | hear | fixed | CallNow keypad/PhoneTone silent (Gate OK; keypad host CV) |
| B-071 | see | fixed | Canvas-mode Text Box does not scale with the tile (WYSIWIS) |
| B-072 | see | fixed | PolyBLEP phosphor Size reverts after closing Display Settings |
| B-073 | see | fixed | Parameter label left padding vs number (sign column) |
| B-075 | see | open | Pitch Mod Wheel face has no pitch/mod-wheel UI or display control |
| B-076 | see | fixed | F11 fullscreen shuffles the canvas; F F F recycles the view |
| B-077 | hear | fixed | Keyboard Inc outlet silent (host CV missing after evaluator retirement) |
| B-078 | see | fixed | Trace/Phosphor/Waterfall scopeFace faces hidden (band id trace vs face-track-omitted) |
| B-079 | see | fixed | Choices range clamp keeps full catalog labels/dividers (no subset remap) |
| B-080 | see | fixed | Choice segment text ellipsizes before full track width |
| B-081 | see | fixed | scope1dTrace Size / Vibrato thickness not bound to TraceWoscope; Scale <1 shrunk Y |
| B-082 | hear | fixed | Unit-band param MOD must clamp to paramMeta [min,max] (Gate+Toggle > Amp max) |
| B-083 | see | fixed | Tube Sat TraceWoscope face blank (demo Bright=0) |
| B-084 | see | fixed | scope1dTrace Display Settings gradient not feeding TraceWoscope LUT |
| B-085 | see | fixed | Multi-select Display Settings copies unedited settings |
| B-086 | see | open | 1D Trace sync glitches more than phosphor sync |
| B-087 | see | open | Longer sequencer clips cut short with multiple sequencers |

---

## Inbox (unnumbered user reports)
- 2026-09-28: Tube Sat TraceWoscope face blank (demo Bright=0) — fixed → **B-083** (docs/B-083_TUBE_SAT_TRACE_FACE_BLANK.md).
- 2026-09-28: Tube Sat / scope1dTrace TraceWoscope not applying Display Settings gradient (2D Trace stays solid) — fixed → **B-084** (docs/B-084_SCOPE1DTRACE_GRADIENT_LUT.md).

Paste raw notes here. An agent will promote them to `B-xxx` on the next pass.

<!-- user: paste below this line -->

- 2026-09-10: Desktop patch `zipper noise on volume knob of output module.json` — Output Volume zipper while dragging. Promoted → **B-043**.
- 2026-09-10: Desktop `repeating clicks from a sinewave.json` — PolyBLEP Sine @ 4 Hz clicks once/cycle. Promoted → **B-044**.
- 2026-09-27: User — zooming in past 10 stutters the app horribly. Promoted → **B-050** (`docs/B-050_ZOOM_PAST_10_STUTTER.md`).
- 2026-09-28: User - Text Box: hiding the title causes the background to overflow the module outline/border. Promoted -> **B-064** (`docs/B-064_TEXT_BOX_HIDDEN_TITLE_BACKGROUND_OVERFLOW.md`).
- 2026-09-28: User - making a portal on multiple wires creates multiple portals for the same signal instead of one Portal In and multiple Portal Outs. Promoted -> **B-065** (`docs/B-065_PORTAL_MULTIWIRE_DUPLICATES.md`).
- 2026-09-28: User - selecting two portals makes Title disappear and Display uneditable, preventing multi-select title/display changes. Promoted -> **B-066** (`docs/B-066_PORTAL_MULTISELECT_TITLE_DISPLAY.md`).
- 2026-09-28: User - bottom lip must keep at least 2 px clearance from the last element; otherwise lower the lip by 1 GU. Promoted -> **B-067** (`docs/B-067_BOTTOM_LIP_CLEARANCE.md`).
- 2026-09-28: User - slider display and knob do not scale properly in canvas mode; slider-associated text can be positioned/scaled outside the module; WYSIWYG ("what I see is what is scaled") is not held for slider/knob display. Promoted -> **B-068** (`docs/B-068_CANVAS_SLIDER_KNOB_SCALING.md`).
- 2026-09-28: User - if the display is not in view, it will not appear in canvas mode. Promoted -> **B-069** (`docs/B-069_CANVAS_MODE_OFFSCREEN_DISPLAY_MISSING.md`).
- 2026-09-28: User - CallNow: keyboard/keypad not sending clicks, PhoneTone not sending tones; Gate button works. Promoted -> **B-070** (`docs/B-070_CALLNOW_KEYPAD_PHONETONE_SILENT.md`).
- 2026-09-28: User - Text Box in canvas mode is not taking scaling into account. Promoted -> **B-071** (`docs/B-071_CANVAS_TEXT_BOX_SCALING.md`); separate from B-068 knob/slider cqmin path.
- 2026-09-28: User - PolyBLEP display phosphor Size does not stick after closing Display Settings. Promoted -> **B-072** (`docs/B-072_POLYBLEP_PHOSPHOR_DOT_SIZE_PERSIST.md`).
- 2026-09-28: User - Keyboard not sending out Inc. Promoted -> **B-077** (`docs/B-077_KEYBOARD_INC_HOST_CV_MISSING.md`).
- 2026-09-28: User - Choices range clamp (PolyBLEP Waveform 4–5) does not remap choice set. Promoted → **B-079** (`docs/B-079_CHOICES_RANGE_CLAMP_SUBSET.md`).
- 2026-09-28: User - Choices parameter (Tube Saturation context): choice divide/segment text ellipsizes too early / does not use full slider width. Promoted → **B-080** (`docs/B-080_CHOICE_SEGMENT_TEXT_FULLWIDTH.md`).
- 2026-09-28: User - Parameter modulation must clamp to param max/min (Keyboard Gate + Toggle into PolyBLEP Amplitude). Promoted -> **B-082** (`docs/B-082_PARAM_MOD_CLAMP_MIN_MAX.md`).
- 2026-09-29: User - selecting multiple displays and changing one setting (example: Show in canvas) also copies the edited module's other, unchanged settings onto the rest of the selection. Promoted -> **B-085** (`docs/B-085_MULTISELECT_DISPLAY_SETTINGS_COPY.md`).
- 2026-09-29: User - 1D Trace / woscope sync mode glitches a lot more than phosphor sync. Maybe zero crossings per quantum. Logged only, do not fix yet. Promoted -> **B-086** (`docs/B-086_SCOPE1DTRACE_SYNC_GLITCH.md`).
- 2026-09-30: User - Longer sequencer clips get cut short when a patch has two or more sequencers. Promoted -> **B-087** (`docs/B-087_LONG_SEQUENCER_CLIPS_CUT_SHORT.md`).

---

## Open bugs

### B-001 — MOD apply cliff / unipolar clip / docs lie
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-graph-stdlib/node-graph-param-surface-helpers.js` (~264–310); `docs/PARAM_SURFACES.md`; sineWavetable freq tooltip in `node-graph-module-definitions.js`
- What: `|Σmod| ≤ 1` → linear unit map across `[min,max]`. `|Σmod| > 1` → sudden domain-add (`base + 1.2`). Unipolar dest (`min ≥ 0`, including Frequency) clips `mod = max(0, mod)`. Docs still say frequency is `base * 2^(mod/0.1)` and that bipolar LFOs work on level/morph. Two 0.6 CVs summing past 1 flip units. Matches commit “MODULATION STILL A BIT BROKEN”.
- Repro: LFO 0–1 → Frequency; two unit CVs on one param that sum &gt; 1; bipolar LFO → unipolar Level/Freq.
- Fix shape: One SSOT. Classify **source** (unit vs absolute Hz) on the wire, not `|sum|`. Stop clipping negatives unless metadata is explicitly unipolar. Frequency either V/Oct as documented **or** linear unit forever — not a magnitude cliff. Update PARAM_SURFACES + tooltips.

### B-002 — Patch / header BPM never reaches worklet
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-graph-live-plan-runtime.js` 17–37; `public/node-live-audio-worklet-set-plan.js` 16; `public/node-live-audio-worklet-events.js` (`setConnections`); `public/node-graph-live-runtime.js` (`nodeGraphLivePlanShapeSignature`)
- What: Compiled plan has `timing`. Live plan builder omits it. Worklet defaults to **120 BPM**. BPM-only edits do not change shape signature → `setConnections` never writes `this.timing`.
- Repro: Load a 90 BPM patch; Transport / note-sync delay / tempo reverb stay at 120. Change header BPM while live — same.
- Fix shape: Copy `timing: compiled.timing` onto the live plan. Include timing in the shape signature **or** apply `plan.timing` in `setConnections`. Nested runtimes too.

### B-003 — Bypass after start does not reach live audio
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-graph-live-runtime.js` 2068–2080; `public/node-live-audio-worklet-events.js` (`setConnections` / `setParams`); `public/node-live-audio-worklet-set-plan.js` 29–30
- What: `node.bypassed` is only applied in `setPlan`. Toggle bypass does not change shape (id/type/order) so the worklet keeps the old flag.
- Repro: Play a patch. Bypass an osc or FX. Audio unchanged until add/remove node or restart live.
- Fix shape: Put bypass in the shape signature, **or** apply `bypassed` / `bypassSpec` in `setConnections` / `setParams`.

### B-004 — Unwire Comparator In keeps previous live graph
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-graph-execution-plan.js` 567–636
- What: Soft missing-input regex is `input|gate|trigger|light|clock`. Comparator emits `missing … signal` → blocking → previous live plan preserved.
- Repro: Osc → Comparator → Output. Pull Comparator In. Osc still heard.
- Fix shape: Emit `missing … input` or add `signal` to the soft regex.

### B-005 — Stereo host input: right 0 becomes left
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-live-audio-worklet-process.js` 29–30; `public/node-graph-stdlib/node-graph-control-bus-helpers.js` 76–77
- What: `Number(input[1]?.[frame]) || inputLeft` treats a real 0 as missing.
- Repro: Stereo input, hard-pan right or anti-phase. Right zero-crossings inject left.
- Fix shape: `Number.isFinite` / `??`, never `||` for samples.

### B-006 — Patch pitch reference posted, never stored
- Status: fixed
- Severity: hear
- Source: hunt-2026-08-12
- Files: worklet `setPlan` / events; native `soemdsp_graph_set_pitch_reference`
- What: `pitchReferenceHz` / `pitchReferenceMidiNote` are posted. Worklet never assigns `this.pitchReferenceMidiNote`. Oscs always MIDI 48 / 0.4 V.
- Repro: Change Patch Settings concert pitch / reference note. 0.1V/Oct tracking unchanged.
- Fix: Worklet stores both on `setPlan`/`setConnections`. Native graph uses `pitchReferenceMidiNote/120` (default 69) instead of hardcoded 48/120. New-patch default is 440 Hz @ MIDI 69. (2026-09-22)

### B-007 — 0.1V/Oct clamped to [−1, 1]
- Status: fixed
- Severity: hear
- Source: hunt-2026-08-12
- Files: worklet utility midi/120; live evaluators; pitch offset ±10; param-surface pitch ratio
- What: CV is `midi/120`. MIDI 127 → 1.058, clamped to 1.0. Notes above MIDI 120 flatten.
- Repro: Keyboard / stacked pitch CV above ~MIDI 120.
- Fix: Removed product-range ±1 / ±10 oct clamps on pitch CV and patch pitch offset (2026-09-10). Keyboard / MIDI `0.1V/Oct` no longer clamp midi/120 to 1.0 (2026-09-22).

### B-008 — Scientific IIR zeros z on every cutoff tick
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `library/include/soemdsp/filter/scientific_iir.h` ~244, 273, 307; `public/modules/scientificIir/scientific-iir-math.js` ~193
- What: Redesign always writes `z1 = z2 = 0`. Smoothed/modulated Frequency has no memory — filter is a gain until the knob stops.
- Repro: Butterworth (or LR / Bessel / Cheby / Elliptic) Frequency sweep or modulate. Clicks, thin, no resonance until parked.
- Fix shape: Preserve z on coeff-only updates (crossover `remap_cascade` pattern). Zero only on kind/mode/order change.

### B-009 — Linkwitz–Riley order 2 is actually LR4
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `library/include/soemdsp/filter/scientific_iir.h` 263–266
- What: `half = order/2` then `if (half < 2) half = 2` → two 2nd-order BW = 24 dB/oct. Tooltip says two Butterworth of order/2. Crossover already has a correct LR2 one-pole path.
- Repro: Linkwitz-Riley Order 2 vs Crossover LR2; or sum complementary pair.
- Fix shape: Order 2 → complementary one-poles. Dual-biquad only for 4 and 8.

### B-010 — Sample Delay delay&lt;1 reads far end of ring
- Status: fixed
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/sample_delay/sample_delay.cpp`; `public/modules/sampleDelay/sample-delay-math.js`
- What: Read before write. `0 < delay < 1` interpolates the write tap, which is not the current input — after wrap, audio from 768000 samples ago (~16 s @ 48 kHz).
- Repro: Sample Delay Time slightly above 0, or Time smoother leaving 0. Delayed has a late echo. Thru is dry.
- Fix: Write then read. Delay 0 and the write-tap interpolant use the current input. No min-delay floor. Ring wrap is only the allocated buffer.

### B-011 — Crossover mono shortcut freezes right IIR
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/crossover/crossover.cpp` 412–419; `public/modules/crossover/crossover-math.js` 468–476
- What: `lIn == rIn` (normal Mono-In) only processes left. Right state stays at rest. First stereo divergence: right bands fade/click from zero.
- Repro: Mono into Crossover, then unmute R / pan / unplug one side.
- Fix shape: Still run right (or copy left filter state when leaving the shortcut). Copying *outputs* is fine.

### B-012 — Native instance pools tiny then silent
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/soem_reverb/soem_reverb.cpp` (`kMaxInstances = 1`); sabrina_reverb `= 2`; delay_effect / ping_pong `= 4`; sample_delay `= 8`
- What: `create` returns 0; JS stays silent (APP_POLICY §2).
- Repro: Two SoEm Reverbs; five Delay Effects.
- Fix shape: Raise caps, or show a face error when create fails. Document hard limits if they stay.

### B-013 — SoEm Reverb delay mem is 1 s @ 48 kHz
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/soem_reverb/soem_reverb.cpp` 24–25, ~496
- What: `kMaxDelaySamples = 48000`. At 96 kHz, 1 s Echo Time is 0.5 s.
- Repro: High engine rate + Echo Time 1 s.
- Fix shape: Size like delay_effect (`seconds * 192 kHz`) or grow with `sampleRate`.

### B-014 — Graph wires to retired nodes abort load
- Status: open
- Severity: load
- Source: hunt-2026-08-12
- Files: `public/node-graph-patch-core.js` 524–526 (vs signal/mod drop of retired ids)
- What: Retired `"graph"` nodes are stripped. Graph wires still throw `graph connection references missing node`.
- Repro: Old patch Graph.Out → Additive Damping Graph / Phase Graph.
- Fix shape: Drop graph wires whose ends are retired/missing, same as connections/modulations.

### B-015 — moduleGroup.sourcePatch not validated with parent
- Status: open
- Severity: load
- Source: hunt-2026-08-12
- Files: `public/node-graph-patch-core.js` ~336; `public/node-graph-live-plan-runtime.js` 146–150
- What: Inner patch is only cloned. Live compile throws uncaught on bad/old inner graph. Nested A⊃B⊃A can recurse with no cycle guard.
- Repro: Loadable parent + bad inner group → whole live plan fails or previous plan kept.
- Fix shape: Validate/migrate/drop `sourcePatch` in parent validate. Catch inner compile. Guard recursion.

### B-016 — Overlapping sendNodeGraphLivePlan can apply stale graph
- Status: open
- Severity: load
- Source: hunt-2026-08-12
- Files: `public/node-graph-live-runtime.js` ~2116–2181, flush ~2697
- What: Flush does not await send. Send awaits sample decode, **then** increments `planSerial` and posts. Slower first send can win.
- Repro: Rapid rewire / Music Player load while a sample is still decoding.
- Fix shape: Generation token; abort if not latest after await. Or hold the sync lock until send finishes.

### B-017 — setPlan resets smoother time to 16 ms
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-live-audio-worklet-set-plan.js` 11
- What: `this.autoSmoothingSeconds = 0.016` on every full plan. Patch Smooth Time only returns on later `setParams`.
- Repro: Set a long Smooth Time. Add/remove a module. Knobs zipper until a slider moves.
- Fix shape: Send `autoSmoothingSeconds` on `setPlan`, or keep the previous worklet value.

### B-018 — Playlist double-click never plays
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/modules/audioPlayer/audio-player-playlist.js` 596–605
- What: Single-click sets index and `RefreshUi()` → `replaceChildren()` destroys the row before `dblclick`.
- Repro: Open playlist, double-click a track. Nothing plays.
- Fix shape: Click must not rebuild the list. Or second click on the selected row = play.

### B-019 — Playlist highlight is also the playhead
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/modules/audioPlayer/audio-player-playlist.js` ~423, 596
- What: Click writes `pl.index`. Auto-advance does `index + 1`.
- Repro: Play track 1, highlight 5, let the song end → jumps to 6.
- Fix shape: Separate `playingIndex` (or derive from `node.sample.id`) from UI selection.

### B-020 — Clear blanks Value LCD/LED while paused
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/node-graph-module-scope-wipe.js` ~378; `public/node-graph-module-scope-number-readout.js` ~1962
- What: Clear fills the canvas. Frozen-hold early-out refuses to redraw (same `FrozenHoldSig` + size).
- Repro: Pause → Display Settings → Clear. Digits gone until unpause.
- Fix shape: Bust hold/burn cache on Clear, or `paintNodeGraphNumberReadoutColdBoot(..., { force: true })`.

### B-021 — Clear does not wipe spectrogram history
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/node-graph-module-scope-wipe.js` ~324; `public/modules/spectrogram/spectrogram-display.js` ~530, 665
- What: History lives on an off-DOM canvas. Force-draw blits it back.
- Repro: Spectrogram with history → Clear. Waterfall reappears.
- Fix shape: Clear the `spectrogramHistory` entry for that nodeId, then present a cold plate.

### B-022 — LED treats lightTarget 0 as missing
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/modules/led/led-display.js` ~213; same `!(x > 0)` in spectrum / number-readout
- What: Valid off (0) falls back to peak of last 64 ring samples.
- Repro: Drive LED to 0. Lamp stays on until the ring fills with zeros.
- Fix shape: `Number.isFinite(lightTarget)` for “has metadata”. Peak-scan only when absent.

### B-023 — Spectrogram columns peak-normalized
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/modules/spectrogram/spectrogram-display.js` ~278
- What: Each hop scaled by `1/peak`. Quiet frames as bright as loud. Min/Max Threshold do not track energy.
- Repro: Quiet then loud material; move thresholds.
- Fix shape: Same dB/linear window as the analyzer; threshold on that scale.

### B-024 — Room dimmer hard-caps 48 punches
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/node-graph-room-dimmer.js` (`MAX_RECTS = 48`)
- What: Collection stops at 48. Hover cutouts consume slots. Later faces stay under the veil.
- Repro: Dimmed room, many LCD/LED/scopes.
- Fix shape: Raise cap, or drop off-screen first / merge rects.

### B-025 — Playlist RAM table innerHTML XSS
- Status: open
- Severity: see
- Source: hunt-2026-08-12
- Files: `public/modules/audioPlayer/audio-player-playlist.js` ~675
- What: `item.name` interpolated into `innerHTML` (only `"` escaped in title).
- Repro: Filename with `<img onerror=…>`.
- Fix shape: `textContent` / `createElement`.

### B-026 — Pause → stop → play leaves value faces dark
- Status: wip
- Severity: see
- Source: hunt-2026-08-12 (uncommitted working tree)
- Files: `public/node-graph-live-runtime.js`; `node-graph-module-scope-wipe.js`; `node-graph-module-scope-paint-gate.js`; `node-graph-module-scope-number-readout.js`; `node-graph-room-dimmer.js`; `modules/led/led-display.js`
- What: Stop punched canvas `lightStrength` to 0; pause froze hold; Play did not always 0→1. Uncommitted work rearms faces and treats full Stop as not-frozen. Not done: B-020, B-022, B-024.
- Repro: Pause → Stop → Play. Value LCD/LED/Pitch Detector stay dark or idle.
- Fix shape: Finish the in-flight rearm; do not regress pause residual hold.

### B-027 — Header Speed 2.0 slows the patch
- Status: open
- Severity: likely
- Source: hunt-2026-08-12
- Files: `public/node-live-audio-worklet-process.js` 11–15; `public/node-live-audio-worklet-events.js` 44–46; script path `node-graph-live-runtime.js` ~1263 (ignores speed)
- What: `effectiveRate = hostSr * speed` then `phase += f / rate`. Speed 2 → half increment. ScriptProcessor fallback does not apply speed (pause may not silence that path).
- Repro: Set Speed 2.0 / 0.5 with an osc. Confirm against Speed field tooltip before flipping.
- Fix shape: If Speed means playback rate: `effectiveRate = host / max(speed, ε)` or `phase += speed * f / sr`. Same on script path.

### B-028 — Chebyshev / Elliptic / high-order BP are RBJ stand-ins
- Status: open
- Severity: likely
- Source: hunt-2026-08-12
- Files: `library/include/soemdsp/filter/scientific_iir.h` ~180–240
- What: Cheby = Butterworth Q × made-up epsilon. Elliptic comment admits a stand-in. BP/BR replace every section Q with `1/bandwidthOct` (same peak stacked).
- Repro: Ripple / Order on Cheby or Elliptic; raise BP order.
- Fix shape: Real analog prototype → bilinear, **or** rename tooltips to “RBJ cascade (Cheby/elliptic-ish Q)”.

### B-029 — Offline/Render JS twins ≠ live native (~60 types)
- Status: fixed
- Severity: hear
- Source: hunt-2026-08-12 (also `docs/POLICY_COMPLIANCE_AUDIT.md`)
- Files: `node-graph-render-output.js`, worklet native graph, index.html, orphan evaluators
- What: APP_POLICY §5: one core. Render/Live product path already native. Disk still had ~150 worklet-evaluators + ~170 live-evaluators + evaluateFrame stack.
- Fix (2026-09-10): Deleted all `*-worklet-evaluator.js`; deleted orphan JS audio `*-live-evaluator.js` (kept thru/controller/metamodule stubs only); removed evaluate-frame / evaluators* worklet DSP sources; ScriptProcessor creator throws; `evaluateNodeGraphPlanFrame` stub returns silence; Render Sample smoke `require_render_sample_native_only`. Downloadable bounce = OfflineAudioContext + same native graph — no JS twin required.

### B-030 — dsp_floor via long long UB for huge |x|
- Status: open
- Severity: likely
- Source: hunt-2026-08-12
- Files: `library/include/soemdsp/math/scalar_helpers.h` 18–21
- What: `(double)(long long)x` is undefined for `|x| ≥ 2⁶³`. Used by wrap01, sin/cos reduce, delay index, S&H.
- Repro: Exploded chaotic state / huge phase / `sampleFrequency >> sr`.
- Fix shape: If `|x| ≥ 2^53` return `x` (already integral in double); else safe floor. Reject non-finite.

### B-031 — Text Box settings: each character tanks framerate
- Status: open
- Severity: see
- Source: user
- Files: `public/node-graph-text-box-rendering.js`; `public/node-graph-text-box-utils.js`; module settings path that writes `layout.text`
- What: Every character typed in the Text Box’s settings text field causes a huge framerate drop. Hunt did not cover this. Likely each `input` commits the patch and re-renders/relayouts the whole workspace (or fill-mode font-fit).
- Repro: Open a Text Box → Settings → type in the text field. FPS dies per keystroke.
- Fix shape: Debounce commit; do not full-graph render on each char. Update the face text locally; persist on blur / idle.

### B-032 — Text Box resize / text clips into window
- Status: verify (min outer is header+1gu text; face track = remaining height; body `min-height: 0` so 1fr can shrink)
- Severity: see
- Source: user
- Files: `public/node-graph-module-sizing.js` (`nodeGraphTextBoxMinOuterHeightGu`, `normalizeNodeGraphTextBoxHeightUnits`); `public/styles.css` `.node-text-box-body`
- What: Cannot resize the Text Box properly. Body text clips into the window chrome, or height/width gu is wrong. User suspects same root as B-036.
- Repro: Resize a Text Box (and/or switch singleLine / multiline / fill). Text overlaps title bar or is clipped.
- Fix shape: One content-height SSOT (face + chrome + bottom clearance). Resize should change outer heightGu and reflow the text face, not clip.

### B-033 — Fractal Brownian Motion has no X Y Z outputs
- Status: open
- Severity: hear
- Source: user
- Files: `public/modules/fbmField/fbm-field-register.js` (outputs `X,Y,Z`); `public/node-graph-module-definitions.js` `fractalBrownianNoise` (outputs `Out X, Out Y, Out Z`); matching live/worklet evaluators
- What: User: no X/Y/Z outputs on the fractal Brownian motion module. Definitions already *declare* three outs. If the face still has none, chrome / hideUnused / LayoutB port mount / evaluator not publishing is the bug — confirm which module (Field vs Noise).
- Repro: Add Fractal Brownian Field and/or Fractal Brownian Motion. Check output jacks and whether they carry signal.
- Fix shape: If ports missing in chrome, mount X/Y/Z. If ports exist but silent, fix evaluator/native mapping. Do not hide XYZ behind hide-unused by default.

### B-034 — Show/hide wires not saved with the patch
- Status: dup of B-038
- Severity: load
- Source: user
- What: Specific case of B-038 (Visibility “Wire Lengths”). Do not fix separately.

### B-038 — Visibility window settings not saved with the patch
- Status: open
- Severity: load
- Source: user
- Files: `public/index.html` Visibility menu; `public/node-graph-view-controls.js`; `public/node-graph-ui-settings-persistence.js`; `public/node-graph-patch-normalizers.js` `normalizeNodeGraphPatchView` (only `widthGu` / `heightGu` / `zoom`)
- What: The Visibility window toggles live on `nodeGraphMvp` + user UI settings (machine/session). `patch.view` only stores workspace size and zoom. Save/reload/share a patch and Visibility choices are lost or follow the last app-wide UI file.
  Menu items today: Tooltips, Grid, Grid Light, Wire Lengths (B-034), Wires Above Modules, Module Buttons, Displays, Control Surfaces, Sliders, Amount Slider, Position Slider. Debug is intentionally session-only.
- Repro: Change Visibility (hide grid, hide wires, hide displays, …) → save patch → reload or open the patch elsewhere. Those toggles do not come back from the patch.
- Fix shape: Persist the Visibility flags that should travel with a patch on `patch.view` (or `patch.visibility`) and apply on load. Keep Debug session-only. Decide which flags are patch (how this patch looks) vs user-UI (how this machine looks). Wire Lengths is one of them, not a separate bug.

### B-035 — RobinSinusoid oscilloscope history amount not saved
- Status: open
- Severity: load
- Source: user
- Files: `public/node-graph-module-definitions.js` `robinSinusoid` (no `displayType`); `public/node-graph-patch-clone.js` `cloneNodeGraphTypedDisplaySettings`; `public/node-graph-module-scope-normalize.js` `historySeconds`
- What: History / sweep length on RobinSinusoid’s scope does not survive save/load. Type has no `displayType`; history lives on `traceDisplaySettings.historySeconds`. Clone/validate can drop or reset it if the schema path does not treat the default osc face as `trace`/`scope2d`.
- Repro: Set RobinSinusoid Display Settings → History. Save, reload. History back to default.
- Fix shape: Give RobinSinusoid an explicit display schema, or persist default-osc `traceDisplaySettings` the same way as `displayType: "waterfall"`. Verify other no-displayType oscs (same hole).

### B-036 — Hide display: sliders and I/O overlap (app-wide)
- Status: verify (apply path landed; `scripts/test_module_layout_bands.js` covers §7 stacks; confirm once on the workspace before closing)
- Severity: see
- Source: user
- Plan: `docs/MODULE_LAYOUT_PLAN.md` (rebuild module stacks; do not add another hide-display selector)
- Files: `public/node-graph-module-sizing.js` (`nodeGraphModuleLayoutBands`, `applyNodeGraphModuleLayout`); `public/node-graph-module-rendering.js`; `public/styles.css` `.dsp-node.module-stack`
- What: Hiding the display leaves sliders overlapping the I/O / out-jack strip. Root cause: CSS still reserved a face **track** after the face node is `display: none` or unmounted; I/O auto-places into that hole and sliders sit on the jack row.
- Repro: Hide display on Output or any LayoutA module with sliders + I/O. Param rows collide with jacks.
- Fix shape: One band list + apply (omit hidden tracks). Article `grid-template-rows` comes from `--node-module-stack-rows`. Do not extend the old `:not(.sample-module-layout)` rematch.

### B-037 — Passive Filter LP (LP6) is broken
- Status: open
- Severity: hear
- Source: user
- Files: `native_modules/passive_filter/passive_filter.cpp` (LP uses `highFrequency`); `public/modules/passiveFilter/passive-filter-worklet-evaluator.js`; `public/modules/passiveFilter/passive-filter-live-evaluator.js`; defs in `node-graph-module-definitions.js` (`mode` LP6/BP6/HP6, High Cut = LP cutoff)
- What: User: lowpass in the passive filter set is broken. LP is mode 0 and reads **High Cut**, not Low Cut. Live path is native-only and **throws** if wasm is not ready (not silence). Offline is JS one-pole.
- Repro: Passive Filter Mode LP6. Sweep High Cut (and Low Cut) vs a bright osc. Compare HP6 / BP6.
- Fix shape: Confirm mode/cutoff mapping and native LP coeffs. If High Cut is the intended LP knob, make the unused Low Cut inert/hidden in LP6 so it does not look dead. Native-not-ready must silence, not throw.

### B-043 — Control chase not sample-accurate by default (Output Volume repro)
- Status: fixed
- Severity: hear
- Source: user (Desktop patch `zipper noise on volume knob of output module.json`) — **framework**, not Output-special
- Files: `native_modules/graph_engine/graph_engine.cpp`
- What: Trailing `smoother_run` after DSP + freeze-outside `control_effective` → one ZOH jump/block (zipper). `smoother_step_node` was opt-in.
- Fix: SSOT `control_audio(g, c, f)` / `control_ensure_stepped` with `steppedCount` (idempotent per Control per frame). Heard continuous params in sample loops use `control_audio`. Deleted `smoother_step_node` / `node_control_smoothing` / `blockStepped`. Trailing `smoother_run` is catch-up only for unread/block-ZOH Controls. Output/Gain/Mix/MixStereo/Bias (+ Class A loops) sample-accurate. Smoke: `scripts/smoke_output_volume_chase.mjs`.

---

### B-044 — PolyBLEP Sine clicks once per cycle (Taylor ±π)
- Status: fixed
- Severity: hear
- Source: user (Desktop 
epeating clicks from a sinewave.json)
- Files: 
ative_modules/polyblep/polyblep.cpp; library/include/soemdsp/math/analog_filter_trig.h; SinCos method expansion in sine_wavetable.cpp
- What: Sine used Taylor-about-zero on phase wrapped to ±π. sinApprox(π)≠0 → jump ~0.014 each wrap → clicks at f0.
- Fix: PolyBLEP Sine = shared half-sine wavetable LUT (APP_POLICY sine SSOT). Taylor Method on SinCos is quadrant-folded (continuous). Smoke: scripts/smoke_polyblep_sine_wrap.mjs.

### B-045 — Self-mod (outlet→own param) silent
- Status: fixed
- Severity: hear
- Source: user (PolyBLEP out → own param; app-wide)
- What: ParamModEdge stamped from node.buf after process_block zeroed buf → self-mod always 0. Early JS kept prior output.
- Fix: Unified Edge (Port|Control sinks); per-channel z^-1 hist; stamp/mix read hist for self/unprocessed sources; update hist after write. Smoke: scripts/smoke_polyblep_self_mod.mjs.

### B-046 — Shell doctype missing leading < (literal !doctype html> after start menu)
- Status: fixed
- Severity: see
- Source: user
- Files: public/index.html; public/perform.html
- What: Both shells started with !doctype html> (leading < stripped). Browser treated it as a text node; after start-menu dismiss / boot overlay hide, raw !doctype html> showed at top of workspace.
- Repro: Start app → START SANDBOX → look at top of workspace for !doctype / html garbage.
- Fix: Restored <!doctype html> on line 1 of both shells. No JS/audio-path change.

### B-047 — Arp Inc Out not working (f→inc remap / face Ramp unpublished)
- Status: fixed
- Severity: hear
- Source: user 2026-09-27 (“inc out of arp not working”)
- Files: `native_modules/graph_engine/graph_engine.cpp` (`process_arp`); `public/node-live-audio-worklet-native-graph.js`; `public/node-graph-module-definitions.js` (`arp`); `scripts/smoke_graph_arp.mjs`; cache-bust `?v=arp-inc-2`
- What: Pitch-family rename put **Hz/sr** on Ramp and aliased legacy **`f` → `inc`**. Cables / publish names for ƒ then carried cycles/sample into Hz jacks. Face scope rings only published Mono/Left/Right, so **`inc` on Ramp** never reached Value LED / waterfall — same class as B-033.
- Repro: Arp with Arp Keys + Internal Clock. Wire **inc → osc Increment**. Wire **ƒ → osc ƒ**. Scope / Value on `inc`.
- Fix shape: Publish **both** pitch-family outs — Square=`f` (Hz), Ramp=`inc` (Hz/sr). Stop aliasing `f`→`inc`. Graph version **152**.
- Fixed (2026-09-27): as above. Rebuild combined WASM.

### B-049 — Softwave ignores Increment (Arp.inc silent vs polyBlep)
- Status: fixed
- Severity: hear
- Source: user 2026-09-27 (“Arp still does not send inc to Softwave oscillator”, patches/init.json)
- Files: `native_modules/graph_engine/graph_engine.cpp` (`process_softwave_osc`); `patches/init.json`; `scripts/_smoke_arp_inc_to_osc.mjs`
- What: Softwave UI declared `inputs: [Reset, Increment]` and Arp published Ramp=`inc`, but `process_softwave_osc` never mixed `kPortIncrement`. Init patch drove Softwave via `Arp.f → frequency` MOD instead of `Arp.inc → Increment`.
- Fix shape: `if (liveInc) freq += mixIncrement[f] * sr` in `process_softwave_osc`. Graph version **153**.
- Fixed (2026-09-27): as above.

### B-048 — Module settings enable/disable control does not mirror module button
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user
- Doc: `docs/B-048_MODULE_SETTINGS_BYPASS_SSOT.md`
- Files: `public/styles.css`; `public/node-graph-ui-settings-sync.js`; `public/node-graph-patch-core.js` (`syncNodeGraphBypassButtonElement`); `public/node-graph-context-menu.js`
- What: The module settings enable/disable control does not mirror the module button: it does not turn red when disabled, does not match the button background, and does not glow like the module enable/disable button.
- Repro: Disable a module and compare its module settings control with the module button (and repeat in the other direction).
- Root cause: `--node-bypass-*` paint tokens lived only on `#nodeGraphWorkspace`; Module Settings is a sibling under `#nodeWiringPanel`, so off-bg/on-bg/icon-size were undefined → no black plate, no red pressed, glyph vanished.
- Fix: Hoist bypass CSS vars to `.node-wiring-panel` / `#nodeWiringPanel` (face + settings SSOT); UIDEV defaults `#000000` / `#5c1818`; explicit settings button backgrounds. UI only.
- Fixed (2026-09-28): as above.

### B-050 — Workspace zoom past ~10× stutters badly
- Status: open
- Severity: see
- Source: user 2026-09-27
- Doc: `docs/B-050_ZOOM_PAST_10_STUTTER.md` (attempt log; prior camera/pan work documented)
- Files: graph camera / zoom / pan path (see doc)
- What: Zooming the workspace past about 10× makes the app stutter badly (frame rate collapses). Zoom max remains 100; cliff around 10×.
- Repro: Load a non-trivial patch; wheel-zoom past ~10×; pan or keep zooming.
- Fix shape: See `docs/B-050_ZOOM_PAST_10_STUTTER.md`. Do not “fix” by only lowering zoom max. No audio/DSP changes.

### B-051 - Softwave oscillator display needs unrelated EQ Frequency refresh
- Status: open
- Severity: see
- Source: user 2026-09-27
- Related: B-026 and B-054 (audit for shared display invalidation/rearm infrastructure; separate symptoms unless the same root is confirmed); **B-063** covers Robin Oscillator *audible* Morph MOD wiring (WIDTH vs SHAPE) — not this Softwave display issue
- Doc: `docs/B-051_SOFTWAVE_DISPLAY_REFRESH.md`
- Files: display invalidation/frame-refresh scheduler; Softwave oscillator face/display path; scope/face/waterfall render paths; EQ filter Frequency update path (to investigate)
- What: The Softwave oscillator display/UI does not live-update on its own and only refreshes when the user moves Frequency on an EQ filter. The EQ control appears to be an unrelated invalidation trigger, suggesting a broader display refresh bug rather than a Softwave-only rendering problem.
- Hypothesis: Softwave Morph is modulated via RobinSinusoid, but the display update path may ignore that modulation until an unrelated edit such as EQ Frequency invalidates it.
- Repro: Show a Softwave oscillator display in a live patch and observe it while the signal or displayed state changes. Then move the EQ filter Frequency control; the Softwave display/UI refreshes. Repeat with other live-update displays and note which scopes, faces, or waterfalls also require an unrelated UI action.
- Fix shape: Find the authoritative display invalidation/frame tick and make live displays update from current audio/state without an unrelated parameter edit. Audit scopes, faces, and waterfalls together; verify EQ Frequency is not acting as an accidental global refresh. Check B-026/B-054 flows for shared invalidation/rearm regressions, but close this live-refresh symptom independently.

### B-052 — Portal Out rename to ChordKeys skips outlet color/shape
- Status: fixed
- Severity: see
- Source: user 2026-09-27
- Files: `public/modules/portal/portal-named.js`; `public/node-graph-jack-chrome.js`; `public/node-graph-module-actions.js`
- What: Renaming a named portal (e.g. outlet Title → `ChordKeys`) updated the patch bus name but the jack stayed default gold/round instead of adopting Chord Keys / Chord Memory green + square.
- Repro: Place Portal IO (or Out). Rename Title to `ChordKeys`. Jack color/shape wrong until a Chord Memory cable painted it.
- Root cause: Jack chrome for named portals only inherited color from the cable into Portal In (or locked `wirelessRole` for square). Title was never looked up against the existing outlet name→color/shape tables (`Play Keys` / `Arp Keys` / `Chord Memory` / `Scale` / …). Rename also did not re-stamp jack chrome (ports are not recreated when alias changes).
- Fix shape: `nodeGraphNamedPortalBusPaintFromAlias` maps Title → canonical port name; SyncBusAlias / ApplyAliasPaint set `wirelessRole`; `nodeGraphApplyJackChrome` prefers alias paint; `nodeGraphNamedPortalRefreshModules` re-applies jack chrome after rename.
- Fixed (2026-09-27): as above. Cache-bust `?v=portal-io-1`.

### B-053 — Catalog: separate Portal In/Out → single Portal IO pair
- Status: fixed
- Severity: see
- Source: user 2026-09-27
- Files: `public/modules/portal/portal-named-register.js`; `public/node-graph-module-actions.js`; `public/node-graph-efficient-product.js`
- What: Shop listed Portal → and Portal ← separately; user wants one **Portal IO** that drops a linked In+Out. Renaming either half should sync the peer Title (already via SyncBusAlias) and color/shape (B-052).
- Fix shape: Catalog `portalIo` expands to `namedPortalIn` + `namedPortalOut` (same Title). Hide separate In/Out from shop (`catalog.hidden`); types stay loadable for old patches. Ghost drag moves the pair with a fixed grid offset.
- Fixed (2026-09-27): as above.

### B-054 — Output display keeps pause emoji after Stop/Play
- Status: open
- Severity: see
- Source: user 2026-09-27
- Related: B-026 (same Pause/Stop/Play display-rearm family; separate Output UI chrome symptom)
- Doc: `docs/B-054_OUTPUT_DISPLAY_PAUSE_EMOJI.md`
- Files: Output display status/glyph rendering path and transport lifecycle/rearm path (to investigate)
- What: Pressing Pause and/or Stop can leave a pause emoji (`⏸`) stuck on the Output display; subsequent Play does not restore the normal live display state. This is separate from B-026's waterfall drawer dark/idle symptom, though the stop/play rearm root may be shared.
- Repro: Show an Output display; play; press Pause then Play, and Stop then Play (also test Pause → Stop → Play). Observe whether the Output display retains `⏸` instead of returning to its live state.
- Fix shape: Derive the Output glyph from authoritative live/display state and update it on every Pause/Stop/Play transition. Full Stop and subsequent Play must rearm the Output display without leaving stale pause chrome. Verify alongside B-026, but close independently.
### B-055 — Text Box covers wires
- Status: fixed
- Severity: see
- Source: user
- Related: B-032 if the same Text Box layout/z-order root is confirmed
- Files: `public/index.html` / `public/perform.html` (`#nodeGraphAnnotationNodes`); `public/styles.css`; `public/node-graph-node-accessors.js`; `public/node-graph-patch-core.js`; `public/node-graph-camera-view.js`
- What: Text Box faces render over wires, obscuring cables that pass behind them.
- Repro: Place or route wires behind a Text Box and observe that the Text Box covers them.
- Root cause: `#nodeWireSvg` is a workspace sibling *behind* `#nodeGraphZoomSurface`. Text Boxes lived inside the zoom surface, so lowering their `z-index` could not put them under cables.
- Fix: Mount Text Boxes in `#nodeGraphAnnotationNodes` (annotation world layer before `#nodeWireSvg`, same pan/zoom CSS vars). Cables paint above annotations; normal modules stay above cables.
- Fixed (2026-09-27): as above.


### B-056 - Default filter drawer pollutes basic displays / Softclipper display jitters
- Status: **fixed** (2026-09-28)
- Severity: see
- Source: user 2026-09-27
- Doc: `docs/B-056_FILTER_DRAWER_DISPLAY_POLLUTION.md`
- Files: `public/lib/visual/filter-curve-face.js` (ownership SSOT); `public/node-graph-cookbook-filter.js` (mark owned + owned-only paint/sync); `public/modules/softClipper/soft-clipper-display.js` (plate + `softClipperCurve` kind, never filter-owned); `public/node-graph-module-rendering.js` (softClipperCurve layout class); `public/index.html` (lib script); `scripts/test_b056_filter_curve_face_ownership.js`
- What: Softclipper jittered between unused filter magnitude face and its transfer curve because it reused `.node-filter-curve-display` and the filter drawer selected every plate class (exclusion-list anti-pattern; Softclipper omitted).
- Root cause: Filter paint/sync ownership was CSS-class based with ad-hoc exclusions instead of an explicit face-kind SSOT.
- Fix: Lib `FilterCurveFace` marks true filters `data-face-kind=filterCurve`; Softclipper is plate-only `softClipperCurve`; drawer paints owned faces only. Display/UI only.
- Smoke: `node scripts/test_b056_filter_curve_face_ownership.js`
- Fixed (2026-09-28): as above.

### B-057 — Hide unused leaves oversized bottom lip
- Status: fixed
- Severity: see
- Source: user 2026-09-27
- Related: B-036 (shared module layout/band recomputation path; separate hide-unused symptom unless the same root is confirmed)
- Doc: `docs/B-057_HIDE_UNUSED_BOTTOM_LIP.md`
- Files: `public/node-graph-module-sizing.js` (`nodeGraphModuleIoRowCount` / IO height); `public/node-graph-patch-core.js` (chrome layout reapply + wireEdit refresh)
- What: Enabling Hide unused does not recalculate the module's bottom lip after unused controls or I/O are removed. For example, Keyboard can retain a large bottom lip when Hide unused is on and only a few I/O remain, wasting vertical space.
- Repro: Show a Keyboard module with unused controls or I/O; enable Hide unused so only a few I/O remain; observe that the module keeps a large bottom lip instead of shrinking to the visible content.
- Root cause: IO band/outer height always used the full definition port count. CSS hid unused rows, but the grid track and `--node-grid-height-units` kept the old tall strip; chrome sync also skipped `applyNodeGraphModuleLayout`.
- Fix: Count only connected signal ports when `ui.hideUnused`; collapse IO height to 0 when none remain; re-apply layout bands on chrome sync; refresh hide-unused modules after wire edits. Smoke: `scripts/test_b057_hide_unused_io_height.js`.
- Fixed (2026-09-27): as above.

### B-058 — Voice parameter modulation misses active and idle voice updates
- Status: open
- Severity: hear
- Source: user 2026-09-27
- Doc: `docs/B-058_VOICE_PARAMETER_MODULATION_DIRTY_VOICES.md`
- Files: voice allocation/dirty-state tracking; parameter-modulation propagation; voice play/sustain/release update paths (to investigate)
- What: Voices do not respond correctly to parameter modulation. Likely the voice dirty system is not used consistently: available (idle) voices should be marked dirty and refreshed when next played, while sustaining and releasing voices should receive modulation immediately instead of waiting for retrigger.
- Repro: In a polyphonic patch, modulate a voice parameter while voices are idle, sustaining, and releasing. Check whether an idle voice uses the changed value when played and whether sustaining/releasing voices change immediately; note any voice that remains on the old value until retrigger.
- Expected behavior: Mark available voices dirty for their next play/update, and apply current modulation immediately to voices that are sustaining or releasing.
- Fix shape: Trace the voice dirty-state lifecycle and route parameter modulation through it: dirty idle voices for the next allocation/play, and update sustaining/releasing voices immediately. Keep voice state consistent across allocation, sustain, and release. Docs only; no code fix in this report.

### B-059 — Alt+click jack "orphan" dot is the scope-monitor pip
- Status: **removed** (feature deleted 2026-09-27; not wontfix)
- Severity: see
- Source: user 2026-09-27 (corrected: Alt+click jack, not abandoned wire drag)
- Doc: `docs/B-059_ABANDONED_WIRE_DRAG_ORPHAN_DOT.md`
- Files (former): `public/node-graph-module-scope-monitors.js` (toggle/sync removed; capture helpers kept); `public/node-graph-module-rendering.js`; `public/styles.css` (`.monitored-port` removed); patch clone/core/serialize/runtime/history (no `patch.monitors`)
- What was: Lone cyan jack pip from **Alt+click** scope-monitor toggle (`patch.monitors` + `.monitored-port`).
- Resolution: Feature fully removed. Alt+click on jack does nothing special. Old `monitors` fields ignored on load and omitted on save. Scope faces still use default capture endpoints (not jack UI).

### B-060 — Pulse Explosion does not modulate PolyBLEP amplitude
- Status: open
- Severity: hear
- Source: user 2026-09-27
- Doc: `docs/B-060_PULSE_EXPLOSION_POLYBLEP_AMPLITUDE.md`
- Files: Pulse Explosion signal/output path; PolyBLEP amplitude input and modulation propagation (to investigate)
- What: Pulse Explosion does not appear to modulate PolyBLEP amplitude. Most likely Pulse Explosion is not outputting a signal, so the amplitude modulation cable has no effect. This is an initial user report and hypothesis, not a confirmed root cause.
- Repro: Place Pulse Explosion and PolyBLEP, connect the Pulse Explosion output to PolyBLEP amplitude, and run the patch. Observe whether the PolyBLEP amplitude changes; independently check whether Pulse Explosion emits any non-zero signal under ordinary settings.
- Fix shape: Trace Pulse Explosion generation and output first, then verify the cable/port type and PolyBLEP amplitude-modulation path. Restore a valid source signal if Pulse Explosion is silent, and confirm the modulation reaches PolyBLEP. Docs only; no code fix in this report.
### B-061 — Small slider readout strips scientific exponent
- Status: fixed
- Severity: see
- Source: user 2026-09-27
- Doc: `docs/B-061_SLIDER_SCIENTIFIC_NOTATION_READOUT.md`
- Files: `public/node-graph-slider-metadata.js` (`nodeSliderPlainDecimalSource`, `limit_decimals`, `formatNodeSliderNumber`); `public/node-graph-module-scope-number-readout.js` (delegates to shared helper)
- What: When slider values are very small (|n| < 1e-6), the face/readout shows the mantissa only (e.g. `8.0357`) instead of the true magnitude (e.g. `0.00000080357`).
- Repro: Set a slider domain value below 1e-6 (or any value whose `String(n)` is scientific). Observe the slider value face / compact readout.
- Root cause: **Yes — exponent.** `formatNodeSliderNumber` passed `String(number)` into `limit_decimals`, which only regex-parses `whole.fraction`. For `"8.0357e-7"` the `e-7` is ignored, leaving `"8.0357"`. (Value LED/LCD already had a plain-decimal helper; slider faces did not.)
- Fix: Add `nodeSliderPlainDecimalSource` (expand via `toLocaleString` / `toFixed`), expand scientific input at the top of `limit_decimals`, and route `formatNodeSliderNumber` through the helper. Smoke: `scripts/test_b061_slider_sci_notation.js`.
- Fixed (2026-09-27): as above.

### B-062 - Non-audio UI changes restart audio engine
- Status: open
- Severity: hear
- Source: user 2026-09-27 (inert module copy); user 2026-09-28 (Text Box deletion)
- Doc: `docs/B-062_COPY_MODULE_RESTARTS_AUDIO_ENGINE.md`
- Files: module copy/delete actions; `public/node-graph-patch-core.js` (`commitNodeGraphPatch`); `public/node-graph-live-runtime.js` (live-plan sync/restart path)
- What: Copying an unconnected, inert module or deleting a Text Box restarts the audio engine. These non-audio changes should not interrupt or restart running audio.
- Repro: Run a patch with live audio; copy a module and leave the new copy unconnected/inert, or delete a Text Box. Observe the audio-engine restart or interruption. Compare with a change that connects the copy or otherwise changes the active audio graph.
- Fix shape: Distinguish inert, unconnected copies and non-audio UI edits from live-topology or side-effecting changes. Do not restart the audio engine for an inert copy or Text Box deletion; use no live sync or a non-restarting incremental update when safe. Preserve required updates for modules that connect, publish, consume, or otherwise affect live execution. Docs only; no code fix in this report.

### B-063 — Robin Oscillator Morph MOD silent (ParamModEdge → wrong Control)
- Status: fixed
- Severity: hear
- Source: user 2026-09-27 (`analoghorror.json`)
- Doc: `docs/B-063_ROBIN_OSCILLATOR_MORPH_PARAM_MOD.md`
- Files: `public/node-live-audio-worklet-native-graph.js` (`mapNativeGraphParamId`); smoke `scripts/test_b063_robin_morph_param_mod.js`
- What: Robin Morph MOD cable had no audible effect. ParamModEdge targeted SHAPE (Softwave default) while Robin DSP / knob push use WIDTH.
- Related: B-051 is Softwave *display* refresh (see); not a duplicate of this hear wiring bug.
- Repro: Load `patches/demo patches/analoghorror.json`; switch Robin to Trisaw Center/Pulse/Analog Square (saved Ramp ignores Morph); Morph from passiveFilter-2 should change timbre (was stuck at knob).
- Root cause: `mapNativeGraphParamId` morph → SHAPE for robinOscillator; process_robin_oscillator reads `node.width`.
- Fix: `robinOscillator` + `morph` → `NATIVE_GRAPH_PARAM_WIDTH`.
- Fixed (2026-09-27): as above. Smoke OK.

### B-064 - Text Box background overflows outline when title is hidden
- Status: fixed (2026-10-01)
- Severity: see
- Source: user 2026-09-28; reopen 2026-10-01 (face vs stroke + perform bg)
- Related: B-032 (Text Box resize/text clipping; verify shared title/content-height geometry); B-055 (Text Box wire z-order, fixed; separate layering symptom unless the same host/layout path is implicated)
- Doc: `docs/B-064_TEXT_BOX_HIDDEN_TITLE_BACKGROUND_OVERFLOW.md`
- Files: `public/node-graph-module-sizing.js`; `public/styles.css`; `public/modules/textBox/text-box-widget.js`
- What: Hiding the Text Box title causes its background to extend beyond the module outline/border. Perform/canvas dropped the background color.
- Repro: Add or open a Text Box, hide its title, and observe the background at the module edges. Compare the same Text Box with the title visible. Check layout-canvas / Perform for the same fill.
- Fix: Text Box face `fillsPlate` → `minmax(0, 1fr)`; face gu subtracts plate inset; title+buttons-hidden inherits plate radius; face+plate share `--node-text-box-bg-color`; empty bg no longer writes blank CSS vars.

### B-065 - Multi-wire portal action creates duplicate portals instead of one Portal In / multiple Portal Outs
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: Portal IO; B-052 (Portal Out rename to ChordKeys); B-053 (Catalog Portal In/Out replaced by linked Portal IO)
- Doc: `docs/B-065_PORTAL_MULTIWIRE_DUPLICATES.md`
- Files: multi-wire portal creation action; Portal In/Portal Out identity and signal-grouping logic (to investigate)
- What: Making a portal on multiple wires creates multiple portals for the same signal instead of one shared Portal In and multiple Portal Outs.
- Repro: Use one signal with multiple wires/targets, invoke the action to make a portal on multiple wires, and observe that the same signal receives multiple portal instances.
- Expected: The action creates one Portal In for the shared signal and the required Portal Outs for its destinations, without duplicating the source portal per wire.
- Fix shape: Group selected wires by signal, reuse the shared Portal In, and create only the necessary Portal Outs. Preserve distinct portal groups for unrelated signals. Docs only; no code fix in this report.

### B-066 — Multi-select Portal settings hides Title and locks Display
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: Portal IO; B-052 (Portal Out rename to ChordKeys); B-065 (multi-wire portal action creates duplicate portals)
- Doc: `docs/B-066_PORTAL_MULTISELECT_TITLE_DISPLAY.md`
- Files: multi-selection module settings/editor; Portal IO and named-portal Title/Display field handling (to investigate)
- What: Selecting two or more portals to change Title and Display makes the Title control disappear and leaves Display uneditable, preventing the intended multi-selection edit.
- Repro: Select two Portal IO/named portal modules, open their module settings/editor, and observe that Title is absent and Display is not editable. Compare with single-portal selection.
- Expected: Multi-selection should not hide Title or make Display uneditable merely because multiple compatible portal modules are selected; the intended batch edit should remain available.
- Fix shape: Trace multi-selection field visibility/editability for Portal IO and named portals, preserve compatible Title/Display controls, and represent mixed values without silently removing the controls. Recheck alias propagation and jack appearance with B-052 and portal identity/grouping behavior with B-065. Docs only; no code fix in this report.

### B-067 - Bottom lip leaves less than 2 px clearance
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: B-057 (hide-unused bottom-lip recalculation); B-064 (hidden-title module geometry / Text Box background overflow)
- Doc: `docs/B-067_BOTTOM_LIP_CLEARANCE.md`
- Files: bottom-lip/module layout geometry (to investigate)
- What: The bottom-lip calculation can leave less than 2 px between the last visible element and the bottom lip. The error appears related to whether the module title is hidden: title-hidden layout may produce a different last-element/bottom-lip relationship than title-visible layout.
- Repro: Use a module/layout state where the last visible control or I/O is close to the bottom lip; measure the rendered gap with the title visible, then hide the title and repeat without otherwise changing the content or sizing. Observe cases below 2 px, especially in the title-hidden state.
- Expected: Keep at least 2 px of clearance in both title states. If the calculation cannot meet that minimum, place the bottom lip 1 GU lower.
- Fix shape: Audit rendered/pixel geometry across title-visible/title-hidden, hide-unused, and zoom/scaling paths; enforce the 2 px minimum and lower the lip by 1 GU when needed. Cross-check B-064's hidden-title geometry/background-overflow findings, and recheck B-057 so the correction does not restore an oversized unused lip. Docs only; no code fix in this report.

### B-068 — Canvas-mode slider/knob/text display scaling is not WYSIWYG
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: B-050 (workspace zoom/stutter; separate scaling symptom unless a shared canvas path is confirmed); **B-071** (Text Box canvas scale — own grid-size paint path, fixed separately)
- Doc: `docs/B-068_CANVAS_SLIDER_KNOB_SCALING.md`
- Files: canvas-mode scaling/transform and slider/knob/text rendering geometry (to investigate)
- What: The slider display does not scale properly in canvas mode, the knob also does not scale properly, and slider-associated text can be positioned or scaled so badly that it ends up outside the module. **WYSIWYG — "what I see is what is scaled" — is not being held true in canvas mode for slider/knob display or its text.**
- Repro: Enter canvas mode with slider/knob content, change the canvas scale, and compare the slider display, knob, and associated text with the surrounding scaled canvas. They do not scale consistently with the visible canvas content; in some cases the text ends up outside the module.
- Expected: Slider display, knob, and associated text scale consistently with the rest of the rendered canvas; visible WYSIWYG geometry remains aligned at each canvas scale, with the text inside the module bounds.
- Fix shape: Audit the authoritative canvas transform and slider/knob/text CSS-pixel/canvas-unit conversion and text anchoring; apply the canvas scale exactly once and keep the rendered bounds aligned inside the module. Docs only; no code fix in this report.

### B-069 - Canvas mode omits displays that are not in view
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: B-068 (canvas-mode slider/knob/text display scaling; shared canvas display path may be involved)
- Doc: `docs/B-069_CANVAS_MODE_OFFSCREEN_DISPLAY_MISSING.md`
- Files: canvas-mode display capture/rendering and viewport visibility/culling path (to investigate)
- What: A display that is not currently in view does not appear when the workspace is shown in canvas mode. Canvas-mode output appears to depend on current viewport visibility instead of including the configured display.
- Repro: Place a module with a display outside the current viewport, or pan/zoom so the display is not in view; enter or refresh canvas mode and observe that the display is missing. Bring the display into view and compare the canvas-mode result.
- Expected: Canvas mode should include configured displays consistently, regardless of whether the display happened to be in the current viewport when canvas mode was entered or refreshed.
- Fix shape: Audit canvas-mode display collection, viewport culling, and lazy-render/visibility gating. Do not drop an off-screen display from the canvas-mode result merely because it was not visible at capture time. Cross-check B-068 for shared transform/display handling. Docs only; no code fix in this report.


### B-070 — CallNow keypad / PhoneTone silent (Gate still works)
- Status: fixed (code; needs Live UI verify)
- Severity: hear
- Source: user 2026-09-28
- Related: `patches/callnow.json`; keypad host CV; Phone Tone; portal outlet speaker sum; controller efficient sidecar
- Doc: `docs/B-070_CALLNOW_KEYPAD_PHONETONE_SILENT.md`
- Files: `public/modules/_shared/controller-efficient-sidecar.js`; `public/node-graph-live-runtime.js`; `scripts/smoke_test.py`
- What: Keypad Analog never reached Phone Tone on efficient Live. Gate (momentaryButton Bias) still published. Keypad interaction handler was deleted with JS evaluator twins; sidecar never republished keypad CV; keypad-math was missing from the worklet blob.
- Repro: Load CallNow, Play, press CALL🐞NOW (works), press keypad keys (no DTMF).
- Fix shape: Restore worklet `setKeypadInteraction` + publish keypad in `processControllerEfficientSidecar`; load `keypad-math.js` in efficient worklet blob. Not a JS DSP evaluator restore.

### B-071 — Canvas-mode Text Box does not scale with the tile (WYSIWIS)
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28
- Related: B-068 (canvas slider/knob scaling — shared stage, different paint path); B-064 / B-055 (Text Box layout/layer)
- Doc: `docs/B-071_CANVAS_TEXT_BOX_SCALING.md`
- Files: `public/modules/textBox/text-box-widget.js`; `public/styles.css`; `public/node-graph-layout-canvas.js`; `public/node-graph-screen-solo.js`; `public/modules/metamodule/metamodule-display-mirror.js`
- What: Text Box glyphs ignore canvas tile scale; body fills the tile but type stays at plate `--node-grid-size` absolute size.
- Repro: Show in canvas on a Text Box → F canvas → resize tile. Text does not scale with the tile (unlike knob/slider cqmin faces).
- Root cause: Text Box uses its own grid-size font formula; it never joined the face `cqmin` scale pipeline knobs use. Not the same leak as B-068.
- Fix: Capture plate source-min + source-font-px before reparent; canvas-scoped CSS `source-font-px * font-scale * 100cqmin / source-min`; clear on restore. UI only.

### B-072 — PolyBLEP phosphor Size reverts after closing Display Settings
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28
- Related: DISPLAY_SCALE_REWRITE / APP_POLICY §15 (ink px @ 96); XY Pad already ink-px normalize
- Doc: `docs/B-072_POLYBLEP_PHOSPHOR_DOT_SIZE_PERSIST.md`
- Files: `public/node-graph-module-scope-normalize.js`; `public/node-graph-module-scope-settings-form.js`
- What: PolyBLEP (lineBurn) Display Settings Size looks editable while open, then snaps back on close/reopen.
- Repro: PolyBLEP → Display Settings → set Size > 1 (e.g. 5) → close → reopen. Size was pegged to 1.
- Root cause: `normalizeNodeGraphLineBurnSettings` (also zeroD / scope2d) clamped `dot1Size` to 0…1 while UI/paint use authored CSS px @ 96. Every Size ≥ 1 stored as 1.
- Fix: Persist phosphor Size via `nodeGraphTraceDisplayNormalizeInkPx` (0…32). UI-only; no audio path.

### B-073 - Parameter label left padding vs number (sign column)
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28
- Related: commit `44f69817` (Align slider labels with value sign column); B-061 (slider readout formatting)
- Doc: `docs/B-073_PARAM_LABEL_SIGN_COLUMN_PADDING.md`
- Files: `public/styles.css`
- What: Parameter labels/names sit ~1ch right of the number (readout/value).
- Repro: Stacked label-over-value slider readout; compare left edges especially for negative or showSign `+` values.
- Root cause: `.reserves-sign-column .node-slider-readout-label { padding-left: 1ch }` indented labels while values already reserve the sign column in the formatted string.
- Fix: Remove the label `padding-left: 1ch` rule. CSS only; no audio path.


### B-074 - Input / Output / Portal jack spacing drifted from shared SSOT
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28
- Related: MODULE_LAYOUT_PLAN (InletOutletLayout); LayoutB flush-jack rule; B-057
- Doc: `docs/B-074_IO_PORTAL_JACK_SPACING_SSOT.md`
- Files: `public/styles.css`; `public/node-graph-module-sizing.js`; `public/modules/portal/portal-named-register.js`; `public/modules/portal/portal-lanes.js`; `public/modules/portal/portal-ui.css`; `public/modules/metamodule/metamodule-register.js`
- What: Output Left Right / Output Mono Left Right / Input * / Portal IO (and Meta In/Out / voice jacks) inlet/outlet rows did not match LayoutA jack spacing.
- Repro: Place Output Left Right (or Input Mono Left Right / Portal IO) beside Gain; compare vertical jack pitch - stretched/uneven on InletOutlet modules.
- Root cause: InletOutletLayout private CSS `1fr`-stretched jack rows + `io.grow` (no lip) + pinned `defaultHeightGu` leftover height.
- Fix: Point InletOutlet at shared `.node-io-column` packing SSOT; lip absorbs leftover; drop private stretch CSS and defaultHeightGu. UI only.

### B-075 - Pitch Mod Wheel face has no pitch/mod-wheel UI or display control
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: catalog name "Pitch Mod Wheel"; pitch/mod wheel custom face and display-visibility controls
- Doc: `docs/B-075_PITCH_MOD_WHEEL_FACE_MISSING.md`
- Files: `public/node-graph-module-store.js`; `public/node-graph-module-definitions.js`; `public/node-graph-module-factories.js`; `public/node-graph-module-rendering.js`; referenced `public/modules/pitchModWheel/pitch-mod-wheel-live-evaluator.js` (not present in the working tree)
- What: After dragging out the Pitch Mod Wheel module, the module does not show pitch wheel or mod wheel controls, has no display, and offers no button/control to show the display.
- Repro: Drag the catalog's Pitch Mod Wheel module onto the workspace and inspect the module face and its display controls.
- Expected: The dropped module should show its Pitch and Mod wheel UI, provide its display/face, and expose the normal control to show the display when it is hidden.
- Fix shape: Trace the Pitch Mod Wheel catalog-to-definition-to-custom-face/rendering path and display-visibility control wiring. Restore the intended face and display control without changing DSP behavior. Docs only; no code fix in this report.

### B-076 — F11 fullscreen shuffles the canvas; F F F recycles the view
- Status: fixed
- Severity: see
- Source: user 2026-09-28
- Related: layout-canvas F-cycle (off→perform→edit→off); B-050 (workspace zoom, separate)
- Doc: `docs/B-076_F11_FULLSCREEN_CANVAS_SHUFFLE.md`
- Files: `public/node-graph-screen-solo.js` (`handleNodeGraphScreenSoloResize`, `applyNodeGraphScreenSoloFit`); `public/node-graph-layout-canvas.js` (`nodeGraphLayoutCanvasHandleViewportChange`, `fullscreenchange` → `RefreshOpenStage`)
- What: Pressing F11 to enter fullscreen shuffled the layout-canvas tiles. While still fullscreen, pressing `F` three times recycled the view and reset/corrected the arrangement.
- Repro: Arrange a canvas (F perform), press F11, observe shuffle. Press `F`, `F`, `F` while remaining fullscreen; the view resets/corrects.
- Root cause: Layout canvas shares the screen-solo stage with `session.fit ""` and freeform absolute tiles. Window resize (F11) still ran `handleNodeGraphScreenSoloResize` → `applyNodeGraphScreenSoloFit(fit || "contain")`, which forced the classic solo grid/contain layout over the freeform canvas. F-cycle recycle reopened via `nodeGraphLayoutCanvasRefreshOpenStage` and repaired it.
- Fix: Skip solo fit when layout canvas is active; on `fullscreenchange` deferred-rebuild with `nodeGraphLayoutCanvasRefreshOpenStage` (same as F recycle); deferred light tile re-apply on resize for browsers where F11 only fires resize.
- Fixed (2026-09-28): as above. UI/layout only; no audio/JS audio-path changes.

### B-077 — Keyboard Inc outlet not publishing (host CV)
- Status: fixed (code; needs Live UI verify)
- Severity: hear
- Source: user 2026-09-28
- Related: B-070 keypad host CV; B-047/B-049 Arp/Softwave Inc; controller efficient sidecar
- Doc: `docs/B-077_KEYBOARD_INC_HOST_CV_MISSING.md`
- Files: `public/modules/_shared/controller-efficient-sidecar.js`; `public/node-graph-live-runtime.js`; `scripts/smoke_test.py`
- What: Keyboard `inc` (Hz/sr) never reached native Increment on efficient Live. Sidecar `buildCv` computed increment but Pass 1/2 never published `outs.inc` (retired evaluator did). Same class as B-070 missing host publish; not a port-name/wiring bug.
- Repro: Keyboard.inc → osc Increment; Play; press key — silent / no phase advance from Inc.
- Fix shape: Publish `outs.inc = cv.increment` for Keyboard in efficient sidecar; Pass 2 refresh; cache-bust `keyboard-inc-1`. Not a JS DSP evaluator restore.


### B-078 - Trace / Phosphor / Instant Waterfall faces hidden after waterfall rename

- Status: **fixed**
- Severity: see
- Doc: `docs/B-078_SCOPEFACE_TRACE_BAND_HIDDEN.md`
- What: Catalog Trace / Phosphor (and Instant Waterfall) monitors spawned with no visible face.
- Root cause: Waterfall rename replaced band alias `trace?face` with `waterfall?face` while `scopeFace` still used band id `"trace"`. LayoutA marked `face-track-omitted`; CSS hid `.node-module-face`.
- Fix: `scopeFace` band id `"face"`; restore `trace: "face"`; canonical `faceBandVisible`. Thrus / WiredInputs for `scope1dTrace*`.
- Verify: `node scripts/test_module_layout_bands.js`.

### B-079 — Choices range clamp does not remap UI subset
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28
- Related: choice index/label mapping; PolyBLEP Waveform metaparam range
- Doc: `docs/B-079_CHOICES_RANGE_CLAMP_SUBSET.md`
- Files: `public/node-graph-slider-metadata.js`; `public/node-graph-slider-readout.js`; `public/node-graph-slider-values.js`; `public/node-graph-parameter-metadata.js`; `public/node-graph-metadata-editor.js`; `public/node-graph-module-factories.js`; `public/index.html`; `scripts/test_b079_choice_range_remap.js`
- What: Clamping a choices param min/max (e.g. Waveform 4–5) left full-catalog labels/dividers (~9 segments); ends mapped as full-list proportional indices.
- Repro: PolyBLEP Waveform metaparam Min=4 Max=5; observe dividers/labels vs Triangle/Sine.
- Root cause: Discrete index path required span===choices.length; clamp failed that check and used t*(n-1) over the full list. Dividers used full dataset.choices length.
- Fix: `nodeGraphResolveChoiceSet` slices catalog by range + `choiceOriginMin`; index/label/dividers use subset. Persist origin from definition. Smoke `test_b079_choice_range_remap.js`.


### B-080 — Choice segment text ellipsizes before full track width
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28 (Tube Saturation / choices-divided context)
- Related: empty unit column width; B-073; B-079
- Doc: `docs/B-080_CHOICE_SEGMENT_TEXT_FULLWIDTH.md`
- Files: `public/styles.css`; `public/node-graph-slider-readout.js`; `public/index.html`; `scripts/test_b080_choice_label_fullwidth.js`
- What: Choice divide/segment labels ellipsized early instead of using full slider track width.
- Repro: Choices-divided param with a long label (e.g. Analog Square); observe early `...` and empty space where unit column reserved width.
- Root cause: `.node-slider-readout-unit.is-empty` only `visibility: hidden` while keeping `min-width: 2.5em` + `column-gap: 7px`.
- Fix: `.displays-choices` + collapse empty unit (`display: none`, `column-gap: 0`); value `width: 100%` of track. Smoke `test_b080_choice_label_fullwidth.js`.


### B-081 — scope1dTrace Size / Vibrato thickness + full-height Y
- Status: fixed (code; needs Live UI verify)
- Severity: see
- Source: user 2026-09-28 (Vibrato Generator; all scope1dTrace faces)
- Related: B-072; Bright to TraceWoscope intensity polish; Instant Waterfall Size drop
- Doc: docs/B-081_SCOPE1DTRACE_SIZE_THICKNESS.md
- Files: public/node-graph-module-definitions.js; public/node-graph-module-scope-1d-trace.js; public/node-graph-module-scope-metrics.js; public/node-graph-module-scope-settings-form.js; public/index.html
- What: Vibrato could not set trace thickness; Size must drive TraceWoscope like Bright; Scale <1 must not shrink Y.
- Repro: Vibrato Display Settings Size; Scale 0.5 vs 2.
- Root cause: Vibrato on waterfall (no Size); 1dTrace Size lacked Bright-style SSOT helper; Y used amp Scale <1.
- Fix: Vibrato to scope1dTrace; nodeGraphScope1dTraceSizePx to TraceWoscope; Y clamps Scale floor to 1; signature + tip; cache-bust b081-1dtrace-size-1.




### B-084 — scope1dTrace Display Settings gradient → TraceWoscope LUT

- Status: **fixed** (2026-09-28, local, no push)
- Severity: see
- Source: user 2026-09-28 (Tube Sat / scope1dTrace; 2D Trace must stay non-gradient)
- Related: B-083; FEATURE_TUBE_SAT_CRT_AMBER; B-081
- Doc: docs/B-084_SCOPE1DTRACE_GRADIENT_LUT.md
- What: 1D TraceWoscope ignored meaningful LUT mapping from Display Settings gradientStops; Color swatches conflicted with Gradient-owns-color.
- Fix: energy t on 1D points; ink from gradient peak; scope1dTrace colors:[]; 2D Trace untouched; cache-bust b084-1dtrace-grad-1.

### B-082 — Unit-band param MOD must clamp to paramMeta [min,max]
- Status: fixed
- Severity: hear
- Source: user 2026-09-28
- Doc: `docs/B-082_PARAM_MOD_CLAMP_MIN_MAX.md`
- Files: `native_modules/graph_engine/graph_engine.cpp` (v156); `public/node-live-audio-worklet-native-graph.js`; `public/node-graph-stdlib/node-graph-param-surface-helpers.js`; `public/node-graph-live-parameter-runtime.js`; PolyBLEP Amp meta
- What: Keyboard Gate + Toggle both ON into PolyBLEP Amplitude exceeded Amp max (usually 1).
- Repro: Amp MOD from Gate + Toggle; hold key + Toggle ON -> level past full-scale.
- Root cause: Host packed `modClamp:false` as unbounded; native `control_effective` skipped [min,max] clamp for unit-band.
- Fix: Unit-band SSOT always clamps in `control_effective`; host always sets bit1 for unit-band; helpers ignore legacy `modClamp:false`. Domain-valued MOD unchanged. Smoke `scripts/smoke_b082_amp_mod_clamp.mjs`. No JS DSP. Local, no push.


### B-085 — Multi-select Display Settings copies unedited settings
- Status: fixed
- Severity: see
- Source: user 2026-09-29
- Related: B-066 (multi-select Portal Title/Display hidden or locked; different symptom)
- Doc: `docs/B-085_MULTISELECT_DISPLAY_SETTINGS_COPY.md`
- Files: `public/node-graph-module-scope-settings-apply.js` (baseline diff; no star full-form copy); `public/node-graph-module-scope-settings-form-io.js` (seed snapshot); `public/node-graph-layout-canvas.js` (Show in canvas pins every selected display); `public/index.html` (b085-multiselect-1)
- What: Selecting multiple displays and changing one setting (example: Show in canvas) also writes the edited module's other display settings onto every selected module. Modules that were not edited pick up unchanged settings from the edited module, so multi-select loses per-module settings.
- Repro: Select two or more display modules whose display settings differ. Open Display Settings for the selection and change only Show in canvas (or one other control). The other selected modules take on settings from the edited module that were not touched.
- Expected: Only the setting the user edited is applied to all selected modules. Every other setting stays as it was on each module.
- Fix: Multi-apply merges only keys that differ from the seeded form snapshot. Star no longer copies the primary form. Show in canvas sets the pin on the whole selection and does not write display settings. Paste and Defaults still force the whole form. Not committed.

### B-086 — 1D Trace sync glitches more than phosphor sync
- Status: open
- Severity: see
- Source: user 2026-09-29
- Related: B-081, B-084
- Doc: `docs/B-086_SCOPE1DTRACE_SYNC_GLITCH.md`
- Files: 1D Trace / woscope sync path (not pinned). Phosphor sync is the comparison that holds.
- What: 1D Trace in sync mode glitches a lot more than phosphor scope in sync mode.
- Repro: Not pinned. Same signal, sync on, 1D Trace vs phosphor. 1D jumps or tears; phosphor holds.
- Expected: 1D sync should hold as steadily as phosphor sync.
- Notes: User guess, not confirmed: zero-crossing issue, maybe zero crossings are sent per quantum.
- Fix shape: Not started. Compare the two sync triggers before changing anything. Docs only; no code fix in this report.

### B-087 — Longer sequencer clips cut short with multiple sequencers
- Status: open
- Severity: see
- Source: user 2026-09-30
- Doc: `docs/B-087_LONG_SEQUENCER_CLIPS_CUT_SHORT.md`
- Files: Sequencer clip scheduling/playback path (not pinned).
- What: Longer sequencer clips get cut short when a patch has two or more sequencers.
- Repro: Use a patch with two or more sequencers and a longer clip. Play the patch and observe that the clip ends before its intended length.
- Expected: Longer clips should play for their authored length regardless of whether the patch contains one sequencer or multiple sequencers.
- Fix shape: Not started. Do not treat a cause as confirmed; this report is docs-only and includes no code fix.

### B-088 — 1D Phosphor / 1D Trace regular gap at low frequency

- Status: open
- Severity: see
- Source: user 2026-10-04 (ArchIV)
- Related: B-081, B-084, B-086
- Doc: `docs/B-088_1D_PHOSPHOR_TRACE_LOW_FREQUENCY_GAP.md`
- What: Source-synced 1D Phosphor and 1D Trace faces show a regular gap at low frequency on the pinned repro patch.
- Repro: `trace and phosphor 1d broken lines.json`; both 1D faces source-synced, Skip Discontinuities on, Sweep 4 Hz / 4 cycles, filtered approximately 50.8 Hz saw.
- Expected: Both faces draw continuously without the regular gap.
- Tried: Sweep-pen / overlap-sample adjustment (`sweep-face-join-1`) and widening `nodeGraphOneDimensionalBurnUndrawnWindow` by one sample (`paint-helpers.js?v=trace-join-1`, `endFrame` unchanged); neither visibly improved the gap.
- Notes: No cause confirmed. Next look remains open; docs-only, leave code as-is.
## Fixed

- **B-084** — scope1dTrace Display Settings gradientStops feed TraceWoscope energy LUT; 2D Trace stays solid (b084-1dtrace-grad-1).
- **B-085** - Multi-select Display Settings applies only the edited setting (baseline diff; Show in canvas pins the selection). b085-multiselect-1. Not committed.
- **B-082** — Unit-band param MOD clamps to paramMeta [min,max] (`control_effective` SSOT; Gate+Toggle <= Amp max).

<!-- move B-xxx here with a one-line note -->

- **B-081** — scope1dTrace Size to TraceWoscope thickness SSOT; Vibrato on 1D Trace; Scale <1 no longer shrinks Y (b081-1dtrace-size-1).
- **B-055** — Text Boxes mount under `#nodeWireSvg` via `#nodeGraphAnnotationNodes` so cables paint above annotations.
- **B-057** — Hide unused recomputes IO/outer height from connected ports; layout bands re-applied on chrome/wire edits.
- **B-059** — Alt+click jack scope-monitor feature **removed** (deleted, not wontfix). See section above / `docs/B-059_ABANDONED_WIRE_DRAG_ORPHAN_DOT.md`.
- **B-061** — Slider / LED number faces expand scientific notation before `limit_decimals` so small values keep their magnitude.
- **B-063** — Robin Oscillator Morph ParamModEdge targets WIDTH (was SHAPE; Softwave-correct default left Morph CV silent).
- **B-070** — CallNow keypad host CV: restore `setKeypadInteraction` + sidecar Analog publish; load keypad-math in efficient worklet blob.
- **B-071** — Canvas Text Box type scales with tile via source-min cqmin (plate grid-size formula unchanged).
- **B-072** — PolyBLEP/lineBurn (and scope2d/zeroD) phosphor Size persists as ink px @ 96 (was 0…1 clamp).
- **B-073** - Parameter label `padding-left: 1ch` (sign-column align) removed so names line up with readout values.
- **B-074** — InletOutlet Input/Output/Portal jack packing unified onto shared `.node-io-column` SSOT (no 1fr stretch).
- **B-077** — Keyboard Inc host CV: publish `outs.inc = cv.increment` in efficient sidecar (Pass 1+2); cache-bust `keyboard-inc-1`.
- **B-079** — Choices range clamp remaps labels/dividers to filtered subset via `nodeGraphResolveChoiceSet` + `choiceOriginMin`.
- **B-080** — Choice segment labels use full track width (collapse empty unit column; cache-bust `b080-choice-fullwidth-1`).
- **B-048** — Module Settings bypass control shares wiring-panel --node-bypass-* SSOT with module face (black/red/glow).

---

## Notes

- Hunt date: 2026-08-12. Branch at the time: `master` @ `0df9e86` plus uncommitted scope/runtime files.
- Do not file “module grouping is under construction” (early return in save-as-group) unless that contract changes.
- Site `/patch/*` slim-wasm silence was addressed in `0df9e86` (default combined + slim fallback). Reopen only if showcase is still silent.
