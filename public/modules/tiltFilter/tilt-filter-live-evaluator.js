// Tilt Filter — offline/render. Pure math: tilt-filter-math.js.
// Credit: Robin Schmidt / RS-MET first-order shelf BLT formulas.

nodeGraphLiveModuleEvaluators.tiltFilter = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  if (!runtime.tiltFilterStates) {
    runtime.tiltFilterStates = new Map();
  }
  const state = runtime.tiltFilterStates.get(nodeId) || createNodeGraphStereoTiltFilterState();
  runtime.tiltFilterStates.set(nodeId, state);
  const amount = readNodeGraphLiveEffectiveParam(runtime, node, "amount", 0, frame, frames, frameValues);
  const knobHz = readNodeGraphLiveEffectiveParam(runtime, node, "pivot", 1000, frame, frames, frameValues);
  const pivot = nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const mono = mixInput(nodeId);
  return {
    Out: nodeGraphSafeFilterNumber(
      nodeGraphTiltFilterSample(state.mono, mono, amount, pivot, rate),
      runtime,
      nodeId,
      state.mono,
      "tilt mono",
    ),
    Left: nodeGraphSafeFilterNumber(
      nodeGraphTiltFilterSample(state.left, mixInput(nodeId, "Left") + mono, amount, pivot, rate),
      runtime,
      nodeId,
      state.left,
      "tilt left",
    ),
    Right: nodeGraphSafeFilterNumber(
      nodeGraphTiltFilterSample(state.right, mixInput(nodeId, "Right") + mono, amount, pivot, rate),
      runtime,
      nodeId,
      state.right,
      "tilt right",
    ),
  };
};
