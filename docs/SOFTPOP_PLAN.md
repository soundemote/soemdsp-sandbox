# Softpop Oscillator Plan: variable pure tone ↔ noise

**Status: READY TO BUILD** (2026-10-07). Argi answered the major questions. The minor ones in §11 have proposed defaults that Sandy builds with unless Argi overrides them.
**Owner:** SandyModules (library extraction + DSP); WebUI (face).
**Module type:** `softpopOscillator`. Keep the existing type and label "Softpop Oscillator" and redefine it in place. No alias, no shim.

## 0. Decisions log
| Date | Who | Decision |
|---|---|---|
| 2026-10-07 | Argi | Model choice Sine / Filter. No Purity. Width, Pitch Mod and Amp Mod are always active in both models. |
| 2026-10-07 | Argi | Independent noise generators per target (pitch / amp / audio) and per channel, from `seed_mix` offsets. |
| 2026-10-07 | Argi | **APP_POLICY §19 approval: extract the TPT SVF (EQ Filter) and the white/pink/brown noise generators (Noise Generator) into shared `library/include/soemdsp/` headers** in `sandbox_native_maths`. Refactor EQ Filter and Noise Generator to use them, with a bit-identical regression test. Softpop uses the shared code. |
| 2026-10-07 | Argi | Filter model gets a Frequency-tied white-noise tilt correction (flat across the keyboard). |
| 2026-10-07 | Argi | Mod speed stays tied to Width. **No Mod Rate knob.** |
| 2026-10-07 | Argi | **No pitch parameter and no pitch input** (final call). Softpop is frequency-only like every sandbox oscillator: a Frequency knob, and a wired `f` (Hz) replaces it exactly as on `polyBlep`. **No Trigger input.** |
| 2026-10-07 | Argi | Default model: **Filter**. |

## 1. What exists today (2026-10-07)

| Where | What |
|---|---|
| `public/node-graph-module-definitions.js` (~L9655) | Old definition: inputs `Reset`, `f`; outputs `Out` (Mono), `Left`, `Right`; params Color, Width (Stereo/Mono), Frequency, Q, Seed, Amplitude. An orphan comment near L8996 sits above `crossover2`. |
| `public/node-graph-module-store.js` (~L1623) | Store card, category `oscillator`. |
| `public/presets/useruisettings.json/.js` | Listed in `underconstructionsort`. |
| `public/node-graph-module-bypass.js` | `softpopOscillator: "silence"`. |
| Runtime / worklet | Dead `softpopOscillatorStates` maps (`node-graph-live-plan-runtime.js`, `node-live-audio-worklet-core.js`, `-clear-plan.js`, `-set-plan.js`) and the `?v=softpop-1` tag in `node-graph-live-runtime.js`. |
| DSP | **None.** The JS math was deleted in C-001 (`9c3a4d7d`). There was never a C++ twin, so the module is silent. C-001 D5 is open. |
| Patches | No patch uses it. |

## 2. Library extraction (approved, Argi 2026-10-07, APP_POLICY §19)

### 2.1 New headers (in `sandbox_native_maths`, picked up by the `GLOB_RECURSE SOEMDSP_MATHS_HEADERS` in `CMakeLists.txt`)

**`library/include/soemdsp/filter/tpt_svf.h`**: the Zavalishin/Simper TPT SVF, moved **verbatim** from `native_modules/eq_filter/eq_filter.cpp` (`tan_half`, `setup_core`, the per-stage tick, and the mode-4 setup), in namespace `soemdsp_maths`.
```
struct TptSvfCoeffs { double g, c, s, aL, aB, aH; };
struct TptSvfState  { double z1, z2; };
void   tpt_svf_reset(TptSvfState&);
void   tpt_svf_setup(TptSvfCoeffs&, double omega, double r, double aL, double aB, double aH, double gScale); // = setup_core
void   tpt_svf_setup_bandpass_const_peak(TptSvfCoeffs&, double omega, double q);                            // = EQ mode 4 (r = 1/Q, aB = r)
double tpt_svf_tick(TptSvfState&, const TptSvfCoeffs&, double x);                                          // yH, yB, yL, z-update, aH·yH + aB·yB + aL·yL
```
EQ Filter's other mode setups (1–3, 5–9) stay in `eq_filter.cpp` and call `tpt_svf_setup`. Keep the exact operation order and expressions so the output is bit-identical.

