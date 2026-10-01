# App-wide policy (standing orders)

**Audience:** humans and agents working on soemdsp-sandbox.  
**Status:** binding while the app is **not feature-complete**.  
**Related:** [SANDBOX_DESIGN.md](./SANDBOX_DESIGN.md) (UI aesthetics), [WASM_SLIM_LOAD.md](./WASM_SLIM_LOAD.md), [MODULE_PATTERN_REFERENCE.md](./MODULE_PATTERN_REFERENCE.md).

When in doubt: prefer **honesty, one path, and delete over compatibility**.

### Pitch convention

- **Pitch cable** port key `pitch`, jack stamp **`â™¯/â™­`** (U+266F / U+002F / U+266D). Value is **MIDI note number** (e.g. `69` = A4). Not midi/120 and not midi/127. Do not clamp to 0â€“1. Jack chrome is **white digital** (same family as `Æ’` / Gate), not gold analog.
- **Why ASCII key `pitch`:** C++/native wiring and many string maps are safer with ASCII port ids; the jack **shows** `â™¯/â™­` via `inputLabels` / `outputLabels`. Legacy names (`0.1V/Oct`, `Note#`, `Note#/127`, â€¦) remap through aliases + `normalizeNodeGraphPitchPortName` on load.
- **Hz law:** `hz = tuning Ã— 2^((midi âˆ’ 69)/12)` (or `refHz Ã— 2^((midi âˆ’ refMidi)/12)` with patch Freq Ref). Same law as `pitchHz` / Keyboard `Æ’`.
- **Freq Ref** (`pitchReferenceHz`) + **Pitch Reference Note** (`pitchReferenceMidiNote`): Hz sounded at that MIDI note when a leftover `pitch` consumer converts MIDI â†’ Hz. **Default A4 / MIDI 69 @ 440 Hz.** Saved patches that store 100 Hz @ 48 keep those values.
- **Keyboard `Æ’`** is concert A440 (`440 Ã— 2^((midiâˆ’69)/12)`). Independent of Freq Ref. Wire Keyboard `Æ’` â†’ osc `Æ’` for Hz; wire `â™¯/â™­` into pitch utilities (quantizer, glide, transpose, Phone Tone, Pitch Manager).
- **Keyboard `Velocity`:** gold outlet, 0â€¦1 (`velocity01`). Legacy `Velo#/127` / `Velocity#/127` alias to `Velocity`.
- Hz modules (oscs / most filters): Frequency knob and `Æ’` jack are **absolute Hz**. They do not track `pitch` unless a leftover consumer explicitly does.

---

## 0. Architecture north star

**JS is the interface. C++ runs the circuit.**

| Layer | Role |
|-------|------|
| **JS** | Authoring UI, patch document, cables/knobs, plan/serialize, scopes/faces as **observers**, host glue that talks to native |
| **C++ (WASM)** | Interpret the patch / plan: allocate module instances, wire buffers, run the realtime graph |

- The user writes a **patch in JS** (graph + params). That is not where audio is computed.
- The engine **compiles/interprets that patch into a C++ circuit** and runs it (block processing preferred).
- JS must not be a second DSP runtime that â€œalsoâ€ evaluates the graph sample-by-sample. Transitional hosts that still dispatch per module from the worklet are **debt** toward this north star â€” migrate toward native graph execution, do not deepen JS DSP.

Concrete rules for the current codebase follow in Â§0b / Â§2 / Â§2b / Â§5.

---

## 0b. Minimum Viable Efficient Product (hard cutover)

The **efficient product** surface is the shippable MVEP build. Flag: `nodeGraphMvp.efficientProduct` (**default ON**). Escape hatch for full catalog: `?product=full`.

`acidSequencer` is implemented locally but remains **under construction, untested, and not a finished shop module** for this release. Keep it off the efficient-product allowlist; the module remains defined for WIP testing.

### Live-audio allowlist (SSOT)

Only these live-audio types exist in the efficient build:

