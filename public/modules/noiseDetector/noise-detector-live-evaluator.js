// Offline/render-time dispatch. Pure math: noise-detector-math.js.

nodeGraphLiveModuleEvaluators.noiseDetector = ({
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
  if (!runtime.noiseDetectorStates) runtime.noiseDetectorStates = new Map();
  const state = runtime.noiseDetectorStates.get(nodeId) || createNodeGraphNoiseDetectorState();
  runtime.noiseDetectorStates.set(nodeId, state);
  const threshold = readNodeGraphLiveEffectiveParam(runtime, node, "threshold", 0.9, frame, frames, frameValues);
  return nodeGraphNoiseDetectorSample(
    state,
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Right"),
    threshold,
    sampleRate,
    hasInput(nodeId, "Left"),
    hasInput(nodeId, "Mono"),
    hasInput(nodeId, "Right"),
  );
};
