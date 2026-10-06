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

## Electro Snare

**Status:** planned, not started. Plan in `docs/SNARE_PLAN.md` (2026-10-06, owner Sandy). The parameter set and algorithm list are under discussion with Argi, not final. Do not build until Argi says go.

**Direction:** New drum module **Electro Snare** (Argi, 2026-10-06). It replaces the `electroSnare` placeholder card, which was removed on 2026-10-06 (`docs/BUG_PLAN.md` C-002); the new module takes the freed key in place (type key `electroSnare` proposed, `docs/SNARE_PLAN.md`). Trigger ⎍ and Reset ↺ in (Reset restarts every oscillator, resonator and envelope phase mid-hit). Snare (audio) and Env out. One fixed shared parameter set that every algorithm interprets (no per-algorithm params): Algorithm (stored by name), Tune, Tone, Snappy, Body Decay, Snap Decay, Bend, Amplitude. Candidate algorithms: 808, 909, Simmons SDS-V, Modal (membrane modes + snare-wire noise), FM. Env = overall amplitude envelope (proposed). Native C++/WASM only, cheap resonators / decaying sines / enveloped noise, no JS DSP, no shims.

**Still open:** final parameter set and algorithm list, default algorithm, Reset vs noise, Accent / velocity, Env definition, keep the key `electroSnare` vs a new key `snare`. See the plan's Open questions.

## Kick (SweepKicker)

**Status:** planned, not started. Plan in `docs/KICK_PLAN.md` (2026-10-06, owner SandyModules). Do not build until Argi says go.

**Direction:** New drum module **Kick** (`kick`) built on Robin Schmidt's SweepKicker (RS-MET `rosic::rsSweepKicker`), used with Robin's permission (2026-10-06, quoted in the plan). One oscillator whose frequency falls along Robin's rational sweep law (High Freq → Low Freq, Sweep Time, Chirp, Chirp Shape), with Robin's Wave / Wave Shape / Phase. Trigger ⎍ and Reset ↺ in; Kick and Env out. Decay (T60) is a sandbox addition (SweepKicker has no amp envelope), kept by Argi on 2026-10-06; it drives Env and the Kick amplitude. Trigger restarts the sweep and envelope without zeroing the oscillator phase; only Reset ↺ resets the phase (Argi, 2026-10-06). Parity test against Robin's own class. Robin's FlatZapper (allpass-chain "zap") is not part of the Kick; it has its own seed (§Flat Zapper). Native C++/WASM only, no JS DSP, no shims.

**Removal (done 2026-10-06):** Sinepulse, Sine Kick, Kick Envelope, the `electroSnare` placeholder and `electroKick` were removed (`docs/BUG_PLAN.md` C-002; file list in `docs/KICK_PLAN.md` → Removal). Local, uncommitted.

**Decided (Argi, 2026-10-06):** Decay kept; Trigger keeps the phase and Reset ↺ is the only phase reset; Kick and Electro Kick are separate modules; Flat Zapper is its own seed.

**Still open:** permission scope, latching, velocity, units, stereo. See the plan's Open questions.

## Flat Zapper

**Status:** seed only (Argi, 2026-10-06). Details, proposed params and measured cost in `docs/KICK_PLAN.md` → Flat Zapper module (seed). Do not build until Argi says go.

**Direction:** A module built on Robin Schmidt's `rsFlatZapper` (RS-MET, used with his permission): a chain of 0–256 allpass stages (one-pole or biquad) tuned from Low Freq to High Freq along a shape curve. **Trigger ⎍** fires an internal impulse, which comes out as a flat-spectrum (white) falling zap. An **audio input** feeds anything through the same dispersion chain (a disperser / smear). Out = Amplitude × (Mix × chain + (1 − Mix) × dry). Proposed params: Stages, Mode (`onePole` / `biquad`, stored by name), Low Freq, High Freq, Freq Shape, Low Q, High Q, Q Shape, Impulse, Input, Mix, Amplitude. Native C++/WASM only, no JS DSP, no shims.

**Cost (measured on the box, native clang -O2):** the serial chain costs ≈ 2.3–2.7 ns per stage per sample in either mode (latency-bound). 50 biquad stages ≈ 110 ns/sample (≈ 1.25 × a SweepKicker voice at ≈ 90 ns); 256 stages ≈ 640–690 ns (≈ 7 ×); ≈ 300 ns at 256 stages with stage-major block processing.

