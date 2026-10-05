// soemdsp-native-module: speaker_protector2
// soemdsp-native-label: Speaker Protector 2.0
// soemdsp-native-target: speakerProtector2
// soemdsp-native-kind: dynamics
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/dynamics/EarProtector.hpp
//
// Stereo-linked slew VCA + 1 kHz HP trip. Never clips or knees.
// The only Speaker Protector 2.0 implementation: the patch module (opcode 135),
// the graph_engine Output bus ear protect, and the Render Sample Output pass
// (soemdsp_speaker_protector2_process_block) all run this code.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kHpHz = 1000.0;
static const double kThreshold = 1.9952623149688795; // 10^(6/20)
static const double kDropDefault = 0.008;
static const double kHoldDefault = 0.333;
static const double kRiseDefault = 0.375;
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
  double w = kTwoPi / rate;
  if (w > kTauOver44100) w = kTauOver44100;
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

// Output-sample trip test: non-finite, or |x| >= 1 + planck.
static bool sample_trips(double x) {
  if (!is_finite(x)) return true;
  return peak_danger(dsp_fabs(x));
}

// One stereo frame through the slew VCA. Returns the applied gain
// (state gain, capped at 1/peak while the peak is over unity).
static double protect_frame(
  State& st,
  double leftIn,
  double rightIn,
  double sampleRate,
  double dropSeconds,
  double holdSeconds,
  double riseSeconds,
  double* outLeft,
  double* outRight
) {
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
  *outLeft = l * g;
  *outRight = r * g;
  return g;
}

// Render Sample Output pass: host writes the bounce into these, runs
// process_block, reads the protected frames back.
static const int kMaxBlockFrames = 4096;
static double gBlockLeft[kMaxBlockFrames];
static double gBlockRight[kMaxBlockFrames];

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
  double outL = 0.0;
  double outR = 0.0;
  protect_frame(
    gPool[handle - 1], leftIn, rightIn, sampleRate,
    dropSeconds, holdSeconds, riseSeconds, &outL, &outR
  );
  if (outLeft) *outLeft = outL;
  if (outRight) *outRight = outR;
  if (outMono) *outMono = (outL + outR) * 0.5;
}

extern "C" double* soemdsp_speaker_protector2_block_left_ptr() {
  return gBlockLeft;
}

extern "C" double* soemdsp_speaker_protector2_block_right_ptr() {
  return gBlockRight;
}

extern "C" int soemdsp_speaker_protector2_max_block_frames() {
  return kMaxBlockFrames;
}

// Render Sample Output ear protect, in place over block_left/right_ptr.
// Default drop/hold/rise. sampleRate: non-finite -> 44100, below 1 -> 1.
// Returns the protection count for the block: +1 per frame where Left or
// Right trips (non-finite or |x| >= 1 + planck), +1 per frame whose applied
// gain is <= 1e-4 (muted). Bad handle: block is zeroed, returns 0.
extern "C" int soemdsp_speaker_protector2_process_block(int handle, int frames, double sampleRate) {
  int n = frames < 0 ? 0 : frames;
  if (n > kMaxBlockFrames) n = kMaxBlockFrames;
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) {
    for (int i = 0; i < n; i++) {
      gBlockLeft[i] = 0.0;
      gBlockRight[i] = 0.0;
    }
    return 0;
  }
  State& st = gPool[handle - 1];
  const double rate = is_finite(sampleRate) ? (sampleRate < 1.0 ? 1.0 : sampleRate) : 44100.0;
  int count = 0;
  for (int i = 0; i < n; i++) {
    const double l = gBlockLeft[i];
    const double r = gBlockRight[i];
    if (sample_trips(l) || sample_trips(r)) count += 1;
    double outL = 0.0;
    double outR = 0.0;
    const double g = protect_frame(
      st, l, r, rate, kDropDefault, kHoldDefault, kRiseDefault, &outL, &outR
    );
    if (g <= 1.0e-4) count += 1;
    gBlockLeft[i] = outL;
    gBlockRight[i] = outR;
  }
  return count;
}

extern "C" double soemdsp_speaker_protector2_gain(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 1.0;
  return gPool[handle - 1].gain;
}

extern "C" int soemdsp_speaker_protector2_version() {
  return 2;
}
