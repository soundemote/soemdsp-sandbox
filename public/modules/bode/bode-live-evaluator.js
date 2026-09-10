// Bode Shifter — offline/render.

nodeGraphLiveModuleEvaluators.bode = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.bodeStates) runtime.bodeStates = new Map();
  let state = runtime.bodeStates.get(nodeId);
  if (!state) {
    state = createNodeGraphBodeState();
    runtime.bodeStates.set(nodeId, state);
  }

  const shift = readNodeGraphLiveEffectiveParam(runtime, node, "shift", 0, frame, frames, frameValues);
  const fine = readNodeGraphLiveEffectiveParam(runtime, node, "fine", 0, frame, frames, frameValues);
  const feedback = readNodeGraphLiveEffectiveParam(runtime, node, "feedback", 0, frame, frames, frameValues);
  const mix = readNodeGraphLiveEffectiveParam(runtime, node, "mix", 1, frame, frames, frameValues);
  const rate = Math.max(1, nodeGraphFiniteNumber(sampleRate, nodeGraphFiniteNumber(nodeGraphMvp?.sampleRate, 44100)));
  const x = nodeGraphFiniteNumber(mixInput(nodeId));
  const y = nodeGraphBodeSample(state, x, shift, fine, feedback, mix, rate);
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "bode")
    : y;
};
