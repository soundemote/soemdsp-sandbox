// soemdsp-native-module: robin_supersaw
// soemdsp-native-label: RobinSupersaw
// soemdsp-native-target: robinSupersaw
// soemdsp-native-kind: oscillator
//
// Pitch-dithered supersaw (Robin Schmidt / RS-MET). Frequency-domain detune
// (each voice runs at a detuned Hz), not phase-modulation. Fractional voices
// like Hypersaw (last voice scaled by fractional part). Hard voice cap 128;
// UI typically exposes ≤32. voices=1 renders one bank copied to L/R (true mono).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 128;
constexpr int kMaxBlockFrames = 2048;
constexpr double kFaceHalfOctaveCents = 600.0; // ±0.5 octave face span

unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

double randomUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0);
}

double floorD(double value) {
  return __builtin_floor(value);
}

double sqrtD(double value) {
  return __builtin_sqrt(value < 0.0 ? 0.0 : value);
}

// Detuned saws are only partly correlated — divide by √Σamp (not Σamp) so
// loudness does not collapse as voices are added.
double bankMixScale(double ampWeightSum) {
  if (!(ampWeightSum > 0.0)) return 0.0;
  return 1.0 / sqrtD(ampWeightSum);
}

// 2^(cents/1200) via exp — wide enough for ±0.5 octave+ detune.
double centsToRatio(double cents) {
  return dsp_exp((cents / 1200.0) * 0.6931471805599453);
}

void calcCycleDistribution(double c, double* lenMid, double* probShort, double* probMid) {
  const double ci = floorD(c);
  const double cf = c - ci;
  double c2 = ci;
  if (cf >= 0.5) c2 += 1.0;
  const double c1 = c2 - 1.0;
  const double c3 = c2 + 1.0;

  const double e1 = c1 - c;
  const double e2 = c2 - c;
  const double e3 = c3 - c;
  const double v1 = e1 * e1;
  const double v2 = e2 * e2;
  const double v3 = e3 * e3;
  const double v = 0.25;
  const double d1 = v - v1;
  const double d2 = v - v2;
  const double d3 = v - v3;
  const double s = 1.0 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));

  *lenMid = c2;
  *probShort = (d2 * e3 - d3 * e2) * s;
  *probMid = (d3 * e1 - d1 * e3) * s;
}

struct DitherVoiceState {
  double sampleCount;
  double lenNow;
  double lenMid;
  double probShort;
  double probMid;
  double phaseSlope;
  unsigned int rngState;
  double centsOffset;
  // Fixed until Reset: scaled live by Random Phase as a phase offset.
  double phaseRandom;
  // Portamento (Supersaw-style glide of voice Hz toward target).
  double targetHz;
  double currentHz;
  double portaUnit; // 0…1 random, maps into [portaMin, portaMax]
  double portaInc; // linear per-sample Hz step
  double portaCoeff; // exp one-pole b0
  int portaMode; // 0 linear, 1 exponential
  bool portaArmed;
};

void updateCycleLength(DitherVoiceState& v) {
  const double r = randomUnit(v.rngState);
  if (r < v.probShort) {
    v.lenNow = v.lenMid - 1.0;
  } else if (r < v.probShort + v.probMid) {
    v.lenNow = v.lenMid;
  } else {
    v.lenNow = v.lenMid + 1.0;
  }
  const double maxCount = v.lenNow - 1.0;
  v.phaseSlope = 1.0 / (maxCount < 1.0 ? 1.0 : maxCount);
}

double wrap01(double value) {
  double x = value - floorD(value);
  if (x < 0.0) x += 1.0;
  if (x >= 1.0) x = 0.0;
  return x;
}

// Base phasor advance + live Random Phase offset (voice.phaseRandom × amount).
// Amount is not hard-clamped — param domain min/max are UI guides only.
double getSamplePhasor(DitherVoiceState& v, double randomPhaseAmount) {
  const double base = v.phaseSlope * v.sampleCount;
  const double amount = safe(randomPhaseAmount);
  const double p = wrap01(base + v.phaseRandom * amount);
  v.sampleCount += 1.0;
  if (v.sampleCount >= v.lenNow) {
    v.sampleCount = 0.0;
    updateCycleLength(v);
  }
  return p;
}