**Still open:** a separate module (proposed) or a mode / input of the shipped Phase Disperse (up to 64 identical biquads, one Frequency + Pinch, no Trigger); Robin's brown post-filter as a Tone choice; a Reset jack; default stage count (proposed 50).

## Electro Kick

**Status:** seed only. **Discussion with Argi, not final.** Dated 2026-10-06. Do not build until Argi says go.

**Direction:** One kick voice on the Electro Snare model: one fixed shared parameter set and an **Algorithm** choice (stored by name). Every algorithm gives every param a meaning; no param is added, removed, shown or hidden per algorithm. Trigger ⎍ and Reset ↺ in (Reset restarts all oscillation mid-hit); **Kick** (audio) and **Env** (amplitude envelope) out. Native C++/WASM only, cheap resonators / oscillators / enveloped noise, no JS DSP, no shims. The parked `electroKick` placeholder card was removed on 2026-10-06 (`docs/BUG_PLAN.md` C-002), so this would be a new module (the key `electroKick` is free).

**Proposed shared params (not final):** Algorithm, **Tune** (rest pitch, Hz), **Bend** (octaves above Tune at the hit), **Bend Time** (how fast the pitch falls, s), **Decay** (body, s T60), **Click** (attack transient level), **Tone** (timbre, per algorithm), **Amplitude**.

**Candidate algorithms:**

