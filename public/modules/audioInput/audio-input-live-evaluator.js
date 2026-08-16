// Input: live host + wired Mono/Left/Right.
nodeGraphLiveModuleEvaluators.audioInput = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput,
}) => {
  const live = nodeGraphDspExternalStereoFrame(
    runtime.externalInput,
    frame,
    readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues),
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
