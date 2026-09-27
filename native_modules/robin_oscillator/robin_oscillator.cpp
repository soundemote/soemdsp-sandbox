// soemdsp-native-module: robin_oscillator
// soemdsp-native-label: RobinOscillator
// soemdsp-native-target: robinOscillator
// soemdsp-native-kind: oscillator
//
// Robin Schmidt / RS-MET cycle-length dither AA (same idea as Robin Supersaw
// voices) plus Architect-approved mid-cycle frequency warp: when Hz changes
// inside a cycle, retarget the remaining samples so phase stays continuous
// and there is still exactly one wrap. Dither re-roll only at wrap.

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 32;
constexpr int kMaxBlockFrames = 2048;

// Waveform choice indices (shop list).
constexpr int kWaveSaw = 0;
constexpr int kWaveRamp = 1;
constexpr int kWaveSquare = 2;
constexpr int kWaveTriangle = 3;
constexpr int kWaveSine = 4;
constexpr int kWavePulse = 5;
constexpr int kWaveCount = 6;

static const char kMetadataJson[] =
  "{"
    "\"module\":\"robin_oscillator\","
    "\"label\":\"RobinOscillator\","
    "\"targetType\":\"robinOscillator\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Wave\"],"
    "\"parameters\":["
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"max\":5,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"defaultValue\":100,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"phase\",\"label\":\"Start Phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"pulseWidth\",\"label\":\"Pulse Width\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01}"
    "]"
  "}";

unsigned int xorshift32(unsigned int& state) {
  unsigned int x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  state = x;
  return x;
}

double randomUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0);
}

double floorD(double value) {
  return __builtin_floor(value);
}

void calcCycleDistribution(double c, double* lenMid, double* probShort, double* probMid) {
  const double ci = floorD(c);
  const double cf = c - ci;
  double c2 = ci;
  if (cf >= 0.5) c2 += 1.0;
  const double c1 = c2 - 1.0;
  const double c3 = c2 + 1.0;

  const double e1 = c1 - c;
  const double e2 = c2 - c;
  const double e3 = c3 - c;
  const double v1 = e1 * e1;
  const double v2 = e2 * e2;
  const double v3 = e3 * e3;
  const double v = 0.25;
  const double d1 = v - v1;
  const double d2 = v - v2;
  const double d3 = v - v3;
  const double s = 1.0 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));

  *lenMid = c2;
  *probShort = (d2 * e3 - d3 * e2) * s;
  *probMid = (d3 * e1 - d1 * e3) * s;
}

struct RobinOscState {
  bool active;
  bool primed;
  double sampleCount;
  double lenNow;
  double lenMid;
  double probShort;
  double probMid;
  double phaseSlope;
  double phase; // absolute [0,1) — kept continuous across mid-cycle warp
  double currentHz;
  double sampleRateHz;
  double hzCeiling;
  unsigned int rngState;
  double blockOut[kMaxBlockFrames];
};

RobinOscState gPool[kMaxInstances];

bool finiteValue(double value) {
  return value == value && value > -1.0e12 && value < 1.0e12;
}

double clampHz(double hz, double hzCeiling) {
  double f = finiteValue(hz) ? hz : 0.0;
  if (f < 0.0) f = -f;
  const double ceil = (hzCeiling > 1.0) ? hzCeiling : 20000.0;
  if (f > ceil) f = ceil;
  return f;
}

void updateCycleLength(RobinOscState& v) {
  const double r = randomUnit(v.rngState);
  if (r < v.probShort) {
    v.lenNow = v.lenMid - 1.0;
  } else if (r < v.probShort + v.probMid) {
    v.lenNow = v.lenMid;
  } else {
    v.lenNow = v.lenMid + 1.0;
  }
  if (!(v.lenNow > 1.0)) v.lenNow = 2.0;
  v.phaseSlope = 1.0 / (v.lenNow - 1.0);
}

void bakeDistribution(RobinOscState& voice, double hz, double safeSampleRate) {
  const double voiceFreq = clampHz(hz, voice.hzCeiling);
  double meanCycleLength = safeSampleRate / (voiceFreq > 1.0e-9 ? voiceFreq : 1.0e-9);
  if (!(meanCycleLength == meanCycleLength) || meanCycleLength > 1.0e9) {
    meanCycleLength = 1.0e9;
  }
  if (meanCycleLength < 2.0) meanCycleLength = 2.0;
  calcCycleDistribution(meanCycleLength, &voice.lenMid, &voice.probShort, &voice.probMid);
}

void beginCycleFromPitch(RobinOscState& voice) {
  const double sr = voice.sampleRateHz > 1.0 ? voice.sampleRateHz : 48000.0;
  bakeDistribution(voice, voice.currentHz, sr);
  updateCycleLength(voice);
  voice.sampleCount = 0.0;
  voice.phase = 0.0;
}

// Mid-cycle Hz change: warp remaining period; do not re-roll dither.
void warpRemainingCycle(RobinOscState& voice, double newHz, double safeSampleRate) {
  double phi = voice.phase;
  if (!(phi == phi) || phi < 0.0) phi = 0.0;
  if (phi >= 1.0) phi = 0.0;

  const double hz = clampHz(newHz, voice.hzCeiling);
  voice.currentHz = hz;
  bakeDistribution(voice, hz, safeSampleRate); // next wrap only

  double samplesLeft = floorD((1.0 - phi) * safeSampleRate / (hz > 1.0e-9 ? hz : 1.0e-9) + 0.5);
  if (samplesLeft < 1.0) samplesLeft = 1.0;

  voice.lenNow = voice.sampleCount + samplesLeft;
  if (!(voice.lenNow > voice.sampleCount)) {
    voice.lenNow = voice.sampleCount + 1.0;
    samplesLeft = 1.0;
  }
  // Advance remaining (1-phi) over samplesLeft so phase stays continuous.
  voice.phaseSlope = (1.0 - phi) / samplesLeft;
}

