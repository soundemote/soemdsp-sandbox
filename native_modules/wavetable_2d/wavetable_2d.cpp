// soemdsp-native-module: wavetable_2d
// soemdsp-native-label: Wavetable 2D
// soemdsp-native-target: wavetable2d
// soemdsp-native-kind: oscillator
//
// Hardcoded 4096-sample cycle: Additive RectSine (1/n², odd 0.25 / even 0.75),
// DC removed, peak-normalized. Cheap realtime: phase, warp, start/end, PM.
// Morph is reserved (single frame).

#include "../sandbox_native_maths/sandbox_native_maths.h"

#include <stddef.h>
#include <stdint.h>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const int kTableLen = 4096;
static const int kTableHarmonics = kTableLen / 2 - 1; // 2047
static const int kFrameCount = 3;

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
  for (int i = 0; i < kTableLen; i += 1) {
    gBank[0][i] = (float)((double)gBank[0][i] - mean);
  }
  peak_normalize(gBank[0], kTableLen);
  // Frame 1: sine, same fundamental phase as RectSine n=1 (0.25).
  for (int i = 0; i < kTableLen; i += 1) {
    const double t = (double)i / (double)kTableLen;
    gBank[1][i] = (float)dsp_sin(kTwoPi * (t + 0.25));
  }
  peak_normalize(gBank[1], kTableLen);
  // Frame 2: invert + 90° (N/4). 180°/time-reverse of this 2-hump cycle is
  // palindromic. 90° puts the inverted point on the sine's opposite swing.
  {
    const int rot = kTableLen / 4;
    for (int i = 0; i < kTableLen; i += 1) {
      int j = i + rot;
      if (j >= kTableLen) j -= kTableLen;
      gBank[2][i] = -gBank[0][j];
    }
  }
  gBankReady = 1;
}

static double clamp01(double x) {
  if (!(x * 0.0 == 0.0)) return 0.0;
  if (x < 0.0) return 0.0;
  if (x > 1.0) return 1.0;
  return x;
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

static double map_region(double t, double start, double end) {
  t = wrap01(t);
  const double a = clamp01(safe(start));
  const double b = clamp01(safe(end));
  const double span = b - a;
  if (dsp_fabs(span) <= 1e-6) return t;
  if (span > 0.0) return wrap01(a + t * span);
  // Wrapped region a→1 then 0→b.
  const double len = (1.0 - a) + b;
  if (len <= 1e-6) return t;
  const double u = t * len;
  if (u < (1.0 - a)) return wrap01(a + u);
  return wrap01(u - (1.0 - a));
}

static double read_cycle(const float* table, double t) {
  t = wrap01(t);
  const double idx = t * (double)kTableLen;
  const double i0d = dsp_floor(idx);
  int i0 = (int)i0d;
  if (i0 < 0) i0 = 0;
  i0 %= kTableLen;
  int i1 = i0 + 1;
  if (i1 >= kTableLen) i1 = 0;
  const double frac = idx - i0d;
  const double a = (double)table[i0];
  const double b = (double)table[i1];
  return a + (b - a) * frac;
}

static double read_morphed(double t, double morph) {
  const double m = clamp01(safe(morph));
  const double pos = m * (double)(kFrameCount - 1);
  int i0 = (int)dsp_floor(pos);
  if (i0 < 0) i0 = 0;
  if (i0 > kFrameCount - 1) i0 = kFrameCount - 1;
  int i1 = i0 + 1;
  if (i1 > kFrameCount - 1) i1 = kFrameCount - 1;
  const double frac = pos - (double)i0;
  const double a = read_cycle(gBank[i0], t);
  if (frac <= 1e-9 || i0 == i1) return a;
  const double b = read_cycle(gBank[i1], t);
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
  double start,
  double end,
  double pm,
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
  st.phase = wrap01(st.phase + freq / sr + safe(increment));

  double t = wrap01(st.phase + wrap01(safe(phaseOffset)) + safe(pm));
  t = warp_phase(t, warp);
  t = map_region(t, start, end);
  double y = read_morphed(t, morph);

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
