// soemdsp-native-module: note_transpose
// soemdsp-native-label: Note Transpose
// soemdsp-native-target: noteTranspose
// soemdsp-native-kind: pitch
//
// Stateless 0.1V/Oct offset: midiOut = midiIn + semis + oct*12.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;

struct State {
  bool active;
};

static State gPool[kMaxInstances];

}  // namespace

extern "C" int soemdsp_note_transpose_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_note_transpose_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_note_transpose_sample(
  int handle,
  double pitch,
  double semitones,
  double octaves
) {
  (void)handle;
  const double midi =
    musical_midi_from_pitch(pitch) + safe(semitones) + safe(octaves) * 12.0;
  return musical_pitch_from_midi(midi);
}

extern "C" int soemdsp_note_transpose_version() {
  return 1;
}
