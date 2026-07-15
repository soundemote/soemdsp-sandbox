// soemdsp-native-module: lorenz_attractor
// soemdsp-native-label: Lorenz Attractor
// soemdsp-native-target: lorenzAttractor
// soemdsp-native-kind: chaos

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"lorenz_attractor\","
    "\"label\":\"Lorenz Attractor\","
    "\"targetType\":\"lorenzAttractor\","
    "\"kind\":\"chaos\","
    "\"inputs\":[\"Reset\"],"
    "\"outputs\":[\"X\",\"Y\",\"Z\"],"
    "\"parameters\":["
      "{\"key\":\"speed\",\"label\":\"Speed\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"sigma\",\"label\":\"Sigma\",\"defaultValue\":10,\"min\":0,\"mid\":10,\"max\":30,\"step\":\"any\"},"
      "{\"key\":\"rho\",\"label\":\"Rho\",\"defaultValue\":28,\"min\":-30,\"mid\":28,\"max\":60,\"step\":\"any\"},"
      "{\"key\":\"beta\",\"label\":\"Beta\",\"defaultValue\":2.6666666666666665,\"min\":0,\"mid\":2.6666666666666665,\"max\":10,\"step\":\"any\"},"
      "{\"key\":\"rotate\",\"label\":\"Rotate\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"scale\",\"label\":\"Scale\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":4,\"step\":\"any\"},"
      "{\"key\":\"zDepth\",\"label\":\"Z Depth\",\"defaultValue\":0.4,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 32;
// Local name (not the shared soemdsp_maths::dsp_ceil) -- this is
// truncation-based rather than floor-based, only equivalent for x >= 0
// (dt/0.0007 below is always positive), so kept distinct rather than
// merged without auditing that invariant away.
static inline double lorenz_dsp_ceil_trunc(double x) {
  double xi = (double)(long long)x;
  return (x > xi) ? xi + 1.0 : xi;
}

struct LorenzState {
  double x, y, z;
  double outX, outY, outZ;
  bool   resetWasHigh;
  bool   active;
};

static LorenzState gPool[kMaxInstances];

static void reset_lorenz(LorenzState& s) {
  s.x = 0.1;
  s.y = 0.0;
  s.z = 0.0;
}

// IEEE-754 exponent field is all-ones (0x7FF) for both NaN and +/-Infinity.
static bool is_finite(double x) {
  union { double d; unsigned long long u; } bits;
  bits.d = x;
  return ((bits.u >> 52) & 0x7FF) != 0x7FF;
}

}  // namespace

extern "C" int soemdsp_lorenz_attractor_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      LorenzState& s = gPool[i];
      reset_lorenz(s);
      s.outX = 0.0; s.outY = 0.0; s.outZ = 0.0;
      s.resetWasHigh = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_lorenz_attractor_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_lorenz_attractor_sample(
  int    handle,
  double reset,
  double speed,
  double sigma,
  double rho,
  double beta,
  double rotate,
  double scale,
  double zDepth,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  LorenzState& s = gPool[handle - 1];

  const bool resetHigh = safe(reset) > 0.5;
  if (resetHigh && !s.resetWasHigh) {
    reset_lorenz(s);
  }
  s.resetWasHigh = resetHigh;

  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double safeSpeed = maxd(0.0, safe(speed));
  const double safeSigma = maxd(0.0, safe(sigma));
  const double safeRho = safe(rho);
  const double safeBeta = maxd(0.0, safe(beta));
  const double dt = (0.75 * safeSpeed) / rate;
  const int steps = (int)maxd(1.0, lorenz_dsp_ceil_trunc(dt / 0.0007));
  const double stepDt = steps > 0 ? dt / (double)steps : 0.0;

  for (int i = 0; i < steps; i++) {
    const double dx = safeSigma * (s.y - s.x);
    const double dy = s.x * (safeRho - s.z) - s.y;
    const double dz = s.x * s.y - safeBeta * s.z;
    s.x += dx * stepDt;
    s.y += dy * stepDt;
    s.z += dz * stepDt;
    if (!is_finite(s.x) || !is_finite(s.y) || !is_finite(s.z)) {
      reset_lorenz(s);
      break;
    }
  }

  const double rotateRad = safe(rotate) * kTwoPi;
  const double cosRotate = dsp_cos(rotateRad);
  const double sinRotate = dsp_sin(rotateRad);
  const double normalizedX = s.x / 24.0;
  const double normalizedY = s.y / 32.0;
  const double normalizedZ = (s.z - 25.0) / 30.0;
  const double depth = clamp(safe(zDepth), 0.0, 1.0);
  const double depthScale = 1.0 + normalizedZ * depth * 0.35;
  const double finalScale = maxd(0.0, safe(scale)) * depthScale;
  const double outX = (normalizedX * cosRotate - normalizedY * sinRotate) * finalScale;
  const double outY = (normalizedX * sinRotate + normalizedY * cosRotate) * finalScale;
  const double outZ = normalizedZ * finalScale;

  s.outX = clamp(outX, -1.0, 1.0);
  s.outY = clamp(outY, -1.0, 1.0);
  s.outZ = clamp(outZ, -1.0, 1.0);
}

extern "C" double soemdsp_lorenz_attractor_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_lorenz_attractor_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_lorenz_attractor_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outZ;
}

extern "C" int soemdsp_lorenz_attractor_version() {
  return 1;
}

extern "C" const char* soemdsp_lorenz_attractor_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_lorenz_attractor_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
