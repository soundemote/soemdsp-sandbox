// soemdsp-native-module: hypersaw2
// soemdsp-native-label: Hypersaw2
// soemdsp-native-target: hypersaw2
// soemdsp-native-kind: oscillator
//
// Hypersaw2: PolyBLEP + HypersawUnit::run phase math + Random Steps jitter.
//   phase = div*distribute + random*amt          (vibratoOut_ unused / 0 in SoEm)
//   phaseOffset = phase * (vibInput*vibAmp + vibOffset) + walkOut
// vibOffset = Phase Multiplier (default 1). vibInput = shared sine (vibOsc_).
// SoEm leaves unit 0's vibInput unconnected (0) — center gets no LFO on the scale.
// +0.5 face center is sandbox-only. Jitter walkOut after the multiply.
//
// Waveforms (soemdsp PolyBLEP): Trisaw, Saw, Ramp, Pulse, Pulse Center,
// RectifiedSin, Trapezoid. Morph = PWM/width for Trisaw / Pulse / Pulse Center.
//
// Display: soemdsp_hypersaw2_voice_phase → wrap01(phaseOffset).

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
// 0 Trisaw, 1 Saw, 2 Ramp, 3 Pulse, 4 Pulse Center, 5 RectifiedSin, 6 Trapezoid
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

double hypersaw2WaveSample(int waveform, double phase, double dt, double morph) {
  const double d = dt > 1.0e-12 ? dt : 1.0e-12;
  switch (waveform) {
    case 0: return polyBlepTrisaw(phase, d, morph);
    case 1: return polyBlepSaw(phase, d);
    case 2: return polyBlepRamp(phase, d);
    case 3: return polyBlepPulse(phase, d, morph);
    case 4: return polyBlepPulseCenter(phase, d, morph);
    case 5: return polyBlepRectSin(phase, d);
    case 6: return polyBlepTrapezoid(phase, d);
    default: return polyBlepSaw(phase, d);
  }
}

// --- Jitter: Hypersaw Random Steps (Amp / Jitter / Pitch) --------------------
// Distance = Drift Amp (phase depth). Speed = Drift Jitter (Hz, step size).
// Jitter Pitch = semitone offset from baked 64.256 (0 = pre-param LPF).
// Depth × |oscHz|/ref → constant temporal Δt.

static inline double rational_curve01(double value, double skew) {
  double t = value < 0.0 ? 0.0 : (value > 1.0 ? 1.0 : value);
  double s = skew < -0.999 ? -0.999 : (skew > 0.999 ? 0.999 : skew);
  return ((1.0 + s) * t) / (1.0 - s + 2.0 * s * t);
}

static inline double pitch_to_freq(double pitch) {
  return 8.1757989156437073336828122976033
    * dsp_exp(0.057762265046662109118102676788181 * pitch);
}

static const double kDistanceRefHz = 100.0; // osc Hz where Distance equals Drift Amp
// Former baked DriftPitch — Jitter Pitch 0 lands here.
static const double kJitterPitchBaseSt = 64.256;

struct JitterState {
  double out;     // raw bipolar walk accumulator
  double lpfOut;  // OnePoleLP (same as Hypersaw DriftWalkState)
  unsigned int rng;
};

static inline void jitter_reset(JitterState& j) {
  j.out = 0.0;
  j.lpfOut = 0.0;
}

