// soemdsp-native-module: vibrato_generator
// soemdsp-native-label: Vibrato Generator
// soemdsp-native-target: vibratoGenerator
// soemdsp-native-kind: modulator
//
// Waveform: wavetable sine (dsp_sin_turns_lut) with AM Index on frequency
// (Top Morph) and sine→phase (Side Morph).
// f = Speed * (1 + lastSine * Top Morph).
// Shared vibrato_gen_* header still drives Hypersaw LFOs.
// Depth envelope: no Gate cable → sustain (skip Attack). Gate rise → Delay → Attack to 1; Gate low → Release to 0.
// Delay Mode (stable ids, not choice indexes): 0 start, 1 startEnd, 2 gate. Unknown id -> start.
// start: delay attack unless already releasing; gate-off releases immediately.
// startEnd: start, and also delay gate-off / release.
// gate: delay the whole gate, including gate-off. Attack/Release follow that delayed gate.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;
using namespace soemdsp_vibrato;

static const int kMaxInstances = 64;

struct VibratoModuleState {
  bool active;
  VibratoGenState gen;
  double phaseTurns;
  double lastSine;
  double out;
  double shape;        // y * depthEnv, before Amplitude (display only)
  double lastSeed;
  double depthEnv;     // exponential depth fade 0…1 (standalone module only)
  double delayRemain;  // seconds left in Delay stage (0 = attack/release path)
  double lastGate;     // rising-edge latch for Delay arm
  bool gateWasPresent; // false until a Gate cable is actually plugged
  bool releasing;      // true while Gate is low and depth is still falling
  int delayMode;       // stable id: 0 start, 1 startEnd, 2 gate
  double releaseDelayRemain; // StartEnd: seconds left before release begins
  bool delayedGate;    // Gate: gate level after the edge delay
  int gateEdgeCount;
  double gateEdgeRemain[48];
  unsigned char gateEdgeHigh[48];
};

static VibratoModuleState gPool[kMaxInstances];

static inline unsigned int seed_u(double seedParam) {
  unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
  if (s == 0u) s = 1u;
  return s;
}

static const int kGateEdgeCap = 48;
static const int kDelayModeStart = 0;
static const int kDelayModeStartEnd = 1;
static const int kDelayModeGate = 2;

// Stable id. Not a list index. Anything other than startEnd/gate is Start.
static inline int delay_mode_id(double modeParam) {
  if (!(modeParam == modeParam)) return kDelayModeStart;
  const int id = (int)soemdsp::math::dsp_floor(modeParam + 0.5);
  if (id == kDelayModeStartEnd || id == kDelayModeGate) return id;
  return kDelayModeStart;
}

static inline double finite_delay_seconds(double seconds) {
  const double d = soemdsp::debug::safe(seconds);
  if (!(d > 0.0)) return 0.0;
  return d;
}

// One-pole coeff toward target; seconds<=0 snaps (coeff=1).
static inline double depth_env_coeff(double seconds, double sampleRate) {
  if (!(seconds * 0.0 == 0.0) || seconds <= 0.0) return 1.0;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double samples = soemdsp::math::maxd(1.0, seconds * rate);
  return 1.0 - soemdsp_maths::dsp_exp(-1.0 / samples);
}

static inline void gate_delay_clear(VibratoModuleState& s) {
  s.gateEdgeCount = 0;
  s.delayedGate = false;
}

static inline void gate_delay_push(VibratoModuleState& s, double delaySec, bool high) {
  if (s.gateEdgeCount >= kGateEdgeCap) {
    for (int i = 1; i < s.gateEdgeCount; ++i) {
      s.gateEdgeRemain[i - 1] = s.gateEdgeRemain[i];
      s.gateEdgeHigh[i - 1] = s.gateEdgeHigh[i];
    }
    s.gateEdgeCount -= 1;
  }
  const int n = s.gateEdgeCount;
  s.gateEdgeRemain[n] = finite_delay_seconds(delaySec);
  s.gateEdgeHigh[n] = high ? 1u : 0u;
  s.gateEdgeCount = n + 1;
}

