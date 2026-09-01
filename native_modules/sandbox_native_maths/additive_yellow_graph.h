// Yellow Graph (Additive) — shared C++ kernels for graph_engine.
// Ported from public/modules/additiveGraph/additive-graph-math.js.
// Header-only (freestanding): Gen / Bubble / A2 effects / SumSample.
// Noisy* 0/1: quantum walk + plane lerp; mode 2: WhiteNoise recipe at Out.

#pragma once

#ifndef ADDITIVE_YELLOW_GRAPH_H
#define ADDITIVE_YELLOW_GRAPH_H

#include "scalar_helpers.h"
#include "exp_log.h"
#include "analog_filter_trig.h"
#include "nonlinearity.h"

namespace soemdsp_yellow_graph {

// graph_engine type ids (keep in sync with JS NATIVE_GRAPH_TYPE_IDS).
static const int kTypeAdditiveGenerator = 111;
static const int kTypeAdditiveBubble = 112;
static const int kTypeAdditiveOut = 113;
static const int kTypeAdditiveLinearFilter = 114;
static const int kTypeAdditiveAnalogFilter = 115; // Butterworth
static const int kTypeAdditiveLadderFilter = 116;
static const int kTypeAdditiveFrequencySkew = 117;
static const int kTypeAdditiveQuantizeFreq = 118;
static const int kTypeAdditiveQuantizePhase = 119;
static const int kTypeAdditivePan = 120;
static const int kTypeAdditiveNoisyFreq = 121;
static const int kTypeAdditiveNoisyPhase = 122;
static const int kTypeAdditiveNoisyPan = 123;
static const int kTypeAdditiveNoisyAmp = 124;
static const int kTypeAdditivePhaseEntry = 125; // Lock / Free / Random new-slot phase
static const int kTypeAdditiveBlaster = 126; // Frequency-bin shared phase
static const int kTypeAdditiveDiffusor = 127; // Diffuse → quantize flex-grid

static const int kMaxHarmonics = 1024;
static const int kDefaultHarmonics = 32;
// Sample-accurate Bubble Cutoff strip (matches graph_engine kMaxBlockFrames).
static const int kCutoffStripMax = 128;

// Optimize Inaudible Harmonics: −60 dBFS linear floor (matches JS).
static const float kInaudibleAmp = 0.001f; // 10^(-60/20)

// Per-harmonic CheapWalk / CheapFilteredNoise / WhiteNoise LCG state.
// Lives on graph_engine Node (not wiped by graph_copy).
struct YellowWalk {
  unsigned int seed;
  float x;
  float y;
  float out;
};

// WhiteNoise recipe stamped on the Graph — Out adds fresh bipolar each sample.
struct NoiseRecipe {
  unsigned char active; // 1 when mode-2 recipe is live
  unsigned char mode;   // 2 when active
  float amount;
  unsigned int seeds[kMaxHarmonics];
};

// Quantum Graph chunk (Yellow data-plane). Owned by graph_engine Node extension.
struct GraphPayload {
  int harmonics; // slot count
  float ratio[kMaxHarmonics];
  float phase[kMaxHarmonics];
  float amplitude[kMaxHarmonics];
  float pan[kMaxHarmonics]; // −1…+1
  // Quantum lerps — Out interpolates within the block (Bubble + Noisy 0/1).
  float phaseFrom[kMaxHarmonics];
  float phaseTo[kMaxHarmonics];
  float ampFrom[kMaxHarmonics];
  float ampTo[kMaxHarmonics];
  float ratioFrom[kMaxHarmonics];
  float ratioTo[kMaxHarmonics];
  float panFrom[kMaxHarmonics];
  float panTo[kMaxHarmonics];
  unsigned char phaseReset; // face refresh; Out does not wipe all phaseAcc
  // How Out seeds *new* phaseAcc slots when H grows (0=lock to fund, 1=free 0, 2=random).
  unsigned char phaseEntryMode;
  unsigned char hasPhaseLerp;
  unsigned char hasAmpLerp;
  unsigned char hasRatioLerp;
  unsigned char hasPanLerp;
  NoiseRecipe ratioNoise;
  NoiseRecipe phaseNoise;
  NoiseRecipe panNoise;
  NoiseRecipe ampNoise;
  // Sample-accurate Bubble Cutoff: Out applies harmonic_count_gain per frame.
  // When hasCutoffStrip: Bubble skips amp bake; strip[i] is cutoff 0…1.
  unsigned char hasCutoffStrip;
  unsigned short cutoffStripFrames;
  float cutoffStrip[kCutoffStripMax];
};

static inline void noise_recipe_clear(NoiseRecipe& r) {
  r.active = 0;
  r.mode = 0;
  r.amount = 0.0f;
}

static inline void noise_recipe_copy(NoiseRecipe& dst, const NoiseRecipe& src, int h) {
  dst.active = src.active;
  dst.mode = src.mode;
  dst.amount = src.amount;
  if (!src.active) return;
  const int n = h < kMaxHarmonics ? h : kMaxHarmonics;
  for (int i = 0; i < n; i += 1) dst.seeds[i] = src.seeds[i];
}

inline void graph_clear(GraphPayload& g) {
  g.harmonics = 0;
  g.phaseReset = 0;
  g.phaseEntryMode = 0; // lock
  g.hasPhaseLerp = 0;
  g.hasAmpLerp = 0;
  g.hasRatioLerp = 0;
  g.hasPanLerp = 0;
  g.hasCutoffStrip = 0;
  g.cutoffStripFrames = 0;
  noise_recipe_clear(g.ratioNoise);
  noise_recipe_clear(g.phaseNoise);
  noise_recipe_clear(g.panNoise);
  noise_recipe_clear(g.ampNoise);
  for (int i = 0; i < kMaxHarmonics; i += 1) {
    g.ratio[i] = 0.0f;
    g.phase[i] = 0.0f;
    g.amplitude[i] = 0.0f;
    g.pan[i] = 0.0f;
    g.phaseFrom[i] = 0.0f;
    g.phaseTo[i] = 0.0f;
    g.ampFrom[i] = 0.0f;
    g.ampTo[i] = 0.0f;
    g.ratioFrom[i] = 0.0f;
    g.ratioTo[i] = 0.0f;
    g.panFrom[i] = 0.0f;
    g.panTo[i] = 0.0f;
  }
}

inline void graph_copy(GraphPayload& dst, const GraphPayload& src) {
  dst.harmonics = src.harmonics;
  dst.phaseReset = src.phaseReset;
  dst.phaseEntryMode = src.phaseEntryMode;
  dst.hasPhaseLerp = src.hasPhaseLerp;
  dst.hasAmpLerp = src.hasAmpLerp;
  dst.hasRatioLerp = src.hasRatioLerp;
  dst.hasPanLerp = src.hasPanLerp;
  dst.hasCutoffStrip = src.hasCutoffStrip;
  dst.cutoffStripFrames = src.cutoffStripFrames;
  if (src.hasCutoffStrip && src.cutoffStripFrames > 0) {
    const int n = src.cutoffStripFrames < kCutoffStripMax
      ? (int)src.cutoffStripFrames
      : kCutoffStripMax;
    for (int i = 0; i < n; i += 1) dst.cutoffStrip[i] = src.cutoffStrip[i];
  }
  const int h = src.harmonics < kMaxHarmonics ? src.harmonics : kMaxHarmonics;
  noise_recipe_copy(dst.ratioNoise, src.ratioNoise, h);
  noise_recipe_copy(dst.phaseNoise, src.phaseNoise, h);
  noise_recipe_copy(dst.panNoise, src.panNoise, h);
  noise_recipe_copy(dst.ampNoise, src.ampNoise, h);
  for (int i = 0; i < h; i += 1) {
    dst.ratio[i] = src.ratio[i];
    dst.phase[i] = src.phase[i];
    dst.amplitude[i] = src.amplitude[i];
    dst.pan[i] = src.pan[i];
    dst.phaseFrom[i] = src.phaseFrom[i];
    dst.phaseTo[i] = src.phaseTo[i];
    dst.ampFrom[i] = src.ampFrom[i];
    dst.ampTo[i] = src.ampTo[i];
    dst.ratioFrom[i] = src.ratioFrom[i];
    dst.ratioTo[i] = src.ratioTo[i];
    dst.panFrom[i] = src.panFrom[i];
    dst.panTo[i] = src.panTo[i];
  }
}

// --- internal helpers (header-local) ---

static inline float wrap01f(float v) {
  return (float)soemdsp_maths::wrap01((double)v);
}

static inline float clamp_f(float v, float lo, float hi) {
  return (float)soemdsp_maths::clamp((double)v, (double)lo, (double)hi);
}

// Rational 0…1 map. c∈(−1…+1).
static inline float skew_rational(float t, float c) {
  const float x = clamp_f(t, 0.0f, 1.0f);
  const float skew = clamp_f(c, -0.9999f, 0.9999f);
  const float cv = skew * x;
  const float den = 2.0f * cv - skew + 1.0f;
  if (soemdsp_maths::dsp_fabs((double)den) < 1e-12) return x;
  return (cv + x) / den;
}

// Exponential 0…1 map. c∈(−1…+1): + = slow start / fast end.
static inline float skew_exp(float t, float c) {
  const float x = clamp_f(t, 0.0f, 1.0f);
  const double k = (double)clamp_f(c, -0.9999f, 0.9999f) * 8.0;
  if (soemdsp_maths::dsp_fabs(k) < 1e-6) return x;
  return (float)((soemdsp_maths::dsp_exp(k * (double)x) - 1.0) / (soemdsp_maths::dsp_exp(k) - 1.0));
}

// Logarithmic 0…1 map. c∈(−1…+1): + = fast start / slow end.
static inline float skew_log(float t, float c) {
  const float x = clamp_f(t, 0.0f, 1.0f);
  const float s = clamp_f(c, -0.9999f, 0.9999f);
  if (soemdsp_maths::dsp_fabs((double)s) < 1e-6) return x;
  if (s > 0.0f) {
    const double u = (double)s * 8.0;
    return (float)(soemdsp_maths::dsp_ln(1.0 + u * (double)x) / soemdsp_maths::dsp_ln(1.0 + u));
  }
  const double u = (double)(-s) * 8.0;
  return (float)(1.0 - soemdsp_maths::dsp_ln(1.0 + u * (1.0 - (double)x)) / soemdsp_maths::dsp_ln(1.0 + u));
}

// Growl Skew Curve: 0 Rational, 1 Exponential, 2 Logarithmic, 3 Linear.
static inline float skew_map(float t, float curve, int mode) {
  if (mode == 3) return clamp_f(t, 0.0f, 1.0f);
  if (mode == 1) return skew_exp(t, -curve);
  if (mode == 2) return skew_log(t, curve);
  return skew_rational(t, curve);
}

// Fractional harmonic-count gain (Bubble Cutoff). index 0-based; edge in slot space.
static inline float harmonic_count_gain(int index, float edge) {
  if (!(edge > 0.0f) || index < 0) return 0.0f;
  const float fullF = (float)soemdsp_maths::dsp_floor((double)edge + 1e-9);
  const int full = (int)fullF;
  const float frac = edge - fullF;
  if (index < full) return 1.0f;
  if (index == full && frac > 1e-9f) return frac;
  return 0.0f;
}

// Bubble Unskew: lerp phaseSkew→unskew as cutoff 0→1 when unskew>0.
static inline float bubble_effective_phase_skew(float phaseSkew, float unskew, float cutoff) {
  const float skew = (phaseSkew * 0.0f == 0.0f) ? phaseSkew : 0.0f;
  if (!(unskew > 0.0f)) return skew;
  const float cut = (cutoff * 0.0f == 0.0f) ? clamp_f(cutoff, 0.0f, 1.0f) : 1.0f;
  return skew + (unskew - skew) * cut;
}

// Waveforms 0–6: Saw / Square / PulseCenter / PulseLeft / PulseRight / Tri / RectSine.
static inline void waveform_partial(
  int waveform, int harmonic, float pwm, float* ampOut, float* phaseOut, float* ratioOut
) {
  const int h = harmonic < 1 ? 1 : harmonic;
  const bool odd = (h % 2) == 1;
  const float m = clamp_f(pwm, -1.0f, 1.0f);
  float amplitude = 0.0f;
  float phase = 0.0f;
  const int wf = waveform;

  const float pulseDuty = 0.5f + m * 0.48f;
  const float pulseAmp =
    (float)(soemdsp_maths::dsp_sin(soemdsp_maths::kPi * (double)h * (double)pulseDuty) / (double)h);

  switch (wf) {
    case 0: // Saw
      amplitude = 1.0f / (float)h;
      phase = odd ? 0.5f : 0.0f;
      break;
    case 1: // Square
      amplitude = odd ? (1.0f / (float)h) : 0.0f;
      phase = 0.5f;
      break;
    case 2: // PulseCenter
      amplitude = pulseAmp;
      phase = 0.25f;
      break;
    case 3: // PulseLeft
      amplitude = pulseAmp;
      phase = (float)h * pulseDuty * 0.5f;
      break;
    case 4: // PulseRight
      amplitude = pulseAmp;
      phase = 1.0f - ((float)h * pulseDuty * 0.5f);
      break;
    case 5: // Tri
      amplitude = odd ? (1.0f / (float)(h * h)) : 0.0f;
      phase = (h % 4 == 1) ? 0.0f : 0.5f;
      break;
    case 6: // RectSine
      amplitude = 1.0f / (float)(h * h);
      phase = odd ? 0.25f : 0.75f;
      break;
    default:
      amplitude = 1.0f / (float)h;
      phase = odd ? 0.5f : 0.0f;
      break;
  }
  if (!(amplitude * 0.0f == 0.0f)) amplitude = 0.0f;
  if (amplitude < 0.0f) {
    amplitude = -amplitude;
    phase += 0.5f;
  }
  *ampOut = amplitude;
  *phaseOut = wrap01f(phase);
  *ratioOut = (float)h;
}

// Soft Nyquist skirt: full until 0.75·Nyquist, linear 1→0 to Nyquist.
static inline float nyquist_amp_gain(float hz, float sampleRate) {
  const float sr = sampleRate > 1.0f ? sampleRate : 1.0f;
  const float nyquist = 0.5f * sr;
  const float f = hz < 0.0f ? -hz : hz;
  if (!(nyquist > 0.0f) || !(f >= 0.0f)) return 0.0f;
  if (f >= nyquist) return 0.0f;
  const float rampStart = 0.75f * nyquist;
  if (f <= rampStart) return 1.0f;
  const float denom = nyquist - rampStart > 1e-12f ? (nyquist - rampStart) : 1e-12f;
  return 1.0f - (f - rampStart) / denom;
}

// HarmonicFade: 0 Instant / 1 Smoothed / 2 Decimal.
static inline int normalize_harmonic_fade(float mode) {
  const int n = (int)(mode + (mode >= 0.0f ? 0.5f : -0.5f));
  if (n == 0 || n == 2) return n;
  return 1;
}

// Build Generator Graph: ratios + waveform amps/phases; pan centered.
// harmonicFade Instant/Smoothed: round H. Decimal: ceil + trailing frac amp.
inline void build_from_waveform(
  GraphPayload& out,
  int waveform,
  float pwm,
  float harmonics,
  float phaseRotation,
  float harmonicFade = 1.0f
) {
  const int fade = normalize_harmonic_fade(harmonicFade);
  float exact = (harmonics * 0.0f == 0.0f) ? harmonics : 0.0f;
  if (exact < 0.0f) exact = 0.0f;
  if (exact > (float)kMaxHarmonics) exact = (float)kMaxHarmonics;

  int H = 0;
  float lastFrac = 0.0f;
  if (fade != 2) {
    double hr = soemdsp_maths::dsp_floor((double)exact + 0.5);
    if (hr < 0.0) hr = 0.0;
    if (hr > (double)kMaxHarmonics) hr = (double)kMaxHarmonics;
    H = (int)hr;
    exact = (float)H;
  } else if (exact > 0.0f) {
    const float fullF = (float)soemdsp_maths::dsp_floor((double)exact + 1e-9);
    const int full = (int)fullF;
    lastFrac = exact - fullF;
    if (lastFrac > 1e-9f) {
      H = full + 1;
      if (H > kMaxHarmonics) {
        H = kMaxHarmonics;
        lastFrac = 0.0f;
      }
    } else {
      H = full;
      lastFrac = 0.0f;
    }
  }

  out.harmonics = H;
  out.phaseReset = 0;
  out.phaseEntryMode = 0; // Generator default: lock new slots to fund
  out.hasAmpLerp = 0;
  out.hasPhaseLerp = 0;
  out.hasRatioLerp = 0;
  out.hasPanLerp = 0;
  const float m = clamp_f(pwm, -1.0f, 1.0f);
  const float rot = (phaseRotation * 0.0f == 0.0f) ? phaseRotation : 0.0f;
  for (int i = 0; i < H; i += 1) {
    float amp = 0.0f, ph = 0.0f, ratio = 0.0f;
    waveform_partial(waveform, i + 1, m, &amp, &ph, &ratio);
    out.ratio[i] = ratio;
    out.phase[i] = wrap01f(ph + rot);
    if (lastFrac > 0.0f && i == H - 1) amp *= lastFrac;
    out.amplitude[i] = amp;
    out.pan[i] = 0.0f;
  }
  for (int i = H; i < kMaxHarmonics; i += 1) {
    out.ratio[i] = 0.0f;
    out.phase[i] = 0.0f;
    out.amplitude[i] = 0.0f;
    out.pan[i] = 0.0f;
  }
  (void)exact; // face uses host params.harmonics; slots are amplitude-scaled
}

// Seed a new Out phaseAcc slot when H grows.
// mode 0 lock: (ratio[i]/ratio[0]) * fundPhase — stays harmonic with running bank.
// mode 1 free: 0 — unlocked entry (the “nice” desync from keeping old phases).
// mode 2 random: uniform [0,1) via LCG.
static inline double seed_new_phase_acc(
  const GraphPayload& g,
  int index,
  double fundPhase,
  unsigned char mode,
  unsigned int& rng
) {
  if (mode == 1) return 0.0;
  if (mode == 2) {
    rng = rng * 1664525u + 1013904223u;
    return (double)((rng >> 8) & 0x00FFFFFFu) / 16777216.0;
  }
  // lock (default)
  const float r0 = g.ratio[0];
  const float ri = (index >= 0 && index < kMaxHarmonics) ? g.ratio[index] : 0.0f;
  if (!(r0 > 1e-12f) || !(ri * 0.0f == 0.0f)) return soemdsp_maths::wrap01(fundPhase);
  return soemdsp_maths::wrap01(fundPhase * (double)(ri / r0));
}

// Phase Entry Yellow effect: stamp how Out seeds newly added harmonics.
inline void apply_phase_entry(GraphPayload& g, float mode) {
  int m = (int)(mode + (mode >= 0.0f ? 0.5f : -0.5f));
  if (m < 0) m = 0;
  if (m > 2) m = 2;
  g.phaseEntryMode = (unsigned char)m;
}

// Blaster: index bins (stable under fund sweep). Each bin gets one shared phase.
// phaseMode 0 = Stagger (Bubble-like curve staircase + jumps).
// phaseMode 1 = Random (seeded LCG per bin — old shimmer).
// layout is unused by DSP (face-only on host).
inline void apply_blaster(
  GraphPayload& g,
  float quantization,
  float /*layout*/ = 0.0f,
  float /*fundHz*/ = 100.0f,
  float /*sampleRate*/ = 44100.0f,
  float seed = 1.0f,
  float depth = 1.0f,
  float curve = 0.0f,
  float curveKind = 2.0f, // default Logarithmic
  float offset = 0.0f,
  float phaseMode = 0.0f, // 0 Stagger / 1 Random
  float invert = 0.0f,
  float bias = 0.0f,
  float jump = 0.0f
) {
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) return;
  const float q = (quantization * 0.0f == 0.0f) ? quantization : 0.0f;
  if (!(q >= 0.5f)) return;
  int bins = (int)(q + (q >= 0.0f ? 0.5f : -0.5f));
  if (bins < 1) return;
  if (bins > H) bins = H;

