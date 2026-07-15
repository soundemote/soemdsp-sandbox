// soemdsp-native-module: papoulis_filter
// soemdsp-native-label: Papoulis Filter
// soemdsp-native-target: papoulisFilter
// soemdsp-native-kind: filter
//
// A 3rd-order Papoulis (optimum-L) lowpass: a one-pole stage cascaded with
// a biquad stage, both designed via the bilinear transform (k = 2*rate)
// from the analog Papoulis prototype coefficients. Coefficients are only
// recomputed when cutoffHz or sampleRate actually change (cached
// otherwise), matching the JS reference's dirty-check.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;

struct PapoulisFilterState {
  bool active;
  double poleX1, poleY1;
  double biquadX1, biquadX2, biquadY1, biquadY2;
  double poleB0, poleB1, poleA1;
  double biquadB0, biquadB1, biquadB2, biquadA1, biquadA2;
  double cutoffHz;
  double sampleRate;
  bool hasCoeffs;
};

static PapoulisFilterState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_papoulis_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      PapoulisFilterState& s = gPool[i];
      s.poleX1 = 0.0; s.poleY1 = 0.0;
      s.biquadX1 = 0.0; s.biquadX2 = 0.0; s.biquadY1 = 0.0; s.biquadY2 = 0.0;
      s.cutoffHz = 0.0;
      s.sampleRate = 0.0;
      s.hasCoeffs = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_papoulis_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_papoulis_filter_sample(
  int    handle,
  double input,
  double cutoffHz,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  PapoulisFilterState& s = gPool[handle - 1];

  const double rate = safe(sampleRate);
  const double safeCutoff = clamp(safe(cutoffHz), 0.01, rate * 0.49);

  if (!s.hasCoeffs || s.cutoffHz != safeCutoff || s.sampleRate != rate) {
    const double wc = 2.0 * kPi * maxd(0.0, safeCutoff);
    const double k = 2.0 * rate;
    const double p = 0.6203 * wc;
    const double poleA0 = k + p;
    const double a1s = 0.6904 * wc;
    const double a0s = 0.9308 * wc * wc;
    const double biquadA0 = k * k + a1s * k + a0s;

    s.poleB0 = p / poleA0;
    s.poleB1 = p / poleA0;
    s.poleA1 = (p - k) / poleA0;

    s.biquadB0 = a0s / biquadA0;
    s.biquadB1 = (2.0 * a0s) / biquadA0;
    s.biquadB2 = a0s / biquadA0;
    s.biquadA1 = (2.0 * a0s - 2.0 * k * k) / biquadA0;
    s.biquadA2 = (k * k - a1s * k + a0s) / biquadA0;

    s.cutoffHz = safeCutoff;
    s.sampleRate = rate;
    s.hasCoeffs = true;
  }

  const double x = safe(input);
  const double poleOut = s.poleB0 * x + s.poleB1 * s.poleX1 - s.poleA1 * s.poleY1;
  s.poleX1 = x;
  s.poleY1 = poleOut;

  const double biquadOut = s.biquadB0 * poleOut + s.biquadB1 * s.biquadX1 + s.biquadB2 * s.biquadX2
    - s.biquadA1 * s.biquadY1 - s.biquadA2 * s.biquadY2;
  s.biquadX2 = s.biquadX1;
  s.biquadX1 = poleOut;
  s.biquadY2 = s.biquadY1;
  s.biquadY1 = biquadOut;

  return biquadOut;
}

extern "C" int soemdsp_papoulis_filter_version() {
  return 1;
}
