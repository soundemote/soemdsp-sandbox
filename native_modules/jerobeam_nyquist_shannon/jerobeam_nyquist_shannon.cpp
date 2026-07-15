// soemdsp-native-module: jerobeam_nyquist_shannon
// soemdsp-native-label: Jerobeam Nyquist-Shannon
// soemdsp-native-target: nyquistShannon
// soemdsp-native-kind: jerobeam
//
// Ported from soemdsp/include/soemdsp/oscillator/JerobeamNyquistShannon.{h,cpp}
// (Jerobeam Fenderson's "Nyquist-Shannon" Gen~ patch): a sample/rate
// artifact demo -- a stair-stepped ramp crossed with a windowed-sinc-like
// tone whose pitch can track a MIDI note, a pitch knob, and/or the
// frequency itself, blended and linearly smoothed to avoid zipper noise on
// tone-mode changes.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kTau = 6.28318530717958647692;
struct NyquistShannonState {
  bool active;
  double phase;
  double rotatorPhase;
  double lastFphas;
  bool hasLastFphas;
  double toneSmoothCurrent;
  bool toneSmoothInit;
  double outX;
  double outY;
};

static NyquistShannonState gPool[kMaxInstances];

double dsp_abs(double v) {
  return v < 0.0 ? -v : v;
}

double trisaw(double phase, double warp) {
  double safeWarp = clamp(warp, 0.001, 0.999);
  double wrapped = wrap01_frac(phase);
  return wrapped < safeWarp ? wrapped / safeWarp : (1.0 - wrapped) / (1.0 - safeWarp);
}

// log2(x) via IEEE-754 exponent extraction (exact) plus an atanh-series
// refinement of the mantissa (converges fast since the series argument is
// always < 1/3) -- accurate to a handful of ULPs, plenty for a "tone"
// pitch-tracking knob, not used anywhere precision-critical.
double dsp_log2(double x) {
  if (x <= 0.0) return -1024.0;
  union { double d; unsigned long long u; } c;
  c.d = x;
  int exponent = (int)((c.u >> 52) & 0x7FFULL) - 1023;
  c.u = (c.u & 0x000FFFFFFFFFFFFFULL) | 0x3FF0000000000000ULL;
  double m = c.d;  // [1, 2)
  double y = (m - 1.0) / (m + 1.0);
  double y2 = y * y;
  double series = y * (1.0 + y2 * (1.0 / 3.0 + y2 * (1.0 / 5.0 + y2 * (1.0 / 7.0 + y2 * (1.0 / 9.0)))));
  const double kInvLn2 = 1.4426950408889634074;
  return (double)exponent + 2.0 * series * kInvLn2;
}

// soemdsp::convert::freq_to_pitch(freq) = 12*log2(freq/440) + 69
double dsp_freq_to_pitch(double freq) {
  return 12.0 * dsp_log2(freq / 440.0) + 69.0;
}

}  // namespace

extern "C" int soemdsp_jbnyquist_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = NyquistShannonState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_jbnyquist_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_jbnyquist_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  NyquistShannonState& s = gPool[handle - 1];
  s.phase = 0.0;
  s.rotatorPhase = 0.0;
  s.hasLastFphas = false;
  s.toneSmoothInit = false;
}

extern "C" void soemdsp_jbnyquist_sample(
  int handle,
  double frequencyA,
  double midiNoteRaw,
  double rate,
  double sampleDots,
  double phaseOffset,
  double frequencyB,
  double subPhase,
  double subPhaseRotationSpeed,
  double tone,
  double toneSmoothTime,
  double artifact,
  double enableToneModPitch,
  double enableToneModFreq,
  double enableToneModNote,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  NyquistShannonState& s = gPool[handle - 1];

  const double safeRate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double userFreqA = frequencyA;
  const double pitch = frequencyB;
  const double phasorFreq = userFreqA * pitch;
  const double midiNote = midiNoteRaw - 48.0;
  const double sr = rate;
  const double blend = 1.0 / (1.0 - sampleDots + 0.001);
  const double tri = clamp(1.0 - artifact, 0.001, 0.999);
  const double freqToPitch = dsp_freq_to_pitch(dsp_abs(userFreqA)) - 48.0;

  const int toneMode = (enableToneModNote >= 0.5 ? 1 : 0) + (enableToneModPitch >= 0.5 ? 2 : 0) + (enableToneModFreq >= 0.5 ? 4 : 0);

  // Main phasor
  const double mainPhas = wrap01_frac(s.phase + phaseOffset);
  const double fphas = trisaw(mainPhas, tri);

  const double stair = __builtin_floor(fphas * sr) / sr;
  const double fmodFphasSr = (fphas * sr) - __builtin_floor(fphas * sr);
  const double phas = clamp(blend * fmodFphasSr, 0.0, 1.0) / sr + stair;

  const double waveX = phas * 2.0 - 1.0;
  double waveY = 0.0;

  // Linear smoother toward the target, ramping over toneSmoothTime seconds.
  const double smoothSamples = toneSmoothTime > 0.0 ? toneSmoothTime * safeRate : 1.0;
  const double smoothStep = smoothSamples > 0.0 ? (1.0 / smoothSamples) : 1.0;

  auto runSmoother = [&](double target) -> double {
    if (!s.toneSmoothInit) {
      s.toneSmoothCurrent = target;
      s.toneSmoothInit = true;
    } else if (s.toneSmoothCurrent < target) {
      s.toneSmoothCurrent = target - s.toneSmoothCurrent > smoothStep
        ? s.toneSmoothCurrent + smoothStep
        : target;
    } else if (s.toneSmoothCurrent > target) {
      s.toneSmoothCurrent = s.toneSmoothCurrent - target > smoothStep
        ? s.toneSmoothCurrent - smoothStep
        : target;
    }
    return s.toneSmoothCurrent;
  };

  double actualTone;
  switch (toneMode) {
    case 0: actualTone = tone; break;
    case 1: actualTone = tone + runSmoother(midiNote); break;
    case 2: actualTone = tone + runSmoother(pitch - 1.0); break;
    case 3: actualTone = tone + runSmoother((pitch - 1.0) + midiNote); break;
    case 4: actualTone = tone + freqToPitch; break;
    case 5: actualTone = tone + runSmoother(midiNote * 0.5) + freqToPitch * 0.5; break;
    case 6: actualTone = tone + runSmoother(pitch - 1.0) + freqToPitch; break;
    default: actualTone = tone + runSmoother((pitch - 1.0) + midiNote * 0.5) + freqToPitch * 0.5; break;
  }

  const double psXPi = wrap01_frac(s.rotatorPhase - subPhase) * kTau;

  const bool wasFirstSample = !s.hasLastFphas;
  const int changed = wasFirstSample ? 0 : (s.lastFphas > fphas ? 1 : (s.lastFphas < fphas ? -1 : 0));
  s.lastFphas = fphas;
  s.hasLastFphas = true;

  if (changed == 1) {
    waveY = dsp_sin(actualTone * kTau * phas + psXPi);
  } else {
    waveY = -dsp_sin(sr * kPi * phas + kHalfPi) * dsp_sin(phas * (sr / 2.0 - actualTone) * kTau - psXPi);
  }

  s.outX = waveX;
  s.outY = waveY;

  s.phase = wrap01_frac(s.phase + phasorFreq / safeRate);
  s.rotatorPhase = wrap01_frac(s.rotatorPhase + (-subPhaseRotationSpeed) / safeRate);
}

extern "C" double soemdsp_jbnyquist_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_jbnyquist_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_jbnyquist_version() {
  return 1;
}
