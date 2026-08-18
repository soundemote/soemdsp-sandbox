// soemdsp-native-module: pi_spigot_noise
// soemdsp-native-label: Pi Spigot Noise
// soemdsp-native-target: piSpigotNoise
// soemdsp-native-kind: noise
//
// Honest BBP heart. No digit file, no API, no wavetable.
// https://en.wikipedia.org/wiki/Bailey%E2%80%93Borwein%E2%80%93Plouffe_formula
//
// One sample = one gear tooth of the four-series rotate:
//   phase 0:  4 / (8k+1)
//   phase 1: -2 / (8k+4)
//   phase 2: -1 / (8k+5)
//   phase 3: -1 / (8k+6)  then k++
// Audio is the live state (Sum = {S}, Term = this sample's add).
// Hex / bits / T latch only when k finishes this n (plus a short tail).
// As n grows the verse lengthens: 4*(n+tail) samples per hex digit.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pi_spigot_noise\","
    "\"label\":\"Pi Spigot Noise\","
    "\"targetType\":\"piSpigotNoise\","
    "\"kind\":\"noise\","
    "\"outputs\":[\"Left Out\",\"Right Out\",\"Hex\",\"N\",\"T\",\"B3\",\"B2\",\"B1\",\"B0\"],"
    "\"parameters\":["
      "{\"key\":\"start\",\"label\":\"Start\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"stride\",\"label\":\"Stride\",\"defaultValue\":1,\"min\":1,\"mid\":4,\"max\":16,\"step\":1},"
      "{\"key\":\"color\",\"label\":\"Color\",\"defaultValue\":0,\"choices\":[\"White\",\"Pink\",\"Brown\",\"Blue\",\"Violet\"],\"displayChoices\":true,\"divideChoicesVisibly\":true,\"min\":0,\"mid\":2,\"max\":4,\"step\":1},"
      "{\"key\":\"smoothing\",\"label\":\"Smoothing\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 16;
static const int kMaxN = 2048;
static const int kTail = 16;
static const int kSeriesM[4] = {1, 4, 5, 6};
static const double kSeriesC[4] = {4.0, -2.0, -1.0, -1.0};

struct PiSpigotNoiseChannel {
  double pink[7];
  double brown;
  double prevWhite1;
  double prevWhite2;
  double smoothLp[4];
  double lastOut;
};

struct PiSpigotNoiseState {
  bool active;
  int startN;
  int stride;
  int n;
  int k;
  int phase;
  double S;
  double lastTerm;
  int hex;
  int pulse;
  PiSpigotNoiseChannel sumCh;
  PiSpigotNoiseChannel termCh;
};

static PiSpigotNoiseState gPool[kMaxInstances];

static inline int clampi(int x, int lo, int hi) { return x < lo ? lo : (x > hi ? hi : x); }

static double pow_mod(double a, double b, double m) {
  if (m <= 0.0) return 0.0;
  double result = 1.0;
  double base = a - m * dsp_floor(a / m);
  if (base < 0.0) base += m;
  double expn = b;
  if (expn < 0.0) expn = 0.0;
  while (expn > 0.5) {
    double half = expn * 0.5;
    bool odd = (double)(long long)half * 2.0 != expn;
    if (odd) {
      double p = result * base;
      result = p - m * dsp_floor(p / m);
      if (result < 0.0) result += m;
    }
    expn = dsp_floor(half);
    double sq = base * base;
    base = sq - m * dsp_floor(sq / m);
    if (base < 0.0) base += m;
  }
  return result;
}

static double series_term(int m, int k, int n) {
  const double ak = 8.0 * (double)k + (double)m;
  if (ak <= 0.0) return 0.0;
  if (k <= n) {
    return pow_mod(16.0, (double)(n - k), ak) / ak;
  }
  double t = 1.0;
  const int e = k - n;
  for (int i = 0; i < e; i += 1) t *= 0.0625;
  return t / ak;
}

static void resetColor(PiSpigotNoiseChannel& c) {
  for (int i = 0; i < 7; i += 1) c.pink[i] = 0.0;
  c.brown = 0.0;
  c.prevWhite1 = 0.0;
  c.prevWhite2 = 0.0;
  for (int i = 0; i < 4; i += 1) c.smoothLp[i] = 0.0;
  c.lastOut = 0.0;
}