**`library/include/soemdsp/math/noise_colors.h`**: the scalar white/pink/brown generators, moved **verbatim** from `native_modules/noise_generator/noise_generator.cpp`. The name avoids the existing `math/noise.h` (value noise / fBm).
```
struct NoiseColorChannel { unsigned int seed; double brown; double pink[7]; };
void     noise_color_reset(NoiseColorChannel&, unsigned int initialSeed);            // = resetChan
unsigned noise_color_lcg_next(NoiseColorChannel&);                                    // = lcgNext (1664525·s + 1013904223)
double   noise_color_bipolar(NoiseColorChannel&);   double noise_color_unipolar(NoiseColorChannel&);
double   noise_color_gaussian(NoiseColorChannel&);                                    // CLT-12
double   noise_color_shaped_bipolar(NoiseColorChannel&, double shape);
double   noise_color_sample(NoiseColorChannel&, int mode, double mean, double deviation, double shape); // = channelSample (0 Uniform/shape, 1 Gaussian, 2 Brown, 3 Pink, 4 Sparse)
```
- The `wasm_simd128` pair kernels stay module-local in `noise_generator.cpp`. They already mirror the scalar RNG order, and the regression test proves that still holds.
- `seedHash` stays module-local, because Softpop seeds through `seed_mix` instead.
- Add both headers to `library/include/soemdsp/soemdsp.hpp`.

### 2.2 Steps (in order, one commit-ready change; commit only with Argi's OK)
1. **Golden capture before touching code.** Add `scripts/golden_eq_filter_noise_probe.cpp`, modelled on `scripts/seed_mix_parity_probe.cpp`. It renders with the *current* code:
   - **EQ Filter:** modes 0–9 × stages 1–4 × a grid of frequency/Q/gain, plus a per-sample frequency/Q sweep and a stage-count change mid-run.
   - **Noise Generator:** modes 0–4 × shape {0, 0.5, 1} × seeds {0, 1, 12345, 16777215} × deviation, through both the scalar and the SIMD block path, plus `soemdsp_noise_generator_sample`.
   - Save to `fixtures/golden/eq_filter_v2.bin` and `fixtures/golden/noise_generator.bin` (raw doubles + SHA-256).
2. Create `filter/tpt_svf.h` and `math/noise_colors.h` by moving code (no rewrites).
3. Refactor `eq_filter.cpp` and `noise_generator.cpp` to call them. Keep the `extern "C"` APIs, handle pools, metadata JSON and version numbers unchanged.
4. Rebuild with `scripts/build_native_modules.ps1`: the standalone `eq_filter.wasm` and `noise_generator.wasm`, `graph_engine`, and `combined/soemdsp_combined.wasm`.
5. **Regression test** `scripts/test_tpt_svf_noise_colors_regression.mjs` (+ the native probe): re-render the step-1 grid and require **byte-for-byte equality** (memcmp of the double arrays) for both modules and both noise paths. Any diff fails.
6. Run the existing smoke tests (`smoke_native_param_ids.mjs`, the smoke row for EQ Filter / Noise Generator).
7. Only then start Softpop (§3 onward) on top of the shared headers.

### 2.3 Also reused as-is from the library
- `math/seed.h`: `seed_mix`, `seed_to_rng_state`.
- `dynamics/dynamics.h`: `one_pole_coeff_hz`, `one_pole_step`.
- `math/phasor.h`: `hz_to_increment`, `clamp_hz_nyquist`.
- `math/exp_log.h`: `dsp_exp`, `dsp_ln`.

## 3. I/O (final)

| Jack | Key | Label | Meaning |
|---|---|---|---|
| In | `Reset` | Reset | Rising edge: reseed all generators from Seed, clear phase, smoother and SVF state |
| In | `f` | ƒ (`inputLabels: { f: "ƒ" }`, as on `polyBlep`) | Hz cable. When wired it **replaces** Frequency (below) |
| Out | `Out` | Mono | (L+R)/2 |
| Out | `Left`, `Right` | Left, Right | |

