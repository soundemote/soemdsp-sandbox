// soemdsp-native-module: hypersaw
// soemdsp-native-label: Hypersaw
// soemdsp-native-target: hypersaw
// soemdsp-native-kind: oscillator

// Hypersaw -- a bank of up to kMaxVoices bandlimited (PolyBLEP) sawtooth
// oscillators, each voice spread across the 0..1 phase cycle. A faithful,
// simplified proof-of-concept port of soundemote's own HypersawUnit/
// HypersawMaster (see docs/reference/Hypersaw.hpp): each voice keeps its
// own phase accumulator at the same base frequency; the accumulator's
// rendered phase is then displaced by three independent, additive
// dispersion sources (transcribed from HypersawUnit::run()'s
// `div_ * distributePhaseAmp_` / `randomPhaseOffset_ * randomPhaseAmp_` /
// walkOut_ terms):
//
//   spread  -- each voice i has a fixed base position i/numVoices (the
//              original's `div_`); "spread" scales how much of that even
//              distribution is actually applied to the phase.
//   random  -- each voice draws one fixed random offset at creation/reset
//              (the original's `randomPhaseOffset_`); "random" scales it.
//   drift   -- each voice's offset also continuously wanders via a
//              reflecting random walk (the original's `drift_`/
//              `walkOut_` FlexibleRandomWalk); "drift" scales it.
//
// Vibrato (the original's fourth dispersion source, driven by a shared
// oscillator) is intentionally omitted to keep this proof-of-concept to 3
// dispersion controls, per this module's design brief.
//
// Output is stereo: voice 0 (and voice 1, if numVoices is even) are
// treated as "center" voices and summed into both channels, matching the
// original HypersawMaster::run()'s center/side split; the remaining
// voices alternate Left/Right. Each channel is averaged (not summed) by
// its own contributor count -- same loudness-normalizing convention as
// this sandbox's RobinSupersaw module -- so voice count doesn't change
// overall loudness.

namespace {

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 32;

double clampD(double value, double lo, double hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

double wrap01(double x) {
  double w = x - __builtin_floor(x);
  return w < 0.0 ? 0.0 : (w >= 1.0 ? 0.0 : w);
}

// xorshift32 -- freestanding WASM has no <random>.
unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

// Returns a pseudo-random value in [-0.5, 0.5).
double randomBipolarUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0) - 0.5;
}

// Standard PolyBLEP correction term for a naive sawtooth's discontinuity.
double polyBlep(double t, double dt) {
  if (dt <= 0.0) return 0.0;
  if (t < dt) {
    double x = t / dt;
    return x + x - x * x - 1.0;
  }
  if (t > 1.0 - dt) {
    double x = (t - 1.0) / dt;
    return x * x + x + x + 1.0;
  }
  return 0.0;
}

struct HypersawVoiceState {
  double phase;        // main running accumulator, 0..1
  double randomOffset;  // fixed per-voice random offset in [-0.5, 0.5], set at seed/reset
  double driftLp;       // reflecting random walk value, the continuously wandering drift value
  unsigned int rngState;
};

struct HypersawState {
  bool active;
  HypersawVoiceState voices[kMaxVoices];
  double outLeft;
  double outRight;
};

static HypersawState gPool[kMaxInstances];

void seedVoice(HypersawVoiceState& voice, int instanceIndex, int voiceIndex) {
  voice.rngState = static_cast<unsigned int>(
    2166136261u + (instanceIndex + 1) * 16777619u + (voiceIndex + 1) * 2654435761u
  );
  voice.phase = 0.0;
  voice.randomOffset = randomBipolarUnit(voice.rngState);
  voice.driftLp = 0.0;
}

}  // namespace

extern "C" int soemdsp_hypersaw_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = HypersawState{};
      gPool[i].active = true;
      for (int v = 0; v < kMaxVoices; v++) {
        seedVoice(gPool[i].voices[v], i, v);
      }
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
  for (int v = 0; v < kMaxVoices; v++) {
    s.voices[v].phase = 0.0;
    s.voices[v].randomOffset = randomBipolarUnit(s.voices[v].rngState);
    s.voices[v].driftLp = 0.0;
  }
}

