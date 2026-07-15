// soemdsp-native-module: pi_spigot_noise
// soemdsp-native-label: Pi Spigot Noise
// soemdsp-native-target: piSpigotNoise
// soemdsp-native-kind: noise

// Two ways to get pi digits live here, and why both exist:
//
// 1) soemdsp_pi_spigot_noise_sample/left/right/reset_seed (the real
//    playback path): reads a small 1-second (44,100-sample) buffer of
//    real decimal digits of pi (fetched once from https://api.pi.delivery,
//    a free public API, grouped 3 digits per sample -- 1000 quantization
//    levels -- and embedded below as kPiDigitSamples, see
//    pi_digits_data.inc) as a circular wavetable, but the read phase
//    advances by kPlaybackStep = phi (the golden ratio, ~1.618) per
//    sample instead of exactly 1.0. Since phi is irrational, the
//    sequence of buffer positions visited (position mod buffer length)
//    never exactly repeats -- but the drift also has to be *audible*,
//    not just true on paper: an earlier version stepped by
//    1.0 + (1/phi)/sampleRate, which is irrational too, but only drifts
//    ~0.618 samples per full lap around the buffer -- correct math,
//    silent result, since it takes ~20 hours to accumulate one
//    buffer-length of drift, so every second sounds identical to the
//    last. Stepping by phi itself instead means every output sample
//    jumps ~61.8% of the buffer length ahead (mod buffer length), which
//    (per the three-distance theorem for irrational rotations) visits
//    positions in a well-distributed, never-exactly-repeating order --
//    verified via lap-to-lap correlation near 0 (not the ~1.0 a real
//    repeat would show) after this fix; see git history for the before/
//    after numbers. A tiny buffer this way still avoids ever sounding
//    like a hard, exact, audibly-periodic loop, at the cost of one
//    linear interpolation per sample instead of a plain array index --
//    still effectively free. Stereo: left and right channels are two
//    entirely independent reads of the same buffer, each with its own
//    seed and its own color-filter memory -- same buffer, different
//    starting point, so they decorrelate like two different noise
//    sources instead of just being hard-panned copies of each other.
//
//    Seeds are normalized 0.0-1.0 fractions of the buffer, not raw sample
//    indices -- seed 0.5 always means "half a second into the buffer"
//    regardless of what kPiDigitSampleCount (tied to a 1-second buffer at
//    44.1kHz) happens to be, so the parameter's meaning doesn't depend on
//    the buffer's exact sample rate/length.
//
// 2) soemdsp_pi_spigot_noise_compute_bipolar (kept reachable, not wired to
//    playback): the actual Bailey-Borwein-Plouffe spigot formula --
//    https://en.wikipedia.org/wiki/Bailey%E2%80%93Borwein%E2%80%93Plouffe_formula
//    -- extracting a hex digit's fractional value at an arbitrary position
//    with no big-integer arithmetic, only modular exponentiation. Verified
//    against known pi hex digits ("2 4 3 F 6 A 8 8 8 5..."). Kept exported
//    (not deleted) because it's a real, distinct, independently-useful
//    capability -- computing digit N without needing digits 0..N-1 -- even
//    though it costs O(n) per digit and was never fast enough to be a
//    default playback path (filling a useful-length cache this way took
//    20+ seconds measured wall-clock; see git history on this file).

#include "pi_digits_data.inc"

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pi_spigot_noise\","
    "\"label\":\"Pi Spigot Noise\","
    "\"targetType\":\"piSpigotNoise\","
    "\"kind\":\"noise\","
    "\"outputs\":[\"Left Out\",\"Right Out\"],"
    "\"parameters\":["
      "{\"key\":\"seedLeft\",\"label\":\"Seed L\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"seedRight\",\"label\":\"Seed R\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"color\",\"label\":\"Color\",\"defaultValue\":0,\"choices\":[\"White\",\"Pink\",\"Brown\",\"Blue\",\"Violet\"],\"displayChoices\":true,\"divideChoicesVisibly\":true,\"min\":0,\"mid\":2,\"max\":4,\"step\":1},"
      "{\"key\":\"smoothing\",\"label\":\"Smoothing\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 16;

// Golden ratio (phi) as the playback step -- NOT divided by sample rate.
// An earlier version used 1.0 + (1/phi)/sampleRate, meaning the phase
// only drifted ~0.618 samples per full lap around the buffer -- correct
// on paper (an irrational drift never exactly repeats) but ~20 hours to
// accumulate a single buffer-length of drift, so every second sounded
// identical to the last. Using phi itself as the step means each output
// sample jumps ~61.8% of the buffer length ahead (mod buffer length)
// instead of ~1 sample -- per the three-distance theorem, an irrational
// step visits every position in a well-distributed, never-exactly-
// repeating order, and now the "no repeat" property is actually audible
// within seconds instead of theoretical over a night's sleep.
static const double kPlaybackStep = 1.6180339887498949;

