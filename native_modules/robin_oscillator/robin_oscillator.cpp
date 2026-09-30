// soemdsp-native-module: robin_oscillator
// soemdsp-native-label: RobinOscillator
// soemdsp-native-target: robinOscillator
// soemdsp-native-kind: oscillator
//
// Robin Schmidt / RS-MET cycle-length dither AA plus mid-cycle increment warp.
// The algorithm takes one phase increment in cycles/sample. Frequency Hz is
// converted at the graph boundary (Hz / sampleRate) and added to the inc port
// before this module sees it. Dither cycle length and phase advance both come
// from that increment. Dither re-rolls only at wrap.

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

// Increment-update style (choice param freqUpdate / Update).
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

double randomUnit(unsigned int& state) {
  return static_cast<double>(xorshift32(state) >> 8) * (1.0 / 16777216.0);
}

void calcCycleDistribution(double c, double* lenMid, double* probShort, double* probMid) {
  const double ci = dsp_floor(c);
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
  double phase; // absolute [0,1) - kept continuous across mid-cycle warp
  // Signed cycles/sample. Cycle length uses the magnitude. 0 freezes phase.
  double currentInc;
  // Cycle-dither residual from last wrap: lenNow - meanCycleLength (same mean
  // bakeDistribution used). Preserved across mid-cycle warp so +/-1-sample AA
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

// Samples per cycle from a cycles/sample increment. |inc|==0 -> the 1e9 cap
// (frozen / sub-audible). Same cap the old sr/Hz path used.
double meanCycleSamples(double inc) {
  const double a = dsp_fabs(inc);
  if (!(a > 1.0e-15)) return 1.0e9;
  double mean = 1.0 / a;
  if (!(mean == mean) || mean > 1.0e9) return 1.0e9;
  if (mean < 2.0) return 2.0;
  return mean;
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
  const double meanCycleLength = meanCycleSamples(v.currentInc);
  v.ditherOffset = v.lenNow - meanCycleLength;
  // Exact 0 (and sub-threshold) freezes. A live increment, even with the
  // Frequency knob at 0, keeps a real cycle length via meanCycleSamples.
  if (!(dsp_fabs(v.currentInc) > 1.0e-15)) {
    v.phaseSlope = 0.0;
    return;
  }
  double slope = 1.0 / (v.lenNow - 1.0);
  if (v.currentInc < 0.0) slope = -slope;
  v.phaseSlope = slope;
}

void bakeDistribution(RobinOscState& voice, double inc) {
  calcCycleDistribution(meanCycleSamples(inc), &voice.lenMid, &voice.probShort, &voice.probMid);
}

// Cycles still to travel before the next wrap, in the direction of inc.
double cyclesUntilWrap(double phi, double inc) {
  if (inc < 0.0) {
    if (!(phi > 0.0)) return 1.0;
    return phi;
  }
  const double left = 1.0 - phi;
  if (!(left > 0.0)) return 1.0;
  return left;
}

void placePhaseInCycle(RobinOscState& voice, double phaseInto) {
  voice.phase = wrap01(phaseInto);
  const double slope = voice.phaseSlope;
  if (slope > 1.0e-15) {
    voice.sampleCount = voice.phase / slope;
  } else if (slope < -1.0e-15) {
    voice.sampleCount = (1.0 - voice.phase) / (-slope);
  } else {
    voice.sampleCount = 0.0;
  }
  if (!(voice.sampleCount >= 0.0) || !(voice.sampleCount < voice.lenNow)) {
    voice.sampleCount = 0.0;
  }
}

// Re-roll dither at a wrap. phaseInto keeps the fractional overshoot so the
// edge is not snapped back to phase 0 (that drop aliases).
void beginCycle(RobinOscState& voice, double phaseInto) {
  bakeDistribution(voice, voice.currentInc);
  updateCycleLength(voice);
  placePhaseInCycle(voice, phaseInto);
}

// Mid-cycle increment change: warp remaining period; preserve wrap ditherOffset.
// Do not re-roll RNG mid-cycle (bakeDistribution updates next-wrap probs only).
void warpRemainingCycle(RobinOscState& voice, double newInc) {
  double phi = voice.phase;
  if (!(phi == phi) || phi < 0.0) phi = 0.0;
  if (phi >= 1.0) phi = 0.0;

  voice.currentInc = newInc;
  bakeDistribution(voice, newInc); // next wrap only

  const double cyclesLeft = cyclesUntilWrap(phi, newInc);
  const double a = dsp_fabs(newInc);
  double idealRemaining = (a > 1.0e-15) ? (cyclesLeft / a) : 1.0e9;
  double remaining = idealRemaining + voice.ditherOffset;
  if (remaining < 1.0) remaining = 1.0;

  voice.lenNow = voice.sampleCount + remaining;
  if (!(voice.lenNow > voice.sampleCount)) {
    voice.lenNow = voice.sampleCount + 1.0;
    remaining = 1.0;
  }
  const double mag = cyclesLeft / remaining;
  voice.phaseSlope = (newInc < 0.0) ? -mag : mag;
}

// Mid-cycle increment change: snap remaining to short/mid/long around the *new*
// ideal remaining (calcCycleDistribution on idealRemaining, then roll like
// updateCycleLength). bakeDistribution still updates next-wrap probs.
void snapRemainingCycle(RobinOscState& voice, double newInc) {
  double phi = voice.phase;
  if (!(phi == phi) || phi < 0.0) phi = 0.0;
  if (phi >= 1.0) phi = 0.0;

  voice.currentInc = newInc;
  bakeDistribution(voice, newInc); // next wrap

  const double cyclesLeft = cyclesUntilWrap(phi, newInc);
  const double a = dsp_fabs(newInc);
  double mean = (a > 1.0e-15) ? (cyclesLeft / a) : 1.0e9;
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
  const double mag = cyclesLeft / picked;
  voice.phaseSlope = (newInc < 0.0) ? -mag : mag;
}

// Apply the combined cycles/sample increment under the chosen Update style.
// Never zeros phase: a 0 increment freezes DC at the current phasor; leaving
// 0 retargets remaining from phi (warp spirit + ditherOffset).
void applyIncrementForStyle(
  RobinOscState& state,
  double inc,
  int style,
  bool retargetOnCycle
) {
  if (!(dsp_fabs(inc) > 1.0e-15)) {
    state.currentInc = 0.0;
    bakeDistribution(state, 0.0);
    state.phaseSlope = 0.0;
    return;
  }

  if (style == kFreqUpdateWarpRemaining) {
    warpRemainingCycle(state, inc);
    return;
  }
  if (style == kFreqUpdateSnapRemaining) {
    snapRemainingCycle(state, inc);
    return;
  }

  // On cycle: bake for next wrap. If frozen / re-apply asked, retarget remaining
  // from current phase (same as warp math) - keep phase continuous.
  const bool wasFrozen = !(dsp_fabs(state.phaseSlope) > 1.0e-15);
  state.currentInc = inc;
  bakeDistribution(state, inc);
  if (retargetOnCycle || wasFrozen) {
    warpRemainingCycle(state, inc);
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
  double incrementCycles,
  double amplitude,
  double startPhaseCycles,
  int waveform,
  double morph,
  int freqUpdate,
  int reset
) {
  double inc = (incrementCycles == incrementCycles) ? incrementCycles : 0.0;
  const double amp = finiteValue(amplitude) ? amplitude : 0.0;
  int wave = waveform;
  if (wave < 0) wave = 0;
  if (wave >= kWaveCount) wave = kWaveCount - 1;

  int style = freqUpdate;
  if (style < kFreqUpdateOnCycle) style = kFreqUpdateOnCycle;
  if (style > kFreqUpdateSnapRemaining) style = kFreqUpdateSnapRemaining;

  if (reset || !state.primed) {
    state.currentInc = inc;
    state.rngState ^= 0xA5A5u + static_cast<unsigned int>(state.sampleCount);
    if (state.rngState == 0) state.rngState = 0x1234567u;
    state.ditherOffset = 0.0;
    bakeDistribution(state, inc);
    updateCycleLength(state);
    double sp = finiteValue(startPhaseCycles) ? startPhaseCycles : 0.0;
    placePhaseInCycle(state, sp);
    state.lastFreqUpdate = style;
    state.primed = true;
  } else {
    const bool modeChanged = (style != state.lastFreqUpdate);
    const double prev = state.currentInc;
    const double delta = dsp_fabs(inc - prev);
    const double scale = dsp_fabs(prev);
    const double rel = (scale > 1.0e-15)
      ? (delta / scale)
      : (dsp_fabs(inc) > 1.0e-15 ? 1.0 : 0.0);

    if (modeChanged) {
      // Re-check increment under the new Update method; never reset phase.
      applyIncrementForStyle(state, inc, style, /*retargetOnCycle=*/true);
      state.lastFreqUpdate = style;
    } else if (rel > 1.0e-9) {
      // On cycle 0->inc: retarget remaining from phi (unstick without phase=0).
      const bool leavingZero = !(scale > 1.0e-15) && (dsp_fabs(inc) > 1.0e-15);
      applyIncrementForStyle(state, inc, style, /*retargetOnCycle=*/leavingZero);
    } else {
      state.currentInc = inc;
      if (!(dsp_fabs(inc) > 1.0e-15)) {
        state.phaseSlope = 0.0;
      }
    }
  }

  const double p = state.phase;
  const double y = waveFromPhasor(p, wave, morph) * amp;

  // phaseSlope is the dithered cycles/sample step of currentInc. Do not add
  // a second raw increment. That was the path that wrapped early and dropped
  // the fractional overshoot.
  if (dsp_fabs(state.phaseSlope) > 1.0e-15) {
    state.sampleCount += 1.0;
    state.phase += state.phaseSlope;
    if (state.sampleCount >= state.lenNow || state.phase >= 1.0 || state.phase < 0.0) {
      const double into = state.phase;
      beginCycle(state, into);
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
      s.currentInc = 0.0;
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
  double incrementCycles,
  double amplitude,
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
    incrementCycles,
    amplitude,
    startPhaseCycles,
    wave,
    morph,
    style,
    reset > 0.5 ? 1 : 0
  );
}

extern "C" void soemdsp_robin_oscillator_process_block(
  int handle,
  double incrementCycles,
  double amplitude,
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
      incrementCycles,
      amplitude,
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
