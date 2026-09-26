// soemdsp-native-module: pll
// soemdsp-native-label: PLL
// soemdsp-native-target: pll
// soemdsp-native-kind: effect

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 8;

// ── helpers ────────────────────────────────────────────────────────────────

static bool pll_finite(double v) {
  return v == v && v > -1.0e15 && v < 1.0e15;
}

// exp() polyfill — not available in -nostdlib wasm32 build.
// Accurate to ~1e-14 for |x| < 708; covers all values this module produces.
static double pll_exp(double x) {
  if (x > 709.0)  return 1.7976931348623157e+308;
  if (x < -708.0) return 0.0;
  // exp(x) = 2^(x * log2e); split into integer + fractional parts
  const double y  = x * 1.4426950408889634;
  const int    ni = (int)__builtin_floor(y);
  const double f  = y - (double)ni;
  // minimax polynomial: 2^f for f in [0,1), max err < 1e-14
  double p = 0.00015403530393381609;
  p = p * f + 0.0013333558146428443;
  p = p * f + 0.009618129107628477;
  p = p * f + 0.055504108664821580;
  p = p * f + 0.24022650695910072;
  p = p * f + 0.6931471805599453;
  p = p * f + 1.0;
  // scale by 2^ni via repeated multiply (ni is small: -5 to 5 in practice)
  double s = 1.0;
  if (ni >= 0) { for (int i = 0; i < ni; i++) s *= 2.0; }
  else         { for (int i = 0; i > ni; i--) s *= 0.5; }
  return p * s;
}

// ── VCO ────────────────────────────────────────────────────────────────────
// Linear phase accumulator → 50% square. Naive ±1 drives PC / lock; VCO Out
// is PolyBLEP (same residual as native_modules/polyblep).

static double pll_wrap01(double t) {
  t -= (double)(int)t;
  if (t < 0.0) t += 1.0;
  return t;
}