double waveFromPhasor(double p, int waveform, double pulseWidth) {
  double ph = p;
  if (!(ph == ph)) ph = 0.0;
  ph = wrap01(ph);

  switch (waveform) {
    case kWaveRamp:
      return 1.0 - 2.0 * ph;
    case kWaveSquare:
      return ph < 0.5 ? 1.0 : -1.0;
    case kWaveTriangle: {
      if (ph < 0.5) return 4.0 * ph - 1.0;
      return 3.0 - 4.0 * ph;
    }
    case kWaveSine:
      return dsp_sin_turns(ph);
    case kWavePulse: {
      double w = pulseWidth;
      if (!(w == w)) w = 0.5;
      if (w < 0.0) w = 0.0;
      if (w > 1.0) w = 1.0;
      return ph < w ? 1.0 : -1.0;
    }
    case kWaveSaw:
    default:
      return 2.0 * ph - 1.0;
  }
}

double robinOscSample(
  RobinOscState& state,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseCycles,
  int waveform,
  double pulseWidth,
  int reset
) {
  const double rate = sampleRate > 1.0 ? sampleRate : 44100.0;
  state.sampleRateHz = rate;
  state.hzCeiling = 0.5 * rate;

  const double freq = clampHz(frequencyHz, state.hzCeiling);
  const double amp = finiteValue(amplitude) ? amplitude : 0.0;
  int wave = waveform;
  if (wave < 0) wave = 0;
  if (wave >= kWaveCount) wave = kWaveCount - 1;

  if (reset || !state.primed) {
    state.currentHz = freq;
    state.rngState ^= 0xA5A5u + static_cast<unsigned int>(state.sampleCount);
    if (state.rngState == 0) state.rngState = 0x1234567u;
    bakeDistribution(state, freq, rate);
    updateCycleLength(state);
    state.sampleCount = 0.0;
    double sp = finiteValue(startPhaseCycles) ? startPhaseCycles : 0.0;
    state.phase = wrap01(sp);
    if (state.phaseSlope > 1.0e-12) {
      state.sampleCount = state.phase / state.phaseSlope;
      if (state.sampleCount >= state.lenNow) state.sampleCount = 0.0;
    }
    state.primed = true;
  } else {
    const double prev = state.currentHz;
    const double rel = (prev > 1.0e-12)
      ? ((freq > prev ? freq - prev : prev - freq) / prev)
      : (freq > 1.0e-12 ? 1.0 : 0.0);
    if (rel > 1.0e-9) {
      warpRemainingCycle(state, freq, rate);
    } else {
      state.currentHz = freq;
    }
  }

  const double p = state.phase;
  const double y = waveFromPhasor(p, wave, pulseWidth) * amp;

  state.sampleCount += 1.0;
  state.phase += state.phaseSlope;
  if (state.sampleCount >= state.lenNow || state.phase >= 1.0) {
    beginCycleFromPitch(state);
  }

  return y;
}

RobinOscState* stateForHandle(int handle) {
  if (handle <= 0 || handle > kMaxInstances) return nullptr;
  RobinOscState& state = gPool[handle - 1];
  return state.active ? &state : nullptr;
}

}  // namespace

extern "C" int soemdsp_robin_oscillator_create() {
  for (int index = 0; index < kMaxInstances; index += 1) {
    if (!gPool[index].active) {
      RobinOscState& s = gPool[index];
      s.active = true;
      s.primed = false;
      s.sampleCount = 0.0;
      s.lenNow = 2.0;
      s.lenMid = 2.0;
      s.probShort = 0.0;
      s.probMid = 1.0;
      s.phaseSlope = 1.0;
      s.phase = 0.0;
      s.currentHz = 100.0;
      s.sampleRateHz = 48000.0;
      s.hzCeiling = 24000.0;
      s.rngState = 0xC0FFEEu + static_cast<unsigned int>(index) * 97u;
      return index + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_robin_oscillator_destroy(int handle) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return;
  state->active = false;
  state->primed = false;
}

extern "C" void soemdsp_robin_oscillator_reset(int handle) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return;
  state->primed = false;
  state->sampleCount = 0.0;
  state->phase = 0.0;
}

extern "C" double soemdsp_robin_oscillator_sample(
  int handle,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseCycles,
  double waveform,
  double pulseWidth,
  double reset
) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return 0.0;
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  return robinOscSample(
    *state,
    frequencyHz,
    amplitude,
    sampleRate,
    startPhaseCycles,
    wave,
    pulseWidth,
    reset > 0.5 ? 1 : 0
  );
}

extern "C" void soemdsp_robin_oscillator_process_block(
  int handle,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseCycles,
  double waveform,
  double pulseWidth,
  double reset,
  int frameCount
) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return;
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    state->blockOut[frame] = robinOscSample(
      *state,
      frequencyHz,
      amplitude,
      sampleRate,
      startPhaseCycles,
      wave,
      pulseWidth,
      (reset > 0.5 && frame == 0) ? 1 : 0
    );
  }
}

extern "C" int soemdsp_robin_oscillator_block_output_ptr(int handle) {
  RobinOscState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockOut) : 0;
}

extern "C" int soemdsp_robin_oscillator_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_robin_oscillator_version() {
  return 1;
}

extern "C" const char* soemdsp_robin_oscillator_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_robin_oscillator_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
