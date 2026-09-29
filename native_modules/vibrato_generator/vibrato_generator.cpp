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
// Delay Trigger: Delay Start skips Delay during release; Delay All delays every gate rise.

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
};

static VibratoModuleState gPool[kMaxInstances];

static inline unsigned int seed_u(double seedParam) {
  unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
  if (s == 0u) s = 1u;
  return s;
}

// One-pole coeff toward target; seconds<=0 snaps (coeff=1).
static inline double depth_env_coeff(double seconds, double sampleRate) {
  if (!(seconds * 0.0 == 0.0) || seconds <= 0.0) return 1.0;
  const double rate = sampleRate < 1.0 ? 1.0 : sampleRate;
  const double samples = maxd(1.0, seconds * rate);
  return 1.0 - dsp_exp(-1.0 / samples);
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
  double delayTriggerMode
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

  // Depth envelope: Gate rise → wait Delay → Attack to 1; Gate low → Release to 0.
  // No Gate cable: skip to sustain immediately. Do not run Attack.
  // gatePresent is the host cable check (mix_live_port on the Gate inlet), not the gate level.
  const bool cable = gatePresent > 0.5;
  // delayTriggerMode < 0.5: Delay Start (default). >= 0.5: Delay All.
  const bool delayAll = delayTriggerMode >= 0.5;
  if (!cable) {
    s.depthEnv = 1.0;
    s.delayRemain = 0.0;
    s.lastGate = 0.0;
    s.gateWasPresent = false;
    s.releasing = false;
  } else {
    if (!s.gateWasPresent) {
      // Cable just appeared (including the first block). Do not inherit the unpatched sustain skip.
      s.depthEnv = 0.0;
      s.delayRemain = 0.0;
      s.lastGate = 0.0;
      s.gateWasPresent = true;
      s.releasing = false;
    }
    const bool gateHigh = gate > 0.5;
    const bool rising = gateHigh && !(s.lastGate > 0.5);
    s.lastGate = gate;
    if (!gateHigh) {
      s.delayRemain = 0.0;
      const double coeff = depth_env_coeff(releaseSec, sr);
      s.depthEnv += (0.0 - s.depthEnv) * coeff;
      // Release stage only while depth is still falling. Snap-to-zero ends it
      // so the next gate from silence delays again (Delay Start).
      if (s.depthEnv <= 1.0e-5) {
        s.depthEnv = 0.0;
        s.releasing = false;
      } else {
        s.releasing = true;
      }
    } else {
      if (rising) {
        // Delay Start skips Delay when a gate arrives during release.
        const bool skipDelay = !delayAll && s.releasing;
        s.releasing = false;
        if (skipDelay) {
          s.delayRemain = 0.0;
        } else {
          const double d = safe(delaySec);
          s.delayRemain = (d > 0.0 && (d * 0.0 == 0.0)) ? d : 0.0;
        }
      }
      if (s.delayRemain > 0.0) {
        s.delayRemain -= 1.0 / sr;
        if (s.delayRemain < 0.0) s.delayRemain = 0.0;
        // Hold depthEnv during Delay (no Attack yet).
      } else {
        const double coeff = depth_env_coeff(attackSec, sr);
        s.depthEnv += (1.0 - s.depthEnv) * coeff;
      }
    }
  }
  if (s.depthEnv < 0.0) s.depthEnv = 0.0;
  if (s.depthEnv > 1.0) s.depthEnv = 1.0;

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
  return 9;
}
