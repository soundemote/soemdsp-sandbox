// soemdsp-native-module: hyperpluck
// soemdsp-native-label: Hyperpluck
// soemdsp-native-target: hyperpluck
// soemdsp-native-kind: oscillator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/oscillator/PolyBLEP.hpp
//
// PolyBLEP unison bank. Detune is Hz offset (ƒ + Δf), not cents. Algorithm
// layouts map into ±Detune/2 Hz. Circular phase layout (Linear / Exponential /
// Random) scaled by Phase Multiply. Reset zeros every phasor and re-rolls
// Random. Fractional voices like Hypersaw. Hard voice cap 128; UI ≤32.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 128;
constexpr int kMaxBlockFrames = 2048;
constexpr int kWaveformTrisaw = 0;
constexpr int kWaveformSaw = 1;
constexpr int kWaveformRamp = 2;
constexpr int kWaveformCenterPulse = 3;
constexpr int kWaveformPulse = 4;
constexpr int kWaveformSquare = 5;
constexpr int kWaveformMax = 5;
constexpr double kMorphCenter = 0.5;
constexpr int kPhaseAlgoLinear = 0;
constexpr int kPhaseAlgoExponential = 1;
constexpr int kPhaseAlgoRandom = 2;
constexpr int kPhaseAlgoCount = 3;
constexpr double kPhaseExpK = 3.0;

double floorD(double value) {
  return __builtin_floor(value);
}

double sqrtD(double value) {
  return __builtin_sqrt(value < 0.0 ? 0.0 : value);
}

double bankMixScale(double ampWeightSum) {
  if (!(ampWeightSum > 0.0)) return 0.0;
  return 1.0 / sqrtD(ampWeightSum);
}

double centsToRatio(double cents) {
  return dsp_exp((cents / 1200.0) * 0.6931471805599453);
}

double incrementAbs(double inc) {
  double dt = inc < 0.0 ? -inc : inc;
  if (!(dt == dt) || dt < 0.0) dt = 0.0;
  if (dt > 0.5) dt = 0.5;
  return dt;
}

double polyBlepTrisaw(double t, double dt, double morph) {
  const double pw = morph_width01(morph);
  const double t1 = wrap01(t + 0.5 * pw);
  const double t2 = wrap01(t + 1.0 - 0.5 * pw);
  double y = t * 2.0;
  if (y >= 2.0 - pw) {
    y = (y - 2.0) / pw;
  } else if (y >= pw) {
    y = 1.0 - (y - pw) / (1.0 - pw);
  } else {
    y /= pw;
  }
  y += dt / (pw - pw * pw) * (poly_blamp(t1, dt) - poly_blamp(t2, dt));
  return y;
}

double polyBlepSaw(double t, double dt) {
  double y = 1.0 - 2.0 * t;
  y += poly_blep(t, dt);
  return y;
}

double polyBlepRamp(double t, double dt) {
  const double t1 = wrap01(t + 0.5);
  double y = t1 * 2.0 - 1.0;
  y -= poly_blep(t1, dt);
  return y;
}

double polyBlepPulse(double t, double dt, double morph) {
  const double pw = morph_width01(morph);
  const double t1 = wrap01(t + 1.0 - pw);
  double y = -2.0 * pw;
  if (t < pw) y += 2.0;
  y += poly_blep(t, dt) - poly_blep(t1, dt);
  return y;
}

double polyBlepCenterPulse(double t, double dt, double morph) {
  double w = (!is_nan(morph)) ? morph : 0.5;
  if (w < 0.0) w = 0.0;
  if (w > 1.0) w = 1.0;
  if (w <= 0.0) return -1.0;
  if (w >= 1.0) return 1.0;
  const double shift = 0.5 * (1.0 - w);
  const double t0 = wrap01(t - shift);
  const double t1 = wrap01(t0 + 1.0 - w);
  double y = (t0 < w) ? 1.0 : -1.0;
  y += poly_blep(t0, dt) - poly_blep(t1, dt);
  return y;
}

double polyBlepSquare(double t, double dt) {
  double y = t < 0.5 ? 1.0 : -1.0;
  y += poly_blep(t, dt);
  y -= poly_blep(wrap01(t + 0.5), dt);
  return y;
}

