// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphPingPongDelayTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
  if (rounded === 1) {
    return 1.5; // Dotted
  }
  if (rounded === 2) {
    return 2 / 3; // Triplet: three fit in the space of two normal notes
  }
  return 1; // Normal
}
function nodeGraphPingPongDelayFraction(numerator, denominator) {
  const effectiveNumerator = Math.max(0, Number(numerator) || 0);
  if (effectiveNumerator === 0) {
    return 0;
  }
  const effectiveDenominator = Math.max(0, Number(denominator) || 0);
  return effectiveNumerator / Math.max(1, effectiveDenominator);
}


function nodeGraphPingPongDelaySeconds(params, runtime) {
  const timing = normalizeNodeGraphPatchTiming(runtime?.timing);
  const secondsPerWholeNote = 240 / Math.max(1, Number(timing.tempoBpm) || 120);
  const fraction = nodeGraphPingPongDelayFraction(params.timeNumerator, params.timeDenominator);
  const syncedSeconds = secondsPerWholeNote * fraction * nodeGraphPingPongDelayTimingModeMultiplier(params.timingMode);
  const offsetSeconds = (Number(params.offsetMs) || 0) / 1000;
  return syncedSeconds + offsetSeconds;
}


function createNodeGraphPingPongDelayState() {
  return {
    bufferL: new Float32Array(1),
    bufferR: new Float32Array(1),
    bufferSize: 1,
    position: 0,
    wetL: 0,
    wetR: 0,
  };
}

function nodeGraphPingPongDelaySample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const maxDelaySeconds = 8;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.bufferL || state.bufferSize !== requiredSize) {
    state.bufferL = new Float32Array(requiredSize);
    state.bufferR = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.wetL = 0;
    state.wetR = 0;
  }
  const dry = nodeGraphSafeFilterNumber(input, runtime, nodeId, null, "ping pong delay input");
  const feedback = Math.max(0, Math.min(0.95, nodeGraphSafeFilterNumber(params.feedback, runtime, nodeId, null, "ping pong delay feedback")));
  const mix = Math.max(0, Math.min(1, nodeGraphSafeFilterNumber(params.mix, runtime, nodeId, null, "ping pong delay mix")));
  const level = Math.max(0, Math.min(2, nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "ping pong delay level")));

  // The computed time is what gets bounded to fit the (necessarily finite)
  // delay buffer -- timeNumerator/timeDenominator/offsetMs themselves are
  // read as-is above, in nodeGraphPingPongDelaySeconds, with no clamp.
  const rawSeconds = nodeGraphPingPongDelaySeconds(params, runtime);
  const safeSeconds = Number.isFinite(rawSeconds) ? Math.max(0, rawSeconds) : 0;
  const delaySamples = Math.min(state.bufferSize - 2, Math.max(1, safeSeconds * safeRate));

  state.position = (state.position + 1) % state.bufferSize;
  const readPosition = (state.position + state.bufferSize - delaySamples) % state.bufferSize;
  const readL = nodeGraphDelayInterpolateLinear(state.bufferL, readPosition);
  const readR = nodeGraphDelayInterpolateLinear(state.bufferR, readPosition);

  // Classic ping-pong topology: the input only ever enters the left line;
  // the right line is driven purely by the left line's own feedback, so a
  // single input bounces left -> right -> left -> right as it decays.
  const writeL = dry + readR * feedback;
  const writeR = readL * feedback;
  state.bufferL[state.position] = Math.max(-8, Math.min(8, writeL));
  state.bufferR[state.position] = Math.max(-8, Math.min(8, writeR));
  state.wetL = readL;
  state.wetR = readR;

  return {
    Left: (dry * (1 - mix) + state.wetL * mix) * level,
    Right: (dry * (1 - mix) + state.wetR * mix) * level,
  };
}


// Registers the offline/render-time dispatch handler for pingPongDelay into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.pingPongDelay = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.pingPongDelayStates.get(nodeId) || createNodeGraphPingPongDelayState();
  runtime.pingPongDelayStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPingPongDelaySample(
    state,
    mixInput(nodeId) + mixInput(nodeId, "Left") + mixInput(nodeId, "Right"),
    {
      feedback: read("feedback", 0.35),
      level: read("level", 1),
      mix: read("mix", 0.35),
      offsetMs: read("offsetMs", 0),
      timeDenominator: read("timeDenominator", 4),
      timeNumerator: read("timeNumerator", 1),
      timingMode: read("timingMode", 0),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