  int mode = (int)(phaseMode + (phaseMode >= 0.0f ? 0.5f : -0.5f));
  if (mode < 0) mode = 0;
  if (mode > 1) mode = 1;
  int kind = (int)(curveKind + (curveKind >= 0.0f ? 0.5f : -0.5f));
  if (kind < 0) kind = 0;
  if (kind > 3) kind = 3;
  const bool doInvert = invert >= 0.5f;
  const float depthAmt = (depth * 0.0f == 0.0f) ? depth : 0.0f;
  const float curveAmt = clamp_f((curve * 0.0f == 0.0f) ? curve : 0.0f, -0.9999f, 0.9999f);
  const float offsetAmt = (offset * 0.0f == 0.0f) ? offset : 0.0f;
  const float biasAmt = (bias * 0.0f == 0.0f) ? bias : 0.0f;
  const float jumpAmt = (jump * 0.0f == 0.0f) ? jump : 0.0f;

  float binPhase[kMaxHarmonics];
  if (mode == 1) {
    unsigned int rng = (unsigned int)(seed >= 0.0f ? seed : -seed);
    if (rng == 0) rng = 1u;
    for (int b = 0; b < bins; b += 1) {
      rng = rng * 1664525u + 1013904223u + (unsigned int)b * 747796405u;
      binPhase[b] = (float)((rng >> 8) & 0x00FFFFFFu) / 16777216.0f;
    }
  } else {
    // Stagger: staircase of Bubble-style curve → series of phase jumps.
    const float denom = bins > 1 ? (float)(bins - 1) : 1.0f;
    for (int b = 0; b < bins; b += 1) {
      float t = bins > 1 ? (float)b / denom : 0.0f;
      t = clamp_f(t + biasAmt, 0.0f, 1.0f);
      if (doInvert) t = 1.0f - t;
      const float mapped = skew_map(t, curveAmt, kind);
      float ph = mapped * depthAmt + offsetAmt + (float)b * jumpAmt;
      binPhase[b] = wrap01f(ph);
    }
  }

