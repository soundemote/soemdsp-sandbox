// soemdsp-native-module: sample_hold
// soemdsp-native-label: Sample & Hold
// soemdsp-native-target: sampleHold
// soemdsp-native-kind: utility
//
// Latches its input whenever the Clock input crosses above threshold
// (rising edge), or on every internal-clock tick if sampleFrequency > 0.
// When hasInConnected==0, the latch samples seeded LCG bipolar noise
// (same LCG as noise_generator). Graph engine runs three handles per node:
// Ext (external hold), Left + Right (independent internal noise).
// phaseOffset (cycles, mod 1) desyncs that lane's Sample Freq / Clock fires
// vs offset 0: 0 and 1 fire together, 0.5 is halfway. Interpolate 0/1/2 =
// Off / Linear / Smoothstep glide over the clock period.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 192;

struct SampleHoldState {
  bool active;
  double clockPhase;
  double held;
  double from;
  double out;
  double samplesInSegment;
  double segmentSamples;
  double lastIntervalSamples;
  double samplesSinceFire;
  double lastTrigger;
  int pendingFireSamples; // Clock-edge delay for phaseOffset (>0 counting down)
  unsigned int noiseSeed;
  int currentSeed;
};

static SampleHoldState gPool[kMaxInstances];

static unsigned int lcg_next(unsigned int& seed) {
  seed = 1664525U * seed + 1013904223U;
  return seed;
}

static double next_bipolar(unsigned int& seed) {
  return (double)lcg_next(seed) / (double)0xffffffffU * 2.0 - 1.0;
}

static double smoothstep01(double t) {
  const double x = t <= 0.0 ? 0.0 : (t >= 1.0 ? 1.0 : t);
  return x * x * (3.0 - 2.0 * x);
}

}  // namespace

extern "C" int soemdsp_sample_hold_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SampleHoldState& s = gPool[i];
      s.clockPhase = 0.0;
      s.held = 0.0;
      s.from = 0.0;
      s.out = 0.0;
      s.samplesInSegment = 0.0;
      s.segmentSamples = 1.0;
      s.lastIntervalSamples = 0.0;
      s.samplesSinceFire = 0.0;
      s.lastTrigger = 0.0;
      s.pendingFireSamples = 0;
      s.noiseSeed = 1U;
      s.currentSeed = 0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sample_hold_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_sample_hold_sample(
  int    handle,
  double input,
  double trigger,
  double threshold,
  double sampleFrequency,
  double sampleRate,
  int    hasInConnected,
  int    seed,
  double amplitude,
  double polarityMode,
  double interpolateMode,
  double phaseOffset
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SampleHoldState& s = gPool[handle - 1];

  if (seed != s.currentSeed) {
    s.currentSeed = seed;
    s.noiseSeed = (unsigned int)seed;
    if (s.noiseSeed == 0U) s.noiseSeed = 1U;
  }

  const double safeInput = hasInConnected != 0 ? safe(input) : next_bipolar(s.noiseSeed);
  const double safeTrigger = safe(trigger);
  const double safeThreshold = safe(threshold);
  const double safeFreq = maxd(0.0, safe(sampleFrequency));
  const double safeRate = maxd(1.0, safe(sampleRate));
  const double amp = safe(amplitude);
  const bool unipolar = polarityMode >= 0.5;
  int interp = (int)(safe(interpolateMode) + (safe(interpolateMode) >= 0.0 ? 0.5 : -0.5));
  if (interp < 0) interp = 0;
  if (interp > 2) interp = 2;
  const double offset = wrap01(safe(phaseOffset));

  bool internalFire = false;
  if (safeFreq > 0.0) {
    const double prev = s.clockPhase;
    s.clockPhase += safeFreq / safeRate;
    bool wrapped = false;
    if (s.clockPhase >= 1.0) {
      s.clockPhase -= dsp_floor(s.clockPhase);
      wrapped = true;
    }
    // Fire when free-running phase crosses `offset` (0/1 ≡ wrap).
    if (offset <= 1.0e-12 || offset >= 1.0 - 1.0e-12) {
      internalFire = wrapped;
    } else if (wrapped) {
      internalFire = (prev < offset) || (s.clockPhase >= offset);
    } else {
      internalFire = (prev < offset && s.clockPhase >= offset);
    }
  }

  const bool risingEdge = s.lastTrigger <= safeThreshold && safeTrigger > safeThreshold;
  bool fire = internalFire;

  if (risingEdge) {
    // Ext/Left (offset≈0) fire with Clock; Right delays by offset·period.
    if (offset <= 1.0e-12 || offset >= 1.0 - 1.0e-12) {
      fire = true;
      s.pendingFireSamples = 0;
    } else {
      const double period = safeFreq > 0.0
        ? (safeRate / safeFreq)
        : maxd(1.0, s.lastIntervalSamples > 0.0 ? s.lastIntervalSamples : (safeRate / 10.0));
      int delay = (int)(offset * period + 0.5);
      if (delay < 1) {
        fire = true;
        s.pendingFireSamples = 0;
      } else {
        s.pendingFireSamples = delay;
      }
    }
  }

  if (s.pendingFireSamples > 0) {
    s.pendingFireSamples -= 1;
    if (s.pendingFireSamples <= 0) {
      s.pendingFireSamples = 0;
      fire = true;
    }
  }

  s.samplesSinceFire = safe(s.samplesSinceFire) + 1.0;

  if (fire) {
    const double interval = maxd(1.0, safe(s.samplesSinceFire));
    s.lastIntervalSamples = interval;
    s.samplesSinceFire = 0.0;
    const double seg = safeFreq > 0.0
      ? maxd(1.0, (double)((int)(safeRate / safeFreq + 0.5)))
      : maxd(1.0, safe(s.lastIntervalSamples));
    s.segmentSamples = seg;
    s.samplesInSegment = 0.0;
    s.from = safe(s.out);
    s.held = safeInput;
    if (interp == 0) {
      s.out = safeInput;
      s.from = safeInput;
    }
  }

  s.lastTrigger = safeTrigger;

  double out;
  if (interp == 0) {
    s.out = safe(s.held);
    out = s.out;
  } else {
    s.samplesInSegment = safe(s.samplesInSegment) + 1.0;
    const double seg = maxd(1.0, safe(s.segmentSamples));
    double t = s.samplesInSegment / seg;
    if (t > 1.0) t = 1.0;
    if (interp == 2) t = smoothstep01(t);
    out = safe(s.from) + (safe(s.held) - safe(s.from)) * t;
    s.out = out;
  }

  if (unipolar) out = (out + 1.0) * 0.5;
  return safe(out * amp);
}

extern "C" int soemdsp_sample_hold_version() {
  return 3; // interpolate + phaseOffset; glide state
}