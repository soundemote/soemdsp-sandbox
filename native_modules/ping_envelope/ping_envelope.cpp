// soemdsp-native-module: ping_envelope
// soemdsp-native-label: Ping Envelope
// soemdsp-native-target: pingEnvelope
// soemdsp-native-kind: envelope
//
// Breadboard: patches/modulator breadboards/ping envelope.json
//   Inertial Filter (Attack time, Release 0…20000 Hz) with Env → attenuverter
//   → Amp Curve Exp → unit-MOD Release (Inertial Release is 0…20000 Hz).
// Decay 1 (reversed Amount): 0 → amplitude 1, 1 → amplitude 0.
// Decay 2: 0 → offset +0.5, 1 → offset −0.5. Default 0.5 is offset 0.
// Attack is one-pole rise time in seconds (unchanged).

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kReleaseHzMax = 20000.0;
static const double kReleaseHzMin = 0.001;
static const double kExpDbSpan = 5.0;
static const double kLn10 = 2.302585092994046;

struct State {
  double env;
  double lastTrig;
  double shotAttack;
  double shotDecay1;
  double shotDecay2;
  double shotAmp;
  bool hasShot;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"ping_envelope\","
    "\"label\":\"Ping Envelope\","
    "\"targetType\":\"pingEnvelope\","
    "\"kind\":\"envelope\""
  "}";

static double k_hz(double hz, double sr) {
  if (!(hz * 0.0 == 0.0) || hz <= 0.0) return 0.0;
  if (hz >= sr * 0.5) return 1.0;
  const double k = 1.0 - dsp_exp((-kTwoPi * hz) / sr);
  return (k * 0.0 == 0.0) ? clamp(k, 0.0, 1.0) : 0.0;
}

static double k_attack(double sec, double sr) {
  if (!(sec * 0.0 == 0.0) || sec <= 0.0) return 1.0;
  const double k = 1.0 - dsp_exp(-1.0 / (sec * sr));
  return (k * 0.0 == 0.0) ? clamp(k, 0.0, 1.0) : 1.0;
}

static double exp_curve(double x) {
  if (!(x * 0.0 == 0.0) || x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  const double y = dsp_exp(kExpDbSpan * (x - 1.0) * kLn10);
  if (!(y * 0.0 == 0.0) || y < 0.0) return 0.0;
  return y > 1.0 ? 1.0 : y;
}

static double clamp01_param(double v, double fallback) {
  double x = safe(v);
  if (!(x * 0.0 == 0.0)) x = fallback;
  if (x < 0.0) x = 0.0;
  if (x > 1.0) x = 1.0;
  return x;
}

}  // namespace

extern "C" int soemdsp_ping_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.env = 0.0;
      s.lastTrig = 0.0;
      s.shotAttack = 0.0;
      s.shotDecay1 = 0.5;
      s.shotDecay2 = 0.5;
      s.shotAmp = 1.0;
      s.hasShot = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_ping_envelope_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_ping_envelope_sample(
  int handle,
  double input,
  double attackSec,
  double decay1,
  double decay2,
  double amplitude,
  double recalculateOnTrigger,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double liveAtk = maxd(0.0, safe(attackSec));
  const double liveDecay1 = clamp01_param(decay1, 0.5);
  const double liveDecay2 = clamp01_param(decay2, 0.5);
  const double liveAmp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  const bool latch = safe(recalculateOnTrigger) >= 0.5;

  const double in = safe(input);
  const bool trigHigh = in > 0.0;
  const bool trigRise = !(s.lastTrig > 0.0) && trigHigh;
  s.lastTrig = trigHigh ? 1.0 : 0.0;

  if (!latch) {
    s.shotAttack = liveAtk;
    s.shotDecay1 = liveDecay1;
    s.shotDecay2 = liveDecay2;
    s.shotAmp = liveAmp;
    s.hasShot = true;
  } else if (trigRise) {
    s.shotAttack = liveAtk;
    s.shotDecay1 = liveDecay1;
    s.shotDecay2 = liveDecay2;
    s.shotAmp = liveAmp;
    s.hasShot = true;
  }

  const double target = in * s.shotAmp;
  const double attenAmp = 1.0 - s.shotDecay1;
  const double attenOff = 0.5 - s.shotDecay2;
  const double x = s.env * attenAmp + attenOff;
  double relHz = exp_curve(x) * kReleaseHzMax;
  if (relHz < kReleaseHzMin) relHz = kReleaseHzMin;

  const double ka = k_attack(s.shotAttack, sr);
  const double kr = k_hz(relHz, sr);
  const double cur = safe(s.env);
  const double delta = target - cur;
  s.env = cur + delta * (delta >= 0.0 ? ka : kr);
  if (!(s.env * 0.0 == 0.0)) s.env = 0.0;

  return (s.env * 0.0 == 0.0) ? s.env : 0.0;
}

extern "C" int soemdsp_ping_envelope_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  State& s = gPool[handle - 1];
  if (!s.active) return 1;
  const double a = s.env < 0.0 ? -s.env : s.env;
  return (a < 1.0e-5) ? 1 : 0;
}

extern "C" int soemdsp_ping_envelope_version() { return 16; }
extern "C" const char* soemdsp_ping_envelope_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_ping_envelope_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