| Type | Role |
|------|------|
| `polyBlep` | Oscillator |
| `robinSinusoid` | Recursive sine osc |
| `robinOscillator` | Cycle-dither AA multi-wave osc (mid-cycle Hz warp) |
| `robinSupersaw` | Detuned saw bank |
| `hyperpluck` | PolyBLEP unison pluck (Supersaw detune) |
| `noiseGenerator` | Noise source |
| `ladderFilter` | Filter |
| `softClipper` | Soft-knee saturator (Drive/Threshold/Knee/Amplitude) |
| `tubeSaturation` | Tube saturation (Koren load-line) |
| `reverbEffect` | Sabrina reverb |
| `pingPongDelay` | Delay |
| `attenuverter` | Scale / invert / offset |
| `ampCurve` | Lin/Exp CV shaper for Amplitude params (classic VCA response) |
| `range` | Linear range map |
| `inv` | Invert (`âˆ’in`) |
| `ringMod` | True ring mod (Carrier Ã— Mod, bipolarÃ—bipolar) |
| `u2b` | Unipolar â†’ bipolar |
| `b2u` | Bipolar â†’ unipolar |
| `bias` | DC offset (`in + offset`) |
| `gain` | Master/L/R dB + mono-sum + offset |
| `slewLimiter` | Rise/fall rate limiter |
| `comparator` | Edge detector (Up/Down/Change/Steady/Sign/Thru) |
| `sampleDelay` | Fixed ring delay (Thru + Delayed) |
| `sampleHold` | Sample & hold (Trigger + optional internal clock) |
| `minMax` | 4-in Max/Min selector |
| `mix` | 4-channel mix (volumes/bias/bleeds) |
| `mixStereo` | Stereo pair mixer (true L/R) |
| `midSideEncode` | L/R â†’ Mid/Side matrix |
| `vectorscopeTransform` | L/R â†’ X/Y vectorscope axes |
| `rotate3dTo2d` | X/Y/Z rotate â†’ X/Y project |
| `clock` | Free-running clock (Digital / Analog / Pulse) |
| `triggerDivider` | Divide trigger edges |
| `clockDivider` | Divide Clock edges (duty Ã— measured period) |
| `delayedTrigger` | Delay then pulse on trigger |
| `randomClock` | Random-interval Trigger + Gate |
| `triggerCounter` | Count triggers â†’ Pulse + Count |
| `metallicRatio` | Metallic mean (n â†’ ratio) |
| `lutCell` | 4-in LUT + flip-flop (Out / Q) |
| `lookaheadLimiter` | Brickwall Limiter â€” true-stereo ceiling (Out / L / R / Gain) |
| `limiter` | Pump Limiter â€” threshold/ratio GR, sidechain, Env (Out / L / R / Gain / Env) |
| `sequencer` | Transport-locked piano roll (Play Keys / Polyphony / Gate) |
| `transport` | Master Clock (âˆ’1..1 / 0..1 / Trigger / f Hz) |
| `aliasSine` | Normalized-freq sine (aliases by design) |
| `blit` | Band-limited impulse-train oscillator (Saw/Ramp/Square/Tri/Sine) |
| `sineWavetable` | SinCos4 â€” native sin/cos â†’ A/B/C/D by mode; Method poly/wavetable |
| `sinCos` | SinCos â€” native sin/cos pair; Method poly or additive half-sine LUT |
| `antisaw` | Aliased-partial saw (fundamental / reflections / tilt) |
| `archimedes` | Fixed-point quadrature sine + Ï€ / dither noise taps |
| `additiveOsc` | Native additive partial bank (free-fn; host phase) |
| `surgeOscillator` | Hard-sync PolyBLEP osc (internal or external Sync) |
| `softwaveOsc` | Soft-shaped multi-wave morph oscillator |
| `dsfOscillator` | Discrete Summation Formula oscillator |
| `hypersaw2` | Stereo PolyBLEP saw bank (spread / random / drift) |
| `sinc` | Repeating sinc kernel (Ideal / Band Limit) |
| `bradley2a` | Bradley Telcom jitter/hit impairment synth |
| `phoneTone` | DTMF Phone Tone (Analog/Digital/Gate; Tone/ToneL/ToneR) |
| `ellipsoid` | RoundShape sineâ†’square quadrature (Bi/Uni X/Y) |
| `snowflake` | L-system fractal path walker (X/Y) |
| `butterworth` | Classical Butterworth multipole (LP/HP/BP/BR) |
| `linkwitzRiley` | Linkwitzâ€“Riley (cascaded Butterworth half-order) |
| `bessel` | Bessel multipole (flat group delay) |
| `papoulisFilter` | Papoulis / optimum-L 3-pole lowpass |
| `speakerProtection` | Hard mute if \|x\|>1 / non-finite |
| `speakerProtector2` | Stereo-linked slew VCA + HP trip |
| `attackDecay` | Attack/Decay envelope (Gate/Trigger/Loop/LFO) |
| `bandpass` | EQ SVF bandpass Peak (fixed mode 4) |
| `allpass` | EQ SVF allpass (fixed mode 6) |
| `basicShape` | Naive multi-wave LFO (no AA) |
| `chordPad` | Diatonic triad â†’ Scale / Root / Gate |
| `noteGlide` | One-pole portamento on pitch (â™¯/â™­) |
| `noteTranspose` | Semitone / octave offset on pitch (â™¯/â™­) |
| `degreeTuring` | Shift-register degree sequencer |
| `degreePhrase` | 8-step degree phrase + mutate |
| `gravityWalker` | Inertia / leap degree walker |
| `smoothGraph` | Free-dot global curve modulator (Input Â· LFO Â· Phasor) |
| `stepGraph` | Segment / step-grid curve modulator |
| `phaseDisperse` | Cascaded APF group-delay smear (â‰¤64 stages; CPU âˆ filters) |
| `quadrature` | Hilbert Pair IIR (In/Mid/Side â†’ I/Q/MidI/SideQ) |
| `arp` | Clocked arpeggiator over Arp Keys bitmask |
| `hilbert` | Mono +90Â° / âˆ’90Â° / 0Â° (shared quadrature net) |
| `binaryClock` | Free-run or clocked 1â€“4 bit counter (Out / Bit0â€“3 / Gate) |
| `chebyshev` | Chebyshev Type I (equiripple passband) |
| `elliptic` | Elliptic / Cauer multipole |
| `eqFilter` | ZDF SVF multi-mode EQ |
| `activeFilter` | Active multipole ladder (LP/HP/BP) |
| `passiveFilter` | Passive real-pole LP/BP/HP (native 6 dB/oct) |
| `tb303Filter` | TB-303 diode-ladder style |
| `flowerChildFilter` | Flower Child character filter |
| `yellowjacketFilter` | Yellowjacket character filter |
| `superloveFilter` | SuperLove character filter |
| `humanFilter` | Human character filter |
| `resonatorFilter` | Character resonator (sin/tri/saw) |
| `combResonator` | Delay-loop comb resonator |
| `modeResonator` | Complex 2-pole mode resonator |
| `chaoticPhaseLockingFilter` | Chaotic phase-locking filter |
| `inertialFilter` | Attack/release inertial smoother |
| `expAdsr` | Curve ADSR envelope |
| `linearEnvelope` | Linear ADSR envelope |
| `pluckEnvelope` | Pluck / decay-mod envelope |
| `acousticPluck` | Acoustic pluck (Curve AR + release feedback) |
| `flowerChildEnvelopeFollower` | Attack/hold/decay envelope follower |
| `delayEffect` | Modulated mono delay |
| `soemReverb` | SoEm multi-tap reverb (â‰  sabrina `reverbEffect`) |
| `pll` | Phase-locked loop (VCO / PC / LPF / Locked) |
| `lorenzAttractor` | Lorenz chaos CV (X/Y/Z) |
| `logisticMap` | Logistic-map chaos CV |
| `henonMap` | HÃ©non-map chaos CV (X/Y) |
| `chuaAttractor` | Chua chaos CV (X/Y/Z) |
| `rayBouncer` | Ellipse billiard chaos CV (X/Y) |
| `chordMemory` | 4-slot pitch latch / arp |
| `chordSequencer` | Progression scale/root sequencer |
| `pitchQuantizer` | 12-bit scale pitch quantizer |
| `turingMachine` | Shift-register CV / scale / gate |
| `fractalBrownianNoise` | fBm noise CV (X/Y/Z) |
| `piSpigotNoise` | Ï€-spigot BBP noise (sum/term/hex) |
| `randomWalk` | Seeded random-walk CV |
| `pulseExplosion` | Triggered pulse burst + density curve |
| `spiral` | Jerobeam spiral XY(Z) oscillator |
| `fractalSpiral` | Fractal spiral XY(Z) |
| `logSpiral` | Log spiral XY(Z) |
| `blubb` | Jerobeam blubb XY |
| `boing` | Jerobeam boing XY |
| `keplerBouwkamp` | Keplerâ€“Bouwkamp XY |
| `mushroom` | Jerobeam mushroom XY |
| `nyquistShannon` | Nyquistâ€“Shannon XY |
| `radar` | Jerobeam radar XY |
| `torus` | Jerobeam torus XY |
| `wirdoSpiral` | Wirdo spiral XY |
| `phosphillator` | Path-scan XY oscillator (default circle) |
| `crossover2` | Stereo Linkwitzâ€“Riley 2-way crossover |
| `crossover3` | Stereo Linkwitzâ€“Riley 3-way crossover |
| `crossover4` | Stereo Linkwitzâ€“Riley 4-way crossover |
| `crossover5` | Stereo Linkwitzâ€“Riley 5-way crossover |
| `crossover6` | Stereo Linkwitzâ€“Riley 6-way crossover |
| `output` | Sink (singleton â€” unique, undeleteable) |
| `audioInput` | Live mic/line Input (singleton â€” unique, undeleteable; host capture bus TBD) |

Canonical circuit:

