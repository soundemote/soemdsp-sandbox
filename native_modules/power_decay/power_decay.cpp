// soemdsp-native-module: power_decay
// soemdsp-native-label: PowerDecay
// soemdsp-native-target: powerDecay
// soemdsp-native-kind: envelope
//
// Power-curve decay. Each Trigger hit (gate_hit) restarts t = 0 and latches
// the strike height (velocity, GATES_TRIGGERS.md):
//   env = height * amplitude * pow(1 - t / decayTime, power)   0 <= t < decayTime
//   env = 0                                                     t >= decayTime
// Power 1 = linear, >1 = sharper drop + longer tail, 0 = hold then cut.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  double t;        // seconds since last hit
  double height;   // latched strike height
  double lastIn;
  bool running;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"power_decay\","
    "\"label\":\"PowerDecay\","
    "\"targetType\":\"powerDecay\","
    "\"kind\":\"envelope\""
  "}";

}  // namespace

extern "C" int soemdsp_power_decay_create() {
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

extern "C" void soemdsp_power_decay_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_power_decay_sample(
  int handle,
  double trigger,
  double decayTime,
  double power,
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
  const double p = maxd(0.0, safe(power));
  const double x = 1.0 - s.t / decay;
  if (x <= 0.0) {
    s.running = false;
    return 0.0;
  }
  s.t += 1.0 / sr;

  const double env = s.height * safe(amplitude) * pow_pos(x, p);
  return (env * 0.0 == 0.0) ? env : 0.0;
}

extern "C" int soemdsp_power_decay_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  const State& s = gPool[handle - 1];
  return (!s.active || !s.running) ? 1 : 0;
}

extern "C" int soemdsp_power_decay_version() { return 1; }
extern "C" const char* soemdsp_power_decay_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_power_decay_metadata_json_size() { return sizeof(kMetadataJson) - 1; }