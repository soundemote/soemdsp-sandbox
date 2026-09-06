// soemdsp-native-module: hypersaw
// soemdsp-native-label: Hypersaw
// soemdsp-native-target: hypersaw
// soemdsp-native-kind: oscillator
//
// HypersawUnit / HypersawMaster port with corrected additive phase math:
//   phaseOffset = div*distribute + random*amt + vibrato*amp + walk
// Distribute is unclamped (2.0 wraps twice). Vibrato is additive PM via
// per-saw VibratoGenerator (cheap sine wavetable) — Vibrato Distribution is
// per-saw random LFO phase amount (Master Seed), not a gate on Distribute.
//
// Shared locked master phase (SoEm slaveIncrement). Relative positions come
// only from phaseOffset. Rising Reset re-zeros master + re-rolls seeds.
//
// Waveforms (soemdsp PolyBLEP): Trisaw, Saw, Pulse Center, Ramp, Pulse,
// RectifiedSin, Trapezoid. Morph = PWM/width for Trisaw / Pulse / Pulse Center.
//
// Display: soemdsp_hypersaw_voice_phase → wrap01(phaseOffset).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 64;

double clampD(double value, double lo, double hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state ? state : 0xA341316Cu;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

double randomUnipolar(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0);
}

double randomBipolar(unsigned int& state) {
  return randomUnipolar(state) * 2.0 - 1.0;
}

// soemdsp::oscillator::PolyBLEP blep / blamp (quadratic / cubic).
static const double k1z3 = 1.0 / 3.0;
static const double k4zPI = 4.0 / 3.141592653589793238;

double blepSoem(double t, double dt) {
  const double d = dt > 1.0e-12 ? dt : 1.0e-12;
  if (t < d) {
    const double u = t / d - 1.0;
    return -(u * u);
  }
  if (t > 1.0 - d) {
    const double u = (t - 1.0) / d + 1.0;
    return u * u;
  }
  return 0.0;
}

double blampSoem(double t, double dt) {
  const double d = dt > 1.0e-12 ? dt : 1.0e-12;
  if (t < d) {
    const double u = t / d - 1.0;
    return -k1z3 * u * u * u;
  }
  if (t > 1.0 - d) {
    const double u = (t - 1.0) / d + 1.0;
    return k1z3 * u * u * u;
  }
  return 0.0;
}

static inline double morphWidth01(double morph) {
  double w = (morph == morph) ? morph : 0.5;
  if (w < 0.0) w = 0.0;
  if (w > 1.0) w = 1.0;
  if (w < 1.0e-4) w = 1.0e-4;
  if (w > 1.0 - 1.0e-4) w = 1.0 - 1.0e-4;
  return w;
}

// Waveform indices (UI order):
// 0 Trisaw, 1 Saw, 2 Pulse Center, 3 Ramp, 4 Pulse, 5 RectifiedSin, 6 Trapezoid
double polyBlepTrisaw(double t, double dt, double morph) {
  const double pw = morphWidth01(morph);
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
  y += dt / (pw - pw * pw) * (blampSoem(t1, dt) - blampSoem(t2, dt));
  return y;
}

double polyBlepSaw(double t, double dt) {
  double y = 1.0 - 2.0 * t;
  y += blepSoem(t, dt);
  return y;
}

double polyBlepRamp(double t, double dt) {
  const double t1 = wrap01(t + 0.5);
  double y = t1 * 2.0 - 1.0;
  y -= blepSoem(t1, dt);
  return y;
}

double polyBlepPulse(double t, double dt, double morph) {
  const double pw = morphWidth01(morph);
  const double t1 = wrap01(t + 1.0 - pw);
  double y = -2.0 * pw;
  if (t < pw) y += 2.0;
  y += blepSoem(t, dt) - blepSoem(t1, dt);
  return y;
}

double polyBlepPulseCenter(double t, double dt, double morph) {
  const double u = morphWidth01(morph);
  double t1 = wrap01(t + 0.875 + 0.25 * (u - 0.5));
  double t2 = wrap01(t + 0.375 + 0.25 * (u - 0.5));
  double y = t1 < 0.5 ? 1.0 : -1.0;
  y += blepSoem(t1, dt) - blepSoem(t2, dt);
  t1 = wrap01(t1 + 0.5 * (1.0 - u));
  t2 = wrap01(t2 + 0.5 * (1.0 - u));
  y += t1 < 0.5 ? 1.0 : -1.0;
  y += blepSoem(t1, dt) - blepSoem(t2, dt);
  return 0.5 * y;
}