double hyperpluckWaveSample(int waveform, double phase, double inc) {
  const double dt = incrementAbs(inc);
  const double t = wrap01(phase);
  switch (waveform) {
    case kWaveformTrisaw: return polyBlepTrisaw(t, dt, kMorphCenter);
    case kWaveformSaw: return polyBlepSaw(t, dt);
    case kWaveformRamp: return polyBlepRamp(t, dt);
    case kWaveformCenterPulse: return polyBlepCenterPulse(t, dt, kMorphCenter);
    case kWaveformPulse: return polyBlepPulse(t, dt, kMorphCenter);
    case kWaveformSquare: return polyBlepSquare(t, dt);
    default: return polyBlepSaw(t, dt);
  }
}

constexpr int kDetuneAlgoCount = 7;
constexpr int kAlgoLinear = 0;
constexpr int kAlgoChordal = 1;
constexpr int kAlgoEmotional = 2;
constexpr int kAlgoRealistic = 3;
constexpr int kAlgoClassic = 4;
constexpr int kAlgoUniform = 5;
constexpr int kAlgoExponential = 6;
constexpr int kPrimeCount = kMaxVoices + 2;

double gPrimes[kPrimeCount];
bool gPrimesReady = false;

double dspPowPos(double base, double exp) {
  if (!(base > 0.0)) return 0.0;
  return dsp_exp(exp * dsp_ln(base));
}

double ratioToCents(double ratio) {
  if (!(ratio > 0.0)) return 0.0;
  return 1200.0 * (dsp_ln(ratio) / 0.6931471805599453);
}

void sortAscending(double* a, int n) {
  for (int i = 1; i < n; i++) {
    const double key = a[i];
    int j = i - 1;
    while (j >= 0 && a[j] > key) {
      a[j + 1] = a[j];
      j -= 1;
    }
    a[j + 1] = key;
  }
}

void transformRangeInPlace(double* a, int n, double targetMin, double targetMax) {
  if (n <= 0) return;
  if (n == 1) {
    a[0] = 0.5 * (targetMin + targetMax);
    return;
  }
  double curMin = a[0];
  double curMax = a[0];
  for (int i = 1; i < n; i++) {
    if (a[i] < curMin) curMin = a[i];
    if (a[i] > curMax) curMax = a[i];
  }
  const double denom = curMax - curMin;
  if (!(denom > 0.0) && !(denom < 0.0)) {
    const double mid = 0.5 * (targetMin + targetMax);
    for (int i = 0; i < n; i++) a[i] = mid;
    return;
  }
  const double aa = (targetMin - targetMax) / (curMin - curMax);
  const double bb = (curMax * targetMin - curMin * targetMax) / (curMax - curMin);
  for (int i = 0; i < n; i++) a[i] = aa * a[i] + bb;
}

void ensurePrimes() {
  if (gPrimesReady) return;
  constexpr int kSieveLimit = 2048;
  bool isComposite[kSieveLimit + 1];
  for (int i = 0; i <= kSieveLimit; i++) isComposite[i] = false;
  isComposite[0] = true;
  isComposite[1] = true;
  for (int p = 2; p * p <= kSieveLimit; p++) {
    if (isComposite[p]) continue;
    for (int m = p * p; m <= kSieveLimit; m += p) isComposite[m] = true;
  }
  int written = 0;
  for (int n = 2; n <= kSieveLimit && written < kPrimeCount; n++) {
    if (!isComposite[n]) {
      gPrimes[written] = static_cast<double>(n);
      written += 1;
    }
  }
  while (written < kPrimeCount) {
    gPrimes[written] = static_cast<double>(2 + written);
    written += 1;
  }
  gPrimesReady = true;
}