  for (int i = 0; i < H; i += 1) {
    int bin = (int)(((long long)i * (long long)bins) / (long long)H);
    if (bin >= bins) bin = bins - 1;
    g.phase[i] = binPhase[bin];
  }
  g.hasPhaseLerp = 0;
}

// One-quantum amp crossfade when Generator slot count changes.
// prev* = planes from the previous quantum (length prevH). newH = rebuilt slot count.
// Grows: new partials ampFrom=0. Shrinks: keep old ratio/phase one quantum, ampTo=0.
// Sets hasAmpLerp; caller may stamp phaseReset for face refresh (Out must not wipe all phaseAcc).
inline void apply_generator_harmonics_count_lerp(
  GraphPayload& g,
  const float* prevAmp,
  const float* prevRatio,
  const float* prevPhase,
  int prevH,
  int newH
) {
  if (!prevAmp || prevH < 0 || newH < 0) return;
  if (prevH == newH) return;
  const int pH = prevH > kMaxHarmonics ? kMaxHarmonics : prevH;
  const int nH = newH > kMaxHarmonics ? kMaxHarmonics : newH;
  const int Hlerp = pH > nH ? pH : nH;
  if (Hlerp <= 0) return;

  for (int i = 0; i < Hlerp; i += 1) {
    const float fromAmp = (prevAmp && i < pH) ? prevAmp[i] : 0.0f;
    float toAmp = 0.0f;
    if (i < nH) {
      toAmp = g.amplitude[i];
    } else {
      // Fade-out slot: restore spectral identity for this quantum.
      if (prevRatio && i < pH) g.ratio[i] = prevRatio[i];
      if (prevPhase && i < pH) g.phase[i] = prevPhase[i];
      g.pan[i] = 0.0f;
      toAmp = 0.0f;
    }
    g.ampFrom[i] = fromAmp;
    g.ampTo[i] = toAmp;
    g.amplitude[i] = toAmp;
  }
  g.harmonics = Hlerp;
  g.hasAmpLerp = 1;
}

// Shortest-path lerp on the unit circle [0,1).
static inline float lerp_phase01(float from, float to, float t) {
  float d = to - from;
  if (d > 0.5f) d -= 1.0f;
  if (d < -0.5f) d += 1.0f;
  return wrap01f(from + d * t);
}

// Bubble / Growl (rot=0, Log curve). Quantum phaseLerp + ampLerp so param
// moves do not zipper — Out interpolates from→to across the block.
// prevToPhase/prevToAmp = previous quantum's To planes (null → first quantum).
inline void apply_bubble(
  GraphPayload& g,
  float phaseSkew,
  float skewAmount,
  float cutoff,
  float unskew,
  const float* prevToPhase,
  const float* prevToAmp,
  int prevH,
  bool deferCutoffAmp = false
) {
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) {
    g.hasPhaseLerp = 0;
    g.hasAmpLerp = 0;
    return;
  }

  const float cut = (cutoff * 0.0f == 0.0f) ? clamp_f(cutoff, 0.0f, 1.0f) : 1.0f;
  const float baseSkew = (phaseSkew * 0.0f == 0.0f) ? phaseSkew : 0.0f;
  const float u = (unskew * 0.0f == 0.0f) ? unskew : 0.0f;
  const float eff = bubble_effective_phase_skew(baseSkew, u, cut);
  const float amount = (eff * 0.0f == 0.0f && eff > 0.0f) ? eff : 0.0f;
  const float curve = clamp_f(skewAmount, -0.9999f, 0.9999f);
  const float edge = cut * (float)H;
  const float H_eff = edge > 1e-12f ? edge : 1e-12f;
  // Sample-accurate path: keep pre-cutoff amps; Out gates with cutoffStrip[i].
  const bool applyAmp = !deferCutoffAmp && cut < 1.0f - 1e-12f;
  const bool havePrev = prevToPhase && prevH == H;

  for (int i = 0; i < H; i += 1) {
    float toAmp = g.amplitude[i];
    if (applyAmp) {
      toAmp = g.amplitude[i] * harmonic_count_gain(i, edge);
    }
    const float t = (float)i / H_eff;
    const float skewPhase = amount <= 0.0f ? 0.0f : skew_map(t, curve, 2) * amount;
    const float toPhase = wrap01f(g.phase[i] + skewPhase);

    g.phaseTo[i] = toPhase;
    g.phaseFrom[i] = havePrev ? prevToPhase[i] : toPhase;
    g.phase[i] = toPhase; // stamped end-of-quantum (faces / downstream)

    if (applyAmp) {
      g.ampTo[i] = toAmp;
      g.ampFrom[i] = (prevToAmp && prevH == H) ? prevToAmp[i] : toAmp;
      g.amplitude[i] = toAmp;
    }
  }
  g.hasPhaseLerp = 1;
  g.hasAmpLerp = applyAmp ? 1 : 0;
  if (!applyAmp) {
    // Cutoff open or deferred — amps untouched; clear amp lerp.
    for (int i = 0; i < H; i += 1) {
      g.ampFrom[i] = g.amplitude[i];
      g.ampTo[i] = g.amplitude[i];
    }
  }
}