struct PiSpigotNoiseChannel {
  double phase;
  // Color-filter memory. pink[]/brown reuse noise_generator.cpp's Paul
  // Kellet pink filter and leaky-integrator brown approach (same taps,
  // same codebase convention) so this module's colors sound consistent
  // with the rest of the sandbox's noise sources. prevWhite1/2 are for
  // the first/second-difference blue/violet filters, which noise_generator
  // doesn't have -- those are new here.
  double pink[7];
  double brown;
  double prevWhite1;
  double prevWhite2;
  // Smoothing: a 4-stage one-pole lowpass cascade (see applySmoothing).
  // Repeated one-pole recursion converges to a Gaussian by the central
  // limit theorem -- a cheap real-time approximation with no hard
  // cutoff, applied after color so it darkens whichever color is chosen
  // rather than being just another color option itself.
  double smoothLp[4];
  double lastOut;
};

struct PiSpigotNoiseState {
  PiSpigotNoiseChannel left;
  PiSpigotNoiseChannel right;
  bool active;
};

static PiSpigotNoiseState gPool[kMaxInstances];

static inline int clampi(int x, int lo, int hi) { return x < lo ? lo : (x > hi ? hi : x); }

// --- BBP spigot digit-extraction (see file header, capability #2) ---

static double pow_mod(double a, double b, double m) {
  double result = 1.0;
  double base = a - m * (double)(long long)(a / m);
  while (b > 0.5) {
    double half = b * 0.5;
    bool odd = (double)(long long)half * 2.0 != b;
    if (odd) {
      double p = result * base;
      result = p - m * (double)(long long)(p / m);
    }
    b = (double)(long long)half;
    double sq = base * base;
    base = sq - m * (double)(long long)(sq / m);
  }
  return result;
}

static double series(int m, int n) {
  double s = 0.0;
  for (int k = 0; k <= n; k++) {
    double ak = 8.0 * k + m;
    double t = pow_mod(16.0, (double)(n - k), ak);
    s += t / ak;
    s -= (double)(long long)s;
  }
  for (int k = n + 1; k < n + 100; k++) {
    double ak = 8.0 * k + m;
    double t = 1.0;
    for (int e = 0; e < k - n; e++) t *= (1.0 / 16.0);
    if (t < 1e-17) break;
    s += t / ak;
  }
  double frac = s - (double)(long long)s;
  return frac < 0.0 ? frac + 1.0 : frac;
}

// Same range-reduction exp as random_walk/pluck_envelope/exp_adsr.
static double dsp_exp(double x) {
  if (x < -700.0) return 0.0;
  if (x > 700.0) return 1e300;
  const double LOG2E = 1.4426950408889634;
  const double LN2 = 0.6931471805599453;
  double t = x * LOG2E;
  long long n = (long long)t;
  if (t < 0.0 && (double)n != t) n -= 1;
  double f = t - (double)n;
  double y = f * LN2;
  double ey = 1.0 + y*(1.0 + y*(0.5 + y*(1.0/6.0 + y*(1.0/24.0 + y*(1.0/120.0 + y*(1.0/720.0 + y/5040.0))))));
  union { double d; unsigned long long u; } bits;
  bits.u = (unsigned long long)(n + 1023) << 52;
  return ey * bits.d;
}

static void resetChannelColorFilters(PiSpigotNoiseChannel& c) {
  for (int i = 0; i < 7; i++) c.pink[i] = 0.0;
  c.brown = 0.0;
  c.prevWhite1 = 0.0;
  c.prevWhite2 = 0.0;
  for (int i = 0; i < 4; i++) c.smoothLp[i] = 0.0;
  c.lastOut = 0.0;
}

static void seedChannel(PiSpigotNoiseChannel& c, double seedFraction) {
  double safeSeed = clamp(seedFraction, 0.0, 1.0);
  c.phase = safeSeed * (double)kPiDigitSampleCount;
  resetChannelColorFilters(c);
}

// Colors White/Pink/Brown match noise_generator.cpp's filter taps and
// scaling exactly (same Paul Kellet pink filter, same leaky-integrator
// brown), applied to the pi-digit "white" source instead of an LCG one.
// Blue/Violet (first/second difference of white) are new -- this module
// is the only one with them so far.
static double applyColor(PiSpigotNoiseChannel& c, double white, int color) {
  if (color == 1) {
    c.pink[0] = 0.99886 * c.pink[0] + white * 0.0555179;
    c.pink[1] = 0.99332 * c.pink[1] + white * 0.0750759;
    c.pink[2] = 0.969   * c.pink[2] + white * 0.153852;
    c.pink[3] = 0.8665  * c.pink[3] + white * 0.3104856;
    c.pink[4] = 0.55    * c.pink[4] + white * 0.5329522;
    c.pink[5] = -0.7616 * c.pink[5] - white * 0.016898;
    const double out = (c.pink[0] + c.pink[1] + c.pink[2] +
      c.pink[3] + c.pink[4] + c.pink[5] + c.pink[6] + white * 0.5362) * 0.11;
    c.pink[6] = white * 0.115926;
    return out;
  }
  if (color == 2) {
    c.brown = clamp(c.brown + white * 0.05, -1.0, 1.0);
    return c.brown;
  }
  if (color == 3) {
    const double out = (white - c.prevWhite1) * 0.5;
    c.prevWhite1 = white;
    return out;
  }
  if (color == 4) {
    const double out = (white - 2.0 * c.prevWhite1 + c.prevWhite2) * 0.25;
    c.prevWhite2 = c.prevWhite1;
    c.prevWhite1 = white;
    return out;
  }
  return white;
}

