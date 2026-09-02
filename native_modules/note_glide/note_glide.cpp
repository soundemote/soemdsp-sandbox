// soemdsp-native-module: note_glide
// soemdsp-native-label: Note Glide
// soemdsp-native-target: noteGlide
// soemdsp-native-kind: pitch
//
// One-pole portamento on 0.1V/Oct. Port of nodeGraphNoteGlideSample.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  bool active;
  bool hasCurrent;
  double current;
};

static State gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_note_glide_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].hasCurrent = false;
      gPool[i].current = 0.0;
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_note_glide_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_note_glide_sample(
  int handle,
  double pitch,
  double timeSeconds,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return safe(pitch);
  State& s = gPool[handle - 1];
  const double target = safe(pitch);
  const double time = safe(timeSeconds);
  const double sr = sampleRate < 1.0 ? 44100.0 : sampleRate;

  if (!s.hasCurrent) {
    s.hasCurrent = true;
    s.current = target;
    return target;
  }
  if (!(time > 1.0e-6)) {
    s.current = target;
    return target;
  }
  const double coeff = one_pole_coeff(time, sr);
  s.current = one_pole_step(s.current, target, coeff);
  return s.current;
}

extern "C" int soemdsp_note_glide_version() {
  return 1;
}
