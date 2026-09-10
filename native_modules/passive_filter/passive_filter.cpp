// soemdsp-native-module: passive_filter
// soemdsp-native-label: Passive Filter
// soemdsp-native-target: passiveFilter
// soemdsp-native-kind: filter
//
// Cascaded real 1-poles (no Q). Slope 0..3 → 1..4 poles. Stagger spreads poles.
// Sweep shifts cutoffs in semitones. Gain Comp scales stack to −3 dB at label fc.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
static const int kMaxStages = 4;

struct Pole {
  double inBuf;
  double outBuf;
};

struct PassiveState {
  Pole hp[kMaxStages];
  Pole lp[kMaxStages];
  bool active;
};

static PassiveState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"passive_filter\","
    "\"label\":\"Passive Filter\","
    "\"targetType\":\"passiveFilter\","
    "\"kind\":\"filter\""
  "}";

static int stage_count(double slope) {
  int n = (int)(slope + (slope >= 0.0 ? 0.5 : -0.5));
  if (n < 0) n = 0;
  if (n > 3) n = 3;
  return n + 1;
}

static double stagger_k(double stagger) {
  if (!(stagger == stagger) || stagger < 1.0) return 1.0;
  return stagger > 8.0 ? 8.0 : stagger;
}

static double apply_sweep_hz(double hz, double sweepSemis) {
  if (!(hz > 0.0)) return 0.0;
  if (!(sweepSemis == sweepSemis) || sweepSemis == 0.0) return hz;
  return hz * dsp_exp((sweepSemis / 12.0) * 0.6931471805599453); // * 2^(st/12)
}

static double one_pole_lp(Pole& p, double x, double freq, double rate) {
  const double maxW = kTwoPi * 0.45;
  const double f = freq < 0.0 ? 0.0 : (freq > 20000.0 ? 20000.0 : freq);
  const double w = f * kTwoPi / rate;
  const double wc = w > maxW ? maxW : w;
  const double a1 = dsp_exp_squaring(-wc);
  const double b0 = 1.0 - a1;
  p.outBuf = safe(b0 * x + a1 * p.outBuf);
  return p.outBuf;
}

static double one_pole_hp(Pole& p, double x, double freq, double rate) {
  const double maxW = kTwoPi * 0.45;
  const double f = freq < 0.0 ? 0.0 : (freq > 20000.0 ? 20000.0 : freq);
  const double w = f * kTwoPi / rate;
  const double wc = w > maxW ? maxW : w;
  const double a1 = dsp_exp_squaring(-wc);
  const double b0 = 0.5 * (1.0 + a1);
  p.outBuf = safe(b0 * x - b0 * p.inBuf + a1 * p.outBuf);
  p.inBuf = x;
  return p.outBuf;
}

static double dsqrt(double x) {
  return x > 0.0 ? (double)__builtin_sqrt((float)x) : 0.0;
}

static double dhypot(double a, double b) {
  return dsqrt(a * a + b * b);
}

static double analog_mag_at_fc(bool hp, const double* freqs, int n, double fc, double alpha) {
  if (!(fc > 0.0) || n < 1) return 1.0;
  double mag = 1.0;
  for (int i = 0; i < n; i++) {
    const double fi = maxd(0.0, freqs[i]) * alpha;
    const double den = dhypot(fc, fi);
    if (!(den > 0.0)) return 0.0;
    mag *= hp ? (fc / den) : (fi / den);
  }
  return mag;
}

