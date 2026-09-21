// soemdsp-native-module: cookbook_filter
// soemdsp-native-label: Cookbook Filter
// soemdsp-native-target: cookbookFilter
// soemdsp-native-kind: filter
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET
//
// Port of rosic::CookbookFilter (RS-MET): cascade of identical RBJ biquads
// (Robert Bristow-Johnson Audio EQ Cookbook), Direct Form 1.
// Original: originalcode/rosic_CookbookFilter.h
// Live path: getSampleDirect1() only (lattice choice removed).

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 256;
static const int kMaxStages = 5;

// RS-MET modes: Bypass, LP, HP, BP skirt, BP peak, BR, AP, Peak, LS, HS.
enum {
  kBypass = 0,
  kLowpass = 1,
  kHighpass = 2,
  kBandpassSkirt = 3,
  kBandpassPeak = 4,
  kBandreject = 5,
  kAllpass = 6,
  kPeak = 7,
  kLowShelf = 8,
  kHighShelf = 9
};

struct CookbookState {
  bool active;
  int numStages;
  int lastMode;
  int lastTopology;
  bool ladderOk;
  double lastFreq;
  double lastQ;
  double lastGainDb;
  double lastRate;
  double a1, a2, b0, b1, b2;
  double k1, k2, c1, c2, ladderGain;
  double x1[kMaxStages];
  double x2[kMaxStages];
  double y1[kMaxStages];
  double y2[kMaxStages];
  double e2_0[kMaxStages];
  double e2_1[kMaxStages];
  double e1_0[kMaxStages];
  double e1_1[kMaxStages];
  double e0_0[kMaxStages];
  double e0_1[kMaxStages];
  double e0_2[kMaxStages];
  double e1t_0[kMaxStages];
  double e1t_1[kMaxStages];
  double e2t_0[kMaxStages];
  double e2t_1[kMaxStages];
};

static CookbookState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"cookbook_filter\","
    "\"label\":\"Cookbook Filter\","
    "\"targetType\":\"cookbookFilter\","
    "\"kind\":\"filter\""
  "}";

static void reset_buffers(CookbookState& s) {
  for (int i = 0; i < kMaxStages; i += 1) {
    s.x1[i] = 0.0;
    s.x2[i] = 0.0;
    s.y1[i] = 0.0;
    s.y2[i] = 0.0;
    s.e2_0[i] = 0.0;
    s.e2_1[i] = 0.0;
    s.e1_0[i] = 0.0;
    s.e1_1[i] = 0.0;
    s.e0_0[i] = 0.0;
    s.e0_1[i] = 0.0;
    s.e0_2[i] = 0.0;
    s.e1t_0[i] = 0.0;
    s.e1t_1[i] = 0.0;
    s.e2t_0[i] = 0.0;
    s.e2t_1[i] = 0.0;
  }
}

static double clamp_k(double k) {
  if (k > 0.999) return 0.999;
  if (k < -0.999) return -0.999;
  return k;
}

// RS-MET CookbookFilter::convertDirectToLadder.
static bool convert_direct_to_ladder(CookbookState& s) {
  double k2 = clamp_k(s.a2);
  const double den = 1.0 - k2 * k2;
  if (!(den > 1.0e-12)) return false;
  double k1 = clamp_k((s.a1 - k2 * s.a1) / den);
  const double c2 = scientific_iir::sqrt_approx(1.0 - k2 * k2);
  const double c1 = scientific_iir::sqrt_approx(1.0 - k1 * k1);
  if (!(c1 > 1.0e-12) || !(c2 > 1.0e-12)) return false;
  s.k1 = k1;
  s.k2 = k2;
  s.c1 = c1;
  s.c2 = c2;
  s.ladderGain = 1.0 / (c1 * c2);
  return true;
}

static void identity_coeffs(CookbookState& s) {
  s.a1 = 0.0;
  s.a2 = 0.0;
  s.b0 = 1.0;
  s.b1 = 0.0;
  s.b2 = 0.0;
}

