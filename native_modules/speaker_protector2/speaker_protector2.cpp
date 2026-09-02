// soemdsp-native-module: speaker_protector2
// soemdsp-native-label: Speaker Protector 2.0
// soemdsp-native-target: speakerProtector2
// soemdsp-native-kind: dynamics
//
// Stereo-linked slew VCA + 1 kHz HP trip. Never clips or knees.
// Matches public/modules/speakerProtector2/speaker-protector-2-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const double kHpHz = 1000.0;
static const double kThreshold = 1.9952623149688795; // 10^(6/20)
static const double kDropDefault = 0.008;
static const double kHoldDefault = 0.333;
static const double kRiseDefault = 0.75;
static const double kPlanck = 1.0e-7;

enum Mode {
  kModeIdle = 0,
  kModeDrop = 1,
  kModeHold = 2,
  kModeRise = 3,
};

struct State {
  bool active;
  int mode;
  double gain;
  int holdSamples;
  double hpIn;
  double hpOut;
  double hpA1;
  double hpB0;
  double hpB1;
  double sampleRate;
};

static State gPool[kMaxInstances];

static bool is_finite(double x) {
  return (x * 0.0 == 0.0);
}

static void hp_coeffs(double sampleRate, double frequencyHz, double* a1, double* b0, double* b1) {
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double frequencyValue = frequencyHz < 0.0 ? 0.0 : frequencyHz;
  double w = ((2.0 * kPi) / rate);
  if (w > 0.000142475857) w = 0.000142475857;
  w *= frequencyValue;
  *a1 = dsp_exp(-w);
  *b0 = 0.5 * (1.0 + *a1);
  *b1 = -(*b0);
}

static void prepare(State& s, double sampleRate) {
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  if (s.sampleRate != rate) {
    s.sampleRate = rate;
    hp_coeffs(rate, kHpHz, &s.hpA1, &s.hpB0, &s.hpB1);
  }
}

static bool peak_danger(double peak) {
  return peak >= 1.0 + kPlanck;
}

static double slew_toward(double gain, double target, double seconds, double sampleRate) {
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double time = seconds < 0.0 ? 0.0 : seconds;
  if (time <= 0.0) return target;
  const double maxStep = 1.0 / (time * rate < 1.0 ? 1.0 : time * rate);
  const double delta = target - gain;
  if (dsp_fabs(delta) <= maxStep) return target;
  return gain + (delta < 0.0 ? -maxStep : maxStep);
}

}  // namespace

extern "C" int soemdsp_speaker_protector2_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.mode = kModeIdle;
      s.gain = 1.0;
      s.holdSamples = 0;
      s.hpIn = 0.0;
      s.hpOut = 0.0;
      s.sampleRate = 0.0;
      prepare(s, 44100.0);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_speaker_protector2_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Processes one stereo sample. Writes Out as (L+R)/2 into outMono.
// drop/hold/rise times in seconds (face params).
extern "C" void soemdsp_speaker_protector2_sample(
  int handle,
  double leftIn,
  double rightIn,
  double sampleRate,
  double dropSeconds,
  double holdSeconds,
  double riseSeconds,
  double* outLeft,
  double* outRight,
  double* outMono
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) {
    if (outLeft) *outLeft = 0.0;
    if (outRight) *outRight = 0.0;
    if (outMono) *outMono = 0.0;
    return;
  }
  State& st = gPool[handle - 1];
  prepare(st, sampleRate);
  const double rate = st.sampleRate;
  const double drop = (dropSeconds == dropSeconds && dropSeconds >= 0.0) ? dropSeconds : kDropDefault;
  const double hold = (holdSeconds == holdSeconds && holdSeconds >= 0.0) ? holdSeconds : kHoldDefault;
  const double rise = (riseSeconds == riseSeconds && riseSeconds >= 0.0) ? riseSeconds : kRiseDefault;

  const double lIn = leftIn;
  const double rIn = rightIn;
  const double l = is_finite(lIn) ? lIn : 0.0;
  const double r = is_finite(rIn) ? rIn : 0.0;
  const double peakAbsL = dsp_fabs(l);
  const double peakAbsR = dsp_fabs(r);
  const double peak = peakAbsL > peakAbsR ? peakAbsL : peakAbsR;
  const double mono = (l + r) * 0.5;
  st.hpOut = st.hpB0 * mono + st.hpB1 * st.hpIn + st.hpA1 * st.hpOut;
  st.hpIn = mono;
  const bool hpDanger = dsp_fabs(st.hpOut) >= kThreshold;
  const bool peakDanger = peak_danger(peak);
  const bool danger = hpDanger || peakDanger || !is_finite(lIn) || !is_finite(rIn);
  if (danger) {
    st.mode = kModeDrop;
    int hs = (int)(hold * rate + 0.5);
    if (hs < 1) hs = 1;
    st.holdSamples = hs;
  }

  if (st.mode == kModeDrop) {
    st.gain = slew_toward(st.gain, 0.0, drop, rate);
    if (st.gain <= 1.0e-4) {
      st.gain = 0.0;
      st.mode = kModeHold;
    }
  } else if (st.mode == kModeHold) {
    st.gain = 0.0;
    st.holdSamples -= 1;
    if (st.holdSamples <= 0) {
      st.mode = kModeRise;
    }
  } else if (st.mode == kModeRise) {
    st.gain = slew_toward(st.gain, 1.0, rise, rate);
    if (st.gain >= 1.0 - 1.0e-4) {
      st.gain = 1.0;
      st.mode = kModeIdle;
    }
  } else {
    st.gain = 1.0;
    st.mode = kModeIdle;
  }

  double g = st.gain;
  if (peak_danger(peak)) {
    const double ceiling = 1.0 / peak;
    if (ceiling < g) g = ceiling;
  }
  const double outL = l * g;
  const double outR = r * g;
  if (outLeft) *outLeft = outL;
  if (outRight) *outRight = outR;
  if (outMono) *outMono = (outL + outR) * 0.5;
}

extern "C" int soemdsp_speaker_protector2_version() {
  return 1;
}
