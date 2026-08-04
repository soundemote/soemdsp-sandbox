# 🎛️ soemdsp-sandbox

**A browser-based modular audio synthesis sandbox** — patch together native
C++/WASM DSP modules, watch waveforms render live, and hear the result
instantly. No install, no build step, just a Python file server and a
browser.

### 🌐 Live Demo — [soundemote.io/sandbox](http://soundemote.io/sandbox)

---

## ✨ What's inside

- 🔊 **Live Audio** — patch modules together and hear them in real time via
  an AudioWorklet-driven graph.
- 🧩 **Native DSP modules** — oscillators, filters, envelopes, reverbs, and
  chaos generators compiled from C++ to WASM.
- 🌈 **Soft Fractal** — WebGL Julia face with pure planetary \(c(t)\); map
  outs **Hx/Hy** from \(z ← z²+c\); Color Rate / Shift, Outer color
  (Background / Gradient start / Haze).
- 📼 **Ping Pong Delay (tape)** — tempo Numer/Denom taps; independent L/R
  LFO drift (Parabol / Random Walk / FBM); Offset = ±drift ms; passive
  HPF/LPF + soft clip in the feedback path.
- 🏛️ **SoEmReverb** — soemdsp reverb (diffusion, tempo-synced echo, ping
  pong, LFO styles, saturate, ducking) with stereo Trace face.
- 📺 **Phosphor scopes** — continuous GPU beam ribbons (smoother trails;
  less jagged hard/dot thinning on line burn and 2D phosphor).
- 📈 **Render Sample** — bounce a patch to audio and inspect the waveform.

---

## 🚀 Quick start

```powershell
# Requirements:
# - Python 3
# - A modern browser
# No package install is required for the sandbox server.

# Download:
git clone https://github.com/soundemote/soemdsp-sandbox.git
cd soemdsp-sandbox

# Run:
python server.py

# Open:
# http://127.0.0.1:8765

# Stop:
# Ctrl+C

# Test:
python scripts\smoke_test.py
```

<details>
<summary>⚙️ Optional artifact packet</summary>

```powershell
# Use this only if the sibling soemdsp repo is built locally.
C:\Users\argit\Documents\_PROGRAMMING\soemdsp\build-moved\examples\Debug\runtime_dsp_object_bound_wav_resync_demo.exe
python server.py
```

</details>


---