static double comp_alpha(bool hp, const double* freqs, int n, double fc) {
  if (n < 1 || !(fc > 0.0)) return 1.0;
  bool identical = true;
  for (int i = 0; i < n; i++) {
    if (dsp_fabs(freqs[i] - fc) > 1e-9 * maxd(1.0, fc)) {
      identical = false;
      break;
    }
  }
  if (identical) {
    const double s = dsqrt(dsp_exp(dsp_ln(2.0) / (double)n) - 1.0);
    if (!(s > 0.0)) return 1.0;
    return hp ? s : (1.0 / s);
  }
  const double target = 0.7071067811865476;
  double lo = 1e-6;
  double hi = 1e6;
  for (int i = 0; i < 20; i++) {
    const double mid = dsqrt(lo * hi);
    const double mag = analog_mag_at_fc(hp, freqs, n, fc, mid);
    if (hp) {
      if (mag < target) hi = mid;
      else lo = mid;
    } else {
      if (mag < target) lo = mid;
      else hi = mid;
    }
  }
  return dsqrt(lo * hi);
}

static void stack_freqs(double fc, int n, double k, bool gainComp, bool hp, double* out) {
  const double center = maxd(0.0, fc);
  const double mid = (n - 1) * 0.5;
  for (int i = 0; i < n; i++) {
    out[i] = center * dsp_exp((i - mid) * dsp_ln(k));
  }
  if (!gainComp || !(center > 0.0)) return;
  const double alpha = comp_alpha(hp, out, n, center);
  for (int i = 0; i < n; i++) out[i] *= alpha;
}

static double cascade(Pole* poles, double x, const double* freqs, int n, bool hp, double rate) {
  double y = x;
  for (int i = 0; i < n; i++) {
    y = hp ? one_pole_hp(poles[i], y, freqs[i], rate) : one_pole_lp(poles[i], y, freqs[i], rate);
  }
  return y;
}

}  // namespace

extern "C" int soemdsp_passive_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PassiveState& s = gPool[i];
      for (int p = 0; p < kMaxStages; p++) {
        s.hp[p].inBuf = 0.0;
        s.hp[p].outBuf = 0.0;
        s.lp[p].inBuf = 0.0;
        s.lp[p].outBuf = 0.0;
      }
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_passive_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Extended sample: slope 0..3, stagger ≥1, sweep semitones, gainComp 0/1.
extern "C" double soemdsp_passive_filter_sample_ex(
  int handle,
  double input,
  int mode,
  double lowFrequency,
  double highFrequency,
  double sampleRate,
  double slope,
  double stagger,
  double sweepSemis,
  double gainCompensation
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PassiveState& s = gPool[handle - 1];
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double safeIn = safe(input);
  const int n = stage_count(slope);
  const double k = stagger_k(stagger);
  const bool comp = gainCompensation >= 0.5;
  double lo = apply_sweep_hz(lowFrequency, sweepSemis);
  double hi = apply_sweep_hz(highFrequency, sweepSemis);
  if (lo < 0.0) lo = 0.0;
  if (hi < 0.0) hi = 0.0;

  double hpHz[kMaxStages];
  double lpHz[kMaxStages];

  if (mode == 1) {
    const double low = mind(lo, hi);
    const double high = maxd(lo, hi);
    stack_freqs(low, n, k, comp, true, hpHz);
    stack_freqs(high, n, k, comp, false, lpHz);
    const double hp = cascade(s.hp, safeIn, hpHz, n, true, rate);
    return cascade(s.lp, hp, lpHz, n, false, rate);
  }
  if (mode == 2) {
    stack_freqs(lo, n, k, comp, true, hpHz);
    return cascade(s.hp, safeIn, hpHz, n, true, rate);
  }
  stack_freqs(hi, n, k, comp, false, lpHz);
  return cascade(s.lp, safeIn, lpHz, n, false, rate);
}

// Legacy 1-pole entry (slope=0, stagger=1, sweep=0, comp on).
extern "C" double soemdsp_passive_filter_sample(
  int handle,
  double input,
  int mode,
  double lowFrequency,
  double highFrequency,
  double sampleRate
) {
  return soemdsp_passive_filter_sample_ex(
    handle, input, mode, lowFrequency, highFrequency, sampleRate, 0.0, 1.0, 0.0, 1.0
  );
}

extern "C" int soemdsp_passive_filter_version() { return 2; }
extern "C" const char* soemdsp_passive_filter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_passive_filter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