`inputs: ["Reset", "f"]`, identical to `polyBlep`. No Trigger. (A ♯/♭ pitch input was considered and rejected, so Softpop matches the other oscillators.)

**Effective frequency `fEff`: matches `polyBlep` exactly** (`resolve_osc_hz` in `native_modules/graph_engine/graph_engine.cpp`):
- `f` wired: `fEff = mixF[frame]`, the per-sample Hz from the cable (NaN → 0). The Frequency knob and its MOD are ignored.
- `f` not wired: `fEff = control_audio(frequency)`, i.e. the Frequency knob with the standard param smoothing and domain-add MOD.
- Either way it is then `clamp_hz_nyquist(fEff, sr)` (±Nyquist).
- A live `f` puts the node on the sample-accurate path, as with `polyBlep` (`node_needs_sample_accurate_controls`).
- The Frequency param copies `polyBlep`'s definition: `kind: "frequency"`, `unit: "Hz"`, 0–20000, mid 440, `step: "any"`, `smoothingMode: "internal"`, `smoothingSeconds: 0.0333`, `smoothingType: "onePole"`, and the same tooltip wording (thru-zero via Bipolar).
- Negative `fEff` (thru-zero): Sine runs its phase backwards, as `polyBlep` does. Filter uses `|fEff|` as its centre.

## 4. Parameters: one fixed set, every knob active in both models

| Key | Label | Range / default | Sine model | Filter model |
|---|---|---|---|---|
| `model` | Model | stable names `filter` (Filter), `sine` (Sine). **Default `filter`** | Sine oscillator | TPT SVF constant-peak BP on noise |
| `frequency` | Frequency | 0–20000 Hz, default 440 (param fields as `polyBlep`); wired `f` replaces it | Sine frequency (`fEff`) | Filter centre (`fEff`) |
| `width` | Width | 0–1, default 0.3, log-mapped | Mod-noise cutoff `Bmod` | Q = 2000·(0.5/2000)^W (W=0 near-pure ring, W=1 broad noise) **and** mod-noise cutoff `Bmod` |
| `pitchMod` | Pitch Mod | 0–2400 cents, default 0 | Exponential pitch wobble, 1σ in cents | Same, on the centre |
| `ampMod` | Amp Mod | 0–1, default 0 | Level-preserving noise AM | Same |
| `amplitude` | Amplitude | 0–1, default 1 | Output level | Output level |
| `color` | Color | `white` / `pink` / `brown`, default white | Mod-noise colour | Audio-noise colour (+ tilt rule §6) and mod-noise colour |
| `stereoMode` | Stereo | `stereo` / `mono`, default stereo | Independent or shared L/R | Same |
| `seed` | Seed | 0–16777215, default 1 | Master seed | Master seed |

- `Bmod = 0.1·(2000/0.1)^W` Hz, tied to Width in both models (Argi: no Mod Rate knob).
- **Both mods at 0:** Sine = pure sine, Filter = band noise.

## 5. Noise generators
Each generator is a `NoiseColorChannel` from `noise_colors.h`, seeded with `seed_to_rng_state(seed_mix(Seed, SOFTPOP_x, ch))`:

| Generator | Feeds |
|---|---|
| `N_pitch[ch]` (`SOFTPOP_PITCH`) | Pitch Mod |
| `N_amp[ch]` (`SOFTPOP_AMP`) | Amp Mod |
| `N_audio[ch]` (`SOFTPOP_AUDIO`) | Filter audio source |

- `SOFTPOP_*` are fixed, distinct constants local to the module. `ch` 0 = L, 1 = R.
- **Stereo:** six generators. **Mono:** L only, R = L.
- All active generators advance every sample in both models, so a Model switch doesn't shift the streams.
- Reseed on a Reset edge or a Seed change.
- Colour modes:
  - White uses `noise_color_sample` mode 1 (Gaussian, CLT-12).
  - Pink uses mode 3 (Kellet), brown mode 2 (clamped walk, step 0.05·σ).
  - A per-Color RMS calibration constant brings each to unit RMS.

