// soemdsp-native-module: pluck_envelope_3
// soemdsp-native-label: Pluck Envelope
// soemdsp-native-target: pluckEnvelope3
// soemdsp-native-kind: envelope
//
// Clean pluck env:
//   asymmetric one-pole toward Trigger
//   Attack = time (s); 0 = instant
//   fall from Exp(env + dampen−0.5) → 0…10 Hz feedback
//   Recalc On Trig: latch Attack/Dampen/Amplitude on rising edge (default On)

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kReleaseHzMax = 10.0;
static const double kExpDbSpan = 5.0;
static const double kLn10 = 2.302585092994046;

struct State {
  double env;
  double fb;
  double lastTrig;
  double shotAttack;
  double shotDampen;
  double shotAmp;
  bool hasShot;
  bool primed;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"pluck_envelope_3\","
    "\"label\":\"Pluck Envelope\","
    "\"targetType\":\"pluckEnvelope3\","
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
  const double c = clamp(x, 0.0, 1.0);
  if (!(c > 0.0)) return 0.0;
  if (c >= 1.0) return 1.0;
  const double y = dsp_exp(kExpDbSpan * (c - 1.0) * kLn10);
  if (!(y * 0.0 == 0.0) || y < 0.0) return 0.0;
  return y > 1.0 ? 1.0 : y;
}

}  // namespace

extern "C" int soemdsp_pluck_envelope_3_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      State& s = gPool[i];
      s.env = 0.0;
      s.fb = 0.0;
      s.lastTrig = 0.0;
      s.shotAttack = 0.0;
      s.shotDampen = 0.5;
      s.shotAmp = 1.0;
      s.hasShot = false;
      s.primed = false;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pluck_envelope_3_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_pluck_envelope_3_sample(
  int handle,
  double input,
  double attackSec,
  double dampen,
  double amplitude,
  double recalculateOnTrigger,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];

  const double target = safe(input);
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;
  const double liveAtk = maxd(0.0, safe(attackSec));
  double liveDamp = safe(dampen);
  if (!(liveDamp * 0.0 == 0.0)) liveDamp = 0.5;
  liveDamp = clamp(liveDamp, 0.0, 1.0);
  const double liveAmp = (amplitude * 0.0 == 0.0) ? amplitude : 1.0;
  const bool latch = safe(recalculateOnTrigger) >= 0.5;

  const bool trigHigh = target > 0.5;
  const bool trigRise = !(s.lastTrig > 0.5) && trigHigh;
  s.lastTrig = trigHigh ? 1.0 : 0.0;

  // On: latch Attack/Dampen/Amplitude only on rising Trigger.
  // Off: live knobs always drive the shot.
  if (!latch || trigRise || !s.hasShot) {
    s.shotAttack = liveAtk;
    s.shotDampen = liveDamp;
    s.shotAmp = liveAmp;
    s.hasShot = true;
  }

  if (!s.primed) {
    s.primed = true;
    s.env = target;
    s.fb = 0.0;
  }

  const double ka = k_attack(s.shotAttack, sr);
  const double kr = k_hz(s.fb * kReleaseHzMax, sr);
  const double cur = safe(s.env);
  const double delta = target - cur;
  s.env = cur + delta * (delta >= 0.0 ? ka : kr);
  if (!(s.env * 0.0 == 0.0)) s.env = 0.0;

  s.fb = exp_curve(s.env + (s.shotDampen - 0.5));

  const double y = s.env * s.shotAmp;
  return (y * 0.0 == 0.0) ? y : 0.0;
}

extern "C" int soemdsp_pluck_envelope_3_version() { return 3; }
extern "C" const char* soemdsp_pluck_envelope_3_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_pluck_envelope_3_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
