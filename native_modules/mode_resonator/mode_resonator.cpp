// soemdsp-native-module: mode_resonator
// soemdsp-native-label: Mode Resonator
// soemdsp-native-target: modeResonator
// soemdsp-native-kind: filter
//
// Complex 2-pole ring: y[n] = 2 r cos(ω) y[n-1] − r² y[n-2] + g x[n]
// Matches public/modules/modeResonator/mode-resonator-math.js.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  bool active;
  double y1, y2;
  double lastF, lastDecay, lastRate, lastAmp;
  int lastHold;
  double a1, a2, g;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"mode_resonator\","
    "\"label\":\"Mode Resonator\","
    "\"targetType\":\"modeResonator\","
    "\"kind\":\"filter\","
    "\"inputs\":[\"In\",\"Trig\"],"
    "\"outputs\":[\"Out\"],"
    "\"parameters\":["
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"kind\":\"frequency\",\"defaultValue\":440,"
        "\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"decay\",\"label\":\"Decay\",\"defaultValue\":0.5,\"min\":0.001,\"mid\":0.5,\"max\":10,"
        "\"step\":\"any\",\"unit\":\"s\"},"
      "{\"key\":\"hold\",\"label\":\"Hold\",\"defaultValue\":0,\"min\":0,\"mid\":0,\"max\":1,\"step\":1},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":1,\"max\":2,"
        "\"step\":\"any\"}"
    "]"
  "}";

static void ensure(State* s, double frequencyHz, double decaySec, int hold, double amplitude, double sampleRate) {
  const double rate = maxd(1.0, sampleRate);
  const double f = clamp(safe(frequencyHz), 0.0, rate * 0.499);
  const double decay = maxd(0.0, safe(decaySec));
  const int isHold = hold ? 1 : 0;
  const double level = safe(amplitude);
  const double amp = (level * 0.0 == 0.0) ? level : 1.0;

  if (s->lastF == f && s->lastDecay == decay && s->lastHold == isHold
      && s->lastRate == rate && s->lastAmp == amp) {
    return;
  }
  s->lastF = f;
  s->lastDecay = decay;
  s->lastHold = isHold;
  s->lastRate = rate;
  s->lastAmp = amp;

  double omega = (2.0 * kPi * f) / rate;
  if (omega < 1e-12) omega = 1e-12;
  if (omega > kPi - 1e-12) omega = kPi - 1e-12;

  double r;
  if (isHold) {
    r = 1.0;
  } else {
    const double tau = maxd(1e-6, decay);
    r = dsp_exp(-1.0 / (tau * rate));
    if (!(r >= 0.0) || r * 0.0 != 0.0) r = 0.0;
    if (r > 1.0) r = 1.0;
    if (r > 1.0 - 1e-12) r = 1.0 - 1e-12;
  }

  const double cosw = dsp_cos(omega);
  const double sinw = dsp_sin(omega);
  s->a1 = 2.0 * r * cosw;
  s->a2 = -(r * r);
  double sinAbs = dsp_fabs(sinw);
  if (sinAbs < 1e-6) sinAbs = 1e-6;
  s->g = sinAbs * amp;
}

}  // namespace

extern "C" int soemdsp_mode_resonator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.y1 = s.y2 = 0.0;
      s.lastF = -1.0;
      s.lastDecay = -1.0;
      s.lastRate = -1.0;
      s.lastAmp = -1.0;
      s.lastHold = -1;
      s.a1 = s.a2 = s.g = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_mode_resonator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_mode_resonator_sample(
  int handle,
  double input,
  double frequencyHz,
  double decaySec,
  int hold,
  double amplitude,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  State& s = gPool[handle - 1];
  if (!s.active) return 0.0;
  ensure(&s, frequencyHz, decaySec, hold, amplitude, sampleRate);
  const double x = safe(input);
  double y = s.g * x + s.a1 * s.y1 + s.a2 * s.y2;
  y = safe(y);
  if (y > -1e-30 && y < 1e-30) y = 0.0;
  s.y2 = s.y1;
  s.y1 = y;
  return y;
}

extern "C" int soemdsp_mode_resonator_version() { return 1; }
extern "C" const char* soemdsp_mode_resonator_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_mode_resonator_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
