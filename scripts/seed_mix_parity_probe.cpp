// Probe for scripts/test_seed_mix_parity.mjs: exposes the header-only
// soemdsp::math seed helpers so Node can compare them with SoemMath.
// Built on demand by the test (clang++ --target=wasm32); not a module.
#include <soemdsp/math/seed.h>

extern "C" unsigned int probe_seed_mix(unsigned int seed, unsigned int component, unsigned int index) {
  return soemdsp::math::seed_mix(seed, component, index);
}
extern "C" unsigned int probe_seed_mix2(unsigned int seed, unsigned int component) {
  return soemdsp::math::seed_mix(seed, component);
}
extern "C" unsigned int probe_seed_to_rng_state(unsigned int s) {
  return soemdsp::math::seed_to_rng_state(s);
}
extern "C" unsigned int probe_seed_param_u32(double v) {
  return soemdsp::math::seed_param_u32(v);
}