## 6. Signal flow (per channel, per sample)
```
ñ_pitch, ñ_amp  = onePole_LP(N_x · cal_color, Bmod) · √((2−a)/a)            (unit RMS; clamp ±4σ first)
fEff            = f wired ? f : Frequency (+MOD)                             (exactly polyBlep, §3)
fInst           = fEff · 2^(ñ_pitch · PitchMod / 1200)                      (clamp |fInst| ≤ 0.49·fs)

Sine:    φ += fInst/fs;  x = sin(2πφ)
Filter:  tpt_svf_setup_bandpass_const_peak(ω = 2π·|fInst|/fs, Q(Width)) every sample
         x = tpt_svf_tick(N_audio · cal_color) · k_color · √Q · T_color(fInst)

AM:      y = x · (√(1 − AmpMod) + √AmpMod · ñ_amp)      (power-preserving)
Out:     y · Amplitude
```

**Filter level, Width term.** A constant-peak BP on white noise gives RMS ∝ √(fc/Q) (equivalent noise bandwidth π·fc/(2Q)). The `√Q` trim cancels Width.

**Tilt correction (tied to the effective frequency, i.e. the knob or the wired `f`; normalised at 1 kHz):**

  `T_color(fc) = (1000 / fc_c)^(α_color / 2)`, where `fc = |fInst|` (= `fEff` after Pitch Mod) and `fc_c = clamp(fc, 20 Hz, 0.45·fs)`.

