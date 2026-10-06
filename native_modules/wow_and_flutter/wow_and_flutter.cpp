// soemdsp-native-module: wow_and_flutter
// soemdsp-native-label: Wow And Flutter
// soemdsp-native-target: wowAndFlutter
// soemdsp-native-kind: modulator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/modulator/WowAndFlutter.hpp
//
// Port of soemdsp::modulator::WowAndFlutter:
//   out = wowOsc * wowAmp + flutterNoise * flutterAmp
// Wow = cheap sine wavetable (dsp_sin_turns_lut).
// Flutter = FlexibleRandomWalk fixed_steps (same spirit as random_walk method 3).

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct WowAndFlutterState {
  bool active;
  double wowPhase;
  double flutterOut;
  double flutterLp;
  unsigned int flutterSeed;
  double lastSeedParam;
  double out;
};

static WowAndFlutterState gPool[kMaxInstances];

// Fixed Seed part ids (append only; never renumber).
static const unsigned int kSeedFlutter = 1u;  // flutter random-walk LCG

// Seed param -> flutter LCG state. Seed 0 is a real, distinct seed.
static inline unsigned int flutter_rng(double seedParam) {
  return soemdsp::math::seed_to_rng_state(
    soemdsp::math::seed_mix(soemdsp::math::seed_param_u32(seedParam), kSeedFlutter));
}

static inline double next_unipolar(unsigned int& seed) {
  seed = 1664525u * seed + 1013904223u;
  return (double)seed / 4294967295.0;
}

static inline double next_bipolar(unsigned int& seed) {
  return next_unipolar(seed) * 2.0 - 1.0;
}

static inline double one_pole_lowpass(double& outputBuffer, double input, double frequency, double rate) {
  double safeRate = maxd(1.0, rate);
  double w = mind(kTwoPi / safeRate, kTauOver44100) * maxd(0.0, frequency);
  double a1 = dsp_exp(-w);
  double b0 = 1.0 - a1;
  outputBuffer = safe(b0 * input + a1 * outputBuffer);
  return outputBuffer;
}

// FlexibleRandomWalk::fixed_steps style step (random_walk method 3).
static inline double flutter_fixed_steps(
  WowAndFlutterState& s,
  double frequency,
  double jitter,
  double sampleRate
) {
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double safeFrequency = maxd(0.0, safe(frequency));
  const double safeJitter = maxd(0.0, safe(jitter));
  const double noise = next_bipolar(s.flutterSeed);
  const double increment = clamp(safeFrequency / rate, 0.0, 1.0);
  const double jitterInc = clamp(safeJitter / rate, 0.0, 1.0);
  const double stepSize = clamp(increment + rational_curve01(jitterInc, 0.99), 0.0, 1.0);
  const double averageIncrement = (jitterInc + increment) * 0.5;
  const double whiteNoiseMix = averageIncrement >= 0.9
    ? rational_curve01((averageIncrement - 0.9) / 0.1, -0.7)
    : 0.0;
  const double randomMix = 1.0 - whiteNoiseMix;
  const double step = noise > 0.0 ? stepSize : -stepSize;
  s.flutterOut = clamp11(s.flutterOut + step);
  const double mixed = s.flutterOut * randomMix + noise * whiteNoiseMix;
  return one_pole_lowpass(s.flutterLp, mixed, safeFrequency, rate);
}

}  // namespace

extern "C" int soemdsp_wow_and_flutter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      WowAndFlutterState& s = gPool[i];
      s = WowAndFlutterState{};
      s.active = true;
      s.wowPhase = 0.0;
      s.flutterOut = 0.0;
      s.flutterLp = 0.0;
      s.flutterSeed = flutter_rng(0.0);
      s.lastSeedParam = -1.0;  // first sample applies the Seed param (0 included)
      s.out = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_wow_and_flutter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_wow_and_flutter_reset(int handle, double phaseOffset) {
  if (handle < 1 || handle > kMaxInstances) return;
  WowAndFlutterState& s = gPool[handle - 1];
  s.wowPhase = wrap01(safe(phaseOffset));
  s.flutterOut = 0.0;
  s.flutterLp = 0.0;
  s.out = 0.0;
}

extern "C" double soemdsp_wow_and_flutter_sample(
  int handle,
  double wowSpeedHz,
  double sampleRate,
  double wowPhaseOffset,
  double wowAmp,
  double flutterFrequency,
  double flutterJitter,
  double flutterAmp,
  double seedParam,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  WowAndFlutterState& s = gPool[handle - 1];
  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;

  if (!(seedParam == s.lastSeedParam)) {
    s.flutterSeed = flutter_rng(seedParam);
    s.flutterOut = 0.0;
    s.flutterLp = 0.0;
    s.lastSeedParam = seedParam;
  }

  // Wow: sine wavetable LFO (matches Vibrato / SinCos LUT path).
  const double wowInc = hz_to_increment(wowSpeedHz, sr);
  s.wowPhase = wrap01(s.wowPhase + wowInc);
  const double wow = dsp_sin_turns_lut(s.wowPhase + safe(wowPhaseOffset));

  const double flutter = flutter_fixed_steps(
    s, flutterFrequency, flutterJitter, sr
  );

  const double y = wow * safe(wowAmp) + flutter * safe(flutterAmp);
  s.out = y * safe(level);
  return s.out;
}

extern "C" double soemdsp_wow_and_flutter_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" int soemdsp_wow_and_flutter_version() {
  return 2;
}
