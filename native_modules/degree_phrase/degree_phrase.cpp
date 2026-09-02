// soemdsp-native-module: degree_phrase
// soemdsp-native-label: Degree Phrase
// soemdsp-native-target: degreePhrase
// soemdsp-native-kind: pitch
//
// 8-step degree phrase + rest + mutate. RNG: per-instance xorshift32.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct State {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  bool hasLive;
  int index;
  int liveDegrees[8];
  int liveRests[8];
  unsigned int rngState;
  double lastMidi;
  double lastGate;
  double lastTrigger;
  double lastPhase;
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

extern "C" int soemdsp_degree_phrase_create(unsigned int entropySeed) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.hasLive = false;
      s.index = 0;
      s.rngState = entropySeed ? entropySeed : 1u;
      s.lastMidi = 60.0;
      s.lastGate = 0.0;
      s.lastTrigger = 0.0;
      s.lastPhase = 0.0;
      for (int k = 0; k < 8; k++) {
        s.liveDegrees[k] = 0;
        s.liveRests[k] = 0;
      }
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_degree_phrase_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_degree_phrase_sample(
  int handle,
  double clock,
  double reset,
  double stepsIn,
  double mutateIn,
  double octaves,
  double level,
  double scaleIn,
  double hasScale,
  double root,
  double scaleChoice,
  double step1, double step2, double step3, double step4,
  double step5, double step6, double step7, double step8,
  double rest1, double rest2, double rest3, double rest4,
  double rest5, double rest6, double rest7, double rest8
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  int steps = (int)(safe(stepsIn) + 0.5);
  if (steps < 1) steps = 1;
  if (steps > 8) steps = 8;
  const double mutate = clamp(safe(mutateIn), 0.0, 1.0);
  int oct = (int)(safe(octaves) + 0.5);
  if (oct < 0) oct = 0;
  if (oct > 4) oct = 4;
  const double lvl = safe(level);
  const int mask = safe(hasScale) > 0.5
    ? musical_normalize_mask(scaleIn)
    : musical_preset_mask(scaleChoice);
  const double rootUse = (safe(root) != 0.0) ? safe(root) : (60.0 / 120.0);

  int classes[12];
  const int classCount = musical_classes_from_root(mask, rootUse, classes, 12);
  const int span = classCount > 0 ? classCount * (oct + 1) : 1;

  const double stepVals[8] = {
    step1, step2, step3, step4, step5, step6, step7, step8
  };
  const double restVals[8] = {
    rest1, rest2, rest3, rest4, rest5, rest6, rest7, rest8
  };
  int degrees[8];
  int rests[8];
  for (int i = 0; i < 8; i++) {
    double raw = safe(stepVals[i]);
    if (!(raw * 0.0 == 0.0)) raw = (double)i / 7.0;
    rests[i] = safe(restVals[i]) > 0.5 ? 1 : 0;
    int d = (int)(raw * (double)(span - 1) + 0.5);
    if (d < 0) d = 0;
    if (d > span - 1) d = span - 1;
    degrees[i] = d;
  }

  const bool resetHigh = safe(reset) > 0.0;
  if (resetHigh && !s.resetWasHigh) {
    s.index = 0;
    for (int i = 0; i < 8; i++) {
      s.liveDegrees[i] = degrees[i];
      s.liveRests[i] = rests[i];
    }
    s.hasLive = true;
  }
  s.resetWasHigh = resetHigh;

  if (!s.hasLive) {
    for (int i = 0; i < 8; i++) {
      s.liveDegrees[i] = degrees[i];
      s.liveRests[i] = rests[i];
    }
    s.hasLive = true;
  }

  for (int i = 0; i < 8; i++) {
    if (next_unit(s.rngState) < 0.02) {
      s.liveDegrees[i] = degrees[i];
      s.liveRests[i] = rests[i];
    }
  }

  double trig = 0.0;
  double gate = 0.0;
  const bool clockHigh = safe(clock) > 0.0;
  if (clockHigh && !s.clockWasHigh) {
    if (next_unit(s.rngState) < mutate) {
      const int j = (int)(next_unit(s.rngState) * (double)steps);
      const int ji = j < 0 ? 0 : (j >= steps ? steps - 1 : j);
      if (next_unit(s.rngState) < 0.35) {
        s.liveRests[ji] = s.liveRests[ji] ? 0 : 1;
      } else {
        s.liveDegrees[ji] = (int)(next_unit(s.rngState) * (double)span);
        if (s.liveDegrees[ji] >= span) s.liveDegrees[ji] = span - 1;
      }
    }
    const int i = ((s.index % steps) + steps) % steps;
    s.index = (s.index + 1) % steps;
    if (!s.liveRests[i] && classCount > 0) {
      trig = 1.0;
      gate = 1.0;
      s.lastMidi = musical_degree_to_midi(rootUse, classes, classCount, s.liveDegrees[i]);
    }
  } else {
    const int prev = (s.index - 1 + steps) % steps;
    gate = (!s.liveRests[prev] && classCount > 0) ? 1.0 : 0.0;
  }
  s.clockWasHigh = clockHigh;

  s.lastGate = gate * lvl;
  s.lastTrigger = trig * lvl;
  s.lastPhase = (double)(s.index % steps) / (double)(steps > 0 ? steps : 1);
  return musical_pitch_from_midi(s.lastMidi);
}

extern "C" double soemdsp_degree_phrase_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" double soemdsp_degree_phrase_trigger(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastTrigger;
}

extern "C" double soemdsp_degree_phrase_phase(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastPhase;
}

extern "C" int soemdsp_degree_phrase_version() {
  return 1;
}
