// Port side of scripts/parity_robin_sinepulse_allpass.cpp: compiles
// native_modules/robin_sinepulse_allpass/robin_sinepulse_allpass.cpp unchanged
// in its own translation unit (the sandbox maths and Robin's RAPT stub both
// define helpers with the same names) and exposes test-only probes.
#include "../native_modules/robin_sinepulse_allpass/robin_sinepulse_allpass.cpp"

extern "C" double sinepulse_allpass_probe_coeff(int handle, int stage, int which) {
  if (handle < 1 || handle > kMaxInstances || stage < 0 || stage >= kMaxStages) return 0.0;
  const State& s = gPool[handle - 1];
  return which == 0 ? s.b0[stage] : (which == 1 ? s.b1[stage] : s.b2[stage]);
}

extern "C" double sinepulse_allpass_probe_state_y1(int handle, int stage) {
  if (handle < 1 || handle > kMaxInstances || stage < 0 || stage >= kMaxStages) return 0.0;
  return gPool[handle - 1].y1[stage];
}