double polyBlepRectSin(double t, double dt) {
  const double t1 = wrap01(t + 0.25);
  // 2·sin(π·t1) − 4/π  (soemdsp PolyBLEP::rectSinFull)
  double y = 2.0 * dsp_sin(kPi * t1) - k4zPI;
  y += kTwoPi * dt * blampSoem(t1, dt);
  return y;
}

double polyBlepTrapezoid(double t, double dt) {
  double y = 4.0 * t;
  if (y >= 3.0) {
    y -= 4.0;
  } else if (y > 1.0) {
    y = 2.0 - y;
  }
  y = clampD(2.0 * y, -1.0, 1.0);

  double t1 = wrap01(t + 0.125);
  double t2 = wrap01(t1 + 0.5);
  y += 4.0 * dt * (blampSoem(t1, dt) - blampSoem(t2, dt));

  t1 = wrap01(t + 0.375);
  t2 = wrap01(t1 + 0.5);
  y += 4.0 * dt * (blampSoem(t1, dt) - blampSoem(t2, dt));
  return y;
}

double hypersawWaveSample(int waveform, double phase, double dt, double morph) {
  const double d = dt > 1.0e-12 ? dt : 1.0e-12;
  switch (waveform) {
    case 0: return polyBlepTrisaw(phase, d, morph);
    case 1: return polyBlepSaw(phase, d);
    case 2: return polyBlepPulseCenter(phase, d, morph);
    case 3: return polyBlepRamp(phase, d);
    case 4: return polyBlepPulse(phase, d, morph);
    case 5: return polyBlepRectSin(phase, d);
    case 6: return polyBlepTrapezoid(phase, d);
    default: return polyBlepSaw(phase, d);
  }
}

// FlexibleRandomWalk (HypersawUnit::drift_) — phase modulation only.
// DriftStyle: 0 = Random Steps, 1 = Fixed Steps (no filtered-noise / LPF path).
static inline double rational_curve01(double value, double skew) {
  double t = value < 0.0 ? 0.0 : (value > 1.0 ? 1.0 : value);
  double s = skew < -0.999 ? -0.999 : (skew > 0.999 ? 0.999 : skew);
  return ((1.0 + s) * t) / (1.0 - s + 2.0 * s * t);
}

// soemdsp::convert::pitch_to_freq (MIDI note → Hz). C0 / note 0 ≈ 8.176 Hz.
static inline double pitch_to_freq(double pitch) {
  return 8.1757989156437073336828122976033
    * dsp_exp(0.057762265046662109118102676788181 * pitch);
}

static inline double freq_to_pitch(double hz) {
  if (!(hz > 1.0e-12)) return -128.0;
  return 12.0 * (dsp_ln(hz / 440.0) / dsp_ln(2.0)) + 69.0;
}

// DriftPitch → FlexibleRandomWalk LPF cutoff (Hz), then × pitch factor.
// UI compensation is remapped from listening: former −1 (high-more curve)
// sounded even across the keyboard, so that is the new center.
//   UI  0 → internal −1  (subjectively even / former −1)
//   UI +1 → internal +1  (lows more, highs less — former +1)
//   UI −1 → internal −3  (highs even more extreme than former −1)
// Rational ±0.95 eases the keyboard slope (SoEm Supersaw spirit).
static inline double map0to1(double t, double a, double b) {
  if (t < 0.0) t = 0.0;
  if (t > 1.0) t = 1.0;
  return a + t * (b - a);
}

