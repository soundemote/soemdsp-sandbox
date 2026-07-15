// soemdsp-native-module: log_spiral
// soemdsp-native-label: Logarithmic Spiral
// soemdsp-native-target: logSpiral
// soemdsp-native-kind: jerobeam
//
// The pure r = a * e^(b*theta) equiangular spiral, swept as a periodic,
// bounded audio-rate X/Y/Z oscillator: `turns` revolutions per cycle while
// the radius envelope grows exponentially with phase and resets each cycle.
// See public/node-graph-log-spiral.js for the derivation this is a direct
// port of.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"log_spiral\","
    "\"label\":\"Logarithmic Spiral\","
    "\"targetType\":\"logSpiral\","
    "\"kind\":\"jerobeam\","
    "\"outputs\":[\"X\",\"Y\",\"Z\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":1,\"min\":0,\"mid\":5,\"max\":100,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"turns\",\"label\":\"Turns\",\"defaultValue\":4,\"min\":0.1,\"mid\":4,\"max\":16,\"step\":\"any\"},"
      "{\"key\":\"growth\",\"label\":\"Growth\",\"defaultValue\":3,\"min\":-10,\"mid\":3,\"max\":10,\"step\":\"any\"},"
      "{\"key\":\"size\",\"label\":\"Size\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"spin\",\"label\":\"Spin\",\"kind\":\"frequency\",\"defaultValue\":0.05,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 32;
struct LogSpiralState {
  double phase;
  double spinPhase;
  double outX, outY, outZ;
  bool   active;
};

static LogSpiralState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_log_spiral_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LogSpiralState& s = gPool[i];
      s.phase = 0.0;
      s.spinPhase = 0.0;
      s.outX = 0.0; s.outY = 0.0; s.outZ = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_log_spiral_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_log_spiral_sample(
  int    handle,
  double frequency,
  double spin,
  double size,
  double growth,
  double turns,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  LogSpiralState& s = gPool[handle - 1];

  const double rate = maxd(1.0, sampleRate);
  const double safeSize = maxd(0.0, size);
  const double safeTurns = maxd(0.1, turns);

  const double mainPhase = wrap01_frac(s.phase);
  s.phase = wrap01_frac(s.phase + frequency / rate);
  const double spinPhaseValue = wrap01_frac(s.spinPhase);
  s.spinPhase = wrap01_frac(s.spinPhase + spin / rate);

  const double theta = safeTurns * kTwoPi * mainPhase;
  const double envelope = dsp_exp(growth * (mainPhase - 0.5));
  const double radius = safeSize * envelope;

  const double rawX = radius * dsp_cos(theta);
  const double rawY = radius * dsp_sin(theta);

  const double spinAngle = spinPhaseValue * kTwoPi;
  const double cosSpin = dsp_cos(spinAngle);
  const double sinSpin = dsp_sin(spinAngle);

  s.outX = rawX * cosSpin - rawY * sinSpin;
  s.outY = rawX * sinSpin + rawY * cosSpin;
  s.outZ = envelope - 1.0;
}

extern "C" double soemdsp_log_spiral_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_log_spiral_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_log_spiral_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outZ;
}

extern "C" int soemdsp_log_spiral_version() {
  return 1;
}

extern "C" const char* soemdsp_log_spiral_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_log_spiral_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
