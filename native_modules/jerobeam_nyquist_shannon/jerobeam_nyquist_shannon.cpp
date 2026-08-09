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
//
// Fast path: turns-domain poly sin (dsp_sin_turns / dsp_cos_turns), no
// wavetable; skip log2 pitch and tone smoother work when the active tone
// mode does not need them; clamp Rate so stair math cannot /0.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kMinRate = 1.0e-9;

struct NyquistShannonState {
  bool active;
  double phase;
  double rotatorPhase;
  double lastFphas;
  bool hasLastFphas;
  double toneSmoothCurrent;
  bool toneSmoothInit;
  // Cache expensive freq→pitch only while Tone Mod: Freq is on and Freq A holds.
  double cachedFreqA;
  double cachedFreqToPitch;
  bool hasCachedFreqToPitch;
  double outX;
  double outY;
};

static NyquistShannonState gPool[kMaxInstances];

static double trisaw(double phase, double warp) {
  const double safeWarp = clamp(warp, 0.001, 0.999);
  const double wrapped = wrap01_frac(phase);
  return wrapped < safeWarp
    ? wrapped / safeWarp
    : (1.0 - wrapped) / (1.0 - safeWarp);
}

// log2(x) via IEEE-754 exponent extraction + atanh-series on the mantissa.
// Only used for Tone Mod: Freq modes.
static double dsp_log2(double x) {
  if (x <= 0.0) return -1024.0;
  union { double d; unsigned long long u; } c;
  c.d = x;
  const int exponent = (int)((c.u >> 52) & 0x7FFULL) - 1023;
  c.u = (c.u & 0x000FFFFFFFFFFFFFULL) | 0x3FF0000000000000ULL;
  const double m = c.d;  // [1, 2)
  const double y = (m - 1.0) / (m + 1.0);
  const double y2 = y * y;
  const double series = y * (1.0 + y2 * (1.0 / 3.0 + y2 * (1.0 / 5.0 + y2 * (1.0 / 7.0 + y2 * (1.0 / 9.0)))));
  const double kInvLn2 = 1.4426950408889634074;
  return (double)exponent + 2.0 * series * kInvLn2;
}

// soemdsp::convert::freq_to_pitch(freq) = 12*log2(freq/440) + 69
static double dsp_freq_to_pitch(double freq) {
  return 12.0 * dsp_log2(freq / 440.0) + 69.0;
}

static double tone_freq_to_pitch_cached(NyquistShannonState& s, double userFreqA) {
  const double absFreq = dsp_fabs(userFreqA);
  if (s.hasCachedFreqToPitch && s.cachedFreqA == absFreq) {
    return s.cachedFreqToPitch;
  }
  const double value = dsp_freq_to_pitch(absFreq) - 48.0;
  s.cachedFreqA = absFreq;
  s.cachedFreqToPitch = value;
  s.hasCachedFreqToPitch = true;
  return value;
}

static double run_tone_smoother(NyquistShannonState& s, double target, double smoothStep) {
  if (!s.toneSmoothInit) {
    s.toneSmoothCurrent = target;
    s.toneSmoothInit = true;
    return target;
  }
  const double cur = s.toneSmoothCurrent;
  if (cur < target) {
    s.toneSmoothCurrent = (target - cur > smoothStep) ? (cur + smoothStep) : target;
  } else if (cur > target) {
    s.toneSmoothCurrent = (cur - target > smoothStep) ? (cur - smoothStep) : target;
  }
  return s.toneSmoothCurrent;
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
  s.hasCachedFreqToPitch = false;
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
  // Stair "Rate" must stay strictly positive — /0 → NaN poisons the mix.
  const double sr = rate < kMinRate ? kMinRate : rate;
  const double blend = 1.0 / (1.0 - sampleDots + 0.001);
  const double tri = clamp(1.0 - artifact, 0.001, 0.999);

  const int toneMode =
    (enableToneModNote >= 0.5 ? 1 : 0)
    + (enableToneModPitch >= 0.5 ? 2 : 0)
    + (enableToneModFreq >= 0.5 ? 4 : 0);

  // Main phasor → trisaw → stair/quantize (the Nyquist artifact on X).
  const double mainPhas = wrap01_frac(s.phase + phaseOffset);
  const double fphas = trisaw(mainPhas, tri);

  const double fphasSr = fphas * sr;
  const double stairIndex = dsp_floor(fphasSr);
  const double stair = stairIndex / sr;
  const double fmodFphasSr = fphasSr - stairIndex;
  const double phas = clamp(blend * fmodFphasSr, 0.0, 1.0) / sr + stair;

  const double waveX = phas * 2.0 - 1.0;

  // Tone target: only pay for smoother / log2 pitch when that mode needs it.
  double actualTone = tone;
  if (toneMode != 0) {
    const bool needsSmooth = (toneMode & 3) != 0;       // note and/or pitch bits
    const bool needsFreqPitch = (toneMode & 4) != 0;    // freq bit
    double smoothPart = 0.0;
    if (needsSmooth) {
      const double smoothSamples = toneSmoothTime > 0.0 ? toneSmoothTime * safeRate : 1.0;
      const double smoothStep = smoothSamples > 0.0 ? (1.0 / smoothSamples) : 1.0;
      const double midiNote = midiNoteRaw - 48.0;
      double target = 0.0;
      switch (toneMode & 3) {
        case 1: target = midiNote; break;
        case 2: target = pitch - 1.0; break;
        case 3: target = (pitch - 1.0) + midiNote; break;
        default: break;
      }
      // Modes 5/7 blend half-note into the smoother target.
      if (toneMode == 5) {
        target = midiNote * 0.5;
      } else if (toneMode == 7) {
        target = (pitch - 1.0) + midiNote * 0.5;
      }
      smoothPart = run_tone_smoother(s, target, smoothStep);
    }
    double freqPart = 0.0;
    if (needsFreqPitch) {
      const double ftp = tone_freq_to_pitch_cached(s, userFreqA);
      // Modes 5 and 7 use half weight on freq→pitch (matches original switch).
      freqPart = (toneMode == 5 || toneMode == 7) ? (ftp * 0.5) : ftp;
    }
    actualTone = tone + smoothPart + freqPart;
  }

  // Sub-phase rotation as turns (no * τ until / unless needed — sin_turns takes turns).
  const double rotTurns = wrap01_frac(s.rotatorPhase - subPhase);

  const bool wasFirstSample = !s.hasLastFphas;
  const int changed = wasFirstSample
    ? 0
    : (s.lastFphas > fphas ? 1 : (s.lastFphas < fphas ? -1 : 0));
  s.lastFphas = fphas;
  s.hasLastFphas = true;

  double waveY;
  if (changed == 1) {
    // sin(2π · (actualTone·phas + rotTurns))
    waveY = dsp_sin_turns(actualTone * phas + rotTurns);
  } else {
    // Original: -sin(sr·π·phas + π/2) · sin(phas·(sr/2 − tone)·2π − rot·2π)
    //         = -cos(2π · (sr·phas/2)) · sin(2π · (phas·(sr/2 − tone) − rot))
    const double halfSrPhas = 0.5 * sr * phas;
    const double toneTurns = phas * (0.5 * sr - actualTone) - rotTurns;
    waveY = -dsp_cos_turns(halfSrPhas) * dsp_sin_turns(toneTurns);
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
  return 2;
}
