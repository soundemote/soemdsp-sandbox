// soemdsp-native-module: vibrato_generator
// soemdsp-native-label: Vibrato Generator
// soemdsp-native-target: vibratoGenerator
// soemdsp-native-kind: modulator
//
// Standalone port of soemdsp::modulator::VibratoGenerator.
// Oscillator: cheap sine wavetable (dsp_sin_turns_lut). Shared header also
// drives Hypersaw per-saw vibrato LFOs.

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
};

static VibratoModuleState gPool[kMaxInstances];

static inline unsigned int seed_u(double seedParam) {
  unsigned int s = (unsigned int)(seedParam < 1.0 ? 1.0 : seedParam);
  if (s == 0u) s = 1u;
  return s;
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
  double seedParam
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
  const double amp = safe(amplitude);
  s.out = y * amp;
  return s.out;
}

extern "C" double soemdsp_vibrato_generator_out(int handle) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  return gPool[handle - 1].out;
}

extern "C" int soemdsp_vibrato_generator_version() {
  return 1;
}
