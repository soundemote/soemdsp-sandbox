// Shared offline JS mirror of native_modules/hypersaw -- Hypersaw, a bank
// of up to 32 bandlimited (PolyBLEP) sawtooth voices spread across the
// phase cycle. See native_modules/hypersaw/hypersaw.cpp for the full
// derivation and the mapping back to soundemote's own HypersawUnit/
// HypersawMaster (docs/reference/Hypersaw.hpp).
//
// Each voice keeps its own phase accumulator at the shared base
// frequency. The accumulator's rendered phase is displaced by three
// independent, additive dispersion sources:
//   spread  -- scales the voice's fixed even position i/numVoices.
//   random  -- scales a fixed random offset drawn once per voice.
//   drift   -- scales a slow, continuously wandering reflecting random
//              walk per-voice offset.
// Center voices (voice 0, and voice 1 if numVoices is even) sum into
// both channels; the rest alternate Left/Right. Each channel is averaged
// (not summed) by its own contributor count so voice count doesn't
// change overall loudness -- same convention as this sandbox's
// RobinSupersaw module.

const nodeGraphHypersawMaxVoices = 32;

function nodeGraphHypersawPolyBlep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

// Shared stdlib (node-graph-phasor-helpers.js).
function nodeGraphHypersawWrap01(x) {
  return nodeGraphWrap01(x);
}

function nodeGraphHypersawCreateVoice() {
  return {
    phase: 0,
    randomOffset: Math.random() - 0.5,
    driftLp: 0,
  };
}

function createNodeGraphHypersawState() {
  const voices = [];
  for (let i = 0; i < nodeGraphHypersawMaxVoices; i++) {
    voices.push(nodeGraphHypersawCreateVoice());
  }
  return { voices };
}

// options: { frequencyHz, sampleRate, phaseOffset (0..1), numVoices (1..32),
//   spread (0..1), randomAmount (0..1), driftAmount (0..1), level }
// returns: { Left, Right, voicePhases: number[] } -- voicePhases is each
// active voice's dispersion offset (0..1, wrapped), in order, for the
// voice-position display. Deliberately excludes the audio-rate phase
// accumulator (that's the pitch itself, sweeping every cycle), so all 3
// dispersion controls at 0 means every voice sits at the same still
// point instead of racing across the display at the oscillator's
// frequency.
function nodeGraphHypersawSample(state, options = {}) {
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const safeFrequency = Number(options.frequencyHz) > 0 ? Number(options.frequencyHz) : 0;
  const phaseOffset = nodeGraphHypersawWrap01(Number(options.phaseOffset) || 0);
  const numVoices = clampNodeSliderValue(Math.round(Number(options.numVoices) || 1), 1, nodeGraphHypersawMaxVoices);
  const spreadAmt = clampNodeSliderValue(Number(options.spread) || 0, 0, 1);
  const randomAmt = clampNodeSliderValue(Number(options.randomAmount) || 0, 0, 1);
  const driftAmt = clampNodeSliderValue(Number(options.driftAmount) || 0, 0, 1);
  const level = Number(options.level) || 0;

  // Drift is a genuine reflecting random walk, NOT a lowpass filter over
  // fresh-every-sample white noise (that was tried first and is a bug --
  // filtering a brand-new random value each sample suppresses its
  // variance to near-nothing at any audio-rate-appropriate coefficient).
  // stepScale is normalized by 1/sqrt(sampleRate) so the walk's diffusive
  // growth reaches a given wander range in the same wall-clock time
  // regardless of sample rate; reflecting at +/-0.5 keeps it bounded
  // while still continuously wandering.
  const driftStepScale = 0.2 / Math.sqrt(sampleRate);
  const phaseIncrement = safeFrequency / sampleRate;

  let leftSum = 0, rightSum = 0;
  let leftCount = 0, rightCount = 0;
  const voicePhases = new Array(numVoices);
  const voiceAmplitudes = new Array(numVoices);
  const voicePans = new Array(numVoices);

  for (let i = 0; i < numVoices; i++) {
    const voice = state.voices[i];
    const basePosition = i / numVoices;
    voice.driftLp += (Math.random() * 2 - 1) * driftStepScale;
    if (voice.driftLp > 0.5) voice.driftLp = 1 - voice.driftLp;
    if (voice.driftLp < -0.5) voice.driftLp = -1 - voice.driftLp;

    const dispersion = basePosition * spreadAmt + voice.randomOffset * randomAmt + voice.driftLp * driftAmt;
    const renderPhase = nodeGraphHypersawWrap01(voice.phase + phaseOffset + dispersion);
    const sawSample = 2 * renderPhase - 1 - nodeGraphHypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1);

    // Display position is dispersion only -- voice.phase runs at the
    // fundamental frequency (that's the pitch itself, not something a
    // "voice position" display should show), so it's excluded here.
    voicePhases[i] = nodeGraphHypersawWrap01(dispersion);
    voiceAmplitudes[i] = sawSample;
    voice.phase = nodeGraphHypersawWrap01(voice.phase + phaseIncrement);

    const isCenter = i === 0 || (i === 1 && numVoices % 2 === 0);
    if (isCenter) {
      voicePans[i] = 0;
      leftSum += sawSample;
      rightSum += sawSample;
      leftCount++;
      rightCount++;
    } else if (i % 2 === 0) {
      voicePans[i] = -1;
      leftSum += sawSample;
      leftCount++;
    } else {
      voicePans[i] = 1;
      rightSum += sawSample;
      rightCount++;
    }
  }

  let left = leftCount > 0 ? leftSum / leftCount : 0;
  let right = rightCount > 0 ? rightSum / rightCount : 0;
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const outLeft = clampNodeSliderValue(left, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(right, -1.5, 1.5) * level;
  return { Left: outLeft, Right: outRight, voicePhases, voiceAmplitudes, voicePans };
}
