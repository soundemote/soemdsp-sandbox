// soemdsp-native-module: turing_machine
// soemdsp-native-label: Turing Machine
// soemdsp-native-target: turingMachine
// soemdsp-native-kind: utility
//
// A shift-register sequencer (Music Thing Modular's "Turn Machine" idea):
// on every clock rising edge, the top bit of a length-bit register shifts
// out, and either repeats (probability chance to flip it first) back in at
// the bottom. Reset zeroes the register. CV/Scale/Gate are all read off
// the same register, just interpreted differently (bipolar level-scaled
// value, a 12-bit chunk for a scale/quantizer lookup elsewhere, and the
// bottom bit as a gate).
//
// The JS reference draws its flip decision from Math.random() -- global,
// unseeded, genuinely different every run. A native module can't share
// that RNG (no cross-language random source is wired up), so this port
// uses its own xorshift32, seeded once at create() from a JS-supplied
// entropy value (Math.random()-derived, drawn once per instance) rather
// than a fixed seed -- preserving the "different every time" feel instead
// of making every instance's sequence deterministically reproducible.
// Reset/clock/mask/CV/Scale/Gate logic is otherwise an exact port.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TuringMachineState {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  int registerValue;
  unsigned int rngState;
  double lastScale;
  double lastGate;
};

static TuringMachineState gPool[kMaxInstances];

static unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

static double next_unit(unsigned int& state) {
  return (double)xorshift32(state) / 4294967295.0;
}

}  // namespace

extern "C" int soemdsp_turing_machine_create(unsigned int entropySeed) {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TuringMachineState& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.registerValue = 0;
      s.rngState = entropySeed ? entropySeed : 1U;
      s.lastScale = 0.0;
      s.lastGate = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_turing_machine_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_turing_machine_sample(
  int    handle,
  double clock,
  double reset,
  double length,
  double probability,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TuringMachineState& s = gPool[handle - 1];

  const bool clockHigh = safe(clock) > 0.0;
  const bool resetHigh = safe(reset) > 0.0;
  long long lengthSteps = (long long)(safe(length) + 0.5);
  if (lengthSteps < 1) lengthSteps = 1;
  if (lengthSteps > 16) lengthSteps = 16;
  const double safeProbability = clamp(safe(probability), 0.0, 1.0);
  const double safeLevel = safe(level);

  if (resetHigh && !s.resetWasHigh) {
    s.registerValue = 0;
  }
  s.resetWasHigh = resetHigh;

  if (clockHigh && !s.clockWasHigh) {
    const int mask = (1 << lengthSteps) - 1;
    const int topBit = (s.registerValue >> (lengthSteps - 1)) & 1;
    const int newBit = next_unit(s.rngState) < safeProbability ? (1 - topBit) : topBit;
    s.registerValue = ((s.registerValue << 1) | newBit) & mask;
  }
  s.clockWasHigh = clockHigh;

  const int mask = (1 << lengthSteps) - 1;
  const double maxValue = mask > 0 ? (double)mask : 1.0;
  const double cv = ((double)s.registerValue / maxValue) * 2.0 - 1.0;
  const double scaleMask = (double)(s.registerValue & 0xFFF);
  const double gate = (double)(s.registerValue & 1);

  s.lastScale = scaleMask;
  s.lastGate = gate * safeLevel;
  return cv * safeLevel;
}

extern "C" double soemdsp_turing_machine_scale(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastScale;
}

extern "C" double soemdsp_turing_machine_gate(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastGate;
}

extern "C" int soemdsp_turing_machine_version() {
  return 1;
}