// --- A2 helpers ---

static inline float dsp_sqrt_f(float x) {
  if (!(x > 0.0f)) return 0.0f;
  double y = (double)x;
  union { double d; unsigned long long u; } bits;
  bits.d = y;
  bits.u = (bits.u >> 1) + 0x1ff8000000000000ULL; // rough exponent half
  double g = bits.d;
  g = 0.5 * (g + y / g);
  g = 0.5 * (g + y / g);
  g = 0.5 * (g + y / g);
  return (float)g;
}

static inline float dsp_pow_f(float base, float exp) {
  if (!(base > 0.0f)) return 0.0f;
  if (!(exp * 0.0f == 0.0f)) return 1.0f;
  if (soemdsp_maths::dsp_fabs((double)exp) < 1e-12) return 1.0f;
  return (float)soemdsp_maths::dsp_exp((double)exp * soemdsp_maths::dsp_ln((double)base));
}

static inline float dsp_exp2_f(float x) {
  return (float)soemdsp_maths::dsp_exp2((double)x);
}

// FrequencySkew Exp: tighter than Bubble (*8) — k up to ~48.
static inline float skew_exp_tight(float t, float c) {
  const float x = clamp_f(t, 0.0f, 1.0f);
  const float s = clamp_f(c, -0.9999f, 0.9999f);
  if (soemdsp_maths::dsp_fabs((double)s) < 1e-6) return x;
  const float k = s * (12.0f + 36.0f * s * s);
  return (float)((soemdsp_maths::dsp_exp((double)k * (double)x) - 1.0)
    / (soemdsp_maths::dsp_exp((double)k) - 1.0));
}

// Filter mode: 0 LP / 1 BP / 2 HP (matches UI choice order).
static inline int normalize_filter_mode(float mode) {
  int m = (int)(mode + (mode >= 0.0f ? 0.5f : -0.5f));
  if (m == 1) return 1;
  if (m == 2) return 2;
  return 0;
}

static inline float filter_order_from_slope_db(float slopeDbOct) {
  if (!(slopeDbOct > 0.0f)) return 0.0f;
  float n = slopeDbOct / 6.0f;
  if (n > 64.0f) n = 64.0f;
  return n;
}

static inline float butterworth_mag(float freqHz, float cutoffHz, float order, int kindLp) {
  const float f = freqHz > 0.0f ? freqHz : 0.0f;
  const float fc = cutoffHz > 0.0f ? cutoffHz : 0.0f;
  const float n = order > 0.0f ? order : 0.0f;
  if (!(n > 0.0f)) return 1.0f;
  if (kindLp) {
    if (!(fc > 0.0f)) return 0.0f;
    if (!(f > 0.0f)) return 1.0f;
    const float r = f / fc;
    return 1.0f / dsp_sqrt_f(1.0f + dsp_pow_f(r, 2.0f * n));
  }
  if (!(fc > 0.0f)) return 1.0f;
  if (!(f > 0.0f)) return 0.0f;
  const float r = fc / (f > 1e-12f ? f : 1e-12f);
  return 1.0f / dsp_sqrt_f(1.0f + dsp_pow_f(r, 2.0f * n));
}

static inline float filter_skewed_freq_ratio(float freqHz, float cutoffHz, float skew) {
  const float f = freqHz > 1e-12f ? freqHz : 1e-12f;
  const float fc = cutoffHz > 1e-12f ? cutoffHz : 1e-12f;
  const float sk = clamp_f(skew, -0.9999f, 0.9999f);
  if (!(soemdsp_maths::dsp_fabs((double)sk) > 1e-9)) return f / fc;
  const float oct = (float)(soemdsp_maths::dsp_ln((double)(f / fc)) / 0.6931471805599453);
  const float warped = oct >= 0.0f
    ? oct * (1.0f + sk * 0.85f)
    : oct / (1.0f + sk * 0.85f > 1e-6f ? (1.0f + sk * 0.85f) : 1e-6f);
  return dsp_exp2_f(warped);
}

// Analog/Butterworth spectral gain (curveKind analog applies skew).
static inline float filter_response_gain_hz(
  float freqHz, int mode, float cutoffHz, float slopeDbOct, int analog, float skew
) {
  const float fc = cutoffHz > 0.0f ? cutoffHz : 0.0f;
  const float order = filter_order_from_slope_db(slopeDbOct);
  const float f = freqHz > 0.0f ? freqHz : 0.0f;

  if (mode == 1) { // bp
    if (!(fc > 0.0f) || !(order > 0.0f)) return 0.0f;
    const float oct = 4.0f / (order > 0.25f ? order : 0.25f);
    const float half = oct > 0.02f ? oct : 0.02f;
    const float fLo = fc / dsp_exp2_f(half);
    const float fHi = fc * dsp_exp2_f(half);
    float fEff = f;
    if (analog) {
      const float r = filter_skewed_freq_ratio(f, fc, skew);
      fEff = fc * r;
    }
    return butterworth_mag(fEff, fHi, order, 1) * butterworth_mag(fEff, fLo, order, 0);
  }
  if (mode == 2) { // hp
    if (!(order > 0.0f)) return 1.0f;
    if (analog && fc > 0.0f && f > 0.0f) {
      const float r = filter_skewed_freq_ratio(f, fc, skew);
      const float fEff = fc * (r > 1e-12f ? r : 1e-12f);
      return butterworth_mag(fEff, fc, order, 0);
    }
    return butterworth_mag(f, fc, order, 0);
  }
  // lp
  if (!(order > 0.0f)) return 1.0f;
  if (!(fc > 0.0f)) return 0.0f;
  if (analog && f > 0.0f) {
    const float r = filter_skewed_freq_ratio(f, fc, skew);
    const float rr = r > 1e-12f ? r : 1e-12f;
    return 1.0f / dsp_sqrt_f(1.0f + dsp_pow_f(rr, 2.0f * order));
  }
  return butterworth_mag(f, fc, order, 1);
}

// Linear Filter: rational-curve skirts. slope01 0=brickwall … 1=wide.
static inline float filter_response_gain_rational(
  float freqHz, int mode, float cutoffHz, float slope01, float skew
) {
  const float fc = cutoffHz > 0.0f ? cutoffHz : 0.0f;
  const float slope = clamp_f(slope01, 0.0f, 1.0f);
  const float f = freqHz > 0.0f ? freqHz : 0.0f;
  const float skewC = clamp_f(skew, -0.9999f, 0.9999f);
  const float halfOct = slope <= 1e-6f ? 0.0f : (0.05f + slope * 5.0f);

  if (mode == 0) { // lp
    if (!(fc > 0.0f)) return 0.0f;
    if (!(f > 0.0f)) return 1.0f;
    if (halfOct <= 0.0f) return f <= fc ? 1.0f : 0.0f;
    const float oct = (float)(soemdsp_maths::dsp_ln((double)(f / fc)) / 0.6931471805599453);
    const float t = clamp_f((oct + halfOct) / (2.0f * halfOct), 0.0f, 1.0f);
    return 1.0f - skew_rational(t, skewC);
  }
  if (mode == 2) { // hp
    if (!(fc > 0.0f)) return 1.0f;
    if (!(f > 0.0f)) return 0.0f;
    if (halfOct <= 0.0f) return f >= fc ? 1.0f : 0.0f;
    const float oct = (float)(soemdsp_maths::dsp_ln((double)(f / fc)) / 0.6931471805599453);
    const float t = clamp_f((oct + halfOct) / (2.0f * halfOct), 0.0f, 1.0f);
    return skew_rational(t, skewC);
  }
  // bp
  if (!(fc > 0.0f) || !(f > 0.0f)) return 0.0f;
  const float passOct = halfOct <= 0.0f ? 0.02f : (halfOct * 0.35f > 0.02f ? halfOct * 0.35f : 0.02f);
  const float edgeOct = halfOct <= 0.0f ? 0.01f : (halfOct * 0.65f > 0.02f ? halfOct * 0.65f : 0.02f);
  const float a = (float)soemdsp_maths::dsp_fabs(
    soemdsp_maths::dsp_ln((double)(f / fc)) / 0.6931471805599453
  );
  if (a <= passOct) return 1.0f;
  if (a >= passOct + edgeOct) return 0.0f;
  return skew_rational(1.0f - ((a - passOct) / edgeOct), skewC);
}

