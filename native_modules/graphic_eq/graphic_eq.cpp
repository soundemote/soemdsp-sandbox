// soemdsp-native-module: graphic_eq
// soemdsp-native-label: Graphic EQ
// soemdsp-native-target: graphicEq
// soemdsp-native-kind: dynamics
//
// ISO 1/3-octave graphic EQ: cascade of peaking biquads (RBJ Cookbook).
// Band gains are unit −1…+1; Range (±6/±12/±18 dB) scales them.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 128;
static const int kBandCount = 30;
static const double kQ = 1.4142135623730951; // ≈ √2 — 1/3-octave
static const double kSmoothTauSec = 0.015;

static const double kCentersHz[kBandCount] = {
  25.0, 31.5, 40.0, 50.0, 63.0, 80.0, 100.0, 125.0, 160.0, 200.0,
  250.0, 315.0, 400.0, 500.0, 630.0, 800.0, 1000.0, 1250.0, 1600.0, 2000.0,
  2500.0, 3150.0, 4000.0, 5000.0, 6300.0, 8000.0, 10000.0, 12500.0, 16000.0, 20000.0
};

struct PeakBand {
  double b0, b1, b2, a1, a2;
  double z1, z2;
  double gainTarget; // unit −1…+1
  double gainSmooth;
  double lastDb;
  int active; // 0 = bypassed (near 0 dB or above Nyquist)
};

struct State {
  bool active;
  PeakBand bands[kBandCount];
  double sampleRate;
  double rangeDb;
  double mix;
  double amplitude;
  double smoothCoeff;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"graphic_eq\","
    "\"label\":\"Graphic EQ\","
    "\"targetType\":\"graphicEq\","
    "\"kind\":\"dynamics\","
    "\"bands\":30"
  "}";

static double range_from_choice(double choice) {
  int i = (int)(safe(choice) + (safe(choice) >= 0.0 ? 0.5 : -0.5));
  if (i <= 0) return 6.0;
  if (i == 1) return 12.0;
  return 18.0;
}

static void set_bypass_coeffs(PeakBand* b) {
  b->b0 = 1.0;
  b->b1 = 0.0;
  b->b2 = 0.0;
  b->a1 = 0.0;
  b->a2 = 0.0;
  b->active = 0;
}

static void design_peak(PeakBand* b, double freqHz, double gainDb, double sr) {
  const double ny = sr * 0.49;
  if (!(freqHz > 1.0) || freqHz >= ny || dsp_fabs(gainDb) < 1.0e-4) {
    set_bypass_coeffs(b);
    b->lastDb = 0.0;
    return;
  }
  const double A = db_to_lin(gainDb * 0.5); // 10^(dB/40)
  double w0 = kTwoPi * (freqHz / sr);
  if (w0 < 1.0e-6) w0 = 1.0e-6;
  if (w0 > kPi * 0.999) w0 = kPi * 0.999;
  double sn = 0.0, cs = 0.0;
  dsp_sin_cos(w0, &sn, &cs);
  const double alpha = sn / (2.0 * kQ);
  const double b0 = 1.0 + alpha * A;
  const double b1 = -2.0 * cs;
  const double b2 = 1.0 - alpha * A;
  const double a0 = 1.0 + alpha / A;
  const double a1 = -2.0 * cs;
  const double a2 = 1.0 - alpha / A;
  const double inv = (dsp_fabs(a0) > 1.0e-15) ? (1.0 / a0) : 1.0;
  b->b0 = b0 * inv;
  b->b1 = b1 * inv;
  b->b2 = b2 * inv;
  b->a1 = a1 * inv;
  b->a2 = a2 * inv;
  b->active = 1;
  b->lastDb = gainDb;
}

static void refresh_band(State* st, int i) {
  PeakBand* b = &st->bands[i];
  const double db = b->gainSmooth * st->rangeDb;
  if (dsp_fabs(db - b->lastDb) < 1.0e-4 && b->active == (dsp_fabs(db) >= 1.0e-4 ? 1 : 0)) {
    return;
  }
  design_peak(b, kCentersHz[i], db, st->sampleRate);
}

static void refresh_all(State* st) {
  for (int i = 0; i < kBandCount; i += 1) refresh_band(st, i);
}

static double process_band(PeakBand* b, double x) {
  if (!b->active) return x;
  // Transposed direct form II
  const double y = b->b0 * x + b->z1;
  b->z1 = b->b1 * x - b->a1 * y + b->z2;
  b->z2 = b->b2 * x - b->a2 * y;
  return y;
}

static void reset_state(State& s) {
  s.sampleRate = 44100.0;
  s.rangeDb = 12.0;
  s.mix = 1.0;
  s.amplitude = 1.0;
  s.smoothCoeff = one_pole_coeff(kSmoothTauSec, s.sampleRate);
  for (int i = 0; i < kBandCount; i += 1) {
    PeakBand& b = s.bands[i];
    b.gainTarget = 0.0;
    b.gainSmooth = 0.0;
    b.z1 = 0.0;
    b.z2 = 0.0;
    set_bypass_coeffs(&b);
    b.lastDb = 0.0;
  }
}

}  // namespace

