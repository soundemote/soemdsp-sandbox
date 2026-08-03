// Sample & Hold — pure hold/trigger math (main thread JS path).
// Noise fallback when In is unwired uses shared seeded noise helpers if present.

function createNodeGraphSampleHoldState() {
  return {
    clockPhase: 0,
    held: 0,
    lastTrigger: 0,
    noise: typeof createNodeGraphNoiseGeneratorChannelState === "function"
      ? createNodeGraphNoiseGeneratorChannelState()
      : { seed: 1 },
  };
}

function createNodeGraphStereoSampleHoldState() {
  return {
    left: createNodeGraphSampleHoldState(),
    mono: createNodeGraphSampleHoldState(),
    right: createNodeGraphSampleHoldState(),
  };
}

/**
 * @returns {number} held value
 */
function nodeGraphSampleHoldCore(
  state,
  input,
  trigger,
  threshold,
  sampleFrequency,
  sampleRate,
  hasInConnected,
  seedKey = "sampleHold",
) {
  if (typeof nodeGraphResetSeededState === "function") {
    nodeGraphResetSeededState(state.noise, seedKey, 0, "sampleHoldNoise");
  }
  const safeInput = hasInConnected
    ? (Number(input) || 0)
    : (typeof nodeGraphNextSeededBipolar === "function"
      ? nodeGraphNextSeededBipolar(state.noise)
      : 0);
  const safeTrigger = Number(trigger) || 0;
  const safeThreshold = Number(threshold) || 0;
  const safeFreq = Math.max(0, Number(sampleFrequency) || 0);
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  let internalFire = false;
  if (safeFreq > 0) {
    state.clockPhase += safeFreq / safeRate;
    if (state.clockPhase >= 1) {
      state.clockPhase -= Math.floor(state.clockPhase);
      internalFire = true;
    }
  }
  if ((state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) || internalFire) {
    state.held = safeInput;
  }
  state.lastTrigger = safeTrigger;
  return Number(state.held) || 0;
}
