// soemdsp-native-module: wavetable_2d
// soemdsp-native-label: Wavetable 2D
// soemdsp-native-target: wavetable2d
// soemdsp-native-kind: oscillator
//
// Morph (4 frames, wrap) × Warp (13 knots, no wrap). Each cell is the DFT of
// a time-warped Additive cycle, then IFFT'd into band-limited mips.
// Playback bilinear-lerps four neighbor tables at the mip whose top partial
// is ≤ Nyquist/|f|. O(1) per sample. No live PD warp.

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kTableLen = 4096;
static const int kSpecH = kTableLen / 2 - 1; // 2047
static const int kFrameCount = 4;
static const int kWarpCount = 13;
static const int kMipCount = 12;
static const int kMipH[kMipCount] = {
  1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2047
};

static const double kWarpKnots[kWarpCount] = {
  -0.97, -0.87, -0.73, -0.66, -0.49, -0.19, 0.0,
  0.19, 0.49, 0.66, 0.73, 0.87, 0.97
};

struct State {
  bool active;
  double phase;
  double lastReset;
  double lastOut;
  double lastPhase;
};

struct Cell {
  float cs[kSpecH];
  float sn[kSpecH];
};

static State gPool[kMaxInstances];
static float gUnwarped[kFrameCount][kTableLen];
static float gMip[kFrameCount][kWarpCount][kMipCount][kTableLen];
static int gBankReady = 0;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"wavetable_2d\","
    "\"label\":\"Wavetable 2D\","
    "\"targetType\":\"wavetable2d\","
    "\"kind\":\"oscillator\""
  "}";

static void peak_normalize(float* buf, int n) {
  double peak = 0.0;
  for (int i = 0; i < n; i += 1) {
    const double a = buf[i] < 0.0f ? -(double)buf[i] : (double)buf[i];
    if (a > peak) peak = a;
  }
  if (peak > 1e-12) {
    const double s = 1.0 / peak;
    for (int i = 0; i < n; i += 1) {
      buf[i] = (float)((double)buf[i] * s);
    }
  }
}

static void dc_strip(float* buf, int n) {
  double sum = 0.0;
  for (int i = 0; i < n; i += 1) sum += (double)buf[i];
  const double mean = sum / (double)n;
  for (int i = 0; i < n; i += 1) {
    buf[i] = (float)((double)buf[i] - mean);
  }
}

static double warp_phase(double t, double warp) {
  t = wrap01(t);
  double skew = safe(warp);
  if (skew > 0.9999) skew = 0.9999;
  if (skew < -0.9999) skew = -0.9999;
  if (skew == 0.0) return t;
  const double cv = skew * t;
  const double den = 2.0 * cv - skew + 1.0;
  if (dsp_fabs(den) < 1e-12) return t;
  return wrap01((cv + t) / den);
}

static double read_table(const float* tab, double t) {
  t = wrap01(t);
  const double x = t * (double)kTableLen;
  int i0 = (int)dsp_floor(x);
  const double f = x - (double)i0;
  if (i0 < 0) i0 = 0;
  if (i0 >= kTableLen) i0 = 0;
  int i1 = i0 + 1;
  if (i1 >= kTableLen) i1 = 0;
  return (double)tab[i0] + ((double)tab[i1] - (double)tab[i0]) * f;
}

