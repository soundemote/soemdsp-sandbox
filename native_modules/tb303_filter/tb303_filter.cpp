// soemdsp-native-module: tb303_filter
// soemdsp-native-label: TB-303 Filter
// soemdsp-native-target: tb303Filter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET

// Open303 TeeBeeFilter mode TB_303 (mystran/kunn), the circuit Open303 runs.
// RS-MET AcidDevil on branch work calls a TeeBee that only has the multimode
// one-pole ladder (k = r/|H(wc)|^4, about 4). That ladder, with the 150 Hz
// feedback highpass, does not keep ringing. Open303's TeeBee constructor sets
// mode TB_303 and setCutoff uses calculateCoefficientsApprox4: integrators
//   y1 += 2*b0*(y0-y1+y2) ... y4 += b0*(y3-2*y4)
//   k ~= 17*r .. higher with cutoff, out = 2*g*y4.
// This module always runs that core. Mode still selects a tap mix; LP 24 is
// exactly Open303's return (c4 = 1 -> 2*g*y4).
// Refused instrument limits: TeeBeeFilter::setCutoff 200 Hz floor and 20 kHz
// ceiling, accent/envelope/note-range clamps. No soft-clip on the feedback
// sum and no cap on k (the previous port used min(k, 3.5) and x/(1+x*x)).

#include <soemdsp/soemdsp.hpp>

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
        "\"min\":0,"
        "\"mid\":1000,"
        "\"max\":20000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Filter cutoff in Hz. 0 is allowed (frozen / DC). Circuit uses a tiny floor only to avoid coefficient blow-up.\""
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
        "\"tooltip\":\"Feedback amount in percent. 100% is Open303 TB_303 full resonance (chirp / self-oscillation). Same exponential skew as TeeBeeFilter::setResonance.\""
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
        "\"tooltip\":\"Input gain before the TB_303 core, in dB. 0 dB is unity. No extra 0.125 pad.\""
      "}"
    "]"
  "}";

static const int kMaxInstances = 256;
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
// soemdsp/soemdsp.hpp (this file's copies were byte-for-byte identical
// modulo the poly_sin/poly_sin_0_halfpi and dsp_tan_neg/dsp_tan_neg_halfquarter
// naming).

static void update_hp(TeeBeeState& s, double rate) {
  s.hpP    = dsp_exp_squaring(-kTwoPi * kHpCutoff / rate);
  s.hpB0   = (1.0 + s.hpP) * 0.5;
  s.lastRate = rate;
}

static void reset_state(TeeBeeState& s) {
  s.y1 = s.y2 = s.y3 = s.y4 = 0.0;
  s.hpX = s.hpY = 0.0;
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

  // Crash-safety only: allow 0 Hz (frozen), never send NaN/negative into
  // trig/exp. Nyquist ceiling is the only hard upper bound.
  // Musical range is a metaparameter concern — no arbitrary 200 Hz floor.
  const double maxFreq    = rate * 0.49;
  const double rawCutoff  = safe(cutoff);
  const double safeCutoff = rawCutoff < 0.0 ? 0.0 : (rawCutoff > maxFreq ? maxFreq : rawCutoff);
  // TeeBeeFilter::setResonance skew. 100% -> r = 1 (full TB_303 k).
  // No clamp at 1: setResonance does not clamp, so modulation past 100%
  // stays hotter. Negatives map to 0. exp_squaring is the accurate path on
  // 0..100%; above that, exp_narrow (the squaring series is only good to |x|~4).
  const double r_raw = resonance > 0.0 ? resonance * 0.01 : 0.0;
  const double exp_neg = r_raw <= 1.0
      ? dsp_exp_squaring(-3.0 * r_raw)
      : dsp_exp_narrow(-3.0 * r_raw);
  const double r = (1.0 - exp_neg) / (1.0 - kExpNeg3);
  const double driveFactor = dsp_exp_squaring(clamp(drive, -24.0, 24.0) * 0.11512925465);

  // Open303 TeeBeeFilter::calculateCoefficientsApprox4, branch mode == TB_303.
  // fx = wc * (1/sqrt(2)) / (2*pi) = cutoff / (sr * sqrt(2)).
  // The polynomial is the one setCutoff/setResonance actually install.
  // Above ~0.45*sr it runs away (the fit assumes Open303's 4x oversampling).
  // That bound is numerical, not a 200 Hz musical floor or a 20 kHz ceiling.
  const double coefHz = safeCutoff > rate * 0.45 ? rate * 0.45 : safeCutoff;
  const double fx = coefHz / (rate * 1.4142135623730951);
  const double b0 =
      (0.00045522346 + 6.1922189 * fx) /
      (1.0 + 12.358354 * fx + 4.4156345 * fx * fx);
  // kPoly = fx*(fx*(fx*(fx*(fx*(fx+7198.6997)-5837.7917)-476.47308)+614.95611)+213.87126)+16.998792
  double k_poly = fx + 7198.6997;
  k_poly = fx * k_poly - 5837.7917;
  k_poly = fx * k_poly - 476.47308;
  k_poly = fx * k_poly + 614.95611;
  k_poly = fx * k_poly + 213.87126;
  k_poly = fx * k_poly + 16.998792;
  double g = k_poly * (1.0 / 17.0);
  g = (g - 1.0) * r + 1.0;
  g = g * (1.0 + r);
  const double k = k_poly * r;

  // Feedback highpass is inside the TB_303 loop (150 Hz, HIGHPASS matched-Z).
  const double fb_in = k * s.y4;
  const double fb_hp = s.hpB0 * (fb_in - s.hpX) + s.hpP * s.hpY;
  s.hpX = fb_in;
  s.hpY = fb_hp;

  // No soft-clip. Open303: y0 = in - hp(k*y4), then the four integrators.
  const double y0 = driveFactor * safe(input) - fb_hp;
  const double ny1 = s.y1 + 2.0 * b0 * (y0 - s.y1 + s.y2);
  const double ny2 = s.y2 + b0 * (ny1 - 2.0 * s.y2 + s.y3);
  const double ny3 = s.y3 + b0 * (ny2 - 2.0 * s.y3 + s.y4);
  const double ny4 = s.y4 + b0 * (ny3 - 2.0 * s.y4);

  const double mixed = s.c0 * y0 + s.c1 * ny1 + s.c2 * ny2 + s.c3 * ny3 + s.c4 * ny4;
  const double out = 2.0 * g * mixed;
  const bool bad =
      !(y0 == y0) || !(ny1 == ny1) || !(ny2 == ny2) || !(ny3 == ny3) ||
      !(ny4 == ny4) || !(fb_hp == fb_hp) || !(out == out);
  if (bad) {
    reset_state(s);
    return 0.0;
  }
  s.y1 = ny1;
  s.y2 = ny2;
  s.y3 = ny3;
  s.y4 = ny4;
  return out;
}

extern "C" int soemdsp_tb303_filter_version() {
  return 2;
}

extern "C" const char* soemdsp_tb303_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_tb303_filter_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
