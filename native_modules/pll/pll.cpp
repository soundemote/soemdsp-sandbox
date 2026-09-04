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
// Linear phase accumulator → 50% duty-cycle square wave output (-1 or +1)

struct Vco {
  double phase;
  double sampleRate;
  double out;
  double prevOut;

  void reset() {
    phase = 0.0;
    out = -1.0;
    prevOut = -1.0;
  }

  double process(double freq) {
    prevOut = out;
    const double inc = freq / sampleRate;
    phase += inc;
    while (phase >= 1.0) phase -= 1.0;
    while (phase < 0.0)  phase += 1.0;
    out = phase < 0.5 ? 1.0 : -1.0;
    return out;
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
// cv: 0..1 → freqMin..freqMax (linear)
// freqMax = baseMax * 20^(offset/10)  [matches A-196 spec table]
//   at offset=0: ×1, offset=5: ×4.47, offset=10: ×20

static double vcoFrequency(double cv, int range, double offset) {
  double freqMin, baseMax;
  if (range == 0) {         // low
    freqMin = 2.0;
    baseMax = 50.0;
  } else if (range == 2) {  // high
    freqMin = 100.0;
    baseMax = 5000.0;
  } else {                  // mid (default)
    freqMin = 20.0;
    baseMax = 500.0;
  }
  // 20^(offset/10) = exp(offset * ln(20)/10) = exp(offset * 0.29957…)
  const double scale  = pll_exp(offset * 0.29957322735539909);
  const double freqMax = baseMax * scale;
  const double clampedCv = cv < 0.0 ? 0.0 : (cv > 1.0 ? 1.0 : cv);
  return freqMin + (freqMax - freqMin) * clampedCv;
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
  int    range;   // 0=low 1=mid 2=high
  double offset;  // 0..10
  int    type;    // 0=PC1 1=PC2 2=PC3
  double frequ;   // LPF cutoff Hz

  // outputs (written by process, read by getters)
  double vcoOut;
  double pcOut;
  double lpfOut;
  double lockedOut;

  void init(double sr) {
    sampleRate = sr > 0.0 ? sr : 44100.0;
    range  = 1;
    offset = 5.0;
    type   = 1;
    frequ  = 10.0;
    vcoOut = 0.0;
    pcOut  = 0.0;
    lpfOut = 0.5;
    lockedOut = 0.0;
    vco.sampleRate = sampleRate;
    vco.reset();
    pc2.reset();
    pc3.reset();
    lockDet.reset();
    one_pole_lp_set(frequ, sampleRate, lpfA1, lpfB0);
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

extern "C" int soemdsp_pll_version() { return 2; }

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
  int    range,
  double offset,
  int    type,
  double frequ
) {
  PllState* s = get(handle);
  if (!s) return;
  const double sr = sampleRate > 0.0 ? sampleRate : 44100.0;
  s->sampleRate     = sr;
  s->vco.sampleRate = sr;
  s->range  = range  < 0 ? 0 : (range  > 2  ? 2  : range);
  s->offset = offset < 0.0 ? 0.0 : (offset > 10.0 ? 10.0 : offset);
  s->type   = type   < 0 ? 0 : (type   > 2  ? 2  : type);
  s->frequ = frequ < 0.0 ? 0.0 : frequ;
  one_pole_lp_set(s->frequ, sr, s->lpfA1, s->lpfB0);
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

  // VCO
  const double freq = vcoFrequency(cv, s->range, s->offset);
  s->vcoOut = s->vco.process(freq);

  // phase comparator
  double pc;
  if (s->type == 0) {
    pc = pc1_process(sig, s->vcoOut);
  } else if (s->type == 1) {
    pc = s->pc2.process(sig, s->vcoOut);
  } else {
    pc = s->pc3.process(sig, s->vcoOut);
  }
  s->pcOut = pc;

  // loop filter: smooth PC output → VCO CV for next sample
  s->lpfOut = one_pole_lp_run(s->lpfBuf, s->lpfA1, s->lpfB0, pc);

  // lock detection (meaningful for PC2; show for PC3 as well)
  if (s->type != 0) {
    s->lockDet.process(sig, s->vcoOut);
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

extern "C" double soemdsp_pll_locked(int handle) {
  const PllState* s = get(handle);
  return s ? s->lockedOut : 0.0;
}
