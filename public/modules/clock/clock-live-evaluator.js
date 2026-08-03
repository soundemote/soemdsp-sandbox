// Clock — offline/render. Pure math: clock-math.js.

nodeGraphLiveModuleEvaluators.clock = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  const state = runtime.clockStates.get(nodeId) || createNodeGraphClockState();
  runtime.clockStates.set(nodeId, state);
  const out = nodeGraphClockCore(
    state,
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "clock reset"),
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "clock phase",
    ),
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "rate", 2, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "clock rate",
    ),
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "duty", 0.5, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "clock duty",
    ),
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "level", 1, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "clock level",
    ),
    sampleRate,
  );
  return {
    "Analog Out": nodeGraphSafeFilterNumber(out["Analog Out"], runtime, nodeId, null, "clock analog"),
    "Digital Out": nodeGraphSafeFilterNumber(out["Digital Out"], runtime, nodeId, null, "clock digital"),
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, null, "clock out"),
    Pulse: nodeGraphSafeFilterNumber(out.Pulse, runtime, nodeId, null, "clock pulse"),
  };
};
