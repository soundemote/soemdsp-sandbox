// soemdsp-native-module: crossover
// soemdsp-native-label: Crossover
// soemdsp-native-target: crossover2
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// Linkwitz–Riley multiway crossover (stereo), 2…6 bands.
// Tree topology matches public/modules/crossover/crossover-math.js:
// N-way uses exactly N-1 LR splits (RS-MET CrossOverNWay style).
// Serves crossover2…crossover6 (bandCount chosen at create).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kMaxBands = 6;
static const int kMaxSplits = 5;   // bands - 1
static const int kMaxBiquads = 4;  // LR8 = butter order 4 → 2 Qs × dual cascade

struct Biquad {
  double b0, b1, b2, a1, a2;
  double z1, z2;
};

struct OnePole {
  double a;
  double z;
  double x1;  // HP only
};

struct Split {
  double lastFc;
  int lastOrder;
  double lastRate;
  // LR2
  OnePole lpPole1, lpPole2, hpPole1, hpPole2;
  // LR4/LR8
  Biquad lpA[kMaxBiquads];
  Biquad lpB[kMaxBiquads];
  Biquad hpA[kMaxBiquads];
  Biquad hpB[kMaxBiquads];
  int sectionCount;
  double low;
  double high;
};

struct Channel {
  int bandCount;
  Split splits[kMaxSplits];
  double bands[kMaxBands];
  double sortedFreqs[kMaxSplits];
};

struct State {
  bool active;
  int bandCount;
  Channel left;
  Channel right;
  double outL[kMaxBands];
  double outR[kMaxBands];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"crossover\","
    "\"label\":\"Crossover\","
    "\"targetType\":\"crossover2\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\",\"L\",\"R\"],"
    "\"outputs\":[\"LFL\",\"LFR\",\"HFL\",\"HFR\"],"
    "\"parameters\":["
      "{\"key\":\"order\",\"label\":\"Order\",\"defaultValue\":4,\"min\":2,\"mid\":4,\"max\":8,\"step\":2},"
      "{\"key\":\"frequency\",\"label\":\"Freq L1\",\"kind\":\"frequency\",\"defaultValue\":1000,"
        "\"min\":20,\"mid\":1000,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"}"
    "],"
    "\"notes\":\"Native LR tree; create(bandCount) for crossover2..6\""
  "}";

static inline int clamp_lr_order(int order) {
  if (order <= 2) return 2;
  if (order <= 4) return 4;
  return 8;
}

static inline void biquad_reset(Biquad* s) {
  s->b0 = 1.0; s->b1 = 0.0; s->b2 = 0.0;
  s->a1 = 0.0; s->a2 = 0.0;
  s->z1 = 0.0; s->z2 = 0.0;
}

static inline double biquad_process(Biquad* s, double x) {
  const double y = s->b0 * x + s->z1;
  s->z1 = s->b1 * x - s->a1 * y + s->z2;
  s->z2 = s->b2 * x - s->a2 * y;
  return y;
}

static inline double one_pole_lp(OnePole* s, double x) {
  const double y = (1.0 - s->a) * x + s->a * s->z;
  s->z = safe(y);
  return s->z;
}

static inline double one_pole_hp(OnePole* s, double x) {
  const double y = s->a * (s->z + x - s->x1);
  s->x1 = x;
  s->z = safe(y);
  return s->z;
}

// Butterworth Qs for order n (1, 2, or 4). Returns count of Qs written to qs[].
static int butterworth_qs(int butterOrder, double* qs) {
  if (butterOrder <= 1) return 0;
  const int n = butterOrder;
  const int m = n / 2;
  for (int i = 0; i < m && i < kMaxBiquads; i++) {
    const double ang = (2.0 * i + 1.0) * kPi / (2.0 * n);
    double s = dsp_sin_0_pi(ang > kPi ? kPi : ang);
    if (s < 1e-9) s = 1e-9;
    qs[i] = 1.0 / (2.0 * s);
  }
  return m;
}

