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
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":1,\"min\":0,\"mid\":3,\"max\":7,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":100,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"modA\",\"label\":\"Mod A\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
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

static HarmonicPartial waveform_harmonic(int waveform, double harmonic, double modA) {
  const long long n64 = (long long)maxd(1.0, dsp_floor(harmonic));
  const double h = (double)n64;
  const double mod = clamp(modA, 0.0, 1.0);
  HarmonicPartial out;
  switch (waveform) {
    case 0: {
      const long long target = (long long)maxd(1.0, dsp_floor(99.0 * mod + 1.0));
      out.amplitude = (n64 == target) ? 1.0 : 0.0;
      out.phase = 0.0;
      break;
    }
    case 2:
      out.amplitude = (n64 % 2 == 1) ? 1.0 / h : 0.0;
      out.phase = mod * 0.5;
      break;
    case 3:
      out.amplitude = (n64 % 2 == 1) ? 1.0 / (h * h) : 0.0;
      out.phase = (n64 % 4 == 1) ? 0.0 : 0.5;
      break;
    case 4:
      out.amplitude = (n64 % 2 == 1) ? 1.0 / h : (1.0 / h) * (1.0 - mod);
      out.phase = 0.0;
      break;
    case 5:
      out.amplitude = dsp_cos(h * mod * 0.5) / h;
      out.phase = 0.0;
      break;
    case 6: {
      const double peak = clamp(mod, 0.001, 0.999);
      out.amplitude = (dsp_sin(0.5 * h * peak) / (peak * (1.0 - peak) * h * h)) * 0.2;
      out.phase = 0.0;
      break;
    }
    case 7: {
      long long octaves = (long long)maxd(2.0, dsp_floor(2.0 + mod * 11.0));
      long long target = 1;
      while (target < n64) {
        target *= octaves;
      }
      out.amplitude = (target == n64) ? 1.0 / h : 0.0;
      out.phase = 0.0;
      break;
    }
    case 1:
    default:
      out.amplitude = 1.0 / h;
      out.phase = (n64 % 2 == 1) ? 0.5 : 0.0;
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
  double modA,
  double harmonicPhaseAdd,
  double harmonicPhaseMultiply,
  double level,
  double dampingFilterFrequency,
  double sampleRate
) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double safeFrequency = maxd(0.0, safe(frequency));
  const int maxHarmonics = (int)clamp(roundd(safe(harmonics)), 1.0, (double)kHardMaxHarmonics);
  const int wf = (int)roundd(safe(waveform));
  const double safeModA = clamp(safe(modA), 0.0, 1.0);
  const double safeHarmonicPhaseAdd = clamp(safe(harmonicPhaseAdd), 0.0, 1.0);
  const double safeHarmonicPhaseMultiply = clamp(safe(harmonicPhaseMultiply), 0.0, 4.0);
  const double safeLevel = clamp(safe(level), 0.0, 1.0);
  const double nyquist = maxd(1.0, rate * 0.5);
  const double safeDampingFilterFrequency = clamp(safe(dampingFilterFrequency) != 0.0 ? safe(dampingFilterFrequency) : 20000.0, 1.0, nyquist);

  const int harmonicLimit = (int)maxd(1.0, mind((double)maxHarmonics, dsp_floor(mind(20000.0, rate * 0.45) / maxd(1.0, safeFrequency))));

  double total = 0.0;
  double norm = 0.0;
  for (int harmonic = 1; harmonic <= harmonicLimit; harmonic++) {
    const HarmonicPartial partial = waveform_harmonic(wf, (double)harmonic, safeModA);
    const double dampingX = clamp((safeFrequency * (double)harmonic) / safeDampingFilterFrequency, 0.0, 1.0);
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
  return 1;
}

extern "C" const char* soemdsp_additive_osc_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_additive_osc_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