double sawFromPhasor(double phasor) {
  return 2.0 * phasor - 1.0;
}

void rerollPhaseRandom(DitherVoiceState& v) {
  v.phaseRandom = randomUnit(v.rngState);
}

void applyHzToVoiceCycle(DitherVoiceState& voice, double hz, double safeSampleRate) {
  const double voiceFreq = hz > 1.0 ? hz : 1.0;
  const double meanCycleLength = safeSampleRate / voiceFreq;
  calcCycleDistribution(meanCycleLength, &voice.lenMid, &voice.probShort, &voice.probMid);
  // Keep phaseSlope in sync for the current cycle (portamento updates each sample).
  const double maxCount = voice.lenNow > 1.0 ? voice.lenNow - 1.0 : (meanCycleLength > 1.0 ? meanCycleLength - 1.0 : 1.0);
  voice.phaseSlope = 1.0 / (maxCount < 1.0 ? 1.0 : maxCount);
}

// True bypass when both Min and Max are 0 (after clamp/swap: tMax == 0).
static bool portamentoEnabled(double portaMinSec, double portaMaxSec) {
  double tMin = maxd(0.0, portaMinSec);
  double tMax = maxd(0.0, portaMaxSec);
  if (tMax < tMin) tMax = tMin;
  return tMax > 0.0;
}

static double mapNtoN(double v, double in0, double in1, double out0, double out1) {
  const double d = in1 - in0;
  if (!(dsp_fabs(d) > 1.0e-30)) return out0;
  return out0 + (out1 - out0) * ((v - in0) / d);
}

// soemdsp::curve::Rational{c}.get(p) on 0…1 (Graph.hpp / Supersaw portamento times).
static double rational01(double p, double c) {
  const double x = clamp(p, 0.0, 1.0);
  const double skew = clamp(c, -0.9999, 0.9999);
  const double den = 1.0 - skew + 2.0 * skew * x;
  if (!(dsp_fabs(den) > 1.0e-12)) return x;
  return ((1.0 + skew) * x) / den;
}

// Supersaw portamentoStyle → (lin/exp mode, Rational curve for per-voice times).
static void portamentoStyleToModeAndCurve(double style, int* modeOut, double* curveOut) {
  const double s = clamp(safe(style), 0.0, 1.0);
  if (s < 0.5) {
    *curveOut = mapNtoN(s, 0.0, 0.5, -1.0, 1.0);
    *modeOut = 0; // Linear
  } else {
    *curveOut = mapNtoN(s, 0.5, 1.0, 1.0, -1.0);
    *modeOut = 1; // Exponential
  }
}

void configureVoicePortamento(
  DitherVoiceState& voice,
  double portaMinSec,
  double portaMaxSec,
  double portaStyle,
  double sampleRate
) {
  double tMin = maxd(0.0, portaMinSec);
  double tMax = maxd(0.0, portaMaxSec);
  if (tMax < tMin) {
    const double tmp = tMin;
    tMin = tMax;
    tMax = tmp;
  }
  // Min=Max=0 → bypass portamento circuit entirely (instant Hz).
  if (!(tMax > 0.0)) {
    voice.currentHz = voice.targetHz;
    voice.portaInc = 0.0;
    voice.portaCoeff = 1.0;
    voice.portaArmed = false;
    return;
  }
  int portaMode = 0;
  double portaCurve = -0.5;
  portamentoStyleToModeAndCurve(portaStyle, &portaMode, &portaCurve);
  voice.portaMode = portaMode;
  // Supersaw: time = map(Rational{curve}.get(randUnit), Min, Max)
  const double u = clamp(voice.portaUnit, 0.0, 1.0);
  const double uWarped = rational01(u, portaCurve);
  const double timeSec = tMin + uWarped * (tMax - tMin);
  const double tSamples = timeSec * (sampleRate > 1.0 ? sampleRate : 48000.0);
  if (!(tSamples > 1.0) || !(dsp_fabs(voice.targetHz - voice.currentHz) > 1.0e-12)) {
    voice.currentHz = voice.targetHz;
    voice.portaInc = 0.0;
    voice.portaCoeff = 1.0;
    voice.portaArmed = false;
    return;
  }
  voice.portaArmed = true;
  if (voice.portaMode == 0) {
    voice.portaInc = (voice.targetHz - voice.currentHz) / tSamples;
    voice.portaCoeff = 1.0;
  } else {
    voice.portaInc = 0.0;
    // Exp mode: one-pole toward target (LinExpSmoother-style time constant).
    const double a1 = dsp_exp(-1.0 / tSamples);
    voice.portaCoeff = 1.0 - a1;
    if (!(voice.portaCoeff > 0.0)) voice.portaCoeff = 1.0;
    if (voice.portaCoeff > 1.0) voice.portaCoeff = 1.0;
  }
}

