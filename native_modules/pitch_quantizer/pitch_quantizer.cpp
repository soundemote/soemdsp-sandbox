// soemdsp-native-module: pitch_quantizer
// soemdsp-native-label: Pitch Quantizer
// soemdsp-native-target: pitchQuantizer
// soemdsp-native-kind: pitch

namespace {

static const int kMaxInstances = 32;

struct PitchQuantizerState {
  bool active;
  bool hasOutput;
  double lastOutput;
};

static PitchQuantizerState gPool[kMaxInstances];

// pitch is MIDI note (♯/♭ cable). scaleMask
// is a 12-bit mask, bit i set means pitch class i (0=C, 1=C#, ... 11=B) is a
// member of the current scale. mask == 0 means "no notes held" -- holds the
// last quantized output rather than snapping to anything, matching how
// hardware quantizers behave when their scale input goes empty.
double quantizePitch(PitchQuantizerState& state, double pitch, int scaleMask) {
  const int mask = scaleMask & 0xFFF;
  if (mask == 0) {
    return state.hasOutput ? state.lastOutput : pitch;
  }

  const double semitoneFloat = pitch;
  double rounded = semitoneFloat < 0.0 ? semitoneFloat - 0.5 : semitoneFloat + 0.5;
  int rounded_int = (int)rounded;
  // Truncation toward zero after the +/-0.5 bias above gives round-half-away-
  // from-zero, matching the pitch's real sign rather than always rounding up.

  int bestSemitone = rounded_int;
  double bestDistance = 1.0e18;
  bool found = false;
  for (int radius = 0; radius <= 12; radius++) {
    for (int sign = -1; sign <= 1; sign += 2) {
      if (radius == 0 && sign > 0) {
        continue;
      }
      const int candidate = rounded_int + sign * radius;
      const int pitchClass = ((candidate % 12) + 12) % 12;
      if (((mask >> pitchClass) & 1) == 0) {
        continue;
      }
      const double distance = candidate - semitoneFloat;
      const double absDistance = distance < 0.0 ? -distance : distance;
      if (!found || absDistance < bestDistance) {
        found = true;
        bestDistance = absDistance;
        bestSemitone = candidate;
      }
    }
    if (found) {
      break;
    }
  }

  const double output = found ? bestSemitone : pitch;
  state.hasOutput = true;
  state.lastOutput = output;
  return output;
}

}  // namespace

extern "C" int soemdsp_pitch_quantizer_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i] = PitchQuantizerState{};
      gPool[i].active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_pitch_quantizer_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_pitch_quantizer_sample(int handle, double pitch, int scaleMask) {
  if (handle < 1 || handle > kMaxInstances) return pitch;
  return quantizePitch(gPool[handle - 1], pitch, scaleMask);
}

extern "C" int soemdsp_pitch_quantizer_version() {
  return 1;
}