void fillRawRatiosForN(double* out, int n, int supersawAlgo) {
  ensurePrimes();
  double p1 = 1.0;
  int kind = 0;
  if (supersawAlgo == 0) { kind = 0; p1 = 1.0; }
  else if (supersawAlgo == 1) { kind = 0; p1 = 1.0e-8; }
  else if (supersawAlgo == 2) { kind = 1; p1 = 1.0e-8; }
  else if (supersawAlgo == 3) { kind = 1; p1 = 1.0; }
  else if (supersawAlgo == 4) { kind = 2; p1 = 0.0; }
  else { kind = 2; p1 = 1.0; }

  if (kind == 0) {
    for (int i = 0; i < n; i++) out[i] = dspPowPos(gPrimes[i], p1);
  } else if (kind == 1) {
    for (int i = 0; i < n; i++) {
      out[i] = dspPowPos(gPrimes[i + 1], p1) - dspPowPos(gPrimes[i], p1);
    }
    sortAscending(out, n);
  } else {
    for (int i = 0; i < n; i++) {
      const double t = (n <= 1) ? 0.0 : static_cast<double>(i) / static_cast<double>(n - 1);
      const double linVal = 1.0 + t;
      const double expVal = dsp_exp(linVal) / dsp_exp(2.0);
      out[i] = (1.0 - p1) * linVal + p1 * expVal;
    }
  }
}

void fillVoiceCents(
  double* centsOut,
  int voiceCount,
  int algorithm,
  double spreadCents
) {
  if (voiceCount <= 1) {
    centsOut[0] = 0.0;
    return;
  }
  int algo = algorithm;
  if (algo < 0) algo = 0;
  if (algo >= kDetuneAlgoCount) algo = kDetuneAlgoCount - 1;

  const double half = 0.5 * maxd(0.0, spreadCents);

  if (algo == kAlgoUniform) {
    for (int i = 0; i < voiceCount; i++) {
      const double t = static_cast<double>(i) / static_cast<double>(voiceCount - 1);
      centsOut[i] = (t - 0.5) * (2.0 * half);
    }
    return;
  }

  int supersawAlgo = 4;
  if (algo == kAlgoClassic) supersawAlgo = 0;
  else if (algo == kAlgoRealistic) supersawAlgo = 1;
  else if (algo == kAlgoEmotional) supersawAlgo = 2;
  else if (algo == kAlgoChordal) supersawAlgo = 3;
  else if (algo == kAlgoLinear) supersawAlgo = 4;
  else if (algo == kAlgoExponential) supersawAlgo = 5;

  double ratios[kMaxVoices];
  fillRawRatiosForN(ratios, voiceCount, supersawAlgo);

  const double minRatio = centsToRatio(-half);
  const double maxRatio = centsToRatio(half);
  transformRangeInPlace(ratios, voiceCount, minRatio, maxRatio);

  for (int i = 0; i < voiceCount; i++) {
    double r = ratios[i];
    if (!(r > 1.0e-12)) r = 1.0e-12;
    centsOut[i] = ratioToCents(r);
  }

  if (algo == kAlgoRealistic || algo == kAlgoEmotional) {
    double sorted[kMaxVoices];
    for (int i = 0; i < voiceCount; i++) sorted[i] = centsOut[i];
    sortAscending(sorted, voiceCount);
    const double median = (voiceCount & 1)
      ? sorted[voiceCount / 2]
      : 0.5 * (sorted[voiceCount / 2 - 1] + sorted[voiceCount / 2]);
    for (int i = 0; i < voiceCount; i++) centsOut[i] -= median;

    double lo = centsOut[0];
    double hi = centsOut[0];
    for (int i = 1; i < voiceCount; i++) {
      if (centsOut[i] < lo) lo = centsOut[i];
      if (centsOut[i] > hi) hi = centsOut[i];
    }
    const double scaleNeg = (lo < -1.0e-12) ? (half / (-lo)) : 1.0;
    const double scalePos = (hi > 1.0e-12) ? (half / hi) : 1.0;
    for (int i = 0; i < voiceCount; i++) {
      if (centsOut[i] < 0.0) centsOut[i] *= scaleNeg;
      else centsOut[i] *= scalePos;
    }
  }
}

void fillPhaseLayout(double* out, int n, int algo, unsigned int& rng) {
  if (n <= 1) {
    out[0] = 0.0;
    return;
  }
  if (algo == kPhaseAlgoRandom) {
    const double scale = 1.0 / 4294967296.0;
    for (int i = 0; i < n; i++) {
      out[i] = static_cast<double>(xorshift32(rng)) * scale;
    }
    return;
  }
  if (algo == kPhaseAlgoExponential) {
    const double denom = dsp_exp(kPhaseExpK) - 1.0;
    const double cap = static_cast<double>(n - 1) / static_cast<double>(n);
    for (int i = 0; i < n; i++) {
      const double u = static_cast<double>(i) / static_cast<double>(n);
      out[i] = ((dsp_exp(kPhaseExpK * u) - 1.0) / denom) * cap;
    }
    return;
  }
  for (int i = 0; i < n; i++) {
    out[i] = static_cast<double>(i) / static_cast<double>(n);
  }
}