static inline void gate_delay_tick(VibratoModuleState& s, double dt) {
  int w = 0;
  for (int i = 0; i < s.gateEdgeCount; ++i) {
    const double remain = s.gateEdgeRemain[i] - dt;
    if (remain <= 0.0) {
      s.delayedGate = s.gateEdgeHigh[i] != 0u;
    } else {
      s.gateEdgeRemain[w] = remain;
      s.gateEdgeHigh[w] = s.gateEdgeHigh[i];
      w += 1;
    }
  }
  s.gateEdgeCount = w;
}

}  // namespace

extern "C" int soemdsp_vibrato_generator_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      VibratoModuleState& s = gPool[i];
      s = VibratoModuleState{};
      s.active = true;
      vibrato_gen_seed(s.gen, 1u);
      vibrato_gen_reset(s.gen, 0.0);
      s.phaseTurns = 0.0;
      s.lastSine = 0.0;
      s.lastSeed = 1.0;
      s.out = 0.0;
      s.depthEnv = 0.0;   // sustain is applied only when Gate is unplugged
      s.delayRemain = 0.0;
      s.lastGate = 0.0;
      s.gateWasPresent = false;
      s.releasing = false;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_vibrato_generator_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" void soemdsp_vibrato_generator_reset(int handle, double phaseOffset) {
  if (handle < 1 || handle > kMaxInstances) return;
  VibratoModuleState& s = gPool[handle - 1];
  vibrato_gen_reset(s.gen, phaseOffset);
  // Free-running phase only. Heard phase is phaseTurns + phase knob.
  s.phaseTurns = 0.0;
  s.lastSine = 0.0;
  s.out = 0.0;
  s.shape = 0.0;
  // Keep depthEnv / delayRemain — Reset is phase only, not depth envelope.
}

