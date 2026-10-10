// soemdsp-native-module: robin_sinepulse
// soemdsp-native-label: Robin Sinepulse
// soemdsp-native-target: robinSinepulse
// soemdsp-native-kind: drum
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/unfinished/rosic_MiscUnfinished.h
// soemdsp-native-upstream-license: RS-MET (permission)
// soemdsp-native-upstream-license-url: https://github.com/soundemote/soemdsp-sandbox/blob/master/docs/THIRD_PARTY.md#rs-met
//
// Robin Sinepulse: port of rosic::rsSweepKicker / rsFreqSweeper (Robin Schmidt,
// RS-MET), used with Robin's permission (2026-10-06, see docs/KICK_PLAN.md).
// Original: originalcode/.
//
// One oscillator whose frequency sweeps down from High Freq along Robin's
// rational sweep law (rsFreqSweeper::getInstFreq / updateCoeffs, refFreq 50 Hz):
//   p = 2^((chirp + shape)/2), q = 2^((chirp - shape)/2)
//   a = fHi, c = ((a/50)^(1/q) - 1) / sweepTime^p, b = fLo * c^q
//   f(t) = (a + b*t^(p*q)) / (1 + c*t^p)^q,  t = n / fs
// Phase: trapezoidal integration of f, wrapped once per sample
// (rsFreqSweeper::getSampleFrameStereo). Waves: rsMorphWaveBipolar
// (Sine, SinFatSaw, TriSaw with triSawParamMap 0.60).
//
// Sandbox additions (docs/KICK_PLAN.md, Argi 2026-10-06; Reset removed 2026-10-06):
//   - Decay: one-multiply T60 amplitude envelope e (Env out, scales Kick).
//   - Trigger only (gate_hit, height = velocity): latches High/Low/Sweep,
//     zeroes the phase (Robin's hard-reset noteOn), restarts the sweep, and
//     sets e = |height|. No Reset port.
//   - fHi clamped to [50 Hz, fs/2] (fHi < 50 Hz makes c < 0: upward sweep and
//     a singularity), fLo to [0, fs/2]. TriSaw guard at P = +1.
//   - No key / velocity frequency tracking, no FadeOut / PassThrough / stereo.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
static const double kRefFreq = 50.0;              // rsFreqSweeper::refFreq
static const double kLn2 = 0.6931471805599453;
static const double kLn1000 = 6.907755278982137;  // T60: e falls by 1000 in `decay` s
static const double kMinSweepTime = 1.0e-3;       // guard: sweepTime^p must stay > 0
static const double kMinDecay = 1.0e-4;

// rsMorphWaveBipolar::WaveForm order.
enum { kWaveSine = 0, kWaveSinFatSaw = 1, kWaveTriSaw = 2 };

struct State {
  // Latched at a Trigger (Robin's noteOn).
  double fHi;
  double fLo;
  double sweepTime;
  double velocity;
  // rsFreqSweeper formula coefficients and the chirp values they were made with.
  double a, b, c, p, q;
  double coeffChirp;
  double coeffShape;
  bool dirty;
  bool powFree;  // chirp = shape = 0: p = q = 1, f = (a + b*t) / (1 + c*t)
  // rsFreqSweeper state.
  double sampleCount;
  double instPhase;
  double instFreq;
  // Decay envelope.
  double env;
  double envOut;
  double freqOut;
  bool swept;
  double decayCached;
  double srCached;
  double r;
  // Gate memory.
  double lastTrigger;
  bool active;
};

static State gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"robin_sinepulse\","
    "\"label\":\"Robin Sinepulse\","
    "\"targetType\":\"robinSinepulse\","
    "\"kind\":\"drum\""
  "}";

static void init_state(State& s) {
  s.fHi = 10000.0;
  s.fLo = 0.0;
  s.sweepTime = 0.2;
  s.velocity = 0.0;
  s.a = s.b = s.c = 0.0;
  s.p = s.q = 1.0;
  s.coeffChirp = 0.0;
  s.coeffShape = 0.0;
  s.dirty = true;
  s.powFree = true;
  s.sampleCount = 0.0;
  s.instPhase = 0.0;
  s.instFreq = s.fHi;
  s.env = 0.0;
  s.envOut = 0.0;
  s.freqOut = s.fLo;
  s.swept = false;
  s.decayCached = -1.0;
  s.srCached = -1.0;
  s.r = 0.0;
  s.lastTrigger = 0.0;
}

