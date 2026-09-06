// soemdsp-native-module: transport
// soemdsp-native-label: Master Clock
// soemdsp-native-target: transport
// soemdsp-native-kind: utility
//
// Tempo-synced clock. Period = (240/BPM)×(Numer/Denom)×modeMult — same
// family as Ping Pong Delay (Normal / Dotted / Triplet). Defaults 1/4/Normal
// = one beat (matches old divisions=0). pulseWidth sets gate high duty.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TransportState {
  bool active;
  double phase;
  double lastUnipolar;
  double lastFrequencyHz;
};

static TransportState gPool[kMaxInstances];

static double transport_timing_mode_multiplier(double mode) {
  const double rounded = dsp_floor(safe(mode) + 0.5);
  if (rounded == 1.0) {
    return 1.5; // Dotted
  }
  if (rounded == 2.0) {
    return 2.0 / 3.0; // Triplet
  }
  return 1.0; // Normal
}

static double transport_note_fraction(double numerator, double denominator) {
  const double n = maxd(0.0, safe(numerator));
  if (n <= 0.0) {
    return 0.0;
  }
  const double d = maxd(1.0, dsp_floor(safe(denominator) + 0.5));
  return n / d;
}

static double transport_frequency_hz(
  double tempoBpm,
  double timeNumerator,
  double timeDenominator,
  double timingMode
) {
  const double bpm = maxd(1.0, safe(tempoBpm));
  const double secondsPerWholeNote = 240.0 / bpm;
  const double fraction = transport_note_fraction(timeNumerator, timeDenominator);
  if (fraction <= 0.0) {
    return 0.0;
  }
  const double periodSec = secondsPerWholeNote
    * fraction
    * transport_timing_mode_multiplier(timingMode);
  if (periodSec <= 0.0) {
    return 0.0;
  }
  return 1.0 / periodSec;
}

}  // namespace

extern "C" int soemdsp_transport_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TransportState& s = gPool[i];
      s.phase = 0.0;
      s.lastUnipolar = 0.0;
      s.lastFrequencyHz = 0.0;
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
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double tempoBpm,
  double pulseWidth,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TransportState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double frequency = transport_frequency_hz(
    tempoBpm, timeNumerator, timeDenominator, timingMode
  );
  const double safeAmplitude = clamp(safe(amplitude), 0.0, 1.0);
  const double pw = clamp(safe(pulseWidth), 0.01, 0.99);
  s.lastFrequencyHz = frequency;

  if (frequency > 0.0) {
    double nextPhase = s.phase + frequency / rate;
    s.phase = nextPhase - dsp_floor(nextPhase);
  }

  const bool high = s.phase < pw;
  const double bipolar = high ? safeAmplitude : -safeAmplitude;
  s.lastUnipolar = high ? safeAmplitude : 0.0;
  return bipolar;
}

extern "C" double soemdsp_transport_unipolar(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastUnipolar;
}

extern "C" double soemdsp_transport_frequency(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastFrequencyHz;
}

extern "C" int soemdsp_transport_version() {
  return 4; // Numer/Denom/Sync replaces divisions
}
