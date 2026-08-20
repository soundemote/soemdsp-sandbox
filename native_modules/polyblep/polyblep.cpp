// soemdsp-native-module: polyblep
// soemdsp-native-label: PolyBLEP
// soemdsp-native-target: polyBlep
// soemdsp-native-kind: oscillator

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 16;
// Slot 0 is the currently-selected waveform (driven by the Waveform
// parameter); slots 1-5 are the always-on Saw/Ramp/Square/Tri/Sine taps that
// mirror node-graph-oscillator-runtime.js's polyBlep implementation exactly,
// including the (deliberate, matches the JS host) quirk that Reset only
// zeroes slot 0's triangle integrator. Hz 0 still follows host phase.
constexpr int kSlotCount = 6;

struct SlotState {
  double lastPhaseIncrement;
  double triangleIntegrator;
  unsigned int noiseSeed;
  bool hasNoiseSeed;
};

struct PolyBlepState {
  bool active;
  SlotState slots[kSlotCount];
  double out;
  double saw;
  double ramp;
  double square;
  double tri;
  double sine;
};

static PolyBlepState gPool[kMaxInstances];

double clampD(double value, double lo, double hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

double wrapRadians(double value) {
  while (value > kPi) value -= kTwoPi;
  while (value < -kPi) value += kTwoPi;
  return value;
}

double sinApprox(double value) {
  const double x = wrapRadians(value);
  const double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

double polyBlep(double phaseCycle, double phaseIncrement) {
  const double dt = clampD(phaseIncrement < 0.0 ? -phaseIncrement : phaseIncrement, 1.0e-6, 0.5);
  if (phaseCycle < dt) {
    const double t = phaseCycle / dt;
    return t + t - t * t - 1.0;
  }
  if (phaseCycle > 1.0 - dt) {
    const double t = (phaseCycle - 1.0) / dt;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}

double polyBlepSquare(double phaseCycle, double phaseIncrement) {
  double value = phaseCycle < 0.5 ? 1.0 : -1.0;
  value += polyBlep(phaseCycle, phaseIncrement);
  value -= polyBlep(wrap01(phaseCycle + 0.5), phaseIncrement);
  return value;
}

unsigned int nextNoiseSeed(unsigned int seed) {
  return (unsigned int)((1664525u * seed) + 1013904223u);
}

double seedToBipolar(unsigned int seed) {
  return ((double)seed / 4294967295.0) * 2.0 - 1.0;
}

double oscillatorSample(SlotState& slot, double phase, double phaseIncrement, int waveform) {
  const double phaseDelta = phaseIncrement;
  const double absDelta = phaseDelta < 0.0 ? -phaseDelta : phaseDelta;
  const bool phaseStopped = absDelta <= 1.0e-12;
  // Hz 0 is not special: still evaluate at the host phase (Phase knob / PM).
  const double renderIncrement = phaseStopped ? 1.0e-6 : phaseDelta;
  const double phaseCycle = wrap01(phase / kTwoPi);
  double sample = 0.0;
  switch (waveform) {
    case 1:
      sample = -1.0 + phaseCycle * 2.0 - polyBlep(phaseCycle, renderIncrement);
      break;
    case 2:
      sample = polyBlepSquare(phaseCycle, renderIncrement);
      break;
    case 3: {
      if (phaseStopped) {
        const double t = phaseCycle < 0.5 ? (0.5 - phaseCycle) : (phaseCycle - 0.5);
        sample = 1.0 - 4.0 * t;
        slot.triangleIntegrator = sample;
        break;
      }
      double nextTriangle = (slot.triangleIntegrator + polyBlepSquare(phaseCycle, renderIncrement) * phaseDelta * 4.0) * 0.995;
      nextTriangle = clampD(nextTriangle, -1.0, 1.0);
      slot.triangleIntegrator = nextTriangle;
      sample = nextTriangle;
      break;
    }
    case 4:
      sample = sinApprox(phase);
      break;
    case 5: {
      if (phaseStopped) {
        if (!slot.hasNoiseSeed) {
          slot.noiseSeed = nextNoiseSeed(0x12345678u);
          slot.hasNoiseSeed = true;
        }
        sample = seedToBipolar(slot.noiseSeed);
      } else {
        slot.noiseSeed = nextNoiseSeed(slot.hasNoiseSeed ? slot.noiseSeed : 0x12345678u);
        slot.hasNoiseSeed = true;
        sample = seedToBipolar(slot.noiseSeed);
      }
      break;
    }
    default:
      sample = 1.0 - phaseCycle * 2.0 + polyBlep(phaseCycle, renderIncrement);
      break;
  }
  if (!phaseStopped) {
    slot.lastPhaseIncrement = phaseDelta;
  }
  return sample;
}

}  // namespace

extern "C" int soemdsp_polyblep_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = PolyBlepState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_polyblep_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_polyblep_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].slots[0].triangleIntegrator = 0.0;
}

extern "C" void soemdsp_polyblep_sample(
  int handle,
  double phase,
  double phaseIncrement,
  int waveform,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  PolyBlepState& s = gPool[handle - 1];
  const int safeWaveform = waveform < 0 ? 0 : (waveform > 5 ? 5 : waveform);
  const double selected = oscillatorSample(s.slots[0], phase, phaseIncrement, safeWaveform) * level;
  s.saw    = oscillatorSample(s.slots[1], phase, phaseIncrement, 0) * level;
  s.ramp   = oscillatorSample(s.slots[2], phase, phaseIncrement, 1) * level;
  s.square = oscillatorSample(s.slots[3], phase, phaseIncrement, 2) * level;
  s.tri    = oscillatorSample(s.slots[4], phase, phaseIncrement, 3) * level;
  s.sine   = oscillatorSample(s.slots[5], phase, phaseIncrement, 4) * level;
  s.out = selected;
}

extern "C" double soemdsp_polyblep_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" double soemdsp_polyblep_saw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].saw;
}

extern "C" double soemdsp_polyblep_ramp(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].ramp;
}

extern "C" double soemdsp_polyblep_square(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].square;
}

extern "C" double soemdsp_polyblep_tri(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].tri;
}

extern "C" double soemdsp_polyblep_sine(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].sine;
}

extern "C" int soemdsp_polyblep_version() {
  return 2;
}
