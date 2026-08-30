// soemdsp-native-module: cheap_walk
// soemdsp-native-label: Cheap Walk
// soemdsp-native-target: cheapWalk
// soemdsp-native-kind: noise
//
// Reflecting bipolar random walk: LCG step + bounce at ±1.
// Cheaper than FlexibleRandomWalk / sandbox random_walk (no filters, no methods).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;

struct CheapWalkState {
  bool active;
  unsigned int seed;
  double x;
  double lastSeedParam;
};

static CheapWalkState gPool[kMaxInstances];

static inline unsigned int lcg_next(unsigned int& s) {
  s = 1664525u * s + 1013904223u;
  return s;
}

static inline double clamp01(double v) {
  return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
}

}  // namespace

extern "C" int soemdsp_cheap_walk_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      CheapWalkState& s = gPool[i];
      s.seed = 1u;
      s.x = 0.0;
      s.lastSeedParam = 1.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_cheap_walk_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_cheap_walk_sample(
  int handle,
  double rateHz,
  double amplitude,
  double seedParam,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  CheapWalkState& st = gPool[handle - 1];
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double rate = rateHz < 0.0 ? 0.0 : rateHz;
  const double amp = clamp01(amplitude);

  // Reseed when Seed control changes.
  if (!(seedParam == st.lastSeedParam)) {
    unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
    if (s == 0u) s = 1u;
    st.seed = s;
    st.x = 0.0;
    st.lastSeedParam = seedParam;
  }

  // Step size ~ rate/sr (0..1) * 0.35 — same spirit as additive Noisy CheapWalk.
  double speed01 = rate / sr;
  if (speed01 > 1.0) speed01 = 1.0;
  const double step = speed01 * 0.35;

  lcg_next(st.seed);
  const double bipolar = (double)st.seed / 4294967295.0 * 2.0 - 1.0;
  double x = st.x + bipolar * step;
  if (x > 1.0) x = 2.0 - x;
  if (x < -1.0) x = -2.0 - x;
  st.x = x;
  return x * amp;
}

extern "C" int soemdsp_cheap_walk_version() {
  return 1;
}
