// soemdsp-native-module: fractal_spiral
// soemdsp-native-label: Fractal Spiral
// soemdsp-native-target: fractalSpiral
// soemdsp-native-kind: jerobeam
//
// Weierstrass-style self-affine fractal spiral: N rotating copies of the
// same unit vector, each spun `lacunarity`x faster and scaled by `gain`,
// summed and normalized onto a logarithmic-spiral envelope. See
// public/node-graph-fractal-spiral.js for the full derivation this is a
// direct port of.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"fractal_spiral\","
    "\"label\":\"Fractal Spiral\","
    "\"targetType\":\"fractalSpiral\","
    "\"kind\":\"jerobeam\","
    "\"outputs\":[\"X\",\"Y\",\"Z\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":1,\"min\":0,\"mid\":5,\"max\":100,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"octaves\",\"label\":\"Octaves\",\"defaultValue\":5,\"min\":1,\"mid\":8,\"max\":16,\"step\":1},"
      "{\"key\":\"gain\",\"label\":\"Gain\",\"defaultValue\":0.5,\"min\":0.001,\"mid\":0.5,\"max\":0.98,\"step\":\"any\"},"
      "{\"key\":\"lacunarity\",\"label\":\"Lacunarity\",\"defaultValue\":2,\"min\":1.0001,\"mid\":2,\"max\":8,\"step\":\"any\"},"
      "{\"key\":\"twist\",\"label\":\"Twist\",\"defaultValue\":0.381966,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"growth\",\"label\":\"Growth\",\"defaultValue\":1.5,\"min\":-10,\"mid\":1.5,\"max\":10,\"step\":\"any\"},"
      "{\"key\":\"size\",\"label\":\"Size\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"spin\",\"label\":\"Spin\",\"kind\":\"frequency\",\"defaultValue\":0.05,\"min\":0,\"mid\":1,\"max\":20,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"level\",\"label\":\"Level\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"}"
    "]"
  "}";

static const int kMaxInstances = 32;
struct FractalSpiralState {
  double phase;
  double spinPhase;
  double outX, outY, outZ;
  bool   active;
};

static FractalSpiralState gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_fractal_spiral_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      FractalSpiralState& s = gPool[i];
      s.phase = 0.0;
      s.spinPhase = 0.0;
      s.outX = 0.0; s.outY = 0.0; s.outZ = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_fractal_spiral_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_fractal_spiral_sample(
  int    handle,
  double frequency,
  double spin,
  double size,
  double growth,
  double gain,
  double lacunarity,
  double octaves,
  double twist,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return;
  FractalSpiralState& s = gPool[handle - 1];

  const double rate = maxd(1.0, sampleRate);
  const double safeSize = maxd(0.0, safe(size));
  const double safeGain = clamp(safe(gain), 0.001, 0.98);
  const double safeLacunarity = maxd(1.0001, safe(lacunarity));
  const int octaveCount = (int)clamp((double)(long long)(safe(octaves) + 0.5), 1.0, 16.0);
  const double safeTwist = safe(twist);

  const double mainPhase = wrap01_frac(s.phase);
  s.phase = wrap01_frac(s.phase + frequency / rate);
  const double spinPhaseValue = wrap01_frac(s.spinPhase);
  s.spinPhase = wrap01_frac(s.spinPhase + spin / rate);

  const double theta = mainPhase * kTwoPi;
  const double envelope = dsp_exp(growth * (mainPhase - 0.5));

  double sumX = 0.0;
  double sumY = 0.0;
  double ampSum = 0.0;
  double amp = 1.0;
  double angleMultiplier = 1.0;
  for (int k = 0; k < octaveCount; k++) {
    const double angle = angleMultiplier * theta + (double)k * safeTwist * kTwoPi;
    sumX += amp * dsp_cos(angle);
    sumY += amp * dsp_sin(angle);
    ampSum += amp;
    amp *= safeGain;
    angleMultiplier *= safeLacunarity;
  }
  const double normX = ampSum > 0.0 ? sumX / ampSum : 0.0;
  const double normY = ampSum > 0.0 ? sumY / ampSum : 0.0;

  const double radius = envelope * safeSize;
  const double rawX = normX * radius;
  const double rawY = normY * radius;

  const double spinAngle = spinPhaseValue * kTwoPi;
  const double cosSpin = dsp_cos(spinAngle);
  const double sinSpin = dsp_sin(spinAngle);

  s.outX = rawX * cosSpin - rawY * sinSpin;
  s.outY = rawX * sinSpin + rawY * cosSpin;
  s.outZ = envelope - 1.0;
}

extern "C" double soemdsp_fractal_spiral_x(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outX;
}

extern "C" double soemdsp_fractal_spiral_y(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outY;
}

extern "C" double soemdsp_fractal_spiral_z(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].outZ;
}

extern "C" int soemdsp_fractal_spiral_version() {
  return 1;
}

extern "C" const char* soemdsp_fractal_spiral_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_fractal_spiral_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
