// soemdsp-native-module: vibrato_generator
// soemdsp-native-label: Vibrato Generator
// soemdsp-native-target: vibratoGenerator
// soemdsp-native-kind: modulator
// soemdsp-native-lib: https://github.com/soundemote/soemdsp/blob/main/include/soemdsp/modulator/VibratoGenerator.hpp
//
// Waveform: wavetable sine (dsp_sin_turns_lut) with AM Index on frequency
// (Top Morph) and sine→phase (Side Morph).
// f = Speed * (1 + lastSine * Top Morph).
// Shared vibrato_gen_* header still drives Hypersaw LFOs.
// Depth envelope: no Gate cable → sustain (skip Attack).
// Start Delay holds gate-on; End Delay holds gate-off. Attack/Release follow that delayed gate.
// Attack Shape / Release Shape stable ids (not choice indexes): 0 log, 1 lin, 2 exp. Unknown -> exp.
// isIdle OUT: 1 only when this depth envelope has finished (at rest at 0). Not Planck.

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
  double lastGate;     // raw gate latch
  bool gateWasPresent; // false until a Gate cable is actually plugged
  bool releasing;      // true while delayed gate is low and depth is still falling
  double releaseElapsed;
  double releaseStartEnv;
  double attackElapsed;
  double attackStartEnv;
  bool attacking;
  int attackShapeLatched;
  bool envelopeIdle;
  bool delayedGate;    // gate after Start/End Delay
  double startRemain;  // seconds until delayed gate-on
  double endRemain;    // seconds until delayed gate-off
};

static VibratoModuleState gPool[kMaxInstances];

static inline unsigned int seed_u(double seedParam) {
  unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
  if (s == 0u) s = 1u;
  return s;
}

static const int kReleaseShapeLog = 0;
static const int kReleaseShapeLin = 1;
static const int kReleaseShapeExp = 2;

// Log / Lin / Exp. Same ids for Attack Shape and Release Shape.
static inline int curve_shape_id(double shapeParam) {
  if (!(shapeParam == shapeParam)) return kReleaseShapeExp;
  const int id = (int)soemdsp::math::dsp_floor(shapeParam + 0.5);
  if (id == kReleaseShapeLog || id == kReleaseShapeLin) return id;
  return kReleaseShapeExp;
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
      s.lastGate = 0.0;
      s.gateWasPresent = false;
      s.releasing = false;
      s.releaseElapsed = 0.0;
      s.releaseStartEnv = 0.0;
      s.delayedGate = false;
      s.startRemain = 0.0;
      s.endRemain = 0.0;
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
  // Keep depthEnv — Reset is phase only, not depth envelope.
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
  double releaseShape,
  double attackShape,
  double endDelaySec,
  double gate,
  double gatePresent
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
  // Start Delay / End Delay postpone gate-on and gate-off. Attack/Release follow that.
  const bool cable = gatePresent > 0.5;
  const double dt = 1.0 / sr;
  if (!cable) {
    s.depthEnv = 1.0;
    s.lastGate = 0.0;
    s.gateWasPresent = false;
    s.releasing = false;
    s.attacking = false;
    s.envelopeIdle = false;
    s.delayedGate = false;
    s.startRemain = 0.0;
    s.endRemain = 0.0;
  } else {
    if (!s.gateWasPresent) {
      s.depthEnv = 0.0;
      s.lastGate = 0.0;
      s.gateWasPresent = true;
      s.releasing = false;
      s.attacking = false;
      s.envelopeIdle = false;
      s.delayedGate = false;
      s.startRemain = 0.0;
      s.endRemain = 0.0;
    }
    const bool rawHigh = gate > 0.5;
    const bool wasHigh = s.lastGate > 0.5;
    const bool rawRising = rawHigh && !wasHigh;
    const bool rawFalling = !rawHigh && wasHigh;
    s.lastGate = gate;
    if (rawRising) {
      s.endRemain = 0.0;
      s.startRemain = finite_delay_seconds(delaySec);
      if (!(s.startRemain > 0.0)) s.delayedGate = true;
    }
    if (rawFalling) {
      s.startRemain = 0.0;
      s.endRemain = finite_delay_seconds(endDelaySec);
      if (!(s.endRemain > 0.0)) s.delayedGate = false;
    }
    if (s.startRemain > 0.0) {
      s.startRemain -= dt;
      if (s.startRemain <= 0.0) {
        s.startRemain = 0.0;
        s.delayedGate = true;
      }
    }
    if (s.endRemain > 0.0) {
      s.endRemain -= dt;
      if (s.endRemain <= 0.0) {
        s.endRemain = 0.0;
        s.delayedGate = false;
      }
    }
    const bool envHigh = s.delayedGate;

    if (!envHigh) {
      if (!s.releasing) {
        s.releaseElapsed = 0.0;
        s.releaseStartEnv = soemdsp::math::clamp01(s.depthEnv);
      }
      s.attacking = false;
      s.releaseElapsed += dt;
      const int shapeId = curve_shape_id(releaseShape);
      if (shapeId == kReleaseShapeExp) {
        const double coeff = depth_env_coeff(releaseSec, sr);
        s.depthEnv += (0.0 - s.depthEnv) * coeff;
      } else {
        const double duration = finite_delay_seconds(releaseSec);
        if (!(duration > 0.0)) {
          s.depthEnv = 0.0;
        } else {
          const double t = soemdsp::math::clamp01(s.releaseElapsed / duration);
          const double progress = shapeId == kReleaseShapeLog
            ? soemdsp::math::expo_skew01(t, -0.99)
            : t;
          s.depthEnv = s.releaseStartEnv * (1.0 - progress);
        }
      }
      if (s.depthEnv <= 1.0e-5) {
        s.depthEnv = 0.0;
        s.releasing = false;
      } else {
        s.releasing = true;
      }
    } else {
      s.releasing = false;
      const int atkShape = curve_shape_id(attackShape);
      if (!s.attacking || atkShape != s.attackShapeLatched) {
        s.attacking = true;
        s.attackShapeLatched = atkShape;
        s.attackElapsed = 0.0;
        s.attackStartEnv = soemdsp::math::clamp01(s.depthEnv);
      }
      s.attackElapsed += dt;
      if (atkShape == kReleaseShapeExp) {
        const double coeff = depth_env_coeff(attackSec, sr);
        s.depthEnv += (1.0 - s.depthEnv) * coeff;
      } else {
        const double duration = finite_delay_seconds(attackSec);
        if (!(duration > 0.0)) {
          s.depthEnv = 1.0;
        } else {
          const double u = soemdsp::math::clamp01(s.attackElapsed / duration);
          const double progress = atkShape == kReleaseShapeLog
            ? soemdsp::math::expo_skew01(u, -0.99)
            : u;
          const double start = s.attackStartEnv;
          s.depthEnv = start + (1.0 - start) * progress;
        }
      }
    }
    s.envelopeIdle = !envHigh
      && !(s.startRemain > 0.0)
      && !(s.endRemain > 0.0)
      && !s.releasing
      && !(s.depthEnv > 0.0);
  }
  s.depthEnv = soemdsp::math::clamp01(s.depthEnv);
  if (s.envelopeIdle && s.depthEnv > 0.0) s.envelopeIdle = false;

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

extern "C" int soemdsp_vibrato_generator_is_idle(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0;
  VibratoModuleState& s = gPool[handle - 1];
  if (!s.active) return 0;
  return s.envelopeIdle ? 1 : 0;
}

extern "C" int soemdsp_vibrato_generator_version() {
  return 13;
}
