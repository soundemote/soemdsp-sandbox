// soemdsp-native-module: chord_sequencer
// soemdsp-native-label: Chord Sequencer
// soemdsp-native-target: chordSequencer
// soemdsp-native-kind: pitch

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kStepsPerProgression = 4;
static const int kProgressionCount = 6;

// Two triad shapes, relative to their root (bit 0 = root itself).
static const int kMajorTriadMask = 0x91;  // bits 0, 4, 7 -> 1 + 16 + 128
static const int kMinorTriadMask = 0x89;  // bits 0, 3, 7 -> 1 + 8 + 128

struct ChordStep {
  int root;     // pitch class 0-11
  int quality;  // 0 = major, 1 = minor
};

// Six diatonic progressions in C, four chords each. Root Output anchors each
// chord's root at MIDI 60 (middle C) + pitch class, so it's directly usable
// as a 0.1V/Oct bass pitch without extra offset math downstream.
static const ChordStep kProgressions[kProgressionCount][kStepsPerProgression] = {
  { {0, 0}, {7, 0}, {9, 1}, {5, 0} },   // I - V - vi - IV
  { {0, 0}, {5, 0}, {7, 0}, {0, 0} },   // I - IV - V - I
  { {2, 1}, {7, 0}, {0, 0}, {0, 0} },   // ii - V - I - I
  { {9, 1}, {5, 0}, {0, 0}, {7, 0} },   // vi - IV - I - V
  { {0, 0}, {9, 1}, {5, 0}, {7, 0} },   // I - vi - IV - V
  { {0, 0}, {9, 1}, {2, 1}, {7, 0} },   // I - vi - ii - V
};

struct ChordSequencerState {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  int stepIndex;
};

static ChordSequencerState gPool[kMaxInstances];

int rotateLeft12(int mask, int amount) {
  const int n = ((amount % 12) + 12) % 12;
  if (n == 0) return mask & 0xFFF;
  return ((mask << n) | (mask >> (12 - n))) & 0xFFF;
}

}  // namespace

extern "C" int soemdsp_chord_sequencer_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ChordSequencerState& s = gPool[i];
      s.active = true;
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.stepIndex = 0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_chord_sequencer_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_chord_sequencer_sample(
  int handle,
  double clock,
  double reset,
  double progression
) {
  if (handle < 1 || handle > kMaxInstances) return;
  ChordSequencerState& s = gPool[handle - 1];

  const bool clockHigh = clock > 0.0;
  const bool resetHigh = reset > 0.0;

  if (resetHigh && !s.resetWasHigh) {
    s.stepIndex = 0;
  }
  s.resetWasHigh = resetHigh;

  if (clockHigh && !s.clockWasHigh) {
    s.stepIndex = (s.stepIndex + 1) % kStepsPerProgression;
  }
  s.clockWasHigh = clockHigh;
}

extern "C" int soemdsp_chord_sequencer_scale(int handle, double progression) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  const ChordSequencerState& s = gPool[handle - 1];
  const int prog = clamp_int((int)progression, 0, kProgressionCount - 1);
  const ChordStep& step = kProgressions[prog][s.stepIndex];
  const int baseMask = step.quality == 0 ? kMajorTriadMask : kMinorTriadMask;
  return rotateLeft12(baseMask, step.root);
}

extern "C" double soemdsp_chord_sequencer_root(int handle, double progression) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const ChordSequencerState& s = gPool[handle - 1];
  const int prog = clamp_int((int)progression, 0, kProgressionCount - 1);
  const ChordStep& step = kProgressions[prog][s.stepIndex];
  return (60.0 + step.root) / 120.0;
}

extern "C" int soemdsp_chord_sequencer_step(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].stepIndex;
}

extern "C" int soemdsp_chord_sequencer_version() {
  return 1;
}
