// soemdsp-native-module: clipper_limiter
// soemdsp-native-label: Clipper Limiter
// soemdsp-native-target: clipperLimiter
// soemdsp-native-kind: dynamics
//
// Matches public/modules/clipperLimiter/clipper-limiter-math.js + Soft Clipper ADAA.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 32;
static const int kChannels = 3;

struct Channel {
  double u1;
  double F1;
  unsigned int n;
};

struct State {
  bool active;
  Channel ch[kChannels];
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"clipper_limiter\","
    "\"label\":\"Clipper Limiter\","
    "\"targetType\":\"clipperLimiter\","
    "\"kind\":\"dynamics\""
  "}";

static double db_to_lin(double db) {
  const double n = safe(db);
  if (!(n * 0.0 == 0.0)) return 1.0;
  return dsp_exp(n * 0.11512925464970229);
}

static double tanh_approx(double value) {
  const double x = value;
  const double x2 = x * x;
  const double denominator = 27.0 + 9.0 * x2;
  return (denominator <= 0.0) ? 0.0 : (x * (27.0 + x2)) / denominator;
}

static double tanh_antideriv(double value) {
  const double x = value;
  return (x * x) / 18.0 + (4.0 / 3.0) * dsp_ln(x * x + 3.0);
}

static void coeffs(double center, double width, double* scaleX, double* shiftX, double* scaleY, double* shiftY) {
  const double safeWidth = dsp_fabs(width) > 1.0e-6 ? dsp_fabs(width) : 2.0;
  *scaleX = 2.0 / safeWidth;
  *shiftX = -1.0 - ((*scaleX) * (center - 0.5 * safeWidth));
  *scaleY = 1.0 / (*scaleX);
  *shiftY = -(*shiftX) * (*scaleY);
}

static double shaped(double input, double center, double width) {
  double scaleX, shiftX, scaleY, shiftY;
  coeffs(center, width, &scaleX, &shiftX, &scaleY, &shiftY);
  return shiftY + scaleY * tanh_approx(scaleX * input + shiftX);
}

static double softclip_aa(Channel* c, double input, double center, double width, double antialias) {
  double aa = antialias;
  if (!(aa * 0.0 == 0.0) || aa < 0.0) aa = 0.0;
  if (aa > 1.0) aa = 1.0;
  if (aa <= 0.0 || !c) return shaped(input, center, width);
  c->n += 1;
  const double x = input + aa * 0.0005 * hash_bipolar(c->n, 0x51edu);
  double scaleX, shiftX, scaleY, shiftY;
  coeffs(center, width, &scaleX, &shiftX, &scaleY, &shiftY);
  const double u = scaleX * x + shiftX;
  const double Fu = tanh_antideriv(u);
  const double du = u - c->u1;
  double adaaF;
  if (du > -1.0e-5 && du < 1.0e-5) {
    adaaF = tanh_approx((u + c->u1) * 0.5);
  } else {
    adaaF = (Fu - c->F1) / du;
  }
  c->u1 = u;
  c->F1 = Fu;
  const double adaaY = shiftY + scaleY * adaaF;
  if (aa >= 1.0) return adaaY;
  const double y = shiftY + scaleY * tanh_approx(u);
  return y + aa * (adaaY - y);
}

}  // namespace

extern "C" int soemdsp_clipper_limiter_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      for (int c = 0; c < kChannels; c += 1) {
        s.ch[c].u1 = 0.0;
        s.ch[c].F1 = tanh_antideriv(0.0);
        s.ch[c].n = 0;
      }
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_clipper_limiter_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_clipper_limiter_sample(
  int handle,
  int channel,
  double input,
  double minDb,
  double maxDb,
  double gainDb,
  double antialias
) {
  const double loDb = safe(minDb);
  const double hiDb = safe(maxDb);
  const double minLin = db_to_lin(loDb < hiDb ? loDb : hiDb);
  const double maxLin = db_to_lin(loDb > hiDb ? loDb : hiDb);
  const double drive = db_to_lin(safe(gainDb));
  const double x = safe(input) * drive;
  const double ax = dsp_fabs(x);
  if (ax <= minLin) return x;
  const double span = maxLin - minLin > 1e-12 ? maxLin - minLin : 1e-12;
  const double excess = ax - minLin;
  Channel* ch = 0;
  if (handle >= 1 && handle <= kMaxInstances && gPool[handle - 1].active) {
    int idx = channel;
    if (idx < 0) idx = 0;
    if (idx > 2) idx = 2;
    ch = &gPool[handle - 1].ch[idx];
  }
  const double shapedY = softclip_aa(ch, excess, 0.0, 2.0 * span, antialias);
  const double sign = x < 0.0 ? -1.0 : 1.0;
  return sign * (minLin + shapedY);
}

extern "C" int soemdsp_clipper_limiter_version() { return 1; }
extern "C" const char* soemdsp_clipper_limiter_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_clipper_limiter_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
