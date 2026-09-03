// soemdsp-native-module: phase_disperse
// soemdsp-native-label: Phase Disperse
// soemdsp-native-target: phaseDisperse
// soemdsp-native-kind: filter
//
// Cascaded identical RBJ allpass biquads (≤64). Matches
// public/modules/phaseDisperse/phase-disperse-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const int kMaxStages = 64;

struct Stage {
  double x1, x2, y1, y2;
};

struct PhaseDisperseState {
  bool active;
  Stage stages[kMaxStages];
  double lastF;
  double lastQ;
  double lastRate;
  double b0, b1, b2, a1, a2;
  bool hasCoeffs;
};

static PhaseDisperseState gPool[kMaxInstances];

static void clear_state(PhaseDisperseState& s) {
  for (int i = 0; i < kMaxStages; i++) {
    s.stages[i].x1 = 0.0;
    s.stages[i].x2 = 0.0;
    s.stages[i].y1 = 0.0;
    s.stages[i].y2 = 0.0;
  }
  s.lastF = -1.0;
  s.lastQ = -1.0;
  s.lastRate = -1.0;
  s.b0 = 1.0;
  s.b1 = 0.0;
  s.b2 = 0.0;
  s.a1 = 0.0;
  s.a2 = 0.0;
  s.hasCoeffs = false;
}

static void ensure_coeffs(PhaseDisperseState& s, double frequencyHz, double q, double sampleRate) {
  const double rate = maxd(1.0, safe(sampleRate));
  const double raw = safe(frequencyHz);
  const double f = clamp(raw, 0.0, rate * 0.49);
  const double safeQ = clamp(safe(q), 0.05, 40.0);

  if (s.hasCoeffs && s.lastF == f && s.lastQ == safeQ && s.lastRate == rate) {
    return;
  }
  s.lastF = f;
  s.lastQ = safeQ;
  s.lastRate = rate;

  const double w0 = (2.0 * kPi * f) / rate;
  const double cosw = dsp_cos(w0);
  const double sinw = dsp_sin(w0);
  const double alpha = sinw / (2.0 * safeQ);
  const double a0 = 1.0 + alpha;
  const double inv = a0 != 0.0 ? 1.0 / a0 : 1.0;
  s.b0 = (1.0 - alpha) * inv;
  s.b1 = (-2.0 * cosw) * inv;
  s.b2 = (1.0 + alpha) * inv;
  s.a1 = s.b1;
  s.a2 = s.b0;
  s.hasCoeffs = true;
}

static double process_stage(Stage& stage, double x, double b0, double b1, double b2, double a1, double a2) {
  double y = b0 * x + b1 * stage.x1 + b2 * stage.x2 - a1 * stage.y1 - a2 * stage.y2;
  stage.x2 = stage.x1;
  stage.x1 = x;
  stage.y2 = stage.y1;
  if (!(y * 0.0 == 0.0)) y = 0.0;
  if (y > -1e-30 && y < 1e-30) y = 0.0;
  stage.y1 = y;
  return y;
}

// Absolute stage counts in [1, MAX]; (0,1) is legacy Amount → 1…MAX.
static double resolve_stage_count(double filtersOrAmount) {
  const double n = safe(filtersOrAmount);
  if (!(n * 0.0 == 0.0)) return 1.0;
  if (n > 0.0 && n < 1.0) {
    return 1.0 + n * (double)(kMaxStages - 1);
  }
  return clamp(n, 1.0, (double)kMaxStages);
}

}  // namespace

extern "C" int soemdsp_phase_disperse_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      clear_state(gPool[i]);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_phase_disperse_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_phase_disperse_sample(
  int handle,
  double input,
  double freqHz,
  double stages,
  double qOrPinch,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PhaseDisperseState& s = gPool[handle - 1];
  if (!s.active) return 0.0;

  ensure_coeffs(s, freqHz, qOrPinch, sampleRate);

  const double stageCount = resolve_stage_count(stages);
  int full = (int)stageCount;
  if (full < 0) full = 0;
  if (full > kMaxStages) full = kMaxStages;
  const double frac = stageCount - (double)full;

  double y = safe(input);
  const int maxFull = full < kMaxStages ? full : kMaxStages;
  for (int i = 0; i < maxFull; i++) {
    y = process_stage(s.stages[i], y, s.b0, s.b1, s.b2, s.a1, s.a2);
  }
  if (frac > 1e-6 && full < kMaxStages) {
    const double before = y;
    const double after = process_stage(s.stages[full], y, s.b0, s.b1, s.b2, s.a1, s.a2);
    y = before + (after - before) * frac;
  }

  if (!(y * 0.0 == 0.0)) y = 0.0;
  if (y > -1e-30 && y < 1e-30) y = 0.0;
  return y;
}

extern "C" int soemdsp_phase_disperse_version() {
  return 1;
}