static inline double drift_frequency_from_pitch(
  double driftPitchSt,
  double driftCompensation,
  double oscFrequencyHz,
  double sampleRate
) {
  const double minPitch = 23.0;   // ~B0
  const double maxPitch = 103.0;  // ~G7
  const double minPitchComp = 0.0;
  const double maxPitchComp = 24.0;
  const double curveVariable = 0.95;

  double baseHz = pitch_to_freq(driftPitchSt);

  double ui = driftCompensation;
  if (ui < -1.0) ui = -1.0;
  if (ui > 1.0) ui = 1.0;
  // [-1, +1] UI → [-3, +1] internal (0 lands on former −1).
  const double c = -1.0 + 2.0 * ui;
  const double absC = c < 0.0 ? -c : c;

  double minMult;
  double maxMult;
  if (absC <= 1.0) {
    minMult = map0to1(absC, 1.0, minPitchComp);
    maxMult = map0to1(absC, 1.0, maxPitchComp);
  } else {
    // Beyond |1|: keep the quiet end at 0, push the loud end further.
    minMult = minPitchComp;
    maxMult = maxPitchComp * absC;
  }

  double factor = 1.0;
  if (absC > 1.0e-12 && oscFrequencyHz > 1.0e-12) {
    double voicePitch = freq_to_pitch(oscFrequencyHz);
    if (voicePitch < minPitch) voicePitch = minPitch;
    if (voicePitch > maxPitch) voicePitch = maxPitch;
    const double pitchNorm = (voicePitch - minPitch) / (maxPitch - minPitch);
    if (c >= 0.0) {
      // Low → maxMult, high → minMult (more drift down low).
      factor = map0to1(rational_curve01(pitchNorm, +curveVariable), maxMult, minMult);
    } else {
      // Low → minMult, high → maxMult (more drift up high).
      factor = map0to1(rational_curve01(pitchNorm, -curveVariable), minMult, maxMult);
    }
  }

  double hz = baseHz * factor;
  const double nyq = sampleRate > 1.0 ? sampleRate * 0.5 : 22050.0;
  if (hz < 0.0) hz = 0.0;
  if (hz > nyq) hz = nyq;
  return hz;
}

struct DriftWalkState {
  double out;     // raw bipolar walk accumulator
  double lpfOut;  // OnePoleLP of out (SoEm FlexibleRandomWalk::lpf_)
  unsigned int rng;
};

static inline void drift_walk_reset(DriftWalkState& d) {
  d.out = 0.0;
  d.lpfOut = 0.0;
}

// FlexibleRandomWalk random_steps / fixed_steps + OnePoleLP.
// Step size is mostly from jitter (SoEm: increment ≈ freq/sr² cancels in the
// map0to1 blend). DriftPitch Hz drives the output LPF — low pitch freezes drift.
// style: 0 = Random Steps, 1 = Fixed Steps.
static inline double drift_walk_run(
  DriftWalkState& d,
  int style,
  double frequencyHz,
  double jitterHz,
  double sampleRate
) {
  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double freq = frequencyHz > 0.0 ? frequencyHz : 0.0;
  const double jitter = jitterHz > 0.0 ? jitterHz : 0.0;
  const double noise = randomBipolar(d.rng);

  // Match FlexibleRandomWalk::frequencyChanged:
  //   increment = frequencyToIncrement(frequency * period) = freq / sr²
  const double period = 1.0 / sr;
  const double increment = freq * period * period;
  const double inc = increment < 0.0 ? 0.0 : (increment > 1.0 ? 1.0 : increment);
  const double jitterIncRaw = jitter * period;
  const double jitterInc = jitterIncRaw < 0.0 ? 0.0 : (jitterIncRaw > 1.0 ? 1.0 : jitterIncRaw);
  const double mapped = rational_curve01(jitterInc, 0.99);
  // stepSize = increment + map0to1(mapped, -increment, 1-increment)
  double stepSize = inc + (-inc + (1.0 - inc) * mapped);
  if (stepSize < 0.0) stepSize = 0.0;
  if (stepSize > 1.0) stepSize = 1.0;
  const bool fixedSteps = (style >= 1);
  const double step = fixedSteps ? (noise > 0.0 ? stepSize : -stepSize) : (noise * stepSize);
  d.out += step;
  if (d.out > 1.0) d.out = 1.0;
  if (d.out < -1.0) d.out = -1.0;

  // OnePoleLP (MZT): w = min(τ/sr, τ/44100) * frequencyHz; y = (1-a)·x + a·y
  static const double kTauOver44100 = 0.000142475857;
  const double tauZSr = kTwoPi / sr;
  const double wScale = tauZSr < kTauOver44100 ? tauZSr : kTauOver44100;
  double w = wScale * freq;
  if (w < 0.0) w = 0.0;
  double a1 = dsp_exp(-w);
  if (a1 > 1.0) a1 = 1.0;
  if (a1 < 0.0) a1 = 0.0;
  d.lpfOut = (1.0 - a1) * d.out + a1 * d.lpfOut;
  if (!(d.lpfOut * 0.0 == 0.0)) d.lpfOut = 0.0;
  return d.lpfOut;
}