```text
polyBlep â†’ ladderFilter â†’ softClipper â†’ reverbEffect â†’ pingPongDelay â†’ output
(+ robinSinusoid / robinOscillator / robinSupersaw / noiseGenerator;
   attenuverter / ampCurve / range / inv / ringMod / u2b / b2u / bias / gain / slewLimiter / comparator /
   sampleDelay / sampleHold / minMax / mix / mixStereo /
   midSideEncode / vectorscopeTransform / rotate3dTo2d /
   clock / binaryClock / triggerDivider / clockDivider / delayedTrigger / randomClock / triggerCounter /
   metallicRatio / lutCell / lookaheadLimiter / limiter / sequencer / transport /
   aliasSine / blit / sineWavetable / sinCos / antisaw / archimedes /
   additiveOsc / surgeOscillator / softwaveOsc / dsfOscillator / hypersaw2 / sinc /
   bradley2a / phoneTone / ellipsoid / snowflake /
   butterworth / linkwitzRiley / bessel / papoulisFilter /
   speakerProtection / speakerProtector2 /
   attackDecay / bandpass / allpass / basicShape /
   chordPad / noteGlide / noteTranspose /
   degreeTuring / degreePhrase / gravityWalker /
   smoothGraph / stepGraph /
   phaseDisperse / quadrature / arp / hilbert / binaryClock / sinCos /
   chebyshev / elliptic /
   eqFilter / activeFilter / passiveFilter / tb303Filter /
   flowerChildFilter / yellowjacketFilter / superloveFilter / humanFilter /
   resonatorFilter / combResonator / modeResonator /
   chaoticPhaseLockingFilter / inertialFilter /
   expAdsr / linearEnvelope / pluckEnvelope / acousticPluck /
   flowerChildEnvelopeFollower /
   delayEffect / soemReverb / pll /
   lorenzAttractor / logisticMap / henonMap / chuaAttractor / rayBouncer /
   chordMemory / chordSequencer / pitchQuantizer / turingMachine /
   fractalBrownianNoise / piSpigotNoise / randomWalk / pulseExplosion /
   spiral / fractalSpiral / logSpiral / blubb / boing / keplerBouwkamp /
   mushroom / nyquistShannon / radar / torus / wirdoSpiral / phosphillator /
   crossover2 / crossover3 / crossover4 / crossover5 / crossover6
   as utilities)
```

**Also allowed (non-DSP):** scope / monitor faces that **only read** engine buffers. Layout chrome such as `textBox` and chromeless **Input/Output** lane modules (`portalInlet*` / `portalOutlet*`) may remain â€” each lane shows â†’ in and â† thru jacks; outlets also thru-mix into the speaker bus. **Portal IO** (shop) places a linked **Portal â†’ / Portal â†** pair (`namedPortalIn` / `namedPortalOut`, same Title); separate In/Out stay loadable. They are not DSP nodes. Compile rewrites them into ordinary cables: every In of a title fans to every Out of that title, same as drawing the wire. Same title stays inside one universe (root, or one Metamodule, per voice replica) and never crosses a Metamodule shell. A cable that would close a portal loop is refused with the wire-break animation. Container shells: **`group`** = simple one-level boxing (Amplitude only); **`metamodule`** = **voice container** (**Voices** in + Left/Right out; shared Octave/Semitones/Cents/Frequency face params). **Playmode** (Mono / Legato / Voices â€” no Off; default **Voices**) and **Voice Count** (default **10**) live on `node.metamodule` (**Module Settings only** â€” not face sliders, not modulatable). No shell Gate inlet.

**Voice definition:** a voice is the set of modules **owned by** the Metamodule, excluding shell portals. That set is replicated Ã— Voice Count (no Hypersaw/ADSR special-case). The container also exposes **built-in per-voice buses** â€” **Voice Inc**, **Voice Gate**, **Voice Trigger**, **Voice Idle** â€” one instance of each signal **per voice**. Voice Inc is **phase increment** (cycles/sample); wire to oscillator **inc**. Voice Trigger wires to oscillator **Reset**. Gate / Trigger / inc are properties of that voice, not of note-steal policy. A voice does not â€œsteal for itself.â€

**VoiceManager** (wasm) only **assigns notes to voice slots**: `note_on` â†’ Sustaining, `note_off` â†’ Releasing, per-voice **isIdle** â†’ `clean_slot` â†’ Available. When more notes than Available slots: take oldest releasing, then oldest sustaining (allocation across slots â€” unrelated to what Gate/Trigger mean on a voice). **DSP steps only Sustaining + Releasing voices** (Available replicas stay compiled but are not processed). **`isIdle` is rare and explicit (boolean outs):** **envelopes** (ADSR stage Off; Ping Envelope when env &lt; 1e-5) and **reverbs** (SilenceDetector ~1s quiet) â€” not delays, not oscillators. **Voice Idle** only collects those booleans (never measures level). If Voice Idle has no `isIdle` cable: assume idle=false while that voice is on, idle=true when that voice is off (releasing â†’ Available). Blue/gold/MIDI are plain note events â€” monophony only when Meta playmode is Mono/Legato. MIDI/Keyboard **Polyphony** â†’ Meta **Voices**; Play/Arp Keys bitmasks must not be OR'd into Voices.

**Singleton app I/O:** exactly one `output` and one `audioInput` may exist in a patch. Both are shop-visible, `uniqueInPatch`, and **must not be deleted**. Day-to-day routing should prefer Portal In/Out modules; the singletons stay as the app-wide mic/speaker endpoints.

**SSOT:** `public/node-graph-efficient-product.js` â€” used by module shop / Add Module **and** live plan refuse (host + worklet `setPlan`).

### Hard cutover rules

- When `efficientProduct` is on, Add Module / shop catalog offer **only** the allowlist (+ observers).
- Live plan apply / worklet `setPlan` **refuse** foreign types with status **`not in efficient build`**. Do **not** run JS DSP for missing natives or hidden types.
- Dual JS+C++ audio paths are **not** the product. Convert the next type into the allowlist (native + catalog) â€” never reintroduce a JS twin to â€œmake it work.â€
- **Smoother manager is audio/C++ only** on the efficient path. JS may write Control **targets** and **smoothing-time** into engine memory on change; JS must **not** own or step the smoother chase list. (Legacy `?product=full` JS smoothers are debt until removed.)
- **Sample-accurate Control chase is mandatory for every continuous Control on a node during that nodeâ€™s sample loop** â€” not opt-in per knob (Phase is not special; Volume is not special). Graph engine sample loops call **`control_frame(g, node, f)`** once per sample (stamp live MOD + chase all active continuous slots). Trailing `smoother_run` is catch-up only for Controls never heard that quantum. Do not reintroduce â€œremember to call control_audio on this one paramâ€ as the product contract.
- **Sample-path entry is also mandatory** when any of: Control sink (`ParamModEdge`), live continuous SIGNAL IN (Æ’ / pitch / Phase CV / inc / â€¦), or active Control chase. Dual-path natives use **`node_needs_sample_accurate_controls`**. Do not paper over with `stamp_live_param_mods(..., 0)` on a block path.
- **Intentional ZOH allowlist only:** Additive/Yellow morph (`zohOnlyTypes` + `morph_zoh_hold` for cyan Morph CV), discrete/enum params, cyan controller `set_param_mod`. Everything else Continuous+MOD is sample-accurate.
- **CI:** `scripts/check_graph_engine_contracts.py` + ParamModEdge smokes in `build_native_modules.ps1` â€” regressions fail the build, not hearing tests.
- **Parameter stickiness (non-negotiable):** when the host writes a Control **target**, that target (and any DSP coeffs derived from it inside a module) must **remain in effect until the host writes a new target**. Do not wipe / re-push / re-default every gesture frame. Do not store live coeffs where the next `set_params` / buffer grow silently zeroes them. â€œWorks while dragging, reverts when releasedâ€ = this contract is broken.
- **MOD is not a smoother target.** `set_param` writes the **knob** only; `set_param_mod` writes MOD accumulators; DSP reads `control_effective` = applyMod(`Control.out`, MOD). Smoother and MOD run alongside â€” never fold MOD into `target`, and never disable the smoother because a cable is present.
- **One native edge model (Port sink | Control sink).** UI may keep `connections` vs `modulations` for jack chrome; the engine stores a unified `Edge` list. Audio â†’ param MOD is a **Control sink**, not a second graph. **Feedback / self-mod uses 1-sample history (`hist` / zâ»Â¹)** â€” never wipe `buf` then stamp from the same wiped `buf`.
- **Efficient AudioWorklet blob does not load JS DSP evaluators** (`node-live-audio-worklet-evaluators*`, `evaluate-frame.js`, or per-module `*-worklet-evaluator.js`). Audio is **native graph only** (`processNativeGraphQuantum`); `process()` early-returns after that path and never calls `evaluateFrame`. Legacy evaluator sources load only for `?product=full`.
- **No ScriptProcessor JS DSP fallback under efficient.** If AudioWorklet fails, Live start **errors** â€” it must not call `evaluateNodeGraphPlanFrame` / live-evaluator kernels. JS audio path = bug.
- **No JS DSP evaluator blob on any product path.** `nodeGraphLiveWorkletSourceFilesLegacy` is retired (empty). Worklet loads native-graph host only.
- **Render Sample = same native graph as Live** (OfflineAudioContext + efficient worklet / `soemdsp_graph_*`). Never `evaluateNodeGraphPlanFrame` for product bounce.
- **Music Player (`audioPlayer`):** native `audio_player` opcode + phosphillator-style PCM upload (`set_pcm` / `l_ptr` / `r_ptr`). Decode stays main-thread; playlist UI stays JS. Full tracks allocate with `memory.grow` (same idea as holding the file in JS RAM).
- **Yellow Graph:** native opcodes **111â€“124** (Generator, Bubble, Out, Linear/Analog/Ladder filters, FrequencySkew, Quantize Freq/Phase, Pan, Noisy*). Graph port **23**. Efficient Live blob does **not** load the Yellow JS sidecar; DSP is native only. `additiveImage` stays out of the efficient allowlist until analysis ships.

