// soemdsp-native-module: chord_pad
// soemdsp-native-label: Chord Pad
// soemdsp-native-target: chordPad
// soemdsp-native-kind: pitch
//
// Diatonic triad → Scale (12-bit mask) + Root (0.1V/Oct) + Gate.
// Port of public/node-graph-chord-pad.js / chord-pad-worklet-evaluator.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

// Major / natural minor: [semitone offset, quality] quality 0=maj 1=min 2=dim
static const int kMajorDegrees[7][2] = {
  {0, 0}, {2, 1}, {4, 1}, {5, 0}, {7, 0}, {9, 1}, {11, 2},
};
static const int kMinorDegrees[7][2] = {
  {0, 1}, {2, 2}, {3, 0}, {5, 1}, {7, 1}, {8, 0}, {10, 0},
};

struct State {
  bool active;
  double lastRoot;
  double lastGate;
};

static State gPool[kMaxInstances];

static int clamp_key(double key) {
  int n = (int)(safe(key) + (safe(key) >= 0.0 ? 0.5 : -0.5));
  n %= 12;
  if (n < 0) n += 12;
  return n;
}

static int clamp_mode(double mode) {
  return (int)(safe(mode) + (safe(mode) >= 0.0 ? 0.5 : -0.5)) == 1 ? 1 : 0;
}

static int clamp_degree(double degree) {
  int n = (int)(safe(degree) + (safe(degree) >= 0.0 ? 0.5 : -0.5));
  if (n < 0) n = 0;
  if (n > 6) n = 6;
  return n;
}

static int degree_from_select(double selectValue) {
  const double v = safe(selectValue);
  if (!(v * 0.0 == 0.0)) return 0;
  // Integer stepped 0..6
  const double rounded = v + (v >= 0.0 ? 0.5 : -0.5);
  const int asInt = (int)rounded;
  if (v >= 0.0 && v <= 6.5 && (double)asInt == rounded && asInt == (int)v) {
    return clamp_degree(v);
  }
  // Also accept exact integers via near-equality
  if (v >= 0.0 && v <= 6.5) {
    const double frac = v - dsp_floor(v);
    if (frac < 1.0e-9 || frac > 1.0 - 1.0e-9) {
      return clamp_degree(v);
    }
  }
  double u = v;
  if (u < 0.0) u = 0.0;
  if (u > 1.0) u = 1.0;
  return clamp_degree(dsp_floor(u * 6.999));
}

static int triad_mask(int quality) {
  if (quality == 1) return kMusicalTriadMin;
  if (quality == 2) return kMusicalTriadDim;
  return kMusicalTriadMaj;
}

}  // namespace

extern "C" int soemdsp_chord_pad_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].lastRoot = 60.0 / 120.0;
      gPool[i].lastGate = 1.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_chord_pad_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_chord_pad_sample(
  int handle,
  double select,
  double hasSelect,
  double key,
  double mode,
  double degree,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const int keyPc = clamp_key(key);
  const int modeI = clamp_mode(mode);
  int deg = clamp_degree(degree);
  if (safe(hasSelect) > 0.5) {
    deg = degree_from_select(select);
  }
  const int (*table)[2] = modeI == 1 ? kMinorDegrees : kMajorDegrees;
  const int offset = table[deg][0];
  const int quality = table[deg][1];
  const int rootPc = (keyPc + offset) % 12;
  const int scale = musical_rotate_left_12(triad_mask(quality), rootPc);
  double gate = safe(level);
  if (!(gate * 0.0 == 0.0)) gate = 1.0;
  if (gate < 0.0) gate = 0.0;
  if (gate > 1.0) gate = 1.0;
  s.lastRoot = (60.0 + (double)rootPc) / 120.0;
  s.lastGate = gate;
  return (double)scale;
}

extern "C" double soemdsp_chord_pad_root(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastRoot;
}

extern "C" double soemdsp_chord_pad_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" int soemdsp_chord_pad_version() {
  return 1;
}