| Key | Design | Facts (web-checked 2026-10-06) | Shared-param reading |
|-----|--------|-------------------------------|----------------------|
| `tr808` | Pinged 2-pole resonator standing in for the bridged-T, plus a short attack frequency jump and a slow "sigh" | The 808 bass drum is a bridged-T network pinged by the trigger, ringing at about 49–56 Hz. At the start of a note its centre frequency jumps up for ≈ 4–6 ms, then returns (Werner computes about 2.8 ×, an octave plus five semitones; the Service Notes say "twice" and tie it to accent); a slower downward "pitch sigh" comes from leakage through R161. Panel: Level, Tone, Decay ([Werner, Abel, Smith, DAFx-14](https://www.dafx.de/paper-archive/2014/dafx14_kurt_james_werner_a_physically_informed,_ci.pdf); [Werner, 808 BD post](https://kurtjameswerner.tumblr.com/post/50274769999/chuck-tr-808-emulator-bass-drum-bd-emulation); [SOS, Practical Bass Drum Synthesis](https://www.soundonsound.com/techniques/practical-bass-drum-synthesis)) | Tune = resonator Hz; Bend / Bend Time = the attack jump (stock ≈ 1.5 oct, ≈ 5 ms); Decay = ring T60; Click = trigger-pulse level; Tone = output lowpass (the 808's Tone) |
| `tr909` | Phase-reset triangle VCO rounded toward sine, pitch envelope, plus a click / noise attack path | Triangle VCO reset on every trigger, rounded by a diode clipper toward a sine. ENV-3 bends the pitch down; the panel **Tune** sets that sweep (it is really the decay of ENV-3, about 30–120 ms stock). Body VCA on ENV-1 (panel **Decay**). The attack path is a shaped trigger pulse plus low-passed noise on ENV-2 (panel **Attack**) ([network-909, Bass Drum](http://www.network-909.de/bassdrum.htm); [C. Fraser, TR-909 mods](http://www.colinfraser.com/tr909/909mods/909mods.htm); [Whittle, TR-909 Sound Mods](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf)) | Tune = rest Hz (no panel pitch on stock 909); Bend = sweep depth; Bend Time = ENV-3 decay (= 909 panel Tune); Decay = ENV-1; Click = 909 Attack (pulse + noise); Tone = clipper drive (sine → square, Whittle's "Drive" mod) |
| `simmons` | Simmons SDS-V bass drum: oscillator with bend, filtered noise, click | Per-module controls: noise, tone (pitch), bend, decay, noise/tone balance, click (pad-impact attack) ([SDS-V Service Notes](https://synth-diy.org/yg-archives2/raw/Simmons_Drums/files/16_Manuals/4_SDS-V_SM.pdf); [Wikipedia, Simmons SDS-V](https://en.wikipedia.org/wiki/Simmons_SDS-V)) | Tune = tone pitch; Bend / Bend Time = bend; Decay = VCA decay; Click = click; Tone = noise ↔ tone balance |

Not added: an FM kick (no single documented reference design) and the 909's sampled cousins (LinnDrum / DMX kicks are samples).

**Decided (Argi, 2026-10-06): Electro Kick and Kick (SweepKicker) are separate modules.** Kick keeps Robin's full parameter set (`docs/KICK_PLAN.md`); SweepKicker is not an Electro Kick algorithm. Electro Kick covers the classic machines.

**Still open:** final param list (is Bend Time shared or fixed per algorithm, like the snare's bend time?), default algorithm, Click on 808 (stock has none beyond the pulse), velocity (the 808 Service Notes tie the attack jump to accent; height is velocity, proposed), Env definition (proposed: overall amp envelope, as Electro Snare).

## Electro Hat

**Status:** seed only. **Discussion with Argi, not final.** Dated 2026-10-06. Do not build until Argi says go.

**Direction:** One hi-hat voice on the Electro Snare model: one fixed shared parameter set and an **Algorithm** choice (stored by name). Native C++/WASM only, no JS DSP, no shims. Proposed to replace the parked `electroHat` placeholder card (listed as a candidate in `docs/KICK_PLAN.md` → Removal).

**I/O (proposed):** **Closed ⎍** (port `Trigger`) and **Open ⎍** (port `Open`) trigger inputs, **Reset ↺**; **Hat** (audio) and **Env** out. **Choke:** one voice. An Open hit rings with Open Decay. A Closed hit restarts the envelope with Closed Decay, so it chokes a ringing open hat. The 808 and 606 both choke this way (the 606's envelope shut-off circuit), and on the 909 open and closed share one circuit and cannot sound together ([Baratatronix, 606 hats](https://www.baratatronix.com/blog/606-cymbal-and-hi-hat-synthesis); [polynominal, TR-909](https://www.polynominal.com/site/studio/gear/drum/roland-tr909/roland-tr909.html)). Alternative: a single Trigger plus an Open amount param (like the placeholder).

**Proposed shared params (not final):** Algorithm, **Tune** (metal pitch scale, 1 = stock), **Tone** (brightness: band-pass / high-pass cutoff), **Closed Decay** (s T60), **Open Decay** (s T60), **Metal** (metallic source ↔ white noise balance; 808 / 606 stock = all metal), **Amplitude**.

**Candidate algorithms:**

| Key | Design | Facts (web-checked 2026-10-06) |
|-----|--------|-------------------------------|
| `tr808` | Six square oscillators at inharmonic frequencies → two band-passes → high-pass → VCA | Six Schmitt-trigger square oscillators (one HD14584, ≈ 48 % duty) at **205.3, 304.4, 369.6, 522.7, 540, 800 Hz** (the last two factory-trimmed), summed, then band-passes at ≈ **3440 Hz** and ≈ **7100 Hz**, then high-pass and VCA. Shared by cymbal, hats and cowbell. Closed hat fixed ≈ 50 ms; open hat 90–600 ms ([Werner, Abel, Smith, "The TR-808 Cymbal", ICMC/SMC 2014](https://www.icmc14-smc14.net/images/proceedings/OS24-B10-TheTR-808Cymbal.pdf); [Baratatronix, 808 hats](https://www.baratatronix.com/blog/cascadia-808-cymbal-hi-hat-synthesis)). Square oscillators need band-limiting (PolyBLEP) |
| `tr606` | Same six-oscillator design, different tuning, no noise | Same HD14584 design with different (unit-varying) frequencies, no added noise; the hats use the high band through a shared VCA and resonant high-pass; closed shuts off open ([Baratatronix, 606 hats](https://www.baratatronix.com/blog/606-cymbal-and-hi-hat-synthesis); [TR-606 mod notes](http://machines.hyperreal.org/manufacturers/Roland/TR-606/info/drumantix/mods/various.txt)) |
| `tr909` | **Cannot be synthesized faithfully** | 909 hats (and cymbals) are **6-bit samples** in a Hitachi HN61256P ROM (closed = top quarter, open = the rest), played by an address counter into a DAC, then an analog VCA and lowpass ([Wikipedia, TR-909](https://en.wikipedia.org/wiki/Roland_TR-909); [polynominal](https://www.polynominal.com/site/studio/gear/drum/roland-tr909/roland-tr909.html); [synth-diy, 909 HH ROM](https://synth-diy.org/pipermail/synth-diy/2006-June/098691.html); [SOS Synth Secrets 39](https://github.com/micjamking/synth-secrets/blob/master/part-39.md)). Options: leave it out (proposed), or a "909-style" approximation clearly labelled as one. Sample playback is not synthesis and would need rights to Roland's data |
| `fm` | Metallic FM / ring-mod: inharmonic square or pulse operators, frequency- or ring-modulated, high-passed, short decay | Gordon Reid's cymbal / hat patches build the metal spectrum with FM and ring modulation of inharmonic oscillators ([SOS, Synthesizing Realistic Cymbals](https://www.soundonsound.com/techniques/synthesizing-realistic-cymbals); [SOS, Practical Cymbal Synthesis](https://www.soundonsound.com/techniques/practical-cymbal-synthesis)) |
| `noise` | Filtered white noise → band-pass / high-pass → VCA | The simplest analog hat. Metal = noise only; Tune shifts the filter |

**Shared-param reading (draft):** Tune scales all oscillator frequencies (808 / 606 / FM) or the filter (noise). Tone moves the band-pass / high-pass. Closed / Open Decay are the two envelope T60s. Metal crossfades the metal source with white noise (808 / 606 stock = 0 % noise). Amplitude is the output level.

**Still open:** two trigger jacks vs one Trigger + Open amount; choke rule (Closed always chokes Open, proposed); whether 909 appears at all; 606 frequencies (they vary per unit; pick by ear); Accent / velocity (height is velocity, proposed); Env definition.

## Electro Tom

**Status:** seed only. **Discussion with Argi, not final.** Dated 2026-10-06. Do not build until Argi says go.

**Direction (Argi):** a separate tom module on the Electro Snare model: one fixed shared parameter set, an **Algorithm** choice (stored by name), no per-algorithm params. Same I/O as Electro Snare: **Trigger ⎍** and **Reset ↺** in (Reset restarts all oscillation mid-hit); **Tom** (audio) and **Env** out. Native C++/WASM only, no JS DSP, no shims.

**Shared params (Argi):** Algorithm, **Tune**, **Tone**, **Body Decay**, **Bend**, **Noise**, **Amplitude**. **Tune and Bend are the primary controls** (first and largest on the card). **Noise** is a small attack-noise amount; it replaces the snare's Snappy / Snap Decay (the noise envelope is a fixed per-algorithm constant).

**Candidate algorithms:**

| Key | Design | Facts (web-checked 2026-10-06) | Shared-param reading (draft) |
|-----|--------|-------------------------------|-----------------------------|
| `tr808` | Pinged resonator, small pitch drop, a little noise | Bridged-T resonator per tom; diodes damp it as it fades, so the pitch drops a little ("less like a boing, more like a tonk"); a little low-passed pink noise on a slightly longer envelope. Tunings: low 80–100 Hz (≈ 90), mid 120–160 Hz (≈ 135), high 165–220 Hz (≈ 185); decays ≈ 200 / 130 / 100 ms ([Baratatronix, 808 toms](https://www.baratatronix.com/blog/808-tom-synthesis)) | Tune = resonator Hz; Bend = small drop as it decays (stock ≈ a few semitones at most); Body Decay = ring T60; Tone = noise lowpass / brightness; Noise = pink-noise level |
| `tr909` | Phase-reset oscillators with a pitch sweep plus noise | Three triangle VCOs per tom, reset together on the trigger, each rounded to a sine by a diode clipper (VCO-1's clipper moves from square to sine during the hit); ENV-4 sweeps the pitch of all three; "tom noise" is mixed with VCO-3 for the attack; panel Tune and Decay ([network-909, Toms](http://www.network-909.de/toms.htm)) | Tune = base Hz (fixed VCO ratios, by ear); Bend = ENV-4 depth; Body Decay = VCA decays; Tone = VCO-1 clipper hardness (square → sine); Noise = tom-noise level |
| `simmons` | Simmons SDS-V tom: sine / triangle with a big downward bend plus filtered noise | SDS-V modules have tone pitch, bend, decay, noise, noise tone and click controls; the falling-pitch "peew" is the signature sound ([SDS-V Service Notes](https://synth-diy.org/yg-archives2/raw/Simmons_Drums/files/16_Manuals/4_SDS-V_SM.pdf); [Wikipedia, Simmons SDS-V](https://en.wikipedia.org/wiki/Simmons_SDS-V); [Still Not Working, SDS V](http://snw.lonningdal.no/sds5.php)) | Tune = tone pitch; Bend = big drop (1–2 oct suggested); Body Decay = VCA decay; Tone = noise filter; Noise = noise level |

**Still open:** default algorithm; Bend time fixed per algorithm (proposed, as the snare) or tied to Body Decay (Simmons); Tune range (proposed 40–400 Hz) and default; low / mid / high as presets vs one free Tune (proposed: free Tune); shared resonator / noise helpers with Electro Snare (library helpers need Architect approval); velocity; Env definition.
