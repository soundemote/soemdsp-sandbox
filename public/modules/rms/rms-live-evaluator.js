// Offline/render-time dispatch. Pure math: rms-math.js.

function nodeGraphRmsReadLiveOptions(runtime, node, frame, frames, frameValues) {
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return {
    windowSec: read("window", 0.05),
    attackSec: read("attack", 0),
    releaseSec: read("release", 0.15),
    thresholdDb: read("thresholdDb", -12),
    peakHoldSec: read("peakHold", 0),
    logMode: read("logMode", 1),
  };
}

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
  return nodeGraphRmsSample(
    state,
    mixInput(nodeId, "In"),
    nodeGraphRmsReadLiveOptions(runtime, node, frame, frames, frameValues),
    sampleRate,
    hasInput(nodeId, "In"),
  );
};

nodeGraphLiveModuleEvaluators.rmsStereo = ({
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
  return nodeGraphRmsStereoSample(
    state,
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    nodeGraphRmsReadLiveOptions(runtime, node, frame, frames, frameValues),
    sampleRate,
    hasInput(nodeId, "Left"),
    hasInput(nodeId, "Right"),
  );
};