void resolveVoices(double voicesExact, int* voiceCount, double* lastFrac) {
  double exact = voicesExact;
  if (!(exact == exact) || exact < 1.0) exact = 1.0;
  if (exact > static_cast<double>(kMaxVoices)) exact = static_cast<double>(kMaxVoices);
  const double fullF = floorD(exact + 1e-9);
  int full = static_cast<int>(fullF);
  double frac = exact - fullF;
  if (frac > 1e-9) {
    *voiceCount = full + 1;
    *lastFrac = frac;
  } else {
    *voiceCount = full < 1 ? 1 : full;
    *lastFrac = 0.0;
  }
  if (*voiceCount > kMaxVoices) {
    *voiceCount = kMaxVoices;
    *lastFrac = 0.0;
  }
}

struct VoiceState {
  double phase;
  double hzOffset;
  double phaseLayout;
};

double playbackPhase(const VoiceState& v, double multiply) {
  return wrap01(v.phase + v.phaseLayout * multiply);
}

// Face X: phase vs voice 0, unison at 0.5 so detune walks left/right.
double relativePhaseFaceX(const VoiceState& v, double refPhase, double multiply) {
  return wrap01(playbackPhase(v, multiply) - refPhase + 0.5);
}

double alternatingPan(int index, int voiceCount) {
  if (voiceCount <= 1) return 0.0;
  return ((index & 1) == 0) ? -1.0 : 1.0;
}

struct HyperpluckState {
  bool active;
  VoiceState voices[kMaxVoices];
  double outLeft;
  double outRight;
  double outMono;
  double blockOutLeft[kMaxBlockFrames];
  double blockOutRight[kMaxBlockFrames];
  double blockOutMono[kMaxBlockFrames];
  int publishCount;
  double publishX[kMaxVoices * 2];
  double publishPan[kMaxVoices * 2];
  double publishAmp[kMaxVoices * 2];
  double lastReset;
  int layoutAlgo;
  int layoutCount;
  unsigned int rng;
};

static HyperpluckState gPool[kMaxInstances];

void resetPhases(HyperpluckState& s) {
  for (int v = 0; v < kMaxVoices; v++) {
    s.voices[v].phase = 0.0;
  }
}

void publishVoicesMono(HyperpluckState& s, int voiceCount, double lastFrac, double multiply) {
  const double ref = playbackPhase(s.voices[0], multiply);
  int n = 0;
  for (int i = 0; i < voiceCount && n < kMaxVoices * 2; i++) {
    s.publishX[n] = relativePhaseFaceX(s.voices[i], ref, multiply);
    s.publishPan[n] = 0.0;
    s.publishAmp[n] = (lastFrac > 0.0 && i == voiceCount - 1) ? lastFrac : 1.0;
    n += 1;
  }
  s.publishCount = n;
}

void publishVoicesDual(HyperpluckState& s, int voiceCount, double lastFrac, double multiply) {
  const double ref = playbackPhase(s.voices[0], multiply);
  int n = 0;
  for (int i = 0; i < voiceCount && n + 1 < kMaxVoices * 2; i++) {
    const double amp = (lastFrac > 0.0 && i == voiceCount - 1) ? lastFrac : 1.0;
    const double x = relativePhaseFaceX(s.voices[i], ref, multiply);
    s.publishX[n] = x;
    s.publishPan[n] = -1.0;
    s.publishAmp[n] = amp;
    n += 1;
    s.publishX[n] = x;
    s.publishPan[n] = 1.0;
    s.publishAmp[n] = amp;
    n += 1;
  }
  s.publishCount = n;
}

