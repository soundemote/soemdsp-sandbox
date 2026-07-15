// soemdsp-native-module: antisaw
// soemdsp-native-label: Antisaw
// soemdsp-native-target: antisaw
// soemdsp-native-kind: oscillator
//
// Additive resynthesis of ONLY the aliased partials of an ideal sawtooth
// (name is intentional: the inverse of a clean saw -- only the aliasing).
// A sawtooth's harmonics sit at n*f0 with amplitude 1/n. Above Nyquist,
// those harmonics would alias -- normally an artifact you avoid. Here we
// deliberately keep just the ones that would alias, and instead of
// letting real sampling fold them (which would also corrupt everything
// else), we compute the fold explicitly and synthesize each one as a
// clean, controllable in-band sine at the frequency it would have
// landed on. Every partial stays in-band on purpose: this is simulated
// aliasing, not actual aliasing.
//
// folded frequency is recomputed every sample from the current
// fundamental (no smoothing/caching) -- the fold's sensitivity to f0 is
// exactly the aliasing character this module exists to expose.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"antisaw\","
    "\"label\":\"Antisaw\","
    "\"targetType\":\"antisaw\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"fundamental\",\"label\":\"Fundamental\",\"kind\":\"frequency\",\"defaultValue\":110,\"min\":0,\"mid\":1000,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"reflections\",\"label\":\"Reflections\",\"defaultValue\":64,\"min\":1,\"mid\":128,\"max\":256,\"step\":1},"
      "{\"key\":\"tilt\",\"label\":\"Tilt\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 16;
static const int kMaxReflections = 256;
// Hand-rolled fmod (no libm): a - b*floor(a/b), valid for a >= 0, b > 0,
// which is all this module ever calls it with (raw harmonic freq, sample
// rate -- both always positive).
static inline double dsp_fmod(double a, double b) {
  return a - b * dsp_floor(a / b);
}

static double wrap_two_pi(double p) {
  return p - kTwoPi * dsp_floor(p / kTwoPi);
}

struct AntisawState {
  double phase[kMaxReflections];
  bool   active;
};

static AntisawState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_antisaw_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      AntisawState& s = gPool[i];
      for (int n = 0; n < kMaxReflections; n++) s.phase[n] = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_antisaw_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_antisaw_sample(
  int    handle,
  double fundamental,
  double reflections,
  double tilt,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  AntisawState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double nyquist = rate * 0.5;
  const double f0 = maxd(0.0, safe(fundamental));
  const int N = (int)clamp(dsp_floor(safe(reflections) + 0.5), 1.0, (double)kMaxReflections);
  const double safeTilt = clamp(safe(tilt), -1.0, 1.0);

  double out = 0.0;
  for (int n = 1; n <= N; n++) {
    const double raw = (double)n * f0;
    if (raw > nyquist) {
      double folded = dsp_fmod(raw, rate);
      if (folded > nyquist) folded = rate - folded;

      double& ph = s.phase[n - 1];
      ph = wrap_two_pi(ph + kTwoPi * folded / rate);

      // tilt reshapes the plain 1/n saw curve: bias in [-1, 1] across the
      // reflection index (low n -> -1, high n -> +1). At tilt=0, weight
      // is exactly 1/n. Positive tilt boosts high (folded/harsher)
      // partials; negative tilt boosts low (darker/musical) ones.
      // bias*tilt stays within [-1, 1], so (1+bias*tilt) never goes
      // negative -- no clamping needed.
      const double nNorm = N > 1 ? (double)(n - 1) / (double)(N - 1) : 0.5;
      const double bias = nNorm * 2.0 - 1.0;
      const double weight = (1.0 / (double)n) * (1.0 + safeTilt * bias);

      out += dsp_sin(ph) * weight;
    }
  }

  return clamp(out * safe(level), -1.0, 1.0);
}

extern "C" int soemdsp_antisaw_version() {
  return 1;
}

extern "C" const char* soemdsp_antisaw_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_antisaw_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
