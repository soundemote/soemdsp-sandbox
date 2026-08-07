// Waveguide — offline/render (under construction: passthrough).

nodeGraphLiveModuleEvaluators.waveguide = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  if (!runtime.waveguideStates) runtime.waveguideStates = new Map();
  let state = runtime.waveguideStates.get(nodeId);
  if (!state) {
    state = createNodeGraphWaveguideState();
    runtime.waveguideStates.set(nodeId, state);
  }
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);
  const audioIn = Number(mixInput(nodeId)) || 0;
  const y = nodeGraphWaveguideSample(state, audioIn, amplitude);
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "waveguide")
    : y;
};
