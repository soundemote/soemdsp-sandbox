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
| B-048 | see | open | Module settings enable/disable control does not mirror module button |
| B-049 | hear | fixed | Softwave ignored Increment (Arp.inc OK on polyBlep only) |
| B-050 | see | open | Workspace zoom past ~10× stutters badly |
| B-051 | see | open | Softwave oscillator display needs unrelated EQ Frequency refresh |
| B-052 | see | fixed | Portal Out rename to ChordKeys skips outlet color/shape |
| B-053 | see | fixed | Catalog Portal In/Out replaced by linked Portal IO |
| B-054 | see | open | Output display keeps pause emoji after Stop/Play |
| B-055 | see | fixed | Text Box covers wires (UI z-order) |
| B-056 | see | open | Default filter drawer pollutes basic displays / Softclipper display jitters |
| B-057 | see | fixed | Hide unused leaves oversized bottom lip |
| B-058 | hear | open | Voice parameter modulation misses active and idle voice updates |
| B-059 | see | removed | Alt+click jack scope-monitor feature deleted (was pip, not orphan wire) |
| B-060 | hear | open | Pulse Explosion does not modulate PolyBLEP amplitude (likely no output) |
| B-061 | see | fixed | Small slider values show mantissa (8.0357) — scientific exponent stripped |
| B-062 | hear | open | Non-audio UI changes restart audio engine |
| B-063 | hear | fixed | Robin Oscillator Morph MOD silent (ParamModEdge → WIDTH, not SHAPE) |
| B-064 | see | open | Text Box background overflows outline when title is hidden |
| B-065 | see | open | Multi-wire portal action creates duplicate portals instead of one Portal In / multiple Portal Outs |
| B-066 | see | open | Multi-select Portal settings hides Title and locks Display |
| B-067 | see | open | Bottom lip can leave less than 2 px clearance |
| B-068 | see | open | Canvas-mode slider/knob/text display scaling is not WYSIWYG |

---

## Inbox (unnumbered user reports)

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
- Fix shape: Give RobinSinusoid an explicit display schema, or persist default-osc `traceDisplaySettings` the same way as `displayType: "trace"`. Verify other no-displayType oscs (same hole).

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
- Status: open
- Severity: see
- Source: user
- Files: to investigate
- What: The module settings enable/disable control does not mirror the module button: it does not turn red when disabled, does not match the button background, and does not glow like the module enable/disable button.
- Repro: Disable a module and compare its module settings control with the module button (and repeat in the other direction).
- Fix shape: Make both controls share the same disabled state and background/glow styling. Docs only for this report; do not fix the UI here.

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
- Status: open
- Severity: see
- Source: user 2026-09-27
- Doc: `docs/B-056_FILTER_DRAWER_DISPLAY_POLLUTION.md`
- Files: default filter drawer/display selection and basic-display routing; Softclipper display/render path (to investigate)
- What: The default filter drawer appears to pollute basic displays. Softclipper jitters between an unused filter display and its intended display instead of keeping the intended display stable.
- Repro: Open a basic display containing or associated with Softclipper while the default filter drawer is present/unused. Observe the display selection; Softclipper alternates or jitters between the unused filter display and its intended display.
- Fix shape: Ensure an unused/default filter drawer cannot claim or overwrite a basic display. Make display ownership/selection deterministic so Softclipper stays on its intended display. Docs only; no code fix in this report.

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
- Status: open
- Severity: see
- Source: user 2026-09-28
- Related: B-032 (Text Box resize/text clipping; verify shared title/content-height geometry); B-055 (Text Box wire z-order, fixed; separate layering symptom unless the same host/layout path is implicated)
- Doc: `docs/B-064_TEXT_BOX_HIDDEN_TITLE_BACKGROUND_OVERFLOW.md`
- Files: Text Box title visibility, background/face clipping, and module outline/border geometry (to investigate)
- What: Hiding the Text Box title causes its background to extend beyond the module outline/border.
- Repro: Add or open a Text Box, hide its title, and observe the background at the module edges. Compare the same Text Box with the title visible.
- Fix shape: Keep the Text Box background clipped to the module outer bounds in both title states; recompute the content/face geometry when the title track is removed. Verify against B-032 resize/text clipping and B-055 wire layering. Docs only; no code fix in this report.

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
- Related: B-050 (workspace zoom/stutter; separate scaling symptom unless a shared canvas path is confirmed)
- Doc: `docs/B-068_CANVAS_SLIDER_KNOB_SCALING.md`
- Files: canvas-mode scaling/transform and slider/knob/text rendering geometry (to investigate)
- What: The slider display does not scale properly in canvas mode, the knob also does not scale properly, and slider-associated text can be positioned or scaled so badly that it ends up outside the module. **WYSIWYG — "what I see is what is scaled" — is not being held true in canvas mode for slider/knob display or its text.**
- Repro: Enter canvas mode with slider/knob content, change the canvas scale, and compare the slider display, knob, and associated text with the surrounding scaled canvas. They do not scale consistently with the visible canvas content; in some cases the text ends up outside the module.
- Expected: Slider display, knob, and associated text scale consistently with the rest of the rendered canvas; visible WYSIWYG geometry remains aligned at each canvas scale, with the text inside the module bounds.
- Fix shape: Audit the authoritative canvas transform and slider/knob/text CSS-pixel/canvas-unit conversion and text anchoring; apply the canvas scale exactly once and keep the rendered bounds aligned inside the module. Docs only; no code fix in this report.

## Fixed

<!-- move B-xxx here with a one-line note -->

- **B-055** — Text Boxes mount under `#nodeWireSvg` via `#nodeGraphAnnotationNodes` so cables paint above annotations.
- **B-057** — Hide unused recomputes IO/outer height from connected ports; layout bands re-applied on chrome/wire edits.
- **B-059** — Alt+click jack scope-monitor feature **removed** (deleted, not wontfix). See section above / `docs/B-059_ABANDONED_WIRE_DRAG_ORPHAN_DOT.md`.
- **B-061** — Slider / LED number faces expand scientific notation before `limit_decimals` so small values keep their magnitude.
- **B-063** — Robin Oscillator Morph ParamModEdge targets WIDTH (was SHAPE; Softwave-correct default left Morph CV silent).

---

## Notes

- Hunt date: 2026-08-12. Branch at the time: `master` @ `0df9e86` plus uncommitted scope/runtime files.
- Do not file “module grouping is under construction” (early return in save-as-group) unless that contract changes.
- Site `/patch/*` slim-wasm silence was addressed in `0df9e86` (default combined + slim fallback). Reopen only if showcase is still silent.
