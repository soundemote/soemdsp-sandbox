// Polyphony voice table — Midi Note + Velocity (status = velocity > 0).
// Full MIDI range 0..127. No bitmasks / phase-mux. Sticky voice slots.
// Header-only; mirrored by public/lib/polyphony-voices.js for the worklet path.
#pragma once

#include "scalar_helpers.h"
#include "analog_filter_trig.h"

namespace soemdsp_maths {

static const int kPolyphonyNoteCount = 128;
static const int kPolyphonyMaxVoices = 32;

/** Authoritative note state: velocity[n]==0 → off, else on with that velocity. */
struct PolyphonyVoiceTable {
  unsigned char velocity[kPolyphonyNoteCount];
};

struct PolyphonyVoiceSlot {
  int midi;              // -1 = free
  unsigned char velocity;
  unsigned int age;      // lower = older (steal candidate)
};

static inline void polyphony_table_clear(PolyphonyVoiceTable* t) {
  if (!t) return;
  for (int i = 0; i < kPolyphonyNoteCount; i++) t->velocity[i] = 0;
}

static inline void polyphony_table_set(PolyphonyVoiceTable* t, int midi, int vel) {
  if (!t) return;
  if (midi < 0 || midi >= kPolyphonyNoteCount) return;
  if (vel < 0) vel = 0;
  if (vel > 127) vel = 127;
  t->velocity[midi] = (unsigned char)vel;
}

static inline void polyphony_table_merge_max(PolyphonyVoiceTable* dst, const PolyphonyVoiceTable* src) {
  if (!dst || !src) return;
  for (int i = 0; i < kPolyphonyNoteCount; i++) {
    if (src->velocity[i] > dst->velocity[i]) dst->velocity[i] = src->velocity[i];
  }
}

/** Collect active notes into midi[] / vel[] (ascending pitch). Returns count. */
static inline int polyphony_table_collect(
  const PolyphonyVoiceTable* t,
  int* midiOut,
  unsigned char* velOut,
  int maxOut
) {
  if (!t || maxOut < 1) return 0;
  int n = 0;
  for (int m = 0; m < kPolyphonyNoteCount; m++) {
    const unsigned char v = t->velocity[m];
    if (!v) continue;
    if (n < maxOut) {
      if (midiOut) midiOut[n] = m;
      if (velOut) velOut[n] = v;
    }
    n++;
  }
  return n > maxOut ? maxOut : n;
}

/**
 * Sticky voice allocator: keep midi→slot until note-off; steal oldest on overflow.
 * slots[0..laneCount). ageCounter is monotonic (pass/return).
 */
static inline unsigned int polyphony_allocate_sticky(
  const PolyphonyVoiceTable* table,
  PolyphonyVoiceSlot* slots,
  int laneCount,
  unsigned int ageCounter
) {
  if (!table || !slots || laneCount < 1) return ageCounter;
  if (laneCount > kPolyphonyMaxVoices) laneCount = kPolyphonyMaxVoices;

  // Release or refresh velocity for held notes.
  for (int i = 0; i < laneCount; i++) {
    const int m = slots[i].midi;
    if (m < 0 || m >= kPolyphonyNoteCount) {
      slots[i].midi = -1;
      slots[i].velocity = 0;
      slots[i].age = 0;
      continue;
    }
    const unsigned char v = table->velocity[m];
    if (!v) {
      slots[i].midi = -1;
      slots[i].velocity = 0;
      slots[i].age = 0;
    } else {
      slots[i].velocity = v;
    }
  }

  // Assign newly held notes.
  for (int m = 0; m < kPolyphonyNoteCount; m++) {
    const unsigned char v = table->velocity[m];
    if (!v) continue;
    int found = 0;
    for (int i = 0; i < laneCount; i++) {
      if (slots[i].midi == m) { found = 1; break; }
    }
    if (found) continue;

    int freeIdx = -1;
    for (int i = 0; i < laneCount; i++) {
      if (slots[i].midi < 0) { freeIdx = i; break; }
    }
    if (freeIdx < 0) {
      // Steal oldest (lowest age among occupied).
      freeIdx = 0;
      for (int i = 1; i < laneCount; i++) {
        if (slots[i].age < slots[freeIdx].age) freeIdx = i;
      }
    }
    ageCounter += 1;
    slots[freeIdx].midi = m;
    slots[freeIdx].velocity = v;
    slots[freeIdx].age = ageCounter;
  }
  return ageCounter;
}

/** Hz from MIDI note + shared Meta pitch offsets (oct / st / cents / Hz). */
static inline double polyphony_voice_hz(
  int midi,
  double octave,
  double semitones,
  double cents,
  double freqOffset
) {
  if (midi < 0 || midi > 127) return 0.0;
  const double base = 440.0 * dsp_exp2((double)(midi - 69) / 12.0);
  const double ratio = dsp_exp2(safe(octave) + safe(semitones) / 12.0 + safe(cents) / 1200.0);
  return base * ratio + safe(freqOffset);
}

} // namespace soemdsp_maths