void glideVoiceHz(DitherVoiceState& voice, double safeSampleRate) {
  if (!voice.portaArmed) {
    voice.currentHz = voice.targetHz;
  } else if (voice.portaMode == 0) {
    voice.currentHz += voice.portaInc;
    if (
      (voice.portaInc > 0.0 && voice.currentHz > voice.targetHz)
      || (voice.portaInc < 0.0 && voice.currentHz < voice.targetHz)
      || dsp_fabs(voice.portaInc) < 1.0e-30
    ) {
      voice.currentHz = voice.targetHz;
      voice.portaArmed = false;
    }
  } else {
    voice.currentHz += voice.portaCoeff * (voice.targetHz - voice.currentHz);
    if (dsp_fabs(voice.currentHz - voice.targetHz) <= 1.0e-6) {
      voice.currentHz = voice.targetHz;
      voice.portaArmed = false;
    }
  }
  // Cheap slope update from current Hz (full dither redistrib stays on prepare).
  const double hz = voice.currentHz > 1.0 ? voice.currentHz : 1.0;
  const double meanCycle = safeSampleRate / hz;
  const double maxCount = meanCycle > 1.0 ? meanCycle - 1.0 : 1.0;
  voice.phaseSlope = 1.0 / maxCount;
}

void prepareVoiceAtCents(
  DitherVoiceState& voice,
  double centsOffset,
  double safeFrequency,
  double safeSampleRate,
  double portaMinSec,
  double portaMaxSec,
  double portaStyle
) {
  voice.centsOffset = centsOffset;
  const double ratio = centsToRatio(centsOffset);
  const double voiceFreq = safeFrequency * ratio;
  const bool first = !(voice.currentHz > 0.0);
  voice.targetHz = voiceFreq > 1.0 ? voiceFreq : 1.0;
  if (first) voice.currentHz = voice.targetHz;
  configureVoicePortamento(voice, portaMinSec, portaMaxSec, portaStyle, safeSampleRate);
  applyHzToVoiceCycle(voice, voice.currentHz, safeSampleRate);
}

// ---- Detune algorithms (UI order) ----
// 0 Linear, 1 Chordal, 2 Emotional, 3 Realistic, 4 Classic, 5 Uniform, 6 Exponential.
// Ratio algos map into ±Detune/2. Emotional & Realistic also cluster-center
// (median → unison) then re-stretch extremes to ±Detune/2.
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