static double pll_polyblep(double phaseCycle, double dt) {
  if (dt < 1.0e-6) dt = 1.0e-6;
  if (dt > 0.5) dt = 0.5;
  if (phaseCycle < dt) {
    const double t = phaseCycle / dt;
    return t + t - t * t - 1.0;
  }
  if (phaseCycle > 1.0 - dt) {
    const double t = (phaseCycle - 1.0) / dt;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}

struct Vco {
  double phase;
  double sampleRate;
  double out;      // naive ±1 for comparators / lock
  double prevOut;
  double audio;    // PolyBLEP square for VCO Out

  void reset() {
    phase = 0.0;
    out = -1.0;
    prevOut = -1.0;
    audio = -1.0;
  }

  double process(double freq) {
    prevOut = out;
    const double sr = sampleRate > 0.0 ? sampleRate : 44100.0;
    double inc = freq / sr;
    phase += inc;
    while (phase >= 1.0) phase -= 1.0;
    while (phase < 0.0)  phase += 1.0;
    out = phase < 0.5 ? 1.0 : -1.0;
    const double dt = inc < 0.0 ? -inc : inc;
    audio = out + pll_polyblep(phase, dt) - pll_polyblep(pll_wrap01(phase + 0.5), dt);
    return audio;
  }

  bool risingEdge() const {
    return prevOut < 0.0 && out >= 0.0;
  }
};

// ── One-pole LP (MZT, DC-coupled) — plain fields on PllState (APP_POLICY) ──
// a1 = exp(-2π·fc/sr),  b0 = 1 - a1. Floor 0 / cap ~Nyquist only.

static void one_pole_lp_set(double fc, double sr, double& a1, double& b0) {
  const double rate = sr > 0.0 ? sr : 44100.0;
  double f = fc < 0.0 ? 0.0 : fc;
  const double nyquist = rate * 0.49;
  if (f > nyquist) f = nyquist;
  const double w = 6.283185307179586 * f / rate;
  a1 = pll_exp(-w);
  b0 = 1.0 - a1;
}

static double one_pole_lp_run(double& buf, double a1, double b0, double in) {
  buf = b0 * in + a1 * buf;
  return buf;
}

// ── Phase comparators ──────────────────────────────────────────────────────
// All inputs are audio-range signals; binarize at 0 (> 0 = high).

// PC1: XOR — locks at harmonics
static double pc1_process(double sig, double vco) {
  const bool a = sig > 0.0;
  const bool b = vco > 0.0;
  return (a != b) ? 1.0 : 0.0;
}

// PC2: RS flipflop — set on rising edge of sig, reset on rising edge of VCO.
// Does not lock at harmonics. Lock LED valid here.
struct Pc2 {
  double state;
  double prevSig;
  double prevVco;

  void reset() {
    state = 0.0;
    prevSig = 0.0;
    prevVco = 0.0;
  }

  double process(double sig, double vco) {
    const bool rSig = prevSig <= 0.0 && sig > 0.0;
    const bool rVco = prevVco <= 0.0 && vco > 0.0;
    prevSig = sig;
    prevVco = vco;
    if (rSig && !rVco) state = 1.0;
    if (rVco && !rSig) state = 0.0;
    // simultaneous edges → tri-state: hold current value (PLL locked)
    return state;
  }
};

// PC3: phase-frequency detector (digital memory network).
// Two D-flipflops, cleared when both are set simultaneously.
// Outputs: 1 (sig leads → VCO too slow), 0 (VCO leads → VCO too fast),
//          0.5 (locked / idle → hold).
// Does not lock at harmonics.
struct Pc3 {
  bool sigFf;
  bool vcoFf;
  double prevSig;
  double prevVco;
  double state;

  void reset() {
    sigFf = false;
    vcoFf = false;
    prevSig = 0.0;
    prevVco = 0.0;
    state = 0.5;
  }

  double process(double sig, double vco) {
    const bool rSig = prevSig <= 0.0 && sig > 0.0;
    const bool rVco = prevVco <= 0.0 && vco > 0.0;
    prevSig = sig;
    prevVco = vco;

    if (rSig) sigFf = true;
    if (rVco) vcoFf = true;
    // clear both when both are set (simultaneous → locked)
    if (sigFf && vcoFf) {
      sigFf = false;
      vcoFf = false;
    }

    if (sigFf)       state = 1.0;  // signal leads: speed VCO up
    else if (vcoFf)  state = 0.0;  // VCO leads: slow VCO down
    else             state = 0.5;  // hold (locked or idle)
    return state;
  }
};

// ── Lock detector ──────────────────────────────────────────────────────────
// Measures period of signal and VCO in samples; locked when periods match
// within a tolerance window.

struct LockDetector {
  int sigCount;
  int vcoCount;
  int sigPeriod;
  int vcoPeriod;
  double prevSig;
  double prevVco;
  bool locked;

  void reset() {
    sigCount = 1;
    vcoCount = 1;
    sigPeriod = 0;
    vcoPeriod = 0;
    prevSig = 0.0;
    prevVco = 0.0;
    locked = false;
  }

  void process(double sig, double vco) {
    const bool rSig = prevSig <= 0.0 && sig > 0.0;
    const bool rVco = prevVco <= 0.0 && vco > 0.0;
    prevSig = sig;
    prevVco = vco;

    sigCount++;
    vcoCount++;

    if (rSig && sigCount > 2) {
      sigPeriod = sigCount;
      sigCount = 0;
    }
    if (rVco && vcoCount > 2) {
      vcoPeriod = vcoCount;
      vcoCount = 0;
    }

    if (sigPeriod > 0 && vcoPeriod > 0) {
      const int diff = sigPeriod - vcoPeriod;
      const int absDiff = diff < 0 ? -diff : diff;
      // locked if periods within ~2%
      locked = (absDiff * 50) < sigPeriod;
    } else {
      locked = false;
    }
  }
};

// ── VCO frequency from CV ──────────────────────────────────────────────────
// cv 0..1: Frequency × 2^(Range × (cv − 0.5)), clamped 1 Hz … 0.49×sr.

static double vcoFrequency(double cv, double centerHz, double spanOct, double sr) {
  if (!(centerHz == centerHz)) centerHz = 110.0;
  if (centerHz < 0.0) centerHz = 0.0;
  if (!(spanOct == spanOct) || spanOct < 0.05) spanOct = 0.05;
  if (spanOct > 8.0) spanOct = 8.0;
  const double u = cv < 0.0 ? 0.0 : (cv > 1.0 ? 1.0 : cv);
  double f = centerHz * dsp_exp2(spanOct * (u - 0.5));
  const double ny = (sr > 0.0 ? sr : 44100.0) * 0.49;
  if (f < 0.0) f = 0.0;
  if (f > ny) f = ny;
  return f;
}

// ── PLL state ──────────────────────────────────────────────────────────────

struct PllState {
  bool active;

  // sub-modules (z-state machines; LPF coeffs are flat below)
  Vco vco;
  Pc2 pc2;
  Pc3 pc3;
  LockDetector lockDet;

  // Loop-filter latches (plain fields — stickiness / APP_POLICY)
  double lpfA1;
  double lpfB0;
  double lpfBuf;

  // params
  double sampleRate;
  double vcoHz;      // center frequency
  double spanOct;    // Range, octaves around vcoHz
  int    type;       // 0=XOR 1=RS 2=PFD
  double smoothing;  // loop LPF Hz

  // outputs (written by process, read by getters)
  double vcoOut;
  double pcOut;
  double lpfOut;
  double lockedOut;
  double runningHz;

  void init(double sr) {
    sampleRate = sr > 0.0 ? sr : 44100.0;
    vcoHz = 110.0;
    spanOct = 4.0;
    type = 1;
    smoothing = 10.0;
    vcoOut = 0.0;
    pcOut  = 0.0;
    lpfOut = 0.5;
    lockedOut = 0.0;
    runningHz = 110.0;
    vco.sampleRate = sampleRate;
    vco.reset();
    pc2.reset();
    pc3.reset();
    lockDet.reset();
    one_pole_lp_set(smoothing, sampleRate, lpfA1, lpfB0);
    lpfBuf = 0.5; // start mid-range so VCO begins near centre frequency
  }
};

// ── Instance pool ──────────────────────────────────────────────────────────

static PllState gPool[kMaxInstances];
static bool     gPoolInit = false;

static void ensurePool() {
  if (gPoolInit) return;
  for (int i = 0; i < kMaxInstances; i++) gPool[i].active = false;
  gPoolInit = true;
}

static PllState* get(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  PllState* s = &gPool[handle - 1];
  return s->active ? s : nullptr;
}

} // namespace

