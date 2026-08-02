nodeGraphLiveModuleEvaluators.textStream = ({
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
  if (!runtime.textStreamStates) {
    runtime.textStreamStates = new Map();
  }
  const state = runtime.textStreamStates.get(nodeId) || createNodeGraphTextStreamState();
  runtime.textStreamStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const store = typeof normalizeNodeGraphTextStream === "function"
    ? normalizeNodeGraphTextStream(node?.textStream)
    : { message: TEXT_STREAM_DEFAULT_MESSAGE };
  const clockConnected = typeof hasInput === "function" ? hasInput(nodeId, "Clock") : false;
  return nodeGraphTextStreamSample(state, {
    message: store.message,
    rate: read("rate", 8),
    loop: Math.round(read("loop", 1)) >= 1,
    clock: mixInput(nodeId, "Clock"),
    reset: mixInput(nodeId, "Reset"),
    clockConnected,
    sampleRate,
  });
};
