// soemdsp-native-module: additive_osc
// soemdsp-native-label: Additive Osc
// soemdsp-native-target: additiveOsc
// soemdsp-native-kind: oscillator
//
// Stateless (no create/destroy -- see ellipsoid.cpp for the same pattern):
// the JS original is a pure function of (phase, params, rate) with no
// carried state of its own. Covers the common case: no Damping Graph or
// Phase Graph connected (those optional inputs read from a user-drawn
// curve editor and stay JS-only -- the worklet falls back to the JS
// implementation whenever either graph input is actually connected).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"additive_osc\","
    "\"label\":\"Additive Osc\","
    "\"targetType\":\"additiveOsc\","
    "\"kind\":\"oscillator\","
    "\"inputs\":[\"Reset\",\"0.1V/Oct\",\"Increment\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"mid\":8,\"max\":16,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":100,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"morph\",\"label\":\"Morph\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"harmonicPhaseAdd\",\"label\":\"Phase Add\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\",\"unit\":\"cycle\"},"
      "{\"key\":\"harmonicPhaseMultiply\",\"label\":\"Phase Multiply\",\"defaultValue\":0,\"min\":0,\"mid\":1,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"harmonics\",\"label\":\"Harmonics\",\"defaultValue\":32,\"min\":1,\"mid\":32,\"max\":1024,\"step\":1},"
      "{\"key\":\"dampingFilterFrequency\",\"label\":\"Filter Frequency\",\"kind\":\"frequency\",\"defaultValue\":20000,\"min\":20,\"mid\":2000,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":0.35,\"min\":0,\"mid\":0.35,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kHardMaxHarmonics = 1024;

static inline double absd(double a) { return a < 0.0 ? -a : a; }
static inline double roundd(double a) { return dsp_floor(a + 0.5); }

struct HarmonicPartial { double amplitude; double phase; };

// Waveform indices match soemdsp::additive::AdditiveWaveform::Waveform
// (include/soemdsp/additive/additive.hpp).
enum AdditiveWaveformKind {
  kWfSawtooth = 0,
  kWfSawSquare = 1,
  kWfDoubleSaw = 2,
  kWfMultiSaw = 3,
  kWfRoundedSquareDoubleSaw = 4,
  kWfSquareDoubleSaw = 5,
  kWfPulseCenter = 6,
  kWfPulseLeft = 7,
  kWfPulseRight = 8,
  kWfMultiPulse1 = 9,
  kWfMultiPulse2 = 10,
  kWfSquare = 11,
  kWfTriSaw = 12,
  kWfTriangle = 13,
  kWfRectifiedSine = 14,
  kWfRectifiedSineTri = 15,
  kWfOrgan = 16,
  kWfCount = 17
};

static HarmonicPartial waveform_harmonic(int waveform, double harmonic, double morph) {
  const long long n64 = (long long)maxd(1.0, dsp_floor(harmonic));
  const double h = (double)n64;
  const int odd = (n64 % 2 == 1) ? 1 : 0;
  const double mod = clamp(morph, 0.0, 1.0);
  HarmonicPartial out;
  out.amplitude = 0.0;
  out.phase = 0.0;

  switch (waveform) {
    case kWfSawtooth: {
      const double phaseRotate = mod * 0.5;
      out.amplitude = 1.0 / h;
      out.phase = odd ? (0.5 + phaseRotate) : 0.0;
      break;
    }
    case kWfSawSquare: {
      // soemdsp: sawsquare(1 - mod1) then mix = 1 - mix → even amp ∝ morph.
      // morph 0 = square, morph 1 = saw.
      out.amplitude = odd ? (1.0 / h) : ((1.0 / h) * mod);
      out.phase = 0.0;
      break;
    }
    case kWfDoubleSaw: {
      const double pwm = mod * 0.5;
      out.amplitude = dsp_cos(h * pwm) / h;
      out.phase = 0.0;
      break;
    }
    case kWfMultiSaw: {
      const double pwm = mod * 0.5;
      const double hh = h * h;
      out.amplitude = dsp_cos(hh * 0.3 + pwm) / h;
      out.phase = 0.0;
      break;
    }
    case kWfRoundedSquareDoubleSaw: {
      const double m = 0.125 + 0.75 * mod;
      const double hh = h * h;
      out.amplitude = dsp_sin(hh * 0.25 + m) / hh;
      out.phase = 0.0;
      break;
    }
    case kWfSquareDoubleSaw: {
      const double m = 0.125 + 0.75 * mod;
      const double hh = h * h;
      out.amplitude = dsp_sin(hh * 0.25 + m) / h;
      out.phase = 0.0;
      break;
    }
    case kWfPulseCenter: {
      const double pwm = mod * 0.5;
      out.amplitude = dsp_sin(h * pwm) / h;
      out.phase = 0.25;
      break;
    }
    case kWfPulseLeft: {
      const double pwm = mod * 0.5;
      out.amplitude = dsp_sin(h * pwm) / h;
      out.phase = h * pwm + 0.25;
      break;
    }
    case kWfPulseRight: {
      const double pwm = mod * 0.5;
      out.amplitude = dsp_sin(h * pwm) / h;
      out.phase = h * (-pwm) + 0.25;
      break;
    }
    case kWfMultiPulse1: {
      const double pwm = mod * 0.5;
      const double hh = h * h;
      out.amplitude = dsp_cos(hh * 0.45 + pwm) / h;
      out.phase = 0.0;
      break;
    }
    case kWfMultiPulse2: {
      const double pwm = mod * 0.5;
      const double hh = h * h;
      out.amplitude = dsp_cos(hh * 0.475 + pwm) / h;
      out.phase = 0.0;
      break;
    }
    case kWfSquare: {
      const double phaseRotate = mod * 0.5;
      out.amplitude = odd ? (1.0 / h) : 0.0;
      out.phase = phaseRotate;
      break;
    }
    case kWfTriSaw: {
      const double peak = clamp(mod, 0.001, 0.999);
      out.amplitude = (dsp_sin(0.5 * h * peak) / (peak * (1.0 - peak) * h * h)) * 0.2;
      out.phase = 0.0;
      break;
    }
    case kWfTriangle: {
      const double phaseRotate = mod * 0.5;
      out.amplitude = odd ? (1.0 / (h * h)) : 0.0;
      out.phase = ((n64 % 4 == 1) ? 0.0 : 0.5) + phaseRotate;
      break;
    }
    case kWfRectifiedSine: {
      const double phaseRotate = mod * 0.5;
      out.amplitude = 1.0 / (h * h);
      out.phase = (odd ? 0.25 : 0.75) + phaseRotate;
      break;
    }
    case kWfRectifiedSineTri: {
      const double hh = h * h;
      out.amplitude = dsp_sin(hh * 0.25 + mod) / hh;
      out.phase = 0.25;
      break;
    }
    case kWfOrgan: {
      // Harmonics at 1, k, k^2, ... (soemdsp organ counter).
      const long long octaves = (long long)maxd(2.0, dsp_floor(2.0 + mod * 11.0));
      long long target = 1;
      while (target < n64) {
        const long long next = target * octaves;
        if (next <= target) break; // overflow guard
        target = next;
      }
      out.amplitude = (target == n64) ? (1.0 / h) : 0.0;
      out.phase = 0.0;
      break;
    }
    default:
      out.amplitude = 1.0 / h;
      out.phase = odd ? 0.5 : 0.0;
      break;
  }
  return out;
}

}  // namespace

