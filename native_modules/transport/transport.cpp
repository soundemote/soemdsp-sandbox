// soemdsp-native-module: transport
// soemdsp-native-label: Transport
// soemdsp-native-target: transport
// soemdsp-native-kind: utility
//
// A tempo-synced square-wave clock: frequency = (tempoBpm / 60) * a
// divisions-derived multiplier (divisions > 0 multiplies the base tempo,
// divisions < 0 divides it, 0 leaves it at the base tempo), phase
// accumulated incrementally per sample (matching the realtime worklet's
// stateful algorithm -- this codebase's offline/render-time evaluator for
// this module recomputes phase directly from the absolute frame instead
// and stays pure JS, same as every other module's split between a native-
// backed realtime path and a JS-only offline path).
//
// Main _sample() call returns the "-1..1" bipolar output; the "0..1"
// unipolar output is read via soemdsp_transport_unipolar() afterward,
// following this codebase's established pattern for native modules with
// more than one output (compare soemdsp_comparator_inv_gate, etc.).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TransportState {
  bool active;
  double phase;
  double lastUnipolar;
};

static TransportState gPool[kMaxInstances];

// Matches JS's Math.round(x), which the ECMAScript spec defines as
// floor(x + 0.5) for all finite x (so -2.5 rounds to -2, toward +Infinity,
// not -3).
static double transport_division_factor(double divisions) {
  const double division = dsp_floor(divisions + 0.5);
  if (division > 0.0) {
    return division + 1.0;
  }
  if (division < 0.0) {
    return 1.0 / (dsp_fabs(division) + 1.0);
  }
  return 1.0;
}

}  // namespace

extern "C" int soemdsp_transport_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TransportState& s = gPool[i];
      s.phase = 0.0;
      s.lastUnipolar = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_transport_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_transport_sample(
  int    handle,
  double amplitude,
  double divisions,
  double tempoBpm,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TransportState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double safeTempo = maxd(1.0, safe(tempoBpm));
  const double divisionFactor = transport_division_factor(safe(divisions));
  const double frequency = (safeTempo / 60.0) * divisionFactor;
  const double safeAmplitude = clamp(safe(amplitude), 0.0, 1.0);

  if (frequency > 0.0) {
    double nextPhase = s.phase + frequency / rate;
    s.phase = nextPhase - dsp_floor(nextPhase);
  }

  const bool high = s.phase < 0.5;
  const double bipolar = high ? safeAmplitude : -safeAmplitude;
  s.lastUnipolar = high ? safeAmplitude : 0.0;
  return bipolar;
}

extern "C" double soemdsp_transport_unipolar(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastUnipolar;
}

extern "C" int soemdsp_transport_version() {
  return 1;
}