static void design_biquad_lp(Biquad* s, double f0, double Q, double rate) {
  const double sr = maxd(1.0, rate);
  const double f = clamp(f0, 1e-9, sr * 0.49);
  const double q = clamp(Q, 0.05, 100.0);
  const double w0 = (2.0 * kPi * f) / sr;
  const double sinw = dsp_sin(w0);
  const double cosw = dsp_cos(w0);
  const double alpha = sinw / (2.0 * q);
  const double a0 = 1.0 + alpha;
  const double inv = a0 != 0.0 ? 1.0 / a0 : 1.0;
  const double b1 = 1.0 - cosw;
  const double b0 = 0.5 * b1;
  s->b0 = b0 * inv;
  s->b1 = b1 * inv;
  s->b2 = b0 * inv;
  s->a1 = (-2.0 * cosw) * inv;
  s->a2 = (1.0 - alpha) * inv;
}

static void design_biquad_hp(Biquad* s, double f0, double Q, double rate) {
  const double sr = maxd(1.0, rate);
  const double f = clamp(f0, 1e-9, sr * 0.49);
  const double q = clamp(Q, 0.05, 100.0);
  const double w0 = (2.0 * kPi * f) / sr;
  const double sinw = dsp_sin(w0);
  const double cosw = dsp_cos(w0);
  const double alpha = sinw / (2.0 * q);
  const double a0 = 1.0 + alpha;
  const double inv = a0 != 0.0 ? 1.0 / a0 : 1.0;
  const double b1 = -(1.0 + cosw);
  const double b0 = -0.5 * b1;
  s->b0 = b0 * inv;
  s->b1 = b1 * inv;
  s->b2 = b0 * inv;
  s->a1 = (-2.0 * cosw) * inv;
  s->a2 = (1.0 - alpha) * inv;
}

static double one_pole_a(double f0, double rate) {
  const double sr = maxd(1.0, rate);
  const double f = clamp(f0, 0.0, sr * 0.49);
  double w = (2.0 * kPi * f) / sr;
  if (w > kPi * 0.999) w = kPi * 0.999;
  return dsp_exp(-w);
}

static void remap_cascade(Biquad* dest, const Biquad* prev, int count,
                          void (*design)(Biquad*, double, double, double),
                          const double* qs, double f, double sr, bool keepState) {
  for (int i = 0; i < count; i++) {
    Biquad next;
    biquad_reset(&next);
    design(&next, f, qs[i], sr);
    if (keepState && prev) {
      next.z1 = prev[i].z1;
      next.z2 = prev[i].z2;
    }
    dest[i] = next;
  }
  for (int i = count; i < kMaxBiquads; i++) {
    biquad_reset(&dest[i]);
  }
}

static void ensure_split(Split* st, double fc, int lrOrder, double rate) {
  const int order = clamp_lr_order(lrOrder);
  const double f = maxd(1e-3, safe(fc));
  const double sr = maxd(1.0, rate);
  const double prevF = st->lastFc;
  const bool sameOrder = st->lastOrder == order;
  const bool sameRate = st->lastRate == sr;
  if (sameOrder && sameRate && prevF * 0.0 == 0.0
      && dsp_fabs(prevF - f) <= maxd(0.05, prevF * 1e-4)) {
    return;
  }
  const bool keepState = sameOrder && sameRate;
  st->lastFc = f;
  st->lastOrder = order;
  st->lastRate = sr;

  if (order == 2) {
    const double a = one_pole_a(f, sr);
    if (keepState) {
      st->lpPole1.a = a;
      st->lpPole2.a = a;
      st->hpPole1.a = a;
      st->hpPole2.a = a;
    } else {
      st->lpPole1 = { a, 0.0, 0.0 };
      st->lpPole2 = { a, 0.0, 0.0 };
      st->hpPole1 = { a, 0.0, 0.0 };
      st->hpPole2 = { a, 0.0, 0.0 };
    }
    st->sectionCount = 0;
    return;
  }

  const int butterOrder = order / 2;
  double qs[kMaxBiquads];
  const int nQ = butterworth_qs(butterOrder, qs);
  st->sectionCount = nQ;
  remap_cascade(st->lpA, keepState ? st->lpA : nullptr, nQ, design_biquad_lp, qs, f, sr, keepState);
  remap_cascade(st->lpB, keepState ? st->lpB : nullptr, nQ, design_biquad_lp, qs, f, sr, keepState);
  remap_cascade(st->hpA, keepState ? st->hpA : nullptr, nQ, design_biquad_hp, qs, f, sr, keepState);
  remap_cascade(st->hpB, keepState ? st->hpB : nullptr, nQ, design_biquad_hp, qs, f, sr, keepState);
}