// rsFreqSweeper::updateCoeffs (rosic_MiscUnfinished.cpp).
static void update_coeffs(State& s, double chirp, double shape) {
  s.coeffChirp = chirp;
  s.coeffShape = shape;
  s.dirty = false;
  s.a = s.fHi;
  if (chirp == 0.0 && shape == 0.0) {
    // p = q = 1: every pow() in Robin's formula is the identity.
    s.powFree = true;
    s.p = 1.0;
    s.q = 1.0;
    s.c = (s.a / kRefFreq - 1.0) / s.sweepTime;
    s.b = s.fLo * s.c;
    return;
  }
  s.powFree = false;
  const double ep = 0.5 * (chirp + shape);
  const double eq = 0.5 * (chirp - shape);
  s.p = dsp_exp(ep * kLn2);  // pow(2, ep)
  s.q = dsp_exp(eq * kLn2);  // pow(2, eq)
  s.c = (pow_pos(s.a / kRefFreq, 1.0 / s.q) - 1.0) / pow_pos(s.sweepTime, s.p);
  s.b = (s.c > 0.0) ? s.fLo * pow_pos(s.c, s.q) : 0.0;
}

// rsFreqSweeper::getInstFreq: (a + b*t^(p*q)) / (1 + c*t^p)^q.
static double inst_freq(const State& s, double t) {
  if (s.powFree) return (s.a + s.b * t) / (1.0 + s.c * t);
  if (!(t > 0.0)) return s.a;
  const double lnT = dsp_ln(t);  // one ln(t) shared by t^p and t^(p*q)
  const double tp = dsp_exp(s.p * lnT);
  const double tpq = dsp_exp(s.p * s.q * lnT);
  return (s.a + s.b * tpq) / pow_pos(1.0 + s.c * tp, s.q);
}

// RAPT::rsTriSaw with the phase already in cycles. r2 = rise length.
static double tri_saw(double pos01, double m) {
  const double x = wrap01(pos01);  // rsWrapAround(x, 1)
  const double r2 = 0.25 * (m + 1.0);
  if (x < r2) return x / r2;
  if (x > 1.0 - r2) return (x - 1.0) / r2;
  const double d = 1.0 - 2.0 * r2;
  if (!(d > 0.0)) return 1.0;  // guard: P = +1 at x = 0.5 (Robin's 0/0), left limit
  return 2.0 * (r2 - x) / d + 1.0;
}

// rsMorphWaveBipolar::triSawParamMap: sign(P) * rsRationalMap_01(|P|, 0.60).
static double tri_saw_param_map(double raw) {
  const double P = clamp(raw, -1.0, 1.0);
  const double m = rational_curve01(dsp_fabs(P), 0.60);
  return P < 0.0 ? -m : (P > 0.0 ? m : 0.0);
}

// rsMorphWaveBipolar::getWaveValue. Sine = dsp_sin_turns_lut (Sine SSOT).
static double wave_value(int wave, double pos, double waveShape) {
  if (wave == kWaveSine) return dsp_sin_turns_lut(pos);
  const double tri = tri_saw(pos, tri_saw_param_map(waveShape));
  if (wave == kWaveSinFatSaw) return dsp_sin_turns_lut(0.25 * tri);  // sin(pi/2 * tri)
  return tri;
}

// rsFreqSweeper::reset without the phase; Trigger zeroes phase separately.
static void restart_sweep(State& s) {
  s.sampleCount = 0.0;
  s.instFreq = s.fHi;
  s.dirty = true;
}

// Live control in: NaN/inf -> 0, |x| < kPlanck -> exact 0 (keeps subnormal
// modulation values out of the wave position and the output product).
static double clean_control(double x) {
  const double v = safe(x);
  return silent_planck(v) ? 0.0 : v;
}

