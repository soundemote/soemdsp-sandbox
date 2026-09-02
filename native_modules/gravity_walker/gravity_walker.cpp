// soemdsp-native-module: gravity_walker
// soemdsp-native-label: Gravity Walker
// soemdsp-native-target: gravityWalker
// soemdsp-native-kind: pitch
//
// Nearest-tone walk with leap CV. RNG: per-instance xorshift32.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct State {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  int degree;
  int inertia;
  unsigned int rngState;
  double lastMidi;
  double lastGate;
  double lastTrigger;
  double lastDegreeNorm;
};

static State gPool[kMaxInstances];

static unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x ? x : 1u;
  return state;
}

static double next_unit(unsigned int& state) {
  return (double)xorshift32(state) / 4294967295.0;
}

}  // namespace

extern "C" int soemdsp_gravity_walker_create(unsigned int entropySeed) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.degree = 0;
      s.inertia = 1;
      s.rngState = entropySeed ? entropySeed : 1u;
      s.lastMidi = 60.0;
      s.lastGate = 0.0;
      s.lastTrigger = 0.0;
      s.lastDegreeNorm = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_gravity_walker_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_gravity_walker_sample(
  int handle,
  double clock,
  double reset,
  double gravityIn,
  double leapIn,
  double leapCv,
  double octaves,
  double level,
  double scaleIn,
  double hasScale,
  double root,
  double scaleChoice
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const double lvl = safe(level);
  const double leapAmount = clamp(safe(leapIn), 0.0, 1.0);
  const double leapCvAbs = clamp(dsp_fabs(safe(leapCv)), 0.0, 1.0);
  const double leapProb = clamp(leapAmount + leapCvAbs * 0.85, 0.0, 1.0);
  const double gravity = clamp(safe(gravityIn), 0.0, 1.0);
  int oct = (int)(safe(octaves) + 0.5);
  if (oct < 0) oct = 0;
  if (oct > 4) oct = 4;
  const int mask = safe(hasScale) > 0.5
    ? musical_normalize_mask(scaleIn)
    : musical_preset_mask(scaleChoice);
  const double rootUse = (safe(root) != 0.0) ? safe(root) : (60.0 / 120.0);

  int classes[12];
  const int classCount = musical_classes_from_root(mask, rootUse, classes, 12);
  const int span = classCount > 0 ? classCount * (oct + 1) : 1;

  const bool resetHigh = safe(reset) > 0.0;
  if (resetHigh && !s.resetWasHigh) {
    s.degree = 0;
    s.inertia = 1;
  }
  s.resetWasHigh = resetHigh;

  double trig = 0.0;
  const bool clockHigh = safe(clock) > 0.0;
  if (clockHigh && !s.clockWasHigh && classCount > 0) {
    trig = 1.0;
    if (next_unit(s.rngState) < leapProb) {
      const int half = span / 2;
      const int jumpMax = half > 1 ? half : 1;
      const int jump = 1 + (int)(next_unit(s.rngState) * (double)jumpMax);
      s.inertia = next_unit(s.rngState) < 0.5 ? -1 : 1;
      s.degree = (s.degree + s.inertia * jump + span * 8) % span;
    } else {
      int step = s.inertia;
      if (next_unit(s.rngState) > gravity) {
        step = next_unit(s.rngState) < 0.5 ? -step : 0;
      }
      if (step == 0) {
        step = next_unit(s.rngState) < 0.5 ? -1 : 1;
      }
      s.inertia = step >= 0 ? 1 : -1;
      s.degree = (s.degree + step + span * 8) % span;
    }
  }
  s.clockWasHigh = clockHigh;

  if (classCount > 0) {
    s.lastMidi = musical_degree_to_midi(rootUse, classes, classCount, s.degree);
  }
  s.lastGate = (classCount > 0 ? 1.0 : 0.0) * lvl;
  s.lastTrigger = trig * lvl;
  s.lastDegreeNorm = span > 1 ? (double)s.degree / (double)(span - 1) : 0.0;
  return musical_pitch_from_midi(s.lastMidi);
}

extern "C" double soemdsp_gravity_walker_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" double soemdsp_gravity_walker_trigger(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastTrigger;
}

extern "C" double soemdsp_gravity_walker_degree(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastDegreeNorm;
}

extern "C" int soemdsp_gravity_walker_version() {
  return 1;
}
