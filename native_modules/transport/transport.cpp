// soemdsp-native-module: transport
// soemdsp-native-label: Metronome
// soemdsp-native-target: transport
// soemdsp-native-kind: utility
//
// Per-clock playhead lock: phase = ((master − t0) / sr) × f(BPM, Numer, Denom).
// Reset sets t0 = now. BPM is this node only. Hardcoded hi/lo clicks.

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include "click_hi_pcm.h"
#include "click_lo_pcm.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TransportState {
  bool active;
  double t0;
  double phase;
  double lastUnipolar;
  double lastFrequencyHz;
  int lastWholeBeat;
  int clickKind; // 0 idle, 1 hi, 2 lo
  double clickPos;
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

static void fire_click(TransportState& s, int kind) {
  s.clickKind = kind;
  s.clickPos = 0.0;
}

static double read_click(TransportState& s, double sampleRate) {
  if (s.clickKind <= 0) return 0.0;
  const float* pcm = (s.clickKind == 1) ? kClickHiPcm : kClickLoPcm;
  const int frames = (s.clickKind == 1) ? kClickHiFrames : kClickLoFrames;
  const int srcRate = (s.clickKind == 1) ? kClickHiRate : kClickLoRate;
  if (frames <= 0) return 0.0;
  const double pos = s.clickPos;
  const int i0 = (int)pos;
  if (i0 >= frames) {
    s.clickKind = 0;
    s.clickPos = 0.0;
    return 0.0;
  }
  const int i1 = i0 + 1 < frames ? i0 + 1 : i0;
  const double frac = pos - (double)i0;
  const double y = (double)pcm[i0] * (1.0 - frac) + (double)pcm[i1] * frac;
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  s.clickPos += (srcRate > 0 ? ((double)srcRate / rate) : 1.0);
  if (s.clickPos >= (double)frames) {
    s.clickKind = 0;
    s.clickPos = 0.0;
  }
  return y;
}

}  // namespace

extern "C" int soemdsp_transport_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TransportState& s = gPool[i];
      s.t0 = 0.0;
      s.phase = 0.0;
      s.lastUnipolar = 0.0;
      s.lastFrequencyHz = 0.0;
      s.lastWholeBeat = -1;
      s.clickKind = 0;
      s.clickPos = 0.0;
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

extern "C" void soemdsp_transport_reset(int handle, double masterSample) {
  if (handle < 1 || handle > kMaxInstances) return;
  TransportState& s = gPool[handle - 1];
  s.t0 = masterSample > 0.0 ? masterSample : 0.0;
  s.phase = 0.0;
  s.lastWholeBeat = -1;
}

extern "C" double soemdsp_transport_sample(
  int    handle,
  double amplitude,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double tempoBpm,
  double pulseWidth,
  double beats,
  double sampleRate,
  double masterSample
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

  int barBeats = (int)(safe(beats) + 0.5);
  if (barBeats < 1) barBeats = 1;

  if (frequency > 0.0 && rate > 0.0) {
    const double t = (masterSample > s.t0) ? (masterSample - s.t0) : 0.0;
    const double cycles = (t / rate) * frequency;
    s.phase = cycles - dsp_floor(cycles);
    const int whole = (int)dsp_floor(cycles);
    if (whole != s.lastWholeBeat && whole >= 0) {
      const int beatInBar = barBeats > 0 ? (whole % barBeats) : 0;
      fire_click(s, beatInBar == 0 ? 1 : 2);
      s.lastWholeBeat = whole;
    }
  } else {
    s.phase = 0.0;
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

extern "C" double soemdsp_transport_click(int handle, double sampleRate) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return read_click(gPool[handle - 1], sampleRate);
}

extern "C" int soemdsp_transport_version() {
  return 9; // metronome: per-clock t0, reset, hi/lo clicks
}