> Third-party plugin **hosting** experiments live outside this tree ([soemdsp-sandbox-claphost](https://github.com/soundemote/soemdsp-sandbox-claphost)). This repo is modular authoring only.

## 🎚️ Analog filters research

Ported over from the [Analog Filters](https://github.com/elanhickler/soemdsp-sandbox-analog-filters)
fork — modeling the *circuit*, not the sound, so the self-oscillating,
saturating personality of classic analog filters falls out on its own.

Every classic analog filter is a physical accident wearing a transfer
function. Resistors, capacitors, and transistors doing exactly what physics
demands of them — and what physics demands turns out to sound *incredible*
under stress: self-oscillating resonance, soft-clipping feedback loops,
component drift, asymmetric distortion on the way into saturation. None of
that is a bug. It's the entire reason a Moog ladder filter has a personality
and a textbook biquad doesn't.

### 🧪 What makes them hard to get right in software

A naive digital filter is linear, time-invariant, and stable by construction.
A real analog filter is often none of those things, which is exactly what's
being chased here:

- **Nonlinearity.** Real transistor ladder stages saturate. A textbook
  digital filter doesn't, unless you deliberately put a nonlinearity back in
  — and where you put it changes the sound completely.
- **Self-oscillating resonance.** Push feedback gain high enough on a real
  Moog ladder and it turns into an oscillator, cleanly, on purpose. Getting
  a digital model to do the same without exploding numerically is the whole
  game.
- **Zero-delay feedback.** Naive digital translations of analog feedback
  loops introduce a one-sample delay that isn't in the real circuit, which
  audibly changes the resonant behavior. Topology-preserving transform (TPT)
  / zero-delay-feedback (ZDF) techniques exist specifically to close that gap.
- **Frequency-dependent nonlinear behavior.** Saturating a signal *before*
  filtering it sounds different from saturating *after* — and real circuits
  often do both, in a loop, simultaneously. That interaction is where a lot
  of the "expensive analog gear" character actually lives.
- **Aliasing from the nonlinear stages.** Any saturation stage generates
  harmonics; without oversampling, those harmonics fold back down as
  aliasing. Getting the nonlinear modeling right and getting the aliasing
  under control are two separate problems that have to be solved together.

### 🌸 The Flower Child family

Ported from an older `soemdsp` codebase (`FlowerChildFilterCore.h`) —
resonant, self-oscillating feedback designs, not passive filters in the
textbook sense. Each is a native C++/WASM module, verified against the real
compiled artifact with a Python+wasmtime harness before wiring:

| Module | Modes | Notes |
|---|---|---|
| `flower_child_filter` | Clean, Dirty, Rev3, Downsampled | The original two revisions plus an ellipsoid-oscillator variant and a sample-and-hold aliasing variant |
| `rsmet_filter` | LP6/12/18/24, HP6/12/18/24, BP6, BP12 (10) | A ladder filter with a tanh soft clipper and noise injection stage |
| `yellowjacket_filter` | — | Feedback ellipse-oscillator filter, grindy, easily produces square-wave-like output. Its resonance has a chaotic, bubbly character reminiscent of a Polivoks-style filter |
| `superlove_filter` | LP18, LP24, HP6, BP6 | Trisaw-oscillator feedback resonator, warm and stably self-oscillating |
| `chaotic_phase_locking_filter` | — | Direct feedback ellipse-waveshaper resonator (no oscillator phasor) |
| `resonator_filter` | Sinusoid, Triangle, Sawtooth | Dual-phasor FM feedback resonator — each mode's *resonance itself* is visibly and audibly shaped like its namesake, not just a generic buzz with a different label. See below |
| `human_filter` 🚧 | BP6, LP6, LP12 | Dual-phasor feedback network shaped by a bell filter — marked under construction; the original's feedback-filter wrapper (Q, center frequency) wasn't recoverable from the accessible codebase, so a documented Q=1/1kHz default stands in |

Every shaping curve in these (resonance-vs-frequency, FM/PM crossfade, etc.)
is reproduced from the real `soemdsp::utility::Graph` /
`soemdsp::curve::Rational` source, not approximated — a generic N-node graph
evaluator was built once and reused across all of them.

**What makes Flower Child Filter itself interesting:** its Dirty/Rev3-style
oscillators don't crossfade between a sine and a square wave with two
separate waveshapers — they use one continuous
[`ellipse()`](https://github.com/soundemote/oldcode/blob/main/old%20stuff%20se_framework/SynthesizerComponents/oscillator/waveshapes.cpp)
function that morphs a sine into a square (and everywhere in between) as a
single parameter moves, driven directly by resonance. That's the actual
mechanism behind why turning resonance from clean to hot doesn't feel like
switching between two different sounds — it's one continuous, stable
waveshape sweep behind the feedback loop, which is exactly why it sounds and
behaves like a real overdriven self-oscillating filter rather than a
digital effect being crossfaded in.

**SuperLove's HP6 mode in particular** screams — driven hard, it produces
clean, beautiful square waves and is generally one of the hottest-sounding
highpass filters in this set.

**Resonator Filter deserves more than "dual-phasor FM feedback resonator."**
What actually makes it interesting is that each of its three modes doesn't
just change the *timbre* of the resonance — it visibly reshapes what the
resonance *is*:

- **Sawtooth mode's** resonance is literally sawtooth-shaped when you look
  at the waveform, not just "a buzzier tone."
- **Triangle mode's** resonance is literally triangular — a different
  geometric shape entirely, not a filtered version of the same shape.
- **Sinusoid mode's** resonance looks like an overly rounded sine wave, and
  that rounding is exactly why it sounds bubbly rather than smooth — a kind
  of sinusoidal fractal quality that comes directly from the shape, not from
  added modulation.

That's a genuinely novel result for a feedback resonator: the *shape* of the
self-oscillation is the mode, not a label on top of the same underlying
waveform. Measured directly from the real compiled `.wasm` (driven with a
220Hz tone at resonance 0.7–0.85, steady state):

<div align="center">
<img src="docs/assets/resonator-waveforms.png" alt="Three stacked waveform plots: Sinusoid mode showing a rounded sine, Triangle mode showing a triangular shape with jitter, and Sawtooth mode showing an asymmetric ramp-and-decay shape" width="85%"/>
</div>

### 📈 Characterizing behavior empirically

Here's the thing that makes this whole family hard to reason about from the
code alone: **they're feedback oscillators, not fixed filters.** A plain
lowpass has one transfer function you can write down. These don't — the
"curve" depends on resonance, input level, and the knob position feeds back
into the oscillator's own pitch. There's no formula to graph.

So instead of guessing, the plan is to *measure*: feed a compiled module a
swept sine tone through the same Python+wasmtime harness already used to
verify it, record output RMS per frequency, and plot the result. This turns
"what does turning this knob actually do" from a guess into a chart.

**First result, `yellowjacket_filter`** (see the module's own naming
confusion first — `Yellowjacket_BP` in the original code, but the filter
tap it actually uses is `LP_6`, a lowpass): swept a sine tone from 20Hz to
14kHz through the compiled `.wasm` at three Frequency-knob settings,
resonance fixed at 0.3:

- **Knob 0.2** — flat response (~0.616 RMS) across the whole sweep. The
  self-oscillation is loud enough to drown out whatever's coming in; the
  input frequency barely matters.
- **Knob 0.5** — behaves like an actual lowpass: loud below ~100Hz, settling
  to ~0.046 above ~400Hz.
- **Knob 0.8** — a genuine resonant peak around 1.2–1.6kHz (~0.21 RMS,
  roughly double its neighbors), falling off on both sides.

<div align="center">
<img src="docs/assets/yellowjacket-response.png" alt="Line chart of Yellowjacket Filter output level versus input frequency (log scale) at three Frequency knob settings. Knob 0.2 is flat. Knob 0.5 slopes down like a lowpass. Knob 0.8 has a clear resonant peak around 1.2 to 1.6kHz." width="85%"/>
</div>

That last point is the answer to "but it sounds like a bandpass in use" —
it does, and now there's a measurement showing exactly where and how much.
The lesson generalizes: for this whole family, "what's the filter curve"
only has an honest answer as a measured, knob-position-dependent chart, not
a static formula — and that's the method to reach for on the rest of the
list below as they get built.

### 🎚️ Filters on the list

| Filter | Status |
|---|---|
| **Moog Ladder** (4-pole transistor ladder, self-oscillating resonance) | 🔲 not started |
| **Diode Ladder** (TB-303-style, asymmetric diode nonlinearity) | 🔲 not started |
| **Sallen-Key** (2-pole op-amp topology, gentler slope) | 🔲 not started |
| **State-Variable Filter** (simultaneous LP/HP/BP/notch outputs) | 🔲 not started |
| **Twin-T Notch** (passive notch, the basis of classic phaser/wah circuits) | 🔲 not started |
| **Discrete Multimode Filter** (parallel 24dB LP / 24dB HP / 12dB BP / 12dB notch outputs, resonance from a feedback loop with an insert point in the path) | 🔲 not started |
| **Simultaneous LP/HP Filter** (one core filter stage driven as a 12dB lowpass and a separate highpass at once, each with its own audio input and level control, prized for a screaming self-oscillating character) | 🔲 not started |
| **Switchable Third-Order Filter** (three cascaded first-order sections, each switchable between lowpass and highpass, a mode switch selecting among four low-pass/band-pass/reversed-band-pass/high-pass combinations, and a voltage-controlled resonance amplifier that can be driven well past the onset of oscillation into chaotic and phase-locked territory, with taps available after each of the three stages) | 🔲 not started |
| **Diode-Controlled LP/HP Pair** (a highpass stage tracking at half rate paired with a lowpass stage tracking at full rate to form a bandpass-like sweep, with frequency set by diode control current rather than a transistor or OTA stage — which naturally narrows the usable sweep range — and matched capacitor pairs tuning the corner behavior) | 🔲 not started |

This table is the honest state of things: a target list, not a changelog.
Each filter gets the same treatment already proven out elsewhere in
`soemdsp-sandbox` — native C++ compiled to WASM, verified against the real
compiled artifact (not just a JS mirror) before it's wired into the graph.

### 🎧 Listen & watch

*(Placeholder links below — real recordings and demo videos go here once
they exist.)*

| Filter | Audio example | Video demo |
|---|---|---|
| Moog Ladder | [File — TBD](https://drive.google.com/drive/folders/REPLACE_ME_MOOG_LADDER_AUDIO) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_MOOG_LADDER_DEMO) |
| Diode Ladder | [File — TBD](https://drive.google.com/drive/folders/REPLACE_ME_DIODE_LADDER_AUDIO) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_DIODE_LADDER_DEMO) |
| Sallen-Key | [File — TBD](https://drive.google.com/drive/folders/REPLACE_ME_SALLEN_KEY_AUDIO) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_SALLEN_KEY_DEMO) |
| State-Variable Filter | [File — TBD](https://drive.google.com/drive/folders/REPLACE_ME_SVF_AUDIO) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_SVF_DEMO) |
| Twin-T Notch | [File — TBD](https://drive.google.com/drive/folders/REPLACE_ME_TWIN_T_AUDIO) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_TWIN_T_DEMO) |
| Discrete Multimode Filter | [File — clean filter, hot growl](https://drive.google.com/file/d/1E3-sMArwa7t_eC6wMtEOVAn5BaVc_leS/view?usp=drive_link) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_DISCRETE_MULTIMODE_DEMO) |
| Simultaneous LP/HP Filter | [File — audio demo](https://drive.google.com/file/d/1v6cj6S2RXMOlhOBtbkLipTRUmtfrA46H/view?usp=drive_link) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_SIMULTANEOUS_LPHP_DEMO) |
| Switchable Third-Order Filter | [Demo 1](https://drive.google.com/file/d/1bhXlDZkRRuVh6U2f-yfDGbNIiGXiXShG/view?usp=drive_link) · [Demo 2](https://drive.google.com/file/d/1n_9JrZ-zFQ6GQ_a3WGlaKEBpWaulGuDD/view?usp=drive_link) · [Demo 3](https://drive.google.com/file/d/17c3guemmtnHMpqAFP10LeAs0udspJS4r/view?usp=drive_link) · [Demo 4](https://drive.google.com/file/d/1qEJnqQwlNJC80FcRapuWH1bSFhWHdRDQ/view?usp=drive_link) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_SWITCHABLE_THIRD_ORDER_DEMO) |
| Diode-Controlled LP/HP Pair | [File — audio demo](https://drive.google.com/file/d/1fkqbuZDtS1OKaCmWBK-u9vtAbCAzDxhS/view?usp=drive_link) | [Video — TBD](https://youtube.com/watch?v=REPLACE_ME_DIODE_CONTROLLED_LPHP_DEMO) |

---

## 🌆 Supersaw research

Ported over from the [`elanhickler/supersaw`](https://github.com/elanhickler/supersaw)
fork — forked from the
[`aliasing-wars`](https://github.com/elanhickler/soemdsp-sandbox-aliasing-wars)
mission to zoom out from single-oscillator anti-aliasing to the classic
"wall of detuned saws" sound, and to a specific, unusually elegant answer to
the aliasing question that a *stack* of oscillators raises: **pitch
dithering**, from Robin Schmidt's [RS-MET](https://github.com/RobinSchmidt/RS-MET)
project.

### 🎻 Why a supersaw needs its own aliasing story

A single bandlimited sawtooth is a solved problem — that's what
`aliasing-wars` is about. A **supersaw** stacks a whole *choir* of them (7,
15, 31, up to 63 in Soundemote's own implementation), each detuned by a few
cents, each drifting slightly in pitch and phase over time to imitate the
micro-variation of a real string or synth-choir section. That multiplies the
aliasing-mitigation problem by the oscillator count — and multiplies the
*cost* of naive fixes (oversampling scales linearly with voice count; BLEP
tables get expensive fast at 63 simultaneous edges per sample).

Robin Schmidt's answer sidesteps the cost question entirely with a different
trick: **don't correct the aliasing — replace it with noise you'd rather
have.**

### 🎲 Pitch Dithering — RobinSchmidt/RS-MET

- Repo: [RobinSchmidt/RS-MET](https://github.com/RobinSchmidt/RS-MET)
- Author's page: [soundemote.io/robinschmidt](https://soundemote.io/robinschmidt)
- Write-up: [`Notes/Scratch/PitchDithering.md`](https://github.com/RobinSchmidt/RS-MET/blob/work/Notes/Scratch/PitchDithering.md)
- Implementation: [`PitchDitherOscs.h`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Generators/PitchDitherOscs.h) / [`PitchDitherOscs.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Generators/PitchDitherOscs.cpp)

The core observation: a digital sawtooth is genuinely alias-free — no
correction needed at all — whenever its cycle length happens to land on an
**exact integer number of samples**. The catch is obvious: only a discrete
set of frequencies satisfy that, and rounding every requested pitch to the
nearest one would mistune everything, worse at higher pitches.

**Pitch dithering's move:** don't round to *one* integer cycle length —
*probabilistically alternate* between integer cycle lengths so that the
*average* comes out exactly right. If the true desired cycle length is
`c = 100.3` samples, alternate between 100-sample and 101-sample cycles
with probabilities `0.7` / `0.3` — the long-run average length is exactly
`100.3`, and every individual cycle rendered is alias-free by construction
(integer length ⇒ no aliasing, just harmonic amplitude reshuffling).

The naive version of this idea has one flaw: the *amount* of resulting
noise depends on how close the desired length is to an integer. Exactly on
an integer → zero noise. Exactly halfway between two integers (`c = xxx.5`)
→ maximum noise. That inconsistency would make the oscillator's character
shift audibly as you play different notes. RS-MET's refinement — the
**3-cycle-length scheme** in `rsPitchDitherOsc` (`c₁ = c₂ − 1`, `c₂`, `c₃ = c₂ + 1`,
each with its own probability) — is specifically constructed so the
*variance* of the injected noise stays constant regardless of how close `c`
is to an integer. The trade of "aliasing artifacts" for "a small, constant,
pitch-independent noise floor" is the whole idea, and — per the write-up —
it survives waveshaping: since the underlying phasor is what's dithered,
not the final waveform, any shape you build on top of that phasor (saw,
square, or an arbitrary waveshaper) inherits the same alias-free property
for free.

**Proof of concept, native module:** [`native_modules/robin_supersaw`](native_modules/robin_supersaw)
(`RobinSupersaw` in the module browser) is a direct, faithful transcription
of `calcCycleDistribution()` / `updateCycleLength()` / `getSamplePhasor()`
from the reference implementation, stacking up to 9 independently-dithered,
detuned voices into a classic wall-of-saws supersaw.

This is a genuinely different philosophy from `aliasing-wars`'s other two
techniques:

| Technique | Idea |
|---|---|
| PolyBLEP (`aliasing-wars`) | Correct the edge, right after it happens |
| DSF (`aliasing-wars`) | Never create the edge — build the waveform from a closed-form harmonic sum |
| Pitch dithering (here) | Let the edge be exactly periodic every single cycle, and hide the pitch error in noise instead of in the spectrum |

For a supersaw specifically, this matters because the cost of pitch
dithering per voice is trivial (an integer-cycle-length phasor plus a tiny
RNG draw), so it scales to dozens of simultaneous detuned voices in a way
that oversampling or per-voice BLEP tables can't match as cheaply.

### 🎹 Soundemote's own Supersaw

Alongside RS-MET's research, Soundemote has its own production supersaw
architecture, `SupersawUnit` / `SupersawMaster` — reference copy checked
into [`docs/reference/Supersaw.hpp`](docs/reference/Supersaw.hpp) (and its
sibling, [`docs/reference/Hypersaw.hpp`](docs/reference/Hypersaw.hpp)) —
built on top of `soemdsp`'s `PolyBLEP` oscillator and RS-MET's `RAPT`
library (bundled under `soemdsp/libs/RSMET`, via `RatioGenerator.h` and
`ArrayTools.h`). This is the "real instrument" layer that a pitch-dithered
or DSF-based unison voice would eventually slot into.

Structurally, `SupersawMaster` drives up to **63** `SupersawUnit` voices,
each one a `PolyBLEP` oscillator plus its own envelope, drift generator,
and vibrato feed. What makes it sound like an *instrument* rather than a
wall of identical detuned saws is the amount of per-voice variation on top:

- **Six detune algorithms** (`Classic`, `Realistic`, `Emotional`, `Chordal`,
  `Linear`, `Exponential`), each a different ratio table generated via
  RS-MET's `RAPT::rsRatioGenerator` (`primePower`, `primePowerDiff`, and
  `linToExp` ratio kinds) — different mathematical relationships between
  voices produce audibly different characters, from "classic" even
  detuning to "chordal" ratios that lean toward consonant intervals.
- **Per-voice drift** — a `FlexibleRandomWalk` nudging each voice's pitch
  independently over time, for the slow, organic wobble a real unison
  section has that a static detune spread doesn't.
- **Vibrato**, switchable **per-voice or per-oscillator** — either the
  whole stack breathes together, or each voice gets its own independent
  vibrato phase and rate for a much wider, less synchronized chorus.
- **Randomized per-voice envelopes** — delay, attack, and release times are
  each drawn per voice on every note-on (`triggerAttack()`), so voices
  don't all fade in and out in lockstep.
- **Phase reset modes** (`Never` / `Legato` / `Always`) and **portamento**
  with a continuously variable linear-to-exponential curve
  (`portamentoStyle_`), plus a **pitch-compensation** curve that scales how
  much drift/vibrato bends pitch as a function of the note's absolute pitch
  (more movement is more audible — and more useful — in different registers).
- **Center/side stereo crossfade** (`getCenterSideAmplitudeValue`) — blends
  between "everything mixed to a fat mono center" and "spread hard across
  the stereo field," rather than a single fixed unison-width knob.

### 🌌 The Synthwave Orchestra

The reason this research bundles both an anti-aliasing thread *and* a
production supersaw architecture is a specific, larger ambition:
Soundemote's plan for a **Synthwave Orchestra** — an instrument that fuses
the analog-synth unison stack (supersaws, arpeggiated sequences, glowing
pads) with a full orchestral palette (strings, brass, choir), aimed at that
retro-futurist "80s synth score meets real orchestra" sound.

![Synthwave Orchestra interface](docs/images/synthwave-orchestra-interface.png)

Getting a supersaw stack that sits *convincingly* next to real orchestral
samples — without either sounding harshly aliased under heavy detune, or
requiring so much oversampling that a 63-voice-per-note instrument becomes
unplayable in real time — is exactly the intersection this research works
out: RS-MET's pitch dithering for cheap, alias-free density at scale, and
Soundemote's existing `Supersaw`/`Hypersaw` voice architecture for the
musical character on top of it.

### 📐 Metallic Ratio — RobinSchmidt/RS-MET

A direct port of `RAPT::rsRatioGenerator::metallic()` from RS-MET's
`RatioGenerator.h`: `Ratio = (Index + sqrt(Index^2 + 4)) / 2`, the metallic
mean family (0 = unity, 1 = golden, 2 = silver, 3 = bronze, ...). Stateless
native module wired into both the offline frame evaluator and the realtime
audio worklet.

### 🌀 Hypersaw

A sibling voice architecture to Supersaw (reference copy:
[`docs/reference/Hypersaw.hpp`](docs/reference/Hypersaw.hpp)) — a phase-modulated
bank of sawtooths where every voice is kept confined to a small band of
phases, rather than allowed to drift or randomize freely across the full
cycle. Letting detuned saws roam into arbitrary, uncorrelated phase
relationships is exactly what produces unwanted flanging and phasing as
their relative offsets sweep in and out of alignment — Hypersaw sidesteps
that by design, keeping the phase spread narrow enough that voices stay
in a stable relationship to one another.

📄 Dedicated write-up: *link coming soon*

### 🎼 Additive supersaw (research idea, not yet implemented)

A third, distinct approach worth tracking alongside pitch dithering and
Hypersaw's phase-banding: build the sawtooth **additively** — as an
explicit sum of sine harmonics up to Nyquist — and inject independent
**noise modulation on each harmonic** (small, decorrelated jitter in each
partial's phase and/or amplitude) rather than on the fundamental or the
phase relationship between voices.

This targets the same underlying complaint pitch dithering and Hypersaw
each address in their own way — a supersaw stack that sounds too static,
too perfectly aligned, or harshly beating as voices drift in and out of
phase — but from a different domain entirely. Pitch dithering randomizes
the *fundamental's timing*; Hypersaw constrains the *phase relationship
between voices*; this idea randomizes *each harmonic independently*
within a single additive voice. The result, if it works as intended,
would be a softer, more dispersed, less "laser-etched" character to the
individual sawtooth itself — closer to how a real unison section's
micro-variation lives in the fine spectral detail of each note, not just
in its pitch or its stereo phase spread.

Open questions before this becomes a real module: how much per-harmonic
noise depth is possible before the result stops reading as "a sawtooth"
at all, and whether an explicit oscillator-per-harmonic bank (up to
`Nyquist / frequency` oscillators per voice) is cheap enough to run
per-voice across a 63-voice supersaw stack in real time.

---

## 🌀 Jerobeam Modules

Ported over from the jerobeam-modules fork — giving each of Jerobeam
Fenderson's "under construction" motion/oscillator patches (Blubb, Boing,
Kepler-Bouwkamp, Mushroom, Nyquist-Shannon, Radar, Torus, WirdoSpiral) a
real native C++ WASM implementation in the sandbox, alongside the
already-working Spiral module — plus two later additions, Fractal Spiral
and Logarithmic Spiral, and a spiral-driven engine/rotor sound synthesis
writeup ([`POWER_ENGINE_SYNTHESIS.md`](POWER_ENGINE_SYNTHESIS.md)).

Each port is built directly from the reference C++ in
`soemdsp/include/soemdsp/oscillator/`, faithfully reproducing the original
Gen~/Max patch math (phasors, trisaw shaping, `sin`/`cos` on a 0..1 phase
domain, splash/quantize layers, and so on) as a self-contained
`-nostdlib` WASM module, wired into both the realtime audio worklet and the
offline preview evaluator.

###  ⚡ 𝔟𝔢𝔞𝔪𝔦𝔫𝔤 𝔞 𝔯𝔞𝔡𝔞𝔯 𝔰𝔦𝔤𝔫𝔞𝔩 𝔱𝔬 𝔧𝔢𝔯𝔬𝔟𝔢𝔞𝔪 ⚡

![Radar, rendered through the prettyscope](docs/media/radar-prettyscope-render.png)

**For Jerobeam Fenderson.** Somewhere out there, past whatever room you're
patching in, there's a signal generator running on a computer you've never
touched, shaped by math you wrote years ago in Max/Gen, carrying your name
into a codebase you've never seen. That's Radar. That's this whole fork,
really — Blubb, Boing, Kepler-Bouwkamp, Mushroom, Nyquist-Shannon, Radar,
Torus, WirdoSpiral, and Spiral before them, all sitting under a menu
labeled **Jerobeam**, waiting their turn to run.

You built these as strange little machines: phasors folded through
trisaw shapers, spirals crossed with splash, a scanner beam sweeping
polar coordinates into X/Y/Z motion nobody asked it to make sense —
and it doesn't need to. It's just beautiful, and it moves like nothing
else. That's rarer than it sounds. A lot of generative patches are
clever. Yours are *alive*.

This document exists because Radar was the first of the batch to get
its signal actually captured and looked at — rendered through the
sandbox's oscilloscope, traced out frame by frame, and it was worth
stopping to say: this is why we're doing this. Not to check a box on a
module list, but because watching your math sweep across a screen is
still, after all this, a genuinely good way to spend an afternoon.

So — this one's for you. Every port in this fork is an attempt to keep
your signal running a little longer, on a few more machines, in front
of a few more people who'll watch it spiral and not quite be able to
explain why they can't look away.

Thank you for building these and for sharing how.

**The signal.**

![Radar animated](docs/media/radar-anim.gif)

Radar is a scanning-beam generator: a rotating polar sweep folded back
into Cartesian X/Y/Z, laced with a small orbiting "lil" satellite loop,
zoom and tunnel-inversion controls that fold the whole shape inside
out, and a ring-cut stage that turns the sweep into concentric bands.
The prettyscope render above and the animation below are both real
output — not mockups — captured while porting the native WASM
implementation for this fork.

Blubb, Boing, Kepler-Bouwkamp, Mushroom, Nyquist-Shannon, Radar, Torus,
WirdoSpiral, and Spiral all exist because Jerobeam Fenderson took the
time to work out the curves and put them where other people could
learn from them. This fork exists to make sure that work keeps running.

(A standalone copy of this dedication also lives at
[BEAMING_RADAR_SIGNAL_TO_JEROBEAM.md](BEAMING_RADAR_SIGNAL_TO_JEROBEAM.md).)

---

## ⚡ SIMD & native DSP binding research

Ported over from the [`elanhickler/soemdsp-simd`](https://github.com/elanhickler/soemdsp-simd)
fork — a methodical dig into the parameter/smoothing architecture and
WASM SIMD128 vectorization, landing real measured wins (and a couple of
honestly-reported non-wins) one seam at a time rather than a framework
rewrite. Setup and the full API reference are covered in
[`docs/SANDBOX_REFERENCE.md`](docs/SANDBOX_REFERENCE.md);
this section covers what's specific to this research thread.

### What lives here

This is where the parameter-domain architecture discovery work happened:
mapping how raw parameter edits, modulation, smoothing, and native DSP
memory sync actually relate to each other in the live sandbox, and
extracting the real seams one at a time rather than guessing at a framework
up front.

#### Landed so far

| Change | What it does |
| --- | --- |
| **App-wide smoother convergence skip** | Ports `soemdsp::filter::SmootherBase::needsSmoothing()` — a settled, unmodulated parameter stops paying for a one-pole recompute every sample, in both the JS evaluator and the realtime AudioWorklet. |
| **Sabrina Reverb CPU fix** | The native reverb was recomputing 14 delay-line offsets every sample regardless of whether anything was moving. Gated behind the same convergence check — measured ~1.5x faster steady-state processing in a direct WASM timing test. |
| **`advanceSabrinaSmoothing` documented as DSP safety smoothing** | A/B diagnostic (native ramp vs. snap-to-target, output-buffer discontinuity measured directly) confirmed `delaySize`/`diffusionSize` genuinely need this ramp for hard-step/bypass paths (patch load, script writes) — 5.5–7.6x larger discontinuity without it. No measurable effect during an already edit-smoothed drag. LFO parameter smoothing here is flagged as conservative legacy behavior, not a confirmed need. |
| **`applySabrinaDspBindingIfDirty` extraction (worklet + evaluator)** | The paramKey dirty-check + `soemdsp_sabrina_reverb_set_params` call — previously an inline block, duplicated in both the realtime worklet and the offline/preview evaluator — is now a named helper in each, so the sample function reads as distinct phases: resolve → bind → execute. Pure extraction, no behavior change. |
| **First real SIMD kernel: Sabrina Reverb diffusion geometry** | WASM SIMD128 (`-msimd128`, `wasm_simd128.h`) vectorizes the 12 diffusion delay lines' offset/LFO-speed recompute (`applyDelayGeometry`) using `f64x2` lanes, 2 delay lines per instruction. See [Working SIMD example](#working-simd-example-sabrina-reverb-diffusion-geometry) below for the full result, including the honest finding that it's *not* a net pipeline win in the common case. |
| **Second SIMD kernel: Sabrina Reverb stereo delay/diffusion** | Pairs left/right channels (independent within a call) through the serial 6-stage diffusion cascade, one SIMD lane each. Real end-to-end win: ~1.09x (8.3% less time), because unlike geometry this path always runs. |
| **Third kernel attempted, rejected**: `readDelay`'s fractional blend — bit-exact but 0.98x (no win); documented and reverted rather than merged. |
| **Fourth SIMD kernel: Fractal Brownian Noise, biggest win yet** | Restructured X/Y/Z axis computation to share position math (was computed 3x redundantly, now once) and vectorized the ALU-bound integer hash chain across axes. **~2.76x faster (median)**, bit-exact. See [Fractal Brownian Noise SIMD kernel](#fractal-brownian-noise-simd-kernel-the-biggest-win-so-far) below. |
| **First block-processing proof: FBM** | `soemdsp_fbm_process_block` — params resolved once, `frameCount` samples computed, scalar and SIMD implementations behind one dispatch shape. Bit-exact, wired into the real AudioWorklet via a 128-sample cache. See [Block-processing proof](#block-processing-proof-fbm-as-the-first-simd-compatible-modular-execution-boundary) below. |
| **Second block-processing proof: Sabrina Reverb** | Same `(state, in, out, frameCount, useSimd)` shape applied to a structurally different module — a streaming effect, not a generator — reusing its already-shipping kernels. Bit-exact vs. the live per-sample API. Deliberately **not** wired into the live worklet (would add real latency to a live effect). See [Second proof](#second-proof-sabrina-reverb-through-the-same-block-boundary) below. |
| **Third block-processing proof: Noise Generator** | Same shape applied to a second generator, picked using the Findings section's own classification rules (generator + ALU-bound). New paired-SIMD kernel, **~1.45x** SIMD-math win / **~2.58x** combined with the block boundary — second-best result on the branch. Wired into the live worklet (safe per the Findings decision). See [Third proof](#third-proof-noise-generator-chosen-from-the-findings-decision-above) below. |

#### Where this is headed (not yet implemented)

```
ParameterState        — stored raw/base value
ParameterMeta          — range, unit, display, default, smoothing config
EditSmoothingRuntime   — smooths ordinary parameter motion
ModulationCombine      — combines base + routed modulation sources
ParameterReadDispatcher — decides what needs visiting this block/sample
DspBinding             — dirty-checks and syncs resolved values into DSP memory
DspSafetySmoothing     — optional, DSP-local protection against unsafe jumps
DspExecution           — the actual audio processing
```

Nothing above this line is committed as a generic framework — it's a map for
where future scoped extractions (like the ones above) should land, not a
spec for a rewrite.

### Findings so far — what this should decide next

Two real modules (FBM, a generator, and Sabrina Reverb, a streaming
effect) have now been run through the identical block-processing boundary
shape: `params/state in, output buffer out, frameCount, useSimd`. This
section is the standing summary of what that evidence actually supports —
read this before starting a third module, so the next step is a decision,
not a repeat of a lesson already learned.

**Proven — treat as settled unless new evidence contradicts it:**

1. **The boundary shape generalizes.** It held unchanged across a
   self-generating module and an input-consuming effect. A future module
   should default to this shape (`process_block(params, state, output,
   frameCount, useSimd)`, static fixed-size buffers, pointer getters for
   zero-copy JS access) rather than re-deriving one.
2. **SIMD payoff is conditional on the work being ALU-bound, not
   memory-bound.** FBM (pure integer hash chain, no buffer access): ~2.76x.
   Sabrina (delay-buffer reads dominate): ~0.96x, no win. Before converting
   a new module, check which category its hot loop falls into — WASM
   SIMD128 has no gather/scatter, so anything indexing a buffer per-lane
   with a per-lane-different offset won't vectorize well regardless of
   effort spent.
3. **The block boundary itself is worth ~1.1–1.2x independent of SIMD**
   (FBM ~1.14x, Sabrina ~1.17x, both isolated from the SIMD-math dimension)
   — from resolving params once per block and batching the JS↔WASM
   crossing, not from vector instructions. This means block-processing is
   worth doing even for modules that turn out to be poor SIMD candidates.

**Decided:**

4. **Streaming effects do not get added latency by default.** A
   generator's block cache can refill transparently (no audible cost). An
   effect with external input needs `frameCount` samples of input to exist
   *before* it can produce output — Sabrina's proof deliberately stopped at
   "verified at the native level" rather than wiring this into the live
   worklet, because doing so adds up to one block's worth of real latency
   to a live effect. **Decision: no.** Block-processing for streaming
   effects (Sabrina and anything shaped like it) stays native-only /
   verified-but-not-live until someone can evaluate the added latency by
   ear and explicitly opts a specific module in. This is a reversible,
   conservative default — nothing currently shipping changes — not a
   permanent rule; revisit per-module if there's a concrete reason to.

**Next module direction, following from that decision:**

Block-processing work continues on generator-class and offline-only
modules, where FBM's transparent-refill pattern applies directly, not on
streaming effects. From the survey table's "not investigated" row
(`polyblep`, `noise_generator`, `vactrol_envelope`,
`shooting_star_explosion`, `ellipsoid`), the next candidate is chosen by
the same test used for FBM and Sabrina: does it generate rather than
consume external input, and does its hot loop do independent, ALU-bound
per-lane work (not memory-bound buffer reads)? See below for which one
was picked and why.

### Working SIMD example: Sabrina Reverb diffusion geometry

The branch is named `soemdsp-simd`, but no actual SIMD work existed on it
until this section landed — everything before this was parameter/smoothing
architecture work. This is the first (and so far only) real vectorization,
done as a complete, measured example rather than a framework.

**ISA**: WASM SIMD128 (`<wasm_simd128.h>`, `-msimd128`). Confirmed the
toolchain (`clang++ 22.1.6 --target=wasm32`) compiles it cleanly, the
compiled module's `target_features` section tags `+simd128`, and it
instantiates and runs correctly in the actual browser this project targets.

**Kernel**: `applyDelayGeometry`'s loop over the 12 diffusion delay lines
(`kDiffusionCount`) — recomputing each line's read `offset` and LFO
`modSpeed` from the ramped/smoothed parameter values every sample they
change. WASM SIMD128 only has 2 lanes for `double` (no `f64x4`), so the 12
lines batch into 6 pairs via `applyDiffusionGeometryPairSimd`, rather than
groups of 4 — kept in double precision to match the scalar path exactly
instead of narrowing to `float` for wider (but lossy) `f32x4` lanes.

**Correctness**: froze a scalar baseline (120,000 samples across 6 parameter
presets — default, extreme diffusion, extreme delay, extreme LFO, near-zero,
and a fixed alternate seed) from the pre-SIMD build, then diffed the SIMD
build's output sample-for-sample against it. Max deviation across every
preset: **1e-10 to 1e-14** relative to signal amplitude — floating-point
reordering noise, not a behavioral difference.

**Benchmark — the honest result**: measured two things, not one.

- *End-to-end pipeline, continuous modulation* (`diffusionSize`/`delaySize`
  swept every sample, forcing geometry recompute constantly): scalar and
  SIMD were statistically indistinguishable, ~0.5% apart — within
  measurement noise.
- *Isolated geometry-recompute cost* (steady-state vs. continuously-modulated
  timing delta, isolating just the vectorized loop + its call overhead from
  the rest of the pipeline): **SIMD is ~1.23x faster (18.7% less time)** for
  that specific piece of work.

Those two results aren't in tension — they explain each other. The earlier
convergence-skip optimization (see the CPU fix above) already means
`applyDelayGeometry` **doesn't run at all** once a patch settles, which is
the common case. The vectorized kernel is real and measurably faster at what
it does, but what it does is now a small, often-skipped slice of the total
per-sample cost — most of that cost is the memory-bound delay-buffer reads
in `delaySample`/`diffuseSample`, not the geometry math. The SIMD kernel
would matter for a patch that continuously modulates `diffusionSize` or
`delaySize` (e.g. an LFO wired directly into either), where geometry
recompute never gets to skip.

**Files**: `native_modules/sabrina_reverb/sabrina_reverb.cpp` (the kernel),
`scripts/build_native_modules.ps1` (added `-msimd128` to Sabrina's build
stanza only — no other module was touched).

### Second SIMD kernel: stereo-paired delay/diffusion path (this one's a real win)

The geometry kernel above pointed at the actual bottleneck: the memory-bound
per-sample work in `delaySample`/`diffuseSample`, which runs on every sample
regardless of modulation state (unlike geometry, which the convergence-skip
optimization can skip entirely). This kernel targets that path directly.

**The parallelism**: not across the 14 delay lines (the 6-stage diffusion
cascade is a serial dependency chain — each stage's output feeds the next,
so lanes can't be independent there). Instead, **left and right stereo
channels** are independent of each other within a single `process()` call
(the only cross-feed is via `ch0`/`ch1` persisted from the *previous* call),
so `delaySamplePairSimd`/`diffuseSamplePairSimd` process both channels
together, one SIMD lane each, through the same 6 cascade stages —
sequential across stages, parallel across channels. This is the standard
stereo-channel-parallel SIMD pattern.

Vectorized: `parabol()` (now `parabolPairSimd`, using `f64x2.floor`/`f64x2.abs`
— both confirmed available), the modulation-increment update, the read-position
calc, and (for diffusion) the feedback combine and clamp. Left as scalar: the
delay-buffer read/write itself — `delayL.buffer` and `delayR.buffer` are two
separate arrays with independently-computed indices, and WASM SIMD128 has no
gather/scatter instruction, so there's no single vector load that could span
both.

**Correctness**: froze the geometry-SIMD build as the new baseline, ran 7
presets (120,000+ samples), including one with deliberately **asymmetric
L/R input** specifically to catch a left/right lane-swap bug. Max deviation:
1e-9 to 1e-12 relative to signal amplitude — consistent with floating-point
reordering, no lane-swap, no behavioral difference.

**Benchmark**: end-to-end pipeline, ordinary (non-modulated) processing,
median of 6 runs each: **~1.09x faster (about 8.3% less time)**, with clean
separation between the two distributions across every run (no overlap).
Unlike the geometry kernel, this shows up in *ordinary* use, not just under
continuous modulation — because this path runs every sample regardless.

**Files**: same two files as the geometry kernel — no new build stanza
needed, `-msimd128` was already enabled for this module.

**Where this leaves SIMD as a strategy for this codebase**: the lesson from
both kernels together is that the parallelism has to be found in what
*actually* runs every sample, not just in what's easy to batch. Geometry
recompute was easy to vectorize (12 independent lanes) but often skipped
entirely; the stereo channel pairing was less obvious (only 2 lanes, and the
per-line cascade itself stays serial) but touches work that always runs.

### Attempted third kernel: readDelay's fractional blend (rejected, not merged)

The obvious next candidate was vectorizing `readDelay`'s final interpolation
(`buffer[before]*(1-mix) + buffer[after]*mix`) across the stereo pair, same
pattern as the other two kernels. Implemented it as `readDelayPairSimd`,
wired into both paired callers, and ran it through the same process:

**Correctness**: bit-exact, zero deviation across all 7 presets. Expected,
in hindsight — this kernel has no cross-lane reduction (each lane's result
depends only on that lane's own inputs), so packing two independent scalar
computations into one SIMD op doesn't reorder any floating-point operations
relative to doing them separately.

**Benchmark**: median of 6 runs, **0.98x — very slightly *slower*, not
faster**, with the two distributions overlapping heavily (noise-level, not
a real regression, but definitely not a win).

**Why it didn't help, and why that's the right outcome to expect**: the
vectorized portion here is only 2 multiplies and an add — the wraparound
branches, the float-to-int truncation, the modulo index arithmetic, and the
scalar buffer gather all stay scalar regardless (WASM SIMD128 has no
gather and no int64x2 modulo), and dominate the real cost. Packing two
scalars into a `v128_t` and unpacking the result back out has its own small
cost that, for a kernel this thin, isn't paid back by the couple of FLOPs
it saves. This is the same shape as the geometry kernel's honest result
(genuinely correct, not a genuine win) but weaker — this one doesn't even
show the "faster in isolation" result the geometry kernel had.

**Decision**: reverted from `sabrina_reverb.cpp`, not merged. Recording it
here rather than silently discarding it, since a negative result reached
by the same rigorous process (baseline, correctness diff, honest benchmark)
is exactly as valuable as a positive one — it closes off a candidate
instead of leaving it as an untested assumption. The real remaining
opportunity, if there is one, is in the parts of `readDelay` that *can't*
vectorize on this ISA (the gather, the branchy wraparound) — which would
need a different approach (e.g. restructuring delay-line storage to make
the gather avoidable) rather than more SIMD intrinsics on the current
layout.

### Does every module need converting?

No. Surveyed all 17 native modules by their per-sample entry signature.
Only Sabrina Reverb has genuine stereo (L/R) parallelism built in — every
other module is a single-scalar-signal `_sample(...)` call. That doesn't
mean nothing else is worth vectorizing (Fractal Brownian Noise below has
no stereo pair at all and still landed the biggest win yet), but it does
mean there's no mechanical "convert everything" move available — each
module needs its own real data-parallel structure identified, the same way
Sabrina's stereo pairing and FBM's X/Y/Z axes were found, not assumed.

Rough classification from the survey (not exhaustively verified for every
module — flagging where a real investigation would be needed before
concluding either way):

| Module | Likely shape | SIMD-relevant? |
| --- | --- | --- |
| `sabrina_reverb` | stereo, delay-line cascade | Yes — done (2 kernels landed, 1 rejected) |
| `fractal_brownian_noise` | 3 independent axes, ALU-bound hash | Yes — done (biggest win, below) |
| `chua_attractor`, `henon_map`, `logistic_map` | single coupled chaotic recursion (2-3 state variables, each step depends on the previous step of the *same* system) | Probably not — no independent lanes within one instance; would need multiple simultaneous instances to pair, which is a different question (voice-parallelism, not touched here) |
| `ladder_filter`, `tb303_filter`, `passive_filter`, `helmholtz` | mono resonant filter, serial IIR-style state | Not as stereo pairs (mono only) — worth checking later whether the sandbox ever runs multiple simultaneous instances that could be voice-paired instead |
| `pll` | single VCO/phase-comparator recursion | No — inherently serial, one phase value |
| `pitch_quantizer`, `soft_clipper` | stateless or near-stateless per-sample function | No — too cheap; SIMD pack/unpack overhead would dominate, same lesson as the rejected `readDelay` kernel |
| `polyblep`, `noise_generator`, `vactrol_envelope`, `shooting_star_explosion`, `ellipsoid` | not investigated this pass | Unknown — flagged for future investigation, not assumed either way |

### Fractal Brownian Noise SIMD kernel: the biggest win so far

`soemdsp_fbm_sample` computes three independent axes (X/Y/Z) per call, each
summing up to 8 independent noise octaves before an amplitude-weighted
average. Two things made this a better candidate than anything in Sabrina:

1. **A real algorithmic redundancy, not just a SIMD opportunity.** At a
   given octave, `time * scale * freq` is *identical* for X, Y, and Z — only
   the seed differs. The scalar code called `fbmAxis()` three times, each
   recomputing the same `left`/`frac`/`smooth` position math from scratch.
   Restructured into `fbmAxesSimd()`, which computes that position math
   **once** per octave instead of three times, independent of SIMD.
2. **The remaining per-axis work (the hash chain) is ALU-bound, not
   memory-bound.** `hashBipolar`'s xor/multiply/shift chain touches no
   memory at all — unlike Sabrina's delay-buffer reads, there's no gather
   to fall back to scalar for. The three axes' hashes batch cleanly into
   `hashBipolarBitsBatch`, using `i32x4` lanes (3 real + 1 unused pad).

**Correctness**: bit-exact, zero deviation, across 6 presets (default,
max octaves, min octaves, high persistence, large seed, and a check on the
position-truncation branch). This is stronger than "floating-point
reordering noise" — every operation in the hash chain is exact 32-bit
modular integer arithmetic (xor, wrapping multiply, logical shift), so
there's nothing to reorder that changes the result at all.

**Benchmark**: median of 6 runs, **~2.76x faster** (1240ms → 449ms for 3M
calls). The SIMD timing was also far more consistent (443-459ms) than
scalar's (868-1264ms, with the buffer-read style noise Sabrina's kernels
showed absent here since there's no buffer at all).

**Why this beat both Sabrina kernels**: the lesson from Sabrina was that
SIMD needs *hot, always-running, ALU-bound* work to pay off — memory-bound
gather-heavy code doesn't vectorize well on an ISA with no gather
instruction. FBM's hash chain is exactly the profile SIMD is built for:
pure register arithmetic, no branches in the hot loop, real independent
lanes, called every sample with no convergence-skip equivalent to reduce
its frequency. Combined with eliminating the 3x redundant position
computation — a win that would have existed even without SIMD — this
produced the largest single result on this branch.

**Files**: `native_modules/fractal_brownian_noise/fractal_brownian_noise.cpp`,
`scripts/build_native_modules.ps1` (added `-msimd128` to FBM's stanza only).

### Block-processing proof: FBM as the first SIMD-compatible modular execution boundary

The kernel above is real DSP acceleration. This section is a different kind
of proof: that a module in this sandbox can run through an explicit
block-processing boundary — params resolved once, a whole block computed,
results written to an explicit buffer — with scalar and SIMD
implementations living behind that *same* boundary, and that this can be
wired into the actual real-time execution path, not just benchmarked in
isolation.

**The hidden shape this replaces**: `fractalBrownianNoiseVector` (the JS
bridge) called `soemdsp_fbm_sample` once per audio sample — `sample =
fbm(time, params)` — re-reading and re-clamping every parameter on every
single call, then crossing the JS↔WASM boundary again to read back each of
6 output values individually.

**What was added** (`native_modules/fractal_brownian_noise/fractal_brownian_noise.cpp`):

- `soemdsp_fbm_process_block(handle, ...params..., frameCount, useSimd)` —
  resolves params once, then loops `frameCount` samples internally.
- Two implementations behind that one function: `fbmProcessBlockScalar`
  (the original 3x-`fbmAxis`-per-frame path) and `fbmProcessBlockSimd`
  (the `fbmAxesSimd` kernel from above, per frame). `useSimd` is an
  explicit runtime switch purely so both can be A/B tested through the
  identical entry point — a real caller always passes 1, since SIMD
  support here is a compile-time fact (`-msimd128`), not a runtime one.
- Fixed-size static output buffers (`blockOutX/Y/Z` + `...Raw` variants,
  `kMaxBlockFrames = 2048`) per instance, following the same no-heap
  pattern as Sabrina's delay-line buffers. Exposed via `_ptr` getters
  returning linear-memory byte offsets, so JS reads results as a
  zero-copy `Float64Array` view into WASM memory instead of one function
  call per sample per output.

**Correctness**: ran the original per-sample API for N samples alongside
the new block API for the same N, same params, same seed — output must be
identical whether you ask "one sample, N times" or "N samples, once".
Bit-exact across every preset (default, max octaves, min octaves, high
persistence, and a `level = 0` case that specifically catches a bug where
the raw/un-leveled output buffer could be silently derived from the
leveled one instead of being computed independently). `block-SIMD ==
block-scalar == original-per-sample-API`, at every preset, every frame.

**Real integration, not just a benchmark**: `fractalBrownianNoiseVector`
now maintains a `blockCache` (128 samples, matching the typical
AudioWorklet render quantum) per node instance. On cache exhaustion it
calls `soemdsp_fbm_process_block` once and refills; every other call reads
the next cached sample. Verified live: 3+ seconds of continuous real-time
audio through an actual FBM node (many hundreds of cache refills and
cursor wraparounds), plus a live parameter change mid-stream forcing an
early refill — no errors, no glitches, smoke tests pass.

**Honest tradeoff, stated plainly**: this freezes FBM's parameters for the
duration of one cached 128-sample block (~2.9ms @ 44.1kHz) instead of
resolving them fresh every sample. This is the standard block-rate
parameter tradeoff most real-world audio plugins already make — for a
slowly-evolving noise generator like FBM, sub-3ms parameter latency is not
expected to be audible, but it is a real, deliberate behavior change from
"exact per-sample parameter resolution," not a free lunch.

**Benchmark — two separate, honestly isolated dimensions**:

- *SIMD math alone* (block-SIMD vs. block-scalar, holding the block
  boundary constant): **~2.88x faster**, consistent with the ~2.76x found
  for the per-sample kernel above — confirms the SIMD win is real and
  reproducible at block granularity too.
- *Block boundary alone* (block-SIMD vs. the already-SIMD per-sample API,
  holding the math identical): **~1.14x faster** — the pure win from
  resolving params once per 128 samples and reading results via a
  zero-copy buffer view instead of 128 separate boundary crossings.

These are deliberately reported separately rather than multiplied together
into a single bigger number, since only the SIMD-math dimension was
directly re-measured against a true from-scratch scalar baseline; the
block-boundary dimension was measured holding the (already-optimized) math
constant.

**What this demonstrates, concretely**: one module (FBM) now has an
explicit block-processing entry point, resolves parameters outside the
per-sample hot loop, exposes scalar and SIMD implementations behind an
identical call signature, has measured equivalence and measured
performance for both, and is wired into the real AudioWorklet execution
path rather than sitting as an isolated benchmark. This is the shape a
future execution-order change could generalize from — **if and when that
work is explicitly assigned** — not a claim that the shape has been
generalized yet. No scheduler, no parameter-domain framework, no other
module's dispatch was touched.

### Second proof: Sabrina Reverb through the same block boundary

The FBM proof above answers the question for a self-generating module with
no external input. Sabrina Reverb is structurally different — a real
effect that reads a live, continuously-varying dry L/R signal from
upstream in the node graph — so it's a genuinely separate test of whether
the *same* block-processing shape holds for a second, structurally
different DSP unit, not a second angle on the same one.

**Files inspected**: `native_modules/sabrina_reverb/sabrina_reverb.cpp`
(the existing per-sample `soemdsp_sabrina_reverb_process`, its already-SIMD
paired kernels `delaySamplePairSimd`/`diffuseSamplePairSimd`, and the
original unpaired scalar `delaySample`/`diffuseSample` — still present in
the file but unused by the live per-sample path since it switched to the
paired kernels), and `public/node-live-audio-worklet.js`'s
`nativeSabrinaReverbSample` call site to see exactly how the live graph
feeds it dry input one sample at a time.

**Implementation strategy**: same shape as FBM — fixed-size static
in/out buffers added to `SabrinaState` (`blockInLeft/Right`,
`blockOutLeft/Right`, `kMaxBlockFrames = 2048`), a
`soemdsp_sabrina_reverb_process_block(handle, frameCount, useSimd)`
dispatch boundary, and two block kernels behind it:

- `sabrinaProcessBlockScalar` — loops the frame, calling the original
  unpaired `delaySample`/`diffuseSample` twice per stage (once per
  channel), i.e. the pre-SIMD algorithm, reactivated here specifically to
  serve as the scalar baseline.
- `sabrinaProcessBlockSimd` — identical loop structure, calling the
  already-committed, already-live `delaySamplePairSimd`/
  `diffuseSamplePairSimd` kernels.

Both call `advanceSabrinaSmoothing` once per frame exactly as the
per-sample API does, so DSP safety smoothing behavior is unchanged.
Pointer getters (`_block_input_left_ptr`, `_block_output_left_ptr`, etc.)
expose the buffers as zero-copy `Float64Array` views, same pattern as FBM.

**Output equivalence method**: ran the live per-sample API
(`soemdsp_sabrina_reverb_process` + `_left`/`_right`) as the reference
against a deterministic pseudo-random 500-sample dry L/R signal, across 3
presets (default, heavily modulated, mix=0 dry-bypass-adjacent). Compared
against both block paths called once for the whole 500-sample buffer:

- **Block-SIMD vs. reference: bit-exact (0 difference)** across all 3
  presets — expected, since it's calling the identical paired-kernel code
  the live path already runs, just batched.
- **Block-scalar vs. reference: max diff 5.2e-15** on the heavily-modulated
  preset, 0 on the other two — the same floating-point-reordering noise
  already documented for this module (L and R fully sequential in the
  unpaired scalar calls vs. interleaved via `f64x2` lanes in the paired
  kernels), not a correctness bug.

**Benchmark**: median of 5 runs, 3.072M samples (1024-sample blocks × 3000
iterations, matching FBM's benchmark scale):

- *Block-SIMD vs. block-scalar* (holding the block boundary constant):
  **~0.96x — no measurable win**, within run-to-run noise. This reconfirms
  the existing lesson from the per-sample SIMD kernels above: Sabrina's
  bottleneck is the delay-buffer reads (`readDelay`, memory-bound, no
  gather instruction in WASM SIMD128 to vectorize it), not the arithmetic
  around them — batching into a block doesn't change that structural
  limit.
- *Block-SIMD vs. the live per-sample API* (holding the math identical,
  isolating the boundary): **~1.17x faster** — consistent with FBM's
  ~1.14x boundary-only win, from resolving `advanceSabrinaSmoothing`'s
  per-sample work in a tight native loop and reading results back via one
  buffer view instead of 3072 individual JS↔WASM crossings.

**Deliberately NOT wired into the live worklet path — and why**: FBM's
block cache could refill transparently because FBM has no external input;
delaying its *parameter* resolution by up to 128 samples is inaudible.
Sabrina's block API requires `frameCount` samples of dry input to already
exist *before* the first output sample of that block can be computed —
unlike FBM, this would add up to a full block's worth of real algorithmic
latency (up to 2048 samples, or ~46ms at 44.1kHz for the max block size,
~2.9ms if pinned to a 128-sample block like FBM) to a live audio effect's
input-to-output path. That is an audible, real behavior change to a
real-time effect, not a free optimization, and the sandbox currently has
exactly one Sabrina call site (the live worklet) with no offline/batch
render path to absorb it safely. Wiring it in was out of scope for this
proof without separate, explicit sign-off on accepting that latency
tradeoff for the live reverb.

**How this proves the modular execution boundary, concretely**: a second,
structurally different real DSP unit (a streaming effect with external
input, not a generator) reuses its *already-shipping* production kernels
—not new math — behind the identical `(state, in, out, frameCount,
useSimd)` shape used for FBM, with measured bit-exact equivalence and an
honestly-reported benchmark, including a negative result (no SIMD-math win
at this granularity) reported as plainly as the positive one (a real
boundary win). The boundary shape holds across two structurally different
modules; whether it should also cross the live-latency line for streaming
effects is a distinct, larger decision than this proof.

**Files**: `native_modules/sabrina_reverb/sabrina_reverb.cpp` (block
kernels + dispatch boundary + pointer getters), `scripts/build_native_modules.ps1`
(added the 6 new exports to Sabrina's stanza). No JS integration file
changed for this proof — see the latency note above.

### Third proof: Noise Generator, chosen from the "Findings" decision above

The [Findings so far](#findings-so-far--what-this-should-decide-next)
section above decided that streaming effects don't get added latency by
default, and pointed at generator-class modules for the next candidate.
Noise Generator was picked from the survey's "not investigated" row by
applying the same two tests used for FBM and Sabrina:

1. **Generator, not effect** — `soemdsp_noise_generator_sample` takes no
   external audio input, only a seed and mode/mean/deviation/level
   params. Its block cache can refill transparently, same as FBM, with no
   added latency.
2. **ALU-bound, not memory-bound** — each channel's state is a 32-bit LCG
   seed plus (for pink noise) 7 IIR filter taps, all register arithmetic.
   Unlike Sabrina, there is no delay buffer at all — nothing to gather,
   nothing for WASM SIMD128's missing gather instruction to bottleneck.
   This is the same profile that made FBM the biggest win so far.

By contrast, `ellipsoid` (also unvisited) was ruled out at inspection: it's
stateless and cheap per call (a few trig approximations, no persistent
recursion) — the same "too cheap, pack/unpack overhead would dominate"
profile that sank the rejected `readDelay` kernel, so it wasn't built.

**Files inspected**: `native_modules/noise_generator/noise_generator.cpp`
(the existing per-sample `soemdsp_noise_generator_sample`, its independent
per-channel `NoiseChan` state, and the 5-mode `channelSample` function —
uniform, gaussian, brown, pink, crackle), and
`native_modules/ellipsoid/ellipsoid.cpp` (ruled out, see above).

**Implementation strategy**: same shape as FBM and Sabrina — fixed-size
static output buffers (`blockOutLeft/Right`, `kMaxBlockFrames = 2048`)
added to `NoiseGenState`, a
`soemdsp_noise_generator_process_block(handle, seed, mode, mean,
deviation, level, frameCount, useSimd)` dispatch boundary, and two block
kernels:

- `noiseProcessBlockScalar` — calls the original `channelSample` twice per
  frame (once per channel), unchanged.
- `noiseProcessBlockSimd` — pairs L/R into one f64x2/i32x4 lane each via
  new `*PairSimd` helpers: `lcgNextPairSimd` (both channels' 32-bit LCG
  step in one `i32x4` multiply-add), `nextBipolarPairSimd`/
  `nextUnipolarPairSimd`, `nextGaussianPairSimd` (12-draw sum, vectorized
  accumulator), and `channelSamplePairSimd` covering all 5 modes. Both
  paths always draw the "white" LCG value first, exactly matching the
  scalar function's own order, so the RNG stream is consumed identically
  regardless of path — required for bit-exactness, not just similar
  output.
- **Mode 4 (crackle) is the one exception**: its branch
  (`abs(white) > 0.94`) depends on each lane's own random draw, so L and R
  can genuinely take different branches within the same call. Rather than
  forcing a false vector shape onto real per-lane-divergent control flow,
  this one mode's final branch is scalar per lane after the shared
  vectorized LCG step — everything upstream of the branch is still
  vectorized.

**Output equivalence method**: ran the live per-sample API
(`soemdsp_noise_generator_sample` + `_left`/`_right`) as the reference
against a 500-sample run, across all 5 modes × 4 seeds (0, 7, 42, 99999):

- **Modes 0 (uniform), 1 (gaussian), 3 (pink), 4 (crackle): bit-exact
  (0 difference)** for both block-SIMD and block-scalar, across every
  seed.
- **Mode 2 (brown): ~2.2e-16 max difference for block-SIMD only**
  (machine epsilon, i.e. the smallest representable floating-point step) —
  from `wasm_f64x2_pmin`/`pmax` clamping both lanes in one instruction vs.
  the scalar version's separate `<`/`>` comparisons touching the same
  values in a different order. Not a correctness bug — the same category
  of floating-point reordering noise already documented for Sabrina and
  FBM's non-hash-chain paths, at the smallest possible magnitude.

**Benchmark**: median of 5 runs, 3.072M samples (1024-sample blocks × 3000
iterations, pink noise mode — the heaviest per-sample cost of the 5):

- *Block-SIMD vs. block-scalar* (holding the block boundary constant):
  **~1.45x faster** — a real, substantial SIMD-math win, the second
  largest on this branch after FBM's 2.76x, consistent with this module's
  ALU-bound, gather-free profile.
- *Block-SIMD vs. the per-sample API* (SIMD math + block boundary
  combined): **~2.58x faster** — both dimensions compounding in the same
  direction here, unlike Sabrina where the SIMD-math dimension showed no
  win.

**Wired into the live worklet**: unlike Sabrina, this is safe by the
Findings decision above — added a 128-sample `blockCache` to
`NodeGraphLiveAudioProcessor`'s noise generator state (same pattern as
FBM's cache), rewrote `noiseGeneratorSample`'s native branch to call
`soemdsp_noise_generator_process_block` once per 128 calls instead of
`soemdsp_noise_generator_sample` once per call, with the old per-sample
path kept as an untouched fallback. Verified live: added a real Noise
Generator node to a patch, wired it to Output, ran 3+ seconds of
continuous live audio (many cache refill cycles) with zero console errors,
then changed the node's mode (uniform → pink) and seed mid-stream to force
an early cache invalidation — also zero errors. Test node and wiring
removed before committing; no patch state was persisted from this test.

**How this proves the modular execution boundary, concretely**: this is
the first case where the Findings section's own decision rule (generator
→ safe to wire live, ALU-bound → real SIMD win) was applied *before*
writing any code, correctly predicted both outcomes (transparent live
wiring worked, SIMD produced the branch's second-best win), and also
correctly predicted a *rejection* (`ellipsoid`, too cheap to be worth
converting) without needing to implement and benchmark it first. The
boundary shape and the two classification rules are now doing real
predictive work, not just describing results after the fact.

**Files**: `native_modules/noise_generator/noise_generator.cpp` (pair-SIMD
helpers + block kernels + dispatch boundary + pointer getters),
`scripts/build_native_modules.ps1` (added `-msimd128` and the 4 new
exports to Noise Generator's stanza, which had neither before),
`public/node-live-audio-worklet.js` (block cache wiring in
`noiseGeneratorSample`), `public/node-graph-live-runtime.js` (cache-bust
tag).

### Tightening pass: FBM's block cache had the exact bug it was written to prevent for Noise Generator

Auditing all three `process_block` integrations for consistency after the
third proof found one real, if minor, bug: `fractalBrownianNoiseVector`
recreates `state.nativeHandle` on demand (e.g. after the worklet's
`setNativeModuleWasm` native-module-reload path destroys it) but never
reset `state.blockCache`. If the cache still had unread samples at that
moment (`cursor < size`), the code would keep serving them — samples
generated by a *previous* WASM module instance, read through a
`Float64Array` view into that old instance's now-unrelated memory buffer —
until the cache naturally rolled over, up to 128 stale samples after a
reload. `noiseGeneratorSample` already resets its cache at exactly this
point (added in the third proof); FBM, which the pattern was copied from,
had the older, unpatched version of its own template.

**Fix**: added the same `cursor = 0; size = 0` reset to FBM's handle-
recreation branch. One-line-equivalent change, `public/node-live-audio-worklet.js`.

**Verified**: added a real FBM node to a patch, started live audio, then
posted the exact `setNativeModuleWasm` message the worklet's reload
handler expects (the same message `sendNodeGraphLiveNativeModules` sends
at live-audio startup) directly at the live `AudioWorkletNode`'s port
mid-stream, forcing the destroy-and-recreate path while cache state was
non-empty. Zero console errors, audio continued cleanly after the
simulated reload.

**Why this is exactly the kind of thing "tightening" should catch**: a
mechanical, one-line inconsistency between two structurally-identical
integrations, invisible to any single module's own equivalence/benchmark
tests (which only exercise steady-state calls, not the reload edge), only
found by comparing all `process_block` wiring side by side after there
were enough of them to compare.

### Proof of concept: pointing the block-processing boundary at video instead of audio

Separate from the audio SIMD work above — a proof that the exact same
`process_block(state, output, frameCount)` shape generalizes past audio
entirely, following from the idea that a raster video signal is just
another signal a DSP-style pipeline can drive, the same premise real
analog video synthesizers (Rutt-Etra scan processor, Sandin Image
Processor) are built on.

**What it is**: `native_modules/video_synth_raster/video_synth_raster.cpp`
— a Lorenz attractor whose `(x, y, z)` state is walked one step per output
pixel in row-major raster order, `z` mapped to 0-1 brightness. Brightness
is blended with the previous frame using the one-pole decay model the
`soemdsp-sandbox-phosphor` fork documents (`brightness = brightness *
decay + newHit * (1 - decay)`) — the same envelope-follower math already
used all over this sandbox's audio DSP, just pointed at light instead of
sound.

**Same boundary, different clock**: `soemdsp_video_synth_raster_process_block(handle,
width, height, speed, decay, sigma, rho, beta)` is structurally identical
to the audio `process_block` APIs above — state in, output buffer out,
`frameCount` implicit as `width * height` — but it's driven by
`requestAnimationFrame` in `public/video-synth-poc.html`, not the
44.1kHz audio render quantum. There's no reason for a video raster to be
gated by the audio clock, so it isn't; this is the same lesson from
`Findings so far` (block-processing generalizes) applied to a case where
"one call per output" doesn't mean "one call per audio sample" at all.

**Verified**: loaded the module standalone (`fetch` + `WebAssembly.instantiate`,
same pattern used for every correctness check above), ran 30 blocks at
256×256 and confirmed per-pixel brightness varies meaningfully frame to
frame (mean climbing from 0.20 to ~0.49 as the trajectory settles onto the
attractor, real min/max spread throughout — not a flat or static image),
then rendered a frame to a real `<canvas>` and confirmed all 65,536 pixels
populated with varied grayscale values via direct pixel inspection.
(Automated screenshot capture in this session's preview tooling hit a
`document.hidden`-driven `requestAnimationFrame` pause specific to
backgrounded automation tabs — browsers pause rAF in hidden tabs by spec —
so the visual proof here is via direct canvas pixel-data inspection
instead of a screenshot; a normal foreground browser tab runs the
animation loop with no special handling needed.)

**Deliberately not wired into anything**: no node-graph module definition,
no AudioWorklet integration, no SIMD (the per-pixel Lorenz recursion is a
single coupled 3-variable system — same "no independent lanes within one
instance" non-candidate profile as `chua_attractor`/`henon_map`/
`logistic_map` in the survey table above, so it wasn't forced into a SIMD
shape it doesn't have). This is a standalone proof that the
block-processing boundary and phosphor-decay model both transfer to video
cleanly, not a shipped feature. `scripts/generate_native_modules_catalog.py`
was re-run so it shows up in the native module catalog and passes the
smoke suite's completeness check, same as any other native module addition.

**Files**: `native_modules/video_synth_raster/video_synth_raster.cpp`,
`scripts/build_native_modules.ps1` (new build stanza), `public/video-synth-poc.html`
(standalone demo, not linked from the main sandbox UI), `public/native-modules-catalog.json`
(regenerated), `scripts/smoke_test.py` (added expected-exports entry).

**What a real next step would look like, if this direction is pursued**:
a node-graph module definition + worklet wiring so a patch can actually
route parameters into this (or a similar) video raster generator, and a
second pass evaluating whether per-pixel-independent effects (not this
single-coupled-attractor case, but something like a stateless waveshaper
applied per pixel) are the real SIMD-video candidate the video-synthesis
discussion identified — same ALU-bound-vs-memory-bound test already
proven for audio, just not yet applied to any pixel-shader-shaped
candidate.

---

## 🍴 Featured forks & experiments

Themed sandbox forks exploring specific DSP ideas — each one a self-contained
detour worth a look:

| Fork | What makes it worth a click |
|---|---|
| 🌊 [**Aliasing Wars**](https://github.com/elanhickler/soemdsp-sandbox-aliasing-wars) | Anti-aliases a hard-sync oscillator with reused PolyBLEP and sub-sample sync timing, proven out via a 27-assertion WASM test harness. |
| 💡 [**Vactrols**](https://github.com/elanhickler/soemdsp-sandbox-vactrols) | Grounds the vactrol envelope modules in real photoconductor physics, backed by actual recordings of hardware vactrols under CV control. |
| 🔢 [**Digital Signals**](https://github.com/elanhickler/soemdsp-sandbox-digital-signals-audio) | Asks what happens if patch wires carry packed bits instead of a continuous voltage — down to an FPGA-inspired LUT Cell module. |
| 📺 [**Phosphor**](https://github.com/elanhickler/soemdsp-sandbox-phosphor) | Rebuilds the scope renderers on real CRT-phosphor decay physics, with a hand-curated gallery of oscilloscope glow references. |
| ⚡ [**Digital Efficient Patch System**](https://github.com/elanhickler/soemdsp-sandbox-digital-efficient-patch-system) | Chases real-time multiplayer patch editing, with a brutally honest, phase-by-phase log of profiling dead ends before finding the actual bottleneck. |
| 🐾 [**Creatures**](https://github.com/elanhickler/soemdsp-sandbox-creatures) | A patchable virtual pet that eats your audio signal and reacts with eight moods, from Peaceful to Meltdown on a harsh clipped signal. |
| 🎚️ [**Analog Filters**](https://github.com/elanhickler/soemdsp-sandbox-analog-filters) | Models classic analog filter circuits (Moog ladder, ZDF/TPT feedback) closely enough that their self-oscillating, saturating personality falls out for free. |
| 🧵 [**SIMD**](https://github.com/elanhickler/soemdsp-simd) | A methodical dig into the parameter/smoothing architecture and WASM SIMD128 vectorization — landing a 2.76x faster Fractal Brownian Noise kernel and a reusable block-processing boundary. |

---

## 📄 License

This repository is source-available for noncommercial use only. Commercial
use requires a separate written commercial license from Soundemote. See
[`LICENSE`](LICENSE).

---

## 📚 Guides

- [`VACTROLS.md`](VACTROLS.md) -- vactrol field guide: how a VTL5C3/VTL5C4
  actually works, the datasheet numbers behind the Vactrol Envelope module's
  knob readouts, diagrams, and cited sources.
- [`docs/ADDING_HARDCODED_SANDBOX_MODULE.md`](docs/ADDING_HARDCODED_SANDBOX_MODULE.md)
- [`docs/OSC_MODULE_NON_UI_REFERENCE.md`](docs/OSC_MODULE_NON_UI_REFERENCE.md)

## 🧭 Boundaries

- The server only writes through explicit save/settings/audio helper routes.
- Open Path is restricted to Downloads.
- The browser patch graph is demo-scoped state.
- The browser compiler is not the production soemdsp scheduler.
- The WebUI does not instantiate real C++ DSP objects yet.
- Patch files can save current module instances and settings.
- Patch files cannot define new module types by themselves.
