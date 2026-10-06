// soemdsp-native-module: turing_machine
// soemdsp-native-label: Turing Machine
// soemdsp-native-target: turingMachine
// soemdsp-native-kind: utility
//
// A shift-register sequencer (Music Thing Modular's "Turn Machine" idea):
// on every clock rising edge, the top bit of a length-bit register shifts
// out, and either repeats (probability chance to flip it first) back in at
// the bottom. Reset zeroes the register and restarts the flip RNG from the
// Seed. CV/Scale/Gate are all read off
// the same register, just interpreted differently (bipolar level-scaled
// value, a 12-bit chunk for a scale/quantizer lookup elsewhere, and the
// bottom bit as a gate).
//
// Randomness: the flip decisions come from a private xorshift32 seeded only
// from the module's saved Seed param (0..16777215; 0 is a normal seed):
// state = seed_to_rng_state(seed_mix(Seed, kSeedFlip)). The patch gives each
// new module its own Seed (from the patch master seed), so instances differ
// while every reload of the same patch reproduces the same sequence. The
// stream restarts on Reset and whenever Seed changes.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

// Fixed seed components (never reorder; append new parts at the end).
enum : unsigned int {
  kSeedFlip = 1u,  // per-clock flip decisions
};

struct TuringMachineState {
  bool active;
  bool clockWasHigh;
  bool resetWasHigh;
  int registerValue;
  unsigned int rngState;
  unsigned int seed;  // module Seed currently applied to rngState
  double lastScale;
  double lastGate;
};

static TuringMachineState gPool[kMaxInstances];


static double next_unit(unsigned int& state) {
  return (double)xorshift32(state) / 4294967295.0;
}

static unsigned int flip_rng_state(unsigned int seed) {
  return seed_to_rng_state(seed_mix(seed, kSeedFlip));
}

}  // namespace

extern "C" int soemdsp_turing_machine_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TuringMachineState& s = gPool[i];
      s.clockWasHigh = false;
      s.resetWasHigh = false;
      s.registerValue = 0;
      s.seed = 0u;  // host Seed applied on first sample (re-seeds on change)
      s.rngState = flip_rng_state(0u);
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
  double level,
  double seedIn
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TuringMachineState& s = gPool[handle - 1];

  const unsigned int seed = seed_param_u32(seedIn);
  if (seed != s.seed) {
    s.seed = seed;
    s.rngState = flip_rng_state(seed);
  }

  const bool clockHigh = safe(clock) > 0.0;
  const bool resetHigh = safe(reset) > 0.0;
  long long lengthSteps = (long long)(safe(length) + 0.5);
  if (lengthSteps < 1) lengthSteps = 1;
  if (lengthSteps > 16) lengthSteps = 16;
  const double safeProbability = clamp(safe(probability), 0.0, 1.0);
  const double safeLevel = safe(level);

  if (rising_edge_bool(resetHigh, &s.resetWasHigh)) {
    s.registerValue = 0;
    s.rngState = flip_rng_state(s.seed);
  }

  if (rising_edge_bool(clockHigh, &s.clockWasHigh)) {
    const int mask = (1 << lengthSteps) - 1;
    const int topBit = (s.registerValue >> (lengthSteps - 1)) & 1;
    const int newBit = next_unit(s.rngState) < safeProbability ? (1 - topBit) : topBit;
    s.registerValue = ((s.registerValue << 1) | newBit) & mask;
  }

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
  return 2;
}