struct HypersawVoiceState {
  double randomOffset;     // bipolar −1…+1 for Randomize Phase
  double vibPhaseRandom;   // unipolar 0…1 for Vibrato Distribution
  DriftWalkState drift;
  double lastOffset;
  unsigned int rngState;
};

struct HypersawState {
  bool active;
  HypersawVoiceState voices[kMaxVoices];
  // One shared free-phase for every saw (SoEm slaveIncrement). Relative
  // positions come only from phaseOffset (distribute/random/vibrato/drift).
  double masterPhase;
  // Shared vibrato LFO phase; per-saw offset = vibPhaseRandom * vibratoDistribution.
  double masterVibPhase;
  unsigned int masterRng;
  int lastVoiceCount;
  double lastVoiceFrac;
  double lastSeed;
  double outLeft;
  double outRight;
};

static HypersawState gPool[kMaxInstances];

// Master Seed drives every per-voice RNG (randomize, vibrato distribute, drift).
void seedVoice(HypersawVoiceState& voice, int instanceIndex, int voiceIndex, unsigned int masterSeed) {
  voice.rngState = masterSeed
    ^ static_cast<unsigned int>((instanceIndex + 1) * 16777619u)
    ^ static_cast<unsigned int>((voiceIndex + 1) * 2654435761u);
  if (!voice.rngState) voice.rngState = 0x9E3779B9u;
  voice.randomOffset = randomBipolar(voice.rngState);
  voice.vibPhaseRandom = randomUnipolar(voice.rngState);
  voice.drift.rng = voice.rngState ^ 0x27D4EB2Du;
  if (!voice.drift.rng) voice.drift.rng = 1u;
  drift_walk_reset(voice.drift);
  voice.lastOffset = 0.0;
}

void reseedAll(HypersawState& s, int instanceIndex, unsigned int masterSeed) {
  s.masterRng = masterSeed ? masterSeed : 0xC2B2AE3Du;
  s.masterPhase = 0.0;
  s.masterVibPhase = 0.0;
  s.lastVoiceCount = 0;
  s.lastSeed = static_cast<double>(masterSeed);
  for (int v = 0; v < kMaxVoices; v++) {
    seedVoice(s.voices[v], instanceIndex, v, s.masterRng);
  }
}

}  // namespace

extern "C" int soemdsp_hypersaw_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = HypersawState{};
      gPool[i].active = true;
      reseedAll(gPool[i], i, 0xC2B2AE3Du ^ static_cast<unsigned int>((i + 1) * 0x85EBCA6Bu));
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_hypersaw_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_hypersaw_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];
  s.masterPhase = 0.0;
  s.masterVibPhase = 0.0;
  // Re-roll from each voice's seeded RNG (deterministic under Master Seed).
  for (int v = 0; v < kMaxVoices; v++) {
    seedVoice(s.voices[v], handle - 1, v, s.masterRng);
  }
}

