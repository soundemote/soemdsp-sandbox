# Electro Snare — percussion module plan

**Status:** planned, not started. Plan only. Do not build until Argi says go.
**Date:** 2026-10-06.
**Owner:** Sandy (Sandbox build agent).
**Name (Argi, 2026-10-06):** this module **is Electro Snare**. It replaces the `electroSnare` placeholder card, which was removed on 2026-10-06 (`docs/BUG_PLAN.md` **Cleanup** → **C-002**, done; file list in `docs/KICK_PLAN.md` → Removal). The new module takes the freed key in place.
**Under discussion with Argi (not final):** the shared parameter set and the algorithm list below. Argi's correction (2026-10-06): a module cannot add or remove parameters per algorithm. There is one fixed shared set, and each algorithm interprets it.

**Parent seed:** `docs/FUTURE_PLANNING.md` §Electro Snare. Sibling plan: `docs/KICK_PLAN.md` (Kick, SweepKicker).

**Related:** `docs/APP_POLICY.md` (native-only DSP §2 / §5, Sine SSOT §2, no legacy helpers §1, shared library maths and Architect gate §19, a stored 0 is a value §18, Choice / enum persistence); `docs/GATES_TRIGGERS.md` (Trigger ⎍ / Reset ↺ jacks, `gate_hit`, height is velocity); `docs/PORT_TYPES.md`; `docs/ADDING_HARDCODED_SANDBOX_MODULE.md`; `docs/MODULE_PATTERN_REFERENCE.md`; `docs/ACID_SEQUENCER_PLAN.md` and `docs/VARISPEED_DELAY_PLAN.md` (format).

---

## Goal

A new **Electro Snare** module: one drum voice with a **Trigger** in, a **Reset** in, a **Snare** audio out and an **Env** out. An **Algorithm** choice picks the snare design. Every algorithm reads the **same eight parameters** and gives each one a meaning. No parameter is added, removed, shown or hidden per algorithm.

Native C++/WASM DSP only. JS covers the definitions, params and the optional face. No JS DSP, no JS twin, no shims.

---

## Spec (Argi, exact)

| Topic | Spec |
|-------|------|
| In: Trigger | App trigger jack: port key `Trigger`, stamp **⎍**, white round `digital` (`docs/GATES_TRIGGERS.md` §1) |
| In: Reset | App reset jack: port key `Reset`, stamp **↺**, white round `digital`. Reset restarts every oscillator, resonator and envelope phase mid-hit |
| Out: Snare | Audio |
| Out: Env | The envelope signal, so other modules can use it (defined below) |
| Algorithm | Choice switch labelled with the algorithm names. Persisted by stable name, not index (APP_POLICY, Choice / enum persistence) |
| Other params | One fixed shared set, interpreted per algorithm (Argi correction, 2026-10-06) |

---

## Module identity (proposed)