static inline float ladder_resonance_gain(
  float freqHz, float cutoffHz, float resonance, float slopeDbOct, int mode,
  float* depthOut, float* fPeakOut
) {
  const float res = resonance > 0.0f ? resonance : 0.0f;
  const float order = filter_order_from_slope_db(slopeDbOct > 0.0f ? slopeDbOct : 12.0f);
  const float f = freqHz > 1e-12f ? freqHz : 1e-12f;
  const float fc = cutoffHz > 1e-12f ? cutoffHz : 1e-12f;
  float fPeak = fc;
  if (mode == 0) fPeak = fc * 0.92f;
  else if (mode == 2) fPeak = fc * 1.08f;
  *fPeakOut = fPeak;
  if (!(res > 1e-12f) || !(order > 0.0f)) {
    *depthOut = 0.0f;
    return 1.0f;
  }
  const float oct = (float)(soemdsp_maths::dsp_ln((double)(f / fPeak)) / 0.6931471805599453);
  const float bw = 0.85f / dsp_sqrt_f(1.0f + order * 0.35f);
  const float bwSafe = bw > 0.08f ? bw : 0.08f;
  const float bump01 = 1.0f / (1.0f + (oct * oct) / (bwSafe * bwSafe));
  const float depth = res / (1.0f + res * 0.08f);
  *depthOut = depth;
  return 1.0f + depth * bump01;
}

static inline float ladder_response_gain_hz(
  float freqHz, int mode, float cutoffHz, float slopeDbOct, float resonance
) {
  const float base = filter_response_gain_hz(freqHz, mode, cutoffHz, slopeDbOct, 1, 0.0f);
  float depth = 0.0f, fPeak = cutoffHz;
  const float partsGain = ladder_resonance_gain(
    freqHz, cutoffHz, resonance, slopeDbOct, mode, &depth, &fPeak
  );
  if (!(depth > 1e-12f)) return base;
  const float den = 1.0f + depth;
  float resGain = partsGain / (den > 1e-12f ? den : 1e-12f);
  float g = base * resGain;
  const float baseAtPeak = filter_response_gain_hz(fPeak, mode, cutoffHz, slopeDbOct, 1, 0.0f);
  if (baseAtPeak > 1e-12f) g /= baseAtPeak;
  return g;
}

static inline void scale_harmonic_amp(GraphPayload& g, int i, float gain) {
  if (i < 0 || i >= kMaxHarmonics) return;
  const float scale = (gain * 0.0f == 0.0f) ? gain : 0.0f;
  float a = g.amplitude[i];
  if (!(a * 0.0f == 0.0f)) a = 0.0f;
  g.amplitude[i] = a * scale;
}

// Snap x=r/r0 to nearest integer multiple or dyadic division.
static inline float snap_harmonic_multiple(float x) {
  if (!(x > 0.0f)) return 1.0f;
  float best = 1.0f;
  float bestDist = (float)soemdsp_maths::dsp_fabs((double)(x - 1.0f));
  const int nMax = (int)soemdsp_maths::dsp_ceil((double)x) + 2;
  const int nHi = nMax > 1 ? nMax : 1;
  for (int n = 1; n <= nHi; n += 1) {
    const float d = (float)soemdsp_maths::dsp_fabs((double)(x - (float)n));
    if (d < bestDist) {
      bestDist = d;
      best = (float)n;
    }
  }
  for (int k = 1; k <= 16; k += 1) {
    const float div = dsp_exp2_f((float)(-k));
    const float d = (float)soemdsp_maths::dsp_fabs((double)(x - div));
    if (d < bestDist) {
      bestDist = d;
      best = div;
    }
  }
  return best;
}

// Stable per-harmonic unit random in [0,1). Matches JS HarmonicUnitRandom.
static inline float harmonic_unit_random(unsigned int seed, int index, unsigned int salt) {
  unsigned int s = seed;
  s ^= (unsigned int)(index + 1) * 0x9e3779b1u; // Math.imul wrap
  const unsigned int sal = salt ? salt : 1u;
  s ^= sal * 0x85ebca6bu;
  s = (s ^ (s >> 16)) * 0x7feb352du;
  s = (s ^ (s >> 15)) * 0x846ca68bu;
  s ^= s >> 16;
  return (float)((double)s / 4294967295.0);
}

// --- Noisy* walk helpers (match additive-graph-math.js) ---

static inline int normalize_noisy_mode(float mode) {
  const int n = (int)(mode + (mode >= 0.0f ? 0.5f : -0.5f));
  if (n == 1 || n == 2) return n;
  return 0;
}

static inline float noisy_speed01(float speedHz, float sampleRate, int blockFrames) {
  if (!(speedHz * 0.0f == 0.0f) || !(speedHz > 0.0f)) return 0.0f;
  const float sr = sampleRate > 1.0f ? sampleRate : 44100.0f;
  const int frames = blockFrames > 1 ? blockFrames : 1;
  return (speedHz / sr) * (float)frames;
}

static inline unsigned int noisy_seed_u32(float seed) {
  if (!(seed * 0.0f == 0.0f)) return 1u;
  const long long n = (long long)soemdsp_maths::dsp_floor((double)seed);
  return (unsigned int)n;
}

// Rebuild walks when seed/salt change; grow when H increases (JS ensureWalks).
inline void ensure_walks(
  YellowWalk* walks,
  int& walkCount,
  unsigned int& storedSeed,
  unsigned int& storedSalt,
  int H,
  unsigned int salt,
  unsigned int seed
) {
  const int need = H < 0 ? 0 : (H > kMaxHarmonics ? kMaxHarmonics : H);
  if (storedSeed != seed || storedSalt != salt) {
    walkCount = 0;
    storedSeed = seed;
    storedSalt = salt;
  }
  if (walkCount > need) walkCount = need;
  while (walkCount < need) {
    const int i = walkCount;
    unsigned int mixed =
      (seed ^ 0x9e3779b9u) * (salt + 0x85ebca6bu)
      + (unsigned int)(i + 1) * 0xc2b2ae35u;
    if (!mixed) mixed = (unsigned int)(i + 1);
    walks[i].seed = mixed;
    walks[i].x = 0.0f;
    walks[i].y = 0.0f;
    walks[i].out = 0.0f;
    walkCount += 1;
  }
}

static inline float cheap_noise_white_sample(YellowWalk& state) {
  unsigned int s = state.seed;
  s = 1664525u * s + 1013904223u;
  state.seed = s;
  return (float)((double)s / 4294967295.0) * 2.0f - 1.0f;
}

static inline float recipe_white_sample(unsigned int& seed) {
  unsigned int s = seed;
  s = 1664525u * s + 1013904223u;
  seed = s;
  return (float)((double)s / 4294967295.0) * 2.0f - 1.0f;
}

static inline float cheap_walk_step(YellowWalk& state, float speed01) {
  const float bipolar = cheap_noise_white_sample(state);
  const float rate = (speed01 * 0.0f == 0.0f && speed01 > 0.0f) ? speed01 : 0.0f;
  const float step = rate * 0.35f;
  float x = state.x + bipolar * step;
  if (!(x * 0.0f == 0.0f)) x = 0.0f;
  if (x > 1.0f) x = 2.0f - x;
  if (x < -1.0f) x = -2.0f - x;
  state.x = x;
  return x;
}

static inline float cheap_filtered_noise_step(YellowWalk& state, float speed01) {
  const float rate = (speed01 * 0.0f == 0.0f && speed01 > 0.0f) ? speed01 : 0.0f;
  if (!(rate > 0.0f)) {
    const float held = state.out;
    return (held * 0.0f == 0.0f) ? held : 0.0f;
  }
  const float white = cheap_noise_white_sample(state);
  const float capped = rate * 2.75f < 24.0f ? rate * 2.75f : 24.0f;
  const float a = 1.0f - (float)soemdsp_maths::dsp_exp(-(double)capped);
  const float y0 = state.y;
  const float y = y0 + a * (white - y0);
  state.y = y;
  const float aSafe = a > 8e-4f ? a : 8e-4f;
  float boost = 1.0f / dsp_pow_f(aSafe, 0.72f);
  if (boost > 14.0f) boost = 14.0f;
  const float out = (float)soemdsp_maths::tanh_approx((double)(y * boost));
  state.out = out;
  return out;
}

static inline float noisy_sample(YellowWalk& state, float speed01, int mode) {
  if (mode == 1) return cheap_filtered_noise_step(state, speed01);
  return cheap_walk_step(state, speed01);
}

