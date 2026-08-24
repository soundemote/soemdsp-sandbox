// Offline/render-time dispatch. Pure math: rms-math.js.

nodeGraphLiveModuleEvaluators.rms = ({
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
  if (!runtime.rmsStates) runtime.rmsStates = new Map();
  const state = runtime.rmsStates.get(nodeId) || createNodeGraphRmsState();
  runtime.rmsStates.set(nodeId, state);
  const windowSec = readNodeGraphLiveEffectiveParam(runtime, node, "window", 0.05, frame, frames, frameValues);
  const thresholdDb = readNodeGraphLiveEffectiveParam(runtime, node, "thresholdDb", -12, frame, frames, frameValues);
  return nodeGraphRmsSample(
    state,
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Mono"),
    mixInput(nodeId, "Right"),
    windowSec,
    thresholdDb,
    sampleRate,
    hasInput(nodeId, "Left"),
    hasInput(nodeId, "Mono"),
    hasInput(nodeId, "Right"),
  );
};