static void calc_coeffs(CookbookState& s, int mode, double freq, double q, double gainDb, double rate) {
  if (mode == kBypass) {
    identity_coeffs(s);
    return;
  }

  const double omega = kTwoPi * freq / rate;
  double sine = 0.0, cosine = 0.0;
  dsp_sin_cos(omega, &sine, &cosine);
  const double alpha = sine / (2.0 * q);
  const double A = db_to_lin(gainDb * 0.5); // 10^(dB/40), RS-MET pow(10, 0.025*gain)

  double a0 = 1.0 + alpha;
  double a1 = -2.0 * cosine;
  double a2 = 1.0 - alpha;
  double b0 = 1.0;
  double b1 = 0.0;
  double b2 = 0.0;

  if (mode == kLowpass) {
    b1 = 1.0 - cosine;
    b0 = b1 * 0.5;
    b2 = b0;
  } else if (mode == kHighpass) {
    b1 = -(1.0 + cosine);
    b0 = -b1 * 0.5;
    b2 = b0;
  } else if (mode == kBandpassSkirt) {
    b0 = q * alpha;
    b1 = 0.0;
    b2 = -b0;
  } else if (mode == kBandpassPeak) {
    b0 = alpha;
    b1 = 0.0;
    b2 = -alpha;
  } else if (mode == kBandreject) {
    b0 = 1.0;
    b1 = -2.0 * cosine;
    b2 = 1.0;
  } else if (mode == kAllpass) {
    b0 = 1.0 - alpha;
    b1 = -2.0 * cosine;
    b2 = 1.0 + alpha;
  } else if (mode == kPeak) {
    a0 = 1.0 + alpha / A;
    a1 = -2.0 * cosine;
    a2 = 1.0 - alpha / A;
    b0 = 1.0 + alpha * A;
    b1 = -2.0 * cosine;
    b2 = 1.0 - alpha * A;
  } else if (mode == kLowShelf) {
    const double beta = db_to_lin(gainDb * 0.25) / q; // sqrt(A)/q
    a0 = (A + 1.0) + (A - 1.0) * cosine + beta * sine;
    a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosine);
    a2 = (A + 1.0) + (A - 1.0) * cosine - beta * sine;
    b0 = A * ((A + 1.0) - (A - 1.0) * cosine + beta * sine);
    b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosine);
    b2 = A * ((A + 1.0) - (A - 1.0) * cosine - beta * sine);
  } else if (mode == kHighShelf) {
    const double beta = db_to_lin(gainDb * 0.25) / q; // sqrt(A)/q
    a0 = (A + 1.0) - (A - 1.0) * cosine + beta * sine;
    a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosine);
    a2 = (A + 1.0) - (A - 1.0) * cosine - beta * sine;
    b0 = A * ((A + 1.0) + (A - 1.0) * cosine + beta * sine);
    b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosine);
    b2 = A * ((A + 1.0) + (A - 1.0) * cosine - beta * sine);
  } else {
    b1 = 1.0 - cosine;
    b0 = b1 * 0.5;
    b2 = b0;
  }

  const double inv = a0 != 0.0 ? 1.0 / a0 : 1.0;
  s.a1 = a1 * inv;
  s.a2 = a2 * inv;
  s.b0 = b0 * inv;
  s.b1 = b1 * inv;
  s.b2 = b2 * inv;
}

static void ensure_coeffs(
  CookbookState& s,
  int mode,
  double freq,
  double q,
  double gainDb,
  double rate
) {
  if (s.lastMode == mode
      && s.lastFreq == freq
      && s.lastQ == q
      && s.lastGainDb == gainDb
      && s.lastRate == rate) {
    return;
  }
  calc_coeffs(s, mode, freq, q, gainDb, rate);
  s.ladderOk = convert_direct_to_ladder(s);
  s.lastMode = mode;
  s.lastFreq = freq;
  s.lastQ = q;
  s.lastGainDb = gainDb;
  s.lastRate = rate;
}

static double get_sample_direct1(CookbookState& s, double in) {
  double tmp = in;
  const int n = s.numStages;
  for (int i = 0; i < n; i += 1) {
    const double x = tmp;
    tmp = s.b0 * tmp + s.b1 * s.x1[i] + s.b2 * s.x2[i]
        - s.a1 * s.y1[i] - s.a2 * s.y2[i];
    s.x2[i] = s.x1[i];
    s.x1[i] = x;
    s.y2[i] = s.y1[i];
    if (!(tmp * 0.0 == 0.0)) tmp = 0.0;
    s.y1[i] = tmp;
  }
  return tmp;
}