// Exact Hypersaw drift_walk_run Random Steps path, then × Distance × distComp.
// distComp is |f|/ref (possibly slewed by caller) — not the carrier frequency.
static inline double hypersaw_random_steps(
  JitterState& j,
  double distance,       // Drift Amp
  double jitterHz,       // Drift Jitter
  double jitterPitchSt,  // offset from kJitterPitchBaseSt → LPF Hz
  double distComp,       // |f|/kDistanceRefHz (slewed)
  double sampleRate
) {
  if (!(distance > 0.0)) return 0.0;

  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  double walkFreqHz = pitch_to_freq(kJitterPitchBaseSt + jitterPitchSt);
  const double nyq = sr * 0.5;
  if (walkFreqHz < 0.0) walkFreqHz = 0.0;
  if (walkFreqHz > nyq) walkFreqHz = nyq;

  const double freq = walkFreqHz > 0.0 ? walkFreqHz : 0.0;
  const double jitter = jitterHz > 0.0 ? jitterHz : 0.0;
  const double noise = randomBipolar(j.rng);

  const double period = 1.0 / sr;
  const double increment = freq * period * period;
  const double inc = increment < 0.0 ? 0.0 : (increment > 1.0 ? 1.0 : increment);
  const double jitterIncRaw = jitter * period;
  const double jitterInc = jitterIncRaw < 0.0 ? 0.0 : (jitterIncRaw > 1.0 ? 1.0 : jitterIncRaw);
  const double mapped = rational_curve01(jitterInc, 0.99);
  double stepSize = inc + (-inc + (1.0 - inc) * mapped);
  if (stepSize < 0.0) stepSize = 0.0;
  if (stepSize > 1.0) stepSize = 1.0;

  // Random Steps only (not Fixed Steps).
  j.out += noise * stepSize;
  if (j.out > 1.0) j.out = 1.0;
  if (j.out < -1.0) j.out = -1.0;

  static const double kTauOver44100 = 0.000142475857;
  const double tauZSr = kTwoPi / sr;
  const double wScale = tauZSr < kTauOver44100 ? tauZSr : kTauOver44100;
  double w = wScale * freq;
  if (w < 0.0) w = 0.0;
  double a1 = dsp_exp(-w);
  if (a1 > 1.0) a1 = 1.0;
  if (a1 < 0.0) a1 = 0.0;
  j.lpfOut = (1.0 - a1) * j.out + a1 * j.lpfOut;
  if (!(j.lpfOut * 0.0 == 0.0)) j.lpfOut = 0.0;

  const double comp = distComp > 0.0 ? distComp : 0.0;
  return j.lpfOut * distance * comp;
}

struct Hypersaw2VoiceState {
  double randomOffset;     // bipolar −1…+1 for Randomize Phase
  double vibPhase;         // per-voice vibrato LFO phase
  double vibPhaseRandom;   // unipolar 0…1 — Vibrato Phase Vary
  double vibFreqBipolar;   // bipolar −1…+1 — Vibrato Freq Vary
  JitterState jitter;
  double lastOffset;
  unsigned int rngState;
};

struct Hypersaw2State {
  bool active;
  Hypersaw2VoiceState voices[kMaxVoices];
  // One shared free-phase for every saw (SoEm slaveIncrement). Relative
  // positions come only from phaseOffset (distribute/random/vibrato/jitter).
  double masterPhase;
  // Slewed |f|/ref for PM depth only — carrier freq is never smoothed.
  double distCompSmooth;
  unsigned int masterRng;
  int lastVoiceCount;
  double lastVoiceFrac;
  double lastSeed;
  double outLeft;
  double outRight;
};

static Hypersaw2State gPool[kMaxInstances];

// Master Seed drives every per-voice RNG (randomize + vibrato vary + jitter).
void seedVoice(Hypersaw2VoiceState& voice, int instanceIndex, int voiceIndex, unsigned int masterSeed) {
  voice.rngState = masterSeed
    ^ static_cast<unsigned int>((instanceIndex + 1) * 16777619u)
    ^ static_cast<unsigned int>((voiceIndex + 1) * 2654435761u);
  if (!voice.rngState) voice.rngState = 0x9E3779B9u;
  voice.randomOffset = randomBipolar(voice.rngState);
  voice.vibPhaseRandom = randomUnipolar(voice.rngState);
  voice.vibFreqBipolar = randomBipolar(voice.rngState);
  voice.vibPhase = 0.0;
  voice.jitter.rng = voice.rngState ^ 0x27D4EB2Du;
  if (!voice.jitter.rng) voice.jitter.rng = 1u;
  jitter_reset(voice.jitter);
  voice.lastOffset = 0.0;
}

void reseedAll(Hypersaw2State& s, int instanceIndex, unsigned int masterSeed) {
  s.masterRng = masterSeed ? masterSeed : 0xC2B2AE3Du;
  s.masterPhase = 0.0;
  s.distCompSmooth = 1.0; // unity at kDistanceRefHz until first sample
  s.lastVoiceCount = 0;
  s.lastSeed = static_cast<double>(masterSeed);
  for (int v = 0; v < kMaxVoices; v++) {
    seedVoice(s.voices[v], instanceIndex, v, s.masterRng);
  }
}

}  // namespace

