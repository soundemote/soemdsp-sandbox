// soemdsp-native-module: softwave
// soemdsp-native-label: Softwave Oscillator
// soemdsp-native-target: softwaveOsc
// soemdsp-native-kind: oscillator
//
// Port of DistortionOscillator / Softwave multi-shape morphing oscillator
// previously pure-JS in softwave-osc-worklet-evaluator.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"softwave\","
    "\"label\":\"Softwave Oscillator\","
    "\"targetType\":\"softwaveOsc\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":100,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"max\":9,\"step\":1},"
      "{\"key\":\"morph\",\"label\":\"Morph\",\"defaultValue\":0.5,\"min\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"phase\",\"label\":\"Phase\",\"kind\":\"phase\",\"defaultValue\":0,\"min\":0,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"antialias\",\"label\":\"Antialias\",\"defaultValue\":0,\"min\":0,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 32;

struct SoftwaveState {
  double phase;
  bool active;
};

static SoftwaveState gPool[kMaxInstances];

static double soft_tanh(double v) {
  if (v > 5.0) return 1.0;
  if (v < -5.0) return -1.0;
  // tanh(x) = (e^{2x}-1)/(e^{2x}+1)
  const double e2 = dsp_exp(2.0 * v);
  return (e2 - 1.0) / (e2 + 1.0);
}

// Rough acos for softwave shapes (arg clamped to [-1,1]).
static double soft_acos(double x) {
  double a = clamp(x, -1.0, 1.0);
  // acos(x) ≈ π/2 - asin(x); asin series for |x|<=1
  // asin(x) = x + (1/2)(x^3)/3 + (1*3)/(2*4)(x^5)/5 + ...
  double x2 = a * a;
  double series = a * (1.0 + x2 * (0.16666666666666666
    + x2 * (0.075
    + x2 * (0.044642857142857144
    + x2 * 0.030381944444444444))));
  return kHalfPi - series;
}

static double soft_log10(double x) {
  // ln(x)/ln(10)
  return dsp_ln(x > 1.0e-300 ? x : 1.0e-300) * 0.4342944819032518;
}

static double parabol_sine(double x) {
  double xin = x;
  if (x > 0.5) xin = x - 0.5;
  xin = xin * 4.0 - 1.0;
  const double a = xin * xin;
  if (x > 0.5) return 0.0 - (1.0 - a) * (1.0 - a * 0.202);
  return (1.0 - a) * (1.0 - a * 0.202);
}

static double freq_to_pitch(double frequencyHz) {
  const double f = frequencyHz > 1.0e-12 ? frequencyHz : 1.0e-12;
  return 69.0 + 12.0 * (dsp_ln(f / 440.0) / 0.6931471805599453);  // / ln(2)
}

static double sine_amp(double frequencyHz, double sampleRate) {
  const double f = frequencyHz > 1.0 ? frequencyHz : 1.0;
  const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double quarter = sr * 0.25;
  const double denom = soft_log10(f) * f;
  const double d = denom > 1.0e-12 || denom < -1.0e-12 ? denom : 1.0e-12;
  return (quarter / d) * (kPi * 0.5) * 0.8;
}

static double morph_factor(double morph) {
  const double m = clamp(morph, 0.0, 1.0);
  const double m2 = m * m;
  const double m4 = m2 * m2;
  return m4 * 0.999 + 0.001;
}

static double run_shape(double finalPhase, int shape, double sa, double mf, double frequencyHz) {
  const double p = wrap01(finalPhase);
  switch (shape) {
    case 0: {
      const double toSine = (p * 2.0 - 1.0) * kPi;
      return soft_tanh(dsp_sin(toSine) * sa * mf) * dsp_cos(toSine);
    }
    case 1:
      return soft_tanh(parabol_sine(p) * sa * mf) * parabol_sine(wrap01(p + 0.25));
    case 2: {
      const double a = soft_tanh(dsp_sin(p * kPi * 2.0) * sa * mf)
        * dsp_sin(wrap01(p + 0.25) * kPi * 2.0);
      return soft_acos(clamp(a, -1.0, 1.0)) / (kPi * 0.5) - 1.0;
    }
    case 3: {
      const double bow = parabol_sine(p);
      return soft_tanh(bow * sa * mf)
        * (soft_tanh(bow * sa * 0.5 * mf) * parabol_sine(wrap01(p + 0.25)) * 0.5 + 0.5);
    }
    case 4:
      return soft_tanh(parabol_sine(p) * sa * mf);
    case 5: {
      const double t = clamp(mf, 0.0, 1.0);
      const double adjusted = 0.15 + (1.0 - 0.15) * t;
      const double scaling = soft_tanh((1.0 - (freq_to_pitch(frequencyHz) / 127.0)) * 9.0);
      return soft_acos(clamp(dsp_sin(p * kPi * 2.0) * adjusted * scaling, -1.0, 1.0))
        / kPi * 2.0 - 1.0;
    }
    case 6: {
      const double bow = parabol_sine(p);
      return soft_tanh(bow * sa * mf) * bow * 2.0 - 1.0;
    }
    case 7: {
      const double bow = parabol_sine(p);
      const double sq = soft_tanh(bow * sa * mf);
      return soft_tanh(sq * bow * 2.0) * 2.0 - 1.0;
    }
    case 8: {
      const double bow = parabol_sine(p);
      const double sq = soft_tanh(bow * sa * mf);
      return sq * 0.5 + 0.5 - soft_tanh(sq * bow * 2.0);
    }
    case 9:
    default:
      return parabol_sine(p);
  }
}

}  // namespace

extern "C" int soemdsp_softwave_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].phase = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_softwave_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// phaseOffset, morph, antialias in [0,1]; waveform 0..9; level gain.
extern "C" double soemdsp_softwave_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double waveform,
  double morph,
  double phaseOffset,
  double level,
  double antialias
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  SoftwaveState& s = gPool[handle - 1];
  const double f = frequencyHz > 0.0 && (frequencyHz * 0.0 == 0.0) ? frequencyHz : 0.0;
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  const double gain = (level * 0.0 == 0.0) ? level : 1.0;
  if (f <= 0.0) return 0.0;
  const double increment = f / rate;
  s.phase = wrap01(s.phase + increment);
  const double po = wrap01(phaseOffset);
  const double aa = antialias > 0.0 ? antialias : 0.0;
  double finalPhase = wrap01(s.phase + po);
  if (aa > 0.0) {
    finalPhase = wrap01(finalPhase + aa * 0.0005 * dsp_sin(s.phase * 97.13));
  }
  int shape = (int)dsp_floor(waveform + 0.5);
  if (shape < 0) shape = 0;
  if (shape > 9) shape = 9;
  const double sample = run_shape(
    finalPhase,
    shape,
    sine_amp(f, rate),
    morph_factor(morph),
    f
  );
  if (!(sample * 0.0 == 0.0)) return 0.0;
  return sample * gain;
}

extern "C" int soemdsp_softwave_version() {
  return 1;
}

extern "C" const char* soemdsp_softwave_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_softwave_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