extern "C" int soemdsp_graphic_eq_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      reset_state(gPool[i]);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_graphic_eq_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_graphic_eq_reset(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  State& s = gPool[handle - 1];
  const double sr = s.sampleRate;
  const double range = s.rangeDb;
  const double mix = s.mix;
  const double amp = s.amplitude;
  double targets[kBandCount];
  for (int i = 0; i < kBandCount; i += 1) targets[i] = s.bands[i].gainTarget;
  reset_state(s);
  s.sampleRate = sr > 1.0 ? sr : 44100.0;
  s.rangeDb = range;
  s.mix = mix;
  s.amplitude = amp;
  s.smoothCoeff = one_pole_coeff(kSmoothTauSec, s.sampleRate);
  for (int i = 0; i < kBandCount; i += 1) {
    s.bands[i].gainTarget = targets[i];
    s.bands[i].gainSmooth = targets[i];
  }
  refresh_all(&s);
}

extern "C" void soemdsp_graphic_eq_set_band(int handle, int index, double unitGain) {
  if (handle < 1 || handle > kMaxInstances) return;
  if (index < 0 || index >= kBandCount) return;
  double g = safe(unitGain);
  if (g < -1.0) g = -1.0;
  if (g > 1.0) g = 1.0;
  gPool[handle - 1].bands[index].gainTarget = g;
}

extern "C" void soemdsp_graphic_eq_set_bands(int handle, const double* units, int count) {
  if (handle < 1 || handle > kMaxInstances) return;
  if (!units) return;
  const int n = count < kBandCount ? count : kBandCount;
  if (n < 0) return;
  State& s = gPool[handle - 1];
  for (int i = 0; i < n; i += 1) {
    double g = safe(units[i]);
    if (g < -1.0) g = -1.0;
    if (g > 1.0) g = 1.0;
    s.bands[i].gainTarget = g;
  }
}

extern "C" int soemdsp_graphic_eq_band_count() {
  return kBandCount;
}

extern "C" double soemdsp_graphic_eq_band_hz(int index) {
  if (index < 0 || index >= kBandCount) return 0.0;
  return kCentersHz[index];
}

extern "C" double soemdsp_graphic_eq_sample(
  int handle,
  double in,
  double rangeChoice,
  double mix,
  double amplitude,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return in;
  State& s = gPool[handle - 1];

  double sr = safe(sampleRate);
  if (!(sr > 1.0)) sr = 44100.0;
  const double rangeDb = range_from_choice(rangeChoice);
  double wet = safe(mix);
  if (wet < 0.0) wet = 0.0;
  if (wet > 1.0) wet = 1.0;
  double amp = safe(amplitude);
  if (!(amp * 0.0 == 0.0)) amp = 1.0;

  const bool srChanged = dsp_fabs(sr - s.sampleRate) > 1.0e-6;
  const bool rangeChanged = dsp_fabs(rangeDb - s.rangeDb) > 1.0e-9;
  if (srChanged) {
    s.sampleRate = sr;
    s.smoothCoeff = one_pole_coeff(kSmoothTauSec, sr);
  }
  s.rangeDb = rangeDb;
  s.mix = wet;
  s.amplitude = amp;

  const double coeff = s.smoothCoeff;
  for (int i = 0; i < kBandCount; i += 1) {
    PeakBand& b = s.bands[i];
    b.gainSmooth += coeff * (b.gainTarget - b.gainSmooth);
    if (rangeChanged || srChanged || dsp_fabs(b.gainSmooth * rangeDb - b.lastDb) > 0.02) {
      design_peak(&b, kCentersHz[i], b.gainSmooth * rangeDb, sr);
    }
  }

  const double x = safe(in);
  double y = x;
  for (int i = 0; i < kBandCount; i += 1) {
    y = process_band(&s.bands[i], y);
  }
  const double out = x + wet * (y - x);
  return out * amp;
}

extern "C" int soemdsp_graphic_eq_version() {
  return 1;
}

extern "C" const char* soemdsp_graphic_eq_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_graphic_eq_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
