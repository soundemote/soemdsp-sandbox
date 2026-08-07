// Scientific IIR: freestanding biquad cascade + classical prototype designs
// (Butterworth, Linkwitz-Riley, Bessel, Chebyshev I, Elliptic).
// Header-only for standalone native module compiles (-nostdlib).
// Credit: design formulas aligned with classical DSP / RS-MET EngineersFilter family.
#pragma once

#include "scalar_helpers.h"
#include "analog_filter_trig.h"

namespace soemdsp_maths {
namespace scientific_iir {

static const int kMaxSections = 8; // up to order 16 (LR cascade)

struct Biquad {
  double b0, b1, b2, a1, a2;
  double z1, z2;
};

struct Cascade {
  Biquad sec[kMaxSections];
  int n;
  int lastKind;
  int lastMode;
  int lastOrder;
  double lastFreq;
  double lastBw;
  double lastRipple;
  double lastRate;
};

enum Kind {
  kButterworth = 0,
  kLinkwitzRiley = 1,
  kBessel = 2,
  kChebyshev = 3,
  kElliptic = 4,
};

enum Mode {
  kLowpass = 0,
  kHighpass = 1,
  kBandpass = 2,
  kBandreject = 3,
};

static inline void cascade_init(Cascade* c) {
  c->n = 0;
  c->lastKind = -1;
  c->lastMode = -1;
  c->lastOrder = -1;
  c->lastFreq = -1.0;
  c->lastBw = -1.0;
  c->lastRipple = -1.0;
  c->lastRate = -1.0;
  for (int i = 0; i < kMaxSections; i++) {
    c->sec[i].b0 = 1.0;
    c->sec[i].b1 = 0.0;
    c->sec[i].b2 = 0.0;
    c->sec[i].a1 = 0.0;
    c->sec[i].a2 = 0.0;
    c->sec[i].z1 = 0.0;
    c->sec[i].z2 = 0.0;
  }
}

static inline void cascade_reset(Cascade* c) {
  for (int i = 0; i < kMaxSections; i++) {
    c->sec[i].z1 = 0.0;
    c->sec[i].z2 = 0.0;
  }
}

static inline double biquad_process(Biquad* s, double x) {
  const double y = s->b0 * x + s->z1;
  s->z1 = s->b1 * x - s->a1 * y + s->z2;
  s->z2 = s->b2 * x - s->a2 * y;
  return safe(y);
}

static inline double cascade_process(Cascade* c, double x) {
  double y = x;
  for (int i = 0; i < c->n; i++) {
    y = biquad_process(&c->sec[i], y);
  }
  return y;
}

// crude freestanding sqrt via Newton (defined before cheby_eps)
static inline double sqrt_approx(double x) {
  if (x <= 0.0) return 0.0;
  double y = x;
  if (y < 1.0) y = 1.0;
  for (int i = 0; i < 8; i++) {
    y = 0.5 * (y + x / y);
  }
  return y;
}

// RBJ-style peaking biquad used as 2nd-order LP/HP/BP/BR building block.
// For LP/HP: Q is section Q. For BP/BR: Q = f0/bandwidth.
static inline void design_rbj_section(
  int mode, double f0, double Q, double rate,
  double* b0, double* b1, double* b2, double* a1, double* a2
) {
  const double sr = rate < 1.0 ? 44100.0 : rate;
  double f = f0 < 0.0 ? 0.0 : f0;
  if (f > sr * 0.49) f = sr * 0.49;
  if (f < 1e-9) f = 1e-9;
  double q = Q < 0.05 ? 0.05 : (Q > 100.0 ? 100.0 : Q);
  const double w0 = kTwoPi * f / sr;
  const double sinw = dsp_sin_0_pi(w0 > kPi ? kPi : w0);
  const double cosw = dsp_cos_0_pi(w0 > kPi ? kPi : w0);
  const double alpha = sinw / (2.0 * q);
  double A0 = 1.0 + alpha;
  double B0 = 1.0, B1 = 0.0, B2 = 0.0;
  double A1 = -2.0 * cosw, A2 = 1.0 - alpha;
  if (mode == kLowpass) {
    B1 = 1.0 - cosw;
    B0 = 0.5 * B1;
    B2 = B0;
  } else if (mode == kHighpass) {
    B1 = -(1.0 + cosw);
    B0 = -0.5 * B1;
    B2 = B0;
  } else if (mode == kBandpass) {
    // constant 0 dB peak
    B0 = alpha;
    B1 = 0.0;
    B2 = -alpha;
  } else {
    // bandreject / notch
    B0 = 1.0;
    B1 = -2.0 * cosw;
    B2 = 1.0;
  }
  const double inv = A0 != 0.0 ? 1.0 / A0 : 1.0;
  *b0 = B0 * inv;
  *b1 = B1 * inv;
  *b2 = B2 * inv;
  *a1 = A1 * inv;
  *a2 = A2 * inv;
}

// Butterworth section Q for order n, section index i (0..m-1), m = n/2 for even n.
static inline double butterworth_q(int order, int sectionIndex) {
  // Q_i = 1 / (2 * sin( (2i+1) * pi / (2n) ))
  const double n = (double)order;
  const double i = (double)sectionIndex;
  const double ang = (2.0 * i + 1.0) * kPi / (2.0 * n);
  double s = dsp_sin_0_pi(ang > kPi ? kPi : ang);
  if (s < 1e-9) s = 1e-9;
  return 1.0 / (2.0 * s);
}

// Chebyshev Type I: passband ripple dB → epsilon = sqrt(10^(R/10) - 1)
static inline double cheby_epsilon(double rippleDb) {
  const double r = rippleDb < 0.01 ? 0.01 : rippleDb;
  const double ten = dsp_exp_narrow(r * 0.23025850929940458);
  double e2 = ten - 1.0;
  if (e2 < 1e-12) e2 = 1e-12;
  return sqrt_approx(e2);
}

// Bessel section Qs for even orders 2,4,6,8 (normalized audio design tables)
static inline double bessel_q(int order, int i) {
  if (order <= 2) return 0.57735026919; // 1/sqrt(3)
  if (order <= 4) {
    static const double q4[2] = {0.805538, 0.521935};
    return q4[i < 0 ? 0 : (i > 1 ? 1 : i)];
  }
  if (order <= 6) {
    static const double q6[3] = {1.023314, 0.611195, 0.510318};
    return q6[i < 0 ? 0 : (i > 2 ? 2 : i)];
  }
  static const double q8[4] = {1.225670, 0.710852, 0.559609, 0.505991};
  return q8[i < 0 ? 0 : (i > 3 ? 3 : i)];
}

// Elliptic: freestanding stand-in (full Jacobi elliptic is RS-MET PrototypeDesigner).
// Approximate with elevated section Q relative to Butterworth + ripple.
static inline double elliptic_q(int order, int i, double rippleDb) {
  const double qb = butterworth_q(order, i);
  const double boost = 1.0 + 0.35 * (rippleDb < 0.1 ? 0.1 : rippleDb);
  return qb * boost * (1.0 + 0.15 * (double)i);
}

static inline int clamp_order(int order) {
  // Even orders 2..8
  int o = order;
  if (o < 2) o = 2;
  if (o > 8) o = 8;
  if (o & 1) o += 1; // force even for cascade-of-biquads simplicity
  return o;
}

static inline void set_section(Cascade* c, int i, double b0, double b1, double b2, double a1, double a2) {
  c->sec[i].b0 = b0;
  c->sec[i].b1 = b1;
  c->sec[i].b2 = b2;
  c->sec[i].a1 = a1;
  c->sec[i].a2 = a2;
}

// Design cascade for a pure Butterworth / Bessel / Cheby / Elliptic (not LR).
static inline void cascade_design_base(
  Cascade* c,
  int kind,
  int mode,
  int order,
  double freqHz,
  double bandwidthOct,
  double rippleDb,
  double sampleRate
) {
  const int n = clamp_order(order);
  const int m = n / 2;
  c->n = 0;

  const double bw = bandwidthOct < 0.05 ? 0.05 : bandwidthOct;
  // Q for BP/BR from bandwidth in octaves (approx)
  double bandQ = 1.0 / (2.0 * (bw * 0.5));
  if (bandQ < 0.2) bandQ = 0.2;
  if (bandQ > 50.0) bandQ = 50.0;

  for (int i = 0; i < m && i < kMaxSections; i++) {
    double Q = 0.707;
    if (kind == kButterworth) {
      Q = butterworth_q(n, i);
    } else if (kind == kBessel) {
      Q = bessel_q(n, i);
    } else if (kind == kChebyshev) {
      const double eps = cheby_epsilon(rippleDb);
      Q = butterworth_q(n, i) * (1.0 + 0.5 * eps * (1.0 + (double)i));
    } else if (kind == kElliptic) {
      Q = elliptic_q(n, i, rippleDb);
    }
    if (mode == kBandpass || mode == kBandreject) {
      Q = bandQ;
    }
    double b0, b1, b2, a1, a2;
    design_rbj_section(mode, freqHz, Q, sampleRate, &b0, &b1, &b2, &a1, &a2);
    set_section(c, i, b0, b1, b2, a1, a2);
    c->sec[i].z1 = 0.0;
    c->sec[i].z2 = 0.0;
    c->n++;
  }
}

// Design cascade. kind selects approximation; mode LP/HP/BP/BR.
// bandwidthOct used for BP/BR (octaves). rippleDb for Cheby/Elliptic.
static inline void cascade_design(
  Cascade* c,
  int kind,
  int mode,
  int order,
  double freqHz,
  double bandwidthOct,
  double rippleDb,
  double sampleRate
) {
  // Linkwitz-Riley: cascade two identical Butterworth of order n/2
  if (kind == kLinkwitzRiley) {
    int half = clamp_order(order) / 2;
    if (half < 2) half = 2;
    if (half & 1) half += 1;
    Cascade tmp;
    cascade_design_base(&tmp, kButterworth, mode, half, freqHz, bandwidthOct, rippleDb, sampleRate);
    c->n = 0;
    for (int pass = 0; pass < 2; pass++) {
      for (int i = 0; i < tmp.n && c->n < kMaxSections; i++) {
        c->sec[c->n] = tmp.sec[i];
        c->sec[c->n].z1 = 0.0;
        c->sec[c->n].z2 = 0.0;
        c->n++;
      }
    }
    return;
  }
  cascade_design_base(c, kind, mode, order, freqHz, bandwidthOct, rippleDb, sampleRate);
}

static inline void cascade_ensure(
  Cascade* c,
  int kind,
  int mode,
  int order,
  double freqHz,
  double bandwidthOct,
  double rippleDb,
  double sampleRate
) {
  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  if (
    c->lastKind == kind
    && c->lastMode == mode
    && c->lastOrder == order
    && c->lastFreq == freqHz
    && c->lastBw == bandwidthOct
    && c->lastRipple == rippleDb
    && c->lastRate == rate
  ) {
    return;
  }
  const bool hard =
    c->lastKind != kind || c->lastMode != mode || c->lastOrder != order || c->n == 0;
  cascade_design(c, kind, mode, order, freqHz, bandwidthOct, rippleDb, rate);
  if (hard) cascade_reset(c);
  c->lastKind = kind;
  c->lastMode = mode;
  c->lastOrder = order;
  c->lastFreq = freqHz;
  c->lastBw = bandwidthOct;
  c->lastRipple = rippleDb;
  c->lastRate = rate;
}

}  // namespace scientific_iir
}  // namespace soemdsp_maths
