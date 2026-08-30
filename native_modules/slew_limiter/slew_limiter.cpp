// soemdsp-native-module: slew_limiter
// soemdsp-native-label: Slew Limiter
// soemdsp-native-target: slewLimiter
// soemdsp-native-kind: utility
//
// Stereo rate limiter (independent Mono / Left / Right). Times are seconds
// for a full-scale (±1) move. Shape: 0 Lin / 1 Log / 2 Exp / 3 Smooth.
// Bias is added to the input before slewing. First sample snaps to target.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxBlockFrames = 128;
static const double kCurveK = 3.5;
static const int kShapeLin = 0;
static const int kShapeLog = 1;
static const int kShapeExp = 2;
static const int kShapeSmooth = 3;

struct SlewChan {
  bool initialized;
  bool active;
  bool rising;
  double from;
  double out;
};

struct SlewLimiterState {
  bool active;
  SlewChan mono;
  SlewChan left;
  SlewChan right;
  double blockInMono[kMaxBlockFrames];
  double blockInLeft[kMaxBlockFrames];
  double blockInRight[kMaxBlockFrames];
  double blockOutMono[kMaxBlockFrames];
  double blockOutLeft[kMaxBlockFrames];
  double blockOutRight[kMaxBlockFrames];
};

static SlewLimiterState gPool[kMaxInstances];

static void resetChan(SlewChan& c) {
  c.initialized = false;
  c.active = false;
  c.rising = true;
  c.from = 0.0;
  c.out = 0.0;
}

static int normShape(double shape) {
  int n = (int)(safe(shape) + (safe(shape) >= 0.0 ? 0.5 : -0.5));
  if (n < kShapeLin) n = kShapeLin;
  if (n > kShapeSmooth) n = kShapeSmooth;
  return n;
}

static double powPos(double base, double expv) {
  if (base <= 0.0) return 0.0;
  return dsp_exp(expv * dsp_ln(base));
}

// acos on [-1,1] via atan identity (no libm).
static double acosUnit(double x) {
  double v = clamp(x, -1.0, 1.0);
  // acos(x) = atan(sqrt(1-x^2)/x) with quadrant fix — use asin-like poly:
  // For Smooth invert only need acos on [-1,1]; use:
  // acos(x) ≈ π/2 - asin(x), asin approx (Abramowitz).
  const double a = dsp_fabs(v);
  const double t = ((-0.0187293 * a + 0.0742610) * a - 0.2121144) * a + 1.5707288;
  const double s = t * dsp_exp(0.5 * dsp_ln(maxd(1e-30, 1.0 - a)));
  return v >= 0.0 ? s : (kPi - s);
}

static double applyShape(double t, int shape) {
  const double x = t <= 0.0 ? 0.0 : (t >= 1.0 ? 1.0 : t);
  if (shape == kShapeLog) return 1.0 - powPos(1.0 - x, kCurveK);
  if (shape == kShapeExp) return powPos(x, kCurveK);
  if (shape == kShapeSmooth) return 0.5 - 0.5 * dsp_cos(kPi * x);
  return x;
}

static double invertShape(double u, int shape) {
  const double y = u <= 0.0 ? 0.0 : (u >= 1.0 ? 1.0 : u);
  if (shape == kShapeLog) return 1.0 - powPos(1.0 - y, 1.0 / kCurveK);
  if (shape == kShapeExp) return powPos(y, 1.0 / kCurveK);
  if (shape == kShapeSmooth) return acosUnit(1.0 - 2.0 * y) / kPi;
  return y;
}

static double chanSample(
  SlewChan& s,
  double input,
  double upTime,
  double downTime,
  double sampleRate,
  int shape
) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double target = safe(input);
  if (!s.initialized) {
    s.initialized = true;
    s.active = false;
    s.from = target;
    s.out = target;
    s.rising = true;
    return target;
  }

  const double upSeconds = maxd(0.0, safe(upTime));
  const double downSeconds = maxd(0.0, safe(downTime));
  const double delta = target - s.out;
  const bool rising = delta >= 0.0;
  const double seconds = rising ? upSeconds : downSeconds;
  if (seconds <= 0.0) {
    s.active = false;
    s.from = target;
    s.out = target;
    s.rising = rising;
    return target;
  }

  if (shape == kShapeLin) {
    const double maxStep = 1.0 / maxd(1.0, seconds * rate);
    s.out = s.out + maxd(-maxStep, mind(maxStep, delta));
    s.active = dsp_fabs(target - s.out) > 1e-12;
    s.rising = rising;
    if (!s.active) s.from = s.out;
    return s.out;
  }

  if (!s.active || rising != s.rising) {
    s.from = s.out;
    s.rising = rising;
    s.active = true;
  }
  const double span = target - s.from;
  if (!(span * 0.0 == 0.0) || dsp_fabs(span) < 1e-12) {
    s.active = false;
    s.from = target;
    s.out = target;
    return target;
  }

  double u = (s.out - s.from) / span;
  if (!(u * 0.0 == 0.0)) u = 0.0;
  if (u < 0.0) u = 0.0;
  if (u > 1.0) u = 1.0;
  double t = invertShape(u, shape);
  const double dt = 1.0 / maxd(1.0, seconds * rate);
  t = t + dt;
  if (t >= 1.0) {
    s.active = false;
    s.from = target;
    s.out = target;
    return target;
  }
  s.out = s.from + span * applyShape(t, shape);
  return s.out;
}

}  // namespace

extern "C" int soemdsp_slew_limiter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      SlewLimiterState& s = gPool[i];
      s = SlewLimiterState{};
      resetChan(s.mono);
      resetChan(s.left);
      resetChan(s.right);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_slew_limiter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Legacy single-channel sample (mono path). Shape defaults to Lin; bias=0.
extern "C" double soemdsp_slew_limiter_sample(
  int handle,
  double input,
  double upTime,
  double downTime,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return chanSample(gPool[handle - 1].mono, input, upTime, downTime, sampleRate, kShapeLin);
}

extern "C" void soemdsp_slew_limiter_process_block(
  int handle,
  double upTime,
  double downTime,
  double shape,
  double bias,
  double sampleRate,
  int frameCount
) {
  if (handle < 1 || handle > kMaxInstances) return;
  SlewLimiterState& s = gPool[handle - 1];
  const int n = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  const int mode = normShape(shape);
  const double off = safe(bias);
  for (int f = 0; f < n; f++) {
    s.blockOutMono[f] = chanSample(
      s.mono, s.blockInMono[f] + off, upTime, downTime, sampleRate, mode
    );
    s.blockOutLeft[f] = chanSample(
      s.left, s.blockInLeft[f] + off, upTime, downTime, sampleRate, mode
    );
    s.blockOutRight[f] = chanSample(
      s.right, s.blockInRight[f] + off, upTime, downTime, sampleRate, mode
    );
  }
}

extern "C" int soemdsp_slew_limiter_block_input_mono_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockInMono);
}
extern "C" int soemdsp_slew_limiter_block_input_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockInLeft);
}
extern "C" int soemdsp_slew_limiter_block_input_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockInRight);
}
extern "C" int soemdsp_slew_limiter_block_output_mono_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutMono);
}
extern "C" int soemdsp_slew_limiter_block_output_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutLeft);
}
extern "C" int soemdsp_slew_limiter_block_output_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutRight);
}
extern "C" int soemdsp_slew_limiter_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_slew_limiter_version() {
  return 2; // stereo block + shape/bias
}
