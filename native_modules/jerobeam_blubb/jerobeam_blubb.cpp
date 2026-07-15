// soemdsp-native-module: jerobeam_blubb
// soemdsp-native-label: Jerobeam Blubb
// soemdsp-native-target: blubb
// soemdsp-native-kind: jerobeam
//
// Ported from soemdsp/include/soemdsp/oscillator/JerobeamBlubb.{h,cpp}
// (Jerobeam Fenderson's "Blubb" Gen~ patch). The reference getSampleFrame()
// never actually reads its own phasor's value into the `phase` it uses for
// sin/cos, so as written it would emit a frozen DC output forever -- this
// port fixes that (reads phasor.getUnipolarValue() each sample) so the
// circle/square shape actually animates, and treats rotX/rotY as 0..1 turn
// fractions (matching how they're fed into the phase-domain rotate math),
// since the header's own setters pass them through unconverted.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kTau = 6.28318530717958647692;
struct BlubbState {
  bool active;
  double phase;
  double outX;
  double outY;
};

static BlubbState gPool[kMaxInstances];

// soemdsp::oscillator::bipolar::triangle(phase)
double bipolarTriangle(double phase) {
  double p = wrap01_frac(phase);
  return p < 0.5 ? (4.0 * p - 1.0) : (3.0 - 4.0 * p);
}

}  // namespace

extern "C" int soemdsp_jbblubb_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = BlubbState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jbblubb_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jbblubb_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].phase = 0.0;
}

extern "C" void soemdsp_jbblubb_sample(
  int handle,
  double frequency,
  double shape,
  double rotX,
  double rotY,
  double zDepth,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  BlubbState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double phase = s.phase;

  double chX, chY;
  if (shape >= 0.5) {
    // SQUARE: two triangle waves 90 degrees (a quarter turn) apart.
    chX = bipolarTriangle(phase + 0.125);
    chY = bipolarTriangle(phase + 0.375);
  } else {
    // CIRCLE
    chX = dsp_sin(phase * kTau);
    chY = dsp_cos(phase * kTau);
  }

  // rotate() from the reference: a 2-axis rotation collapsed straight into
  // a zDepth-squished 2D render (it never carries a separate Z channel out).
  const double sinRotX = dsp_sin(rotX * kTau);
  const double cosRotX = dsp_cos(rotX * kTau);
  const double help11 = chX * cosRotX - chY * sinRotX;
  const double help12 = chX * sinRotX + chY * cosRotX;
  const double sinRotY = dsp_sin(rotY * kTau);
  const double cosRotY = dsp_cos(rotY * kTau);
  const double help21 = help11 * cosRotY;
  const double z = help11 * sinRotY;

  const double formula = zDepth * 1.25 * (z * 0.05 + 0.5);
  const double m = 1.0 + zDepth;
  s.outX = (help21 - formula * help21) * m;
  s.outY = (help12 - formula * help12) * m;

  s.phase = wrap01_frac(s.phase + frequency / safeRate);
}

extern "C" double soemdsp_jbblubb_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jbblubb_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jbblubb_version() {
  return 1;
}
