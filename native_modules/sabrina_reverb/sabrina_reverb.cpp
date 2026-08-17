// soemdsp-native-module: sabrina_reverb
// soemdsp-native-label: Sabrina Reverb
// soemdsp-native-target: reverbEffect
// soemdsp-native-kind: effect

#include <wasm_simd128.h>

#include "../sandbox_native_maths/sandbox_native_maths.h"

namespace {

using namespace soemdsp_maths;
constexpr int kDelayCount = 14;
constexpr int kDiffusionCount = 12;
constexpr int kMaxInstances = 2;
constexpr int kMaxDelaySamples = 192000;
// Internal per-sample ramp time for delay-line geometry (offset/LFO speed).
// This runs independent of whatever smoothing the JS caller applies, so a
// param update never snaps a delay tap length -- which is audible as a click
// even when the incoming value itself arrives already smoothed.
constexpr double kParamSmoothSeconds = 0.05;
// Block-processing boundary buffers -- same fixed-size-static-array pattern
// used by fractal_brownian_noise's process_block API. 2048 covers any
// AudioWorklet render quantum with a large safety margin.
constexpr int kMaxBlockFrames = 2048;

bool finite(double value) {
  return value == value && value > -1.0e12 && value < 1.0e12;
}

double fract(double value) {
  const double whole = __builtin_floor(value);
  return value - whole;
}

double parabol(double value) {
  const double wrapped = fract(value);
  const double fit = wrapped * 2.0 - 1.0;
  return 4.0 * fit * (1.0 - __builtin_fabs(fit));
}

double smoothStep(double current, double target, double alpha) {
  return current + (target - current) * alpha;
}

// nostdlib build has no libm to link against, so exp() isn't available --
// range-reduce by halving then a short Taylor series, which is plenty
// accurate for deriving a one-pole smoothing coefficient.
double expApprox(double x) {
  int halvings = 0;
  double reduced = x;
  while (reduced > 0.5 || reduced < -0.5) {
    reduced *= 0.5;
    halvings += 1;
  }
  double term = 1.0;
  double sum = 1.0;
  for (int index = 1; index <= 12; index += 1) {
    term *= reduced / index;
    sum += term;
  }
  for (int index = 0; index < halvings; index += 1) {
    sum *= sum;
  }
  return sum;
}

struct SabrinaDelay {
  float buffer[kMaxDelaySamples];
  int driver;
  int rndNext;
  double feedback;
  double rndAcc;
  double offset;
  double modInc;
  double modSpeed;
  double lfopercent;
  // Stored random values so applyDelayGeometry can reuse them without advancing the RNG
  double rndOffset;
  double rndMod;
};

struct SabrinaState {
  SabrinaDelay delays[kDelayCount];
  bool active;
  double sampleRate;
  double ch0;
  double ch1;
  double lastLeft;
  double lastRight;
  double lastWet;
  // soemdsp::dynamics::SilenceDetector — clock 0→1 in 1s, level = Planck 1e-7.
  // Reverb::runWithIdleDetection feeds in+fb+wet+dry into the same detector.
  bool isIdle;
  double idleClock;
  double idleIncrement;
  double mix;
  double diffusionSize;
  double diffusionAmount;
  double delaySize;
  double recycle;
  double lfoAmplitude;
  double lfoBaseSpeed;
  double lfoVariation;
  int seed;
  // Ramped copies of the params that feed delay-line offsets/LFO speed --
  // advanced one step per sample in advanceSabrinaSmoothing so the geometry
  // that applyDelayGeometry derives from them never jumps discontinuously.
  double smoothedDiffusionSize;
  double smoothedDelaySize;
  double smoothedLfoAmplitude;
  double smoothedLfoBaseSpeed;
  double smoothedLfoVariation;
  double paramSmoothAlpha;
  // Block-processing boundary I/O -- caller writes frameCount dry samples
  // into blockInLeft/Right via a zero-copy view, then reads mixed output
  // back from blockOutLeft/Right the same way. See soemdsp_sabrina_reverb_process_block.
  double blockInLeft[kMaxBlockFrames];
  double blockInRight[kMaxBlockFrames];
  double blockOutLeft[kMaxBlockFrames];
  double blockOutRight[kMaxBlockFrames];
};

SabrinaState states[kMaxInstances];

double rnd(SabrinaDelay& delay) {
  delay.rndNext = (delay.rndNext + 109) % 123094;
  delay.rndAcc = parabol(parabol((delay.rndNext + delay.rndAcc + 10.0) * 134987.489798 + 1987.19687) * 1987.4987 + 98497.19879);
  return delay.rndAcc * 0.5 + 0.5;
}

void clearDelay(SabrinaDelay& delay) {
  for (int index = 0; index < kMaxDelaySamples; index += 1) {
    delay.buffer[index] = 0.0f;
  }
}

// Uses stored rndOffset — safe to call repeatedly without changing the random sequence
void setOffsetSize(SabrinaDelay& delay, double size, double maxDelaySize) {
  delay.offset = maxDelaySize * delay.rndOffset * (size * 0.1 + 0.0000001) + 1.0;
}

// Uses stored rndMod — safe to call repeatedly without changing the random sequence
void initializeMod(SabrinaDelay& delay, double lfoSeconds, double lfoVariation, double sampleRate) {
  const double seconds = lfoSeconds + delay.rndMod * lfoVariation;
  delay.modSpeed = (1.0 / (seconds > 0.000001 ? seconds : 0.000001)) / sampleRate;
}

void initializeDelay(SabrinaDelay& delay, int seed, double sampleRate) {
  clearDelay(delay);
  delay.driver = 0;
  delay.feedback = 0.0;
  delay.rndNext = seed % 123094;
  delay.rndAcc = 0.0;
  rnd(delay);
  rnd(delay);
  rnd(delay);
  // Consume and store the random values that applyDelayGeometry will need
  delay.rndOffset = rnd(delay);
  delay.rndMod = rnd(delay);
  delay.modInc = 0.0;
  delay.lfopercent = 0.0;
  setOffsetSize(delay, 0.06, sampleRate * 4.0);
  initializeMod(delay, 1.0, 0.001, sampleRate);
}

double readDelay(const SabrinaDelay& delay, double where) {
  double wrapped = where;
  while (wrapped < 0.0) {
    wrapped += kMaxDelaySamples;
  }
  while (wrapped >= kMaxDelaySamples) {
    wrapped -= kMaxDelaySamples;
  }
  const int before = static_cast<int>(wrapped);
  const int after = (before + 1) % kMaxDelaySamples;
  const double mix = wrapped - before;
  return delay.buffer[before] * (1.0 - mix) + delay.buffer[after] * mix;
}

double delaySample(SabrinaDelay& delay, double input) {
  const double safeInput = finite(input) ? input : 0.0;
  delay.modInc += delay.modSpeed;
  const double lfo = parabol(delay.modInc) * 0.5 + 0.5;
  const double readPosition = delay.driver - delay.offset - delay.offset * lfo * delay.lfopercent;
  delay.driver = (delay.driver + 1) % kMaxDelaySamples;
  const double delayed = readDelay(delay, readPosition);
  delay.buffer[delay.driver] = static_cast<float>(safeInput);
  return finite(delayed) ? delayed : 0.0;
}

double diffuseSample(SabrinaDelay& delay, double input) {
  const double safeInput = finite(input) ? input : 0.0;
  delay.modInc += delay.modSpeed;
  const double lfo = parabol(delay.modInc) * 0.5 + 0.5;
  const double readPosition = delay.driver - delay.offset - delay.offset * lfo * delay.lfopercent;
  delay.driver = (delay.driver + 1) % kMaxDelaySamples;
  const double delayed = readDelay(delay, readPosition);
  delay.buffer[delay.driver] = static_cast<float>(clamp((0.0 - safeInput) - delayed * delay.feedback, -16.0, 16.0));
  const double output = safeInput * delay.feedback - delayed * (1.0 - delay.feedback * delay.feedback);
  return finite(output) ? output : 0.0;
}

// SIMD kernel: vectorized parabol(), one f64x2 lane per stereo channel.
v128_t parabolPairSimd(v128_t value) {
  const v128_t whole = wasm_f64x2_floor(value);
  const v128_t wrapped = wasm_f64x2_sub(value, whole);
  const v128_t fit = wasm_f64x2_sub(wasm_f64x2_add(wrapped, wrapped), wasm_f64x2_splat(1.0));
  const v128_t absFit = wasm_f64x2_abs(fit);
  return wasm_f64x2_mul(wasm_f64x2_splat(4.0), wasm_f64x2_mul(fit, wasm_f64x2_sub(wasm_f64x2_splat(1.0), absFit)));
}

// SIMD kernels below process the left and right channels together, one lane
// each, instead of two full sequential calls. The two channels never depend
// on each other within a single call (the "cross-feed" is only via ch0/ch1
// persisted from the *previous* process() call), so this is a legitimate,
// data-independent pairing -- the classic stereo-channel-parallel SIMD
// pattern, not a reordering of any real dependency.
//
// The buffer read/write itself stays scalar: delayL.buffer and delayR.buffer
// are two separate arrays at unrelated addresses with independently-computed
// indices, and WASM SIMD128 has no gather/scatter instruction -- there is no
// single vector load that could touch both. What vectorizes is the
// arithmetic around it: the modulation increment, the parabol/LFO calc, the
// read-position calc, and (for diffusion) the feedback combine.
void delaySamplePairSimd(SabrinaDelay& delayL, SabrinaDelay& delayR, double inputL, double inputR, double& outL, double& outR) {
  const double safeInputL = finite(inputL) ? inputL : 0.0;
  const double safeInputR = finite(inputR) ? inputR : 0.0;

  const v128_t modSpeed = wasm_f64x2_make(delayL.modSpeed, delayR.modSpeed);
  const v128_t modInc = wasm_f64x2_add(wasm_f64x2_make(delayL.modInc, delayR.modInc), modSpeed);
  double modIncLanes[2];
  wasm_v128_store(modIncLanes, modInc);
  delayL.modInc = modIncLanes[0];
  delayR.modInc = modIncLanes[1];

  const v128_t lfo = wasm_f64x2_add(wasm_f64x2_mul(parabolPairSimd(modInc), wasm_f64x2_splat(0.5)), wasm_f64x2_splat(0.5));
  const v128_t offset = wasm_f64x2_make(delayL.offset, delayR.offset);
  const v128_t lfopercent = wasm_f64x2_make(delayL.lfopercent, delayR.lfopercent);
  const v128_t driver = wasm_f64x2_make(static_cast<double>(delayL.driver), static_cast<double>(delayR.driver));
  const v128_t readPosition = wasm_f64x2_sub(driver, wasm_f64x2_add(offset, wasm_f64x2_mul(wasm_f64x2_mul(offset, lfo), lfopercent)));
  double readPositionLanes[2];
  wasm_v128_store(readPositionLanes, readPosition);

  delayL.driver = (delayL.driver + 1) % kMaxDelaySamples;
  delayR.driver = (delayR.driver + 1) % kMaxDelaySamples;

  const double delayedL = readDelay(delayL, readPositionLanes[0]);
  const double delayedR = readDelay(delayR, readPositionLanes[1]);
  delayL.buffer[delayL.driver] = static_cast<float>(safeInputL);
  delayR.buffer[delayR.driver] = static_cast<float>(safeInputR);

  outL = finite(delayedL) ? delayedL : 0.0;
  outR = finite(delayedR) ? delayedR : 0.0;
}

void diffuseSamplePairSimd(SabrinaDelay& delayL, SabrinaDelay& delayR, double inputL, double inputR, double& outL, double& outR) {
  const double safeInputL = finite(inputL) ? inputL : 0.0;
  const double safeInputR = finite(inputR) ? inputR : 0.0;

  const v128_t modSpeed = wasm_f64x2_make(delayL.modSpeed, delayR.modSpeed);
  const v128_t modInc = wasm_f64x2_add(wasm_f64x2_make(delayL.modInc, delayR.modInc), modSpeed);
  double modIncLanes[2];
  wasm_v128_store(modIncLanes, modInc);
  delayL.modInc = modIncLanes[0];
  delayR.modInc = modIncLanes[1];

  const v128_t lfo = wasm_f64x2_add(wasm_f64x2_mul(parabolPairSimd(modInc), wasm_f64x2_splat(0.5)), wasm_f64x2_splat(0.5));
  const v128_t offset = wasm_f64x2_make(delayL.offset, delayR.offset);
  const v128_t lfopercent = wasm_f64x2_make(delayL.lfopercent, delayR.lfopercent);
  const v128_t driver = wasm_f64x2_make(static_cast<double>(delayL.driver), static_cast<double>(delayR.driver));
  const v128_t readPosition = wasm_f64x2_sub(driver, wasm_f64x2_add(offset, wasm_f64x2_mul(wasm_f64x2_mul(offset, lfo), lfopercent)));
  double readPositionLanes[2];
  wasm_v128_store(readPositionLanes, readPosition);

  delayL.driver = (delayL.driver + 1) % kMaxDelaySamples;
  delayR.driver = (delayR.driver + 1) % kMaxDelaySamples;

  const double delayedL = readDelay(delayL, readPositionLanes[0]);
  const double delayedR = readDelay(delayR, readPositionLanes[1]);

  const v128_t feedback = wasm_f64x2_make(delayL.feedback, delayR.feedback);
  const v128_t delayed = wasm_f64x2_make(delayedL, delayedR);
  const v128_t safeInput = wasm_f64x2_make(safeInputL, safeInputR);
  v128_t writeVal = wasm_f64x2_sub(wasm_f64x2_sub(wasm_f64x2_splat(0.0), safeInput), wasm_f64x2_mul(delayed, feedback));
  writeVal = wasm_f64x2_pmin(wasm_f64x2_pmax(writeVal, wasm_f64x2_splat(-16.0)), wasm_f64x2_splat(16.0));
  const v128_t output = wasm_f64x2_sub(
    wasm_f64x2_mul(safeInput, feedback),
    wasm_f64x2_mul(delayed, wasm_f64x2_sub(wasm_f64x2_splat(1.0), wasm_f64x2_mul(feedback, feedback)))
  );
  double writeLanes[2];
  double outputLanes[2];
  wasm_v128_store(writeLanes, writeVal);
  wasm_v128_store(outputLanes, output);
  delayL.buffer[delayL.driver] = static_cast<float>(writeLanes[0]);
  delayR.buffer[delayR.driver] = static_cast<float>(writeLanes[1]);

  outL = finite(outputLanes[0]) ? outputLanes[0] : 0.0;
  outR = finite(outputLanes[1]) ? outputLanes[1] : 0.0;
}

// Re-derives every delay line's random offset/modulation phase from a single
// seed, clearing their buffers in the process (same as a reset). Each delay
// line keeps its own distinct sub-seed (index * 137 + 7) so they don't all
// land on the same random values -- seed 0 reproduces the original hardcoded
// pattern exactly, any other seed shifts the whole random sequence.
void reseedDelays(SabrinaState& state, int seed) {
  state.seed = seed;
  for (int index = 0; index < kDelayCount; index += 1) {
    initializeDelay(state.delays[index], index * 137 + 7 + seed * 9973, state.sampleRate);
  }
}

// SIMD kernel: computes offset + modSpeed for a pair of diffusion delay
// lines at once via WASM SIMD128 f64x2 lanes. Mirrors setOffsetSize +
// initializeMod exactly (same formula, same operation order) -- the two
// lines differ only in their per-lane rndOffset/rndMod data, while
// maxDelaySize/sizeFactor/lfoSpeed/lfoVariation/sampleRate are the same
// scalar broadcast to both lanes, which is what makes this batchable.
// WASM SIMD128 has no f64x4 (only 2 lanes for doubles), so 12 diffusion
// lines batch into 6 pairs rather than 3 groups of 4 -- f32x4 would allow
// groups of 4, but would require narrowing offset/modSpeed to float,
// touching a type used throughout the rest of the file for no measured
// benefit here, so this stays in double precision to match scalar exactly.
void applyDiffusionGeometryPairSimd(
  SabrinaDelay& delayA,
  SabrinaDelay& delayB,
  double maxDelaySize,
  double sizeFactor,
  double lfoSpeed,
  double lfoVariation,
  double sampleRate
) {
  const v128_t rndOffset = wasm_f64x2_make(delayA.rndOffset, delayB.rndOffset);
  const v128_t rndMod = wasm_f64x2_make(delayA.rndMod, delayB.rndMod);

  const v128_t offset = wasm_f64x2_add(
    wasm_f64x2_mul(wasm_f64x2_splat(maxDelaySize * sizeFactor), rndOffset),
    wasm_f64x2_splat(1.0)
  );

  const v128_t seconds = wasm_f64x2_add(wasm_f64x2_splat(lfoSpeed), wasm_f64x2_mul(rndMod, wasm_f64x2_splat(lfoVariation)));
  const v128_t safeSeconds = wasm_f64x2_pmax(seconds, wasm_f64x2_splat(0.000001));
  const v128_t modSpeed = wasm_f64x2_div(wasm_f64x2_div(wasm_f64x2_splat(1.0), safeSeconds), wasm_f64x2_splat(sampleRate));

  double offsetLanes[2];
  double modSpeedLanes[2];
  wasm_v128_store(offsetLanes, offset);
  wasm_v128_store(modSpeedLanes, modSpeed);
  delayA.offset = offsetLanes[0];
  delayB.offset = offsetLanes[1];
  delayA.modSpeed = modSpeedLanes[0];
  delayB.modSpeed = modSpeedLanes[1];
}

// Derives delay-line offsets/LFO speed from the ramped (smoothed*) copies of
// the params, never the raw target values -- called every sample so tap
// length changes glide instead of snapping.
void applyDelayGeometry(SabrinaState& state) {
  const double maxDelaySize = state.sampleRate * 4.0;
  const double lfoSpeed = ((1.0 - state.smoothedLfoBaseSpeed) * 1.95 + 0.5) * 0.5;
  const double lfoVariation = (1.0 - state.smoothedLfoVariation) * 0.25;
  const double diffusionSizeFactor = state.smoothedDiffusionSize * 0.1 + 0.0000001;
  const double sharedFeedback = state.diffusionAmount;
  const double sharedLfopercent = state.smoothedLfoAmplitude * 0.1;
  static_assert(kDiffusionCount % 2 == 0, "diffusion geometry SIMD kernel processes delay lines in pairs");
  for (int index = 0; index < kDiffusionCount; index += 2) {
    SabrinaDelay& delayA = state.delays[index];
    SabrinaDelay& delayB = state.delays[index + 1];
    applyDiffusionGeometryPairSimd(delayA, delayB, maxDelaySize, diffusionSizeFactor, lfoSpeed, lfoVariation, state.sampleRate);
    delayA.feedback = sharedFeedback;
    delayB.feedback = sharedFeedback;
    delayA.lfopercent = sharedLfopercent;
    delayB.lfopercent = sharedLfopercent;
  }
  for (int index = kDiffusionCount; index < kDelayCount; index += 1) {
    SabrinaDelay& delay = state.delays[index];
    delay.offset = (maxDelaySize - 2.0) * state.smoothedDelaySize * 0.1 + 1.0;
    delay.lfopercent = state.smoothedLfoAmplitude * 0.1;
    initializeMod(delay, lfoSpeed, lfoVariation, state.sampleRate);
  }
}

// Mirrors soemdsp::filter::SmootherBase::needsSmoothing(): true only while at
// least one ramped copy is still meaningfully short of its target. Once a
// patch settles (no param changes, no modulation), every smoothed* field
// sits within epsilon of its target and this goes false -- letting
// advanceSabrinaSmoothing skip applyDelayGeometry's 14-delay-line recompute
// entirely instead of redoing it, unchanged, every single sample forever.
bool sabrinaSmoothingNeedsWork(const SabrinaState& state) {
  auto near = [](double a, double b) { return near_planck(a, b); };
  return !(
    near(state.smoothedDiffusionSize, state.diffusionSize) &&
    near(state.smoothedDelaySize, state.delaySize) &&
    near(state.smoothedLfoAmplitude, state.lfoAmplitude) &&
    near(state.smoothedLfoBaseSpeed, state.lfoBaseSpeed) &&
    near(state.smoothedLfoVariation, state.lfoVariation)
  );
}

// Advances the smoothed* fields one step toward their targets and reapplies
// delay geometry. Call once per sample. No-ops once converged (see
// sabrinaSmoothingNeedsWork) so a settled/unmodulated instance costs nothing.
//
// This is DSP safety smoothing, not UI/edit smoothing -- the caller's own
// edit smoothing already handles ordinary parameter drags. delaySize and
// diffusionSize still need it here because they feed a delay-line read
// offset directly: a hard-step caller (patch load, script write, or
// anything else that bypasses edit smoothing) would otherwise teleport the
// read position and click, confirmed by direct A/B measurement (~5.5-7.6x
// larger output discontinuity with this ramp bypassed vs. enabled on a hard
// step; no measurable difference during an already-smoothed drag). The LFO
// parameters are smoothed here too, but that's conservative legacy
// behavior pending audio/render validation, not a confirmed safety need.
// Transcribed from soemdsp/dynamics/SilenceDetector.hpp.
// increment = timeToIncrement(1.0) = 1/sr. Any |level| >= Planck (1e-7)
// resets the clock; once the clock passes 1.0 the reverb is idle.
bool sabrinaSilenceDetectorRun(SabrinaState& state, double level) {
  const double absIn = __builtin_fabs(level);
  state.idleClock += state.idleIncrement;
  if (absIn >= kPlanck) {
    state.isIdle = false;
    state.idleClock = 0.0;
  } else if (state.idleClock > 1.0) {
    state.isIdle = true;
  }
  return state.isIdle;
}

bool sabrinaIdleFromPorts(SabrinaState& state, double inL, double inR) {
  return sabrinaSilenceDetectorRun(
    state,
    inL + inR + state.ch0 + state.ch1 + state.lastLeft + state.lastRight + state.lastWet
  );
}

void advanceSabrinaSmoothing(SabrinaState& state) {
  if (!sabrinaSmoothingNeedsWork(state)) {
    return;
  }
  state.smoothedDiffusionSize = smoothStep(state.smoothedDiffusionSize, state.diffusionSize, state.paramSmoothAlpha);
  state.smoothedDelaySize = smoothStep(state.smoothedDelaySize, state.delaySize, state.paramSmoothAlpha);
  state.smoothedLfoAmplitude = smoothStep(state.smoothedLfoAmplitude, state.lfoAmplitude, state.paramSmoothAlpha);
  state.smoothedLfoBaseSpeed = smoothStep(state.smoothedLfoBaseSpeed, state.lfoBaseSpeed, state.paramSmoothAlpha);
  state.smoothedLfoVariation = smoothStep(state.smoothedLfoVariation, state.lfoVariation, state.paramSmoothAlpha);
  applyDelayGeometry(state);
}

// Block-processing boundary: params/state are read once per sample inside
// the loop exactly as soemdsp_sabrina_reverb_process does, but frameCount
// samples are produced in one call instead of one JS<->WASM crossing per
// sample. Scalar and SIMD implementations sit behind this identical
// (state, in, out, frameCount) shape -- same pattern as
// fbmProcessBlockScalar/Simd in fractal_brownian_noise.cpp.
//
// Scalar path calls the original single-channel delaySample/diffuseSample
// twice per stage (the pre-SIMD algorithm, still present and unused by the
// live per-sample API since that was switched to the paired kernels).
void sabrinaProcessBlockScalar(SabrinaState& state, const double* leftIn, const double* rightIn, double* leftOut, double* rightOut, int frameCount) {
  for (int frame = 0; frame < frameCount; frame += 1) {
    const double dryLeft = finite(leftIn[frame]) ? leftIn[frame] : 0.0;
    const double dryRight = finite(rightIn[frame]) ? rightIn[frame] : dryLeft;
    if (sabrinaIdleFromPorts(state, dryLeft, dryRight)) {
      leftOut[frame] = state.lastLeft;
      rightOut[frame] = state.lastRight;
      continue;
    }
    advanceSabrinaSmoothing(state);
    const double preLeft = delaySample(state.delays[12], state.ch1);
    const double preRight = delaySample(state.delays[13], state.ch0);
    double left = dryLeft + preLeft * state.recycle;
    double right = dryRight + preRight * state.recycle;
    for (int index = 0; index < 6; index += 1) {
      const double outLeft = diffuseSample(state.delays[index * 2], left);
      const double outRight = diffuseSample(state.delays[index * 2 + 1], right);
      left = outLeft;
      right = outRight;
    }
    state.ch0 = finite(left) ? clamp(left, -16.0, 16.0) : 0.0;
    state.ch1 = finite(right) ? clamp(right, -16.0, 16.0) : 0.0;
    const double mixLeft = state.ch0 * state.mix + dryLeft * (1.0 - state.mix);
    const double mixRight = state.ch1 * state.mix + dryRight * (1.0 - state.mix);
    state.lastLeft = mixLeft;
    state.lastRight = mixRight;
    state.lastWet = (state.ch0 + state.ch1) * 0.5;
    leftOut[frame] = mixLeft;
    rightOut[frame] = mixRight;
  }
}

// SIMD path -- identical structure, calls the already-committed paired
// kernels (one f64x2 lane per stereo channel) that soemdsp_sabrina_reverb_process
// already uses live, per sample.
void sabrinaProcessBlockSimd(SabrinaState& state, const double* leftIn, const double* rightIn, double* leftOut, double* rightOut, int frameCount) {
  for (int frame = 0; frame < frameCount; frame += 1) {
    const double dryLeft = finite(leftIn[frame]) ? leftIn[frame] : 0.0;
    const double dryRight = finite(rightIn[frame]) ? rightIn[frame] : dryLeft;
    if (sabrinaIdleFromPorts(state, dryLeft, dryRight)) {
      leftOut[frame] = state.lastLeft;
      rightOut[frame] = state.lastRight;
      continue;
    }
    advanceSabrinaSmoothing(state);
    double preLeft, preRight;
    delaySamplePairSimd(state.delays[12], state.delays[13], state.ch1, state.ch0, preLeft, preRight);
    double left = dryLeft + preLeft * state.recycle;
    double right = dryRight + preRight * state.recycle;
    for (int index = 0; index < 6; index += 1) {
      double outLeft, outRight;
      diffuseSamplePairSimd(state.delays[index * 2], state.delays[index * 2 + 1], left, right, outLeft, outRight);
      left = outLeft;
      right = outRight;
    }
    state.ch0 = finite(left) ? clamp(left, -16.0, 16.0) : 0.0;
    state.ch1 = finite(right) ? clamp(right, -16.0, 16.0) : 0.0;
    const double mixLeft = state.ch0 * state.mix + dryLeft * (1.0 - state.mix);
    const double mixRight = state.ch1 * state.mix + dryRight * (1.0 - state.mix);
    state.lastLeft = mixLeft;
    state.lastRight = mixRight;
    state.lastWet = (state.ch0 + state.ch1) * 0.5;
    leftOut[frame] = mixLeft;
    rightOut[frame] = mixRight;
  }
}

void resetState(SabrinaState& state, double sampleRate) {
  state.active = true;
  state.sampleRate = clamp(sampleRate, 1.0, 192000.0);
  state.ch0 = 0.0;
  state.ch1 = 0.0;
  state.lastLeft = 0.0;
  state.lastRight = 0.0;
  state.lastWet = 0.0;
  state.isIdle = true;
  state.idleClock = 0.0;
  state.idleIncrement = 1.0 / state.sampleRate;
  state.mix = 0.43;
  state.diffusionSize = 0.35;
  state.diffusionAmount = 0.70;
  state.delaySize = 0.02;
  state.recycle = 0.70;
  state.lfoAmplitude = 0.07;
  state.lfoBaseSpeed = 0.83;
  state.lfoVariation = 0.001;
  state.smoothedDiffusionSize = state.diffusionSize;
  state.smoothedDelaySize = state.delaySize;
  state.smoothedLfoAmplitude = state.lfoAmplitude;
  state.smoothedLfoBaseSpeed = state.lfoBaseSpeed;
  state.smoothedLfoVariation = state.lfoVariation;
  state.paramSmoothAlpha = 1.0 - expApprox(-1.0 / (kParamSmoothSeconds * state.sampleRate));
  reseedDelays(state, 0);
  applyDelayGeometry(state);
}

SabrinaState* stateForHandle(int handle) {
  if (handle <= 0 || handle > kMaxInstances) {
    return nullptr;
  }
  SabrinaState& state = states[handle - 1];
  return state.active ? &state : nullptr;
}
}  // namespace