| Field | Value |
|-------|-------|
| Type key | `electroSnare` (proposed): the new module takes the key of the removed placeholder (deleted in C-002, 2026-10-06) and goes where its definition and store entry were. No alias and no migration (the placeholder had no DSP and no patch used it). Alternative: a new key `snare` (Open question 12) |
| Shop / header label | Electro Snare (the removed placeholder's label was "ElectroSnare") |
| Store category | `drum` (already exists in `public/node-graph-module-store.js`) |
| Plan role | `source`, `planFreeRun: true` (same as the removed `sineKick` / `electroSnare` definitions) |
| Native type id | Next free id in `NATIVE_GRAPH_TYPE_IDS` at build time. The highest seen on 2026-10-06 is 204 (`powerDecay`). Other agents have uncommitted `graph_engine` work, so check again before picking |
| Inputs (order) | `Trigger`, `Reset`. No aliases (new module, nothing to stay compatible with) |
| Outputs (order) | `Snare`, `Env` |
| Polyphony | One voice per module. Overlapping hits follow each algorithm's retrigger rule below |

---

## Shared parameter set (under discussion with Argi)

Eight parameters, always present, same keys for every algorithm:

| Key | Label | Range | Default | Unit | Generic meaning |
|-----|-------|-------|---------|------|-----------------|
| `algorithm` | Algorithm | `tr808` / `tr909` / `simmons` / `modal` / `fm` | `tr808` | choice | Snare design. Stored by key |
| `tune` | Tune | 40–1000 | 180 | Hz (`kind: "frequency"`) | Rest pitch of the body |
| `tone` | Tone | 0–1 | 0.5 | — | Timbre of the body or noise (per algorithm) |
| `snappy` | Snappy | 0–1 | 0.5 | — | Noise / snare-wire amount |
| `bodyDecay` | Body Decay | 0.01–2 | 0.25 | s (T60) | How long the tonal body rings |
| `snapDecay` | Snap Decay | 0.01–2 | 0.2 | s (T60) | How long the noise rings |
| `bend` | Bend | 0–4 | 0 | oct | Pitch drop at the hit: starts `bend` octaves above Tune and falls back to Tune |
| `amplitude` | Amplitude | 0–1 | 1 | — | Output level (same key as the removed `sineKick` `amplitude`) |

`Algorithm` choice: `choices: ["808", "909", "Simmons", "Modal", "FM"]`, `choiceKeys: ["tr808", "tr909", "simmons", "modal", "fm"]`, `choiceIds: [0, 1, 2, 3, 4]`, `defaultValue: "tr808"`, `kind: "choice"`, `linearSmoothing: false` (APP_POLICY §7).

**T60 everywhere.** Every time param means "seconds to −60 dB". The decay coefficient per sample is `r = exp(−6.9078 / (T60 × sr))`. Tooltips say so.

**Bend default is 0** so the default algorithm (808, which has no pitch drop) sounds stock. 909 and Simmons sound more like themselves with some Bend (suggested values are in their tables). The default is an open question.

Anything a hardware unit has beyond these eight (second-partial ratio, noise filter cutoffs, click level, mode damping, FM ratio) becomes a **fixed constant** of that algorithm, set by ear at build time.

---

## Design rules

1. **Audio DSP is native C++/wasm only.** No JS DSP, no JS twin, no worklet special case, no "temporary" evaluator. Missing native means silence (APP_POLICY §2, §5).
2. **Shared maths go in the library (`library/include/soemdsp`) or `sandbox_native_maths`.** Library edits need Architect (Argi) approval (APP_POLICY §19). Do not copy kernels out of another module's `.cpp`. Note: `sandbox_native_maths` does not exist in this checkout on 2026-10-06 (searched the sandbox, `soemdsp-sandbox-native` and `soemdsp`). Ask Argi where it lives before putting anything there.
3. **Simple maths in feedback.** Argi's approach: simple feedback maths that recreate complex behaviour. Use cheap 2-pole resonators, decaying sines, one-multiply exponential envelopes and enveloped noise. No circuit solvers, no Newton iterations, no WDF trees.
4. **Choices persist by stable name.** `algorithm` stores `"tr808"` / `"tr909"` / `"simmons"` / `"modal"` / `"fm"` (`choiceKeys`). Integer `choiceIds` are only the native wire format, resolved by name in one place in the native param sync (same pattern as Vactrol `model`).
5. **One fixed parameter set.** The module cannot add, remove, show or hide parameters per algorithm. Every algorithm must give every shared parameter an audible meaning (no dead knobs). Each algorithm documents its mapping in a table.
6. **Switching Algorithm never rewrites values.** A stored value is a value (APP_POLICY §18). The knobs keep their positions, and the new algorithm reads them its own way. Each key has one default that sounds reasonable in every algorithm.
7. **Gate law.** Both inlets use `gate_hit` (`trigger.h`). Trigger height is velocity. Reset ignores height (`docs/GATES_TRIGGERS.md` §4, §7).
8. **Planck-clean outputs.** Envelope scalars and resonator states snap to exact 0 below `kPlanck` (1e-7), so Env really rests at 0 and downstream gate detectors re-arm.
9. **A face / display is out of scope** unless trivial. The trivial option is the existing `lineBurn` face on `Snare`, which the removed `electroSnare` placeholder declared. Anything custom is a follow-up for WebUI.
10. **No legacy shims.** No aliases, no dual keys, no migration from the removed `electroSnare` placeholder's old params (Tone / Decay / Noise / Level) or its Accent jack (APP_POLICY §1).

---

## Hit model (shared by every algorithm)

| Event | Behaviour |
|-------|-----------|
| **Trigger** hit (`gate_hit`) | Latch velocity `v = |height|`, then start the hit. Retrigger while ringing depends on the algorithm. Resonator algorithms (808, Modal) add the new ping onto the ringing state, as the hardware does. Oscillator algorithms (909, Simmons, FM) reset phase, as the 909 circuit does |
| **Reset** hit (`gate_hit`, height ignored) | Rewind the current hit to t = 0. Zero every resonator state and oscillator phase. Put every envelope (amp, noise, pitch bend, FM index, click) back to its start. Then strike again at the last latched `v`. Before the first Trigger `v = 0`, so Reset is silent |
| Trigger and Reset on the same sample | Reset first, then Trigger (the new height wins) |
| Noise on Reset | Proposed: also clear the noise filter states and reseed the noise generator to the module seed, so a Reset hit repeats exactly. Open question |
| Bend | Pitch offset `p` starts at 1 on the hit and decays with a fixed per-algorithm bend time. Frequency = `f × 2^(bend × p)` |
| Rest | All envelopes below `kPlanck` snap to 0. Snare and Env output exact 0 |

---

## Env output (definition)

**Chosen: Env = the overall amplitude envelope of the hit.**

- Env is built from the envelope scalars the algorithm already runs. It does **not** follow the audio, so there is no lag and no ripple.
- It is the mix-weighted sum of the component envelopes, normalised so it peaks at `v` on the hit sample. Range 0…v (normally 0…1). Unipolar and Planck-clean.
- It includes velocity but **not** Amplitude. Amplitude is the output fader, and turning it down should not kill modulation. Open question: the removed `sineKick` scaled its `A` out by Amplitude.
- Precedent: the removed `sineKick` ("Out is audio; A is the envelope").

**Alternative (not chosen): Env = body envelope only** (the tonal shell, no noise). It is better for driving pitch or a filter on another module, and on Simmons it is identical to the overall envelope. It was not chosen as the default because on 808 / 909 / Modal / FM at high Snappy it misses the loud part of the hit.

**Rejected: an envelope follower on the Snare audio.** It adds lag and ripple and needs a release constant.

The per-algorithm formulas are in each section below.

---

## Algorithms (under discussion with Argi)

| Choice key | Label | One line |
|------------|-------|----------|
| `tr808` | 808 | Two pinged resonators (low / high body) crossfaded by Tone, plus high-passed white noise with its own envelope |
| `tr909` | 909 | Two phase-reset triangle oscillators rounded toward sine, with a short pitch drop, plus low-passed noise split into a main decaying band and a short high-passed band |
| `simmons` | Simmons | SDS-V style: one sine oscillator with a downward pitch bend, noise through a resonant lowpass, a noise/tone balance, one shared VCA decay and a click |
| `modal` | Modal | Six pinged 2-pole resonators at ideal circular-membrane mode ratios, plus band-passed snare-wire noise with its own envelope |
| `fm` | FM | Chowning-style two-operator FM drum: a sine carrier at Tune, an inharmonic modulator (c:m = 1:1.4) whose index decays with the body, plus enveloped noise |

FM is a technique, not one specific hardware design. It is listed because Chowning's 1973 paper gives a documented FM drum recipe, and FM snares are a well-known family (DX-style). Argi decides whether it stays.

---

### 808 (`tr808`)

**Hardware (verified):**

- The Roland service notes describe "two bridged T-networks for fundamental waveforms and harmonic waveforms". Each one rings as a decaying sine when the trigger pulse pings it ([TR-808 Service Notes](https://archive.org/details/synthmanual-roland-tr-808-service-notes); [Werner, 808 SD post](https://www.tumblr.com/kurtjameswerner/51352144814/chuck-tr-808-emulator-snare-drum-sd-emulation)).
- **Frequencies.** The service-notes table says 238 Hz / 476 Hz. The schematic's revised capacitors (June 1981) give **173.3 Hz / 336.0 Hz**, a ratio of 1.93. Most units, and Roland's own ACB remakes, measure about 167–177 Hz / 326–345 Hz. Early units are about 250 / 499 Hz. Argi's "about 180 Hz and 330 Hz" is right for the common revised 808 ([Werner](https://www.tumblr.com/kurtjameswerner/51352144814/chuck-tr-808-emulator-snare-drum-sd-emulation); [Norgatronics, 808 Snare Mutations](https://norgatronics.blogspot.com/2021/11/808-snare-mutations.html)).
- **Q / decay.** Revised low Q ≈ 16.3, high Q ≈ 9.9. A 2-pole ring decays as `exp(-π f t / Q)`, which gives a low T60 of about 0.21 s and a high T60 of about 65 ms. The high/low decay ratio is about **0.31** ([Norgatronics](https://norgatronics.blogspot.com/2021/11/808-snare-mutations.html), [SD 80'81 tuning](https://norgatronics.blogspot.com/2021/11/sd-8081-tuning.html)).
- **Tone (VR8)** sets the output ratio of the two resonators: low pitch fully CCW, high pitch fully CW, a mix in between. **It does not touch the noise filter** ([Tiptop SD808 manual](https://www.tiptopaudio.com/manuals/Tiptop_Audio_SD808_ns.pdf); [Whittle, TR-808 Sound Mods](https://www.firstpr.com.au/rwi/tr-808/TR-808-Sound-Mods.pdf)).
- **Snappy (VR9)** sets the amplitude of the snappy (noise) envelope. The noise path is white noise → VCA (envelope) → high-pass filter, mixed with the two tones. Gordon Reid's SOS article also feeds the snappy contour into the resonators. Werner reads the schematic as Snappy only scaling the trigger into the noise envelope, and v1 follows Werner ([Werner](https://www.tumblr.com/kurtjameswerner/51352144814/chuck-tr-808-emulator-snare-drum-sd-emulation); [SOS, Practical Snare Drum Synthesis](https://www.soundonsound.com/techniques/practical-snare-drum-synthesis)).
- The 808 noise source is a noisy transistor, so it is truly random. Its "swing type" VCA adds harmonics. Werner found the output needs some lowpass or it sounds too bright. v1 leaves out the swing VCA nonlinearity and keeps a fixed gentle lowpass.
- The 808 snare has no pitch drop. Bend is an extension, and Bend 0 is stock.

**Signal flow (v1):**

```text
Trigger (v) ──► ping ringL (f = tune × 2^(bend·p),         T60 = bodyDecay)        ─┐
            ├─► ping ringH (f = tune × 1.93 × 2^(bend·p),  T60 = 0.31 × bodyDecay)  ─┴─ crossfade by tone ─► body
            └─► eN = v, exp decay over snapDecay

white noise ─► 1-pole HP (fixed, ~1 kHz by ear) ─► 1-pole LP (fixed, ~8 kHz by ear) ─► × eN × snappy ─► wires

Snare = amplitude × (body + wires)
```

A ping is `y += v × g` on the hit sample, using the ring's own `g = sin ω` gain, so a ping of `v` gives a sine of amplitude about `v`. A retrigger adds onto the ringing state (hardware-like, no "machine gun" restart). Bend retunes the ring's coefficients per sample while `p` is non-zero (one `cos` per sample per ring from the sine SSOT, and only during the bend).

**Mapping:**

| Shared param | 808 meaning | Hardware |
|--------------|-------------|----------|
| Tune | Low resonator Hz. High resonator = Tune × 1.93 (fixed) | Not on panel (revised 173 / 336 Hz) |
| Tone | Low ↔ high resonator crossfade (0 = low only, 1 = high only, linear) | **Panel Tone (VR8)** |
| Snappy | Noise envelope peak | **Panel Snappy (VR9)** |
| Body Decay | Low resonator T60. High resonator T60 = 0.31 × Body Decay | Fixed by Q in hardware |
| Snap Decay | Noise envelope T60 | Fixed in hardware (not measured here; default by ear) |
| Bend | Pitch drop on both resonators, fixed bend time ~20 ms | Not in hardware. 0 = stock |
| Amplitude | Output level | **Panel Level** |

Fixed constants (by ear): ratio 1.93, high/low decay ratio 0.31, noise HP ~1 kHz, noise LP ~8 kHz, bend time ~20 ms.

**Env (808):** `Env = ((1 − tone) × eL + tone × eH + snappy × eN) / (1 + snappy)`. `eL` / `eH` are one-multiply scalars decaying at each resonator's rate. `eL`, `eH` and `eN` restart at `v` on a hit. While hits overlap, the ringing resonators interfere, so Env is only approximate there.

---

### 909 (`tr909`)

**Hardware (verified):**

- **Drum part.** Two VCOs (VCO-1 lower, VCO-2 higher; charging caps C69 / C71) make **triangle waves**. A diode clipper rounds each one toward a sine. The **trigger resets both VCOs to the same starting phase**. ENV1 drives the control-voltage generator, which bends the pitch for **about 20 ms**. The bend is the same for every note and ignores accent. Each VCO has its own VCA and decaying envelope (ENV3 / ENV2), started in proportion to accent ([TR-909 Service Notes](https://schematicsforfree.com/files/_Errata%2C%20Corrections%2C%20Notes%2C%20Updates%2C%20etc/Roland%20TR-909%20Rhythm%20Composer%20Service%20Notes.pdf); [network-909, Snare Drum](http://www.network-909.de/snaredru.htm); [Whittle, TR-909 Sound Mods](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf)).
- **Tune** sets the pitch CV of both VCOs and does nothing to the noise. Both VCO outputs always mix fully into the output ([Whittle](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf)).
- **Snappy part.** The shared pseudo-random noise (a shift-register source) is low-pass filtered and split. (a) The main band goes through VCA Q48 on ENV4, whose start voltage follows accent. (b) A second band is high-pass filtered and goes through VCA Q47 on a short ENV5. **The Snappy pot is the volume control for both noise parts** ([Service Notes](https://schematicsforfree.com/files/_Errata%2C%20Corrections%2C%20Notes%2C%20Updates%2C%20etc/Roland%20TR-909%20Rhythm%20Composer%20Service%20Notes.pdf); [Whittle](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf)).
- **Tone (VR7)** sits in **ENV4**'s discharge path, so it sets the **decay time of the main noise band**. The owner's manual only says the sound gets "brighter". Whittle's mod notes show VR7 in that discharge path. They also show that stock ENV4 holds for about 24 ms and then falls faster than exponential ([Whittle](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf); [TR-909 Owner's Manual](https://ia801501.us.archive.org/10/items/synthmanual-roland-tr-909-owners-manual/rolandtr-909ownersmanual_text.pdf)). Some tutorials call Tone a noise lowpass cutoff. The circuit notes do not support that.
- **Mapping consequence.** The 909's panel Tone is our **Snap Decay**. Our shared **Tone** knob then needs its own 909 meaning. The proposal is the brightness the manual describes, meaning the cutoff of the noise lowpass (open question).

**Signal flow (v1):**

```text
Trigger (v) ─► reset phase VCO1, VCO2 → 0 ; p = 1 ; e1 = e2 = eA = eB = v

f1 = tune × 2^(bend·p)          f2 = tune × k909 × 2^(bend·p)      p decays over ~20 ms (hardware)
VCO1 triangle(f1) ─► soft clip (rounded) ─► × e1 ─┐
VCO2 triangle(f2) ─► soft clip (rounded) ─► × e2 ─┴─► body       (e1 T60 = bodyDecay, e2 T60 = ~0.6 × bodyDecay by ear)

white noise ─► 1-pole LP (cutoff from tone) ─┬─► × eA (T60 = snapDecay)                        ─┐
                                             └─► 1-pole HP (fixed) ─► × eB (fixed ~15 ms)       ─┴─► × snappy ─► wires

Snare = amplitude × (body + wires)
```

If aliasing is audible at high Tune, band-limit the triangle (PolyBLAMP). The soft clip comes from `nonlinearity.h`, so no new maths. The PowerDecay law (power < 1) is a candidate for the stock "hold then drop" ENV4. v1 uses a plain exponential, which Whittle also prefers.

**Mapping:**

| Shared param | 909 meaning | Hardware |
|--------------|-------------|----------|
| Tune | VCO1 rest Hz. VCO2 = Tune × k909 (fixed, by ear, TBD) | **Panel Tune** |
| Tone | Noise lowpass cutoff, exponential 2 kHz → 12 kHz ("brighter") | Manual wording for panel Tone. The circuit's Tone is Snap Decay |
| Snappy | Level of both noise bands | **Panel Snappy** |
| Body Decay | VCO1 envelope T60 (VCO2 ~0.6×) | Fixed in hardware |
| Snap Decay | Main noise band (ENV4) T60 | **Panel Tone (VR7)** |
| Bend | Pitch drop of both VCOs, fixed ~20 ms bend time | ENV1 bend (fixed in hardware). Suggested ~0.5 oct, by ear |
| Amplitude | Output level | **Panel Level** |

Fixed constants (by ear): k909 VCO ratio, VCO2 decay ratio ~0.6, noise HP, ENV5 ~15 ms, bend time 20 ms.

**Env (909):** `Env = (e1 + e2 + snappy × eA) / (2 + snappy)`. It peaks at `v`. ENV5 (the short HP band) is left out; it is too short to matter for modulation.

---
### Simmons (`simmons`)

Analog Simmons SDS-V snare module (1981). This is a **panel-level model**. The public documentation is the service notes' trim list and descriptions of the panel, not a full circuit analysis, so keep it simple.

**Hardware (verified as far as documented):**

- Per-module sound controls: **noise level, tone level, bend, decay, noise tone (a simple filter) and click**. The click adds extra attack from pad impact ([Wikipedia, Simmons SDSV](https://en.wikipedia.org/wiki/Simmons_SDS-V)). The service notes list the factory trims as Noise pitch, Tone pitch, Bend, Decay, Click balance and Noise/tone balance ([SDS-V Service Notes](https://synth-diy.org/yg-archives2/raw/Simmons_Drums/files/16_Manuals/4_SDS-V_SM.pdf)).
- Each module has an **SSM2044 4-pole lowpass** with service trims for Q (R27) and Dynamic Sweep (R25). For the **snare**, R25 is fully anti-clockwise (no sweep) and R27 is at 2/3 ([SDS-V Service Notes](https://synth-diy.org/yg-archives2/raw/Simmons_Drums/files/16_Manuals/4_SDS-V_SM.pdf); [Still Not Working, SDS V](http://snw.lonningdal.no/sds5.php)).
- The signature sound is the falling pitch on the decay (the "peew") ([Still Not Working](http://snw.lonningdal.no/sds5.php)).
- The snare-only "oscillator modulation depth" trim (R26) is not documented beyond its name. v1 leaves it out.
- The notes do not show whether the tone passes through the filter as well as the noise. v1 filters only the noise (cheaper, and the snare's sweep trim is off anyway).

**Signal flow (v1):**

```text
Trigger (v) ─► reset osc phase → 0 ; p = 1 ; e = v (shared VCA) ; eN = v ; c = v (click)

sine(tune × 2^(bend·p)) ─► × (1 − snappy) ─┐                   p decays over 0.5 × bodyDecay ("peew")
white noise ─► 2-pole resonant LP (cutoff from tone, fixed Q ~2) ─► × eN × snappy ─┴─► × e (T60 = bodyDecay) ─► + click ─► × amplitude ─► Snare

click = c × (short HP'd noise burst), c decays in ~2 ms, fixed level by ear
```

The sine comes from the Sine SSOT wavetable (`dsp_sin_turns_lut`, APP_POLICY §2). The 2-pole lowpass stands in for the SSM2044 4-pole, which is a deliberate simplification.

**Mapping:**

| Shared param | Simmons meaning | Hardware |
|--------------|-----------------|----------|
| Tune | Oscillator rest Hz | **Tone pitch** |
| Tone | Noise lowpass cutoff, exponential 300 Hz → 12 kHz | **Noise tone / noise pitch** |
| Snappy | Noise ↔ tone balance (noise gain = snappy, tone gain = 1 − snappy) | **Noise / tone balance** (panel noise level vs tone level) |
| Body Decay | Shared VCA T60 (noise and tone together) | **Decay** |
| Snap Decay | Extra noise envelope inside the VCA. At Snap Decay ≥ Body Decay this is the stock single-VCA SDS-V. Shorter values make the noise drop out first | Not in hardware (extension) |
| Bend | Pitch drop in octaves, falling over 0.5 × Body Decay | **Bend**. Suggested 1–2 oct |
| Amplitude | Output level | Mixer channel level |

Fixed constants (by ear): filter Q ~2, click level and ~2 ms length, bend time = 0.5 × Body Decay.

**Env (Simmons):** `Env = e × ((1 − snappy) + snappy × eN / v)`. This is the VCA envelope with the noise share weighted in. At stock settings (Snap Decay ≥ Body Decay) it equals the VCA envelope `e`, so body and overall envelope are the same thing here. The click is left out.

---

### Modal (`modal`)

A generic modal snare: a struck-membrane body built from 2-pole resonators, plus snare-wire noise. Modal synthesis means a sum of exponentially decaying sinusoids, one per mode, and it is standard ([J.O. Smith, Physical Audio Signal Processing, Modal Expansion](https://ccrma.stanford.edu/~jos/pasp/Modal_Expansion.html)). An ideal circular membrane has mode frequencies proportional to the Bessel zeros α01 2.405, α11 3.832, α21 5.136, α02 5.520, α31 6.380 and α12 7.016. That gives ratios **1, 1.593, 2.136, 2.295, 2.653, 2.917** ([Wikipedia, Vibration of a circular membrane](https://en.wikipedia.org/wiki/Vibration_of_a_circular_membrane)). Air loading and the second head shift the modes of a real snare. These are ideal ratios, and Tune scales all of them.

**Signal flow (v1):**

```text
Trigger (v) ─► ping ring_k (f = tune × ratio_k × 2^(bend·p), T60_k = bodyDecay / ratio_k, gain w_k), k = 1..6
            ├─► eN = v (T60 = snapDecay)
            └─► c = v (click, ~2 ms, fixed level)

body  = Σ ring_k / Σ w_k
white noise ─► 2-pole band-pass (fixed ~3 kHz, Q ~1) ─► × eN × snappy ─► wires
Snare = amplitude × (body + wires + click)
```

Mode weights come from Tone (strike position). The axisymmetric modes (01, 02) always have weight 1, and the other modes have weight `tone`. This is a cheap stand-in for a centre hit (0) vs an edge hit (1). A retrigger adds onto the ringing modes, the same as the 808.

**Mapping:**

| Shared param | Modal meaning |
|--------------|---------------|
| Tune | Fundamental (01 mode) Hz. Other modes at the fixed membrane ratios |
| Tone | Strike position: 0 = centre (axisymmetric modes only), 1 = edge (all modes equal) |
| Snappy | Snare-wire noise level |
| Body Decay | 01 mode T60. Higher modes decay faster: T60_k = Body Decay / ratio_k |
| Snap Decay | Snare-wire envelope T60 |
| Bend | Tension pitch drop on all modes (a hard hit briefly raises the head pitch), fixed bend time ~30 ms |
| Amplitude | Output level |

Fixed constants (by ear): six mode ratios, damping exponent 1, wire band-pass ~3 kHz, click level, bend time ~30 ms.

**Env (Modal):** `Env = (Σ w_k e_k / Σ w_k + snappy × eN) / (1 + snappy)`. Each `e_k` is a one-multiply scalar at mode k's decay rate, starting at `v`.

---

### FM (`fm`)

A two-operator FM drum following Chowning's 1973 paper. That paper gets drum and wood-drum sounds from an inharmonic **c:m = 1:1.4** pair with a short amplitude envelope. For the drum, the modulation index follows the amplitude envelope: it starts wide and falls to a near-pure carrier ([Chowning 1973, JAES 21(7)](https://www.charlesames.net/pdf/JohnChowning/frequency-modulation.pdf); [CCRMA record](https://ccrma.stanford.edu/papers/synthesis-of-complex-audio-spectra-means-of-frequency-modulation)). The snare adds enveloped noise on top.

**Signal flow (v1):**

```text
Trigger (v) ─► reset both phases → 0 ; p = 1 ; eC = v ; eN = v

fc = tune × 2^(bend·p) ; fm = 1.4 × fc                      p decays over ~20 ms
carrier = sin(2π φc + I_peak × (eC / v) × sin(2π φm)) × eC   (phase-modulation form, T60 = bodyDecay)
white noise ─► 1-pole HP (fixed, ~1 kHz) ─► × eN × snappy ─► wires     (eN T60 = snapDecay)

Snare = amplitude × (carrier + wires)
```

The phase-modulation form is the usual stable way to do FM, with no DC drift. Both sines come from the Sine SSOT wavetable.

**Mapping:**

| Shared param | FM meaning |
|--------------|------------|
| Tune | Carrier Hz. Modulator = 1.4 × carrier (Chowning drum ratio, fixed) |
| Tone | Peak modulation index, linear 0 → 8. Chowning's drum peak index of 2 is Tone 0.25 |
| Snappy | Noise level |
| Body Decay | Carrier amplitude T60. The index envelope follows it (Chowning drum) |
| Snap Decay | Noise envelope T60 |
| Bend | Pitch drop of carrier and modulator together (ratio kept), fixed ~20 ms |
| Amplitude | Output level |

Fixed constants (by ear): c:m 1:1.4, index range 0–8, noise HP ~1 kHz, bend time ~20 ms.

**Env (FM):** `Env = (eC + snappy × eN) / (1 + snappy)`.

---

## Mapping overview (all algorithms × shared params)

| Shared param | 808 | 909 | Simmons | Modal | FM |
|--------------|-----|-----|---------|-------|----|
| Tune | Low resonator Hz (high = ×1.93) | VCO1 Hz (VCO2 = ×k909) | Osc Hz | 01 mode Hz | Carrier Hz (mod = ×1.4) |
| Tone | Low ↔ high resonator mix | Noise LP cutoff (brightness) | Noise resonant LP cutoff | Strike position (centre → edge) | Peak FM index |
| Snappy | Noise env peak | Level of both noise bands | Noise ↔ tone balance | Wire noise level | Noise level |
| Body Decay | Low resonator T60 (high 0.31×) | VCO env T60 (VCO2 0.6×) | Shared VCA T60 | 01 mode T60 (mode k ÷ ratio_k) | Carrier + index T60 |
| Snap Decay | Noise env T60 | Main noise band (ENV4) T60 = 909 panel Tone | Inner noise env (≥ Body Decay = stock) | Wire env T60 | Noise env T60 |
| Bend | Resonator pitch drop (0 = stock) | VCO pitch drop, 20 ms | Pitch drop over 0.5 × Body Decay | Tension pitch drop, 30 ms | Carrier + mod pitch drop, 20 ms |
| Amplitude | Output level | Output level | Output level | Output level | Output level |
| Retrigger | Adds to ringing | Phase reset | Phase reset | Adds to ringing | Phase reset |
| Env | Mix of eL, eH, eN | Mix of e1, e2, eA | VCA × noise share | Mix of modes, eN | Mix of eC, eN |

---

## Reusable pieces in the repo (candidates, nothing committed)

| Need | Candidate | Where | Note |
|------|-----------|-------|------|
| Trigger / Reset detect | `gate_hit`, `gate_on` | `library/include/soemdsp/trigger/trigger.h` | Use as is |
| Planck rest | `silent_planck`, `kPlanck` | `library/include/soemdsp/math/scalar_helpers.h` | Use as is |
| Sine (decaying sines, Simmons osc, FM operators, ring coefficients) | `dsp_sin_turns_lut` / `dsp_cos_turns_lut` (Sine SSOT wavetable) | `library/include/soemdsp/math/analog_filter_trig.h` | APP_POLICY §2 Sine SSOT |
| Phase / Hz | `phase_advance_wrap01`, `hz_to_increment`, `clamp_hz_nyquist` | `library/include/soemdsp/math/phasor.h` | Use as is |
| Bend in octaves | `dsp_exp2` | `analog_filter_trig.h` | Same law as the removed `sineKick` `punch` (octaves above Pitch) |
| Exp envelopes, one-pole HP/LP | `one_pole_coeff`, `one_pole_coeff_hz`, `one_pole_step`; `dsp_exp` | `library/include/soemdsp/dynamics/dynamics.h`, `math/exp_log.h` | HP = x − LP(x). No new maths |
| Soft clip (909 triangle rounding) | soft clip / tanh | `library/include/soemdsp/nonlinearity/nonlinearity.h` | Same one Varispeed plans to use |
| White noise | `hash_bipolar(index, seed)` (stateless) or the LCG in `noise_generator.cpp` | `scalar_helpers.h`; `native_modules/noise_generator/noise_generator.cpp` | `hash_bipolar` is already in the library. The LCG is local to Noise Generator, and lifting it into `math/noise.h` needs Architect approval (§19, no copying) |
| Seed | `seed_mix`, `seed_to_rng_state` | `library/include/soemdsp/math/seed.h` | If Argi wants a module Seed (it would have to join the shared set) |
| 2-pole pinged resonator (808 body, Modal modes; also the core of Simmons LP / Modal BP) | Mode Resonator ring `y = 2 r cos ω y1 − r² y2 + g x` | `native_modules/mode_resonator/mode_resonator.cpp` | The kernel is local to that module. Calling its C API from the snare is possible, but it clamps to ±1 per sample, has a Hold mode and a 64-instance pool (Modal needs 6 per snare). Best fit is a small `ring2` helper promoted into the library, **only with Architect approval**. Otherwise keep it local to `snare.cpp` and record it as debt |
| Ping-style envelope | `pingEnvelope` | `native_modules/ping_envelope/ping_envelope.cpp` | Asymmetric one-pole toward Trigger with a 0–1 Decay law, not seconds. Reference only; the snare needs plain T60 decays |
| "Hold then drop" (909 ENV4) | PowerDecay law `pow(1 − t/T, power)` | `native_modules/power_decay/power_decay.cpp` | Optional stock-909 shape. Also the newest Trigger-driven native envelope wired end to end (build script, `graph_engine`, type id 204, smoke exports) |
| RBJ HP / LP / BP | Cookbook Filter C API | `native_modules/cookbook_filter/` | Heavier than needed. Candidate if the ring / one-poles don't sound right |
| Cascaded one-poles | Passive Filter C API | `native_modules/passive_filter/` | Candidate for a steeper 808 noise HP |
| Drum history | Removed in C-002 (2026-10-06): `sineKick` (Pitch / Punch oct / Decay s / Sharpness; Out + A envelope), `kickEnvelope`, the `electroSnare` / `electroKick` placeholders. Still parked: `electroHat` | `public/node-graph-module-definitions.js`, `public/node-graph-module-store.js` | `sineKick` JS math was deleted in C-001 and has no C++ twin (`docs/BUG_PLAN.md`). `electroSnare` was a parked UC card (Trigger + Accent in, Out; Tone / Decay / Noise / Level), removed in C-002. This module replaces it (Argi, 2026-10-06) |

---

## Build checklist (when Argi says go)

1. **Native module.** `native_modules/electro_snare/electro_snare.cpp` (if the key stays `electroSnare`; `native_modules/snare/snare.cpp` if Argi picks `snare`), following the `power_decay` pattern: `soemdsp_electro_snare_create / destroy / sample / env / version / metadata_json / metadata_json_size`. `sample` returns Snare. `env(handle)` returns that same sample's Env (like `soemdsp_sine_wavetable_sin`). Fixed instance pool, no heap on the audio path. Add it to `scripts/build_native_modules.ps1`.
2. **graph_engine opcode.** Extern declarations, `kTypeElectroSnare`, create / destroy, and `process_electro_snare` writing ports `Snare` and `Env`, with per-sample `gate_hit` on `Trigger` / `Reset`. Add it to `NATIVE_GRAPH_TYPE_IDS` and to the param push in `public/node-live-audio-worklet-native-graph.js`, with `algorithm` resolved key → id in one place.
3. **Definitions.** Add `electroSnare` to `nodeGraphModuleDefinitions` and `nodeGraphNodeLabels` (`public/node-graph-module-definitions.js`) where the removed placeholder sat (just before `electroHat`), with the new ports, the eight shared params and `choiceKeys`. Add the bypass entry `electroSnare: "silence"` in `public/node-graph-module-bypass.js` (the placeholder's entry was removed in C-002).
4. **Tooltips.** One per param giving the generic meaning plus a one-line per-algorithm summary (from the mapping overview), with T60 wording. For example, Snap Decay: "on 909 this is the panel's Tone".
5. **Smoke test.** Export list in `scripts/smoke_test.py` (like `power_decay`), plus a native smoke script. For each algorithm, check that:
   - it is silent before Trigger and a hit sounds;
   - every shared param changes the output (no dead knobs);
   - Env peaks at `v` and reaches exact 0;
   - Reset mid-hit restarts the hit (Env back to peak; bit-exact if noise reseeds);
   - the choice survives by name;
   - there are no NaNs or denormals.
   Test the real Live path, not only Render Sample (`docs/ADDING_HARDCODED_SANDBOX_MODULE.md`).
6. **Catalog / store.** Entry in `public/node-graph-module-store.js` (category `drum`, description, notes, source link to the native `.cpp` from step 1), the Add Module menu, and a row in the `docs/APP_POLICY.md` live-audio allowlist. Put the store entry where the removed placeholder's sat (just before `electroHat`). `electroSnare` is already off the under-construction lists (`nodeGraphModuleCatalogUnderConstructionSort`, `nodeGraphModuleConstructionPlans`, the presets' `underconstructionsort`) since C-002; do not add the new module there. Removal record: `docs/KICK_PLAN.md` → Removal.
7. **Face.** None, or the existing `lineBurn` on `Snare` if that is trivial. A custom face is a WebUI follow-up.
8. **Docs.** Change the status here and in `docs/FUTURE_PLANNING.md` / `progress.md` only after Argi tests.

---

## Non-goals (v1)

- JS DSP of any kind, a JS twin, a worklet special case
- Parameters added, removed, shown or hidden per algorithm
- Circuit solvers (Newton, WDF, MNA), swing-type VCA modelling, shift-register noise emulation
- An Accent jack or Velocity jack (height is velocity), choke groups, polyphony inside one module
- A custom face or display
- Aliases, dual keys or patch migration from the `electroSnare` placeholder
- New `library/include/soemdsp` APIs without Architect approval

---

## Open questions (Argi)

1. **Parameter set.** Is the eight-parameter set final (Algorithm, Tune, Tone, Snappy, Body Decay, Snap Decay, Bend, Amplitude)? Today every ratio, filter cutoff and click level is a fixed constant per algorithm.
2. **Algorithm list.** Keep all five (808, 909, Simmons, Modal, FM)? Ship them all at once, or 808 + 909 first? FM is a technique rather than one hardware design. Keep it?
3. **Default algorithm.** Proposed `tr808`.
4. **Bend default.** Proposed 0, so the default 808 is stock. That means 909 / Simmons need Bend turned up to sound right.
5. **909 Tone.** The hardware Tone is the noise decay, which maps to our Snap Decay. Is noise-lowpass brightness the right job for the shared Tone on 909? The alternative is a VCO1 ↔ VCO2 balance, like the 808.
6. **Simmons Snappy.** Noise ↔ tone balance (proposed, matching the SDS-V trim), or plain noise level with the tone fixed?
7. **Reset and noise.** Should Reset also clear the noise filters and reseed the noise so a Reset hit repeats exactly (proposed yes), or leave the noise running?
8. **Reset when idle.** Proposed: re-strike at the last latched height, silent before the first Trigger. Or should Reset only rewind a hit that is still sounding?
9. **Accent input?** Proposed no: Trigger height is velocity (`docs/GATES_TRIGGERS.md` §2). The removed `electroSnare` placeholder had an Accent jack.
10. **Velocity mapping.** Amplitude only (proposed), or accent-like extras as well (808 velocity deepens Snappy; 909 velocity lengthens the main noise decay, as ENV4 does)? Use `|height|` and ignore the sign (proposed)?
11. **Env.** Overall amplitude envelope (proposed) or body envelope? Should Env include Amplitude (proposed no)?
12. **`electroSnare`.** Resolved (Argi, 2026-10-06): this module is Electro Snare and replaces the `electroSnare` placeholder card. Still open: keep the type key `electroSnare` (proposed; the placeholder was removed in C-002 on 2026-10-06, so the key is free and the module lands where the card was), or use a new key `snare`? No alias either way.
13. **Shared maths.** Approve a `ring2` resonator helper (and maybe the Noise Generator LCG) in `library/include/soemdsp`? And where is `sandbox_native_maths`? It is not in this checkout.
14. **isIdle out.** Add an `isIdle` boolean for Metamodule voice idle, like the other envelopes have (APP_POLICY voices)? The spec only lists Snare and Env, so it stays out of v1 unless you say so.
15. **Reference values.** The 909 VCO ratio, the noise filter cutoffs and the decay constants here are by ear, not measured. Do you want measured references before the build?

---

## References

- Roland, *TR-808 Service Notes* — [Internet Archive](https://archive.org/details/synthmanual-roland-tr-808-service-notes)
- K. J. Werner, "ChucK TR-808 Emulator / Snare Drum (SD) emulation" — [post](https://www.tumblr.com/kurtjameswerner/51352144814/chuck-tr-808-emulator-snare-drum-sd-emulation)
- K. J. Werner, J. S. Abel, J. O. Smith III, "A Physically-Informed, Circuit-Bendable, Digital Model of the Roland TR-808 Bass Drum Circuit", DAFx-14 — [PDF](https://www.dafx.de/paper-archive/2014/dafx14_kurt_james_werner_a_physically_informed,_ci.pdf). Its bridged-T analysis covers the same resonator type the snare uses. It also explains the "machine gun effect" from naive retrigger
- K. J. Werner, J. S. Abel, J. O. Smith III, "The TR-808 Cymbal: a Physically-Informed, Circuit-Bendable, Digital Model", ICMC/SMC 2014 — [PDF](https://www.icmc14-smc14.net/images/proceedings/OS24-B10-TheTR-808Cymbal.pdf)
- Norgatronics, "808 Snare – Mutations" — [post](https://norgatronics.blogspot.com/2021/11/808-snare-mutations.html); "SD 80'81 – Tuning Theory" — [post](https://norgatronics.blogspot.com/2021/11/sd-8081-tuning.html)
- Tiptop Audio, *SD808 manual* — [PDF](https://www.tiptopaudio.com/manuals/Tiptop_Audio_SD808_ns.pdf)
- R. Whittle, *TR-808 Sound Mods* — [PDF](https://www.firstpr.com.au/rwi/tr-808/TR-808-Sound-Mods.pdf); *TR-909 Sound Mods* — [PDF](https://www.firstpr.com.au/rwi/tr-909/TR-909-Sound-Mods.pdf)
- Roland, *TR-909 Service Notes* — [PDF](https://schematicsforfree.com/files/_Errata%2C%20Corrections%2C%20Notes%2C%20Updates%2C%20etc/Roland%20TR-909%20Rhythm%20Composer%20Service%20Notes.pdf); *TR-909 Owner's Manual* — [text](https://ia801501.us.archive.org/10/items/synthmanual-roland-tr-909-owners-manual/rolandtr-909ownersmanual_text.pdf)
- network-909, "Snare Drum" — [page](http://www.network-909.de/snaredru.htm)
- G. Reid, "Practical Snare Drum Synthesis", Sound On Sound — [article](https://www.soundonsound.com/techniques/practical-snare-drum-synthesis)
- Simmons, *SDS-V Service Notes* (1982) — [PDF](https://synth-diy.org/yg-archives2/raw/Simmons_Drums/files/16_Manuals/4_SDS-V_SM.pdf); "Simmons SDSV" — [Wikipedia](https://en.wikipedia.org/wiki/Simmons_SDS-V); Still Not Working, "SDS V" — [page](http://snw.lonningdal.no/sds5.php)
- J. O. Smith III, *Physical Audio Signal Processing*, "Modal Expansion" — [CCRMA](https://ccrma.stanford.edu/~jos/pasp/Modal_Expansion.html)
- "Vibration of a circular membrane" — [Wikipedia](https://en.wikipedia.org/wiki/Vibration_of_a_circular_membrane)
- J. M. Chowning, "The Synthesis of Complex Audio Spectra by Means of Frequency Modulation", J. Audio Eng. Soc. 21(7), 1973 — [PDF](https://www.charlesames.net/pdf/JohnChowning/frequency-modulation.pdf); [CCRMA record](https://ccrma.stanford.edu/papers/synthesis-of-complex-audio-spectra-means-of-frequency-modulation)
