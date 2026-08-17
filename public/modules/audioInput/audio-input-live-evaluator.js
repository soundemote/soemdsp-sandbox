// Input: live host + wired Mono/Left/Right.
nodeGraphLiveModuleEvaluators.audioInput = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput,
}) => {
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", NaN, frame, frames, frameValues);
  const level = Number.isFinite(amplitude)
    ? amplitude
    : readNodeGraphLiveEffectiveParam(runtime, node, "level", 1, frame, frames, frameValues);
  const live = nodeGraphDspExternalStereoFrame(
    runtime.externalInput,
    frame,
    level,
  );
  if (typeof nodeGraphDspSandboxIoFrame === "function") {
    return nodeGraphDspSandboxIoFrame(
      live,
      mixInput(nodeId, "Mono"),
      mixInput(nodeId, "Left"),
      mixInput(nodeId, "Right"),
    );
  }
  return live;
};
