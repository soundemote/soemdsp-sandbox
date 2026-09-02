// soemdsp-native-module: degree_turing
// soemdsp-native-label: Degree Turing
// soemdsp-native-target: degreeTuring
// soemdsp-native-kind: pitch
//
// Mutating shift-register over scale degrees. RNG: per-instance xorshift32.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct State {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  int registerValue;
  unsigned int rngState;
  double lastMidi;
  double lastGate;
  double lastTrigger;
  double lastDegree;
  double lastCv;
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

extern "C" int soemdsp_degree_turing_create(unsigned int entropySeed) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.registerValue = 0xA5;
      s.rngState = entropySeed ? entropySeed : 1u;
      s.lastMidi = 60.0;
      s.lastGate = 0.0;
      s.lastTrigger = 0.0;
      s.lastDegree = 0.0;
      s.lastCv = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_degree_turing_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_degree_turing_sample(
  int handle,
  double clock,
  double reset,
  double length,
  double probability,
  double octaves,
  double level,
  double scaleIn,
  double hasScale,
  double root,
  double scaleChoice
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  int lengthSteps = (int)(safe(length) + 0.5);
  if (lengthSteps < 2) lengthSteps = 2;
  if (lengthSteps > 16) lengthSteps = 16;
  const double prob = clamp(safe(probability), 0.0, 1.0);
  int oct = (int)(safe(octaves) + 0.5);
  if (oct < 0) oct = 0;
  if (oct > 4) oct = 4;
  const double lvl = safe(level);
  const int mask = safe(hasScale) > 0.5
    ? musical_normalize_mask(scaleIn)
    : musical_preset_mask(scaleChoice);
  // Match JS: Number(options.root) || (60/120)
  const double rootUse = (safe(root) != 0.0) ? safe(root) : (60.0 / 120.0);

  int classes[12];
  const int classCount = musical_classes_from_root(mask, rootUse, classes, 12);

  const bool resetHigh = safe(reset) > 0.0;
  if (resetHigh && !s.resetWasHigh) {
    s.registerValue = 0xA5 & ((1 << lengthSteps) - 1);
  }
  s.resetWasHigh = resetHigh;

  double trig = 0.0;
  const bool clockHigh = safe(clock) > 0.0;
  if (clockHigh && !s.clockWasHigh) {
    const int regMask = (1 << lengthSteps) - 1;
    const int topBit = (s.registerValue >> (lengthSteps - 1)) & 1;
    const int newBit = next_unit(s.rngState) < prob ? (1 - topBit) : topBit;
    s.registerValue = ((s.registerValue << 1) | newBit) & regMask;
    trig = 1.0;
  }
  s.clockWasHigh = clockHigh;

  const int regMask = (1 << lengthSteps) - 1;
  const int reg = s.registerValue & regMask;
  const int degreeSpan = classCount > 0 ? classCount * (oct + 1) : 1;
  const int degree = classCount > 0 ? (reg % degreeSpan) : 0;
  if (classCount > 0) {
    s.lastMidi = musical_degree_to_midi(rootUse, classes, classCount, degree);
  }
  s.lastGate = (double)(reg & 1) * lvl;
  s.lastTrigger = trig * lvl;
  s.lastDegree = classCount > 0
    ? (double)degree / (double)(degreeSpan > 1 ? degreeSpan - 1 : 1)
    : 0.0;
  const double maxValue = regMask > 0 ? (double)regMask : 1.0;
  s.lastCv = ((double)reg / maxValue * 2.0 - 1.0) * lvl;
  return musical_pitch_from_midi(s.lastMidi);
}

extern "C" double soemdsp_degree_turing_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" double soemdsp_degree_turing_trigger(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastTrigger;
}

extern "C" double soemdsp_degree_turing_degree(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastDegree;
}

extern "C" double soemdsp_degree_turing_cv(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastCv;
}

extern "C" int soemdsp_degree_turing_version() {
  return 1;
}
