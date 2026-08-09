// Offline/render-time dispatch for airClipper. Pure math: air-clipper-math.js.

nodeGraphLiveModuleEvaluators.airClipper = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.airClipperStates) {
    runtime.airClipperStates = new Map();
  }
  const state = runtime.airClipperStates.get(nodeId) || createNodeGraphAirClipperState();
  runtime.airClipperStates.set(nodeId, state);
  const density = readNodeGraphLiveEffectiveParam(runtime, node, "density", 0, frame, frames, frameValues);
  const highpass = readNodeGraphLiveEffectiveParam(runtime, node, "highpass", 0, frame, frames, frameValues);
  const output = readNodeGraphLiveEffectiveParam(runtime, node, "output", 1, frame, frames, frameValues);
  const wet = readNodeGraphLiveEffectiveParam(runtime, node, "wet", 1, frame, frames, frameValues);
  return nodeGraphAirClipperFrame(
    state,
    mixInput(nodeId),
    mixInput(nodeId, "Left"),
    mixInput(nodeId, "Right"),
    density,
    highpass,
    output,
    wet,
    sampleRate,
  );
};