static void fft_forward(float* re, float* im, int n) {
  int j = 0;
  for (int i = 1; i < n; i += 1) {
    int bit = n >> 1;
    for (; (j & bit) != 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const float tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const float ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (int len = 2; len <= n; len <<= 1) {
    const int half = len >> 1;
    double wlenIm = 0.0;
    double wlenRe = 1.0;
    dsp_sin_cos(-kTwoPi / (double)len, &wlenIm, &wlenRe);
    for (int i = 0; i < n; i += len) {
      double wr = 1.0;
      double wi = 0.0;
      for (int k = 0; k < half; k += 1) {
        const int i0 = i + k;
        const int i1 = i0 + half;
        const double tr = wr * (double)re[i1] - wi * (double)im[i1];
        const double ti = wr * (double)im[i1] + wi * (double)re[i1];
        re[i1] = (float)((double)re[i0] - tr);
        im[i1] = (float)((double)im[i0] - ti);
        re[i0] = (float)((double)re[i0] + tr);
        im[i0] = (float)((double)im[i0] + ti);
        const double nwr = wr * wlenRe - wi * wlenIm;
        wi = wr * wlenIm + wi * wlenRe;
        wr = nwr;
      }
    }
  }
}

static void fft_inverse(float* re, float* im, int n) {
  for (int i = 0; i < n; i += 1) im[i] = -im[i];
  fft_forward(re, im, n);
  const double inv = 1.0 / (double)n;
  for (int i = 0; i < n; i += 1) {
    re[i] = (float)((double)re[i] * inv);
    im[i] = (float)(-(double)im[i] * inv);
  }
}

static void dft_store(const float* cycle, Cell* cell) {
  static float re[kTableLen];
  static float im[kTableLen];
  for (int i = 0; i < kTableLen; i += 1) {
    re[i] = cycle[i];
    im[i] = 0.0f;
  }
  fft_forward(re, im, kTableLen);
  const double scale = 2.0 / (double)kTableLen;
  for (int k = 1; k <= kSpecH; k += 1) {
    cell->cs[k - 1] = (float)(scale * -(double)im[k]);
    cell->sn[k - 1] = (float)(scale * (double)re[k]);
  }
}

static void ifft_mip(const Cell& cell, int H, float* tab) {
  static float re[kTableLen];
  static float im[kTableLen];
  const int n = kTableLen;
  int h = H;
  if (h < 1) h = 1;
  if (h > kSpecH) h = kSpecH;
  for (int i = 0; i < n; i += 1) {
    re[i] = 0.0f;
    im[i] = 0.0f;
  }
  const double mag = 0.5 * (double)n;
  for (int k = 1; k <= h; k += 1) {
    const double R = (double)cell.sn[k - 1] * mag;
    const double I = -(double)cell.cs[k - 1] * mag;
    re[k] = (float)R;
    im[k] = (float)I;
    re[n - k] = (float)R;
    im[n - k] = (float)(-I);
  }
  fft_inverse(re, im, n);
  for (int i = 0; i < n; i += 1) tab[i] = re[i];
}

static void bake_unwarped() {
  double sum = 0.0;
  for (int i = 0; i < kTableLen; i += 1) {
    const double t = (double)i / (double)kTableLen;
    double y = 0.0;
    for (int n = 1; n <= kSpecH; n += 1) {
      const double amp = 1.0 / ((double)n * (double)n);
      const double ph = (n & 1) ? 0.25 : 0.75;
      y += amp * dsp_sin(kTwoPi * ((double)n * t + ph));
    }
    gUnwarped[0][i] = (float)y;
    sum += y;
  }
  const double mean = sum / (double)kTableLen;
  for (int i = 0; i < kTableLen; i += 1) {
    gUnwarped[0][i] = (float)((double)gUnwarped[0][i] - mean);
  }
  peak_normalize(gUnwarped[0], kTableLen);
  for (int i = 0; i < kTableLen; i += 1) {
    const double t = (double)i / (double)kTableLen;
    gUnwarped[1][i] = (float)dsp_sin(kTwoPi * (t + 0.25));
  }
  peak_normalize(gUnwarped[1], kTableLen);
  {
    const int rot = kTableLen / 2;
    for (int i = 0; i < kTableLen; i += 1) {
      int j = i + rot;
      if (j >= kTableLen) j -= kTableLen;
      gUnwarped[2][i] = -gUnwarped[0][j];
    }
  }
  for (int i = 0; i < kTableLen; i += 1) {
    gUnwarped[3][i] = gUnwarped[1][i];
  }
}

static void bake_bank() {
  if (gBankReady) return;
  bake_unwarped();
  static float cycle[kTableLen];
  static Cell spec;
  for (int f = 0; f < kFrameCount; f += 1) {
    for (int w = 0; w < kWarpCount; w += 1) {
      const double knot = kWarpKnots[w];
      for (int i = 0; i < kTableLen; i += 1) {
        const double t = (double)i / (double)kTableLen;
        cycle[i] = (float)read_table(gUnwarped[f], warp_phase(t, knot));
      }
      dc_strip(cycle, kTableLen);
      peak_normalize(cycle, kTableLen);
      dft_store(cycle, &spec);
      for (int m = 0; m < kMipCount; m += 1) {
        ifft_mip(spec, kMipH[m], gMip[f][w][m]);
      }
    }
  }
  gBankReady = 1;
}

static int nyquist_harmonics(double freqHz, double increment, double sr) {
  const double inst = freqHz + increment * sr;
  const double af = inst < 0.0 ? -inst : inst;
  if (!(af > 1e-9)) return kSpecH;
  const double ny = 0.5 * sr;
  int H = (int)dsp_floor((ny * 0.999999) / af);
  if (H < 0) H = 0;
  if (H > kSpecH) H = kSpecH;
  return H;
}

static int pick_mip(int Hmax) {
  if (Hmax < 1) return -1;
  int mip = 0;
  for (int m = 0; m < kMipCount; m += 1) {
    if (kMipH[m] <= Hmax) mip = m;
    else break;
  }
  return mip;
}

static double read_morphed_mip(double t, double morph, double warp, int mip) {
  const double m = wrap01(safe(morph));
  double mpos = m * (double)kFrameCount;
  if (mpos >= (double)kFrameCount) mpos = 0.0;
  int mi0 = (int)dsp_floor(mpos);
  if (mi0 < 0) mi0 = 0;
  mi0 %= kFrameCount;
  const int mi1 = (mi0 + 1) % kFrameCount;
  const double mf = mpos - (double)mi0;

  double w = safe(warp);
  if (w < -1.0) w = -1.0;
  if (w > 1.0) w = 1.0;
  double wpos = (w + 1.0) * 0.5 * (double)(kWarpCount - 1);
  if (wpos < 0.0) wpos = 0.0;
  if (wpos > (double)(kWarpCount - 1)) wpos = (double)(kWarpCount - 1);
  int wi0 = (int)dsp_floor(wpos);
  if (wi0 < 0) wi0 = 0;
  if (wi0 > kWarpCount - 1) wi0 = kWarpCount - 1;
  int wi1 = wi0 + 1;
  if (wi1 > kWarpCount - 1) wi1 = kWarpCount - 1;
  const double wf = (wi0 == wi1) ? 0.0 : (wpos - (double)wi0);

  const double a = read_table(gMip[mi0][wi0][mip], t);
  const double b = read_table(gMip[mi1][wi0][mip], t);
  const double c = read_table(gMip[mi0][wi1][mip], t);
  const double d = read_table(gMip[mi1][wi1][mip], t);
  const double u0 = a + (b - a) * mf;
  const double u1 = c + (d - c) * mf;
  return u0 + (u1 - u0) * wf;
}

static State* slot(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  State& st = gPool[handle - 1];
  if (!st.active) return nullptr;
  return &st;
}

}  // namespace

extern "C" int soemdsp_wavetable_2d_create() {
  bake_bank();
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.phase = 0.0;
      s.lastReset = 0.0;
      s.lastOut = 0.0;
      s.lastPhase = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_wavetable_2d_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_wavetable_2d_clear_pcm(int handle) {
  (void)handle;
}

extern "C" int soemdsp_wavetable_2d_set_pcm(int handle, int frames, double sampleRate, int channels) {
  (void)handle;
  (void)frames;
  (void)sampleRate;
  (void)channels;
  return 1;
}

extern "C" int soemdsp_wavetable_2d_l_ptr(int handle) {
  (void)handle;
  if (!gBankReady) bake_bank();
  return (int)(long long)gUnwarped[0];
}

extern "C" int soemdsp_wavetable_2d_r_ptr(int handle) {
  return soemdsp_wavetable_2d_l_ptr(handle);
}

extern "C" int soemdsp_wavetable_2d_max_frames() {
  return kTableLen;
}

extern "C" void soemdsp_wavetable_2d_reset(int handle) {
  State* st = slot(handle);
  if (!st) return;
  st->phase = 0.0;
  st->lastPhase = 0.0;
}

extern "C" double soemdsp_wavetable_2d_sample(
  int handle,
  double reset,
  double frequencyHz,
  double phaseOffset,
  double amplitude,
  double morph,
  double warp,
  double increment,
  double engineSampleRate
) {
  State* stPtr = slot(handle);
  if (!stPtr) return 0.0;
  State& st = *stPtr;
  if (!gBankReady) bake_bank();

  const double rv = safe(reset);
  if (st.lastReset <= 0.0 && rv > 0.0) {
    st.phase = 0.0;
  }
  st.lastReset = rv;

  const double sr = safe(engineSampleRate) > 1.0 ? safe(engineSampleRate) : 44100.0;
  const double freq = safe(frequencyHz);
  const double inc = safe(increment);
  st.phase = wrap01(st.phase + freq / sr + inc);

  const double t = wrap01(st.phase + wrap01(safe(phaseOffset)));
  const int Hmax = nyquist_harmonics(freq, inc, sr);
  const int mip = pick_mip(Hmax);
  double y = (mip < 0) ? 0.0 : read_morphed_mip(t, morph, warp, mip);

  double amp = safe(amplitude);
  if (amp < 0.0) amp = 0.0;
  if (amp > 1.0) amp = 1.0;
  y *= amp;

  st.lastOut = y;
  st.lastPhase = t;
  return y;
}

extern "C" double soemdsp_wavetable_2d_phase(int handle) {
  State* st = slot(handle);
  return st ? st->lastPhase : 0.0;
}

extern "C" double soemdsp_wavetable_2d_out(int handle) {
  State* st = slot(handle);
  return st ? st->lastOut : 0.0;
}

extern "C" int soemdsp_wavetable_2d_version() { return 4; }
extern "C" const char* soemdsp_wavetable_2d_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_wavetable_2d_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