static void lr_split(Split* st, double x, double fc, int lrOrder, double rate) {
  ensure_split(st, fc, lrOrder, rate);
  const double xin = safe(x);
  if (st->lastOrder == 2) {
    double low = one_pole_lp(&st->lpPole1, xin);
    low = one_pole_lp(&st->lpPole2, low);
    double high = one_pole_hp(&st->hpPole1, xin);
    high = one_pole_hp(&st->hpPole2, high);
    st->low = low;
    st->high = high;
    return;
  }
  double low = xin;
  for (int i = 0; i < st->sectionCount; i++) low = biquad_process(&st->lpA[i], low);
  for (int i = 0; i < st->sectionCount; i++) low = biquad_process(&st->lpB[i], low);
  double high = xin;
  for (int i = 0; i < st->sectionCount; i++) high = biquad_process(&st->hpA[i], high);
  for (int i = 0; i < st->sectionCount; i++) high = biquad_process(&st->hpB[i], high);
  st->low = low;
  st->high = high;
}

static void fill_sorted_freqs(double* dest, const double* freqs, int count) {
  for (int i = 0; i < count; i++) {
    dest[i] = maxd(0.0, safe(freqs[i]));
  }
  for (int i = 1; i < count; i++) {
    if (dest[i] < dest[i - 1]) dest[i] = dest[i - 1];
  }
}

static void process_channel(Channel* ch, double x, const double* freqs, int lrOrder, double rate) {
  const int n = ch->bandCount;
  const int splitCount = n - 1;
  fill_sorted_freqs(ch->sortedFreqs, freqs, splitCount);
  const int order = clamp_lr_order(lrOrder);
  const double xin = safe(x);
  double* bands = ch->bands;
  Split* splits = ch->splits;
  const double* f = ch->sortedFreqs;

  if (n == 2) {
    lr_split(&splits[0], xin, f[0], order, rate);
    bands[0] = splits[0].low;
    bands[1] = splits[0].high;
    return;
  }
  if (n == 3) {
    lr_split(&splits[0], xin, f[0], order, rate);
    bands[0] = splits[0].low;
    lr_split(&splits[1], splits[0].high, f[1], order, rate);
    bands[1] = splits[1].low;
    bands[2] = splits[1].high;
    return;
  }
  if (n == 4) {
    lr_split(&splits[1], xin, f[1], order, rate);
    const double midLow = splits[1].low;
    const double midHigh = splits[1].high;
    lr_split(&splits[0], midLow, f[0], order, rate);
    bands[0] = splits[0].low;
    bands[1] = splits[0].high;
    lr_split(&splits[2], midHigh, f[2], order, rate);
    bands[2] = splits[2].low;
    bands[3] = splits[2].high;
    return;
  }
  if (n == 5) {
    lr_split(&splits[2], xin, f[2], order, rate);
    const double lowHalf = splits[2].low;
    const double highHalf = splits[2].high;
    lr_split(&splits[0], lowHalf, f[0], order, rate);
    bands[0] = splits[0].low;
    lr_split(&splits[1], splits[0].high, f[1], order, rate);
    bands[1] = splits[1].low;
    bands[2] = splits[1].high;
    lr_split(&splits[3], highHalf, f[3], order, rate);
    bands[3] = splits[3].low;
    bands[4] = splits[3].high;
    return;
  }
  // n == 6
  lr_split(&splits[2], xin, f[2], order, rate);
  const double lowHalf6 = splits[2].low;
  const double highHalf6 = splits[2].high;
  lr_split(&splits[0], lowHalf6, f[0], order, rate);
  bands[0] = splits[0].low;
  lr_split(&splits[1], splits[0].high, f[1], order, rate);
  bands[1] = splits[1].low;
  bands[2] = splits[1].high;
  lr_split(&splits[3], highHalf6, f[3], order, rate);
  bands[3] = splits[3].low;
  lr_split(&splits[4], splits[3].high, f[4], order, rate);
  bands[4] = splits[4].low;
  bands[5] = splits[4].high;
}