// ── Public C API ───────────────────────────────────────────────────────────

extern "C" int soemdsp_pll_version() { return 5; }

extern "C" int soemdsp_pll_create(double sampleRate) {
  ensurePool();
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].init(sampleRate);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pll_destroy(int handle) {
  ensurePool();
  if (handle >= 1 && handle <= kMaxInstances) {
    gPool[handle - 1].active = false;
  }
}

extern "C" void soemdsp_pll_reset(int handle, double sampleRate) {
  PllState* s = get(handle);
  if (!s) return;
  s->init(sampleRate);
}

extern "C" void soemdsp_pll_set_params(
  int    handle,
  double sampleRate,
  double vcoHz,
  double spanOct,
  int    type,
  double smoothing
) {
  PllState* s = get(handle);
  if (!s) return;
  const double sr = sampleRate > 0.0 ? sampleRate : 44100.0;
  s->sampleRate     = sr;
  s->vco.sampleRate = sr;
  s->vcoHz = vcoHz;
  s->spanOct = spanOct;
  s->type = type < 0 ? 0 : (type > 2 ? 2 : type);
  s->smoothing = smoothing < 0.0 ? 0.0 : smoothing;
  one_pole_lp_set(s->smoothing, sr, s->lpfA1, s->lpfB0);
}

// signalIn:    external audio signal to track (PC In 2), audio range -1..+1
// cvIn:        external VCO CV override (0..1); ignored when cvConnected == 0
// cvConnected: 1 if a wire is patched to VCO CV In, 0 for closed-loop (use internal LPF out)
extern "C" void soemdsp_pll_process(
  int    handle,
  double signalIn,
  double cvIn,
  double cvConnected
) {
  PllState* s = get(handle);
  if (!s) return;

  const double sig = pll_finite(signalIn) ? signalIn : 0.0;

  // determine VCO control voltage
  const double cv = cvConnected > 0.5
    ? clamp(pll_finite(cvIn) ? cvIn : 0.0, 0.0, 1.0)
    : clamp(s->lpfOut, 0.0, 1.0);

  // VCO (audio is PolyBLEP; comparators use naive ±1)
  const double freq = vcoFrequency(cv, s->vcoHz, s->spanOct, s->sampleRate);
  s->runningHz = freq;
  s->vcoOut = s->vco.process(freq);

  // phase comparator
  double pc;
  if (s->type == 0) {
    pc = pc1_process(sig, s->vco.out);
  } else if (s->type == 1) {
    pc = s->pc2.process(sig, s->vco.out);
  } else {
    pc = s->pc3.process(sig, s->vco.out);
  }
  s->pcOut = pc;

  // loop filter: smooth PC output → VCO CV for next sample
  s->lpfOut = one_pole_lp_run(s->lpfBuf, s->lpfA1, s->lpfB0, pc);

  // lock detection (meaningful for PC2; show for PC3 as well)
  if (s->type != 0) {
    s->lockDet.process(sig, s->vco.out);
    s->lockedOut = s->lockDet.locked ? 1.0 : 0.0;
  } else {
    s->lockedOut = 0.0;
  }
}

extern "C" double soemdsp_pll_vco_out(int handle) {
  const PllState* s = get(handle);
  return s ? s->vcoOut : 0.0;
}

extern "C" double soemdsp_pll_pc_out(int handle) {
  const PllState* s = get(handle);
  return s ? s->pcOut : 0.0;
}

extern "C" double soemdsp_pll_lpf_out(int handle) {
  const PllState* s = get(handle);
  return s ? s->lpfOut : 0.0;
}

extern "C" double soemdsp_pll_vco_hz(int handle) {
  const PllState* s = get(handle);
  return s ? s->runningHz : 0.0;
}

extern "C" double soemdsp_pll_locked(int handle) {
  const PllState* s = get(handle);
  return s ? s->lockedOut : 0.0;
}
