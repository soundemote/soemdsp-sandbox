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
| B-026 | see | wip | Pause → stop → play leaves value faces dark |
| B-027 | hear | fixed | Header Speed 2.0 slows the patch |
| B-028 | hear | open | Chebyshev / Elliptic / high-order BP are RBJ stand-ins |
| B-029 | hear | open | Offline/Render JS twins ≠ live native (~60 types) |
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

---

## Inbox (unnumbered user reports)

Paste raw notes here. An agent will promote them to `B-xxx` on the next pass.

<!-- user: paste below this line -->

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
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/node-graph-live-runtime.js` ~2160; `public/node-live-audio-worklet-set-plan.js`; `public/modules/polyBlep/poly-blep-worklet-evaluator.js` 137–142
- What: `pitchReferenceHz` / `pitchReferenceMidiNote` are posted. Worklet never assigns `this.pitchReferenceMidiNote`. Oscs always MIDI 48 / 0.4 V.
- Repro: Change Patch Settings concert pitch / reference note. 0.1V/Oct tracking unchanged.
- Fix shape: Store both on `setPlan` and `setConnections`.

### B-007 — 0.1V/Oct clamped to [−1, 1]
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `public/modules/polyBlep/poly-blep-worklet-evaluator.js` 139–142; copies on additive / ellipsoid / sineWavetable / softpop / surge / `node-live-audio-worklet-evaluators-sources.js`
- What: CV is `midi/120`. MIDI 127 → 1.058, clamped to 1.0. Notes above MIDI 120 flatten.
- Repro: Keyboard / stacked pitch CV above ~MIDI 120.
- Fix shape: Do not clamp pitch CV to ±1. Clamp resulting Hz via Speed Limit / `resolveFrequencyHz`.

### B-008 — Scientific IIR zeros z on every cutoff tick
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/sandbox_native_maths/scientific_iir.h` ~244, 273, 307; `public/modules/scientificIir/scientific-iir-math.js` ~193
- What: Redesign always writes `z1 = z2 = 0`. Smoothed/modulated Frequency has no memory — filter is a gain until the knob stops.
- Repro: Butterworth (or LR / Bessel / Cheby / Elliptic) Frequency sweep or modulate. Clicks, thin, no resonance until parked.
- Fix shape: Preserve z on coeff-only updates (crossover `remap_cascade` pattern). Zero only on kind/mode/order change.

### B-009 — Linkwitz–Riley order 2 is actually LR4
- Status: open
- Severity: hear
- Source: hunt-2026-08-12
- Files: `native_modules/sandbox_native_maths/scientific_iir.h` 263–266
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
- Files: `native_modules/sandbox_native_maths/scientific_iir.h` ~180–240
- What: Cheby = Butterworth Q × made-up epsilon. Elliptic comment admits a stand-in. BP/BR replace every section Q with `1/bandwidthOct` (same peak stacked).
- Repro: Ripple / Order on Cheby or Elliptic; raise BP order.
- Fix shape: Real analog prototype → bilinear, **or** rename tooltips to “RBJ cascade (Cheby/elliptic-ish Q)”.

### B-029 — Offline/Render JS twins ≠ live native (~60 types)
- Status: open
- Severity: hear
- Source: hunt-2026-08-12 (also `docs/POLICY_COMPLIANCE_AUDIT.md`)
- Files: see that audit
- What: APP_POLICY §5: one core. Live worklet is mostly WASM. Render Sample still runs JS twins for most native types. Bounce ≠ live.
- Repro: Render Sample a native filter/osc; compare to live.
- Fix shape: Main-thread WASM like polyBlep. Silence until ready. Delete JS audio twins.

### B-030 — dsp_floor via long long UB for huge |x|
- Status: open
- Severity: likely
- Source: hunt-2026-08-12
- Files: `native_modules/sandbox_native_maths/scalar_helpers.h` 18–21
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

---

## Fixed

<!-- move B-xxx here with a one-line note -->

---

## Notes

- Hunt date: 2026-08-12. Branch at the time: `master` @ `0df9e86` plus uncommitted scope/runtime files.
- Do not file “module grouping is under construction” (early return in save-as-group) unless that contract changes.
- Site `/patch/*` slim-wasm silence was addressed in `0df9e86` (default combined + slim fallback). Reopen only if showcase is still silent.
