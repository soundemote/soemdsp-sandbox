// soemdsp-native-module: sine_warp
// soemdsp-native-label: SineWarp
// soemdsp-native-target: sineWarp
// soemdsp-native-kind: oscillator
//
// Live antialiased cousin of Wavetable2D's rectified-sine + rational phasewarp:
// bipolar rational-curve warp, Hypersaw2 polyBlepRectSin arch, warp-aware PolyBLAMP,
// optional hard Reset → PolyBLEP on the output value jump. No wavetable bake.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"sine_warp\","
    "\"label\":\"SineWarp\","
    "\"targetType\":\"sineWarp\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"mode\",\"label\":\"Mode\",\"defaultValue\":1,\"min\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":100,\"min\":0,\"mid\":220,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"warp\",\"label\":\"Warp\",\"defaultValue\":0,\"min\":-1,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

constexpr int kMaxInstances = 64;

struct SineWarpState {
  bool active;
  double phase;       // carrier phase 0…1
  double lastReset;
  double lastY;       // previous output (pre-amplitude) for Reset BLEP
  double syncJump;    // value jump height at last hard Reset
  double syncT;       // phase progress since Reset; <0 = inactive
};

static SineWarpState gPool[kMaxInstances];

// soemdsp::math::poly_blep / poly_blamp.

// wavetable2d warp_phase / project rational_curve01 (s clamped ±0.9999).
static inline double warp_phase(double t, double warp) {
  t = wrap01(t);
  double s = warp;
  if (is_nan(s)) s = 0.0;
  if (s > 0.9999) s = 0.9999;
  if (s < -0.9999) s = -0.9999;
  if (s == 0.0) return t;
  // warp(t,s) = t(1+s) / (1-s+2*s*t)
  const double den = 1.0 - s + 2.0 * s * t;
  if (dsp_fabs(den) < 1.0e-12) return t;
  return wrap01(t * (1.0 + s) / den);
}

// d/dt warp(t,s) = (1-s^2) / (1-s+2*s*t)^2
static inline double warp_prime(double t, double warp) {
  t = wrap01(t);
  double s = warp;
  if (is_nan(s)) s = 0.0;
  if (s > 0.9999) s = 0.9999;
  if (s < -0.9999) s = -0.9999;
  if (s == 0.0) return 1.0;
  const double den = 1.0 - s + 2.0 * s * t;
  const double d2 = den * den;
  if (d2 < 1.0e-24) return 1.0;
  const double num = 1.0 - s * s;
  const double wp = num / d2;
  if (!(wp == wp) || wp < 0.0) return 0.0;
  return wp;
}

// Mode 0 = pure sine (LUT); Mode 1 = rectified / clipping sine + warp-aware BLAMP.
static inline double eval_wave(double carrierPhase, double warp, int mode, double dt) {
  const double u = warp_phase(carrierPhase, warp);
  if (mode <= 0) {
    // Clean sine — no slope knee, no BLAMP.
    return dsp_sin_turns_lut(u);
  }
  // Hypersaw2 polyBlepRectSin on warped playback phase:
  //   t1 = wrap01(u + 0.25)
  //   y  = 2*sin(π*t1) - 4/π
  // BLAMP at the knee in playback phase; scale by local warp' so the slope
  // jump tracks compression/expansion (do NOT BLAMP then warp).
  const double t1 = wrap01(u + 0.25);
  double y = 2.0 * dsp_sin(kPi * t1) - k4zPI;
  const double wp = warp_prime(carrierPhase, warp);
  double dt1 = wp * dt;
  if (!(dt1 > 0.0)) dt1 = 0.0;
  if (dt1 > 0.5) dt1 = 0.5;
  y += kTwoPi * dt1 * poly_blamp(t1, dt1);
  return y;
}

}  // namespace

extern "C" int soemdsp_sine_warp_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = SineWarpState{};
      gPool[i].active = true;
      gPool[i].syncT = -1.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sine_warp_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_sine_warp_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  SineWarpState& s = gPool[handle - 1];
  s.phase = 0.0;
  s.lastReset = 0.0;
  s.syncJump = 0.0;
  s.syncT = -1.0;
  // Keep lastY so the next rising Reset can still BLEP against it.
}

extern "C" double soemdsp_sine_warp_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  double warp,
  double mode,
  double amplitude,
  double reset,
  double increment
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SineWarpState& s = gPool[handle - 1];

  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double freq = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  double phaseInc = freq / sr;
  if (increment == increment) phaseInc += increment;
  if (phaseInc > 0.5) phaseInc = 0.5;
  if (phaseInc < -0.5) phaseInc = -0.5;
  const double dt = phaseInc < 0.0 ? -phaseInc : phaseInc;

  int waveMode = (int)(mode + (mode >= 0.0 ? 0.5 : -0.5));
  if (waveMode < 0) waveMode = 0;
  if (waveMode > 1) waveMode = 1;

  const double rv = (reset == reset) ? reset : 0.0;
  const bool rising = (s.lastReset <= 0.0 && rv > 0.0);
  s.lastReset = rv;

  if (rising) {
    // Hard Reset: zero carrier, PolyBLEP the output value jump.
    const double yBefore = s.lastY;
    s.phase = 0.0;
    const double po = wrap01(phaseOffset);
    const double yNew = eval_wave(wrap01(s.phase + po), warp, waveMode, dt);
    s.syncJump = yNew - yBefore;
    s.syncT = 0.0;
  } else {
    s.phase = wrap01(s.phase + phaseInc);
  }

  const double po = wrap01(phaseOffset);
  const double renderPhase = wrap01(s.phase + po);
  double y = eval_wave(renderPhase, warp, waveMode, dt);

  // Ongoing Reset BLEP while syncT is within one cycle of the discontinuity.
  if (s.syncT >= 0.0) {
    // poly_blep(0)=-1 → y becomes yNew + jump*(-1) = yBefore at the reset instant.
    y += s.syncJump * poly_blep(s.syncT, dt > 1.0e-12 ? dt : 1.0e-12);
    s.syncT += dt;
    if (s.syncT >= 1.0 || !(dt > 0.0)) {
      s.syncT = -1.0;
      s.syncJump = 0.0;
    }
  }

  s.lastY = y;

  double gain = (amplitude == amplitude) ? amplitude : 1.0;
  if (gain < 0.0) gain = 0.0;
  return y * gain;
}

extern "C" double soemdsp_sine_warp_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastY;
}

extern "C" int soemdsp_sine_warp_version() {
  return 1; // initial: warp + rectSin BLAMP + Reset BLEP + sine mode
}

extern "C" const char* soemdsp_sine_warp_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_sine_warp_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