---

## 1. No legacy helpers â€” patches break, Architect repairs

**No legacy code helpers for old patches. Ever (while preâ€“feature-complete).** Agents must not â€œhelpâ€ saved patches keep working.

While the product is not feature-complete:

- **Patches may break.** That is intended. Broken patches are repaired by the **Architect (Argi)** â€” not by adding compatibility code.
- **Do not** add legacy helpers, rename bridges, dual param keys, dual port ids, migration layers, fallback readers (â€œread `level` if `brightness` missingâ€), or dead aliases so old saves keep loading.
- **Do not** invent soft recovery, silent remaps, or â€œjust in caseâ€ shims when a rename or schema change lands. One key, one label, one code path.
- Prefer **fail loud** (missing param â†’ default / missing module â†’ refuse / unknown key ignored as absent) over hidden translation. Complexity from legacy paths causes more bugs than broken patches.
- Renames are **clean**. Old patches that no longer match are expected to fail until the Architect fixes them.

When feature-complete (or when the Architect explicitly chooses later): introduce migrations only as a deliberate, versioned patch format â€” never as ad-hoc helpers landed by agents.

---

## 2. C++ owns the circuit; JS does not compute audio

This app is a **C++ DSP engine with a JS interface** (Â§0). JS authors and observes; C++ wires and runs.

- **JS must not implement module audio** (per-sample or per-block kernels): no filters, delays, oscillators, clippers, reverbs, or other signal math in the AudioWorklet / offline â€œDSPâ€ path.
- **Module DSP lives in native/WASM (C++)** under `native_modules/â€¦` (and soemdsp atoms where applicable).
- Until the full graph runs in C++, the JS worklet is only a **host**: resolve Control/Live params, call native `process` / `process_block`, pass buffers, observe for scopes/UI â€” not a JS interpreter of the circuit.
- Prefer **`process_block` (quantum-sized)** over per-sample WASM exports when feedback rules allow.
- **No JS twin** â€œin case native fails.â€ If native is missing or cold: **silence / black / inert** (optional status), not a second algorithm.
- Face/display may present native results but must **not** re-implement the audio kernel in JS or GLSL for â€œlooks only.â€
- Same rule offline: Render Sample uses the **same native core** (see Â§5).
- **Match the moduleâ€™s channel model â€” do not invent stereo inside natives.** A mono utility stays mono-per-handle (`process_block` on one buffer). The graph folds Mono+L+R and fans Out when the patch presents stereo jacks (same pattern as attenuverter / range / bias). True-stereo modules keep independent L/R state because the algorithm is stereo â€” not because the UI has Left/Right jacks.

### Sine SSOT (wavetable)

- **Default pure-tone sine** in oscillators / LFOs / taps must come from the **shared half-sine wavetable** (`dsp_sin_turns_lut` / `dsp_sin_cos_lut` in `library/include/soemdsp`, same LUT Additive / Vibrato / SinCos use). Do **not** invent a per-module Taylor-about-zero on wrapped Â±Ï€ (that clicks once per cycle).
- **SinCos** and **SinCos4** expose **all** available sin methods as an explicit Method control: **Wavetable** (default), **Polynomial** (joint quadrant poly), **std::sin** (platform/`__builtin_sin`), **Taylor** (quadrant-folded Taylor â€” must be continuous at cycle wrap; never evaluate raw Taylor at Â±Ï€).
- **Exceptions** (documented, not silent forks):
  - **RobinSinusoid** â€” iterative / recurrence sine (special case).
  - Modules that need sin/cos as **kernel math** (BLIT sinc, DSF, filter coeff helpers) may use shared `dsp_sin` / `dsp_sin_cos` polys â€” still from `library/include/soemdsp`, not a private clicking approx.
  - A module may ship wavetable **plus** other Method choices (SinCos / SinCos4); product default remains wavetable.

---

## 2b. Delay / large buffers: pay for what you use

- **Delay time does not add CPU.** A longer delay is the same per-sample work (write + read + any once-per-sample FX). Do not treat max delay as a CPU cost.
- **RAM must match the live delay need**, not a worst-case slot reserved forever.
  - If the delay is 1 s, hold about **1 s** of ring (plus small modulation/headroom margin), not 8 s â€œjust in case.â€
  - Do **not** bake `kMaxInstances Ã— kMaxDelaySeconds` stereo rings into BSS when most slots are empty.
- Prefer **per-instance buffers** sized to that instanceâ€™s current max needed length; grow with `memory.grow` (or an equivalent arena) when the delay setting increases; release or recycle on destroy.
- A single shared arena + offsets is optional packing â€” **not** required for speed. Correct sizing per live delay is the requirement; layout is secondary.
- Hard caps (max delay seconds, max concurrent instances) may exist as safety limits, but unused capacity must not sit pre-reserved for idle instances.

---

## 3. Prefer GPU for module display graphics

- Module faces, scopes, fields, phosphor-style displays: **prefer GPU** (WebGL / existing scope GPU paths).
- Avoid CPU pixel loops / 2D canvas full-frame paint for live module displays when a GPU path exists or can be added.
- CPU is OK for: one-shot layout, debug overlays, tiny markers, metadata â€” not the main live image.

---

## 4. What I See Is What I Hear (WISIWIH)

- Face and audio outputs must share the **same domain mapping and kernel** for a given module (or document a deliberate, labeled exception).
- Do **not** give the face a prettier separate noise/field while jacks sample something else.
- Display-only knobs that change look without affecting the shared signal are a **WISIWIH smell** â€” either wire them into the shared path or make clear they are cosmetic (prefer wire).

---

## 5. Module DSP lives in one place (C++)

