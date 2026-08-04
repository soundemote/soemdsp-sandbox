// Sample Delay — offline/render-time. Pure math: sample-delay-math.js.

nodeGraphLiveModuleEvaluators.sampleDelay = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.sampleDelayStates.get(nodeId) || createNodeGraphSampleDelayState();
  runtime.sampleDelayStates.set(nodeId, state);
  const raw = nodeGraphSafeFilterNumber(mixInput(nodeId, "In"), runtime, nodeId, null, "sample delay in");
  const timeSeconds = Math.max(
    0,
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "time", 0, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "sample delay time",
    ),
  );
  const samplesParam = Math.max(
    0,
    nodeGraphSafeFilterNumber(
      readNodeGraphLiveEffectiveParam(runtime, node, "samples", 0, frame, frames, frameValues),
      runtime,
      nodeId,
      null,
      "sample delay samples",
    ),
  );
  const out = nodeGraphSampleDelayRingSample(state, raw, timeSeconds, samplesParam, sampleRate);
  return {
    // Dry (Thru) before wet (Delayed).
    Thru: out.raw,
    Delayed: nodeGraphSafeFilterNumber(out.delayed, runtime, nodeId, null, "sample delay delayed"),
  };
};
