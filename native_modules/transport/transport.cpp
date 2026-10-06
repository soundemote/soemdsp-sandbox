// soemdsp-native-module: transport
// soemdsp-native-label: Metronome
// soemdsp-native-target: transport
// soemdsp-native-kind: utility
//
// Metronome. f = f(BPM, Numer, Denom, Sync). Hardcoded hi/lo clicks.
// Mode Sync (1, default): cycles = anchorCycles + ((master − anchorSample)/sr) × f.
//   A change of f re-anchors at the current sample, so the cycle count stays
//   continuous and the new f only changes speed from there on. Metronomes with
//   the same BPM history and Reset stay on the same beats.
// Mode Free (0): per-instance phase accumulator, phase += f/sr each sample,
//   whole beats carried. Independent of the master playhead.
// Reset zeroes both (sync anchor = now, free phase = 0).

#include <soemdsp/soemdsp.hpp>

#include "click_hi_pcm.h"
#include "click_lo_pcm.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct TransportState {
  bool active;
  bool anchored; // false until the first sample sets the master-origin grid
  // Sync grid (tracked in both modes so Free → Sync snaps back onto it).
  double anchorSample;
  double anchorCycles;
  double anchorFrequencyHz;
  // Free accumulator.
  double freePhase;
  long long freeBeat;
  int lastMode; // -1 = none yet
  double phase;
  double lastUnipolar;
  double lastFrequencyHz;
  long long lastWholeBeat;
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

// Sync cycle count at masterSample on the current anchor.
static double transport_sync_cycles(const TransportState& s, double masterSample, double rate) {
  const double t = masterSample - s.anchorSample;
  return s.anchorCycles + (t / rate) * s.anchorFrequencyHz;
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
      s.anchored = false;
      s.anchorSample = 0.0;
      s.anchorCycles = 0.0;
      s.anchorFrequencyHz = 0.0;
      s.freePhase = 0.0;
      s.freeBeat = 0;
      s.lastMode = -1;
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
  s.anchored = true;
  s.anchorSample = masterSample > 0.0 ? masterSample : 0.0;
  s.anchorCycles = 0.0;
  s.freePhase = 0.0;
  s.freeBeat = 0;
  s.phase = 0.0;
  s.lastWholeBeat = -1;
}

// mode: 0 = Free, 1 = Sync (rounded).
extern "C" double soemdsp_transport_sample(
  int    handle,
  double amplitude,
  double timeNumerator,
  double timeDenominator,
  double timingMode,
  double tempoBpm,
  double pulseWidth,
  double beats,
  double mode,
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
  const int freeRun = dsp_floor(safe(mode) + 0.5) == 0.0 ? 1 : 0;
  s.lastFrequencyHz = frequency;

  int barBeats = (int)(safe(beats) + 0.5);
  if (barBeats < 1) barBeats = 1;

  // First sample: grid starts at the master origin (unreset metronomes with
  // equal BPM share beats). Master moved back before the anchor (rewind /
  // host relocate): re-grid onto the master origin instead of stalling.
  if (!s.anchored || masterSample < s.anchorSample) {
    s.anchored = true;
    s.anchorSample = 0.0;
    s.anchorCycles = 0.0;
    s.anchorFrequencyHz = frequency;
  }
  // f changed: re-anchor so the sync cycle count stays continuous.
  if (frequency != s.anchorFrequencyHz) {
    s.anchorCycles = transport_sync_cycles(s, masterSample, rate);
    s.anchorSample = masterSample;
    s.anchorFrequencyHz = frequency;
  }
  const double syncCycles = transport_sync_cycles(s, masterSample, rate);

  const int previousMode = s.lastMode;
  s.lastMode = freeRun ? 0 : 1;
  if (freeRun && previousMode != 0) {
    // Enter Free from the current sync position (no jump).
    const double whole = dsp_floor(syncCycles);
    s.freeBeat = (long long)whole;
    s.freePhase = syncCycles - whole;
  }

  long long whole = 0;
  if (freeRun) {
    whole = s.freeBeat;
    s.phase = s.freePhase;
  } else {
    const double w = dsp_floor(syncCycles);
    whole = (long long)w;
    s.phase = syncCycles - w;
    if (previousMode == 0) {
      // Free → Sync snaps onto the sync grid; no click for the snap itself.
      s.lastWholeBeat = whole;
    }
  }

  if (frequency > 0.0) {
    if (whole != s.lastWholeBeat && whole >= 0) {
      const long long beatInBar = whole % (long long)barBeats;
      fire_click(s, beatInBar == 0 ? 1 : 2);
      s.lastWholeBeat = whole;
    }
  } else {
    s.phase = 0.0;
  }

  if (freeRun) {
    // Advance for the next sample; carry whole beats.
    s.freePhase += frequency / rate;
    if (s.freePhase >= 1.0) {
      const double carry = dsp_floor(s.freePhase);
      s.freePhase -= carry;
      s.freeBeat += (long long)carry;
    }
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
  return 10; // metronome: Sync (continuous re-anchor) / Free accumulator
}