void publishVoicesAlternating(HyperpluckState& s, int voiceCount, double lastFrac, double multiply) {
  const double ref = playbackPhase(s.voices[0], multiply);
  int n = 0;
  for (int i = 0; i < voiceCount && n < kMaxVoices * 2; i++) {
    s.publishX[n] = relativePhaseFaceX(s.voices[i], ref, multiply);
    s.publishPan[n] = alternatingPan(i, voiceCount);
    s.publishAmp[n] = (lastFrac > 0.0 && i == voiceCount - 1) ? lastFrac : 1.0;
    n += 1;
  }
  s.publishCount = n;
}

}  // namespace

extern "C" int soemdsp_hyperpluck_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = HyperpluckState{};
      gPool[i].active = true;
      resetPhases(gPool[i]);
      gPool[i].publishCount = 0;
      gPool[i].lastReset = 0.0;
      gPool[i].layoutAlgo = -1;
      gPool[i].layoutCount = 0;
      gPool[i].rng = 0xC0FFEE00u ^ (static_cast<unsigned int>(i + 1) * 0x9E3779B9u);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_hyperpluck_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_hyperpluck_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  resetPhases(gPool[handle - 1]);
}

extern "C" void soemdsp_hyperpluck_process_block(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneHz,
  double voicesExact,
  double level,
  double stereoMode,
  double detuneAlgorithm,
  double waveform,
  double maxVoiceHz,
  double resetGate,
  double phaseAlgorithm,
  double phaseMultiply,
  int frameCount
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HyperpluckState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double safeFrequency = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  const double spreadHz = maxd(0.0, safe(detuneHz));
  const double safeLevel = safe(level);
  int wave = static_cast<int>(floorD(safe(waveform) + 0.5));
  if (wave < 0) wave = 0;
  if (wave > kWaveformMax) wave = kWaveformMax;
  double hzCeil = (maxVoiceHz > 0.0) ? maxVoiceHz : 20000.0;
  const double nyquist = 0.5 * safeSampleRate;
  if (hzCeil > nyquist) hzCeil = nyquist;
  if (!(hzCeil > 0.0)) hzCeil = nyquist > 0.0 ? nyquist : 20000.0;
  int mode = static_cast<int>(floorD(safe(stereoMode) + 0.5));
  if (mode < 0) mode = 0;
  if (mode > 2) mode = 2;
  int algo = static_cast<int>(floorD(safe(detuneAlgorithm) + 0.5));
  if (algo < 0) algo = 0;
  if (algo >= kDetuneAlgoCount) algo = kDetuneAlgoCount - 1;
  int phaseAlgo = static_cast<int>(floorD(safe(phaseAlgorithm) + 0.5));
  if (phaseAlgo < 0) phaseAlgo = 0;
  if (phaseAlgo >= kPhaseAlgoCount) phaseAlgo = kPhaseAlgoCount - 1;
  double multiply = (phaseMultiply == phaseMultiply) ? phaseMultiply : 0.0;
  int voiceCount = 1;
  double lastFrac = 0.0;
  resolveVoices(voicesExact, &voiceCount, &lastFrac);

  const double reset = safe(resetGate);
  const bool didReset = gate_hit(reset, &s.lastReset);
  if (didReset) resetPhases(s);
  s.lastReset = reset;

  double hzOff[kMaxVoices];
  fillVoiceCents(hzOff, voiceCount, algo, spreadHz);
  for (int i = 0; i < voiceCount; i++) {
    s.voices[i].hzOffset = hzOff[i];
  }

  const bool randomAlgo = (phaseAlgo == kPhaseAlgoRandom);
  const bool needLayout = !randomAlgo
    || didReset
    || s.layoutAlgo != phaseAlgo
    || s.layoutCount != voiceCount;
  if (needLayout) {
    double layout[kMaxVoices];
    if (randomAlgo && s.layoutAlgo == phaseAlgo && s.layoutCount > 0 && !didReset) {
      const int keep = s.layoutCount < voiceCount ? s.layoutCount : voiceCount;
      for (int i = 0; i < keep; i++) layout[i] = s.voices[i].phaseLayout;
      const double scale = 1.0 / 4294967296.0;
      for (int i = keep; i < voiceCount; i++) {
        layout[i] = static_cast<double>(xorshift32(s.rng)) * scale;
      }
    } else {
      fillPhaseLayout(layout, voiceCount, phaseAlgo, s.rng);
    }
    for (int i = 0; i < voiceCount; i++) {
      s.voices[i].phaseLayout = layout[i];
    }
    s.layoutAlgo = phaseAlgo;
    s.layoutCount = voiceCount;
  }
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    double left = 0.0;
    double right = 0.0;
    double normL = 0.0;
    double normR = 0.0;
    double mix = 0.0;
    double normM = 0.0;
    for (int i = 0; i < voiceCount; i++) {
      VoiceState& v = s.voices[i];
      double hz = safeFrequency + v.hzOffset;
      if (!(hz == hz)) hz = 0.0;
      if (hz > hzCeil) hz = hzCeil;
      if (hz < -hzCeil) hz = -hzCeil;
      double inc = hz / safeSampleRate;
      if (!(inc == inc)) inc = 0.0;
      if (inc > 0.5) inc = 0.5;
      if (inc < -0.5) inc = -0.5;
      const double y = hyperpluckWaveSample(wave, v.phase + v.phaseLayout * multiply, inc);
      v.phase = wrap01(v.phase + inc);
      double amp = 1.0;
      if (lastFrac > 0.0 && i == voiceCount - 1) amp = lastFrac;
      if (mode == 2) {
        const double pan = alternatingPan(i, voiceCount);
        if (pan < -0.25) {
          left += y * amp;
          normL += amp;
        } else if (pan > 0.25) {
          right += y * amp;
          normR += amp;
        } else {
          left += y * amp * 0.5;
          right += y * amp * 0.5;
          normL += amp * 0.5;
          normR += amp * 0.5;
        }
      } else {
        mix += y * amp;
        normM += amp;
      }
    }
    if (mode != 2) {
      const double scaled = mix * bankMixScale(normM);
      left = scaled;
      right = scaled;
    } else {
      left *= bankMixScale(normL);
      right *= bankMixScale(normR);
    }
    if (!(left * 0.0 == 0.0)) left = 0.0;
    if (!(right * 0.0 == 0.0)) right = 0.0;
    const double outLeft = clamp(left, -1.5, 1.5) * safeLevel;
    const double outRight = clamp(right, -1.5, 1.5) * safeLevel;
    const double outMono = (outLeft + outRight) * 0.5;
    s.blockOutLeft[frame] = outLeft;
    s.blockOutRight[frame] = outRight;
    s.blockOutMono[frame] = outMono;
    s.outLeft = outLeft;
    s.outRight = outRight;
    s.outMono = outMono;
  }
  if (mode == 0) publishVoicesMono(s, voiceCount, lastFrac, multiply);
  else if (mode == 1) publishVoicesDual(s, voiceCount, lastFrac, multiply);
  else publishVoicesAlternating(s, voiceCount, lastFrac, multiply);
}

