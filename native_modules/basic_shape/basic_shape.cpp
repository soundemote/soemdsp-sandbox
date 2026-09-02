// soemdsp-native-module: basic_shape
// soemdsp-native-label: BasicShape
// soemdsp-native-target: basicShape
// soemdsp-native-kind: oscillator
//
// Naive waves (no AA) — port of basic-shape-worklet-evaluator.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  double phase;
  double lastReset;
  double simSamples;
  double out;
  double sine;
  double tri;
  double saw;
  double ramp;
  double square;
  double trisaw;
  double centerSquare;
  bool active;
};

static State gPool[kMaxInstances];

// Exact port of basicShapeCenterSquare (JS mutates t2 but adds with t1).
static double center_square_exact(double cycle, double morph) {
  double m = (morph * 0.0 == 0.0) ? morph : 0.5;
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  double t1 = wrap01(cycle + 0.875 + 0.25 * (m - 0.5));
  double t2 = wrap01(cycle + 0.375 + 0.25 * (m - 0.5));
  double y = (t1 < 0.5 ? 1.0 : -1.0);
  t1 = wrap01(t1 + 0.5 * (1.0 - m));
  t2 = wrap01(t2 + 0.5 * (1.0 - m));
  y += (t1 < 0.5 ? 1.0 : -1.0);
  (void)t2;
  return 0.5 * y;
}

static double trisaw(double cycle, double warp) {
  double w = (warp * 0.0 == 0.0) ? warp : 0.5;
  if (w < 1.0e-4) w = 1.0e-4;
  if (w > 1.0 - 1.0e-4) w = 1.0 - 1.0e-4;
  if (cycle < w) return 2.0 * (cycle / w) - 1.0;
  return 2.0 * ((1.0 - cycle) / (1.0 - w)) - 1.0;
}

static double select_wave(
  double sine, double tri, double saw, double square, double ramp,
  double trisawV, double centerSq, int waveform
) {
  if (waveform == 1) return tri;
  if (waveform == 2) return saw;
  if (waveform == 3) return square;
  if (waveform == 4) return ramp;
  if (waveform == 5) return trisawV;
  if (waveform == 6) return centerSq;
  return sine;
}

}  // namespace

extern "C" int soemdsp_basic_shape_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.phase = 0.0;
      s.lastReset = 0.0;
      s.simSamples = 0.0;
      s.out = 0.0;
      s.sine = 0.0;
      s.tri = 0.0;
      s.saw = 0.0;
      s.ramp = 0.0;
      s.square = 0.0;
      s.trisaw = 0.0;
      s.centerSquare = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_basic_shape_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_basic_shape_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double waveform,
  double motion,
  double phaseOffset,
  double morph,
  double amplitude,
  double increment,
  double reset
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];

  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  double freq = safe(frequencyHz);
  const double phaseOff = safe(phaseOffset);
  double pulse = safe(morph);
  if (!(pulse * 0.0 == 0.0)) pulse = 0.5;
  const double amp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  const double incIn = safe(increment);
  const double rv = safe(reset);

  int waveI = (int)(safe(waveform) + (safe(waveform) >= 0.0 ? 0.5 : -0.5));
  if (waveI < 0) waveI = 0;
  if (waveI > 6) waveI = 6;
  int motionI = (int)(safe(motion) + (safe(motion) >= 0.0 ? 0.5 : -0.5));
  if (motionI < 0) motionI = 0;
  if (motionI > 3) motionI = 3;

  const bool resetEdge = s.lastReset <= 0.0 && rv > 0.0;
  s.lastReset = rv;
  if (resetEdge) s.phase = 0.0;

  const bool clockWise = (motionI == 0 || motionI == 2);
  const bool useSimTime = motionI >= 2;
  const double dir = clockWise ? -1.0 : 1.0;
  const double phaseIncrement = useSimTime
    ? 0.0
    : (dir * freq / sr) + incIn;

  double samplePhase;
  if (useSimTime) {
    samplePhase = dir * ((freq / sr) + incIn) * s.simSamples + phaseOff;
  } else {
    samplePhase = s.phase + phaseOff;
  }
  samplePhase = wrap01(samplePhase);

  const double cycle = samplePhase;
  const double sine = dsp_sin(cycle * kPi * 2.0);
  const double tri = 1.0 - 4.0 * dsp_fabs(cycle - 0.5);
  const double saw = 1.0 - cycle * 2.0;
  const double ramp = cycle * 2.0 - 1.0;
  double width = pulse;
  if (width < 0.0) width = 0.0;
  if (width > 1.0) width = 1.0;
  const double square = cycle < width ? 1.0 : -1.0;
  const double trisawV = trisaw(cycle, width);
  const double centerSq = center_square_exact(cycle, width);

  const double selected = select_wave(
    sine, tri, saw, square, ramp, trisawV, centerSq, waveI
  ) * amp;

  s.sine = sine * amp;
  s.tri = tri * amp;
  s.saw = saw * amp;
  s.ramp = ramp * amp;
  s.square = square * amp;
  s.trisaw = trisawV * amp;
  s.centerSquare = centerSq * amp;
  s.out = selected;

  double nextPhase = s.phase + phaseIncrement;
  nextPhase = wrap01(nextPhase);
  s.phase = nextPhase;
  s.simSamples += 1.0;

  return selected;
}

extern "C" double soemdsp_basic_shape_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}
extern "C" double soemdsp_basic_shape_sine(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].sine;
}
extern "C" double soemdsp_basic_shape_tri(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].tri;
}
extern "C" double soemdsp_basic_shape_saw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].saw;
}
extern "C" double soemdsp_basic_shape_ramp(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].ramp;
}
extern "C" double soemdsp_basic_shape_square(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].square;
}
extern "C" double soemdsp_basic_shape_trisaw(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].trisaw;
}
extern "C" double soemdsp_basic_shape_center_square(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].centerSquare;
}

extern "C" int soemdsp_basic_shape_version() {
  return 1;
}
