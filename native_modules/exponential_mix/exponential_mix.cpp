// soemdsp-native-module: exponential_mix
// soemdsp-native-label: Exponential Mix
// soemdsp-native-target: exponentialMix
// soemdsp-native-kind: envelope
//
// soundemote.dev Decay Envelopes #mix.
// Trigger hit restarts t = 0 and latches height.
//   x = t * (-ln(0.001) / decayTime)   so e^{-x} is 0.001 at Decay Time
//   env = height * ((1−p)·e^{−x} + p·e^{−rate·x})
//   Out = env * Amplitude. Idle when env <= 0.001.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kEng = 0.001;
// -ln(0.001) = ln(1000)
static const double kNegLnEng = 6.907755278982137;

struct State {
  double t;
  double height;
  double lastIn;
  bool running;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"exponential_mix\","
    "\"label\":\"Exponential Mix\","
    "\"targetType\":\"exponentialMix\","
    "\"kind\":\"envelope\""
  "}";

}  // namespace

extern "C" int soemdsp_exponential_mix_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.t = 0.0;
      s.height = 0.0;
      s.lastIn = 0.0;
      s.running = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_exponential_mix_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_exponential_mix_sample(
  int handle,
  double trigger,
  double decayTime,
  double mixP,
  double fastRate,
  double amplitude,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double in = safe(trigger);
  if (gate_hit(in, &s.lastIn)) {
    s.t = 0.0;
    s.height = in;
    s.running = true;
  }
  if (!s.running) return 0.0;

  const double decay = maxd(1.0e-6, safe(decayTime));
  const double p = clamp(safe(mixP), 0.0, 1.0);
  const double rate = maxd(1.0e-6, safe(fastRate));
  const double x = s.t * (kNegLnEng / decay);
  s.t += 1.0 / sr;

  const double env = s.height * ((1.0 - p) * dsp_exp(-x) + p * dsp_exp(-rate * x));
  if (!(env * 0.0 == 0.0) || env <= kEng) {
    s.running = false;
    return 0.0;
  }
  const double out = env * safe(amplitude);
  return (out * 0.0 == 0.0) ? out : 0.0;
}

extern "C" int soemdsp_exponential_mix_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  const State& s = gPool[handle - 1];
  return (!s.active || !s.running) ? 1 : 0;
}

extern "C" int soemdsp_exponential_mix_version() { return 1; }
extern "C" const char* soemdsp_exponential_mix_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_exponential_mix_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