// Fill raw positive weights for the current voice count (not a max-N slice).
void fillRawRatiosForN(double* out, int n, int supersawAlgo /*0..5*/) {
  ensurePrimes();
  double p1 = 1.0;
  int kind = 0; // 0=primePower, 1=primePowerDiff, 2=linToExp
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

  // Uniform: original even cents around unison.
  if (algo == kAlgoUniform) {
    for (int i = 0; i < voiceCount; i++) {
      const double t = static_cast<double>(i) / static_cast<double>(voiceCount - 1);
      centsOut[i] = (t - 0.5) * (2.0 * half);
    }
    return;
  }

  // Map UI index → RatioGenerator kind used by fillRawRatiosForN:
  // Classic=0, Realistic=1, Emotional=2, Chordal=3, Linear=4, Exponential=5.
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

  // Realistic / Emotional: perceived pitch follows the dense cluster, so shift
  // median → 0 then re-stretch first/last to exact ±Detune/2.
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

void prepareVoiceBank(
  DitherVoiceState* bank,
  int voiceCount,
  double lastFrac,
  double safeFrequency,
  double safeSampleRate,
  double spreadCents,
  int detuneAlgorithm,
  double portaMinSec,
  double portaMaxSec,
  double portaStyle
) {
  double cents[kMaxVoices];
  fillVoiceCents(cents, voiceCount, detuneAlgorithm, spreadCents);
  for (int i = 0; i < voiceCount; i++) {
    prepareVoiceAtCents(
      bank[i], cents[i], safeFrequency, safeSampleRate, portaMinSec, portaMaxSec, portaStyle
    );
    (void)lastFrac;
  }
}

double sumPreparedVoiceBank(
  DitherVoiceState* bank,
  int voiceCount,
  double lastFrac,
  double randomPhaseAmount,
  double safeSampleRate,
  bool portaOn
) {
  double sum = 0.0;
  double norm = 0.0;
  for (int i = 0; i < voiceCount; i++) {
    if (portaOn) glideVoiceHz(bank[i], safeSampleRate);
    else bank[i].currentHz = bank[i].targetHz;
    double saw = sawFromPhasor(getSamplePhasor(bank[i], randomPhaseAmount));
    double amp = 1.0;
    if (lastFrac > 0.0 && i == voiceCount - 1) amp = lastFrac;
    sum += saw * amp;
    norm += amp;
  }
  return sum * bankMixScale(norm);
}

struct RobinSupersawState {
  bool active;
  DitherVoiceState left[kMaxVoices];
  DitherVoiceState right[kMaxVoices];
  double outLeft;
  double outRight;
  double outMono;
  double blockOutLeft[kMaxBlockFrames];
  double blockOutRight[kMaxBlockFrames];
  double blockOutMono[kMaxBlockFrames];
  // Face publish: detune X (0..1 = ±0.5 oct), pan (−1/0/+1), amp
  int publishCount;
  double publishX[kMaxVoices * 2];
  double publishPan[kMaxVoices * 2];
  double publishAmp[kMaxVoices * 2];
  double lastPhaseSpread;
  double lastReset;
};

static RobinSupersawState gPool[kMaxInstances];

void seedBank(DitherVoiceState* bank, int instanceIndex, int channelSalt) {
  for (int v = 0; v < kMaxVoices; v++) {
    DitherVoiceState& voice = bank[v];
    voice.rngState = static_cast<unsigned int>(
      1469598103u + (instanceIndex + 1) * 747796405u + (v + 1) * 2891336453u + channelSalt * 40503u
    );
    voice.lenMid = 100.0;
    voice.probShort = 0.0;
    voice.probMid = 1.0;
    voice.lenNow = 100.0;
    voice.phaseSlope = 1.0 / 99.0;
    voice.sampleCount = 0.0;
    voice.centsOffset = 0.0;
    voice.phaseRandom = randomUnit(voice.rngState);
    voice.targetHz = 0.0;
    voice.currentHz = 0.0;
    voice.portaUnit = randomUnit(voice.rngState);
    voice.portaInc = 0.0;
    voice.portaCoeff = 1.0;
    voice.portaMode = 0;
    voice.portaArmed = false;
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

double centsToFaceX(double centsOffset) {
  // Face width = 1 octave (±0.5). Unison at 0.5. Wrap so voices beyond
  // ±0.5 oct still appear (e.g. +700¢ → same screen slot as −500¢).
  const double span = 2.0 * kFaceHalfOctaveCents; // 1200¢
  double x = 0.5 + (centsOffset / span);
  x -= floorD(x);
  if (x < 0.0) x += 1.0;
  if (x >= 1.0) x = 0.0;
  return x;
}

// Alternating mode pans: walk the detune stack L R L R… (not low-half/L
// high-half/R). Voices=1 stays center.
double alternatingPan(int index, int voiceCount) {
  if (voiceCount <= 1) return 0.0;
  return ((index & 1) == 0) ? -1.0 : 1.0;
}

// Dual Channel: same detune map on L and R — one column per voice, red+blue
// stacked at that X (both channels share every cents offset).
void publishVoicesDual(RobinSupersawState& s, int voiceCount, double lastFrac) {
  int n = 0;
  for (int i = 0; i < voiceCount && n + 1 < kMaxVoices * 2; i++) {
    const double x = centsToFaceX(s.left[i].centsOffset);
    const double amp = (lastFrac > 0.0 && i == voiceCount - 1) ? lastFrac : 1.0;
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

void publishVoicesAlternating(RobinSupersawState& s, int voiceCount, double lastFrac) {
  int n = 0;
  for (int i = 0; i < voiceCount && n < kMaxVoices * 2; i++) {
    s.publishX[n] = centsToFaceX(s.left[i].centsOffset);
    s.publishPan[n] = alternatingPan(i, voiceCount);
    s.publishAmp[n] = (lastFrac > 0.0 && i == voiceCount - 1) ? lastFrac : 1.0;
    n += 1;
  }
  s.publishCount = n;
}

// Mix one bank with alternating pans into L/R (center → both at 0.5).
void mixAlternatingBank(
  DitherVoiceState* bank,
  int voiceCount,
  double lastFrac,
  double randomPhaseAmount,
  double safeSampleRate,
  bool portaOn,
  double* outL,
  double* outR
) {
  double left = 0.0;
  double right = 0.0;
  double normL = 0.0;
  double normR = 0.0;
  for (int i = 0; i < voiceCount; i++) {
    if (portaOn) glideVoiceHz(bank[i], safeSampleRate);
    else bank[i].currentHz = bank[i].targetHz;
    double saw = sawFromPhasor(getSamplePhasor(bank[i], randomPhaseAmount));
    double amp = 1.0;
    if (lastFrac > 0.0 && i == voiceCount - 1) amp = lastFrac;
    const double pan = alternatingPan(i, voiceCount);
    if (pan < -0.25) {
      left += saw * amp;
      normL += amp;
    } else if (pan > 0.25) {
      right += saw * amp;
      normR += amp;
    } else {
      left += saw * amp * 0.5;
      right += saw * amp * 0.5;
      normL += amp * 0.5;
      normR += amp * 0.5;
    }
  }
  *outL = left * bankMixScale(normL);
  *outR = right * bankMixScale(normR);
}

// Reset free-runs to phase 0 and re-rolls random phase + porta time units.
void resetBanks(RobinSupersawState& s) {
  for (int v = 0; v < kMaxVoices; v++) {
    if (s.left[v].lenMid > 1.0) {
      s.left[v].lenNow = s.left[v].lenMid;
      updateCycleLength(s.left[v]);
    }
    if (s.right[v].lenMid > 1.0) {
      s.right[v].lenNow = s.right[v].lenMid;
      updateCycleLength(s.right[v]);
    }
    s.left[v].sampleCount = 0.0;
    s.right[v].sampleCount = 0.0;
    rerollPhaseRandom(s.left[v]);
    rerollPhaseRandom(s.right[v]);
    s.left[v].portaUnit = randomUnit(s.left[v].rngState);
    s.right[v].portaUnit = randomUnit(s.right[v].rngState);
  }
}

}  // namespace

extern "C" int soemdsp_robin_supersaw_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = RobinSupersawState{};
      gPool[i].active = true;
      seedBank(gPool[i].left, i, 1);
      seedBank(gPool[i].right, i, 2);
      gPool[i].publishCount = 0;
      gPool[i].lastPhaseSpread = 0.0;
      gPool[i].lastReset = 0.0;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_robin_supersaw_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_robin_supersaw_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  resetBanks(gPool[handle - 1]);
}

extern "C" void soemdsp_robin_supersaw_process_block(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneCents,
  double voicesExact,
  double level,
  double phaseSpread,
  double stereoMode,
  double detuneAlgorithm,
  double portaTimeMin,
  double portaTimeMax,
  double portamentoStyle,
  double resetGate,
  int frameCount
) {
  if (handle < 1 || handle > kMaxInstances) return;
  RobinSupersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double safeFrequency = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  const double spreadCents = maxd(0.0, safe(detuneCents));
  const double safeLevel = safe(level);
  const double safeRandomPhase = safe(phaseSpread);
  const double portaMin = maxd(0.0, safe(portaTimeMin));
  const double portaMax = maxd(0.0, safe(portaTimeMax));
  const double portaStyle = clamp(safe(portamentoStyle), 0.0, 1.0);
  const bool portaOn = portamentoEnabled(portaMin, portaMax);
  // 0 = Dual Channel (N per L + N per R), 1 = Alternating (one bank, LRLR pans)
  const int mode = (safe(stereoMode) >= 0.5) ? 1 : 0;
  int algo = static_cast<int>(floorD(safe(detuneAlgorithm) + 0.5));
  if (algo < 0) algo = 0;
  if (algo >= kDetuneAlgoCount) algo = kDetuneAlgoCount - 1;
  int voiceCount = 1;
  double lastFrac = 0.0;
  resolveVoices(voicesExact, &voiceCount, &lastFrac);

  const double reset = safe(resetGate);
  if (s.lastReset <= 0.0 && reset > 0.0) {
    resetBanks(s);
  }
  s.lastReset = reset;
  s.lastPhaseSpread = safeRandomPhase;

  prepareVoiceBank(
    s.left, voiceCount, lastFrac, safeFrequency, safeSampleRate, spreadCents, algo,
    portaMin, portaMax, portaStyle
  );
  if (mode == 0) {
    // Dual: same detune map on Right (independent pitch dither).
    prepareVoiceBank(
      s.right, voiceCount, lastFrac, safeFrequency, safeSampleRate, spreadCents, algo,
      portaMin, portaMax, portaStyle
    );
  }

  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    double left = 0.0;
    double right = 0.0;
    if (mode == 0) {
      // Dual channel: N voices per side, independent dither.
      left = sumPreparedVoiceBank(s.left, voiceCount, lastFrac, safeRandomPhase, safeSampleRate, portaOn);
      right = sumPreparedVoiceBank(s.right, voiceCount, lastFrac, safeRandomPhase, safeSampleRate, portaOn);
    } else {
      mixAlternatingBank(
        s.left, voiceCount, lastFrac, safeRandomPhase, safeSampleRate, portaOn, &left, &right
      );
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
  if (mode == 0) publishVoicesDual(s, voiceCount, lastFrac);
  else publishVoicesAlternating(s, voiceCount, lastFrac);
}

extern "C" void soemdsp_robin_supersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneCents,
  double voicesExact,
  double level,
  double phaseSpread,
  double stereoMode,
  double detuneAlgorithm,
  double portaTimeMin,
  double portaTimeMax,
  double portamentoStyle,
  double resetGate
) {
  soemdsp_robin_supersaw_process_block(
    handle, frequencyHz, sampleRate, detuneCents, voicesExact, level, phaseSpread,
    stereoMode, detuneAlgorithm, portaTimeMin, portaTimeMax, portamentoStyle, resetGate, 1
  );
}

extern "C" int soemdsp_robin_supersaw_block_output_left_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutLeft);
}

extern "C" int soemdsp_robin_supersaw_block_output_right_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutRight);
}

extern "C" int soemdsp_robin_supersaw_block_output_mono_ptr(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return reinterpret_cast<int>(gPool[handle - 1].blockOutMono);
}

extern "C" int soemdsp_robin_supersaw_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" double soemdsp_robin_supersaw_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_robin_supersaw_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" double soemdsp_robin_supersaw_mono(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outMono;
}

extern "C" int soemdsp_robin_supersaw_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].publishCount;
}

extern "C" double soemdsp_robin_supersaw_voice_x(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.5;
  const RobinSupersawState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.5;
  return s.publishX[index];
}

extern "C" double soemdsp_robin_supersaw_voice_pan(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const RobinSupersawState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.0;
  return s.publishPan[index];
}

extern "C" double soemdsp_robin_supersaw_voice_amp(int handle, int index) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  const RobinSupersawState& s = gPool[handle - 1];
  if (index < 0 || index >= s.publishCount) return 0.0;
  return s.publishAmp[index];
}

extern "C" int soemdsp_robin_supersaw_version() {
  return 20; // Portamento Style: Supersaw Rational time-curve + Lin/Exp mode
}