static inline void stamp_white_noise_recipe(
  NoiseRecipe& recipe, float add, const YellowWalk* walks, int H
) {
  const float depth = (add * 0.0f == 0.0f && add > 0.0f) ? add : 0.0f;
  recipe.active = 1;
  recipe.mode = 2;
  recipe.amount = depth;
  const int n = H < kMaxHarmonics ? H : kMaxHarmonics;
  for (int i = 0; i < n; i += 1) recipe.seeds[i] = walks[i].seed;
}

// Sync Out-advanced WhiteNoise LCG seeds back onto Node walks (shared-ref in JS).
inline void sync_walk_seeds_from_recipe(
  YellowWalk* walks, int walkCount, const NoiseRecipe& recipe, int H
) {
  if (!recipe.active || !walks) return;
  const int n = H < walkCount ? H : walkCount;
  const int m = n < kMaxHarmonics ? n : kMaxHarmonics;
  for (int i = 0; i < m; i += 1) walks[i].seed = recipe.seeds[i];
}

// --- A2 apply_* (stamp in place; ignore lerpFrom) ---

inline void apply_linear_filter(
  GraphPayload& g, float mode, float cutoffHz, float slope01, float skew,
  float fundHz, float sampleRate
) {
  (void)sampleRate;
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) return;
  const int m = normalize_filter_mode(mode);
  const float f0 = fundHz > 0.0f ? fundHz : 0.0f;
  const float fc = (cutoffHz * 0.0f == 0.0f) ? cutoffHz : 0.0f;
  const float slope = (slope01 * 0.0f == 0.0f) ? slope01 : 0.25f;
  const float sk = (skew * 0.0f == 0.0f) ? skew : 0.0f;
  for (int i = 0; i < H; i += 1) {
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    const float partialHz = (r > 0.0f ? r : 0.0f) * f0;
    scale_harmonic_amp(g, i, filter_response_gain_rational(partialHz, m, fc, slope, sk));
  }
}

inline void apply_butterworth_filter(
  GraphPayload& g, float mode, float cutoffHz, float slopeDbOct, float skew,
  float fundHz, float sampleRate
) {
  (void)sampleRate;
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) return;
  const int m = normalize_filter_mode(mode);
  const float f0 = fundHz > 0.0f ? fundHz : 0.0f;
  const float fc = (cutoffHz * 0.0f == 0.0f) ? cutoffHz : 0.0f;
  const float slope = (slopeDbOct * 0.0f == 0.0f) ? slopeDbOct : 12.0f;
  const float sk = (skew * 0.0f == 0.0f) ? skew : 0.0f;
  for (int i = 0; i < H; i += 1) {
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    const float partialHz = (r > 0.0f ? r : 0.0f) * f0;
    scale_harmonic_amp(g, i, filter_response_gain_hz(partialHz, m, fc, slope, 1, sk));
  }
}

inline void apply_ladder_filter(
  GraphPayload& g, float mode, float cutoffHz, float slopeDb, float resonance,
  float fundHz, float sampleRate
) {
  (void)sampleRate;
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) return;
  const int m = normalize_filter_mode(mode);
  const float f0 = fundHz > 0.0f ? fundHz : 0.0f;
  const float fc = (cutoffHz * 0.0f == 0.0f) ? cutoffHz : 0.0f;
  const float slope = (slopeDb * 0.0f == 0.0f) ? slopeDb : 12.0f;
  const float res = (resonance * 0.0f == 0.0f) ? resonance : 0.0f;
  for (int i = 0; i < H; i += 1) {
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    const float partialHz = (r > 0.0f ? r : 0.0f) * f0;
    scale_harmonic_amp(g, i, ladder_response_gain_hz(partialHz, m, fc, slope, res));
  }
}

// FrequencySkew: stretch ratio span + mid compression. Curve 0 Exp / 1 Rat / 2 Log.
inline void apply_frequency_skew(
  GraphPayload& g, float lowStretch, float highStretch, float skew, float curveMode
) {
  const int H = g.harmonics;
  if (H <= 1 || H > kMaxHarmonics) return;
  const float L = (lowStretch * 0.0f == 0.0f) ? lowStretch : 1.0f;
  const float Hs = (highStretch * 0.0f == 0.0f) ? highStretch : 1.0f;
  const float skewAmt = (skew * 0.0f == 0.0f) ? skew : 0.0f;
  if (!(soemdsp_maths::dsp_fabs((double)(L - 1.0f)) > 1e-12)
      && !(soemdsp_maths::dsp_fabs((double)(Hs - 1.0f)) > 1e-12)
      && !(soemdsp_maths::dsp_fabs((double)skewAmt) > 1e-12)) {
    return;
  }
  int mode = (int)(curveMode + (curveMode >= 0.0f ? 0.5f : -0.5f));
  if (mode != 1 && mode != 2) mode = 0;
  const bool isExp = mode == 0;
  const float curveArg = isExp ? -skewAmt : skewAmt;
  float r0 = g.ratio[0];
  if (!(r0 * 0.0f == 0.0f)) r0 = 0.0f;
  if (r0 < 0.0f) r0 = 0.0f;
  float rHi = g.ratio[H - 1];
  if (!(rHi * 0.0f == 0.0f)) rHi = 0.0f;
  if (rHi < r0) rHi = r0;
  const float span = rHi - r0;
  const float newLo = r0 / (L != 0.0f ? L : 1.0f);
  const float newHi = rHi * Hs;
  const float newSpan = newHi - newLo;
  const bool hardHi = skewAmt >= 1.0f - 1e-12f;
  const bool hardLo = skewAmt <= -1.0f + 1e-12f;
  const float soft = (!hardHi && !hardLo) ? clamp_f(curveArg, -0.9999f, 0.9999f) : 0.0f;

  for (int i = 0; i < H; i += 1) {
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    if (r < 0.0f) r = 0.0f;
    float t = span > 1e-12f ? (r - r0) / span : (H <= 1 ? 0.0f : (float)i / (float)(H - 1));
    t = clamp_f(t, 0.0f, 1.0f);
    float u;
    if (hardHi) {
      u = t <= 0.0f ? 0.0f : 1.0f;
    } else if (hardLo) {
      u = t >= 1.0f ? 1.0f : 0.0f;
    } else if (isExp) {
      u = skew_exp_tight(t, soft);
    } else if (mode == 2) {
      u = skew_log(t, soft);
    } else {
      u = skew_rational(t, soft);
    }
    const float out = newLo + u * newSpan;
    g.ratio[i] = out > 0.0f ? out : 0.0f;
  }
}

// Random (bipolar) first, then optional snap. qFund reference is always the
// pre-random fundamental. affectFundamental: Off = lock ratio[0]; On = random
// may move ratio[0] but overtones still snap to the original fund reference.
inline void apply_quantize_freq(
  GraphPayload& g,
  float quantizeOn,
  float randomAmount,
  float seed,
  float affectFundamental = 0.0f
) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics) return;
  const int doQuant = (int)(quantizeOn + (quantizeOn >= 0.0f ? 0.5f : -0.5f)) == 1;
  const int affectFund = (int)(affectFundamental + (affectFundamental >= 0.0f ? 0.5f : -0.5f)) == 1;
  const float amt = (randomAmount * 0.0f == 0.0f) ? randomAmount : 0.0f;
  const float seedN = (seed * 0.0f == 0.0f) ? seed : 1.0f;
  if (!doQuant && !(soemdsp_maths::dsp_fabs((double)amt) > 1e-12)) return;
  float fund = g.ratio[0];
  if (!(fund * 0.0f == 0.0f)) fund = 0.0f;
  const float qFund = soemdsp_maths::dsp_fabs((double)fund) > 1e-12 ? fund : 1.0f;
  const unsigned int seedUse = (unsigned int)(long long)soemdsp_maths::dsp_floor((double)seedN);
  for (int i = 0; i < H; i += 1) {
    if (i == 0 && !affectFund) {
      g.ratio[0] = fund;
      continue;
    }
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    // 1) Bipolar random anywhere up/down (unit [0,1) → −1…+1).
    if (soemdsp_maths::dsp_fabs((double)amt) > 1e-12) {
      const float u = harmonic_unit_random(seedUse, i, 13u);
      r += (u * 2.0f - 1.0f) * amt;
    }
    // 2) Quantize after random (overtones only — never snap the fund slot).
    if (doQuant && i > 0) {
      r = snap_harmonic_multiple(r / qFund) * qFund;
    }
    if (r < 0.0f) r = 0.0f;
    g.ratio[i] = r;
  }
}

