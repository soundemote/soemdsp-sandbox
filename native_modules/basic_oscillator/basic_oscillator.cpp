// soemdsp-native-module: basic_oscillator
// soemdsp-native-label: LFO
// soemdsp-native-target: osc
// soemdsp-native-kind: oscillator
//
// Naive LFO for the "osc" node. Absolutely no anti-aliasing: saw, ramp,
// square, and triangle are pure phase-to-amplitude maps (discontinuities
// and corners are left raw). Sine and noise are unchanged. Use the
// dedicated polyBlep / blit modules when bandlimited audio oscillators
// are needed.
//
// Each of the six port outputs (main + Saw/Ramp/Square/Tri/Sine) is
// driven from an *independent* phase/state on the JS side (distinct
// "{nodeId}:saw" etc. keys) -- the worklet creates one native handle per
// virtual instance to match, rather than this module tracking six ports
// per handle itself.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"basic_oscillator\","
    "\"label\":\"LFO\","
    "\"targetType\":\"osc\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\",\"Saw\",\"Ramp\",\"Square\",\"Tri\",\"Sine\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":220,\"min\":0,\"mid\":220,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"mid\":2,\"max\":5,\"step\":1},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 256;  // 6 virtual per-port instances per node
static inline double absd(double a) { return a < 0.0 ? -a : a; }

// Naive bipolar triangle from phase in [0, 1): peaks at +1 at half-cycle.
static double naive_triangle(double phaseCycle) {
  return 1.0 - 4.0 * absd(phaseCycle - 0.5);
}

struct OscState {
  unsigned int noiseSeed;
  bool   hasNoiseSeed;
  bool   active;
};

static OscState gPool[kMaxInstances];

static double next_noise_sample(OscState& s) {
  s.noiseSeed = (unsigned int)(1664525u * (s.hasNoiseSeed ? s.noiseSeed : 0x12345678u) + 1013904223u);
  s.hasNoiseSeed = true;
  return ((double)s.noiseSeed / 4294967295.0) * 2.0 - 1.0;
}

static double current_noise_sample(OscState& s) {
  if (!s.hasNoiseSeed) return next_noise_sample(s);
  return ((double)s.noiseSeed / 4294967295.0) * 2.0 - 1.0;
}

}  // namespace

extern "C" int soemdsp_basic_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      OscState& s = gPool[i];
      s.noiseSeed = 0;
      s.hasNoiseSeed = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_basic_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_basic_oscillator_sample(
  int    handle,
  double phase,
  double phaseIncrement,
  double waveform
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  OscState& s = gPool[handle - 1];

  const double phaseDelta = safe(phaseIncrement);
  const bool phaseStopped = absd(phaseDelta) <= 1e-12;
  const double phaseCycle = wrap01_frac(safe(phase) / kTwoPi);

  double sample = 0.0;
  const int wf = (int)dsp_floor(safe(waveform) + 0.5);
  switch (wf) {
    case 1:  // Ramp
      sample = -1.0 + phaseCycle * 2.0;
      break;
    case 2:  // Square
      sample = phaseCycle < 0.5 ? 1.0 : -1.0;
      break;
    case 3:  // Triangle
      sample = naive_triangle(phaseCycle);
      break;
    case 4:  // Sine
      sample = dsp_sin(safe(phase));
      break;
    case 5:  // Noise
      sample = phaseStopped ? current_noise_sample(s) : next_noise_sample(s);
      break;
    case 0:  // Saw
    default:
      sample = 1.0 - phaseCycle * 2.0;
      break;
  }

  return sample;
}

extern "C" int soemdsp_basic_oscillator_version() {
  return 4;
}

extern "C" const char* soemdsp_basic_oscillator_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_basic_oscillator_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
