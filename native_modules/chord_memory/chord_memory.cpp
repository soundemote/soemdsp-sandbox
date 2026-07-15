// soemdsp-native-module: chord_memory
// soemdsp-native-label: Chord Memory
// soemdsp-native-target: chordMemory
// soemdsp-native-kind: utility
//
// A 4-slot pitch latch: each rising edge on Latch writes the current Pitch
// input into the next slot (wrapping after 4), Clear resets all slots, and
// Advance steps an arpeggiator index through whichever slots have been
// written so far (skipping empty ones, wrapping only across active slots).
//
// Main _sample() call returns Note 1; the other five outputs (Note 2-4,
// Arp, Gate) are read via accessor functions afterward, following this
// codebase's established pattern for native modules with more than one
// output (compare soemdsp_comparator_inv_gate, etc.).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct ChordMemoryState {
  bool active;
  bool latchWasHigh;
  bool clearWasHigh;
  bool advanceWasHigh;
  int writeIndex;
  int arpIndex;
  double slots[4];
  bool slotsActive[4];
  double lastNote2;
  double lastNote3;
  double lastNote4;
  double lastArp;
  double lastGate;
};

static ChordMemoryState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_chord_memory_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      ChordMemoryState& s = gPool[i];
      s.latchWasHigh = false;
      s.clearWasHigh = false;
      s.advanceWasHigh = false;
      s.writeIndex = 0;
      s.arpIndex = 0;
      for (int j = 0; j < 4; j++) {
        s.slots[j] = 0.0;
        s.slotsActive[j] = false;
      }
      s.lastNote2 = 0.0;
      s.lastNote3 = 0.0;
      s.lastNote4 = 0.0;
      s.lastArp = 0.0;
      s.lastGate = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_chord_memory_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_chord_memory_sample(
  int    handle,
  double latch,
  double clear,
  double advance,
  double pitch
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  ChordMemoryState& s = gPool[handle - 1];

  const bool latchHigh = safe(latch) > 0.0;
  const bool clearHigh = safe(clear) > 0.0;
  const bool advanceHigh = safe(advance) > 0.0;
  const double safePitch = safe(pitch);

  if (clearHigh && !s.clearWasHigh) {
    for (int i = 0; i < 4; i++) {
      s.slots[i] = 0.0;
      s.slotsActive[i] = false;
    }
    s.writeIndex = 0;
    s.arpIndex = 0;
  }
  s.clearWasHigh = clearHigh;

  if (latchHigh && !s.latchWasHigh) {
    s.slots[s.writeIndex] = safePitch;
    s.slotsActive[s.writeIndex] = true;
    s.writeIndex = (s.writeIndex + 1) % 4;
  }
  s.latchWasHigh = latchHigh;

  int activeIndices[4];
  int activeCount = 0;
  for (int i = 0; i < 4; i++) {
    if (s.slotsActive[i]) {
      activeIndices[activeCount] = i;
      activeCount++;
    }
  }

  if (advanceHigh && !s.advanceWasHigh && activeCount > 0) {
    int currentPos = -1;
    for (int i = 0; i < activeCount; i++) {
      if (activeIndices[i] == s.arpIndex) {
        currentPos = i;
        break;
      }
    }
    const int nextPos = currentPos == -1 ? 0 : (currentPos + 1) % activeCount;
    s.arpIndex = activeIndices[nextPos];
  }
  s.advanceWasHigh = advanceHigh;

  const double arp = activeCount > 0 ? s.slots[s.arpIndex] : 0.0;
  const double gate = activeCount > 0 ? 1.0 : 0.0;

  s.lastNote2 = s.slots[1];
  s.lastNote3 = s.slots[2];
  s.lastNote4 = s.slots[3];
  s.lastArp = arp;
  s.lastGate = gate;

  return s.slots[0];
}

extern "C" double soemdsp_chord_memory_note2(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastNote2;
}

extern "C" double soemdsp_chord_memory_note3(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastNote3;
}

extern "C" double soemdsp_chord_memory_note4(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastNote4;
}

extern "C" double soemdsp_chord_memory_arp(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastArp;
}

extern "C" double soemdsp_chord_memory_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" int soemdsp_chord_memory_version() {
  return 1;
}