// Phase Modulation (SoEmHypersaw):
//   VibratoDistribution 0…1 = per-saw random vibrato LFO phase amount
//   DistributePhase / RandomizePhase / VibratoAmp / VibratoSpeed
//   DriftStyle / DriftAmp / DriftPitch / DriftJitter / DriftCompensation
// Saws are phase-modulated only (no FM of the sawtooth pitch).
extern "C" void soemdsp_hypersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseGlobal,
  double numVoicesExact,
  double distributePhase,
  double randomizePhase,
  double vibratoDistribution,
  double vibratoAmp,
  double vibratoSpeedHz,
  double driftStyle,
  double driftAmp,
  double driftPitchSt,
  double driftJitterHz,
  double driftCompensation,
  double centerSide,
  double waveform,
  double morph,
  double level,
  double seedParam
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];

  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double freq = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;

  if (!(seedParam == s.lastSeed)) {
    unsigned int seedU = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
    if (!seedU) seedU = 1u;
    reseedAll(s, handle - 1, seedU);
    s.lastSeed = seedParam;
  }

  double exact = (numVoicesExact == numVoicesExact) ? numVoicesExact : 0.0;
  if (exact < 0.0) exact = 0.0;
  if (exact > static_cast<double>(kMaxVoices)) exact = static_cast<double>(kMaxVoices);
  int voiceCount = 0;
  double lastFrac = 0.0;
  if (exact > 0.0) {
    const double fullF = __builtin_floor(exact + 1e-9);
    const int full = static_cast<int>(fullF);
    lastFrac = exact - fullF;
    if (lastFrac > 1e-9) {
      voiceCount = full + 1;
      if (voiceCount > kMaxVoices) {
        voiceCount = kMaxVoices;
        lastFrac = 0.0;
      }
    } else {
      voiceCount = full;
      lastFrac = 0.0;
    }
  }
  if (voiceCount < 1) {
    s.lastVoiceCount = 0;
    s.lastVoiceFrac = 0.0;
    s.outLeft = 0.0;
    s.outRight = 0.0;
    return;
  }
  s.lastVoiceFrac = lastFrac;

  const double distribute = (distributePhase == distributePhase) ? distributePhase : 0.0;
  const double randomAmt = (randomizePhase == randomizePhase) ? randomizePhase : 0.0;
  const double vibDist = (vibratoDistribution == vibratoDistribution) ? vibratoDistribution : 0.0;
  const double vibAmp = (vibratoAmp == vibratoAmp) ? vibratoAmp : 0.0;
  const double vibHz = (vibratoSpeedHz == vibratoSpeedHz) ? vibratoSpeedHz : 0.0;
  // Canonical: 0 = Random Steps, 1 = Fixed Steps.
  // Legacy SoEm 2→0 (Random), 3→1 (Fixed); old Filtered (1) → Fixed.
  int styleRaw = (int)(driftStyle + (driftStyle >= 0.0 ? 0.5 : -0.5));
  int style;
  if (styleRaw >= 3) style = 1;
  else if (styleRaw == 2) style = 0;
  else if (styleRaw <= 0) style = 0;
  else style = 1;
  const double driftA = (driftAmp == driftAmp) ? driftAmp : 0.0;
  const double driftPitch = (driftPitchSt == driftPitchSt) ? driftPitchSt : 64.256;
  const double driftJ = (driftJitterHz == driftJitterHz && driftJitterHz > 0.0) ? driftJitterHz : 0.0;
  const double driftComp = (driftCompensation == driftCompensation) ? driftCompensation : 0.0;
  const double cs = clampD(centerSide, 0.0, 1.0);
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  if (wave < 0) wave = 0;
  if (wave > 6) wave = 6;
  // Morph = PWM / width for Trisaw, Pulse, Pulse Center (0.5 = center / 50%).
  const double morphAmt = (morph == morph) ? morph : 0.5;
  const double gain = (level == level) ? level : 0.0;
  const double phaseG = (phaseGlobal == phaseGlobal) ? phaseGlobal : 0.0;

  // DriftPitch (+ Compensation vs osc pitch) → walk frequency Hz. Jitter is separate.
  const double driftFreqHz = drift_frequency_from_pitch(driftPitch, driftComp, freq, sr);

  if (voiceCount != s.lastVoiceCount) {
    const int start = s.lastVoiceCount < 0 ? 0 : s.lastVoiceCount;
    for (int v = start; v < voiceCount; v++) {
      // New voices join the shared master phase — do not free-run from 0.
      s.voices[v].randomOffset = randomBipolar(s.voices[v].rngState);
      drift_walk_reset(s.voices[v].drift);
    }
    s.lastVoiceCount = voiceCount;
  }

  // Center/Side balances center vs L/R sides. With only one oscillator (always
  // the center) ignore it so √N mix still yields full level — not silence.
  double ampCenter = (2.0 - cs * 2.0) < 1.0 ? (2.0 - cs * 2.0) : 1.0;
  double ampSides = (cs * 2.0) < 1.0 ? (cs * 2.0) : 1.0;
  if (voiceCount < 2) {
    ampCenter = 1.0;
    ampSides = 0.0;
  }

  const double phaseIncrement = freq / sr;
  const double blepDt = phaseIncrement < 0.0 ? -phaseIncrement : phaseIncrement;
  const double vibInc = hz_to_increment(vibHz, sr);

  // Shared vibrato rate; per-saw phase = master + random[0,1) × Vibrato Distribution.
  s.masterVibPhase = wrap01(s.masterVibPhase + vibInc);

  double leftSum = 0.0;
  double rightSum = 0.0;
  // Amp weights for √N mix (RobinSupersaw bankMixScale) — /N was too quiet as voices rise.
  double leftWeight = 0.0;
  double rightWeight = 0.0;
  int sideCh = 0;

  for (int i = 0; i < voiceCount; i++) {
    HypersawVoiceState& voice = s.voices[i];
    const double div = static_cast<double>(i) / static_cast<double>(voiceCount);

    // Phase modulation only (HypersawUnit::run walkOut / vib — no sawtooth FM).
    double walkOut = 0.0;
    if (driftA > 0.0) {
      walkOut = drift_walk_run(voice.drift, style, driftFreqHz, driftJ, sr) * driftA;
    }

    const double vibOut = dsp_sin_turns_lut(
      wrap01(s.masterVibPhase + voice.vibPhaseRandom * vibDist)
    );

    // Hard +0.5 so voice 0 sits at scope center; distribute fans left/right.
    const double distribute_i = div * distribute;
    const double random_i = voice.randomOffset * randomAmt;
    const double vibrato_i = vibOut * vibAmp;
    const double phaseOffset = 0.5 + distribute_i + random_i + vibrato_i + walkOut;
    // Scope lines include Frequency→Phase so twisting Phase slides the stems.
    voice.lastOffset = wrap01(phaseG + phaseOffset);

    // Exact locked phase: shared master + offset (not per-voice free-run).
    const double renderPhase = wrap01(s.masterPhase + phaseG + phaseOffset);
    double saw = hypersawWaveSample(wave, renderPhase, blepDt, morphAmt);
    double voiceAmp = 1.0;
    if (lastFrac > 0.0 && i == voiceCount - 1) voiceAmp = lastFrac;
    saw *= voiceAmp;

    // One center (green/mono) only — voice 0. Remaining alternate L/R.
    const bool isCenter = (i == 0);
    if (isCenter) {
      const double w = ampCenter * voiceAmp;
      const double c = saw * ampCenter;
      leftSum += c;
      rightSum += c;
      leftWeight += w;
      rightWeight += w;
    } else {
      const double w = ampSides * voiceAmp;
      const double side = saw * ampSides;
      if ((sideCh % 2) == 0) {
        leftSum += side;
        leftWeight += w;
      } else {
        rightSum += side;
        rightWeight += w;
      }
      sideCh += 1;
    }
  }

  // Advance the single shared free-phase once (all saws stay exactly locked).
  s.masterPhase = wrap01(s.masterPhase + phaseIncrement);

  // Detuned/phased saws are partly uncorrelated — √Σamp (not /N) like RobinSupersaw.
  const double leftScale = leftWeight > 0.0 ? (1.0 / __builtin_sqrt(leftWeight)) : 0.0;
  const double rightScale = rightWeight > 0.0 ? (1.0 / __builtin_sqrt(rightWeight)) : 0.0;
  double left = leftSum * leftScale;
  double right = rightSum * rightScale;
  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

  s.outLeft = clampD(left, -1.5, 1.5) * gain;
  s.outRight = clampD(right, -1.5, 1.5) * gain;
}

extern "C" double soemdsp_hypersaw_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_hypersaw_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" double soemdsp_hypersaw_voice_phase(int handle, int voiceIndex) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  if (voiceIndex < 0 || voiceIndex >= kMaxVoices) return 0.0;
  return gPool[handle - 1].voices[voiceIndex].lastOffset;
}

extern "C" int soemdsp_hypersaw_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].lastVoiceCount;
}

extern "C" double soemdsp_hypersaw_voice_last_frac(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastVoiceFrac;
}

extern "C" int soemdsp_hypersaw_max_voices() {
  return kMaxVoices;
}

extern "C" int soemdsp_hypersaw_version() {
  return 19; // solo oscillator ignores Center/Side mute
}