static void channel_init(Channel* ch, int bandCount) {
  ch->bandCount = bandCount;
  for (int i = 0; i < kMaxSplits; i++) {
    Split& sp = ch->splits[i];
    sp.lastFc = -1.0;  // force redesign on first ensure_split
    sp.lastOrder = -1;
    sp.lastRate = 0.0;
    sp.sectionCount = 0;
    sp.low = 0.0;
    sp.high = 0.0;
    sp.lpPole1 = { 0.0, 0.0, 0.0 };
    sp.lpPole2 = { 0.0, 0.0, 0.0 };
    sp.hpPole1 = { 0.0, 0.0, 0.0 };
    sp.hpPole2 = { 0.0, 0.0, 0.0 };
    for (int j = 0; j < kMaxBiquads; j++) {
      biquad_reset(&sp.lpA[j]);
      biquad_reset(&sp.lpB[j]);
      biquad_reset(&sp.hpA[j]);
      biquad_reset(&sp.hpB[j]);
    }
  }
  for (int i = 0; i < kMaxBands; i++) ch->bands[i] = 0.0;
  for (int i = 0; i < kMaxSplits; i++) ch->sortedFreqs[i] = 0.0;
}

static void state_init(State* s, int bandCount) {
  s->bandCount = bandCount;
  channel_init(&s->left, bandCount);
  channel_init(&s->right, bandCount);
  for (int i = 0; i < kMaxBands; i++) {
    s->outL[i] = 0.0;
    s->outR[i] = 0.0;
  }
}

}  // namespace

extern "C" int soemdsp_crossover_create(int bandCount) {
  const int n = clamp_int(bandCount, 2, 6);
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      state_init(&gPool[i], n);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_crossover_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_crossover_sample(
  int handle,
  double mono,
  double leftIn,
  double rightIn,
  double f0,
  double f1,
  double f2,
  double f3,
  double f4,
  int lrOrder,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  if (!s.active) return;
  const int n = s.bandCount;
  const double m = safe(mono);
  const double lIn = safe(leftIn) + m;
  const double rIn = safe(rightIn) + m;
  const int order = clamp_lr_order(lrOrder);
  const double rate = maxd(1.0, sampleRate);
  double freqs[kMaxSplits] = { f0, f1, f2, f3, f4 };

  process_channel(&s.left, lIn, freqs, order, rate);
  process_channel(&s.right, rIn, freqs, order, rate);
  for (int i = 0; i < n; i++) {
    s.outL[i] = safe(s.left.bands[i]);
    s.outR[i] = safe(s.right.bands[i]);
  }
}

extern "C" double soemdsp_crossover_band_l(int handle, int bandIndex) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  const int i = clamp_int(bandIndex, 0, s.bandCount - 1);
  return s.outL[i];
}

extern "C" double soemdsp_crossover_band_r(int handle, int bandIndex) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  const int i = clamp_int(bandIndex, 0, s.bandCount - 1);
  return s.outR[i];
}

extern "C" int soemdsp_crossover_band_count(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  State& s = gPool[handle - 1];
  return s.active ? s.bandCount : 0;
}

extern "C" int soemdsp_crossover_version() { return 1; }
extern "C" const char* soemdsp_crossover_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_crossover_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
