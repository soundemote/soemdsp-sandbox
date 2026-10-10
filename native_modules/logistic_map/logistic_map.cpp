// soemdsp-native-module: logistic_map
// soemdsp-native-label: Logistic Map
// soemdsp-native-target: logisticMap
// soemdsp-native-kind: chaos

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxIterationsPerSample = 4096;

struct LogisticMapState {
  bool active;
  bool hasStarted;
  unsigned int lastSeedU;
  double phase;
  double x;
  double lastJump; // bipolar step at last iterate (for PolyBLEP)
};

static const unsigned int kLogisticX0 = 0x4C01u;

// Integer Seed 0…kSeedParamMax → x0 in (0, 1). Seed 0 is valid.
static double logistic_x0(unsigned int seedU) {
  const unsigned int u = seed_to_rng_state(seed_mix(seedU, kLogisticX0));
  return (double)u * (1.0 / 4294967296.0);
}

static LogisticMapState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_logistic_map_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LogisticMapState& s = gPool[i];
      s.active = true;
      s.hasStarted = false;
      s.lastSeedU = 0xFFFFFFFFu;
      s.phase = 0.0;
      s.x = 0.5;
      s.lastJump = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_logistic_map_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_logistic_map_sample(
  int handle,
  double reset,
  double rate,
  double r,
  double seed,
  double antialias,
  double level,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  LogisticMapState& s = gPool[handle - 1];

  const bool resetActive = reset > 0.0;
  const double safeRate = rate > 0.0 ? rate : 0.0;
  const double safeR = safe_bounded(r);
  const unsigned int seedU = seed_param_u32(seed);
  const int aa = (int)(antialias + (antialias >= 0.0 ? 0.5 : -0.5));
  const double safeLevel = safe_bounded(level);
  const double rateHz = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double dt = safeRate / rateHz;

  if (resetActive || !s.hasStarted || seedU != s.lastSeedU) {
    s.x = logistic_x0(seedU);
    s.phase = 0.0;
    s.lastJump = 0.0;
    s.hasStarted = true;
    s.lastSeedU = seedU;
  }

  if (!resetActive && safeRate > 0.0) {
    s.phase += dt;
    int iterations = 0;
    while (s.phase >= 1.0 && iterations < kMaxIterationsPerSample) {
      s.phase -= 1.0;
      const double oldB = s.x * 2.0 - 1.0;
      s.x = clamp(safe_bounded(safeR * s.x * (1.0 - s.x)), 0.0, 1.0);
      s.lastJump = (s.x * 2.0 - 1.0) - oldB;
      iterations++;
    }
    if (s.phase >= 1.0) {
      // Rate is set absurdly high relative to sample rate -- drop the
      // remainder rather than spend the whole audio callback iterating.
      s.phase = 0.0;
    }
  }

  double bipolar = s.x * 2.0 - 1.0;
  // 1 = PolyBLEP on each iterate step (same residual as a unit-scaled wrap).
  if (aa == 1 && dt > 0.0) {
    bipolar += s.lastJump * poly_blep(s.phase, dt);
  }
  return safe_bounded(bipolar * safeLevel);
}

extern "C" int soemdsp_logistic_map_version() {
  return 3;
}
