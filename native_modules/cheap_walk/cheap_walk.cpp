// soemdsp-native-module: cheap_walk
// soemdsp-native-label: Cheap Walk
// soemdsp-native-target: cheapWalk
// soemdsp-native-kind: noise
//
// Reflecting bipolar random walk: LCG step + bounce at ±1.
// Stereo: independent L/R walks from one Seed control (R seed = L seed ^ 0x9E3779B9).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
static const unsigned int kRightSeedXor = 0x9E3779B9u;

struct CheapWalkLane {
  unsigned int seed;
  double x;
};

struct CheapWalkState {
  bool active;
  CheapWalkLane left;
  CheapWalkLane right;
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

static inline double step_lane(CheapWalkLane& lane, double step) {
  lcg_next(lane.seed);
  const double bipolar = (double)lane.seed / 4294967295.0 * 2.0 - 1.0;
  double x = lane.x + bipolar * step;
  if (x > 1.0) x = 2.0 - x;
  if (x < -1.0) x = -2.0 - x;
  lane.x = x;
  return x;
}

static inline unsigned int seed_from_param(double seedParam) {
  unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
  if (s == 0u) s = 1u;
  return s;
}

}  // namespace

extern "C" int soemdsp_cheap_walk_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      CheapWalkState& s = gPool[i];
      s.left.seed = 1u;
      s.left.x = 0.0;
      s.right.seed = 1u ^ kRightSeedXor;
      if (s.right.seed == 0u) s.right.seed = 1u;
      s.right.x = 0.0;
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

extern "C" void soemdsp_cheap_walk_sample_stereo(
  int handle,
  double rateHz,
  double amplitude,
  double seedParam,
  double sampleRate,
  double* outLeft,
  double* outRight
) {
  if (outLeft) *outLeft = 0.0;
  if (outRight) *outRight = 0.0;
  if (handle < 1 || handle > kMaxInstances) return;
  CheapWalkState& st = gPool[handle - 1];
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double rate = rateHz < 0.0 ? 0.0 : rateHz;
  const double amp = clamp01(amplitude);

  if (!(seedParam == st.lastSeedParam)) {
    const unsigned int s = seed_from_param(seedParam);
    st.left.seed = s;
    st.left.x = 0.0;
    st.right.seed = s ^ kRightSeedXor;
    if (st.right.seed == 0u) st.right.seed = 1u;
    st.right.x = 0.0;
    st.lastSeedParam = seedParam;
  }

  double speed01 = rate / sr;
  if (speed01 > 1.0) speed01 = 1.0;
  const double step = speed01 * 0.35;

  const double l = step_lane(st.left, step) * amp;
  const double r = step_lane(st.right, step) * amp;
  if (outLeft) *outLeft = l;
  if (outRight) *outRight = r;
}

// Legacy mono sample — Left lane only.
extern "C" double soemdsp_cheap_walk_sample(
  int handle,
  double rateHz,
  double amplitude,
  double seedParam,
  double sampleRate
) {
  double left = 0.0;
  double right = 0.0;
  soemdsp_cheap_walk_sample_stereo(handle, rateHz, amplitude, seedParam, sampleRate, &left, &right);
  return left;
}

extern "C" int soemdsp_cheap_walk_version() {
  return 2;
}