extern "C" double soemdsp_vibrato_generator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  double amplitude,
  double morph,
  double sideMorph,
  double randomFreqMult,
  double randomAmpMult,
  double seedParam,
  double delaySec,
  double attackSec,
  double releaseSec,
  double gate,
  double gatePresent,
  double delayMode
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  VibratoModuleState& s = gPool[handle - 1];
  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  if (!(seedParam == s.lastSeed)) {
    vibrato_gen_seed(s.gen, seed_u(seedParam));
    vibrato_gen_reset(s.gen, phaseOffset);
    s.lastSeed = seedParam;
  }
  // Phase knob is a render offset only, same as PolyBLEP
  // (renderPhase = freePhase + phaseParam). Do not also integrate it into
  // phaseTurns — that doubled the knob vs the breadboard and put Side Morph
  // on the wrong carrier.
  const double rf = safe(randomFreqMult);
  const double ra = safe(randomAmpMult);
  const double speed = safe(frequencyHz) * (1.0 + s.gen.heldFreq * rf);
  const double freq = speed * (1.0 + s.lastSine * safe(morph));
  // Breadboard: Sine -> attenuverter (gain = Side Morph) -> Phase.
  // One-sample delay, absolute cycles, not an increment.
  const double poUsed = safe(phaseOffset) + s.lastSine * safe(sideMorph);
  double inc = hz_to_increment(freq, sr);
  if (inc > 0.5) inc = 0.5;
  if (inc < -0.5) inc = -0.5;
  const double absInc = inc < 0.0 ? -inc : inc;
  double smooth = absInc;
  if (smooth > 1.0) smooth = 1.0;
  s.gen.heldFreq += (s.gen.targetFreq - s.gen.heldFreq) * smooth;
  s.gen.heldAmp += (s.gen.targetAmp - s.gen.heldAmp) * smooth;
  s.gen.phase += absInc;
  if (s.gen.phase >= 1.0) {
    s.gen.phase = wrap01(s.gen.phase);
    vibrato_gen_trigger_hold(s.gen);
  }
  double y = dsp_sin_turns_lut(s.phaseTurns + poUsed);
  s.lastSine = y;
  s.phaseTurns = wrap01(s.phaseTurns + inc);
  y *= (1.0 + s.gen.heldAmp * ra);

  // Depth envelope. No Gate cable: sustain immediately (do not run Attack).
  // gatePresent is the host cable check (mix_live_port on the Gate inlet), not the gate level.
  // Delay Mode ids are stable (start / startEnd / gate), not choice-list indexes.
  const bool cable = gatePresent > 0.5;
  const int mode = delay_mode_id(delayMode);
  const double dt = 1.0 / sr;
  if (!cable) {
    s.depthEnv = 1.0;
    s.delayRemain = 0.0;
    s.releaseDelayRemain = 0.0;
    s.lastGate = 0.0;
    s.gateWasPresent = false;
    s.releasing = false;
    s.delayMode = mode;
    gate_delay_clear(s);
  } else {
    if (!s.gateWasPresent) {
      // Cable just appeared (including the first block). Do not inherit the unpatched sustain skip.
      s.depthEnv = 0.0;
      s.delayRemain = 0.0;
      s.releaseDelayRemain = 0.0;
      s.lastGate = 0.0;
      s.gateWasPresent = true;
      s.releasing = false;
      gate_delay_clear(s);
    }
    if (mode != s.delayMode) {
      s.delayMode = mode;
      s.delayRemain = 0.0;
      s.releaseDelayRemain = 0.0;
      s.lastGate = 0.0;
      gate_delay_clear(s);
    }
    const bool rawHigh = gate > 0.5;
    const bool wasHigh = s.lastGate > 0.5;
    const bool rawRising = rawHigh && !wasHigh;
    const bool rawFalling = !rawHigh && wasHigh;
    s.lastGate = gate;

    bool envHigh = rawHigh;
    bool envRising = rawRising;
    bool envFalling = rawFalling;
    if (mode == kDelayModeGate) {
      if (rawRising) gate_delay_push(s, delaySec, true);
      if (rawFalling) gate_delay_push(s, delaySec, false);
      const bool prevDelayed = s.delayedGate;
      gate_delay_tick(s, dt);
      envHigh = s.delayedGate;
      envRising = envHigh && !prevDelayed;
      envFalling = !envHigh && prevDelayed;
      s.delayRemain = 0.0;
      s.releaseDelayRemain = 0.0;
    }

    if (!envHigh) {
      s.delayRemain = 0.0;
      if (mode == kDelayModeStartEnd && envFalling) {
        s.releaseDelayRemain = finite_delay_seconds(delaySec);
      }
      if (mode == kDelayModeStartEnd && s.releaseDelayRemain > 0.0) {
        s.releaseDelayRemain -= dt;
        if (s.releaseDelayRemain < 0.0) s.releaseDelayRemain = 0.0;
        // Hold depth until the delayed gate-off. Not release mode yet.
      }
      if (!(mode == kDelayModeStartEnd && s.releaseDelayRemain > 0.0)) {
        s.releaseDelayRemain = 0.0;
        const double coeff = depth_env_coeff(releaseSec, sr);
        s.depthEnv += (0.0 - s.depthEnv) * coeff;
        // Release stage only while depth is still falling. Snap-to-zero ends it
        // so the next gate from silence delays again (Start / StartEnd).
        if (s.depthEnv <= 1.0e-5) {
          s.depthEnv = 0.0;
          s.releasing = false;
        } else {
          s.releasing = true;
        }
      }
    } else {
      s.releaseDelayRemain = 0.0;
      if (envRising) {
        // Start and StartEnd: skip the attack delay when already releasing.
        // Gate already delayed the rising edge, so attack starts now.
        const bool skipDelay = mode != kDelayModeGate && s.releasing;
        s.releasing = false;
        if (mode == kDelayModeGate || skipDelay) {
          s.delayRemain = 0.0;
        } else {
          s.delayRemain = finite_delay_seconds(delaySec);
        }
      }
      if (s.delayRemain > 0.0) {
        s.delayRemain -= dt;
        if (s.delayRemain < 0.0) s.delayRemain = 0.0;
        // Hold depthEnv during Delay (no Attack yet).
      } else {
        const double coeff = depth_env_coeff(attackSec, sr);
        s.depthEnv += (1.0 - s.depthEnv) * coeff;
      }
    }
  }
  s.depthEnv = soemdsp::math::clamp01(s.depthEnv);

  const double amp = safe(amplitude);
  // shape is the vibrato before the Amplitude knob. Wave/audio stays shape * amp.
  s.shape = y * s.depthEnv;
  s.out = s.shape * amp;
  return s.out;
}

extern "C" double soemdsp_vibrato_generator_shape(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].shape;
}

extern "C" double soemdsp_vibrato_generator_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" int soemdsp_vibrato_generator_version() {
  return 10;
}