extern "C" void soemdsp_hyperpluck_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneHz,
  double voicesExact,
  double level,
  double stereoMode,
  double detuneAlgorithm,
  double waveform,
  double maxVoiceHz,
  double resetGate
) {
  soemdsp_hyperpluck_process_block(
    handle, frequencyHz, sampleRate, detuneHz, voicesExact, level,
    stereoMode, detuneAlgorithm, waveform, maxVoiceHz, resetGate, 0.0, 0.0, 1
  );
}

extern "C" int soemdsp_hyperpluck_block_output_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutLeft);
}

extern "C" int soemdsp_hyperpluck_block_output_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutRight);
}

extern "C" int soemdsp_hyperpluck_block_output_mono_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutMono);
}

extern "C" int soemdsp_hyperpluck_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" double soemdsp_hyperpluck_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_hyperpluck_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" double soemdsp_hyperpluck_mono(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outMono;
}

extern "C" int soemdsp_hyperpluck_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].publishCount;
}

extern "C" double soemdsp_hyperpluck_voice_x(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  const HyperpluckState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.5;
  return s.publishX[index];
}

extern "C" double soemdsp_hyperpluck_voice_pan(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const HyperpluckState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.0;
  return s.publishPan[index];
}

extern "C" double soemdsp_hyperpluck_voice_amp(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const HyperpluckState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.0;
  return s.publishAmp[index];
}

extern "C" int soemdsp_hyperpluck_version() {
  return 2;
}