**Hosts are not DSP.** Live AudioWorklet, offline/Render Sample, and main-thread code are **hosts** that call one C++ implementation. They must not each own a different formula for the same module type.

### Single core

- **Module DSP lives in one place: native/WASM (C++)** (`native_modules/â€¦` / soemdsp). Not a worklet JS copy and a render JS copy that can drift.
- Legacy `*-math.js` helpers are **not** a second approved DSP home for new work; migrate them into C++ and delete the twin.
- Offline and realtime **reference that same native core**. The only intentional difference is **scheduling** (device quantum vs bounce length / block size), not the waveshaper, filter, or feedback math.
- Do **not** maintain diverging â€œworklet versionâ€ vs â€œrender versionâ€ of the same module without a tracked, labeled reason (and fix the split rather than document it as normal).

### Live chaos and video (one universe)

- While playing: **one** dynamical evaluation (the worklet). Faces, scopes, phosphor, and video **observe** that run (buffers / rings from the worklet). They must not re-simulate the graph with a second set of phases, noise seeds, or integrators.
- **What I see is what I hear** under feedback and chaos requires **one state**, not â€œsame knobs, two sims.â€

### Offline / Render Sample

- Offline is the **same modules, same core**, stepped without the audio device clock â€” not a parallel JS approximation of the live native path.
- Prefer the **same native export** on main thread for render when the live path is native (lazy instantiate WASM; silence until ready â€” see Â§2). Do not invent a second algorithm â€œso offline works before WASM loads.â€
- A bounce may be a **new take** (new seeds / cold start). That is still the same engine; it is not license to use different math.

### Dual evaluation is not the goal

- Live A/V sync is **one sim, many observers** â€” not two full graphs forced to stay identical.
- â€œIdentical pure functions on two threadsâ€ still yields two trajectories under chaos if both step state. Prefer capture over re-run for live display.

---

## 6. Transport and status UI must match engine reality

- Play / pause / stop / Output labels and colors follow **actual** live node + output state, not optimistic or stuck UI.
- Do not leave â€œzombieâ€ engines (muted worklet still up, UI says Off) or green transport when cold.
- Prefer full teardown on failure over silent mute + misleading chrome.

---

## 7. No artificial smoothness on discontinuous domain params

- Parameters that **reshape the domain** (scale, lacunarity, zoom, seed, octaves, â€¦) may jump the field when scrubbed â€” that is often **correct**.
- Do not invent crossfades or dual-field morphs solely to hide that unless product asks for it.
- Parameter-edit smoothers (one-pole, etc.) are optional UX; they are not a substitute for honest domain math.

---

## 8. Diagnostics and teaching graphics: debug-only

- Probe markers, mode tags, self-test chrome, evidence dumps: **debug UI on** only (e.g. `node-debug-only` / not under `keyboard-debug-hidden`).
- Production/default face stays clean.

---

## 9. Build identity and cache honesty

- Serve a rolling **build token** (and no-store on shell) so humans can confirm they loaded the build they think they loaded.
- When changing public JS that must not be cached stale, bump cache-bust query (or rely on build-token bust of scripts).

---

## 10. Prefer delete and simplify over soft recovery

- Invalid patches / failed loads: **hard fail with clear status**, not silent soft recovery that leaves unknown state.
- Prefer one obvious error path over multiple â€œbest effortâ€ branches that hide bugs.

---

## 11. Naming

- **I/O jack label `inc`:** user-facing phase-increment ports (cycles/sample) display as lowercase **`inc`** â€” do not capitalize as `Inc`. Prefer port id `inc` (legacy cables: alias `Inc` / `Increment` â†’ `inc`). Oscillator inputs may keep machine id `Increment` with display label `inc`.
- **Pitch-family jack order:** when a module exposes any of **â™¯/â™­** (`pitch` / `#/b`), **Æ’** (`f` / `Frequency`), and/or **`inc`**, list them in that order â€” **â™¯/â™­, then Æ’, then `inc`** â€” and keep them adjacent. Applies to Keyboard, Arp, Pitch Detector, Pitch Manager, Freq Manager, etc.
- Prefer full, consistent product names where modules are siblings (e.g. **Fractal Brownian Field** next to **Fractal Brownian Motion**).
- Internal type ids (`fbmField`) may stay short; **user-facing labels** should not be cryptic abbreviations unless established brand.

---

## 12. UI stability (see also SANDBOX_DESIGN)

- No mouse-following tooltips / `title` hover clutter.
- No layout jitter from changing labels.
- Calm idle chrome; earn brightness with state.

---

## 13. Stereo jacks: M / L / R (not L / M / R)

App-wide stack order and jack chrome. Names keep their color; **Mono is always first** when present.

| Order | Channel | Jack color |
| --- | --- | --- |
| 1st | Mono (`M`, `Mono`) â€” **explicit** | **Green** |
| â€” | Generic analog (`In` / `Out` / `Input` / `Output`, unlabeled CV) | **Gold** (uncolored) |
| 2nd | Left (`L`) | Red |
| 3rd | Right (`R`) | Blue |

**Gold = analog.** Bare `In`/`Out` are sample-accurate analog â€” **not** purple. **Green only when the port is explicitly Mono** (name or label `Mono` / `M`). Filters that mean mono should use port name `Mono` or label `In`â†’`Mono` (label path paints green).

**Jack inventory must match engine capability â€” no stereo ports on mono-only modules.** Musical filters keep M+L+R (true independent L/R where the engine dual-handles). Scientific filters may be mono (`In`/`Out` only, gold) until converted to real stereo.

RGB modules: `R` red, `G` green, `B` blue (`R` is never Right).

Chaos XYZ is RGB **by name**, not by slot: **X red, Y blue, Z green**. Unlabeled generic analog (no channel) stays gold by side.

- Channel chrome on **inlets and outlets** the same way. Uncolored analog stays gold. Cables follow jack colors when UIDEV **wires follow port colors** is on (default). Dual-color gradient still matches both ends. Digital stays white. Off = gold analog / white digital.
- Full write-up: [MODULE_LAYOUT_PLAN.md](./MODULE_LAYOUT_PLAN.md) Â§11.
- SSOT: `public/node-graph-jack-chrome.js` (`nodeGraphJackStereoChannel` / `nodeGraphJackChannel`).

### CMYK non-realtime plane (additive proving ground)

Additive modules use a **CMYK** jack story for **non-realtime** ports (once per audio quantum). Product name **â€œYellow Graphâ€** matches live chrome (**Yellow** Graph + **Cyan** Parameter). CMYK **M** and **K** stay reserved unused.

| Ink | Role | Color | Rate |
|-----|------|--------|------|
| **C (Cyan)** | Additive / graphics Parameter (block-rate ZOH Morph CV, â€¦) | **Cyan** (`#00e5ff`) â€” not turquoise | **1 sample per quantum, held** |
| **M (Magenta)** | *Reserved unused* | â€” | â€” |
| **Y (Yellow)** | Graph in/out (harmonic Graph chunk, â€¦) | **Yellow** (`#ffe600`) | **Data-plane payload once per quantum** |
| **K (Black)** | *Reserved unused* | â€” | â€” |
| Digital (Æ’ reports, Scale, â€¦) | â€” | White | Event / value |
| Audio / sample-accurate CV | â€” | Gold / RGB (L/R/Mono)â€¦ | Every sample |

**Smoothers vs cyan Parameter jacks**

