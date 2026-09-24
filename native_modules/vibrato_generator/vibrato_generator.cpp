// soemdsp-native-module: vibrato_generator
// soemdsp-native-label: Vibrato Generator
// soemdsp-native-target: vibratoGenerator
// soemdsp-native-kind: modulator
//
// Standalone port of soemdsp::modulator::VibratoGenerator.
// Oscillator: cheap sine wavetable (dsp_sin_turns_lut). Shared header also
// drives Hypersaw per-saw vibrato LFOs.
// Depth envelope (attack/release) lives only on this module path so the
// shared vibrato_gen_sample() API stays unchanged for Hypersaw.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;
using namespace soemdsp_vibrato;

static const int kMaxInstances = 64;

struct VibratoModuleState {
  bool active;
  VibratoGenState gen;
  double out;
  double lastSeed;
  double depthEnv;  // exponential depth fade 0…1 (standalone module only)
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
      s.lastSeed = 1.0;
      s.out = 0.0;
      s.depthEnv = 1.0;  // unpatched Gate = full depth
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
  s.out = 0.0;
  // Keep depthEnv — Reset is phase only, not depth envelope.
}

extern "C" double soemdsp_vibrato_generator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  double amplitude,
  double morph,
  double randomFreqMult,
  double randomAmpMult,
  double seedParam,
  double attackSec,
  double releaseSec,
  double gate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  VibratoModuleState& s = gPool[handle - 1];
  const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
  if (!(seedParam == s.lastSeed)) {
    vibrato_gen_seed(s.gen, seed_u(seedParam));
    vibrato_gen_reset(s.gen, phaseOffset);
    s.lastSeed = seedParam;
  }
  const double inc = hz_to_increment(frequencyHz, sr);
  const double y = vibrato_gen_sample(
    s.gen, inc, phaseOffset, morph, randomFreqMult, randomAmpMult
  );

  // Exponential depth envelope: Gate high → attack to 1, low → release to 0.
  // Host passes gate=1 when Gate is unpatched (always-on / full depth).
  const double target = (gate > 0.5) ? 1.0 : 0.0;
  const double tau = (target > 0.5) ? attackSec : releaseSec;
  const double coeff = depth_env_coeff(tau, sr);
  s.depthEnv += (target - s.depthEnv) * coeff;
  if (s.depthEnv < 0.0) s.depthEnv = 0.0;
  if (s.depthEnv > 1.0) s.depthEnv = 1.0;

  const double amp = safe(amplitude);
  s.out = y * amp * s.depthEnv;
  return s.out;
}

extern "C" double soemdsp_vibrato_generator_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" int soemdsp_vibrato_generator_version() {
  return 2;
}