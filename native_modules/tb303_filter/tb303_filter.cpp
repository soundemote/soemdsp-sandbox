// soemdsp-native-module: tb303_filter
// soemdsp-native-label: TB-303 Filter
// soemdsp-native-target: tb303Filter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET

// Based on Robin Schmidt's TeeBeeFilter (RS-MET / Open303).
// Key differences from a plain Moog ladder:
//   - 1-pole highpass in the feedback path (150 Hz), reduces resonance at low cutoff
//   - Blended a1 coefficient: lerp between resonance-tuned and no-resonance based on r
//   - 0.125 input scale / 8.0 output scale (303 gain staging)
//   - 15 output taps: LP/HP/BP at 6/12/18/24 dB per octave

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"tb303_filter\","
    "\"label\":\"TB-303 Filter\","
    "\"targetType\":\"tb303Filter\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"mode\","
        "\"label\":\"Mode\","
        "\"defaultValue\":4,"
        "\"min\":0,"
        "\"mid\":4,"
        "\"max\":14,"
        "\"step\":1,"
        "\"choices\":[\"Flat\",\"LP 6\",\"LP 12\",\"LP 18\",\"LP 24\","
                      "\"HP 6\",\"HP 12\",\"HP 18\",\"HP 24\","
                      "\"BP 12/12\",\"BP 6/18\",\"BP 18/6\",\"BP 6/12\",\"BP 12/6\",\"BP 6/6\"],"
        "\"tooltip\":\"Selects the output tap and slope of the filter.\""
      "},"
      "{"
        "\"key\":\"cutoff\","
        "\"label\":\"Cutoff\","
        "\"kind\":\"frequency\","
        "\"defaultValue\":1000,"
        "\"min\":200,"
        "\"mid\":1000,"
        "\"max\":20000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Sets the filter cutoff frequency. Minimum is 200 Hz, matching the original hardware.\""
      "},"
      "{"
        "\"key\":\"resonance\","
        "\"label\":\"Resonance\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":50,"
        "\"max\":100,"
        "\"step\":\"any\","
        "\"unit\":\"%\","
        "\"tooltip\":\"Feedback amount. 100% reaches self-oscillation. Uses an exponential skewing curve for musical response.\""
      "},"
      "{"
        "\"key\":\"drive\","
        "\"label\":\"Drive\","
        "\"kind\":\"decibels\","
        "\"defaultValue\":0,"
        "\"min\":0,"
        "\"mid\":12,"
        "\"max\":24,"
        "\"step\":\"any\","
        "\"unit\":\"dB\","
        "\"tooltip\":\"Input gain before the filter. The filter internally scales by 0.125 so drive compensates and adds character.\""
      "}"
    "]"
  "}";

static const int    kMaxInstances = 64;
static const double kHpCutoff     = 150.0;
static const double kExpNeg3      = 0.049787068367863944;   // exp(-3), precomputed

struct TeeBeeState {
  double y1, y2, y3, y4;   // ladder stage outputs
  double hpX, hpY;          // feedback HP state: previous input, previous output
  double hpB0, hpP;         // feedback HP coefficients
  double c0, c1, c2, c3, c4; // mode mix
  double lastRate;
  int    lastMode;
  bool   active;
};

static TeeBeeState gPool[kMaxInstances];

// sin/cos/tan over [0, pi] and dsp_exp_squaring now live in
// sandbox_native_maths.h (this file's copies were byte-for-byte identical
// modulo the poly_sin/poly_sin_0_halfpi and dsp_tan_neg/dsp_tan_neg_halfquarter
// naming).

static void update_hp(TeeBeeState& s, double rate) {
  s.hpP    = dsp_exp_squaring(-kTwoPi * kHpCutoff / rate);
  s.hpB0   = (1.0 + s.hpP) * 0.5;
  s.lastRate = rate;
}