| Color | Source spectrum | Band power after √Q trim | α | T at 100 Hz / 10 kHz |
|---|---|---|---|---|
| White | flat | ∝ fc (+3 dB/oct) | **+1** (−3 dB/oct correction) | +10 dB / −10 dB |
| Pink | ∝ 1/f | about constant | **0** (no correction) | 0 / 0 |
| Brown | ∝ 1/f² (above the walk's very low corner) | ∝ 1/fc (−3 dB/oct) | **−1** (+3 dB/oct correction) | −10 dB / +10 dB |

- It uses the **instantaneous** `fInst` (effective frequency, from the knob or `f`, including Pitch Mod), so Pitch Mod doesn't turn into an amplitude wobble, which would correlate pitch and level.
- The 20 Hz clamp caps the white boost at +17 dB.
- `k_color` is measured once per Color so the 1 kHz Filter RMS equals the Sine RMS (Amplitude/√2). That matches the two models across the keyboard.
- Pink's Kellet filter and brown's clamped walk are only approximately 1/f and 1/f². If the §9 test shows residual slope, the correction becomes a small measured per-Color α (e.g. 0.05), still a single power law.

**Pitch Mod** is exponential (cents) around the effective frequency `fEff` (knob or wired `f`), so the spread is symmetric in cents and the median is `fEff`. **Amp Mod** at 1 is full ring modulation (no carrier).

Use a soft safety limit only; never use it for tone. Per-sample `g = tan(ω/2)` recompute is safe on the TPT SVF.

**Later ideas (not v1):** sine/noise crossfade; Karplus-style pluck comb (would need Trigger); modal / formant BP bank.

## 7. Rules
- Native C++/wasm DSP only (`native_modules/softpop_oscillator/softpop_oscillator.cpp`). No JS audio DSP, no worklet JS maths.
- No shims. In the same change:
  - Delete the dead `softpopOscillatorStates` maps, the `?v=softpop-1` tag and the orphan comment.
  - Replace the old params with §4. No patch uses the module.
- Choices persist by stable name, not index.
- Library changes are limited to the approved extraction in §2. Any other library / shared-maths change needs Argi's approval.
- Philosophy: simple maths in feedback loops (phase accumulator, one-pole, TPT SVF).

## 8. Cost
Per channel: a few LCG steps (CLT-12 Gaussian = 12 LCG steps per generator), two one-poles, one `2^x`, one tilt `pow`, and either a sine or `tan` plus the SVF. That's tens of nanoseconds per sample.

## 9. Tests

**Library (step 2.2-5):** byte-for-byte EQ Filter and Noise Generator regression against the goldens (scalar and SIMD noise paths).

**Softpop (native, offline, 48 kHz, ≥ 10 s per case):**
1. **Decorrelation.** Pearson |r| < 0.01 for `ñ_pitch` vs `ñ_amp`, each of them vs `N_audio`, and L vs R per target in Stereo. Run across several Seeds.
2. **Mono / Seed / Reset.**
   - Mono gives L == R bit-identical.
   - Same Seed → bit-identical output. A Reset edge reproduces from the start. A Seed change restarts.
   - A Model switch doesn't shift the streams.
3. **Baselines.**
   - Sine with mods 0 is a pure sine (THD+N < −100 dB) at every Width.
   - Filter with mods 0 has its peak at fEff and a −3 dB width ≈ fEff/Q(Width).
4. **Frequency / `f` parity with `polyBlep`.**
   - Unwired: `fEff` = Frequency knob (smoothed, +MOD).
   - Wired: `fEff` = the `f` cable, per sample, with the knob ignored.
   - The same Hz sequence fed to `polyBlep` and Softpop Sine (mods 0) gives identical phase increments, including clamping at ±Nyquist and negative Hz.
5. **Pitch Mod symmetric in cents** (both models): 1200·log2(fInst/fEff) has mean ≈ 0, skew ≈ 0, σ ≈ PitchMod (±5 %). No NaN near Nyquist.
6. **Amp Mod level-preserving.**
   - RMS is flat across 0→1 (±0.5 dB) in both models.
   - Sine at 1 has no carrier line, a spectrum symmetric about fEff (±0.5 dB), and a half-width ≈ Bmod (±20 %).
7. **Filter level across Width.** ±1 dB from W=0 to W=1 at 1 kHz, for each Color.
8. **Filter level across the keyboard (tilt).** For **each Color**, RMS within **±1 dB** over fEff = 50 Hz … 10 kHz (octave steps) at the default Width 0.3 and at W = 0. Broad widths (W > 0.8, Q < ~1) are reported, not gated, because the band leaves the narrowband approximation there.
9. **Between models.** Sine vs Filter RMS within ±1 dB at 1 kHz, and within ±1.5 dB across 50 Hz–10 kHz, for each Color.
10. **Modulation stress.** Max Pitch Mod, W = 1 and a 20 Hz ↔ 18 kHz sweep on the `f` input give no NaN or blow-up.
11. **Edges.** Frequency 0 and 20 kHz, Width 0 and 1, each Color, and Amplitude 0 give finite output.

## 10. Resolved questions
- ~~Ship which algorithms / which bandpass / Purity curve~~ Superseded by the Sine / Filter + always-active mods design (Argi, 2026-10-07).
- ~~SVF and noise reuse~~ **Resolved:** library extraction approved (Argi, 2026-10-07, APP_POLICY §19). See §2.
- ~~Filter loudness vs pitch~~ **Resolved:** tilt correction `T_color`. See §6.
- ~~Mod Rate knob~~ **Resolved:** tied to Width, no knob.
- ~~Pitch input~~ **Resolved (Argi final, 2026-10-07):** no pitch parameter and no pitch input. Frequency-only, like `polyBlep`. No Trigger.
- ~~Q-f: f multiply vs replace~~ **Resolved (Argi, 2026-10-07):** a wired `f` **replaces** Frequency, exactly like the other oscillators (§3).
- ~~Default model~~ **Resolved:** Filter.

## 11. Minor open questions: proposed defaults (Sandy builds with these unless Argi overrides)

| # | Question | Proposed default |
|---|---|---|
| 1 | Smoothing stages for the mod noise | **One one-pole** (Lorentzian band, simplest). Two stages is an easy later switch. |
| 2 | Pitch Mod cents scaling | **1σ RMS spread in cents**, range 0–2400 (peaks reach about ±3σ, clamped at ±4σ). |
| 3 | Amp Mod at full depth | **Full ring mod, no carrier at 1** (the formula as written). |
| 4 | Color on mod noise | **Yes**, Color shapes the mod noises too, unit-RMS calibrated, so Color is active in Sine as well. |
| 5 | Stereo spread knob | **None in v1.** Stereo = independent L/R; Mono = shared. |
| 6 | Names | Keep **"Softpop Oscillator"**; labels **Width** (noise bandwidth) and **Stereo** (key `stereoMode`). |
| 7 | Width mapping / units | 0–1 log knob; Q 2000→0.5; Bmod 0.1→2000 Hz; the tooltip shows the current Q and Bmod. |
| 8 | C-001 D5 | Mark Softpop **"port planned → `docs/SOFTPOP_PLAN.md`"** in BUG_PLAN. |
