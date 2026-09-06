// Transport — offline/render. Pure math: transport-math.js.

nodeGraphLiveModuleEvaluators.transport = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const absoluteFrame = Number.isFinite(runtime.absoluteFrame) ? runtime.absoluteFrame : frame;
  const timing = typeof normalizeNodeGraphPatchTiming === "function"
    ? normalizeNodeGraphPatchTiming(runtime?.timing)
    : { tempoBpm: 120 };
  const bpm = read("bpm", timing.tempoBpm);
  const out = nodeGraphTransportCore(
    {
      amplitude: nodeGraphSafeFilterNumber(read("amplitude", 1), runtime, nodeId, null, "transport amplitude"),
      timeNumerator: read("timeNumerator", 1),
      timeDenominator: read("timeDenominator", 4),
      timingMode: read("timingMode", 0),
      pulseWidth: read("pulseWidth", 0.5),
    },
    absoluteFrame,
    sampleRate,
    Number.isFinite(Number(bpm)) && Number(bpm) > 0 ? Number(bpm) : timing.tempoBpm,
  );
  return {
    "Gate -1+1": nodeGraphSafeFilterNumber(out["Gate -1+1"], runtime, nodeId, null, "transport gate -1+1"),
    "Gate 0-1": nodeGraphSafeFilterNumber(out["Gate 0-1"], runtime, nodeId, null, "transport gate 0-1"),
    Trigger: nodeGraphSafeFilterNumber(out.Trigger, runtime, nodeId, null, "transport trigger"),
    f: nodeGraphSafeFilterNumber(out.f, runtime, nodeId, null, "transport f"),
  };
};
