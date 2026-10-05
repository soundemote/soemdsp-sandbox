// soemdsp-native-module: ping_envelope
// soemdsp-native-label: Ping Envelope
// soemdsp-native-target: pingEnvelope
// soemdsp-native-kind: envelope
//
// Model Short (soundemote.io / old pluckEnvelope3 / default):
//   x = clamp01(env + (0.5 - Decay)) -> 5-decade exp -> relHz = fb * 10 (0..10 Hz).
//   Decay 0 = short fall, 1 = long. Amplitude scales output (env * amp).
// Model Long (current sandbox):
//   x = env * 0.7718 + (1 - Decay) -> 5-decade exp -> Release 0..1000 Hz.
//   Decay 0 = offset 1, 1 = offset 0. Amplitude scales inertial target.
// Shared: asymmetric one-pole toward Trigger, Recalc On Trig, Attack,
// no snap-reset on rising trig.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kLongFeedbackAmp = 0.7718;
static const double kLongReleaseHzMax = 1000.0;
static const double kShortReleaseHzMax = 10.0;
static const double kExpDbSpan = 5.0;
static const double kLn10 = 2.302585092994046;

struct State {
  double env;
  double lastTrig;
  double shotAttack;
  double shotDecay;
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

// choiceIds: Short=0, Long=1. Unknown / default → Short.
static bool model_is_short(double model) {
  const double m = safe(model);
  if (!(m * 0.0 == 0.0)) return true;  // unknown → Short (default)
  return m < 0.5;
}

}  // namespace

extern "C" int soemdsp_ping_envelope_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.env = 0.0;
      s.lastTrig = 0.0;
      s.shotAttack = 0.0;
      s.shotDecay = 0.5;
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
  double decay,
  double amplitude,
  double recalculateOnTrigger,
  double model,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double liveAtk = maxd(0.0, safe(attackSec));
  const double liveDecay = clamp01_param(decay, 0.5);
  const double liveAmp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  const bool latch = safe(recalculateOnTrigger) >= 0.5;
  const bool isShort = model_is_short(model);

  const double in = safe(input);
  const bool trigHigh = in > 0.0;
  const bool trigRise = !(s.lastTrig > 0.0) && trigHigh;
  s.lastTrig = trigHigh ? 1.0 : 0.0;

  if (!latch) {
    s.shotAttack = liveAtk;
    s.shotDecay = liveDecay;
    s.shotAmp = liveAmp;
    s.hasShot = true;
  } else if (trigRise) {
    s.shotAttack = liveAtk;
    s.shotDecay = liveDecay;
    s.shotAmp = liveAmp;
    s.hasShot = true;
  }

  // Long: amp scales inertial target. Short: amp scales output after the one-pole.
  const double target = isShort ? in : (in * s.shotAmp);

  double relHz = 0.0;
  if (isShort) {
    const double x = clamp01(s.env + (0.5 - s.shotDecay));
    relHz = exp_curve(x) * kShortReleaseHzMax;
    if (!(relHz * 0.0 == 0.0) || relHz < 0.0) relHz = 0.0;
    if (relHz > kShortReleaseHzMax) relHz = kShortReleaseHzMax;
  } else {
    const double offset = 1.0 - s.shotDecay;
    const double x = s.env * kLongFeedbackAmp + offset;
    relHz = exp_curve(x) * kLongReleaseHzMax;
    if (!(relHz * 0.0 == 0.0) || relHz < 0.0) relHz = 0.0;
    if (relHz > kLongReleaseHzMax) relHz = kLongReleaseHzMax;
  }

  const double ka = k_attack(s.shotAttack, sr);
  const double kr = k_hz(relHz, sr);
  const double cur = safe(s.env);
  const double delta = target - cur;
  s.env = cur + delta * (delta >= 0.0 ? ka : kr);
  if (!(s.env * 0.0 == 0.0)) s.env = 0.0;

  const double envOut = (s.env * 0.0 == 0.0) ? s.env : 0.0;
  if (isShort) {
    const double out = envOut * s.shotAmp;
    return (out * 0.0 == 0.0) ? out : 0.0;
  }
  return envOut;
}

extern "C" int soemdsp_ping_envelope_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  State& s = gPool[handle - 1];
  if (!s.active) return 1;
  const double a = s.env < 0.0 ? -s.env : s.env;
  return (a < 1.0e-5) ? 1 : 0;
}

extern "C" int soemdsp_ping_envelope_version() { return 19; }
extern "C" const char* soemdsp_ping_envelope_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_ping_envelope_metadata_json_size() { return sizeof(kMetadataJson) - 1; }