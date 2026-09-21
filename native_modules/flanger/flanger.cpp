// soemdsp-native-module: flanger
// soemdsp-native-label: Flanger
// soemdsp-native-target: flanger
// soemdsp-native-kind: effect
//
// Short interpolating delay + dry mix + LFO on delay time + feedback.
// Comb notches at n/delay. Reset zeros LFO only.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

static const int kMaxInstances = 64;
// 0.25 s @ 192 kHz — flanger range with headroom if Time/Depth are large.
static const int kMaxDelaySamples = 48000;

struct FlangerState {
  bool active;
  float buffer[kMaxDelaySamples];
  int writeIndex;
  double lfoPhase;
  double lastReset;
  double lastWet;
};

static FlangerState gPool[kMaxInstances];

static const char kMetadataJson[] =
  "{"
    "\"module\":\"flanger\","
    "\"label\":\"Flanger\","
    "\"targetType\":\"flanger\","
    "\"kind\":\"effect\""
  "}";

static void clear_buffer(FlangerState& s) {
  for (int i = 0; i < kMaxDelaySamples; i += 1) {
    s.buffer[i] = 0.0f;
  }
  s.writeIndex = 0;
  s.lastWet = 0.0;
}

}  // namespace

extern "C" int soemdsp_flanger_create() {
  for (int i = 0; i < kMaxInstances; i += 1) {
    if (!gPool[i].active) {
      FlangerState& s = gPool[i];
      clear_buffer(s);
      s.lfoPhase = 0.0;
      s.lastReset = 0.0;
      s.active = true;
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_flanger_destroy(int handle) {
  if (handle < 1 || handle > kMaxInstances) return;
  gPool[handle - 1].active = false;
}

extern "C" double soemdsp_flanger_sample(
  int handle,
  double input,
  double timeSeconds,
  double depthSeconds,
  double stereoSeconds,
  double rateHz,
  double feedback,
  double mix,
  double amplitude,
  double reset,
  double sampleRate
) {
  if (handle < 1 || handle > kMaxInstances) return 0.0;
  FlangerState& st = gPool[handle - 1];
  if (!st.active) return 0.0;

  const double x = safe(input);
  double rate = safe(sampleRate);
  if (!(rate > 1.0)) rate = 44100.0;
  const double resetV = safe(reset);
  if (resetV > 0.5 && st.lastReset <= 0.5) {
    st.lfoPhase = 0.0;
  }
  st.lastReset = resetV;

  const double lfoHz = safe(rateHz);
  st.lfoPhase += lfoHz / rate;
  if (st.lfoPhase >= 1.0) st.lfoPhase -= (double)((int)st.lfoPhase);
  if (st.lfoPhase < 0.0) st.lfoPhase = 0.0;
  double sLfo = 0.0, cLfo = 0.0;
  dsp_sin_cos(kTwoPi * st.lfoPhase, &sLfo, &cLfo);

  double delaySec = safe(timeSeconds) + safe(depthSeconds) * sLfo + safe(stereoSeconds);
  if (!(delaySec > 0.0)) delaySec = 0.0;
  double delaySamples = delaySec * rate;
  const double maxDelay = (double)(kMaxDelaySamples - 2);
  if (delaySamples > maxDelay) delaySamples = maxDelay;

  const double write = x + safe(feedback) * st.lastWet;
  st.buffer[st.writeIndex] = (float)write;
  int w = st.writeIndex;
  st.writeIndex += 1;
  if (st.writeIndex >= kMaxDelaySamples) st.writeIndex = 0;

  double readPos = (double)w - delaySamples;
  while (readPos < 0.0) readPos += (double)kMaxDelaySamples;
  const int i0 = (int)readPos;
  const int i1 = i0 + 1 >= kMaxDelaySamples ? 0 : i0 + 1;
  const double frac = readPos - (double)i0;
  const double delayed = (double)st.buffer[i0] * (1.0 - frac) + (double)st.buffer[i1] * frac;
  st.lastWet = delayed;
  const double out = (1.0 - safe(mix)) * x + safe(mix) * delayed;
  return out * safe(amplitude);
}

extern "C" int soemdsp_flanger_version() {
  return 1;
}

extern "C" const char* soemdsp_flanger_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_flanger_metadata_json_size() {
  return (int)(sizeof(kMetadataJson) - 1);
}
