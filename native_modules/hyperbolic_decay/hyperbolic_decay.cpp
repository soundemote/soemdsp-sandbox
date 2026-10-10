// soemdsp-native-module: hyperbolic_decay
// soemdsp-native-label: Hyperbolic
// soemdsp-native-target: hyperbolicDecay
// soemdsp-native-kind: envelope
//
// soundemote.dev Decay Envelopes #hyperbolic (Marvinh amp-shape).
// Trigger hit restarts t = 0 and latches height as start; end is 0.001.
//   x = t / duration
//   u = |w| > 1e-5 ? (exp(w·x)-1)/(exp(w)-1) : x
//   env = start·end / ((start−end)·u + end)
//   Out = env * Amplitude. Idle after t >= duration.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kEng = 0.001;

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
    "\"module\":\"hyperbolic_decay\","
    "\"label\":\"Hyperbolic\","
    "\"targetType\":\"hyperbolicDecay\","
    "\"kind\":\"envelope\""
  "}";

static double exp_warp01(double x, double w) {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  if (w > -1.0e-5 && w < 1.0e-5) return x;
  const double ew = dsp_exp(w);
  const double den = ew - 1.0;
  if (den > -1.0e-12 && den < 1.0e-12) return x;
  return (dsp_exp(w * x) - 1.0) / den;
}

}  // namespace

extern "C" int soemdsp_hyperbolic_decay_create() {
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

extern "C" void soemdsp_hyperbolic_decay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_hyperbolic_decay_sample(
  int handle,
  double trigger,
  double duration,
  double shapeW,
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

  const double dur = maxd(1.0e-6, safe(duration));
  const double x = s.t / dur;
  if (x >= 1.0) {
    s.running = false;
    return 0.0;
  }
  s.t += 1.0 / sr;

  const double start = maxd(1.0e-6, s.height);
  const double end = kEng;
  const double u = exp_warp01(x, safe(shapeW));
  const double den = (start - end) * u + end;
  const double env = den == 0.0 ? end : (start * end) / den;
  const double out = env * safe(amplitude);
  return (out * 0.0 == 0.0) ? out : 0.0;
}

extern "C" int soemdsp_hyperbolic_decay_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  const State& s = gPool[handle - 1];
  return (!s.active || !s.running) ? 1 : 0;
}

extern "C" int soemdsp_hyperbolic_decay_version() { return 1; }
extern "C" const char* soemdsp_hyperbolic_decay_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_hyperbolic_decay_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