// frequencyHz: the shared fundamental for every voice.
// phaseOffset: global phase control (0..1), added to every voice alike.
// numVoices: 1..kMaxVoices sawtooths in the bank.
// spread: 0..1, scales each voice's fixed even phase position (i/numVoices).
// randomAmount: 0..1, scales each voice's fixed random phase offset.
// driftAmount: 0..1, scales each voice's slow, continuously wandering
//   phase offset (a reflecting random walk).
// level: output gain.
extern "C" void soemdsp_hypersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  int numVoices,
  double spread,
  double randomAmount,
  double driftAmount,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  HypersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  // Through-zero: negative frequency reverses phase (signed phaseIncrement).
  const double safeFrequency = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  const int voiceCount = numVoices < 1 ? 1 : (numVoices > kMaxVoices ? kMaxVoices : numVoices);
  const double spreadAmt = clampD(spread, 0.0, 1.0);
  const double randomAmt = clampD(randomAmount, 0.0, 1.0);
  const double driftAmt = clampD(driftAmount, 0.0, 1.0);

  // Drift is a genuine reflecting random walk (NOT a lowpass filter over
  // fresh-every-sample white noise -- that was tried first and is a bug:
  // filtering a brand-new random value each sample with any audio-rate-
  // appropriate one-pole coefficient suppresses its variance by a factor
  // on the order of the coefficient itself, which is ~1e-5 at typical
  // sample rates -- the result is visually/audibly flat, not "drifting").
  // Each voice takes an independent small random step every sample;
  // stepScale is normalized by 1/sqrt(sampleRate) so a random walk's
  // diffusive growth (RMS distance grows as step * sqrt(sampleCount))
  // reaches a given wander range in the same wall-clock time regardless
  // of sample rate. Reflecting at +/-0.5 keeps it bounded while still
  // continuously wandering forever, and per-voice values are already
  // decorrelated since each voice draws its own random step.
  const double driftStepScale = 0.2 / __builtin_sqrt(safeSampleRate);
  const double phaseIncrement = safeFrequency / safeSampleRate;

  double leftSum = 0.0, rightSum = 0.0;
  int leftCount = 0, rightCount = 0;

  for (int i = 0; i < voiceCount; i++) {
    HypersawVoiceState& voice = s.voices[i];

    const double basePosition = static_cast<double>(i) / static_cast<double>(voiceCount);
    voice.driftLp += randomBipolarUnit(voice.rngState) * 2.0 * driftStepScale;
    if (voice.driftLp > 0.5) voice.driftLp = 1.0 - voice.driftLp;
    if (voice.driftLp < -0.5) voice.driftLp = -1.0 - voice.driftLp;

    const double dispersion =
      basePosition * spreadAmt + voice.randomOffset * randomAmt + voice.driftLp * driftAmt;
    const double renderPhase = wrap01(voice.phase + phaseOffset + dispersion);
    const double blepDt = phaseIncrement < 0.0 ? -phaseIncrement : phaseIncrement;
    const double sawSample = 2.0 * renderPhase - 1.0
      - polyBlep(renderPhase, blepDt > 1.0e-12 ? blepDt : 1.0);

    voice.phase = wrap01(voice.phase + phaseIncrement);

    const bool isCenter = (i == 0) || (i == 1 && (voiceCount % 2 == 0));
    if (isCenter) {
      leftSum += sawSample;
      rightSum += sawSample;
      leftCount++;
      rightCount++;
    } else if ((i % 2) == 0) {
      leftSum += sawSample;
      leftCount++;
    } else {
      rightSum += sawSample;
      rightCount++;
    }
  }

  double left = leftCount > 0 ? leftSum / static_cast<double>(leftCount) : 0.0;
  double right = rightCount > 0 ? rightSum / static_cast<double>(rightCount) : 0.0;

  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

  s.outLeft = clampD(left, -1.5, 1.5) * level;
  s.outRight = clampD(right, -1.5, 1.5) * level;
}

extern "C" double soemdsp_hypersaw_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outLeft;
}

extern "C" double soemdsp_hypersaw_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outRight;
}

// Returns voiceIndex's rendered phase (0..1, post-dispersion) as of the
// most recent sample() call -- used to drive the "vertical line per
// voice" phosphor display.
extern "C" double soemdsp_hypersaw_voice_phase(int handle, int voiceIndex) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  if (voiceIndex < 0 || voiceIndex >= kMaxVoices) return 0.0;
  return gPool[handle - 1].voices[voiceIndex].phase;
}

extern "C" int soemdsp_hypersaw_max_voices() {
  return kMaxVoices;
}

extern "C" int soemdsp_hypersaw_version() {
  return 1;
}
