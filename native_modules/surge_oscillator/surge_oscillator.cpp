// soemdsp-native-module: surge_oscillator
// soemdsp-native-label: Surge Oscillator
// soemdsp-native-target: surgeOscillator
// soemdsp-native-kind: oscillator

// Design notes (the "aliasing wars" mission):
//
// A hard-sync oscillator forces its own phase back to 0 every time a master
// signal crosses zero going up. That forced reset is a phase (and usually
// amplitude) discontinuity injected in the middle of a waveform, and a naive
// implementation aliases badly -- the classic harsh, digital "zipper" buzz
// under a sync sweep.
//
// The fix used here is the same PolyBLEP correction this sandbox's plain
// polyblep.cpp module already uses for ordinary cycle wraps, generalized to
// ALSO run at a sync-triggered reset: from the waveform functions' point of
// view, a natural wrap-to-0 and a forced sync-reset-to-0 are the same kind of
// event (phaseCycle lands near 0), so reusing the exact same
// polyBlep/polyBlepSquare/triangle-integrator functions means every reset --
// natural or sync-forced -- gets band-limited for free, without a second,
// sync-specific correction path to get wrong.
//
// On top of that, this module estimates *sub-sample* sync timing: instead of
// always resetting phase to exactly 0 (which would place every sync reset at
// the start of a sample, quantizing sync timing to the sample rate and adding
// its own jitter/aliasing at high sync ratios), it linearly interpolates the
// zero-crossing time of the sync input within the current sample and resets
// phase to `frac * phaseIncrement` -- how far the new cycle would already
// have progressed had the reset happened at its true, sub-sample instant.
// This is the same idea Surge and other analog-modeling synths use for
// sync-aware oscillators, at a scope appropriate for a sandbox module.
//
// Built-in sync source: patching an external master oscillator into Sync
// works, but most hard-sync sweeps just want "a second frequency knob" --
// this module owns its own internal master oscillator (a plain sine, since
// it's a control signal for edge detection, not audible output, so it
// doesn't need PolyBLEP) with its own 0-20000 Hz range. When nothing is
// patched into the Sync input, the internal oscillator's zero-crossings
// drive the exact same sub-sample-interpolated reset path external Sync
// audio would. Patching something into Sync still overrides it -- the
// internal oscillator is a convenience default, not a second mandatory step.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 16;

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

// waveform: 0 = saw, 1 = square, 2 = triangle, 3 = sine
struct WaveformState {
  double triangleIntegrator;
};

double waveformSample(WaveformState& w, double phaseCycle, double phaseIncrement, int waveform) {
  switch (waveform) {
    case 1:
      return polyBlepSquare(phaseCycle, phaseIncrement);
    case 2: {
      double next = (w.triangleIntegrator + polyBlepSquare(phaseCycle, phaseIncrement) * phaseIncrement * 4.0) * 0.995;
      next = clampD(next, -1.0, 1.0);
      w.triangleIntegrator = next;
      return next;
    }
    case 3:
      return sinApprox(phaseCycle * kTwoPi);
    default:
      return -1.0 + phaseCycle * 2.0 - polyBlep(phaseCycle, phaseIncrement);
  }
}

struct SurgeOscillatorState {
  bool active;
  double phase;            // 0..1, this oscillator's own accumulator
  double phaseIncrement;   // last computed increment, for stopped-phase caching
  double prevSyncIn;       // previous sample's *effective* sync input, for edge detection
  bool hasPrevSyncIn;
  bool syncedThisSample;
  double masterPhase;      // 0..1, the built-in internal sync oscillator's own accumulator
  WaveformState taps[4];   // saw, square, tri, sine -- always-on outputs
  double out;
  double sawOut;
  double squareOut;
  double triOut;
  double sineOut;
  double internalSyncOut;  // the built-in master oscillator's raw sine, for inspection
};

static SurgeOscillatorState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_surge_oscillator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = SurgeOscillatorState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_surge_oscillator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_surge_oscillator_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  SurgeOscillatorState& s = gPool[handle - 1];
  s.phase = 0.0;
  s.masterPhase = 0.0;
  s.hasPrevSyncIn = false;
  for (int i = 0; i < 4; i++) s.taps[i] = WaveformState{};
}

