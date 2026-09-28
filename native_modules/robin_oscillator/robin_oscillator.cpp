// soemdsp-native-module: robin_oscillator
// soemdsp-native-label: RobinOscillator
// soemdsp-native-target: robinOscillator
// soemdsp-native-kind: oscillator
//
// Robin Schmidt / RS-MET cycle-length dither AA (same idea as Robin Supersaw
// voices) plus Architect-approved mid-cycle frequency warp: when Hz changes
// inside a cycle, retarget the remaining samples so phase stays continuous
// and there is still exactly one wrap. Dither re-roll only at wrap.

#include <soemdsp/soemdsp.hpp>

namespace {

using namespace soemdsp_maths;

constexpr int kMaxInstances = 32;
constexpr int kMaxBlockFrames = 2048;

// Waveform choice indices (shop list).
constexpr int kWaveSaw = 0;
constexpr int kWaveRamp = 1;
constexpr int kWaveSquare = 2;
constexpr int kWaveTrisaw = 3; // UI: Trisaw Center; Morph = opposing-peak saw morph (naive_trisaw_center)
constexpr int kWaveSine = 4;
constexpr int kWavePulse = 5;
constexpr int kWaveAnalogSquare = 6; // UI: Analog Square; same-direction peaks (naive_analog_square)
constexpr int kWaveCount = 7;

// Frequency-update style (choice param freqUpdate / Update).
constexpr int kFreqUpdateOnCycle = 0;       // bake next wrap only; no mid-cycle warp
constexpr int kFreqUpdateWarpRemaining = 1; // option 1: warp + preserve ditherOffset
constexpr int kFreqUpdateSnapRemaining = 2; // option 2: snap remaining via dithered fragment

static const char kMetadataJson[] =
  "{"
    "\"module\":\"robin_oscillator\","
    "\"label\":\"RobinOscillator\","
    "\"targetType\":\"robinOscillator\","
    "\"kind\":\"oscillator\","
    "\"outputs\":[\"Wave\"],"
    "\"parameters\":["
      "{\"key\":\"waveform\",\"label\":\"Waveform\",\"defaultValue\":0,\"min\":0,\"max\":6,\"step\":1},"
      "{\"key\":\"frequency\",\"label\":\"Frequency\",\"defaultValue\":100,\"min\":0,\"mid\":440,\"max\":20000,\"step\":\"any\",\"unit\":\"Hz\"},"
      "{\"key\":\"amplitude\",\"label\":\"Amplitude\",\"defaultValue\":1,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":\"any\"},"
      "{\"key\":\"phase\",\"label\":\"Start Phase\",\"defaultValue\":0,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01,\"unit\":\"cycle\"},"
      "{\"key\":\"morph\",\"label\":\"Morph\",\"defaultValue\":0.5,\"min\":0,\"mid\":0.5,\"max\":1,\"step\":0.01},"
      "{\"key\":\"freqUpdate\",\"label\":\"Update\",\"defaultValue\":1,\"min\":0,\"max\":2,\"step\":1}"
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
  // Cycle-dither residual from last wrap: lenNow - meanCycleLength (same mean
  // bakeDistribution used). Preserved across mid-cycle Hz warp so ±1-sample AA
  // does not vanish during sweeps. Re-rolled only at wrap (updateCycleLength).
  double ditherOffset;
  // Last applied freqUpdate style (-1 = unset). Mode changes force re-apply.
  int lastFreqUpdate;
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
  // Mean matches bakeDistribution (sr / currentHz, same clamps).
  const double sr = v.sampleRateHz > 1.0 ? v.sampleRateHz : 48000.0;
  const double voiceFreq = clampHz(v.currentHz, v.hzCeiling);
  double meanCycleLength = sr / (voiceFreq > 1.0e-9 ? voiceFreq : 1.0e-9);
  if (!(meanCycleLength == meanCycleLength) || meanCycleLength > 1.0e9) {
    meanCycleLength = 1.0e9;
  }
  if (meanCycleLength < 2.0) meanCycleLength = 2.0;
  v.ditherOffset = v.lenNow - meanCycleLength;
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

// Mid-cycle Hz change: warp remaining period; preserve wrap ditherOffset.
// Do not re-roll RNG mid-cycle (bakeDistribution updates next-wrap probs only).
void warpRemainingCycle(RobinOscState& voice, double newHz, double safeSampleRate) {
  double phi = voice.phase;
  if (!(phi == phi) || phi < 0.0) phi = 0.0;
  if (phi >= 1.0) phi = 0.0;

  const double hz = clampHz(newHz, voice.hzCeiling);
  voice.currentHz = hz;
  bakeDistribution(voice, hz, safeSampleRate); // next wrap only

  double idealRemaining = (1.0 - phi) * safeSampleRate / (hz > 1.0e-9 ? hz : 1.0e-9);
  double remaining = idealRemaining + voice.ditherOffset;
  if (remaining < 1.0) remaining = 1.0;

  voice.lenNow = voice.sampleCount + remaining;
  if (!(voice.lenNow > voice.sampleCount)) {
    voice.lenNow = voice.sampleCount + 1.0;
    remaining = 1.0;
  }
  // Advance remaining (1-phi) over remaining so phase stays continuous.
  voice.phaseSlope = (1.0 - phi) / remaining;
}

// Mid-cycle Hz change: snap remaining to short/mid/long around the *new*
// ideal remaining (calcCycleDistribution on idealRemaining, then roll like
// updateCycleLength). bakeDistribution still updates next-wrap probs.
void snapRemainingCycle(RobinOscState& voice, double newHz, double safeSampleRate) {
  double phi = voice.phase;
  if (!(phi == phi) || phi < 0.0) phi = 0.0;
  if (phi >= 1.0) phi = 0.0;

  const double hz = clampHz(newHz, voice.hzCeiling);
  voice.currentHz = hz;
  bakeDistribution(voice, hz, safeSampleRate); // next wrap

  double idealRemaining = (1.0 - phi) * safeSampleRate / (hz > 1.0e-9 ? hz : 1.0e-9);
  double mean = idealRemaining;
  if (!(mean == mean) || mean > 1.0e9) mean = 1.0e9;
  if (mean < 2.0) mean = 2.0;

  double lenMid = 2.0;
  double probShort = 0.0;
  double probMid = 1.0;
  calcCycleDistribution(mean, &lenMid, &probShort, &probMid);

  const double r = randomUnit(voice.rngState);
  double picked = lenMid;
  if (r < probShort) {
    picked = lenMid - 1.0;
  } else if (r < probShort + probMid) {
    picked = lenMid;
  } else {
    picked = lenMid + 1.0;
  }
  if (picked < 1.0) picked = 1.0;

  voice.lenNow = voice.sampleCount + picked;
  if (!(voice.lenNow > voice.sampleCount)) {
    voice.lenNow = voice.sampleCount + 1.0;
    picked = 1.0;
  }
  voice.phaseSlope = (1.0 - phi) / picked;
}

// Apply current Hz under the chosen Update style (also used on mode change).
// Never zeros phase: 0 Hz freezes DC at the current phasor; leaving 0 retargets
// remaining from phi (warp spirit + ditherOffset) without beginCycleFromPitch.
void applyFrequencyForStyle(
  RobinOscState& state,
  double freq,
  double rate,
  int style,
  bool retargetOnCycle
) {
  // Hold DC at current phase — do not advance or wrap-restart.
  if (!(freq > 1.0e-9)) {
    state.currentHz = 0.0;
    bakeDistribution(state, 0.0, rate);
    state.phaseSlope = 0.0;
    return;
  }

  if (style == kFreqUpdateWarpRemaining) {
    warpRemainingCycle(state, freq, rate);
    return;
  }
  if (style == kFreqUpdateSnapRemaining) {
    snapRemainingCycle(state, freq, rate);
    return;
  }

  // On cycle: bake for next wrap. If frozen / re-apply asked, retarget remaining
  // from current phase (same as warp math) — keep phase continuous.
  const bool wasFrozen = !(state.phaseSlope > 1.0e-15);
  state.currentHz = freq;
  bakeDistribution(state, freq, rate);
  if (retargetOnCycle || wasFrozen) {
    warpRemainingCycle(state, freq, rate);
  }
}

// morph: universal 0..1 knob (UI label Morph). Pulse = duty/width; Trisaw Center =
// opposing-peak saw morph via soemdsp::math::naive_trisaw_center; Analog Square =
// same-direction peaks via soemdsp::math::naive_analog_square (zeros stay at 0 / 0.5).
// Others ignore.
// Saw = edge then down slope (1-2*ph). Ramp = up slope then edge (2*ph-1). Matches PolyBLEP.
double waveFromPhasor(double p, int waveform, double morph) {
  double ph = p;
  if (!(ph == ph)) ph = 0.0;
  ph = wrap01(ph);

  double m = morph;
  if (!(m == m)) m = 0.5;
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;

  switch (waveform) {
    case kWaveRamp:
      return 2.0 * ph - 1.0;
    case kWaveSquare:
      return ph < 0.5 ? 1.0 : -1.0;
    case kWaveTrisaw:
      // Trisaw Center (naive); Morph slides peaks in opposing directions toward a saw.
      return naive_trisaw_center(ph, morph);
    case kWaveAnalogSquare:
      // Analog Square (naive); Morph slides both peaks the same way (dual-edge family).
      return naive_analog_square(ph, morph);
    case kWaveSine:
      return dsp_sin_turns(ph);
    case kWavePulse:
      return ph < m ? 1.0 : -1.0;
    case kWaveSaw:
    default:
      return 1.0 - 2.0 * ph;
  }
}

double robinOscSample(
  RobinOscState& state,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseCycles,
  int waveform,
  double morph,
  int freqUpdate,
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

  int style = freqUpdate;
  if (style < kFreqUpdateOnCycle) style = kFreqUpdateOnCycle;
  if (style > kFreqUpdateSnapRemaining) style = kFreqUpdateSnapRemaining;

  if (reset || !state.primed) {
    state.currentHz = freq;
    state.rngState ^= 0xA5A5u + static_cast<unsigned int>(state.sampleCount);
    if (state.rngState == 0) state.rngState = 0x1234567u;
    state.ditherOffset = 0.0;
    bakeDistribution(state, freq, rate);
    updateCycleLength(state);
    state.sampleCount = 0.0;
    double sp = finiteValue(startPhaseCycles) ? startPhaseCycles : 0.0;
    state.phase = wrap01(sp);
    if (state.phaseSlope > 1.0e-12) {
      state.sampleCount = state.phase / state.phaseSlope;
      if (state.sampleCount >= state.lenNow) state.sampleCount = 0.0;
    }
    state.lastFreqUpdate = style;
    state.primed = true;
  } else {
    const bool modeChanged = (style != state.lastFreqUpdate);
    const double prev = state.currentHz;
    const double rel = (prev > 1.0e-12)
      ? ((freq > prev ? freq - prev : prev - freq) / prev)
      : (freq > 1.0e-12 ? 1.0 : 0.0);

    if (modeChanged) {
      // Re-check frequency under the new Update method; never reset phase.
      applyFrequencyForStyle(state, freq, rate, style, /*retargetOnCycle=*/true);
      state.lastFreqUpdate = style;
    } else if (rel > 1.0e-9) {
      // On cycle 0→Hz: retarget remaining from phi (unstick without phase=0).
      const bool leavingZero = (prev <= 1.0e-9) && (freq > 1.0e-9);
      applyFrequencyForStyle(state, freq, rate, style, /*retargetOnCycle=*/leavingZero);
    } else {
      state.currentHz = freq;
      if (!(freq > 1.0e-9)) {
        state.phaseSlope = 0.0;
      }
    }
  }

  const double p = state.phase;
  const double y = waveFromPhasor(p, wave, morph) * amp;

  // 0 Hz: freeze advance/wrap so output holds as DC at current phase.
  if (state.currentHz > 1.0e-9) {
    state.sampleCount += 1.0;
    state.phase += state.phaseSlope;
    if (state.sampleCount >= state.lenNow || state.phase >= 1.0) {
      beginCycleFromPitch(state);
    }
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
      s.ditherOffset = 0.0;
      s.lastFreqUpdate = -1;
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
  state->ditherOffset = 0.0;
  state->lastFreqUpdate = -1;
}

extern "C" double soemdsp_robin_oscillator_sample(
  int handle,
  double frequencyHz,
  double amplitude,
  double sampleRate,
  double startPhaseCycles,
  double waveform,
  double morph,
  double freqUpdate,
  double reset
) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return 0.0;
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  int style = (int)(freqUpdate + (freqUpdate >= 0.0 ? 0.5 : -0.5));
  return robinOscSample(
    *state,
    frequencyHz,
    amplitude,
    sampleRate,
    startPhaseCycles,
    wave,
    morph,
    style,
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
  double morph,
  double freqUpdate,
  double reset,
  int frameCount
) {
  RobinOscState* state = stateForHandle(handle);
  if (!state) return;
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  int wave = (int)(waveform + (waveform >= 0.0 ? 0.5 : -0.5));
  int style = (int)(freqUpdate + (freqUpdate >= 0.0 ? 0.5 : -0.5));
  for (int frame = 0; frame < safeFrameCount; frame += 1) {
    state->blockOut[frame] = robinOscSample(
      *state,
      frequencyHz,
      amplitude,
      sampleRate,
      startPhaseCycles,
      wave,
      morph,
      style,
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