static double applyColor(PiSpigotNoiseChannel& c, double white, int color) {
  if (color == 1) {
    c.pink[0] = 0.99886 * c.pink[0] + white * 0.0555179;
    c.pink[1] = 0.99332 * c.pink[1] + white * 0.0750759;
    c.pink[2] = 0.969 * c.pink[2] + white * 0.153852;
    c.pink[3] = 0.8665 * c.pink[3] + white * 0.3104856;
    c.pink[4] = 0.55 * c.pink[4] + white * 0.5329522;
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

static const double kLnSmoothMinG = -3.912023005428146;

static double applySmoothing(PiSpigotNoiseChannel& c, double x, double smoothing) {
  const double s = clamp(smoothing, 0.0, 1.0);
  if (s <= 0.0) return x;
  const double g = dsp_exp(s * kLnSmoothMinG);
  double y = x;
  for (int i = 0; i < 4; i += 1) {
    c.smoothLp[i] += g * (y - c.smoothLp[i]);
    y = c.smoothLp[i];
  }
  return y;
}

static void restartDigit(PiSpigotNoiseState& s) {
  s.k = 0;
  s.phase = 0;
  s.S = 0.0;
  s.lastTerm = 0.0;
}

static void applyStartStride(PiSpigotNoiseState& s, double start, double stride) {
  const int startN = clampi((int)(clamp(start, 0.0, 1.0) * (double)kMaxN + 0.5), 0, kMaxN);
  const int st = clampi((int)(safe(stride) + 0.5), 1, 16);
  if (startN == s.startN && st == s.stride) return;
  s.startN = startN;
  s.stride = st;
  s.n = startN;
  s.hex = 0;
  s.pulse = 0;
  restartDigit(s);
  resetColor(s.sumCh);
  resetColor(s.termCh);
}

static void stepEquation(PiSpigotNoiseState& s) {
  const int m = kSeriesM[s.phase];
  const double c = kSeriesC[s.phase];
  const double term = c * series_term(m, s.k, s.n);
  s.lastTerm = term;
  s.S += term;
  s.S = s.S - dsp_floor(s.S);
  if (s.S < 0.0) s.S += 1.0;
  s.pulse = 0;
  s.phase += 1;
  if (s.phase < 4) return;
  s.phase = 0;
  s.k += 1;
  if (s.k <= s.n + kTail) return;
  int hex = (int)(s.S * 16.0);
  if (hex > 15) hex = 15;
  if (hex < 0) hex = 0;
  s.hex = hex;
  s.pulse = 1;
  s.n += s.stride;
  if (s.n > kMaxN) s.n = s.startN;
  restartDigit(s);
}

}  // namespace

extern "C" int soemdsp_pi_spigot_noise_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      PiSpigotNoiseState& s = gPool[i];
      s.startN = 0;
      s.stride = 1;
      s.n = 0;
      s.hex = 0;
      s.pulse = 0;
      restartDigit(s);
      resetColor(s.sumCh);
      resetColor(s.termCh);
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

extern "C" void soemdsp_pi_spigot_noise_reset_seed(int handle, double start, double stride) {
  if (handle < 1 || handle > kMaxInstances) return;
  applyStartStride(gPool[handle - 1], start, stride);
}

extern "C" void soemdsp_pi_spigot_noise_sample(int handle, double color, double smoothing, double level) {
  if (handle < 1 || handle > kMaxInstances) return;
  PiSpigotNoiseState& s = gPool[handle - 1];
  if (!s.active) return;
  stepEquation(s);
  const int safeColor = clampi((int)(safe(color) + 0.5), 0, 4);
  const double sum = s.S * 2.0 - 1.0;
  const double term = clamp(s.lastTerm * 0.25, -1.0, 1.0);
  const double amp = safe(level);
  s.sumCh.lastOut = applySmoothing(s.sumCh, applyColor(s.sumCh, sum, safeColor), smoothing) * amp;
  s.termCh.lastOut = applySmoothing(s.termCh, applyColor(s.termCh, term, safeColor), smoothing) * amp;
}

extern "C" double soemdsp_pi_spigot_noise_left(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].sumCh.lastOut;
}

extern "C" double soemdsp_pi_spigot_noise_right(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].termCh.lastOut;
}

extern "C" double soemdsp_pi_spigot_noise_hex(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (double)gPool[handle - 1].hex / 15.0;
}

extern "C" double soemdsp_pi_spigot_noise_n(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (double)gPool[handle - 1].n / (double)kMaxN;
}

extern "C" double soemdsp_pi_spigot_noise_t(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].pulse ? 1.0 : 0.0;
}

extern "C" double soemdsp_pi_spigot_noise_b3(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (gPool[handle - 1].hex & 8) ? 1.0 : 0.0;
}

extern "C" double soemdsp_pi_spigot_noise_b2(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (gPool[handle - 1].hex & 4) ? 1.0 : 0.0;
}

extern "C" double soemdsp_pi_spigot_noise_b1(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (gPool[handle - 1].hex & 2) ? 1.0 : 0.0;
}

extern "C" double soemdsp_pi_spigot_noise_b0(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return (gPool[handle - 1].hex & 1) ? 1.0 : 0.0;
}

extern "C" double soemdsp_pi_spigot_noise_compute_bipolar(int n) {
  int safeN = n < 0 ? 0 : n;
  double x = 0.0;
  const int mlist[4] = {1, 4, 5, 6};
  const double clist[4] = {4.0, -2.0, -1.0, -1.0};
  for (int k = 0; k <= safeN + kTail; k += 1) {
    for (int p = 0; p < 4; p += 1) {
      x += clist[p] * series_term(mlist[p], k, safeN);
      x = x - dsp_floor(x);
      if (x < 0.0) x += 1.0;
    }
  }
  return x * 2.0 - 1.0;
}

extern "C" int soemdsp_pi_spigot_noise_sample_count() {
  return kMaxN;
}

extern "C" int soemdsp_pi_spigot_noise_version() {
  return 6;
}

extern "C" const char* soemdsp_pi_spigot_noise_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_pi_spigot_noise_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