- **Parameter smoothers** are allowed to emit a **sample pack** (Control chase can advance every sample into `Control.out`).
- **Cyan Parameter inlets** do **not**: the module reads the wired signal **once per block** (and/or reads the Control once per block) and **zero-order-holds** it.
- Additive Morph / waveform / harmonic-count style knobs follow that ZOH read even when only the slider is used â€” expensive table work stays block-rate.

List cyan Parameter ports on the definition as `blockRateInputs` / `blockRateOutputs` (same pattern as `digitalInputs` / `digitalOutputs`). Ordinary Morph / CV inlets that are **sample-accurate** (PolyBLEP, Softwave, Ellipsoid, DSF, â€¦) stay **unlisted** and paint **gold** â€” do not mark them block-rate just because the knob is named Morph.

**Additive series exception:** parameter-row **mod jacks** (and matching slider-out jacks) on `additiveGenerator` / filters / Growl / NoisyFreq|Phase|Pan|Amp / `additiveOut` paint **cyan** even though they are modulation ports (not left-column IO). Graph cables follow jack color â†’ **yellow** (YellowWire).

**Setup parameters** (`setup: true` on the param â€” Cookbook Topology / Stages): not Additive cyan. Param-row jacks are **purple square** (existing param purple, square shape). Automatable once per quantum (host / OSC / Knob sampled into the Control); not sample-accurate CV. Changing Topology or Stages **resets** filter state. Cyan stays Additive / graphics.

**Yellow Graph chunk ports**

- Carry a **multidimensional** once-per-quantum payload on the data plane (`dataInputs` / `dataOutputs`): `{ phase[], ratio[], amplitude[], pan[] }` (`pan` bipolar âˆ’1â€¦+1; final plane consumed by Additive Out Left/Right).
- Not audio-rate sample packs. Port name **`Graph`** on both inlet and outlet sides is **yellow**.
- Additive chain: Generator â†’ Linear/Analog Filter, Growl, Noisy* â†’ Out (Mono / Left / Right).

**Yellow Graph parameters â€” real units (DOMAIN)**

- Storage, slider readouts, effect math, and **parameter-out jacks** use **DOMAIN** (Hz, cycles, harmonic count, â€¦) â€” **never** normalize to 0â€¦1 for display or Graph-module communication.
- Example: Growl **Phase Skew** is cycles **0â€¦1000** (Hydrus); the value sent into DSP and out the cyan param jack is that number, not `skew/1000`.
- Ordinary params may still emit unit 0â€¦1 on param-out for Uni/Bi CV chaining (`nodeGraphParamDomainToModOutput`). Continuous Additive rows that need real-unit MOD/param-out set `outputDomain: true` **on that parameter** (PWM, Phase Rotation, Hz, â€¦). Choice rows never do â€” they are 0â€¦N like every other choice slider.
- **Smoothing:** same surfaces as every module (mouse travel unit 0â€¦1 â†’ DOMAIN target â†’ existing L/1P/â€¦ kernels). Native Yellow path uses graph_engine Controls.

---

## 14. Resize widgets: hover only

- Floating-window SE grips (`.scene-context-resize-handle`), phone/condensed frame resize (`.node-graph-resize-handle`), and other app resize grips stay **visually hidden when idle**.
- **Show** on parent hover, handle hover / focus, or while actively dragging (`.dragging` / workspace `.resizing`).
- Hit targets may remain live under opacity `0` so the corner is still findable; locked windows stay non-interactive.
- Do not leave always-on glowing resize chrome on idle panels.

---

## 15a. Instant Waterfall is never the default face or settings schema

**Instant Waterfall (`displayType` / form type `"waterfall"`, also `"waterfallRgb"` / `"waterfallXyz"`) is opt-in only.** Do not invent it.

**1D Trace is separate:** modules `scope1dTrace` / `scope1dTraceStereo` use `displayType: "scope1dTrace"` (heart-monitor sweep via TraceWoscope / TraceStroke). That is **not** Instant Waterfall and must not share the waterfall settings schema.

- A module with no `displayType` is **`layoutOwned`**: no canvas, blank Display Settings.
- A custom renderer (`ensembleCloud`, envelope curve, â€¦) is **not** Instant Waterfall. Unknown form types use **blank** controls (empty fields). They must **not** fall through to `normalizeNodeGraphWaterfallSettings` (red plate, History, Blur, stereoâ€¦).
- `HasLocalSettings` / settings-apply / form-io / `SettingsForNode` may write Instant Waterfall **only** when the module **declares** `displayType: "waterfall"` (or `waterfallRgb` / `waterfallXyz`).
- The **global** Display Settings editor (no node selected) is Instant Waterfall on purpose â€” that is app-wide Output/osc defaults, not a module fallback.

---

## 15. Display length: zoom pixelates; display size redraws

A **display** is one scaled object. Changing the faceâ€™s **layout CSS box** (plate, layout-canvas tile, screen solo) scales type, strokes, pads, radius, and GL/2d resolution together (`min(cssW, cssH)`).

- **Workspace zoom is not a resize.** Zoom pixelates. Do **not** redraw phosphor / trace / waterfall / WebGL at a higher backing size because the user zoomed. Do **not** rewrite `font-size` on zoom.
- **Display size change is not a zoom.** New CSS box â†’ `syncFaceMetrics` â†’ resize backing `css Ã— dpr` â†’ redraw.
- **F-cycle reparent** is not a size change unless the layout CSS box changed. Do not write inline px from `clientWidth`.
- **Measure:** layout box (`offsetWidth` / face metrics cache). Never `getBoundingClientRect` for draw scale.
- **`minSide` is `metrics.cssW/cssH` (layout), never `canvas.width` (dpr) and never `rect.width` (zoom).**

Two stored kinds:

| Kind | Store | Paint |
|------|--------|--------|
| **Ink** | CSS px at `FACE_INK_REF_PX` (96) | `faceInkPx(setting, minSide)` â†’ `setting * minSide / 96` after `setTransform(dpr)` |
| **Layout fraction** | `0â€¦1` of min-edge | `faceFracPx(unit01, minSide)` |

- **Normalize/settings:** `clampAuthoredInkPx` â€” authored number, **no geometry**. Never pass `minSide` into normalize.
- **DOM type/radius/stroke** that follow the face: container query units (`cqmin` / `cqh` / `cqw`). `textScale` multiplies `font-size`, not `transform`. JS may clear leftover inline sizes; it may not bake px.
- **Helpers:** `public/lib/visual/display-scale.js` â€” `faceInkPx`, `faceFracPx`, `clampAuthoredInkPx`, `faceMinSide`, `clampDisplayUnit01`.
- **Defaults:** px literals for ink (`2`, `1.5`) at a ~96 px min-edge; 0â€¦1 for fractions. No `if value < 1 treat as 0â€“1.`
- **Brightness / hue / fade** stay 0â€¦1. **Time** stays seconds. **Counts** stay integers.

**Paint vs layout (display-type contract):** live face paint loops must **not** force layout (`clientWidth` / `getBoundingClientRect` / style writes that change geometry) every frame. ResizeObserver + settings apply own chrome and canvas backing size; paint reads a metrics cache. Visibility uses module `viewport-asleep` cull, not per-frame layout probes. Faces stay live during workspace pan/zoom (see ZOOM_PAN plan â€” no gesture freeze).

Helpers: `public/lib/visual/display-face-metrics.js` (`ensureFaceMetrics` / `syncFaceMetrics`); Music Player phosphor layout cache; Instant Waterfall screen items use **layout-space face boxes + camera math** (pan must not remasure). Workspace CSS size: `nodeGraphWorkspaceCssSize` (ResizeObserver).

