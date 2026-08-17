// soemdsp-native-module: robin_supersaw
// soemdsp-native-label: RobinSupersaw
// soemdsp-native-target: robinSupersaw
// soemdsp-native-kind: oscillator

// RobinSupersaw -- a proof-of-concept supersaw built on Robin Schmidt's
// pitch dithering technique (RobinSchmidt/RS-MET). See this repo's
// README.md ("Pitch Dithering") for the full explanation; this module is
// a direct, faithful transcription of the reference implementation:
//
//   https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Generators/PitchDitherOscs.h
//   https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Generators/PitchDitherOscs.cpp
//
// Core idea, transcribed exactly (calcCycleDistribution / updateCycleLength
// / getSamplePhasor below): rather than build a bandlimited sawtooth via
// PolyBLEP correction or a DSF closed form, this oscillator dithers its
// own *cycle length* in the time domain. On every cycle, it randomly picks
// one of 3 neighboring *integer* sample-counts (lenMid-1, lenMid, lenMid+1)
// with probabilities computed so the long-run average cycle length is
// exactly the desired (fractional) length, and so the injected jitter's
// *variance* stays constant regardless of how close the desired length is
// to an integer. Every individual cycle rendered has an exact integer
// sample count, which is genuinely alias-free (no correction needed) --
// the "cost" is a small amount of pitch-jitter noise instead of aliasing.
//
// SECOND REWRITE: stereo. Rather than one shared voice bank feeding a
// single Out, this now runs two full, independent copies of the detuned
// voice stack -- one feeding Left, one feeding Right -- each with its own
// distinct RNG seeds so their dithering noise (and hence their exact
// per-sample output) is decorrelated between channels, giving real
// stereo width instead of a mono signal duplicated to both sides. Mono is
// exposed as its own output, computed as (Left + Right) * 0.5 -- the
// same averaging convention this sandbox's Output module itself uses
// (see node-live-audio-worklet.js's "output" case: `Out = MonoIn +
// (LeftIn + RightIn) * 0.5`) -- an arithmetic average, not a raw sum, so
// that a mono fold-down of two full-amplitude channels doesn't come out
// twice as loud as either channel alone.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 8;
constexpr int kMaxVoices = 9;
constexpr int kMaxBlockFrames = 2048;

// xorshift32 -- freestanding WASM has no <random>. Deterministic, cheap,
// good enough statistical quality for dithering noise (not cryptographic).
unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

// Returns a pseudo-random value in [0, 1).
double randomUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0);
}

double floorD(double value) {
  return __builtin_floor(value);
}

// 2^x for small x (here always in roughly [-0.05, 0.05], since it's used
// for a cents-to-ratio conversion with detune capped at +/-50 cents) --
// exp(x*ln2) via a short Taylor series, accurate to ~2e-11 over that
// range. Freestanding WASM has no libm pow()/exp2().
double pow2Small(double x) {
  const double y = x * 0.6931471805599453;
  return 1.0 + y * (1.0 + y * (0.5 + y * (1.0 / 6.0 + y * (1.0 / 24.0 + y * (1.0 / 120.0)))));
}

// rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed exactly.
// Computes lenMid (the middle of the 3 candidate integer cycle lengths)
// and the probabilities of using the short/mid lengths (the long length's
// probability is always 1 - probShort - probMid).
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
  double sampleCount;  // integer-valued, always in [0, lenNow-1]
  double lenNow;       // lenMid, lenMid-1, or lenMid+1 for the current cycle
  double lenMid;
  double probShort;
  double probMid;
  double phaseSlope;
  unsigned int rngState;
};

// rsPitchDitherOsc<T>::updateCycleLength(), transcribed exactly.
// Draws a new random integer cycle length for the next cycle and updates
// the per-sample phasor increment (phaseSlope) accordingly.
void updateCycleLength(DitherVoiceState& v) {
  const double r = randomUnit(v.rngState);
  if (r < v.probShort) {
    v.lenNow = v.lenMid - 1.0;
  } else if (r < v.probShort + v.probMid) {
    v.lenNow = v.lenMid;
  } else {
    v.lenNow = v.lenMid + 1.0;
  }
  // phasorRangeClosed = true (matches getSampleSaw()'s usage in the
  // reference -- a closed [0,1] phasor range makes saws look cleaner).
  const double maxCount = v.lenNow - 1.0;
  v.phaseSlope = 1.0 / (maxCount < 1.0 ? 1.0 : maxCount);
}

// rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed
// exactly (phasorRangeClosed = true throughout, matching getSampleSaw()).
double getSamplePhasor(DitherVoiceState& v) {
  const double p = v.phaseSlope * v.sampleCount;
  v.sampleCount += 1.0;
  if (v.sampleCount >= v.lenNow) {
    v.sampleCount = 0.0;
    updateCycleLength(v);
  }
  return p;
}

// WF::saw(phasor) for a closed [0,1] phasor: maps to a -1..+1 ramp.
double sawFromPhasor(double phasor) {
  return 2.0 * phasor - 1.0;
}

void prepareVoiceBank(
  DitherVoiceState* bank,
  int numVoices,
  double safeFrequency,
  double safeSampleRate,
  double spreadCents
) {
  for (int i = 0; i < numVoices; i++) {
    double centsOffset = 0.0;
    if (numVoices > 1) {
      const double t = static_cast<double>(i) / static_cast<double>(numVoices - 1);
      centsOffset = (t - 0.5) * spreadCents;
    }
    const double ratio = pow2Small(centsOffset / 1200.0);
    const double voiceFreq = safeFrequency * ratio;
    const double meanCycleLength = safeSampleRate / (voiceFreq > 1.0 ? voiceFreq : 1.0);
    calcCycleDistribution(meanCycleLength, &bank[i].lenMid, &bank[i].probShort, &bank[i].probMid);
  }
}