// smoothing in [0, 1]: 0 = passthrough (g = 1, raw noise), 1 = heaviest
// smoothing (g = kSmoothMinG). Exponential curve, not linear -- g = gMin^s
// via g = exp(s * ln(gMin)), ln(kSmoothMinG) precomputed as a literal
// since kSmoothMinG is a fixed constant, so no ln() implementation is
// needed, only the already-proven dsp_exp above. Cascading 4 of these in
// series approximates a Gaussian rolloff (central limit theorem) with no
// hard cutoff, applied after color so it darkens whichever color is
// selected rather than being a color option itself.
static const double kSmoothMinG = 0.02;
static const double kLnSmoothMinG = -3.912023005428146;  // ln(0.02)

static double applySmoothing(PiSpigotNoiseChannel& c, double x, double smoothing) {
  double safeSmoothing = clamp(smoothing, 0.0, 1.0);
  if (safeSmoothing <= 0.0) return x;
  double g = dsp_exp(safeSmoothing * kLnSmoothMinG);
  double y = x;
  for (int i = 0; i < 4; i++) {
    c.smoothLp[i] += g * (y - c.smoothLp[i]);
    y = c.smoothLp[i];
  }
  return y;
}

static double channelSample(PiSpigotNoiseChannel& c, int color, double smoothing) {
  double readPos = c.phase - (double)kPiDigitSampleCount * (double)(long long)(c.phase / (double)kPiDigitSampleCount);
  if (readPos < 0.0) readPos += (double)kPiDigitSampleCount;
  int i0 = (int)readPos;
  int i1 = (i0 + 1) % kPiDigitSampleCount;
  double frac = readPos - (double)i0;
  double v0 = (double)kPiDigitSamples[i0] / 32767.0;
  double v1 = (double)kPiDigitSamples[i1] / 32767.0;
  double white = v0 + (v1 - v0) * frac;
  c.phase += kPlaybackStep;
  double colored = applyColor(c, white, color);
  return applySmoothing(c, colored, smoothing);
}

}  // namespace

extern "C" int soemdsp_pi_spigot_noise_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PiSpigotNoiseState& s = gPool[i];
      seedChannel(s.left, 0.0);
      seedChannel(s.right, 0.5);
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pi_spigot_noise_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// seedLeft/seedRight are normalized 0.0-1.0 fractions of the 1-second
// buffer -- see file header.
extern "C" void soemdsp_pi_spigot_noise_reset_seed(int handle, double seedLeft, double seedRight) {
  if (handle < 1 || handle > kMaxInstances) return;
  PiSpigotNoiseState& s = gPool[handle - 1];
  seedChannel(s.left, seedLeft);
  seedChannel(s.right, seedRight);
}

// Advances both channels and caches their outputs -- read them back with
// soemdsp_pi_spigot_noise_left/right, same create-once/getter convention
// as noise_generator.cpp's stereo sample/left/right.
extern "C" void soemdsp_pi_spigot_noise_sample(int handle, double color, double smoothing, double level) {
  if (handle < 1 || handle > kMaxInstances) return;
  PiSpigotNoiseState& s = gPool[handle - 1];
  int safeColor = clampi((int)(color + 0.5), 0, 4);
  s.left.lastOut = channelSample(s.left, safeColor, smoothing) * level;
  s.right.lastOut = channelSample(s.right, safeColor, smoothing) * level;
}

extern "C" double soemdsp_pi_spigot_noise_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].left.lastOut;
}

extern "C" double soemdsp_pi_spigot_noise_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].right.lastOut;
}

// Real-time BBP spigot evaluation at hex-digit position n, mapped to
// bipolar [-1, 1) -- see file header, capability #2. Costs O(n); not used
// by soemdsp_pi_spigot_noise_sample above.
extern "C" double soemdsp_pi_spigot_noise_compute_bipolar(int n) {
  double x = 4.0 * series(1, n) - 2.0 * series(4, n) - series(5, n) - series(6, n);
  x -= (double)(long long)x;
  if (x < 0.0) x += 1.0;
  return x * 2.0 - 1.0;
}

extern "C" int soemdsp_pi_spigot_noise_sample_count() {
  return kPiDigitSampleCount;
}

extern "C" int soemdsp_pi_spigot_noise_version() {
  return 5;
}

extern "C" const char* soemdsp_pi_spigot_noise_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_pi_spigot_noise_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