First consumers: Music Player, fbmField, Instant Waterfall compositor, RoundShape / curves / Harmonic / additive faces, asciiscope / imageBurn / matrix.

---

## 16. Workspace vs displays (soft preference)

| Layer | Owns | Prefer not to |
|-------|------|----------------|
| **Workspace** | Module shells, ports, wires, pan/zoom camera, DOM chrome, Display Settings windows | Paint DSP/visual face content with CSS text hacks |
| **Displays** | Face visual content (waveform, Instant Waterfall, FBM, curves, â€¦) | Drive workspace layout; fake face pixels with stretched HTML overlays |

**Preference, not a hard ban:** use **WebGL for most visual faces** (waveforms, Instant Waterfall, fields, curves, knob graphics). Use **DOM where the job is real editable text** (Text Box / `contenteditable`) or chrome beside the face (playlist, transport, Display Settings).

- Do **not** stretch face glyphs with CSS `transform: scale(sx, sy)` or non-uniform buffer/CSS aspect.
- Do **not** force Text Box through WebGL (IME, caret, selection, a11y).
- Migrating Canvas2D visual drawers toward WebGL is the direction; donâ€™t invent new HTML-as-bitmap hybrids for DSP faces.

---

## Quick â€œshould I?â€ checklist

| Idea | Usually |
|------|---------|
| Keep old param key so last week's patch works | **No** â€” break the patch; Architect repairs (Â§1) |
| Add a legacy helper / rename bridge / dual key so an old patch still loads | **No** â€” no legacy helpers (Â§1) |
| Soft-remap or silently alias a deleted port / param | **No** â€” fail loud; Architect repairs (Â§1) |
| JS noise if WASM not ready | **No** â€” silence / black |
| CPU full-face fractal every frame | **No** â€” GPU / native grid |
| Face noise â‰  jack kernel | **No** â€” WISIWIH |
| Smooth scale scrub so it â€œsounds niceâ€ | **No** unless product asks |
| Probe reticles always on | **No** â€” debug only |
| Dual path â€œjust in caseâ€ | **No** â€” one path |
| Second formula for offline/render | **No** â€” same core as live (Â§5) |
| Re-sim graph for live video/scopes | **No** â€” observe worklet buffers (Â§5) |
| JS twin of native â€œso render worksâ€ | **No** â€” silence until WASM (Â§2 / Â§5) |
| JS computes the audio graph / per-sample DSP | **No** â€” JS is interface; C++ runs the circuit (Â§0 / Â§2) |
| Offer non-allowlisted DSP in efficient product shop | **No** â€” allowlisted live-audio types + observers (Â§0b) |
| Apply plan with foreign audio types in efficient mode | **No** â€” refuse: `not in efficient build` (Â§0b) |
| JS DSP fallback when type is off the efficient allowlist | **No** â€” hard cutover (Â§0b) |
| New `*-math.js` audio kernel instead of C++ | **No** â€” native only (Â§5) |
| Prefer `*_sample` WASM when `process_block` exists | **No** â€” use block boundary (Â§2) |
| Reserve 8 s Ã— N delay rings in BSS for empty slots | **No** â€” size to live delay (Â§2b) |
| â€œLonger delay = more CPUâ€ | **No** â€” same tap math (Â§2b) |
| Always-visible resize grip on panels | **No** â€” hover / drag only (Â§14) |
| Resize WebGL / canvas buffer because workspace zoomed | **No** â€” zoom pixelates (Â§15) |
| Store ink (stroke / HUD font) as 0â€¦1 of face min-edge | **No** â€” px at 96; `faceInkPx` at paint (Â§15) |
| Draw filter/EQ/scope strokes as a constant 1â€“1.5 px regardless of face size | **No** â€” ink scales with the display (Â§15) |
| `clampAuthoredInkPx` with geometry / `faceInkPx` without `minSide` | **No** â€” store vs paint (Â§15) |
| Pass `getBoundingClientRect().width` or `canvas.width` as `minSide` | **No** â€” layout `metrics.cssW/cssH` (Â§15) |
| Inline `font-size` px from `clientWidth` (FitCaption) | **No** â€” container query units (Â§15) |
| `transform: scale(textScale)` instead of larger font | **No** (Â§15) |
| Publish tile-measured px vars onto shared face DOM | **No** (Â§15) |
| Store layout fraction (inset / radius / pad) as CSS px | **No** â€” 0â€¦1 of face min-edge (Â§15) |
| Stretch face text by widthâ‰ height | **No** â€” uniform min-edge only (Â§15) |
| Stretch HTML as fake face pixels / force Text Box through WebGL | **No** â€” WebGL for most visuals; DOM for editable text (Â§16) |
| Dual `labelInsetPx` + `labelInset` for compatibility | **No** â€” one key, clean rename (Â§1 / Â§15) |
| Wipe Control dirty-cache / re-push all knobs every `setParams` | **No** â€” stickiness (Â§0b); cold push only after compile/destroy |
| Nested DSP coeff objects in instance pools that lose writes | **No** â€” flat fields on the instance; smoke â€œset once, process manyâ€ |
| `x \|\| default` or `x > 0 ? x : magic` on a stored setting | **No** â€” 0 is a value (Â§18) |
| Copy the same helper into a second module `.cpp` | **No** â€” use / extend `library/include/soemdsp` (Â§19) |
| Edit `library/include/soemdsp` without Architect OK | **No** â€” propose first (Â§19) |

---


## 17. No duplicate inputs that are parameters

**Do not ship a left-side CV / audio input jack that is only a duplicate of a modulatable parameter.**

- If a value is already a **parameter** (knob + normal param MOD), do **not** also expose an input jack that adds/multiplies the same value â€” including **PM** as a twin of **Phase**, **Morph** CV, **Amplitude** CV, etc.
- **Morph / Phase / Amplitude / PM (phase-mod) CV twins of params are disallowed** (standing approval to remove). Keep the parameter; drop the jack and any dedicated add/mul twin path so the param alone drives the value (normal param modulation still applies).
- **Reset** and **Increment** are not twins of Frequency/Phase: they are different operations (edge reset, cycles/sample add). Those stay as inputs.
- **Other** twin removals (e.g. Size/Opacity, Speed, Spawn) need **human approval** first â€” do not remove without asking.
- Gravity Walker **Leap** input was an approved twin of the Leap param: removed; `leapProb` = clamp(leap param only).


## 18. A stored 0 is a value

**Do not treat 0, âˆ’1, or any other in-range number as â€œmissing.â€**

- `x || default`, `x ?? default` used so that 0 falls through, and `x > 0 ? x : magic` are forbidden on settings, parameters, and modulation. They turn an exact 0 (or a hair past Â±1) into a different mode.
- **Missing or non-finite** (absent field, `NaN`) may use a default. **A stored 0 stays 0.**
- **Clamps** are allowed: a control can have a minimum (wire thickness, tooltip height) or a maximum. The clamp is the range. It is not a second hidden default.
- **Use real mod values** is the only switch that makes a cable a raw unit (Hz and the rest). Otherwise the cable is an offset inside the parameter range and is clamped there. Crossing Â±1 does not retag it.
- DSP may still refuse numbers that explode (Nyquist, speed limit). That clamp lives in the DSP, not in the settings reader.
- Do not save a window whose width or height is 0. That is â€œno window,â€ not a setting of 0.