// RS-MET CookbookFilter::getSampleLadder1 (pole-before-zero).
static double get_sample_ladder1(CookbookState& s, double in) {
  double x = in;
  double y = in;
  const int n = s.numStages;
  for (int i = 0; i < n; i += 1) {
    s.e2_0[i] = x;
    s.e1_0[i] = s.c2 * s.e2_0[i] - s.k2 * s.e1t_1[i];
    s.e0_0[i] = s.c1 * s.e1_0[i] - s.k1 * s.e0_1[i];
    s.e1t_0[i] = s.c1 * s.e0_1[i] + s.k1 * s.e1_0[i];
    s.e2t_0[i] = s.c2 * s.e1t_1[i] + s.k2 * s.e2_0[i];
    y = s.ladderGain * (s.b0 * s.e0_0[i] + s.b1 * s.e0_1[i] + s.b2 * s.e0_2[i]);
    if (!(y * 0.0 == 0.0)) y = 0.0;
    s.e2_1[i] = s.e2_0[i];
    s.e2t_1[i] = s.e2t_0[i];
    s.e1_1[i] = s.e1_0[i];
    s.e1t_1[i] = s.e1t_0[i];
    s.e0_2[i] = s.e0_1[i];
    s.e0_1[i] = s.e0_0[i];
    x = y;
  }
  return y;
}

}  // namespace

extern "C" int soemdsp_cookbook_filter_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      CookbookState& s = gPool[i];
      reset_buffers(s);
      identity_coeffs(s);
      s.numStages = 2;
      s.lastMode = -1;
      s.lastTopology = 0;
      s.ladderOk = false;
      s.k1 = 0.0;
      s.k2 = 0.0;
      s.c1 = 1.0;
      s.c2 = 1.0;
      s.ladderGain = 1.0;
      s.lastFreq = -1.0;
      s.lastQ = -1.0;
      s.lastGainDb = 0.0;
      s.lastRate = -1.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_cookbook_filter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_cookbook_filter_sample(
  int handle,
  double input,
  double mode,
  double frequencyHz,
  double q,
  double gainDb,
  double stages,
  double topology,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  CookbookState& s = gPool[handle - 1];
  if (!s.active) return 0.0;

  int modeI = (int)(safe(mode) + (safe(mode) >= 0.0 ? 0.5 : -0.5));
  if (modeI < 0) modeI = 0;
  if (modeI > 9) modeI = 9;

  int stageCount = (int)(safe(stages) + (safe(stages) >= 0.0 ? 0.5 : -0.5));
  if (stageCount < 0) stageCount = 0;
  if (stageCount > kMaxStages) stageCount = kMaxStages;
  int topologyI = (int)(safe(topology) + (safe(topology) >= 0.0 ? 0.5 : -0.5));
  if (topologyI < 0) topologyI = 0;
  if (topologyI > 1) topologyI = 1;
  if (stageCount != s.numStages || topologyI != s.lastTopology) {
    s.numStages = stageCount;
    s.lastTopology = topologyI;
    reset_buffers(s);
  }

  const double x = safe(input);
  if (stageCount <= 0 || modeI == kBypass) {
    return x;
  }

  double rate = safe(sampleRate);
  if (!(rate > 1.0)) rate = 44100.0;
  // 0 Hz allowed. Nyquist ceiling only — no product 20 kHz clamp (APP_POLICY).
  const double maxFreq = rate * 0.49;
  double freq = safe(frequencyHz);
  if (freq < 0.0) freq = 0.0;
  if (freq > maxFreq) freq = maxFreq;
  double safeQ = safe(q);
  if (safeQ < 0.0001) safeQ = 0.0001;
  const double g = safe(gainDb);

  ensure_coeffs(s, modeI, freq, safeQ, g, rate);
  (void)topologyI;
  return get_sample_direct1(s, x);
}

extern "C" int soemdsp_cookbook_filter_version() {
  return 2;
}

extern "C" const char* soemdsp_cookbook_filter_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_cookbook_filter_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
