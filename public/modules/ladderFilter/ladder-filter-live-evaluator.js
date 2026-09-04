// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphLadderFilterState() {
  return {
    y: [0, 0, 0, 0, 0],
  };
}

// Mix / feedback / coefficients live in node-graph-shared-dsp-helpers.js so
// filter-curve faces work in release (this live-evaluator file is not loaded).

function nodeGraphLadderFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "ladder filter input");
  const coeff = nodeGraphLadderFilterCoefficients(
    params.frequency,
    params.resonance,
    params.mode,
    params.stages,
    sampleRate,
    runtime,
    nodeId,
    state,
  );
  const y = Array.isArray(state.y) && state.y.length >= 5 ? state.y : [0, 0, 0, 0, 0];
  state.y = y;
  y[0] = coeff.g * safeInput - coeff.k * y[4];
  y[0] = y[0] / (1 + y[0] * y[0]);
  y[1] = y[0] + coeff.a * (y[0] - y[1]);
  y[2] = y[1] + coeff.a * (y[1] - y[2]);
  y[3] = y[2] + coeff.a * (y[2] - y[3]);
  y[4] = y[3] + coeff.a * (y[3] - y[4]);
  for (let index = 0; index < y.length; index += 1) {
    y[index] = nodeGraphSafeFilterNumber(y[index], runtime, nodeId, state, `ladder filter stage ${index}`);
  }
  const output = coeff.c[0] * y[0] + coeff.c[1] * y[1] + coeff.c[2] * y[2] + coeff.c[3] * y[3] + coeff.c[4] * y[4];
  return nodeGraphSafeFilterNumber(output, runtime, nodeId, state, "ladder filter output");
}


// Registers the offline/render-time dispatch handler for ladderFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.ladderFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.ladderFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphLadderFilterState);
  runtime.ladderFilterStates.set(nodeId, state);
  const ladderParams = {
    frequency: nodeGraphFrequencyHzFromKnobOrF(
      readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues),
      hasInput,
      mixInput,
      nodeId,
    ),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 1, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
    stages: readNodeGraphLiveEffectiveParam(runtime, node, "stages", 4, frame, frames, frameValues),
  };
  const ladderMono = mixInput(nodeId);
  return {
    Out: nodeGraphLadderFilterSample(state.mono, ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphLadderFilterSample(state.left, mixInput(nodeId, "Left") + ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphLadderFilterSample(state.right, mixInput(nodeId, "Right") + ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
