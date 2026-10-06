# Kick — SweepKicker percussion module plan

**Status:** planned, not started. Plan only. Do not build until Argi says go.
**Date:** 2026-10-06.
**Owner:** SandyModules (Sandbox build agent).
**Decided (Argi, 2026-10-06):** keep the added Decay envelope; Trigger restarts the sweep and envelope without zeroing the phase (only Reset ↺ resets the phase); Kick and Electro Kick stay separate modules; FlatZapper gets its own seed with an audio input. See **Decisions**. **Still under discussion:** velocity, latching, units, stereo, and whether Flat Zapper is a new module or a mode of Phase Disperse.

**Algorithm source:** Robin Schmidt (RS-MET), `rosic::rsSweepKicker`, with permission (see Credit). FlatZapper (`rosic::rsFlatZapper`) is not part of the Kick; it is seeded as its own module (see **Flat Zapper module (seed)**).

**Parent seeds:** `docs/FUTURE_PLANNING.md` §Kick (SweepKicker) and §Electro Kick.

**Related:** `docs/APP_POLICY.md` (native-only DSP §2 / §5, Sine SSOT §2, no legacy helpers §1, shared library maths and Architect gate §19, a stored 0 is a value §18, Choice / enum persistence); `docs/GATES_TRIGGERS.md` (Trigger ⎍ / Reset ↺ jacks, `gate_hit`, height is velocity); `docs/PORT_TYPES.md`; `docs/ADDING_HARDCODED_SANDBOX_MODULE.md`; `docs/MODULE_PATTERN_REFERENCE.md`; `docs/SNARE_PLAN.md` (I/O conventions, format); `docs/VARISPEED_DELAY_PLAN.md` (format); `docs/BUG_PLAN.md` **Cleanup** → **C-002** (removal of the old kick / snare cards).

---

## Credit and permission