// frequencyHz: this oscillator's own free-running pitch.
// sampleRate: audio sample rate in Hz (needed to turn frequency into a phase
//   increment; the oscillator owns its phase, unlike polyblep.cpp which is
//   phase-driven from outside).
// syncIn: an audio-rate signal (typically another oscillator's raw output).
//   Used only when hasExternalSync is nonzero.
// hasExternalSync: nonzero when something is patched into the Sync input.
//   When zero, the built-in internal master oscillator (syncFrequencyHz)
//   drives sync instead -- a self-contained hard-sync sweep with no patching
//   required.
// syncFrequencyHz: the internal master oscillator's frequency (0-20000 Hz,
//   same range as the audible frequency). Ignored when hasExternalSync is set.
// A rising zero-crossing of whichever signal is effective (previous sample
//   <= 0, current sample > 0) forces this oscillator's phase back toward 0,
//   sub-sample-interpolated.
// waveform: selects which of the 4 always-computed taps becomes `out`.
extern "C" void soemdsp_surge_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double syncIn,
  int hasExternalSync,
  double syncFrequencyHz,
  int waveform,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SurgeOscillatorState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double increment = clampD(frequencyHz / safeSampleRate, -0.5, 0.5);
  s.phaseIncrement = increment;

  s.phase = wrap01(s.phase + increment);
  s.syncedThisSample = false;

  const double masterIncrement = clampD(syncFrequencyHz / safeSampleRate, -0.5, 0.5);
  s.masterPhase = wrap01(s.masterPhase + masterIncrement);
  s.internalSyncOut = sinApprox(s.masterPhase * kTwoPi);

  const double effectiveSyncIn = hasExternalSync ? syncIn : s.internalSyncOut;

  if (s.hasPrevSyncIn && s.prevSyncIn <= 0.0 && effectiveSyncIn > 0.0) {
    const double denom = effectiveSyncIn - s.prevSyncIn;
    const double frac = denom > 1.0e-9 ? clampD(-s.prevSyncIn / denom, 0.0, 1.0) : 0.0;
    // frac is "how far into this sample" the true zero-crossing happened;
    // (1 - frac) of the sample's phase increment has already elapsed since
    // the sync instant, so the new cycle starts that far in, not at exactly 0.
    s.phase = wrap01((1.0 - frac) * increment);
    s.syncedThisSample = true;
  }
  s.prevSyncIn = effectiveSyncIn;
  s.hasPrevSyncIn = true;

  const double phaseCycle = s.phase;
  s.sawOut    = waveformSample(s.taps[0], phaseCycle, increment, 0) * level;
  s.squareOut = waveformSample(s.taps[1], phaseCycle, increment, 1) * level;
  s.triOut    = waveformSample(s.taps[2], phaseCycle, increment, 2) * level;
  s.sineOut   = waveformSample(s.taps[3], phaseCycle, increment, 3) * level;

  const int safeWaveform = waveform < 0 ? 0 : (waveform > 3 ? 3 : waveform);
  switch (safeWaveform) {
    case 1: s.out = s.squareOut; break;
    case 2: s.out = s.triOut; break;
    case 3: s.out = s.sineOut; break;
    default: s.out = s.sawOut; break;
  }
}

extern "C" double soemdsp_surge_oscillator_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" double soemdsp_surge_oscillator_saw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].sawOut;
}

extern "C" double soemdsp_surge_oscillator_square(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].squareOut;
}

extern "C" double soemdsp_surge_oscillator_tri(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].triOut;
}

extern "C" double soemdsp_surge_oscillator_sine(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].sineOut;
}

extern "C" double soemdsp_surge_oscillator_synced(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].syncedThisSample ? 1.0 : 0.0;
}

extern "C" double soemdsp_surge_oscillator_internal_sync(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].internalSyncOut;
}

extern "C" int soemdsp_surge_oscillator_version() {
  return 1;
}