inline void apply_quantize_phase(GraphPayload& g, float quantizeOn, float randomAmount, float seed) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics) return;
  const int doQuant = (int)(quantizeOn + (quantizeOn >= 0.0f ? 0.5f : -0.5f)) == 1;
  const float amt = (randomAmount * 0.0f == 0.0f) ? randomAmount : 0.0f;
  const float seedN = (seed * 0.0f == 0.0f) ? seed : 1.0f;
  if (!doQuant && !(soemdsp_maths::dsp_fabs((double)amt) > 1e-12)) return;
  const float fundPhase = wrap01f(g.phase[0]);
  const unsigned int seedUse = (unsigned int)(long long)soemdsp_maths::dsp_floor((double)seedN);
  for (int i = 0; i < H; i += 1) {
    float p = wrap01f(g.phase[i]);
    if (doQuant) p = fundPhase;
    if (soemdsp_maths::dsp_fabs((double)amt) > 1e-12) {
      const float r = harmonic_unit_random(seedUse, i, 29u);
      if (amt >= 1.0f) {
        p = wrap01f(r * amt);
      } else {
        p = wrap01f(p + (r - p) * amt);
      }
    }
    g.phase[i] = p;
  }
}

// Width first (odd/even spread), then Pan crossfade to one side.
inline void apply_pan(GraphPayload& g, float panOffset, float width) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics) return;
  const float offset = clamp_f(panOffset, -1.0f, 1.0f);
  const float absPan = (float)soemdsp_maths::dsp_fabs((double)offset);
  const float signPan = offset > 1e-12f ? 1.0f : (offset < -1e-12f ? -1.0f : 0.0f);
  const float wRaw = (width * 0.0f == 0.0f) ? width : 0.0f;
  const float depth = (float)soemdsp_maths::dsp_fabs((double)wRaw);
  const float depthC = depth < 1.0f ? depth : 1.0f;
  const bool flip = wRaw < 0.0f;
  for (int i = 0; i < H; i += 1) {
    float pW = 0.0f;
    if (depthC > 1e-12f) {
      const float side = (i % 2 == 0) ? -1.0f : 1.0f;
      pW = (flip ? -side : side) * depthC;
    }
    g.pan[i] = clamp_f(pW * (1.0f - absPan) + signPan * absPan, -1.0f, 1.0f);
  }
}

// A2 Noisy*: salts Freq=13, Phase=29, Pan=47, Amp=61.
// Mode 0 CheapWalk / 1 CheapFilteredNoise — once per quantum + plane lerp at Out.
// Mode 2 WhiteNoise — recipe on Graph; Out adds fresh bipolar every sample.
inline void apply_noisy_freq(
  GraphPayload& g,
  float noiseMode,
  float add,
  float speedHz,
  float seed,
  YellowWalk* walks,
  int& walkCount,
  unsigned int& walkSeed,
  unsigned int& walkSalt,
  float* lerpFrom,
  int& lerpFromLen,
  float sampleRate,
  int blockFrames
) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics || !walks) return;
  const float amt = (add * 0.0f == 0.0f && add > 0.0f) ? add : 0.0f;
  const int mode = normalize_noisy_mode(noiseMode);
  const unsigned int seedUse = noisy_seed_u32(seed);
  ensure_walks(walks, walkCount, walkSeed, walkSalt, H, 13u, seedUse);

  if (mode == 2) {
    stamp_white_noise_recipe(g.ratioNoise, amt, walks, H);
    g.hasRatioLerp = 0;
    return;
  }

  noise_recipe_clear(g.ratioNoise);
  const float spd = noisy_speed01(speedHz, sampleRate, blockFrames);
  const bool havePrev = lerpFrom && lerpFromLen == H;
  for (int i = 0; i < H; i += 1) {
    const float w = noisy_sample(walks[i], spd, mode);
    float r = g.ratio[i];
    if (!(r * 0.0f == 0.0f)) r = 0.0f;
    float to = r + w * amt;
    if (to < 0.0f) to = 0.0f;
    g.ratioTo[i] = to;
    g.ratioFrom[i] = havePrev ? lerpFrom[i] : to;
    g.ratio[i] = to;
    if (lerpFrom) lerpFrom[i] = to;
  }
  g.hasRatioLerp = 1;
  lerpFromLen = H;
}

// Diffusor: hard phase scramble + CheapWalk animation only.
// diffusion 0 → all match phase[0], walks idle; 1 → ±4-cycle scramble + walk.
inline void apply_diffusor(
  GraphPayload& g,
  float diffusion,
  float seed,
  float speedHz,
  YellowWalk* walks,
  int& walkCount,
  unsigned int& walkSeed,
  unsigned int& walkSalt,
  float* lerpFrom,
  int& lerpFromLen,
  float sampleRate,
  int blockFrames
) {
  const int H = g.harmonics;
  if (H <= 0 || H > kMaxHarmonics) return;

  // No artificial upper cap — Diffusion can exceed 1 for harder scramble/walk.
  float diff = (diffusion * 0.0f == 0.0f) ? diffusion : 0.0f;
  if (diff < 0.0f) diff = 0.0f;
  const float phase0 = g.phase[0];
  const unsigned int seedUse = noisy_seed_u32(seed);
  if (walks) {
    ensure_walks(walks, walkCount, walkSeed, walkSalt, H, 71u, seedUse);
  }

  unsigned int rng = seedUse ? seedUse : 1u;
  const float spd = noisy_speed01(speedHz, sampleRate, blockFrames);
  const bool havePrev = lerpFrom && lerpFromLen == H;

  for (int i = 0; i < H; i += 1) {
    rng = rng * 1664525u + 1013904223u + (unsigned int)i * 747796405u;
    const float rnd = (float)((rng >> 8) & 0x00FFFFFFu) / 16777216.0f;
    // ±4 wraps at Diffusion=1; scales freely above 1 (no upper clamp).
    const float scramble = (rnd - 0.5f) * 2.0f * diff * 4.0f;
    float base = wrap01f(phase0 + scramble);
    // Always apply CheapWalk position. Speed only advances x — Speed=0 freezes the
    // same offset as a tiny Speed (never zero the offset just because spd==0).
    float walk = 0.0f;
    if (walks && diff > 0.0f) {
      const float bipolar = cheap_noise_white_sample(walks[i]);
      const float step = spd * 0.35f;
      float x = walks[i].x + bipolar * step;
      if (!(x * 0.0f == 0.0f)) x = 0.0f;
      if (x > 1.0f) x = 2.0f - x;
      if (x < -1.0f) x = -2.0f - x;
      walks[i].x = x;
      walk = x * diff * 2.0f;
    }
    const float to = wrap01f(base + walk);
    g.phaseTo[i] = to;
    g.phaseFrom[i] = havePrev ? lerpFrom[i] : to;
    g.phase[i] = to;
    if (lerpFrom) lerpFrom[i] = to;
  }
  g.hasPhaseLerp = (diff > 0.0f) ? 1 : 0;
  if (lerpFrom) lerpFromLen = H;
}

inline void apply_noisy_phase(
  GraphPayload& g,
  float noiseMode,
  float add,
  float speedHz,
  float seed,
  YellowWalk* walks,
  int& walkCount,
  unsigned int& walkSeed,
  unsigned int& walkSalt,
  float* lerpFrom,
  int& lerpFromLen,
  float sampleRate,
  int blockFrames
) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics || !walks) return;
  const float amt = (add * 0.0f == 0.0f && add > 0.0f) ? add : 0.0f;
  const int mode = normalize_noisy_mode(noiseMode);
  const unsigned int seedUse = noisy_seed_u32(seed);
  ensure_walks(walks, walkCount, walkSeed, walkSalt, H, 29u, seedUse);

  // Add≈0: phase unchanged — skip walks + phaseLerp so Out stays on phase[].
  if (!(amt > 1e-12f)) {
    noise_recipe_clear(g.phaseNoise);
    g.hasPhaseLerp = 0;
    lerpFromLen = 0;
    return;
  }

  if (mode == 2) {
    stamp_white_noise_recipe(g.phaseNoise, amt, walks, H);
    g.hasPhaseLerp = 0;
    return;
  }

  noise_recipe_clear(g.phaseNoise);
  const float spd = noisy_speed01(speedHz, sampleRate, blockFrames);
  const bool havePrev = lerpFrom && lerpFromLen == H;
  for (int i = 0; i < H; i += 1) {
    const float w = noisy_sample(walks[i], spd, mode);
    const float to = wrap01f(g.phase[i] + w * amt);
    g.phaseTo[i] = to;
    g.phaseFrom[i] = havePrev ? lerpFrom[i] : to;
    g.phase[i] = to;
    if (lerpFrom) lerpFrom[i] = to;
  }
  g.hasPhaseLerp = 1;
  lerpFromLen = H;
}