extern "C" double soemdsp_additive_osc_sample(
  double phase,
  double frequency,
  double harmonics,
  double waveform,
  double morph,
  double harmonicPhaseAdd,
  double harmonicPhaseMultiply,
  double level,
  double dampingFilterFrequency,
  double sampleRate
) {
  const double rate = maxd(1.0, safe(sampleRate));
  // Through-zero: signed frequency (negative reverses phase).
  const double safeFrequency = safe(frequency);
  const int maxHarmonics = (int)clamp(roundd(safe(harmonics)), 1.0, (double)kHardMaxHarmonics);
  int wf = (int)roundd(safe(waveform));
  if (wf < 0) wf = 0;
  if (wf >= kWfCount) wf = kWfSawtooth;
  const double safeMorph = clamp(safe(morph), 0.0, 1.0);
  const double safeHarmonicPhaseAdd = clamp(safe(harmonicPhaseAdd), 0.0, 1.0);
  const double safeHarmonicPhaseMultiply = clamp(safe(harmonicPhaseMultiply), 0.0, 4.0);
  const double safeLevel = clamp(safe(level), 0.0, 1.0);
  const double nyquist = maxd(1.0, rate * 0.5);
  const double safeDampingFilterFrequency = clamp(safe(dampingFilterFrequency) != 0.0 ? safe(dampingFilterFrequency) : 20000.0, 1.0, nyquist);

  const double absFrequency = absd(safeFrequency);
  const int harmonicLimit = (int)maxd(1.0, mind((double)maxHarmonics, dsp_floor(mind(20000.0, rate * 0.45) / maxd(1.0, absFrequency))));

  double total = 0.0;
  double norm = 0.0;
  for (int harmonic = 1; harmonic <= harmonicLimit; harmonic++) {
    const HarmonicPartial partial = waveform_harmonic(wf, (double)harmonic, safeMorph);
    const double dampingX = clamp((absFrequency * (double)harmonic) / safeDampingFilterFrequency, 0.0, 1.0);
    // No Damping Graph connected in the native path -> flat 1.0 response,
    // matching the JS fallback `() => 1` used when nothing is wired in.
    (void)dampingX;
    const double amplitude = safe(partial.amplitude) * 1.0;
    if (amplitude == 0.0) {
      continue;
    }
    const double harmonicRatio = harmonicLimit > 1 ? ((double)harmonic - 1.0) / ((double)harmonicLimit - 1.0) : 0.0;
    (void)harmonicRatio;
    // No Phase Graph connected -> flat 0.0, matching the JS fallback `() => 0`.
    const double phaseCurve = 0.0;
    const double phaseMultiplier = 1.0 + phaseCurve * safeHarmonicPhaseMultiply;
    const double phaseOffset = safe(partial.phase) + phaseCurve * safeHarmonicPhaseAdd;
    total += dsp_sin((phase * (double)harmonic * phaseMultiplier) + phaseOffset * kTwoPi) * amplitude;
    norm += absd(amplitude);
  }
  if (norm <= 0.0) {
    return 0.0;
  }
  return clamp((total / maxd(1.0, norm * 0.72)) * safeLevel, -1.0, 1.0);
}

extern "C" int soemdsp_additive_osc_version() {
  return 3; // morph param key/label (was modA / Mod A)
}

extern "C" const char* soemdsp_additive_osc_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_additive_osc_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
