// soemdsp-native-module: wavetable_2d
// soemdsp-native-label: Wavetable 2D
// soemdsp-native-target: wavetable2d
// soemdsp-native-kind: oscillator
//
// Additive RectSine / sine / invert-180 bank. Audio is summed at playback
// with harmonics n·f ≥ Nyquist omitted. Tables are display-only.

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kTableLen = 4096;
static const int kTableHarmonics = kTableLen / 2 - 1; // 2047
static const int kFrameCount = 4;

struct State {
  bool active;
  double phase;
  double lastReset;
  double lastOut;
  double lastPhase;
};

static State gPool[kMaxInstances];
static float gBank[kFrameCount][kTableLen];
static int gBankReady = 0;
static double gRectScale = 1.0;

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

static void bake_bank() {
  if (gBankReady) return;
  double sum = 0.0;
  for (int i = 0; i < kTableLen; i += 1) {
    const double t = (double)i / (double)kTableLen;
    double y = 0.0;
    for (int n = 1; n <= kTableHarmonics; n += 1) {
      const double amp = 1.0 / ((double)n * (double)n);
      const double ph = (n & 1) ? 0.25 : 0.75;
      y += amp * dsp_sin(kTwoPi * ((double)n * t + ph));
    }
    gBank[0][i] = (float)y;
    sum += y;
  }
  const double mean = sum / (double)kTableLen;
  double peak = 0.0;
  for (int i = 0; i < kTableLen; i += 1) {
    const double v = (double)gBank[0][i] - mean;
    gBank[0][i] = (float)v;
    const double a = v < 0.0 ? -v : v;
    if (a > peak) peak = a;
  }
  gRectScale = peak > 1e-12 ? (1.0 / peak) : 1.0;
  peak_normalize(gBank[0], kTableLen);
  // Frame 1: sine, same fundamental phase as RectSine n=1 (0.25).
  for (int i = 0; i < kTableLen; i += 1) {
    const double t = (double)i / (double)kTableLen;
    gBank[1][i] = (float)dsp_sin(kTwoPi * (t + 0.25));
  }
  peak_normalize(gBank[1], kTableLen);
  // Frame 2: invert + 180° (N/2). RectSine has odd harmonics, so half-cycle
  // is not palindromic — it maps the bottom-swing point onto the sine's top.
  {
    const int rot = kTableLen / 2;
    for (int i = 0; i < kTableLen; i += 1) {
      int j = i + rot;
      if (j >= kTableLen) j -= kTableLen;
      gBank[2][i] = -gBank[0][j];
    }
  }
  // Frame 3: sine again so Morph wraparound closes inv-rect → sine → rect.
  for (int i = 0; i < kTableLen; i += 1) {
    gBank[3][i] = gBank[1][i];
  }
  gBankReady = 1;
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

static double sum_rect(double t, int Hmax, bool inv180) {
  if (Hmax < 1) return 0.0;
  double y = 0.0;
  for (int n = 1; n <= Hmax; n += 1) {
    double amp = 1.0 / ((double)n * (double)n);
    double ph = (n & 1) ? 0.25 : 0.75;
    if (inv180) {
      amp = -amp;
      ph += 0.5 * (double)n;
    }
    y += amp * dsp_sin(kTwoPi * ((double)n * t + ph));
  }
  return y * gRectScale;
}

static double sum_sine(double t, int Hmax) {
  if (Hmax < 1) return 0.0;
  return dsp_sin(kTwoPi * (t + 0.25));
}

static double sum_frame(int frame, double t, int Hmax) {
  if (frame == 1 || frame == 3) return sum_sine(t, Hmax);
  if (frame == 2) return sum_rect(t, Hmax, true);
  return sum_rect(t, Hmax, false);
}

static int nyquist_harmonics(double freqHz, double increment, double sr) {
  const double inst = freqHz + increment * sr;
  const double af = inst < 0.0 ? -inst : inst;
  if (!(af > 1e-9)) return kTableHarmonics;
  const double ny = 0.5 * sr;
  int H = (int)dsp_floor((ny * 0.999999) / af);
  if (H < 0) H = 0;
  if (H > kTableHarmonics) H = kTableHarmonics;
  return H;
}

static double read_morphed(double t, double morph, int Hmax) {
  const double m = wrap01(safe(morph));
  double pos = m * (double)kFrameCount;
  if (pos >= (double)kFrameCount) pos = 0.0;
  int i0 = (int)dsp_floor(pos);
  if (i0 < 0) i0 = 0;
  i0 %= kFrameCount;
  const int i1 = (i0 + 1) % kFrameCount;
  const double frac = pos - (double)i0;
  const double a = sum_frame(i0, t, Hmax);
  if (frac <= 1e-9) return a;
  const double b = sum_frame(i1, t, Hmax);
  return a + (b - a) * frac;
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
  return (int)(long long)gBank[0];
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

  double t = wrap01(st.phase + wrap01(safe(phaseOffset)));
  t = warp_phase(t, warp);
  const int Hmax = nyquist_harmonics(freq, inc, sr);
  double y = read_morphed(t, morph, Hmax);

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

extern "C" int soemdsp_wavetable_2d_version() { return 2; }
extern "C" const char* soemdsp_wavetable_2d_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_wavetable_2d_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