---


## 19. Shared library maths â€” do not copy kernels

**Use `library/include/soemdsp` for shared equations and behaviors.** Do not paste the same helper, formula, or kernel into multiple module `.cpp` files when a library function already exists or belongs there.

- Prefer `#include` + call into `soemdsp::math` / topic headers (`scalar_helpers`, `poly_blep`, `midi_hz`, `exp_log`, `phasor`, `dynamics`, `trigger`, `nonlinearity`, `analog_filter_trig`, â€¦) over local clones of clamp/wrap/lerp, soft-clip, one-pole, polyBLEP, MIDIâ†”Hz, and the rest.
- Module-specific DSP stays in that moduleâ€™s `.cpp`. Shared math that appears (or will appear) in more than one place belongs in the library â€” once â€” not as copy-paste twins that can drift.
- Sine / LUT defaults still follow Â§2 (Sine SSOT). This section is the broader â€œone library, no forksâ€ rule for all shared maths.

### Architect gate on `library/include/soemdsp`

**Edits and additions under `library/include/soemdsp/` require prior approval from the Architect (Argi).** Agents and contributors must not add helpers, change signatures, or refactor topic headers without that sign-off. Propose the change (what, why, which callers) and wait for yes before touching the library.

## 20. Do not hardcode quantization the step already owns

**Do not hardcode quantization of a parameter in DSP or in the native param push when leaving it continuous has no consequence.**

That ban applies only when all three are true: there is no consequence for leaving the value continuous, the DSP does not need an integer or a stepped value, and the parameter can already quantize through its own step. A hardcoded round or discrete snap in that case fights the parameter step. Do not do it.

**Pitch Manager** octave and semitones were forced to integers even after step was set to 0. **Frequency Manager** octave and semitones are the same case as Pitch Manager: do not hardcode them discrete when the parameter step can already quantize them.

## Amendments

Add new rules here when the same class of mistake happens twice. Keep this file short and enforceable.

- **2026-09-27 â€” LayoutA I/O above the face:** LayoutA module inlets and outlets sit in the band **above** the display / face (`header â†’ io â†’ face â†’ params â†’ lip`). Sample load controls stay under the face. Display off and Display Height 0 omit the face track; I/O stays under the header. **LayoutB** (ports beside the face) and **InletOutletLayout** (title + I/O, no face) are unchanged. Do not keep a second stack or a patch shim for the old face-then-I/O order. Contract: `docs/MODULE_LAYOUT_PLAN.md`.

- **2026-09-27 â€” No legacy helpers (Â§1):** Patches may break after renames/schema changes. The Architect repairs them. Agents must not add legacy helpers, dual keys, rename bridges, or soft remaps to keep old saves working â€” that complexity causes more bugs than broken patches.

- **2026-09-27 â€” Shared library maths (Â§19):** Prefer `library/include/soemdsp` over duplicated equations/behaviors across modules. Changes to that library need Architect (Argi) approval first.

- **2026-09-27 â€” Display follows Title (Policy B):** Module Settings **Display** is an optional override. Empty/unset Display â‡’ effective display = module **Title** (alias / default). Non-empty Display â‡’ that text. Clearing Display snaps back to Title (no blank labels). Shared helpers: `normalizeNodeGraphPatchNodeDisplay`, `nodeGraphPatchNodeDisplayOverride`, `nodeGraphPatchNodeEffectiveDisplay` in `node-graph-patch-clone.js`. `nodeGraphNodeDisplayName` uses effective display. Module chrome **Title** bar stays on Title (alias) for rename. Named portals: jack/IO label = effective display; **SyncBusAlias** / **wirelessRole** / color inheritance stay on Title. InletOutletLayout Module Settings keep Title + Display; restore show/hide Title; leave buttons / collapsed / unused / in-out / disable / save-to-default stripped.

- **2026-09-03 â€” Parameter stickiness:** A continuous knob must chase to the written target and **stay**. Two failures of the same class: (1) JS tied `forceAll` param sync to `planSerial` so every gesture frame wiped the dirty cache and re-stormed `set_param` / smooth / domain cells, fighting Control chase; (2) ping-pong feedback coeffs lived in nested structs whose writes did not survive across `set_params` / buffer setup, so the DSP ran pass-through until the next write (sounded correct only while dragging). Fix: cold force-push only after graph compile/destroy; store live coeffs as plain fields on the instance; build smoke must **set once then `process_block` many times** without rewriting params.
- **2026-09-24 â€” Stored 0 is a value (Â§18).** Modulation used `|v| > 1` as a hidden â€œthis is Hertzâ€ switch, so âˆ’1 and âˆ’1.00001 took different paths. Settings did the same: history length 0 became 4 Hz, and a zoom-max of 0 became 10 s. Missing/NaN may still default. A number the user stored may not be replaced. Clamps stay clamps.
- **2026-09-10 â€” Display length 0â€“1:** Face geometry mixed CSS px (`labelInsetPx`, `traceWidth`), percent (`cornerRadius` 0â€“100), and true 0â€“1 (`edgeSpacing`). Layout fractions stay **0â€¦1 of min-edge**.
- **2026-09-25 â€” Ink is authored px, scaled by face:** Strokes/HUD are CSS px at a 96 px reference min-edge, then `Ã— min(faceW,faceH)/96` at paint. Constant CSS px (ignore face size) made filter/EQ curves hairline when the display grew. Workspace zoom still must not be multiplied into `lineWidth`. No patch migration.
- **2026-09-10 â€” Legacy display scrub:** Raster/Matrix chrome â†’ `edgeSpacing`/`cornerRadius` 0â€¦1 (no `screenPadding`/`rounding` %). Phosphor residual SSOT = `trail`/`ghost`/`burn`/`burnAmount` (no `decay` mirror, no burn-as-ghost). Dropped `sweepSeconds`, xyPad `scale`â†’puck, spectrogram overlap+1 shift. Yellow sidecar type/param aliases deleted. Display renderer id `"legacy"` â†’ `"layoutOwned"`. Dead module-frame gapped-SVG path deleted (workspace/faces stay layout **px**; displays/canvases stay **0â€¦1**).
- **2026-09-10 â€” Paint never forces layout:** Music Player / fbmField / Instant Waterfall / curveÂ·shapeÂ·harmonic faces stop remasuring every RAF. Shared `display-face-metrics.js`; scope screen rects from layout cache + pan/zoom math (not gBCR per pan sample).
- **2026-09-10 â€” Music Player play + HUD:** Finite-rewriter comma bug set `samplePhaseSeek = (â€¦+1, 1)` always `1` â€” seeks never bumped, Play looked dead. Fixed increment. HUD/canvas text: uniform min-edge font; buffer sized to canvas CSS box (no aspect stretch). Policy Â§16: workspace vs displays â€” WebGL preferred for visuals; DOM for Text Box / chrome (soft preference, not a hard ban).

## Choice / enum persistence (name-based)

**Standing rule:** Persist discrete choices (dropdowns, enums, mode selectors, similar) by **stable name / key / id**, never by list **index**. Reordering, inserting, or removing options must not remap saved patches or settings to a different choice.

Banned: saving `0`/`1`/`2` as “which option” when the option list can change order. Prefer the option’s canonical string key (or stable enum id). Index may be used only as a transient UI cursor that resolves through the name.

If an old patch still has an index, Architect decides any one-shot migration — agents must not add soft remaps or dual-key shims (§1).
