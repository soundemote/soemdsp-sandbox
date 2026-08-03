// Random Clock — offline/render. Pure math: random-clock-math.js.

nodeGraphLiveModuleEvaluators.randomClock = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  const state = runtime.randomClockStates.get(nodeId) || createNodeGraphRandomClockState();
  runtime.randomClockStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const out = nodeGraphRandomClockCore(
    state,
    nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, null, "random clock reset"),
    {
      duty: nodeGraphSafeFilterNumber(read("duty", 0.5), runtime, nodeId, null, "random clock duty"),
      level: nodeGraphSafeFilterNumber(read("level", 1), runtime, nodeId, null, "random clock level"),
      maxSeconds: nodeGraphSafeFilterNumber(read("maxSeconds", 1), runtime, nodeId, null, "random clock max"),
      minSeconds: nodeGraphSafeFilterNumber(read("minSeconds", 0.25), runtime, nodeId, null, "random clock min"),
      seed: read("seed", 1),
      threshold: nodeGraphSafeFilterNumber(read("threshold", 0), runtime, nodeId, null, "random clock reset threshold"),
      triggerTime: nodeGraphSafeFilterNumber(read("triggerTime", 0.01), runtime, nodeId, null, "random clock trigger"),
    },
    sampleRate,
    nodeId,
  );
  return {
    Gate: nodeGraphSafeFilterNumber(out.Gate, runtime, nodeId, null, "random clock gate"),
    Trigger: nodeGraphSafeFilterNumber(out.Trigger, runtime, nodeId, null, "random clock trigger output"),
  };
};