The Kick's DSP is Robin Schmidt's SweepKicker from the RS-MET library ([github.com/RobinSchmidt/RS-MET](https://github.com/RobinSchmidt/RS-MET), branch `work`). Robin gave Argi permission to use his DSP code on **2026-10-06** (Robin is "Music Engineer" on KVR). His message, verbatim:

> "Sure - go ahead. I would love to someday also get some monetary reward from my DSP code but it probably won't happen with my own plugins, so it's good, if the code gets integrated in other products. If I remember correctly, the class is named SweepKicker and it's somewhere in the rosic library. There is a related class called FlatZapper which implements the allpass chain that I mentioned. The modules are also available in ToolChain in the "Under Construction" section."

Credit goes in four places when this ships: the `kick.cpp` header (with the `soemdsp-native-lib:` link, like `cookbook_filter.cpp`), the store entry description / notes, the param tooltips where a meaning is Robin's, and this plan.

### License situation

- **RS-MET `LICENSE`** (repo root, branch `work`): Robin's own code (rapt, rosic, jura_framework, jura_processors) is **dual licensed**, "similar to juce's": use it under the **GPL or a compatible open source license**, or arrange a **closed-source license** with Robin, "for which I typically charge a per-product licensing fee ... negotiate[d] individually". His footnote: for open source projects he does not care which license; if a closed-source, commercial(ly successful) project "relies heavily on my code, I think it's only fair to let me participate in that success (within reason)". JUCE / Steinberg terms apply only to the JUCE-based parts (the jura wrappers), not to rosic / rapt DSP.
- **Per-file headers:** the source files used here (`rosic/unfinished/rosic_MiscUnfinished.h/.cpp`, `jura_processors/generators/jura_VariousGenerators.h/.cpp`, `rapt/Filters/Musical/Allpasses.h/.cpp`, `rapt/Filters/Scientific/BiquadCascade.h`, `rosic/filters/rosic_BiquadDesigner.h`) carry **no license header**. The repo `LICENSE` governs.
- The *ZappyKicks* sample pack ([`Notes/Scratch/ZappyKicksReadMe.txt`](https://github.com/RobinSchmidt/RS-MET/blob/work/Notes/Scratch/ZappyKicksReadMe.txt)) is **CC BY-SA 4.0**. That covers Robin's rendered samples only, not the code. We use no samples.
- **This repo** is under the *Soundemote Noncommercial Source License 1.0* (source-available, noncommercial, commercial licenses sold separately). That is not a GPL-compatible open source license, so the GPL route alone would not cover us. **Robin's explicit permission above is what authorises the port.** It reads as a general go-ahead, including integration "in other products", with a stated wish (not a condition) for some monetary reward.
- Not legal advice. Argi should keep Robin's message on file and decide whether to get the scope in writing (see Open questions).

---

## Goal

A new **Kick** module: one drum voice built on Robin's SweepKicker. A **Trigger** in, a **Reset** in, a **Kick** audio out and an **Env** out. The sound is a single oscillator whose frequency sweeps down from a high start frequency along Robin's rational sweep law. It is an "impulse smeared in time": the click, the punch and the body all come from one continuous downward chirp, with no separate click or noise layer.

Native C++/WASM DSP only. JS covers the definitions, params and the optional face. No JS DSP, no JS twin, no shims.

---

## Spec (Argi, exact)

| Topic | Spec |
|-------|------|
| In: Trigger | App trigger jack: port key `Trigger`, stamp **⎍**, white round `digital` (`docs/GATES_TRIGGERS.md` §1) |
| In: Reset | App reset jack: port key `Reset`, stamp **↺**, white round `digital`. Reset restarts all oscillation mid-hit, and it is the **only** phase reset (Decisions §2) |
| Out: Kick | Audio |
| Out: Env | The amplitude envelope |
| Params | Taken from SweepKicker. Keep Robin's meanings, sandbox naming style |
| Choices | Persisted by stable name, not index (APP_POLICY, Choice / enum persistence) |

---

## Decisions (Argi, 2026-10-06)

1. **Decay stays.** The added Decay amplitude envelope (T60) is kept. It is the **Env** output and it drives the Kick amplitude (`Kick = amplitude × e × wave`).
2. **No forced hard reset on Trigger. Reset ↺ is the only phase reset.** Robin's noteOn always zeroes the phase; the sandbox Kick does that only on Reset (an optional reset is what the Reset input is for). Exact behaviour:
   - **Trigger ⎍** (`gate_hit`, height `v`): latch High Freq / Low Freq / Sweep Time; **restart the sweep** (`n = 0`, so `t = 0`; `f_prev = fHi`; coefficients from the new latched values); **restart the envelope** (`e = v`). The oscillator phase `φ` is **not touched**. The next sample is `wave(φ + phase)` with `φ` advanced from wherever it was. Mid-hit the waveform stays continuous: only the frequency jumps back to High Freq and the level jumps to `v`.
   - **Reset ↺** (height ignored): `φ = 0`, plus the same sweep and envelope restart from the latched values (`e` = last latched `v`). This is the hard reset and the only way to zero the phase. Before the first Trigger `v = 0`, so Reset alone is silent.
   - **Trigger and Reset on the same sample:** Reset first, then Trigger, so `φ = 0` with the new height. That is exactly Robin's noteOn. Patch one trigger into both jacks to get Robin's always-zero-phase start.
   - **At rest** (`e < kPlanck`): Kick and Env output exact 0 and the sweep stops computing, but `φ` is **kept** (not zeroed). A Trigger after silence starts at the kept phase. A new instance starts at `φ = 0`.
   - **Consequence:** a Trigger-only hit after silence starts at `wave(φ_kept + phase)`, which is usually not 0, so the first sample can step from 0 (a click). That is the cost of no forced reset; Reset is the control for it.
3. **Kick (SweepKicker) and Electro Kick stay separate modules.** Kick keeps Robin's full parameter set. SweepKicker is **not** an Electro Kick algorithm (removed from the Electro Kick seed in `docs/FUTURE_PLANNING.md`).
4. **Flat Zapper gets its own seed:** Robin's `rsFlatZapper` allpass chain with an **audio input** (anything can be fed through the dispersion chain) and a **Trigger** that fires an internal impulse. See **Flat Zapper module (seed)**. Not part of the Kick.

---

## Sources read (RS-MET, branch `work`, head `9fe495bb`, 2026-10-05)

| What | File |
|------|------|
| ToolChain wrapper (`SweepKickerModule`, `FlatZapperModule`): exact param names, ranges, defaults | [`jura_processors/generators/jura_VariousGenerators.h`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/jura_processors/generators/jura_VariousGenerators.h) and [`.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/jura_processors/generators/jura_VariousGenerators.cpp) (`createParameters`, about lines 519–832) |
| ToolChain registration ("Under Construction" section) | [`jura_processors/misc/jura_ToolChain.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/jura_processors/misc/jura_ToolChain.cpp) (about lines 771–772) |
| DSP: `rsFlatZapper`, `rsFadeOutEnvelope`, `rsFreqSweeper`, `rsMorphWaveBipolar`, `rsSweepKicker` | [`rosic/unfinished/rosic_MiscUnfinished.h`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h) (classes from about line 274) and [`.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp) (about lines 473–825) |
| Helpers | `rapt/AudioBasics/AudioFunctions.h` (`rsMidiKeyAndVelToFreqFactor`, `rsTriSaw`), `rapt/Math/Functions/RealFunctions.h` (`rsRationalMap_01`), `rapt/Math/Functions/BasicMathFunctions.h` (`rsLinToExp`), `rosic/filters/rosic_BiquadDesigner.h` (cookbook / first-order allpass coefficients), `rapt/Filters/Scientific/BiquadCascade.h` (DF1 cascade) |
| Related: `rsAllpassDisperser` (SVF version of the FlatZapper chain) | [`rapt/Filters/Musical/Allpasses.h`](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Filters/Musical/Allpasses.h) (about line 437) |
| Experiments `flatZapper()`, `freqSweeper()`, `sineSweepBassdrum()` (called, commented out, from Main.cpp around line 315) | [`Tests/TestsRosicAndRapt/Source/Main.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Tests/TestsRosicAndRapt/Source/Main.cpp); bodies in [`rapt_tests/Experiments/GeneratorExperiments.cpp`](https://github.com/RobinSchmidt/RS-MET/blob/work/Tests/TestsRosicAndRapt/Source/rapt_tests/Experiments/GeneratorExperiments.cpp) (`flatZapper` ~3937, `freqSweeper` ~4124, `sineSweepBassdrum1..4` ~4171–4699) |
| Zap post-processing recipe (`getFlatZap`, `getBrownZap`) | `rs_testing/TestTools/Utilities/TestInputCreation.cpp` (~588–640) |
| Background | `Notes/Scratch/ZappyKicksReadMe.txt`; `Products/AudioPlugins/ToolChain/ToDo.txt` (SweepKicker upward-sweep question) |

Copies of all of these are on the box at `/workspace/rsmet_kick/` (reference only). A standalone harness that reproduces `rsFreqSweeper` is at `/workspace/rsmet_kick/harness/sk_harness.cpp`, and one for the FlatZapper chain at `fz_harness.cpp`. The numbers below marked "measured" come from them (48 kHz, clang -O2). Cost benchmarks added 2026-10-06: `ap_bench.cpp`, `ap_bench_block.cpp`, `ap_coeff_bench.cpp` in the same folder (see **Flat Zapper module (seed)**).

---

## SweepKicker: how it works

### Class structure

```text
rsSweepKicker                       MIDI state, key/vel tracking, latches params at note-on
 ├─ rsFreqSweeper   freqSweeper     the oscillator: sweep law f(t), phase integrator, stereo phase
 ├─ rsMorphWaveBipolar waveForm     phase (0..1) → waveform (Sine / SinFatSaw / TriSaw)
 └─ rsFadeOutEnvelope fadeOutEnv    linear fade after note-off (anti-click), nothing else
SweepKickerModule (jura / ToolChain) adds Amplitude and PassThrough on top
```

### Signal flow

```text
noteOn(key, vel):
  fHi = min(FreqHigh × 2^((key−69)/12 × KeyTrack) × velFactor, fs/2)     KeyTrack = 100 %, VelTrack = 0 (hard-coded)
  fLo = min(FreqLow  × 2^((key−69)/12 × KeyTrack) × velFactor, fs/2)
  sweepTime = SweepTime ; freqSweeper.reset() (hard phase reset) ; fadeOut = open

per sample:
  f(t) = (a + b·t^(p·q)) / (1 + c·t^p)^q                  instantaneous frequency, t = n / fs
  φ   += (f_prev + f_now) / (2·fs)   (wrap at 1)           trapezoidal integration of frequency
  y_L  = wave(φ + Phase − StereoShift/2) ; y_R = wave(φ + Phase + StereoShift/2)
  out  = Amplitude × fadeOutEnv × y  (+ PassThrough × input)
```

There is **no amplitude envelope**. The tone keeps sounding until note-off, then fades linearly over FadeOut ms. Robin made `Amplitude` a modulatable raw gain on purpose so a ToolChain envelope can drive it ("Modulatable to get away without having a built-in amp-env").

There is **no separate click, noise or waveshaper stage** either. The transient is the start of the sweep (10 kHz falling to about 1.7 kHz in 5 ms at defaults). The only waveshaping is the optional wave morph (SinFatSaw / TriSaw).

### The sweep law (per-sample maths)

User parameters → formula coefficients (`rsFreqSweeper::updateCoeffs`), with the fixed reference `refFreq = 50 Hz`:

```text
p = 2^((Chirp + ChirpShape) / 2)
q = 2^((Chirp − ChirpShape) / 2)
a = fHi                                        f(0)  = fHi
c = ((fHi / 50)^(1/q) − 1) / SweepTime^p       chosen so f(SweepTime) = 50 Hz when fLo = 0
b = fLo · c^q                                  f(∞) = b / c^q = fLo
f(t) = (a + b·t^(p·q)) / (1 + c·t^p)^q
```

- **Shape.** At Chirp = ChirpShape = 0, `p = q = 1`, so `f(t) = (fHi + fLo·c·t) / (1 + c·t)`: a hyperbola. Pitch falls about linearly in log-time, which is the shape Robin measured in the allpass zaps (`sineSweepBassdrum2` notes: instantaneous pitch slope ≈ a/t, so f ≈ a / t^p).
- **SweepTime** is the time to get from FreqHigh down to **50 Hz above FreqLow** (exactly 50 Hz when FreqLow = 0; measured 99.8 Hz at 0.2 s with FreqLow = 50).
- **Chirp** sets `p·q = 2^Chirp`, the power of the tail: with FreqLow = 0, `f ~ t^(−2^Chirp)` late in the hit. +1 holds the high frequencies longer and then drops the tail fast; −1 drops fast at first and leaves a long low tail.
- **ChirpShape** trades p against q (attack knee against overall decay) with p·q fixed. +1 keeps the start frequency a little longer; −1 rounds the knee.
- **FreqLow** > 0 makes the sweep settle on a sustained tone at FreqLow (a tuned kick). At 0 the frequency keeps falling toward 0 Hz.

Measured, defaults (fHi 10 kHz, fLo 0, SweepTime 0.2 s, Chirp 0, Shape 0):

| t | 0 | 1 ms | 5 ms | 10 ms | 20 ms | 50 ms | 100 ms | 200 ms | 500 ms | 1 s |
|---|---|------|------|-------|-------|-------|--------|--------|--------|-----|
| f (Hz) | 10000 | 5013 | 1674 | 913 | 478 | 197 | 99.5 | 50.0 | 20.1 | 10.0 |

Chirp / ChirpShape corners (f at 5 ms / 20 ms / 200 ms / 1 s): (−1, 0) 315 / 158 / 50 / 22.4 Hz; (0, 0) 1674 / 478 / 50 / 10.0 Hz; (+1, 0) 7510 / 2598 / 50 / 2.1 Hz; (+1, +1) 8894 / 3344 / 50 / 2.0 Hz; (+1, −1) 5666 / 1867 / 50 / 2.25 Hz.

Note: the experiment `sineSweepBassdrum4()` computes `b = loFreq / c^q` (marked "needs verification"). The shipped `rsFreqSweeper` uses `b = fLo · c^q`, which is the correct one (f(∞) = b / c^q). Port the shipped version.

### Phase, waveform and stereo

- Phase accumulator `φ` in cycles, trapezoidal integration of f, wrapped once per sample (`if φ ≥ 1: φ −= 1`; safe because f ≤ fs/2).
- `wave(x)` wraps x into 0..1 (`rsWrapAround`) and evaluates:
  - **Sine:** `sin(2π x)` (std::sin). Ignores WaveShapeParam.
  - **TriSaw:** `rsTriSaw(2π x, m)` with `m = sign(P) · rsRationalMap_01(|P|, 0.6)`. The rise length is `r2 = (m + 1)/4`, so P = −1 is a falling saw, 0 a triangle, +1 a rising saw.
  - **SinFatSaw:** `sin(π/2 · TriSaw(...))`: triangle → sine, saws → bulged "fat" saws.
  - `rsRationalMap_01(x, a) = (a·x + x) / (2·a·x − a + 1)`.
- **Phase** (start phase) adds a constant offset. At 0 a Sine starts at 0 (no step). At ±90° it starts at ±1, which gives a hard click.
- **PhaseStereoShift** splits the phase ± half the shift between L and R.
- An experimental feedback phase-mod (`fbPhsMod`) exists but is not exposed (Robin: "this feature should be thrown out").

### State, trigger and reset

- **State:** `sampleCount` (int), `instPhase`, `instFreq`, `oldOutL`, the five coefficients and a dirty flag; fade state (open / fading / silent) and a sample counter.
- **noteOn:** computes fHi / fLo from FreqHigh / FreqLow with key tracking (100 %, reference key 69 = A4) and velocity tracking (0 %, so velocity has **no effect** on anything, including level). Latches **FreqHigh, FreqLow and SweepTime** at that moment. Then a **hard reset**: `sampleCount = 0`, `instPhase = 0`, `instFreq = fHi`. A retrigger while the previous hit sounds cuts it (a step if the old output was not near 0). Robin's comment: "I'm not yet sure if always doing a hard reset is the right thing here."
- **Live params:** Chirp and ChirpShape mark the coefficients dirty and act at once, mid-hit. Phase, StereoShift, WaveShape, WaveShapeParam and Amplitude also act at once. FreqHigh, FreqLow and SweepTime only act at the next note-on.
- **noteOff** (same key only): linear fade over FadeOut ms, then silence. `reset()` goes straight to silence.
- **Smoothing:** none. The ToolChain `ModulatableParameter`s (Amplitude, Phase, PhaseStereoShift, WaveShapeParam) can be modulated by ToolChain's mod system; the fixed ones jump.

### Edge cases found

- **Upward sweep / blow-up if fHi < 50 Hz.** Then `c < 0` and `1 + c·t^p` heads to 0: the frequency rises and reaches a singularity (measured: fHi = 40 Hz gives 80 Hz at 0.5 s and ∞ near 1 s). FreqHigh's minimum of 500 Hz prevents this, but 100 % key tracking can push it under 50 Hz on low keys (500 Hz at key 24 → 37 Hz). This is the likely answer to the open ToolChain ToDo item "SweepKicker: ... `_Test-SweepsUpward.xml`. Why does it sweep upward?". The port clamps fHi > 50 Hz.
- **TriSaw at P = +1:** `r2 = 0.5`, so the middle branch divides by `1 − 2·r2 = 0` when x is exactly 0.5. P = −1 is safe. Guard it in the port.
- `sampleCount / fs` and `pow(t, …)` keep running forever while the note is held, even when the output is a frozen near-DC value (fLo = 0, Chirp > 0: the phase converges and the output sticks at a constant). The sandbox Decay envelope (below) ends this.

### Parameters (ToolChain `SweepKickerModule`, exact)

| Robin name | Range | Default | Scale | Unit | Meaning |
|------------|-------|---------|-------|------|---------|
| Amplitude | −1 … +1 | 1 | linear, modulatable | — | Raw output gain (bipolar so it can be an amp-env target) |
| FadeOut | 0 … 500 | 100 | linear | ms | Linear fade after note-off (core init is 0) |
| PassThrough | −1 … +1 | 0 | linear | — | Mix of the module's audio input into the output |
| FreqHigh | 500 … 20000 | 10000 | exponential | Hz | Sweep start frequency (at key A4), key-tracked 100 % |
| FreqLow | 0 … 400 | 0 | linear | Hz | Asymptotic end frequency (at A4), key-tracked 100 % |
| SweepTime | 50 … 500 | 200 | exponential | ms | Time to reach FreqLow + 50 Hz |
| Chirp | −1 … +1 | 0 | linear | — | Tail power (p·q = 2^Chirp) |
| ChirpShape | −1 … +1 | 0 | linear | — | Attack knee vs decay (p / q split) |
| Phase | −180 … +180 | 0 | linear, modulatable | ° | Start phase |
| PhaseStereoShift | −180 … +180 | 0 | linear, modulatable | ° | L/R phase split |
| WaveShape | Sine / SinFatSaw / TriSaw | Sine | choice | — | Waveform family |
| WaveShapeParam | −1 … +1 | 0 | linear, modulatable | — | Saw-down ↔ symmetric ↔ saw-up (ignored by Sine) |

Hidden in the core, not exposed in ToolChain: FreqHigh/FreqLow ByKey = 100 %, ByVel = 0 %, SweepTime ByKey / ByVel = 0 (stored, never used), FeedbackPhaseMod (commented out).

### CPU and dependencies

- Per sample: 3 × `pow` (the sweep law), 1 × `sin` (or TriSaw + `sin`), a `std::function` call, a few multiplies. **Measured ≈ 90–93 ns/sample** for one voice (box CPU, default settings; 93 ns on the first run, re-measured 2026-10-06 at 89.7 ns, 92.7 ns with FTZ/DAZ on, `ap_bench.cpp`). One kick per module, so this is small, but it is heavier than a 2-pole resonator.
- Cheap wins for the port (all keep the law): skip all maths while idle; precompute `1/fs`; when Chirp = ChirpShape = 0 use the pow-free form `(a + b·c·t)/(1 + c·t)`; call the waveform directly instead of through `std::function`; `t^p = exp(p·ln t)` shares one `ln t` between the two powers.
- Library dependencies: only `<cmath>` and small inline RAPT helpers (`rsWrapAround`, `rsRationalMap_01`, `rsTriSaw`, `rsMidiKeyAndVelToFreqFactor`, `rsRoundToInt`, `rsMin`). No tables, no allocation, no JUCE in the core.

---

## FlatZapper: how it works, and how it relates

### What it is

`rsFlatZapper` is a chain of N allpass filters whose tuning frequencies are spread from FreqLow to FreqHigh. Fed a unit impulse, the output is a fast downward sinusoidal sweep (a **dispersion chirp**, the "zap"). Each allpass delays low frequencies more than high ones near its tuning frequency. Stacked, the group delay grows toward the bass, so the highs come out first and the lows last. Because every stage is an allpass, the magnitude spectrum stays exactly **flat (white)**: measured energy of the impulse response = 1.000000. Robin's idea came from Ady (Scorb)'s "a kickdrum is like an impulse smeared in time" ([video, 9:57](https://www.youtube.com/watch?v=n3tmeChr7ec&t=9m57s), quoted in `ZappyKicksReadMe.txt`).

### Per-sample maths

```text
stage i = 0..N−1:  u_i = i / (N−1)
  f_i = FreqLow · (FreqHigh/FreqLow)^shape(u_i, FreqShape)          (rsLinToExp)
  Q_i = QLow    · (QHigh/QLow)^shape(u_i, QShape)
  shape(x, s) = rsRationalMap_01(x, (2^s − 1)/(2^s + 1))            s = 0: even spacing in log-frequency
Biquad mode:  RBJ cookbook allpass, w = 2π f_i / fs, α = sin w / (2 Q_i)
  b0 = (1−α)/(1+α), b1 = −2 cos w/(1+α), b2 = 1, a1 = −2 cos w/(1+α), a2 = (1−α)/(1+α)
OnePole mode: x = (tan(π f_i / fs) − 1)/(tan(π f_i / fs) + 1); b0 = x, b1 = 1, a1 = x
Per sample:   y = cascade of N DF1 biquads (rsBiquadCascade::getSampleDirect1)
N = 1 uses FreqLow / QLow only. N = 0 is a wire.
```

Coefficients are recomputed (one `exp`/`log` pair per mapped value plus `sin`/`cos` or `tan` per stage) only when a parameter changes.

### Excitation and post-processing (ToolChain wrapper)

- **Exciter:** on each note-on with velocity > 0, one sample of value `Exciter %` is added to the input (velocity value ignored). **Input %** mixes the module's audio input in, so it also works as an effect (a disperser). **Level** dB is applied after.
- Filter states are **not reset** on note-on. Fast retriggers add up (Robin: natural for a "machine gun", bad for chords; he considered a soft reset).
- The white output is not a usable kick on its own. Robin's recipe (`getBrownZap`, used for the ZappyKicks pack): a **one-pole lowpass at 0.5 × FreqLow** turns the white spectrum brown (−6 dB/oct, which keeps the amplitude about constant through the sweep), then **three one-pole highpasses at FreqLow** remove subsonic rumble, then a fade-out. These stages are **not** in the ToolChain module yet (his ToDo).
- Measured (128 stages, 15 Hz – 8 kHz, Q 1, 48 kHz): about 5 kHz in the first 10 ms, 800 Hz at 20 ms, 300 Hz at 50 ms, 100 Hz at 200 ms, with the raw (white) peak falling from 0.32 to below 0.001.

### Parameters (ToolChain `FlatZapperModule`, exact)

| Robin name | Range | Default | Scale | Unit |
|------------|-------|---------|-------|------|
| Level | −48 … +96 | 0 | linear | dB |
| Exciter | −100 … +100 | 100 | linear | % |
| Input | −100 … +100 | 0 | linear | % |
| NumStages | 0 … 256 | 128 | linear, integer | stages (core init 50) |
| AllpassMode | OnePole / Biquad | Biquad | choice | — |
| FreqLow | 1 … 20000 | 15 | exponential | Hz (core init 20) |
| FreqHigh | 10 … 20000 | 8000 | exponential | Hz (core init 20000) |
| FreqShape | −5 … +5 | 0 | linear | — |
| QLow | 0.125 … 8 | 1 | exponential | — |
| QHigh | 0.125 … 8 | 1 | exponential | — |
| QShape | −5 … +5 | 0 | linear | — |

### CPU

N DF1 biquads per sample (5 multiplies, 4 adds each). **Measured ≈ 325 ns/sample at 128 stages** (about 3.6 × SweepKicker), ≈ 110–115 ns at 50 (re-measured 2026-10-06; full table in **Flat Zapper module (seed)**). Biquad coefficient updates cost N × (sin, cos, 2 × exp/log) per parameter change, so they must not run per sample under modulation.

### Relation to the Kick

- SweepKicker was written **to imitate FlatZapper's impulse response with an oscillator** (`rsFreqSweeper` doc: "The original idea was to create sounds similar to the impulse responses of rsFlatZapper by using a sinusoidal oscillator with a specially shaped envelope for the instantaneous frequency"). Robin lists the gains: more direct control, other waveforms, stereo phase offsets. The sweep law itself came from measuring the instantaneous frequency of the zaps (`showRedZapsInstFreqs`, `sineSweepBassdrum2`).
- FlatZapper is **not in SweepKicker's signal path**. So it is **not part of the Kick**. It gets **its own module seed** (Argi, 2026-10-06): see **Flat Zapper module (seed)** below.
- The sandbox already ships **Phase Disperse** (`phaseDisperse`, `native_modules/phase_disperse/phase_disperse.cpp`): up to 64 *identical* RBJ allpasses (one f, one Q). FlatZapper is the general case (spread tuning, shape curves, per-stage Q, one-pole mode, up to 256 stages, impulse exciter). Robin also notes a ToDo for a "Disperser" module based on FlatZapper (`jura_VariousModules.cpp`). How the two differ, and the module-vs-mode question: **Flat Zapper module (seed)** below.

### Flat Zapper module (seed)

**Status:** seed only, not started (Argi, 2026-10-06). Do not build until Argi says go. Also in `docs/FUTURE_PLANNING.md` §Flat Zapper and the `progress.md` backlog.

**Idea.** Robin's `rsFlatZapper` as its own module. A chain of 0–256 allpass stages whose tuning frequencies are spread from Low Freq to High Freq. **Trigger** fires an internal unit impulse into the chain; it comes out as a flat-spectrum (white) falling "zap". An **audio input** feeds anything else through the same dispersion chain, so the module is also an effect: a disperser / smear for noise bursts, clicks, the Kick, other drums, pads. Robin's ToolChain wrapper already has both paths (Exciter % and Input %).

What Robin's class does (`rosic_MiscUnfinished.h` ~274, `.cpp` ~473–570): **Mode** `onePole` (first-order allpasses) or `biquad` (RBJ cookbook allpasses, Robin's default). Core init 50 stages, 20 Hz – 20 kHz; ToolChain defaults 128 stages, 15 Hz – 8 kHz. In `onePole` mode Robin still runs his DF1 biquad cascade with zero b2 / a2 (his ToDo: a dedicated 1p1z path). The port would use a real first-order path.

**I/O (proposed)**

| Jack | Kind | Meaning |
|------|------|---------|
| In: `In` | audio | Fed into the chain, scaled by Input |
| In: `Trigger` ⎍ | digital, `gate_hit` | Adds one impulse sample of height `v × impulse` to the chain input (`v` = trigger height = velocity) |
| In: `Reset` ↺ | digital (optional, open question) | Clears all stage states, which silences ringing zaps. Robin never resets on note-on, so fast triggers pile up ("machine gun", his comment) |
| Out: `Out` | audio | `amplitude × (mix × chain + (1 − mix) × dry)`, dry = `In × input` + impulse |

**Params (proposed, from `FlatZapperModule::createParameters` and the core class)**

| Key | Label | Range | Default | Robin | Notes |
|-----|-------|-------|---------|-------|-------|
| `stages` | Stages | 0–256, integer | 50 | NumStages 0…256 (ToolChain 128, core 50; "the sweet spot seems to be around 50") | 0 = wire. Changing it recomputes the coefficients |
| `mode` | Mode | `onePole` / `biquad` | `biquad` | AllpassMode | Choice stored by name. In `onePole` the Q params do nothing |
| `lowFreq` | Low Freq | 1–20000 Hz, exp | 15 | FreqLow | Tuning of the first stage |
| `highFreq` | High Freq | 10–20000 Hz, exp | 8000 | FreqHigh | Tuning of the last stage |
| `freqShape` | Freq Shape | −5…+5 | 0 | FreqShape | 0 = even spacing in log-frequency (the self-similar zap); + / − bends the tuning curve (`rsRationalMap_01`) |
| `lowQ` | Low Q | 0.125–8, exp | 1 | QLow | Biquad only |
| `highQ` | High Q | 0.125–8, exp | 1 | QHigh | Biquad only |
| `qShape` | Q Shape | −5…+5 | 0 | QShape | Biquad only |
| `impulse` | Impulse | −1…+1 | 1 | Exciter −100…+100 % | Height of the Trigger impulse (× velocity) |
| `input` | Input | −1…+1 | 1 | Input −100…+100 % (Robin's default 0) | Gain of `In` into the chain. Default 1 because the jack is the point |
| `mix` | Mix | 0–1 | 1 | none (**added**) | Dry / wet. 1 = only the dispersed signal. Below 1 the dry impulse becomes a click layer |
| `amplitude` | Amplitude | 0–1 | 1 | Level −48…+96 dB | Output level |

Not in v1 unless Argi wants it: Robin's "brown" post-processing from `getBrownZap` (one-pole lowpass at 0.5 × Low Freq, then three one-pole highpasses at Low Freq) as a `tone` choice (`flat` / `brown`, by name), and a fade. Without it the raw zap is white, so very bright. Coefficients are recomputed only when a param changes (per block while a param is modulated), never per sample. Keep Robin's maths recognisable (`rsLinToExp`, the shape map, the cookbook and first-order allpass designs) and use the sandbox trig helpers (`dsp_sin` / `dsp_cos` and a tan helper; any new shared helper needs Architect approval, APP_POLICY §19).

**Phase Disperse vs Flat Zapper**

| | Phase Disperse (`phaseDisperse`, shipped) | Flat Zapper (seed) |
|-|------------------------------------------|--------------------|
| Native code | `native_modules/phase_disperse/phase_disperse.cpp` | new `native_modules/flat_zapper/` |
| Stages | 1–64 (`Filters`), fractional: the last stage is crossfaded | 0–256, integer |
| Tuning | every stage identical: one `Frequency`, one `Pinch` (= Q) | spread Low → High Freq along Freq Shape; per-stage Q from Low Q / High Q / Q Shape |
| Stage type | RBJ biquad allpass only | one-pole or biquad |
| Excitation | none: In → Out effect | Trigger impulse and In |
| Role | processor | source and processor |

Phase Disperse is the special case Low Freq = High Freq, Low Q = High Q, biquad, N ≤ 64. Folding Flat Zapper into Phase Disperse would add 7+ params and a Trigger to a shipped module, raise its stage limit from 64 to 256 (its native state is sized for 64) and force a choice about the fractional-stage crossfade. **Proposed: a separate Flat Zapper module, Phase Disperse unchanged** (Phase Disperse stays the "smear one band" tool; Flat Zapper is the spread chain with a Trigger). Argi decides (Open questions 9).

**Cost estimate**

Per stage, per sample:

- **First-order allpass:** `y = c·(x − y1) + x1`, then `x1 = x`, `y1 = y`. 1 multiply, 2 adds, 2 state words.
- **Biquad allpass** (Robin's DF1 cascade): 5 multiplies, 4 adds, 4 state words (b2 = 1 and a2 = b0 would save 2 multiplies).
- **N stages:** N mul + 2N add (one-pole) or 5N mul + 4N add (biquad). 256 one-pole stages ≈ 770 flops per sample ≈ 37 Mflop/s at 48 kHz.
- The chain is serial: stage i + 1 needs stage i's output from the same sample. So it is **latency-bound, not flop-bound**, and the two modes cost about the same: **≈ 2.3–2.7 ns per stage per sample** at N ≥ 128 (≈ 1.6 ns/stage at N = 50, where the CPU overlaps neighbouring samples). Processing a block **stage by stage** (stage-major, 64 samples) lets the CPU overlap stages and halves the cost (**≈ 1.2 ns/stage**).
- **Coefficient smoothing:** smoothing every stage coefficient per sample adds ≈ N more mul + add. Cheaper: smooth the user params and recompute coefficients per block while they move. One full recompute measured **≈ 25 ns/stage (one-pole: exp + tan)** or **≈ 37 ns/stage (biquad: 2 × exp + sin + cos)**: 256 stages = 6.3 µs / 9.7 µs per update, i.e. ≈ 200 / 300 ns per sample if redone every 32 samples while a knob moves, and 0 when nothing moves.

**Measured** (box CPU, clang++ -O2, scalar double, 10 s at 48 kHz, best of 3; `/workspace/rsmet_kick/harness/ap_bench.cpp`, `ap_bench_block.cpp`, `ap_coeff_bench.cpp`). Results were the same with FTZ/DAZ on and off (no denormal stalls), and the same for an impulse every 0.5 s (Trigger) and white noise (audio input):

| Voice | ns/sample | × SweepKicker (89.7 ns) |
|-------|-----------|-------------------------|
| SweepKicker core (`rsFreqSweeper` verbatim: 3 × pow + sin + `std::function`, retrigger every 0.5 s) | 89.7 (92.7 with FTZ) | 1.0 |
| Flat Zapper one-pole, 50 stages | 78–81 | 0.9 |
| Flat Zapper biquad, 50 stages (Robin's core default) | 109–115 | 1.25 |
| one-pole, 128 stages | 289–293 | 3.2 |
| biquad, 128 stages (ToolChain default) | 324–326 | 3.6 |
| one-pole, 256 stages (max) | 638–647 | 7.2 |
| biquad, 256 stages | 680–686 | 7.6 |
| one-pole, 50, block-64 stage-major | 59–61 | 0.7 |
| one-pole, 128, block-64 stage-major | 149–157 | 1.7 |
| one-pole, 256, block-64 stage-major | ≈ 302 | 3.4 |

Budget: one sample at 48 kHz is 20.8 µs, so the worst case (biquad, 256 stages) is ≈ 3.3 % of one core per module natively. WASM in the worklet is usually somewhat slower than native; re-measure in the browser before building. The prior SweepKicker estimate (≈ 93 ns) holds. Proposed for the port: default 50 stages, a real first-order path processed stage-major per block, coefficients recomputed per block only while params move.

---

## Module identity (proposed)

| Field | Value |
|-------|-------|
| Type key | `kick` |
| Shop / header label | Kick |
| Store category | `drum` |
| Plan role | `source`, `planFreeRun: true` |
| Native type id | Next free id in `NATIVE_GRAPH_TYPE_IDS` at build time. The highest seen on 2026-10-06 is 204 (`powerDecay`). Snare may take the next one. Other agents have uncommitted `graph_engine` work, so check again before picking |
| Inputs (order) | `Trigger`, `Reset`. No aliases |
| Outputs (order) | `Kick`, `Env` |
| Polyphony | One voice per module. Trigger restarts the sweep and envelope and keeps the phase; only Reset zeroes the phase (Decisions §2) |
| Channels | Mono (see PhaseStereoShift below) |

---

## Parameters (sandbox, proposed)

Robin's meanings, sandbox naming style (camelCase keys, Title Case labels, seconds for time, `kind` tags). Rows marked **added** do not exist in SweepKicker.

| Key | Label | Range | Default | Unit | Meaning | Robin |
|-----|-------|-------|---------|------|---------|-------|
| `highFreq` | High Freq | 500–20000 | 10000 | Hz (`kind: "frequency"`) | Sweep start frequency | FreqHigh (exp) |
| `lowFreq` | Low Freq | 0–400 | 0 | Hz (`kind: "frequency"`) | Frequency the sweep settles toward. 0 = keeps falling | FreqLow (linear) |
| `sweepTime` | Sweep Time | 0.05–0.5 | 0.2 | s (`kind: "time"`) | Time to fall to Low Freq + 50 Hz | SweepTime (ms, exp) |
| `chirp` | Chirp | −1…+1 | 0 | — | Tail power: + holds the highs longer then drops fast, − drops fast then lingers low | Chirp |
| `chirpShape` | Chirp Shape | −1…+1 | 0 | — | Attack knee vs decay at the same tail power | ChirpShape |
| `wave` | Wave | `sine` / `sinFatSaw` / `triSaw` | `sine` | choice | Waveform family | WaveShape |
| `waveShape` | Wave Shape | −1…+1 | 0 | — | Saw-down ↔ symmetric ↔ saw-up. No effect on Sine | WaveShapeParam |
| `phase` | Phase | −0.5…+0.5 | 0 | cycle (`kind: "phase"`) | Start phase. 0 = clean start; ±0.25 = hard click | Phase (−180…+180°) |
| `decay` | Decay | 0.02–4 | 0.5 | s (T60) | **Added, kept (Argi 2026-10-06).** Amplitude envelope, seconds to −60 dB. Drives Env and the Kick amplitude | none (ToolChain uses an external amp env) |
| `amplitude` | Amplitude | 0–1 | 1 | — | Output level | Amplitude (−1…+1) |

`Wave` choice: `choices: ["Sine", "SinFatSaw", "TriSaw"]`, `choiceKeys: ["sine", "sinFatSaw", "triSaw"]`, `choiceIds: [0, 1, 2]` (Robin's enum order), `defaultValue: "sine"`, `kind: "choice"`, `linearSmoothing: false`.

Dropped from Robin's set, with reasons:

| Robin param | Why not in v1 |
|-------------|---------------|
| FadeOut | Needs a note-off. Trigger has no length. Decay replaces it |
| PassThrough | The Kick has no audio input |
| PhaseStereoShift | Mono Kick out (spec). Could come back with stereo outs (open question) |
| Key tracking (ByKey 100 %, ref A4) | No pitch input in the spec. Without a key, the factor is 1, so High / Low Freq are absolute Hz (same as Robin at A4) |
| Velocity tracking (ByVel 0 %) | Robin's is 0 (no effect). Sandbox law: Trigger height scales the hit (below) |

Velocity: Trigger height `v = |height|` scales Env (peak `v`) and so the Kick. It does not change the sweep (Robin's ByVel = 0). Open question whether v should also raise High Freq.

---

## Signal flow (sandbox)

```text
Trigger (v) ─► latch highFreq, lowFreq, sweepTime (as Robin's noteOn) ; clamp fHi to (50 Hz, fs/2), fLo to [0, fs/2]
            ─► restart sweep: n = 0, f_prev = fHi ; e = v ; φ NOT reset (keeps its current value)
Reset       ─► φ = 0 ; n = 0, f_prev = fHi (latched) ; e = latched v      (the only phase reset)

f = (a + b·t^(p·q)) / (1 + c·t^p)^q          t = n / fs     (Robin's law, refFreq 50 Hz)
φ += (f_prev + f)/(2 fs), wrap                (trapezoid, as Robin)
y = wave(φ + phase)                           (Sine / SinFatSaw / TriSaw, Robin's maps)
e *= r,  r = exp(−6.9078 / (decay × fs))      (added: one-multiply T60 decay)

Kick = amplitude × e × y
Env  = e                                     (0…v, Planck-clean)
```

---

## Hit model

| Event | Behaviour |
|-------|-----------|
| **Trigger** hit (`gate_hit`) | Latch `v = |height|` and High Freq / Low Freq / Sweep Time. Restart the sweep: `n = 0`, `f_prev = fHi`, coefficients from the new latched values. Restart the envelope: `e = v`. **`φ` is not reset**: it keeps its current value, so the waveform is continuous across a retrigger (Decisions §2). Differs from Robin's noteOn, which always hard-resets (his comment: "I'm not yet sure if always doing a hard reset is the right thing here") |
| **Reset** hit (`gate_hit`, height ignored) | The only phase reset: `φ = 0`, plus `n = 0`, `f_prev = fHi`, coefficients from the latched values, `e` back to the last latched `v`. Before the first Trigger `v = 0`, so Reset alone is silent (same rule as the snare) |
| Trigger and Reset on the same sample | Reset first, then Trigger: `φ = 0` and the new height wins. Identical to Robin's noteOn |
| Live params | Chirp, Chirp Shape, Wave, Wave Shape, Phase, Decay and Amplitude act at once (as Robin's). High Freq, Low Freq and Sweep Time act at the next hit (as Robin's). Open question |
| Rest | When `e < kPlanck` (1e-7): Kick and Env output exact 0, `e` snaps to 0, the sweep stops computing (idle). `φ` is kept, so the next Trigger starts at the phase where the last hit went idle. A new instance starts at `φ = 0` |
| Click note | A Trigger-only hit after silence starts at `wave(φ_kept + phase)`, usually not 0, so the first sample can step from 0. Mid-hit retriggers are phase-continuous. For Robin's zero-phase start every time, patch the trigger into Reset too |

---

## Env output (definition)

**Env = the amplitude envelope `e`** (the Decay envelope, including velocity, not including Amplitude). Unipolar 0…v, starts at `v` on the hit sample, Planck-clean. This matches the snare's choice (Amplitude is the fader and should not kill modulation).

SweepKicker has no envelope of its own, so Env is a sandbox addition by necessity. Alternatives (not chosen): Env = a normalised sweep-progress curve (`f(t)/fHi`), which is useful for pitch-following but is not an amplitude envelope.

---

## Design rules

1. **Audio DSP is native C++/wasm only.** No JS DSP, no JS twin, no worklet special case, no temporary evaluator. Missing native means silence (APP_POLICY §2, §5).
2. **No shims.** No aliases, no dual keys, no migration from `sineKick` / `sinepulse` / `kickEnvelope` / `electroKick` patches (APP_POLICY §1). Those types were removed in C-002 (2026-10-06); no patch used them.
3. **Choices persist by stable name.** `wave` stores `"sine"` / `"sinFatSaw"` / `"triSaw"`. Integer ids are only the native wire format, resolved by name in one place in the native param sync (Vactrol `model` pattern).
4. **Port only what the Kick needs into the module.** The sweep law, the phase integrator and the TriSaw / SinFatSaw maps live in `native_modules/kick/kick.cpp`. Shared helpers going into `library/include/soemdsp` need Argi's (Architect) approval (APP_POLICY §19). Do not copy kernels out of another module's `.cpp`.
5. **Sine SSOT.** The production Sine uses `dsp_sin_turns_lut` (APP_POLICY §2), not `std::sin`. The parity test accounts for that (below).
6. **A stored value is a value** (§18). Switching Wave never rewrites Wave Shape.
7. **Gate law.** Both inlets use `gate_hit` (`trigger.h`). Trigger height is velocity. Reset ignores height.
8. **Planck-clean outputs.** `e` and the state snap to exact 0 below `kPlanck`.
9. **Keep Robin's maths recognisable.** Same coefficient names (a, b, c, p, q, refFreq), same trapezoidal integrator, same maps, with a comment pointing at the RS-MET file and line. Optimisations must stay within the parity tolerance.
10. **A face is out of scope** unless trivial (the existing `lineBurn` face on `Kick` is the trivial option).

---

## Port plan (native C++)

### Where the code goes

```text
native_modules/kick/kick.cpp                     the module (power_decay pattern)
native_modules/kick/originalcode/                Robin's reference sources, unmodified (cookbook_filter precedent)
    rosic_MiscUnfinished_SweepKicker.h/.cpp      only the rsFadeOutEnvelope / rsFreqSweeper / rsMorphWaveBipolar / rsSweepKicker parts
    jura_SweepKickerModule.txt                   the createParameters() excerpt (names, ranges, defaults)
```

`kick.cpp` header, following `cookbook_filter.cpp`:

```text
// soemdsp-native-module: kick
// soemdsp-native-label: Kick
// soemdsp-native-target: kick
// soemdsp-native-kind: drum
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h
//
// Port of rosic::rsSweepKicker / rsFreqSweeper (Robin Schmidt, RS-MET), used with
// Robin's permission (2026-10-06, see docs/KICK_PLAN.md). Original: originalcode/.
```

C API: `soemdsp_kick_create / destroy / sample / env / is_idle / version / metadata_json / metadata_json_size`. `sample` returns Kick, `env(handle)` returns that sample's Env. Fixed instance pool, no heap on the audio path, no `std::function`.

### rosic dependencies: what to port, what not

| Dependency | Plan |
|------------|------|
| `rsFreqSweeper` (law, integrator, reset) | Port into `kick.cpp` (local struct) |
| `rsMorphWaveBipolar` (TriSaw / SinFatSaw, `triSawParamMap` 0.60) | Port into `kick.cpp`. Add the P = +1 guard |
| `rsSweepKicker` noteOn latching, Nyquist clamp | Port into `kick.cpp` without key/vel tracking. Add the fHi > 50 Hz clamp |
| `rsFadeOutEnvelope` | Not ported (no note-off). Replaced by the Decay T60 envelope |
| `RAPT::rsRationalMap_01`, `rsTriSaw`, `rsWrapAround`, `rsMidiKeyAndVelToFreqFactor` | Inline the few lines needed in `kick.cpp`. Key/vel factor not needed |
| Sine | `dsp_sin_turns_lut` (library, already shared) |
| T60 coefficient, Planck snap, gate detect | `dsp_exp` / existing envelope helpers, `silent_planck` / `kPlanck`, `gate_hit` (library, as is) |
| FlatZapper, `rsBiquadCascade`, `BiquadDesigner` | Not needed by the Kick. Only for the separate Flat Zapper candidate |

A shared `rational_map_01` or `rs_tri_saw` in the library would be nice for later modules, but it needs Argi's approval. Until then they stay local to `kick.cpp` and get recorded as possible library candidates.

### Parity test against Robin's original

Goal: prove the port computes Robin's SweepKicker, not a look-alike.

1. **Reference build (box).** Compile Robin's own files on the box: `rosic_MiscUnfinished.h/.cpp` (the four classes) with the RAPT headers they include, or with a minimal stub of the six inline helpers (as in `/workspace/rsmet_kick/harness/sk_harness.cpp`, which already reproduces `rsFreqSweeper` verbatim). Drive `rsSweepKicker` directly: `setSampleRate(48000)`, setters, `noteOn(69, 64)` (key A4 → factor 1, velocity unused), render N samples of L.
2. **Port build.** Compile `native_modules/kick/kick.cpp` natively on the box (same source as the wasm), create one instance, set the matching params, Reset and Trigger (height 1) on the same sample (= Robin's hard-reset noteOn), Decay at its maximum, render the same N samples, and divide Kick by Env (Env is an exact output, so this removes the added envelope).
3. **Cases.** Defaults; FreqLow 0 / 50 / 400; SweepTime 0.05 / 0.5; Chirp and ChirpShape at the nine corners of {−1, 0, +1}²; each Wave with WaveShapeParam −1 / −0.5 / 0 / 0.5 / 0.99; Phase ±90°; sample rates 44.1 / 48 / 96 kHz; a mid-hit Chirp change; a retrigger at 30 ms sent to Reset + Trigger (Robin's hard reset).
4. **Tolerance.** Instantaneous frequency and phase: match to 1e-9 relative (same law, same integrator, double precision). Audio: TriSaw path to 1e-9; Sine and SinFatSaw within the measured error of `dsp_sin_turns_lut` against `std::sin` (measure it first; expect around 1e-6 or better). Report max abs error and error in dB.
5. **Sandbox-only checks.** Silent before Trigger; Env peaks at `v` and reaches exact 0; a Trigger-only retrigger at 30 ms keeps `φ` continuous (no phase step, frequency back at High Freq, `e = v`) and a hit after silence starts at the kept phase; Reset mid-hit zeroes `φ` and restarts the sweep at High Freq (compare against a fresh instance's first hit, bit-exact); fHi clamp holds; no NaN / denormals; every param changes the output (no dead knobs); the Wave choice survives save/load by name.
6. Keep the harness and its expected-output hashes under `scripts/` (for example `scripts/parity_kick_sweepkicker.*`) so the check can be rerun. Robin's sources stay in `originalcode/`, untouched.

---

## Reusable pieces in the repo (candidates)

| Need | Candidate | Where |
|------|-----------|-------|
| Trigger / Reset detect | `gate_hit` | `library/include/soemdsp/trigger/trigger.h` |
| Planck rest | `silent_planck`, `kPlanck` | `library/include/soemdsp/math/scalar_helpers.h` |
| Sine | `dsp_sin_turns_lut` | `library/include/soemdsp/math/analog_filter_trig.h` |
| T60 decay | `dsp_exp`, one-pole helpers | `math/exp_log.h`, `dynamics/dynamics.h` |
| Trigger-driven native envelope wiring (newest end-to-end example) | PowerDecay, type id 204 | `native_modules/power_decay/power_decay.cpp` |
| RS-MET port precedent (header, `originalcode/`) | Cookbook Filter | `native_modules/cookbook_filter/` |
| Allpass dispersion (for the Flat Zapper candidate) | Phase Disperse | `native_modules/phase_disperse/phase_disperse.cpp` |

---

## Build checklist (when Argi says go)

1. **Reference first.** Build Robin's classes on the box, render the reference cases, save them (Parity test, step 1).
2. **Native module.** `native_modules/kick/kick.cpp` + `originalcode/`. Add it to `scripts/build_native_modules.ps1`.
3. **graph_engine opcode.** Extern declarations, `kTypeKick`, create / destroy, `process_kick` writing `Kick` and `Env`, per-sample `gate_hit` on `Trigger` / `Reset`. Add it to `NATIVE_GRAPH_TYPE_IDS` and the param push in `public/node-live-audio-worklet-native-graph.js`, with `wave` resolved key → id in one place.
4. **Definitions.** `kick` in `nodeGraphModuleDefinitions` and `nodeGraphNodeLabels` (`public/node-graph-module-definitions.js`): ports, params, `choiceKeys`. Bypass entry `kick: "silence"` in `public/node-graph-module-bypass.js`.
5. **Tooltips.** Robin's meanings in plain words (Sweep Time: "time to fall to Low Freq + 50 Hz"; Chirp; Chirp Shape), T60 wording for Decay, and a credit line ("Robin Schmidt's SweepKicker, RS-MET").
6. **Parity + smoke.** Run the parity harness (all cases pass). Export list in `scripts/smoke_test.py` like `power_decay`, plus a native smoke script. Test the real Live path, not only Render Sample.
7. **Catalog / store.** Entry in `public/node-graph-module-store.js` (category `drum`, description with credit, notes incl. "robin", "rs-met", "sweepkicker", source link to `native_modules/kick/kick.cpp`), Add Module menu, `docs/APP_POLICY.md` live-audio allowlist row.
8. **Removal.** Done 2026-10-06 (C-002, Removal section below).
9. **Face.** None, or `lineBurn` on `Kick` if trivial.
10. **Docs.** Change the status here, in `docs/FUTURE_PLANNING.md` and in `progress.md` only after Argi tests.

---

## Non-goals (v1)

- JS DSP of any kind, a JS twin, a worklet special case
- FlatZapper inside the Kick (it has its own seed)
- Stereo out, PassThrough, FadeOut, key tracking, an Accent jack
- A separate click / noise layer (not in SweepKicker)
- Changing Robin's sweep law or maps (beyond the guards)
- New `library/include/soemdsp` APIs without Architect approval
- Aliases, dual keys or patch migration from the old kick cards

---

## Removal (done 2026-10-06)

**Status: done.** Argi said "start" on 2026-10-06. Local, uncommitted (nothing committed or pushed). Tracked as `docs/BUG_PLAN.md` **Cleanup** → **C-002**.

**Removed types:** `sinepulse` (Sinepulse), `sineKick` (Sine Kick), `kickEnvelope` (Kick Envelope), `electroKick` (ElectroKick placeholder) and `electroSnare` (ElectroSnare placeholder). `electroSnare` was a pure placeholder: a definition, a label and a store card, with no DSP, no C++, no opcode, no face code and no patch. Electro Snare (`docs/SNARE_PLAN.md`) adds the key back where the card sat (just before `electroHat`). No aliases, no migration (APP_POLICY §1). Persisted `underconstructionsort` lists need no shim: `nodeGraphModuleCatalogNormalizeTypeList` already drops unknown types on load.

**Deleted files**

- `public/modules/kickEnvelope/kick-envelope-math.js` (and the now-empty `public/modules/kickEnvelope/` folder)
- `scripts/test_kick_envelope.js` (not registered in any runner; it already failed before the removal with `nodeGraphFiniteNumber is not defined`)

**Edited files**

| File | Removed |
|------|---------|
| `public/node-graph-module-definitions.js` | 5 `nodeGraphNodeLabels` entries; the `kickEnvelope`, `sineKick`, `sinepulse`, `electroKick`, `electroSnare` definitions (the "electro drum voice suite" comment now sits on `electroHat`) |
| `public/node-graph-module-store.js` | UC sort entries (`electroKick`, `electroSnare`, `kickEnvelope`, `sineKick`, `sinepulse`); construction-plan tooltips (`electroKick`, `electroSnare`); 5 catalog cards; `kickEnvelope` / `sineKick` from `nodeGraphModuleStoreNativeLabelTypes` (`attackDecay` stays); the `kickEnvelope` JS source link |
| `public/node-graph-module-bypass.js` | 5 bypass entries |
| `public/node-graph-module-scope-defaults.js` | `sinepulse`, `kickEnvelope`, `sineKick` from the unipolar types |
| `public/node-graph-live-plan-runtime.js` | Dead `sinepulseStates` map, its two create blocks, its runtime field, and `"sinepulse"` in the two state-map loops |
| `public/node-live-audio-worklet-core.js`, `public/node-live-audio-worklet-clear-plan.js`, `public/node-live-audio-worklet-set-plan.js` | Dead `sinepulseStates` / `kickEnvelopeStates` / `sineKickStates` maps and prune loops |
| `public/modules/ellipsoid/ellipsoid-display.js` | The whole Kick branch of the RoundShape face (`isKick`, the square kick plate, the `nodeGraphKickEnvelope*` calls, legacy `roundness`, `low` / `high`, the now-unused `liveOut` / `innerW` / `innerH`) |
| `public/modules/ellipsoid/ellipsoid-settings.js`, `public/node-graph-oscillator-runtime.js` | Kick Envelope mentions in comments |
| `public/modules/phoneTone/phone-tone-math.js` | Dead `nodeGraphSinepulseMaxHz` lookup (the 20000 fallback stays) |
| `public/index.html`, `public/perform.html` | `kick-envelope-math.js` script tag |
| `public/presets/useruisettings.default.json`, `public/presets/useruisettings.js`, `public/presets/useruisettings.json` | Removed types from `underconstructionsort` |
| `scripts/smoke_test.py` | `kick-envelope-math.js` from the public script list |
| `scripts/test_module_layout_bands.js` | Kick Envelope fixture and case replaced by RoundShape (`ellipsoid`): same LayoutA `roundShape` band checks |
| `docs/MODULE_LAYOUT_PLAN.md` | Band-check list: Kick Envelope → RoundShape |
| `docs/SNARE_PLAN.md`, `docs/FUTURE_PLANNING.md`, `docs/BUG_PLAN.md`, `progress.md`, this plan | Status and wording (SNARE_PLAN references kept) |

**Kept on purpose**

- `docs/BUG_PLAN.md` C-001 history tables and D5 (they record what C-001 did).
- `search-width.txt` (tracked scratch grep output at the repo root; stale lines still name the deleted files). Deleting it is Argi's call (Open questions 11).
- `patches/sine_kick_attempt.json`, `patches/sine_kick_attempt_2.json` and their rows in `patches/index.json`: example patches built only from shipped modules (ampCurve, attenuverter, flowerChildFilter, lineBurnOscilloscope, output, pingEnvelope, polyBlep, range, sinCos, textBox, transport). They use no removed type.
- No patch or preset in `patches/`, `saved-patches/`, `fixtures/`, `backups/` uses a removed type. Nothing in `native_modules/`, `library/`, CMake, the build script or CSS referenced them.

**Checks after the removal:** `node --check` on every edited JS file; the two JSON presets parse; `python scripts/smoke_test.py` passed (it also passed before); `scripts/test_module_layout_bands.js` ok; `scripts/check_graph_engine_contracts.py` OK. Eleven other `scripts/test_*.js` fail on unrelated, pre-existing errors (missing `nodeGraphFiniteNumber` stub, stale cache-bust strings, jack colours, keyboard helpers). The app was not loaded in a browser: the dev server on :8765 is Argi's, and a fresh headless profile could write UI settings.

### Not removed (reported only)

| Type | What it is | Where | Implemented? | Used? |
|------|-----------|-------|--------------|-------|
| `electroHat` (ElectroHat) | Parked UC drum placeholder: Trigger + Accent in, Out; Decay, Tone, Open, Level; `lineBurn` face | definitions (label + definition), store (UC list, tooltip, `drum` card), bypass, 3 presets | No: no DSP, no C++, no opcode (silent) | No patch. The **Electro Hat** seed (`docs/FUTURE_PLANNING.md`) proposes to replace it |
| `drummer` (Drummer) | Parked UC pattern / rhythm engine (Sequence shelf, store category `clock`): Clock + Reset in; Out, Kick, Snare, Hat, Gate out; Tempo, Swing, … | definitions, store (UC list, tooltip, card), bypass, 3 presets | No (silent) | No patch. Not a drum voice |
| `percussion` (Percussion (10)) | Parked UC GM channel-10 kit (store category `sample`): Note, Gate, Velocity in; Out; Channel, Kit, Amplitude | definitions, store (UC list, tooltip, card), bypass, 3 presets | No (silent) | No patch |
| `phaseDisperse` (Phase Disperse) | Shipped allpass smear, related to Flat Zapper | `native_modules/phase_disperse/` | Yes (native) | Kept |

---

## Open questions (Argi)

1. **Permission scope.** Robin's message is a general go-ahead and mentions "other products". Do you want it confirmed in writing for commercial use, the attribution form he prefers, and whether he wants a share or fee (he says he would like monetary reward someday)?
2. **Decay (added). Resolved (Argi, 2026-10-06):** keep the Decay envelope; it drives Env and the Kick amplitude. Still open: range and default (proposed 0.02–4 s, 0.5 s).
3. **Velocity.** Height scales Env only (proposed), or also High Freq like a harder beater?
4. **Latching.** Keep Robin's rule (High Freq / Low Freq / Sweep Time only change at the next hit), or make them live?
5. **Retrigger. Resolved (Argi, 2026-10-06):** no forced hard reset on Trigger. Trigger restarts the sweep and envelope and keeps the phase; only Reset ↺ zeroes the phase (Decisions §2).
6. **Units.** Phase in cycles −0.5…+0.5 (proposed) vs degrees; Amplitude 0–1 (proposed) vs Robin's −1…+1.
7. **Stereo.** Drop PhaseStereoShift (proposed, mono spec) or add Kick L / R outs?
8. **Pitch input.** Add a 0.1V/Oct or pitch input so key tracking works like Robin's ByKey (100 %, A4 reference)?
9. **FlatZapper. Partly resolved (Argi, 2026-10-06):** its own seed with an audio input and a Trigger (Flat Zapper module (seed)). Still open: a new module (proposed) or a mode / input of Phase Disperse; Robin's brown lowpass + DC highpasses (`getBrownZap`) as a `tone` choice; a Reset jack; default stage count (proposed 50).
10. **Kick vs Electro Kick. Resolved (Argi, 2026-10-06):** separate modules. SweepKicker is not an Electro Kick algorithm.
11. **Removal (C-002). Done 2026-10-06** (Argi: "start"): Sinepulse, Sine Kick, Kick Envelope (with `kick-envelope-math.js` and the Ellipsoid kick branch), `electroKick`, `electroSnare`. Still open: delete the stale `search-width.txt`?
12. **Shared helpers.** Approve `rational_map_01` / TriSaw helpers in `library/include/soemdsp`, or keep them local to `kick.cpp` (proposed)?
13. **isIdle out.** Add one for voice idle detection, like other envelopes? Not in the spec, so out of v1 unless you say so.

---

## References

- R. Schmidt, RS-MET repository, branch `work` — [github.com/RobinSchmidt/RS-MET](https://github.com/RobinSchmidt/RS-MET/tree/work); [`LICENSE`](https://github.com/RobinSchmidt/RS-MET/blob/work/LICENSE)
- `jura_VariousGenerators.h` (ToolChain wrappers) — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/jura_processors/generators/jura_VariousGenerators.h); `.cpp` — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/jura_processors/generators/jura_VariousGenerators.cpp)
- `rosic_MiscUnfinished.h` / `.cpp` (rsFlatZapper, rsFreqSweeper, rsMorphWaveBipolar, rsSweepKicker) — [h](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h), [cpp](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.cpp)
- `Allpasses.h` (rsAllpassDisperser) — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Filters/Musical/Allpasses.h)
- `Main.cpp` (experiment calls ~line 315) — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Tests/TestsRosicAndRapt/Source/Main.cpp); `GeneratorExperiments.cpp` (flatZapper, freqSweeper, sineSweepBassdrum1–4) — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Tests/TestsRosicAndRapt/Source/rapt_tests/Experiments/GeneratorExperiments.cpp)
- `ZappyKicksReadMe.txt` — [GitHub](https://github.com/RobinSchmidt/RS-MET/blob/work/Notes/Scratch/ZappyKicksReadMe.txt)
- R. Bristow-Johnson, *Audio EQ Cookbook* (allpass biquad) — [W3C mirror](https://www.w3.org/TR/audio-eq-cookbook/)