extern "C" int soemdsp_hypersaw2_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = Hypersaw2State{};
      gPool[i].active = true;
      reseedAll(gPool[i], i, 0xC2B2AE3Du ^ static_cast<unsigned int>((i + 1) * 0x85EBCA6Bu));
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_hypersaw2_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_hypersaw2_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  Hypersaw2State& s = gPool[handle - 1];
  s.masterPhase = 0.0;
  // Re-roll from each voice's seeded RNG (deterministic under Master Seed).
  for (int v = 0; v < kMaxVoices; v++) {
    seedVoice(s.voices[v], handle - 1, v, s.masterRng);
  }
}

// Phase Modulation — exact HypersawUnit::run:
//   phaseOffset_ = phase * ((vibInput_ * vibAmp_) + vibOffset_) + walkOut_
// Vibrato Freq/Phase Vary: per-voice rate & phase offsets (Master Seed).
extern "C" void soemdsp_hypersaw2_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseGlobal,
  double numVoicesExact,
  double distributePhase,
  double randomizePhase,
  double vibratoAmp,
  double vibratoSpeedHz,
  double vibratoFreqVary,
  double vibratoPhaseVary,
  double phaseMultiplier,
  double jitterDistance,
  double jitterSpeed,
  double jitterPitchSt,
  double centerSide,
  double waveform,
  double morph,
  double level,
  double seedParam
) {
  if (handle < 1 || handle > kMaxInstances) return;
  Hypersaw2State& s = gPool[handle - 1];

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
  const double vibAmp = (vibratoAmp == vibratoAmp) ? vibratoAmp : 0.0;
  const double vibHz = (vibratoSpeedHz == vibratoSpeedHz) ? vibratoSpeedHz : 0.0;
  double vibFreqV = (vibratoFreqVary == vibratoFreqVary) ? vibratoFreqVary : 0.0;
  if (vibFreqV < 0.0) vibFreqV = 0.0;
  if (vibFreqV > 1.0) vibFreqV = 1.0;
  double vibPhaseV = (vibratoPhaseVary == vibratoPhaseVary) ? vibratoPhaseVary : 0.0;
  if (vibPhaseV < 0.0) vibPhaseV = 0.0;
  if (vibPhaseV > 1.0) vibPhaseV = 1.0;
  const double phaseMult = (phaseMultiplier == phaseMultiplier) ? phaseMultiplier : 1.0;
  const double jDistance = (jitterDistance == jitterDistance) ? jitterDistance : 0.0;
  const double jSpeed = (jitterSpeed == jitterSpeed && jitterSpeed > 0.0) ? jitterSpeed : 0.0;
  const double jPitch = (jitterPitchSt == jitterPitchSt) ? jitterPitchSt : 0.0;
  const double cs = clampD(centerSide, 0.0, 1.0);
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  if (wave < 0) wave = 0;
  if (wave > 6) wave = 6;
  // Morph = PWM / width for Trisaw, Pulse, Pulse Center (0.5 = center / 50%).
  const double morphAmt = (morph == morph) ? morph : 0.5;
  const double gain = (level == level) ? level : 0.0;
  const double phaseG = (phaseGlobal == phaseGlobal) ? phaseGlobal : 0.0;

  if (voiceCount != s.lastVoiceCount) {
    const int start = s.lastVoiceCount < 0 ? 0 : s.lastVoiceCount;
    for (int v = start; v < voiceCount; v++) {
      // New voices join the shared master phase — do not free-run from 0.
      s.voices[v].randomOffset = randomBipolar(s.voices[v].rngState);
      jitter_reset(s.voices[v].jitter);
    }
    s.lastVoiceCount = voiceCount;
  }

  const double ampCenter = (2.0 - cs * 2.0) < 1.0 ? (2.0 - cs * 2.0) : 1.0;
  const double ampSides = (cs * 2.0) < 1.0 ? (cs * 2.0) : 1.0;

  const double phaseIncrement = freq / sr;
  const double blepDt = phaseIncrement < 0.0 ? -phaseIncrement : phaseIncrement;

  // Distance law Δφ ∝ |f|: slew only the PM-depth gain so Frequency sweeps
  // don't zipper phase offsets. Carrier advance still uses raw freq above.
  double oscAbs = freq < 0.0 ? -freq : freq;
  const double distCompTarget = (oscAbs > 1.0e-12) ? (oscAbs / kDistanceRefHz) : 0.0;
  // ~8 ms one-pole on the compensation gain (not on pitch).
  const double distCompA = dsp_exp(-1.0 / (0.008 * sr));
  s.distCompSmooth = (1.0 - distCompA) * distCompTarget + distCompA * s.distCompSmooth;
  if (!(s.distCompSmooth * 0.0 == 0.0)) s.distCompSmooth = distCompTarget;
  const double distComp = s.distCompSmooth;
  const double vibAmpDist = vibAmp * distComp;

  double leftSum = 0.0;
  double rightSum = 0.0;
  int leftCount = 0;
  int rightCount = 0;
  int sideCh = 0;

  for (int i = 0; i < voiceCount; i++) {
    Hypersaw2VoiceState& voice = s.voices[i];
    // HypersawUnit::div_ = i / N (0 for center voice).
    const double div = static_cast<double>(i) / static_cast<double>(voiceCount);

    const double walkOut = (jDistance > 0.0)
      ? hypersaw_random_steps(voice.jitter, jDistance, jSpeed, jPitch, distComp, sr)
      : 0.0;

    // Per-voice vibOsc: rate = Speed×(1 + FreqVary×bipolar), phase += PhaseVary×random.
    double rateScale = 1.0 + vibFreqV * voice.vibFreqBipolar;
    if (rateScale < 0.0) rateScale = 0.0;
    voice.vibPhase = wrap01(voice.vibPhase + hz_to_increment(vibHz * rateScale, sr));
    const double vibOscOut = dsp_sin_turns_lut(
      wrap01(voice.vibPhase + 0.5 + voice.vibPhaseRandom * vibPhaseV)
    );

    // HypersawUnit::run (vibratoOut_ stays 0 — never assigned in SoEm):
    //   phase = div*distributePhaseAmp + randomPhaseOffset*randomPhaseAmp
    //   phaseOffset = phase * (vibInput*vibAmp + vibOffset) + walkOut
    // Master only pointTo's vibOsc into units i>=1; unit 0 vibInput reads 0.
    const double phase = (div * distribute) + (voice.randomOffset * randomAmt);
    const double vibInput = (i >= 1) ? vibOscOut : 0.0;
    const double phaseOffset = 0.5 + phase * (vibInput * vibAmpDist + phaseMult) + walkOut;
    // Scope lines include Frequency→Phase so twisting Phase slides the stems.
    voice.lastOffset = wrap01(phaseG + phaseOffset);

    // Exact locked phase: shared master + offset (not per-voice free-run).
    const double renderPhase = wrap01(s.masterPhase + phaseG + phaseOffset);
    double saw = hypersaw2WaveSample(wave, renderPhase, blepDt, morphAmt);
    if (lastFrac > 0.0 && i == voiceCount - 1) saw *= lastFrac;

    // One center (green/mono) only — voice 0. Remaining alternate L/R.
    const bool isCenter = (i == 0);
    if (isCenter) {
      const double c = saw * ampCenter;
      leftSum += c;
      rightSum += c;
      leftCount += 1;
      rightCount += 1;
    } else {
      const double side = saw * ampSides;
      if ((sideCh % 2) == 0) {
        leftSum += side;
        leftCount += 1;
      } else {
        rightSum += side;
        rightCount += 1;
      }
      sideCh += 1;
    }
  }

  // Advance the single shared free-phase once (all saws stay exactly locked).
  s.masterPhase = wrap01(s.masterPhase + phaseIncrement);

  double left = leftCount > 0 ? leftSum / static_cast<double>(leftCount) : 0.0;
  double right = rightCount > 0 ? rightSum / static_cast<double>(rightCount) : 0.0;
  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

  s.outLeft = clampD(left, -1.5, 1.5) * gain;
  s.outRight = clampD(right, -1.5, 1.5) * gain;
}

extern "C" double soemdsp_hypersaw2_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_hypersaw2_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

extern "C" double soemdsp_hypersaw2_voice_phase(int handle, int voiceIndex) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  if (voiceIndex < 0 || voiceIndex >= kMaxVoices) return 0.0;
  return gPool[handle - 1].voices[voiceIndex].lastOffset;
}

extern "C" int soemdsp_hypersaw2_voice_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  return gPool[handle - 1].lastVoiceCount;
}

extern "C" double soemdsp_hypersaw2_voice_last_frac(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].lastVoiceFrac;
}

extern "C" int soemdsp_hypersaw2_max_voices() {
  return kMaxVoices;
}

extern "C" int soemdsp_hypersaw2_version() {
  return 19;
}