double sumPreparedVoiceBank(DitherVoiceState* bank, int numVoices) {
  double sum = 0.0;
  for (int i = 0; i < numVoices; i++) {
    sum += sawFromPhasor(getSamplePhasor(bank[i]));
  }
  return sum / static_cast<double>(numVoices);
}

// Sums numVoices detuned, pitch-dithered saws from one voice bank. Voice 0
// is always centered (0 cents) as the tonal anchor; the rest spread
// symmetrically across +/- spreadCents/2.
double sumVoiceBank(DitherVoiceState* bank, int numVoices, double safeFrequency, double safeSampleRate, double spreadCents) {
  prepareVoiceBank(bank, numVoices, safeFrequency, safeSampleRate, spreadCents);
  return sumPreparedVoiceBank(bank, numVoices);
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
};

static RobinSupersawState gPool[kMaxInstances];

void seedBank(DitherVoiceState* bank, int instanceIndex, int channelSalt) {
  for (int v = 0; v < kMaxVoices; v++) {
    DitherVoiceState& voice = bank[v];
    // Each voice, channel, and instance gets a distinct seed so their
    // dithering noise streams are decorrelated -- correlated noise across
    // voices (or between Left/Right) would just sound like duplicated
    // mono, not a chorus or real stereo width.
    voice.rngState = static_cast<unsigned int>(
      1469598103u + (instanceIndex + 1) * 747796405u + (v + 1) * 2891336453u + channelSalt * 40503u
    );
    voice.lenMid = 100.0;
    voice.probShort = 0.0;
    voice.probMid = 1.0;
    voice.lenNow = 100.0;
    voice.phaseSlope = 1.0 / 99.0;
    voice.sampleCount = 0.0;
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
  RobinSupersawState& s = gPool[handle - 1];
  for (int v = 0; v < kMaxVoices; v++) {
    s.left[v].sampleCount = 0.0;
    s.right[v].sampleCount = 0.0;
  }
}

// frequencyHz: the center pitch.
// detuneCents: 0..100 -- total spread across the voice stack, in cents,
//   symmetric around the center voice (voice 0 always has zero detune,
//   matching the reference implementation's supersaw notes: keep one
//   voice exactly on pitch as the tonal anchor).
// voices: 1..9 -- how many detuned saws are summed per channel (1 = just
//   the pitch-dithered center voice, useful on its own to hear pitch
//   dithering in isolation before stacking it into a supersaw).
// level: output gain.
extern "C" void soemdsp_robin_supersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneCents,
  int voices,
  double level
) {
  if (handle < 1 || handle > kMaxInstances) return;
  RobinSupersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  // Through-zero: signed Hz (phase reverse when negative).
  const double safeFrequency = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  const int numVoices = voices < 1 ? 1 : (voices > kMaxVoices ? kMaxVoices : voices);
  const double spreadCents = clamp(detuneCents, 0.0, 100.0);

  double left = sumVoiceBank(s.left, numVoices, safeFrequency, safeSampleRate, spreadCents);
  double right = sumVoiceBank(s.right, numVoices, safeFrequency, safeSampleRate, spreadCents);

  if (!(left * 0.0 == 0.0)) left = 0.0;
  if (!(right * 0.0 == 0.0)) right = 0.0;

  s.outLeft = clamp(left, -1.5, 1.5) * level;
  s.outRight = clamp(right, -1.5, 1.5) * level;
  // Arithmetic average, not a raw sum -- matches this sandbox's own
  // Output module convention (see node-live-audio-worklet.js's "output"
  // case), so a mono fold-down of two full-amplitude channels doesn't
  // come out twice as loud as either channel alone.
  s.outMono = (s.outLeft + s.outRight) * 0.5;
}

extern "C" void soemdsp_robin_supersaw_process_block(
  int handle,
  double frequencyHz,
  double sampleRate,
  double detuneCents,
  int voices,
  double level,
  int frameCount
) {
  if (handle < 1 || handle > kMaxInstances) return;
  RobinSupersawState& s = gPool[handle - 1];

  const double safeSampleRate = sampleRate > 1.0 ? sampleRate : 48000.0;
  const double safeFrequency = (frequencyHz == frequencyHz) ? frequencyHz : 0.0;
  const int numVoices = voices < 1 ? 1 : (voices > kMaxVoices ? kMaxVoices : voices);
  const double spreadCents = clamp(detuneCents, 0.0, 100.0);
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);

  prepareVoiceBank(s.left, numVoices, safeFrequency, safeSampleRate, spreadCents);
  prepareVoiceBank(s.right, numVoices, safeFrequency, safeSampleRate, spreadCents);

  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    double left = sumPreparedVoiceBank(s.left, numVoices);
    double right = sumPreparedVoiceBank(s.right, numVoices);
    if (!(left * 0.0 == 0.0)) left = 0.0;
    if (!(right * 0.0 == 0.0)) right = 0.0;
    const double outLeft = clamp(left, -1.5, 1.5) * level;
    const double outRight = clamp(right, -1.5, 1.5) * level;
    const double outMono = (outLeft + outRight) * 0.5;
    s.blockOutLeft[frame] = outLeft;
    s.blockOutRight[frame] = outRight;
    s.blockOutMono[frame] = outMono;
    s.outLeft = outLeft;
    s.outRight = outRight;
    s.outMono = outMono;
  }
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

extern "C" int soemdsp_robin_supersaw_version() {
  return 3;
}