static void set_mode(TeeBeeState& s, int m) {
  s.lastMode = m;
  switch (m) {
    default:
    case  0: s.c0= 1;s.c1= 0;s.c2= 0;s.c3= 0;s.c4= 0; break; // FLAT
    case  1: s.c0= 0;s.c1= 1;s.c2= 0;s.c3= 0;s.c4= 0; break; // LP_6
    case  2: s.c0= 0;s.c1= 0;s.c2= 1;s.c3= 0;s.c4= 0; break; // LP_12
    case  3: s.c0= 0;s.c1= 0;s.c2= 0;s.c3= 1;s.c4= 0; break; // LP_18
    case  4: s.c0= 0;s.c1= 0;s.c2= 0;s.c3= 0;s.c4= 1; break; // LP_24
    case  5: s.c0= 1;s.c1=-1;s.c2= 0;s.c3= 0;s.c4= 0; break; // HP_6
    case  6: s.c0= 1;s.c1=-2;s.c2= 1;s.c3= 0;s.c4= 0; break; // HP_12
    case  7: s.c0= 1;s.c1=-3;s.c2= 3;s.c3=-1;s.c4= 0; break; // HP_18
    case  8: s.c0= 1;s.c1=-4;s.c2= 6;s.c3=-4;s.c4= 1; break; // HP_24
    case  9: s.c0= 0;s.c1= 0;s.c2= 1;s.c3=-2;s.c4= 1; break; // BP_12_12
    case 10: s.c0= 0;s.c1= 0;s.c2= 0;s.c3= 1;s.c4=-1; break; // BP_6_18
    case 11: s.c0= 0;s.c1= 1;s.c2=-3;s.c3= 3;s.c4=-1; break; // BP_18_6
    case 12: s.c0= 0;s.c1= 0;s.c2= 1;s.c3=-1;s.c4= 0; break; // BP_6_12
    case 13: s.c0= 0;s.c1= 1;s.c2=-2;s.c3= 1;s.c4= 0; break; // BP_12_6
    case 14: s.c0= 0;s.c1= 1;s.c2=-1;s.c3= 0;s.c4= 0; break; // BP_6_6
  }
}

}  // namespace

extern "C" int soemdsp_tb303_filter_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      TeeBeeState& s = gPool[i];
      s.y1 = s.y2 = s.y3 = s.y4 = 0.0;
      s.hpX = s.hpY = 0.0;
      s.lastRate = 0.0;
      s.lastMode = -1;
      set_mode(s, 4);  // LP_24 default
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_tb303_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_tb303_filter_sample(
  int    handle,
  double input,
  double cutoff,
  double resonance,
  int    mode,
  double drive,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  TeeBeeState& s = gPool[handle - 1];

  const double rate = sampleRate < 1.0 ? 44100.0 : sampleRate;
  if (rate != s.lastRate) update_hp(s, rate);

  const int safeMode = mode < 0 ? 0 : (mode > 14 ? 14 : mode);
  if (safeMode != s.lastMode) set_mode(s, safeMode);

  // clamp parameters
  const double maxFreq     = rate * 0.49 < 20000.0 ? rate * 0.49 : 20000.0;
  const double safeCutoff  = clamp(cutoff, 200.0, maxFreq);
  const double r_raw       = clamp(resonance * 0.01, 0.0, 1.0);
  const double driveFactor = dsp_exp_squaring(clamp(drive, -24.0, 24.0) * 0.11512925465);

  // resonance skewing: (1 - exp(-3*r)) / (1 - exp(-3))
  const double r = (1.0 - dsp_exp_squaring(-3.0 * r_raw)) / (1.0 - kExpNeg3);

  // filter coefficients (exact method from TeeBeeFilter::calculateCoefficientsExact)
  const double wc    = kTwoPi * safeCutoff / rate;
  const double wc_c  = clamp(wc, 1e-9, kPi * 0.98);
  const double sinWc = dsp_sin_0_pi(wc_c);
  const double cosWc = dsp_cos_0_pi(wc_c);
  const double tanWc = dsp_tan_neg_halfquarter(0.25 * (wc_c - kPi));

  // a1 = lerp(a1_noRes, a1_fullRes, r)
  const double denom_a    = sinWc - cosWc * tanWc;
  const double a1_fullRes = (denom_a > 1e-15 || denom_a < -1e-15) ? tanWc / denom_a : -1.0;
  const double a1_noRes   = -dsp_exp_squaring(-wc_c);
  const double a1         = r * a1_fullRes + (1.0 - r) * a1_noRes;
  const double b0         = 1.0 + a1;

  // feedback gain k
  const double gsq_d = clamp(1.0 + a1*a1 + 2.0*a1*cosWc, 1e-12, 1e30);
  const double gsq   = (b0 * b0) / gsq_d;
  const double k     = r / clamp(gsq * gsq, 1e-24, 1e30);

  // feedback highpass on k*y4
  const double fbIn = k * s.y4;
  const double fbHp = safe(s.hpB0 * (fbIn - s.hpX) + s.hpP * s.hpY);
  s.hpX = fbIn;
  s.hpY = fbHp;

  // ladder stages
  const double y0  = safe(0.125 * driveFactor * safe(input) - fbHp);
  const double ny1 = safe(y0  + a1 * (y0  - s.y1));
  const double ny2 = safe(ny1 + a1 * (ny1 - s.y2));
  const double ny3 = safe(ny2 + a1 * (ny2 - s.y3));
  const double ny4 = safe(ny3 + a1 * (ny3 - s.y4));
  s.y1 = ny1; s.y2 = ny2; s.y3 = ny3; s.y4 = ny4;

  return safe(8.0 * (s.c0*y0 + s.c1*ny1 + s.c2*ny2 + s.c3*ny3 + s.c4*ny4));
}

extern "C" int soemdsp_tb303_filter_version() {
  return 1;
}

extern "C" const char* soemdsp_tb303_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_tb303_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
