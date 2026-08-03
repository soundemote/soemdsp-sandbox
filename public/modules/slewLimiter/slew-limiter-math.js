// Slew Limiter — pure math (main thread JS path).

function createNodeGraphSlewLimiterState() {
  return {
    initialized: false,
    out: 0,
  };
}

function createNodeGraphStereoSlewLimiterState() {
  return {
    left: createNodeGraphSlewLimiterState(),
    mono: createNodeGraphSlewLimiterState(),
    right: createNodeGraphSlewLimiterState(),
  };
}

/**
 * Rate-limit a bipolar signal toward target (seconds for full-scale rise/fall).
 */
function nodeGraphSlewLimiterSample(state, input, upTime, downTime, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const target = Number(input) || 0;
  if (!state.initialized) {
    state.initialized = true;
    state.out = target;
    return target;
  }
  const upSeconds = Math.max(0, Number(upTime) || 0);
  const downSeconds = Math.max(0, Number(downTime) || 0);
  const delta = target - state.out;
  const maxRise = upSeconds <= 0 ? Infinity : 1 / Math.max(1, upSeconds * rate);
  const maxFall = downSeconds <= 0 ? Infinity : 1 / Math.max(1, downSeconds * rate);
  state.out = state.out + Math.max(-maxFall, Math.min(maxRise, delta));
  return state.out;
}
