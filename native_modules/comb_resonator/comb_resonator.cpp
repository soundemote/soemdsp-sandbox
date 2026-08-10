// soemdsp-native-module: comb_resonator
// soemdsp-native-label: Comb Resonator
// soemdsp-native-target: combResonator
// soemdsp-native-kind: filter
//
// Feedback/feedforward comb with Thiran fractional delay.
// Matches public/modules/combResonator/comb-resonator-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 16;
static const double kMinHz = 10.0;
static const double kMaxSeconds = 0.12;
// 0.12s @ 192 kHz + headroom
static const int kMaxCapacity = 23048;

struct State {
  bool active;
  float buffer[kMaxCapacity];
  int capacity;
  int writeIndex;
  int filled;
  double lp;
  double thiranX1;
  double thiranY1;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"comb_resonator\","
    "\"label\":\"Comb Resonator\","
    "\"targetType\":\"combResonator\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\",\"Trigger\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":110,"
        "\"min\":10,\"mid\":110,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"defaultValue\":1,\"min\":0.001,\"mid\":1,\"max\":10,"
        "\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"hold\",\"label\":\"Hold\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"damping\",\"label\":\"Damping\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"topology\",\"label\":\"Topology\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"invert\",\"label\":\"Invert\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"depth\",\"label\":\"Depth\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":2,\"step\":\"any\"}"
    "]"
  "}";

static void ensure_buffer(State* s, double sampleRate) {
  const double rate = maxd(1.0, sampleRate);
  int capacity = (int)(rate * kMaxSeconds) + 8;
  if (capacity < 64) capacity = 64;
  if (capacity > kMaxCapacity) capacity = kMaxCapacity;
  if (s->capacity != capacity) {
    s->capacity = capacity;
    s->writeIndex = 0;
    s->filled = 0;
    s->lp = 0.0;
    s->thiranX1 = 0.0;
    s->thiranY1 = 0.0;
    for (int i = 0; i < capacity; i++) s->buffer[i] = 0.0f;
  }
}

static double read_int(State* s, int delayInt) {
  const int capacity = s->capacity;
  if (capacity < 2 || s->filled <= 0) return 0.0;
  int d = delayInt;
  if (d < 1) d = 1;
  if (d > capacity - 2) d = capacity - 2;
  int i = s->writeIndex - d;
  i %= capacity;
  if (i < 0) i += capacity;
  return (double)s->buffer[i];
}

static double thiran(State* s, double x, double frac) {
  double d = frac;
  if (d < 1e-12) {
    s->thiranX1 = x;
    s->thiranY1 = x;
    return x;
  }
  if (d > 0.999999) d = 0.999999;
  const double a = (1.0 - d) / (1.0 + d);
  const double y = a * x + s->thiranX1 - a * s->thiranY1;
  s->thiranX1 = x;
  s->thiranY1 = safe(y);
  return s->thiranY1;
}

static double read_frac(State* s, double delaySamples) {
  const int capacity = s->capacity;
  if (capacity < 2) return 0.0;
  double D = delaySamples;
  if (D < 2.0) D = 2.0;
  if (D > (double)(capacity - 2)) D = (double)(capacity - 2);
  const int dInt = (int)dsp_floor(D);
  const double frac = D - (double)dInt;
  return thiran(s, read_int(s, dInt), frac);
}

static double feedback_gain(double decaySec, double delaySamples, double rate, int hold) {
  if (hold) return 1.0 - 1e-12;
  const double D = maxd(1.0, delaySamples);
  const double tau = maxd(1e-6, decaySec);
  double g = dsp_exp(-D / (tau * rate));
  if (!(g >= 0.0) || g * 0.0 != 0.0) g = 0.0;
  if (g > 1.0 - 1e-12) g = 1.0 - 1e-12;
  return g;
}

static double loop_filter(State* s, double x, double damping) {
  const double d = clamp(damping, 0.0, 1.0);
  if (d <= 1e-9) {
    s->lp = x;
    return x;
  }
  const double coef = d * d;
  const double a = 1.0 - coef;
  s->lp += a * (x - s->lp);
  s->lp = safe(s->lp);
  return s->lp;
}

}  // namespace

extern "C" int soemdsp_comb_resonator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.capacity = 0;
      s.writeIndex = 0;
      s.filled = 0;
      s.lp = 0.0;
      s.thiranX1 = 0.0;
      s.thiranY1 = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_comb_resonator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_comb_resonator_sample(
  int handle,
  double input,
  double frequencyHz,
  double decaySec,
  int hold,
  double damping,
  int topology,
  int invert,
  double depth,
  double amplitude,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  ensure_buffer(&s, sampleRate);
  const double rate = maxd(1.0, sampleRate);
  const int capacity = s.capacity;

  double f0 = safe(frequencyHz);
  if (f0 < kMinHz) f0 = kMinHz;
  if (f0 > rate * 0.499) f0 = rate * 0.499;

  double delaySamples = rate / f0;
  if (delaySamples < 2.0) delaySamples = 2.0;
  if (delaySamples > (double)(capacity - 2)) delaySamples = (double)(capacity - 2);

  const double amp = safe(amplitude);
  const double x = safe(input) * ((amp * 0.0 == 0.0) ? amp : 1.0);
  const double sign = invert ? -1.0 : 1.0;
  const int isFf = topology != 0;

  double y;
  if (isFf) {
    const double delayed = read_frac(&s, delaySamples);
    const double amt = clamp(depth, 0.0, 1.0);
    y = x + sign * amt * delayed;
    s.buffer[s.writeIndex] = (float)x;
  } else {
    const double delayed = read_frac(&s, delaySamples);
    const double fb = loop_filter(&s, delayed, damping);
    const double g = feedback_gain(decaySec, delaySamples, rate, hold);
    y = x + sign * g * fb;
    y = safe(y);
    if (y > -1e-30 && y < 1e-30) y = 0.0;
    s.buffer[s.writeIndex] = (float)y;
  }

  s.writeIndex = (s.writeIndex + 1) % capacity;
  if (s.filled < capacity) s.filled += 1;

  y = safe(y);
  if (y > -1e-30 && y < 1e-30) y = 0.0;
  return y;
}

extern "C" int soemdsp_comb_resonator_version() { return 1; }
extern "C" const char* soemdsp_comb_resonator_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_comb_resonator_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
