// Shared pitch-class / 0.1V/Oct helpers for musical CV natives.
// Port of public/node-graph-musical-engines.js + chord-pad rotate/triads.
#pragma once

#include "scalar_helpers.h"

namespace soemdsp_maths {

static const int kMusicalScalePresets[6] = {
  4095, // Chromatic
  2741, // Major
  1453, // Minor
  661,  // Major Pentatonic
  1193, // Minor Pentatonic
  1365, // Whole Tone
};

static const int kMusicalTriadMaj = 0x91; // 0,4,7
static const int kMusicalTriadMin = 0x89; // 0,3,7
static const int kMusicalTriadDim = 0x49; // 0,3,6

static inline int musical_normalize_mask(double raw) {
  const double v = safe(raw);
  if (!(v * 0.0 == 0.0)) return 0;
  long long n = (long long)(v + (v >= 0.0 ? 0.5 : -0.5));
  return (int)(n & 0xFFF);
}

static inline int musical_preset_mask(double choice) {
  int i = (int)(safe(choice) + (safe(choice) >= 0.0 ? 0.5 : -0.5));
  if (i < 0) i = 0;
  if (i > 5) i = 5;
  return kMusicalScalePresets[i];
}

static inline int musical_rotate_left_12(int mask, int amount) {
  int n = amount % 12;
  if (n < 0) n += 12;
  const int m = mask & 0xFFF;
  if (n == 0) return m;
  return ((m << n) | (m >> (12 - n))) & 0xFFF;
}

/** Fill classes[0..outCount) with pitch classes 0..11 present in mask. */
static inline int musical_classes_from_mask(int mask, int* classes, int maxClasses) {
  const int m = mask & 0xFFF;
  int n = 0;
  for (int pc = 0; pc < 12; pc++) {
    if (((m >> pc) & 1) == 0) continue;
    if (n < maxClasses) classes[n] = pc;
    n++;
  }
  return n > maxClasses ? maxClasses : n;
}

static inline double musical_midi_from_pitch(double pitch) {
  return safe(pitch) * 120.0;
}

static inline double musical_pitch_from_midi(double midi) {
  return safe(midi) / 120.0;
}

/**
 * Rotate mask classes so index 0 is first class at/above rootPc (prefer exact).
 * Returns count written into outClasses.
 */
static inline int musical_classes_from_root(
  int mask,
  double rootPitch,
  int* outClasses,
  int maxClasses
) {
  int classes[12];
  const int n = musical_classes_from_mask(mask, classes, 12);
  if (n < 1 || maxClasses < 1) return 0;
  const double rootMidi = musical_midi_from_pitch(rootPitch);
  int rootPc = (int)(rootMidi + (rootMidi >= 0.0 ? 0.5 : -0.5));
  rootPc = ((rootPc % 12) + 12) % 12;
  int start = 0;
  for (int i = 0; i < n; i++) {
    if (classes[i] >= rootPc) {
      start = i;
      break;
    }
    start = 0;
  }
  for (int i = 0; i < n; i++) {
    if (classes[i] == rootPc) {
      start = i;
      break;
    }
  }
  const int count = n < maxClasses ? n : maxClasses;
  for (int i = 0; i < count; i++) {
    outClasses[i] = classes[(start + i) % n];
  }
  return count;
}

static inline double musical_degree_to_midi(
  double rootPitch,
  const int* classesFromRoot,
  int classCount,
  int degreeIndex
) {
  if (classCount < 1 || !classesFromRoot) {
    return musical_midi_from_pitch(rootPitch);
  }
  const double rootMidi = musical_midi_from_pitch(rootPitch);
  const double rootOctaveBase = dsp_floor(rootMidi / 12.0) * 12.0;
  const int d = degreeIndex;
  int wrapped = d % classCount;
  if (wrapped < 0) wrapped += classCount;
  // floor(d / n) for negatives: toward -inf
  int octaveSpan = d / classCount;
  if (d < 0 && (d % classCount) != 0) octaveSpan -= 1;
  const int pc = classesFromRoot[wrapped];
  double midi = rootOctaveBase + (double)pc + (double)octaveSpan * 12.0;
  if (d >= 0 && d < classCount && midi < rootMidi - 6.0) {
    midi += 12.0;
  }
  return midi;
}

}  // namespace soemdsp_maths