// rsSweepKicker::noteOn latching, no key / velocity tracking.
static void latch_hit(State& s, double highFreq, double lowFreq, double sweepTime, double sr) {
  const double nyquist = 0.5 * sr;
  s.fHi = maxd(mind(safe(highFreq), nyquist), kRefFreq);
  s.fLo = clamp(safe(lowFreq), 0.0, nyquist);
  s.sweepTime = maxd(safe(sweepTime), kMinSweepTime);
}

}  // namespace

extern "C" int soemdsp_robin_sinepulse_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      init_state(gPool[i]);
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_robin_sinepulse_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

// Returns Kick; soemdsp_robin_sinepulse_env() returns this sample's Env.
extern "C" double soemdsp_robin_sinepulse_sample(
  int handle,
  double trigger,
  double highFreq,
  double lowFreq,
  double sweepTime,
  double chirp,
  double chirpShape,
  double wave,
  double waveShape,
  double phase,
  double decay,
  double amplitude,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  State& s = gPool[handle - 1];
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;

  const double trig = safe(trigger);
  const bool triggerHit = gate_hit(trig, &s.lastTrigger);
  if (triggerHit) {
    latch_hit(s, highFreq, lowFreq, sweepTime, sr);
    s.velocity = dsp_fabs(trig);
    s.instPhase = 0.0;  // Robin's hard-reset noteOn (Trigger alone)
    restart_sweep(s);
    s.env = s.velocity;
    s.swept = true;
  }

  if (s.env < kPlanck) {  // rest: exact 0, phase kept, no sweep maths
    s.env = 0.0;
    s.envOut = 0.0;
    if (!s.swept) {
      const double nyquist = 0.5 * sr;
      s.freqOut = clamp(safe(lowFreq), 0.0, nyquist);
    } else {
      s.freqOut = s.instFreq;
    }
    return 0.0;
  }

  // Output (Robin: wave(instPhase + phase) before the state update).
  int w = (int)(safe(wave) + 0.5);
  w = w < kWaveSine ? kWaveSine : (w > kWaveTriSaw ? kWaveTriSaw : w);
  const double y = wave_value(w, s.instPhase + clean_control(phase), clean_control(waveShape));
  const double e = s.env;
  s.envOut = e;
  const double out = clean_control(amplitude) * e * y;

  // State update (rsFreqSweeper::getSampleFrameStereo order).
  const double ch = clamp(safe(chirp), -1.0, 1.0);
  const double sh = clamp(safe(chirpShape), -1.0, 1.0);
  if (s.dirty || ch != s.coeffChirp || sh != s.coeffShape) update_coeffs(s, ch, sh);
  s.sampleCount += 1.0;
  s.freqOut = s.instFreq;
  const double newFreq = inst_freq(s, s.sampleCount / sr);
  s.instPhase += (0.5 / sr) * (s.instFreq + newFreq);  // trapezoidal integration
  if (s.instPhase >= 1.0) s.instPhase -= 1.0;
  s.instFreq = newFreq;

  // Decay envelope: e *= r, r = exp(-ln(1000) / (decay * fs)).
  const double dc = maxd(safe(decay), kMinDecay);
  if (dc != s.decayCached || sr != s.srCached) {
    s.decayCached = dc;
    s.srCached = sr;
    s.r = dsp_exp(-kLn1000 / (dc * sr));
  }
  s.env *= s.r;
  if (s.env < kPlanck) s.env = 0.0;

  return (out * 0.0 == 0.0) ? out : 0.0;
}

extern "C" double soemdsp_robin_sinepulse_freq(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].freqOut;
}

extern "C" double soemdsp_robin_sinepulse_env(int handle) {
  if (handle < 1 || handle > kMaxInstances || !gPool[handle - 1].active) return 0.0;
  return gPool[handle - 1].envOut;
}

extern "C" int soemdsp_robin_sinepulse_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 1;
  const State& s = gPool[handle - 1];
  return (!s.active || s.env < kPlanck) ? 1 : 0;
}

extern "C" int soemdsp_robin_sinepulse_version() { return 3; }
extern "C" const char* soemdsp_robin_sinepulse_metadata_json() { return kMetadataJson; }
extern "C" int soemdsp_robin_sinepulse_metadata_json_size() { return sizeof(kMetadataJson) - 1; }
