// soemdsp-native-module: sinc
// soemdsp-native-label: Sinc
// soemdsp-native-target: sinc
// soemdsp-native-kind: oscillator
//
// Repeating sinc kernel oscillator. Band-limit mode = Dirichlet kernel with
// harmonic count clamped under Nyquist. Ideal mode = textbook sin(x)/x
// (aliases as an oscillator). Matches node-graph-stdlib/node-graph-sinc-kernel.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"sinc\","
    "\"label\":\"Sinc\","
    "\"targetType\":\"sinc\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"freq\",\"label\":\"Freq\",\"kind\":\"frequency\",\"defaultValue\":100,\"min\":0,\"mid\":100,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"lobes\",\"label\":\"Lobes\",\"defaultValue\":4,\"min\":1,\"max\":16,\"step\":1},"
      "{\"key\":\"bandLimit\",\"label\":\"Kernel\",\"defaultValue\":1,\"min\":0,\"max\":1,\"step\":1}"
    "]"
  "}";

static const int kMaxInstances = 32;

struct SincState {
  double phase;
  bool active;
};

static SincState gPool[kMaxInstances];

static double ideal_sinc(double phase, int lobes) {
  const int count = lobes < 1 ? 1 : lobes;
  const double x = (phase - 0.5) * 2.0 * kPi * (double)count;
  if (x > -1.0e-9 && x < 1.0e-9) return 1.0;
  return dsp_sin(x) / x;
}

static double bandlimited_sinc(double phase, int lobes, double freq, double sampleRate) {
  const int requested = lobes < 1 ? 1 : lobes;
  const double safeRate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double safeFreq = freq > 1.0e-9 ? freq : 1.0e-9;
  int maxH = (int)dsp_floor((safeRate * 0.5) / safeFreq) - 1;
  if (maxH < 1) maxH = 1;
  int harmonics = requested < maxH ? requested : maxH;
  if (harmonics < 1) harmonics = 1;
  const double order = 2.0 * (double)harmonics + 1.0;
  const double theta = kPi * (phase - 0.5);
  const double denominator = order * dsp_sin(theta);
  if (denominator > -1.0e-9 && denominator < 1.0e-9) return 1.0;
  return dsp_sin(order * theta) / denominator;
}

}  // namespace

extern "C" int soemdsp_sinc_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].phase = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sinc_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// phaseShift: cycles 0..1 added to free-running phase.
// bandLimit: 0 = Ideal sin(x)/x, nonzero = Dirichlet (Nyquist-clamped).
// Returns bipolar sample in [-1, 1].
extern "C" double soemdsp_sinc_sample(
  int handle,
  double freq,
  double phaseShift,
  double lobes,
  double bandLimit,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SincState& s = gPool[handle - 1];
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double f = freq > 0.0 ? freq : 0.0;
  const double step = f / rate;
  s.phase = wrap01(s.phase + step);
  double shifted = wrap01(s.phase + phaseShift);
  const int lobeCount = (int)dsp_floor(lobes + 0.5);
  const bool bl = (int)dsp_floor(bandLimit + 0.5) != 0;
  double value = bl
    ? bandlimited_sinc(shifted, lobeCount, f, rate)
    : ideal_sinc(shifted, lobeCount);
  return clamp(value, -1.0, 1.0);
}

extern "C" int soemdsp_sinc_version() {
  return 1;
}

extern "C" const char* soemdsp_sinc_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_sinc_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