extern "C" int soemdsp_sabrina_reverb_create(double sampleRate) {
  for (int index = 0; index < kMaxInstances; index += 1) {
    if (!states[index].active) {
      resetState(states[index], sampleRate);
      return index + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_sabrina_reverb_destroy(int handle) {
  SabrinaState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  state->active = false;
}

extern "C" void soemdsp_sabrina_reverb_reset(int handle, double sampleRate) {
  SabrinaState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  resetState(*state, sampleRate);
}

extern "C" void soemdsp_sabrina_reverb_set_params(
  int handle,
  double mix,
  double diffusionSize,
  double diffusionAmount,
  double delaySize,
  double recycle,
  double lfoAmplitude,
  double lfoBaseSpeed,
  double lfoVariation,
  double seed
) {
  SabrinaState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  // DirtyUpdater-style (soemdsp::DirtyUpdater + Reverb Wires): only run the
  // work a field actually owns. Mix has no *Changed() in soemdsp::delay::Reverb
  // -- it is a Wire read in drywet() -- so a mix poke must never rebuild
  // delay geometry or rewrite diffusion feedback.
  auto near = [](double a, double b) { return near_planck(a, b); };
  auto assignIf = [&](double& dst, double next) {
    if (!near(dst, next)) {
      dst = next;
      return true;
    }
    return false;
  };

  assignIf(state->mix, clamp(mix, 0.0, 1.0));
  assignIf(state->recycle, clamp(recycle, 0.0, 0.98));

  if (assignIf(state->diffusionAmount, clamp(diffusionAmount, 0.0, 0.98))) {
    for (int index = 0; index < kDiffusionCount; index += 1) {
      state->delays[index].feedback = state->diffusionAmount;
    }
  }

  assignIf(state->diffusionSize, clamp(diffusionSize, 0.0, 1.0));
  assignIf(state->delaySize, clamp(delaySize, 0.0, 1.0));
  assignIf(state->lfoAmplitude, clamp(lfoAmplitude, 0.0, 1.0));
  assignIf(state->lfoBaseSpeed, clamp(lfoBaseSpeed, 0.0, 1.0));
  assignIf(state->lfoVariation, clamp(lfoVariation, 0.0, 1.0));

  const int seedInt = static_cast<int>(seed + 0.5);
  if (seedInt != state->seed) {
    reseedDelays(*state, seedInt);
    applyDelayGeometry(*state);
  }
}

extern "C" void soemdsp_sabrina_reverb_process(int handle, double leftInput, double rightInput) {
  SabrinaState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  const double dryLeft = finite(leftInput) ? leftInput : 0.0;
  const double dryRight = finite(rightInput) ? rightInput : dryLeft;
  if (sabrinaIdleFromPorts(*state, dryLeft, dryRight)) {
    return;
  }
  advanceSabrinaSmoothing(*state);
  // Left and right channels are independent within this call (cross-feed
  // only happens via ch0/ch1 persisted from the *previous* call), so both
  // chains are processed together, one SIMD lane per channel, instead of
  // two full sequential passes.
  double preLeft, preRight;
  delaySamplePairSimd(state->delays[12], state->delays[13], state->ch1, state->ch0, preLeft, preRight);
  double left = dryLeft + preLeft * state->recycle;
  double right = dryRight + preRight * state->recycle;
  for (int index = 0; index < 6; index += 1) {
    double outLeft, outRight;
    diffuseSamplePairSimd(state->delays[index * 2], state->delays[index * 2 + 1], left, right, outLeft, outRight);
    left = outLeft;
    right = outRight;
  }
  state->ch0 = finite(left) ? clamp(left, -16.0, 16.0) : 0.0;
  state->ch1 = finite(right) ? clamp(right, -16.0, 16.0) : 0.0;
  state->lastLeft = state->ch0 * state->mix + dryLeft * (1.0 - state->mix);
  state->lastRight = state->ch1 * state->mix + dryRight * (1.0 - state->mix);
  state->lastWet = (state->ch0 + state->ch1) * 0.5;
}

// Block-processing boundary. Caller writes frameCount dry samples into the
// buffers returned by the _input_*_ptr getters (zero-copy Float64Array view
// into WASM memory), calls this once, then reads mixed output back from the
// _output_*_ptr buffers the same way -- one JS<->WASM crossing per block
// instead of one per sample. useSimd selects sabrinaProcessBlockSimd (the
// live per-sample kernel's algorithm) or sabrinaProcessBlockScalar (the
// pre-SIMD reference); a real caller always passes 1, same rationale as
// fractal_brownian_noise's process_block -- the switch exists so both paths
// can be verified through one identical entry point.
extern "C" void soemdsp_sabrina_reverb_process_block(int handle, int frameCount, int useSimd) {
  SabrinaState* state = stateForHandle(handle);
  if (!state) {
    return;
  }
  const int safeFrameCount = frameCount < 1 ? 1 : (frameCount > kMaxBlockFrames ? kMaxBlockFrames : frameCount);
  if (useSimd) {
    sabrinaProcessBlockSimd(*state, state->blockInLeft, state->blockInRight, state->blockOutLeft, state->blockOutRight, safeFrameCount);
  } else {
    sabrinaProcessBlockScalar(*state, state->blockInLeft, state->blockInRight, state->blockOutLeft, state->blockOutRight, safeFrameCount);
  }
}

extern "C" int soemdsp_sabrina_reverb_block_input_left_ptr(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockInLeft) : 0;
}

extern "C" int soemdsp_sabrina_reverb_block_input_right_ptr(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockInRight) : 0;
}

extern "C" int soemdsp_sabrina_reverb_block_output_left_ptr(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockOutLeft) : 0;
}

extern "C" int soemdsp_sabrina_reverb_block_output_right_ptr(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? reinterpret_cast<int>(state->blockOutRight) : 0;
}

extern "C" int soemdsp_sabrina_reverb_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" double soemdsp_sabrina_reverb_left(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? state->lastLeft : 0.0;
}

extern "C" double soemdsp_sabrina_reverb_right(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? state->lastRight : 0.0;
}

extern "C" double soemdsp_sabrina_reverb_wet(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? state->lastWet : 0.0;
}

extern "C" double soemdsp_sabrina_reverb_wet_left(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? state->ch0 : 0.0;
}

extern "C" double soemdsp_sabrina_reverb_wet_right(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state ? state->ch1 : 0.0;
}

extern "C" int soemdsp_sabrina_reverb_is_idle(int handle) {
  SabrinaState* state = stateForHandle(handle);
  return state && state->isIdle ? 1 : 0;
}

extern "C" int soemdsp_sabrina_reverb_version() {
  return 2;
}