inline void apply_noisy_pan(
  GraphPayload& g,
  float noiseMode,
  float add,
  float speedHz,
  float seed,
  YellowWalk* walks,
  int& walkCount,
  unsigned int& walkSeed,
  unsigned int& walkSalt,
  float* lerpFrom,
  int& lerpFromLen,
  float sampleRate,
  int blockFrames
) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics || !walks) return;
  const float amt = (add * 0.0f == 0.0f && add > 0.0f) ? add : 0.0f;
  const int mode = normalize_noisy_mode(noiseMode);
  const unsigned int seedUse = noisy_seed_u32(seed);
  ensure_walks(walks, walkCount, walkSeed, walkSalt, H, 47u, seedUse);

  if (mode == 2) {
    stamp_white_noise_recipe(g.panNoise, amt, walks, H);
    g.hasPanLerp = 0;
    return;
  }

  noise_recipe_clear(g.panNoise);
  const float spd = noisy_speed01(speedHz, sampleRate, blockFrames);
  const bool havePrev = lerpFrom && lerpFromLen == H;
  for (int i = 0; i < H; i += 1) {
    const float w = noisy_sample(walks[i], spd, mode);
    float p = g.pan[i];
    if (!(p * 0.0f == 0.0f)) p = 0.0f;
    const float to = p + w * amt; // Out clamps −1…+1
    g.panTo[i] = to;
    g.panFrom[i] = havePrev ? lerpFrom[i] : to;
    g.pan[i] = to;
    if (lerpFrom) lerpFrom[i] = to;
  }
  g.hasPanLerp = 1;
  lerpFromLen = H;
}

inline void apply_noisy_amp(
  GraphPayload& g,
  float noiseMode,
  float add,
  float speedHz,
  float seed,
  YellowWalk* walks,
  int& walkCount,
  unsigned int& walkSeed,
  unsigned int& walkSalt,
  float* lerpFrom,
  int& lerpFromLen,
  float sampleRate,
  int blockFrames
) {
  const int H = g.harmonics;
  if (H < 1 || H > kMaxHarmonics || !walks) return;
  const float amt = (add * 0.0f == 0.0f && add > 0.0f) ? add : 0.0f;
  const int mode = normalize_noisy_mode(noiseMode);
  const unsigned int seedUse = noisy_seed_u32(seed);
  ensure_walks(walks, walkCount, walkSeed, walkSalt, H, 61u, seedUse);

  if (mode == 2) {
    stamp_white_noise_recipe(g.ampNoise, amt, walks, H);
    g.hasAmpLerp = 0;
    return;
  }

  noise_recipe_clear(g.ampNoise);
  const float spd = noisy_speed01(speedHz, sampleRate, blockFrames);
  const bool havePrev = lerpFrom && lerpFromLen == H;
  for (int i = 0; i < H; i += 1) {
    const float w = noisy_sample(walks[i], spd, mode);
    float a = g.amplitude[i];
    if (!(a * 0.0f == 0.0f)) a = 0.0f;
    const float to = a + w * amt; // Out clamps 0…1
    g.ampTo[i] = to;
    g.ampFrom[i] = havePrev ? lerpFrom[i] : to;
    g.amplitude[i] = to;
    if (lerpFrom) lerpFrom[i] = to;
  }
  g.hasAmpLerp = 1;
  lerpFromLen = H;
}

// Sum one sample. phaseAcc length ≥ g.harmonics (caller-owned).
// GraphPayload is non-const so WhiteNoise recipe LCGs advance each sample.
// optimize!=0: skip sin/pan when amp≤0, below −60 dBFS after master, or hz≥Nyquist
// (phaseAcc still advances). Soft Nyquist skirt always applied on the audible path.
// blockFrame/blockFrames: quantum lerp progress within the block.
inline void sum_sample(
  GraphPayload& g,
  double* phaseAcc,
  float frequencyHz,
  float masterAmp,
  float sampleRate,
  float* mono,
  float* left,
  float* right,
  int optimize = 0,
  int blockFrame = 0,
  int blockFrames = 1
) {
  float mOut = 0.0f;
  float lOut = 0.0f;
  float rOut = 0.0f;
  if (!phaseAcc || g.harmonics <= 0) {
    if (mono) *mono = 0.0f;
    if (left) *left = 0.0f;
    if (right) *right = 0.0f;
    return;
  }

  const int H = g.harmonics < kMaxHarmonics ? g.harmonics : kMaxHarmonics;
  const float sr = sampleRate > 1.0f ? sampleRate : 1.0f;
  const float nyquist = 0.5f * sr;
  const float f0 = (frequencyHz * 0.0f == 0.0f) ? frequencyHz : 0.0f;
  const float ma = clamp_f(masterAmp, 0.0f, 1.0f);
  const bool skipInaudible = optimize != 0;
  const float hearFloor = skipInaudible ? kInaudibleAmp : 0.0f;
  const int nBlock = blockFrames > 1 ? blockFrames : 1;
  const int fBlock = blockFrame < 0 ? 0 : blockFrame;
  const float lerpT = nBlock <= 1 ? 1.0f : (float)fBlock / (float)(nBlock - 1);
  const float lerpTc = lerpT > 1.0f ? 1.0f : lerpT;
  const bool hasRatioNoise = g.ratioNoise.active && g.ratioNoise.amount > 0.0f;
  const bool hasPhaseNoise = g.phaseNoise.active && g.phaseNoise.amount > 0.0f;
  const bool hasPanNoise = g.panNoise.active && g.panNoise.amount > 0.0f;
  const bool hasAmpNoise = g.ampNoise.active && g.ampNoise.amount > 0.0f;

  const bool sampleCutoff = g.hasCutoffStrip && g.cutoffStripFrames > 0;
  float cutoffEdge = 0.0f;
  if (sampleCutoff) {
    int si = fBlock;
    if (si >= (int)g.cutoffStripFrames) si = (int)g.cutoffStripFrames - 1;
    if (si < 0) si = 0;
    if (si >= kCutoffStripMax) si = kCutoffStripMax - 1;
    float cut01 = g.cutoffStrip[si];
    if (!(cut01 * 0.0f == 0.0f)) cut01 = 0.0f;
    cut01 = clamp_f(cut01, 0.0f, 1.0f);
    cutoffEdge = cut01 * (float)H;
  }

  for (int i = 0; i < H; i += 1) {
    float partialAmp = g.hasAmpLerp
      ? (g.ampFrom[i] + (g.ampTo[i] - g.ampFrom[i]) * lerpTc)
      : g.amplitude[i];
    if (!(partialAmp * 0.0f == 0.0f)) partialAmp = 0.0f;
    if (sampleCutoff) {
      partialAmp *= harmonic_count_gain(i, cutoffEdge);
    }
    if (hasAmpNoise) {
      partialAmp += recipe_white_sample(g.ampNoise.seeds[i]) * g.ampNoise.amount;
    }
    partialAmp = clamp_f(partialAmp, 0.0f, 1.0f);

    float baseRatio = g.hasRatioLerp
      ? (g.ratioFrom[i] + (g.ratioTo[i] - g.ratioFrom[i]) * lerpTc)
      : g.ratio[i];
    if (!(baseRatio * 0.0f == 0.0f)) baseRatio = 0.0f;
    if (hasRatioNoise) {
      baseRatio += recipe_white_sample(g.ratioNoise.seeds[i]) * g.ratioNoise.amount;
      if (baseRatio < 0.0f) baseRatio = 0.0f;
    }
    const float hz = baseRatio * f0;

    const double inc = (double)hz / (double)sr;
    phaseAcc[i] = soemdsp_maths::wrap01(phaseAcc[i] + inc);

    float partialPhase = g.hasPhaseLerp
      ? lerp_phase01(g.phaseFrom[i], g.phaseTo[i], lerpTc)
      : g.phase[i];
    if (!(partialPhase * 0.0f == 0.0f)) partialPhase = 0.0f;
    if (hasPhaseNoise) {
      partialPhase = wrap01f(
        partialPhase + recipe_white_sample(g.phaseNoise.seeds[i]) * g.phaseNoise.amount
      );
    }
    const float p = wrap01f((float)phaseAcc[i] + wrap01f(partialPhase));

    const float heardAmp = partialAmp * ma;
    if (skipInaudible && (!(partialAmp > 0.0f) || heardAmp < hearFloor || hz >= nyquist)) {
      continue;
    }

    const float gain = nyquist_amp_gain(hz, sr);
    if (gain <= 0.0f) continue;

    const float s = (float)soemdsp_maths::dsp_sin_turns((double)p) * partialAmp * ma * gain;
    mOut += s;

    float pan = g.hasPanLerp
      ? (g.panFrom[i] + (g.panTo[i] - g.panFrom[i]) * lerpTc)
      : g.pan[i];
    if (!(pan * 0.0f == 0.0f)) pan = 0.0f;
    if (hasPanNoise) {
      pan += recipe_white_sample(g.panNoise.seeds[i]) * g.panNoise.amount;
    }
    pan = clamp_f(pan, -1.0f, 1.0f);
    const float gL = 0.5f * (1.0f - pan);
    const float gR = 0.5f * (1.0f + pan);
    lOut += s * gL;
    rOut += s * gR;
  }

  if (mono) *mono = mOut;
  if (left) *left = lOut;
  if (right) *right = rOut;
}

}  // namespace soemdsp_yellow_graph

#endif
