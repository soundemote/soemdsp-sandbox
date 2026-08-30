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
  const out = nodeGraphTransportCore(
    {
      amplitude: nodeGraphSafeFilterNumber(read("amplitude", 1), runtime, nodeId, null, "transport amplitude"),
      divisions: read("divisions", 0),
    },
    absoluteFrame,
    sampleRate,
    timing.tempoBpm,
  );
  return {
    "-1..1": nodeGraphSafeFilterNumber(out["-1..1"], runtime, nodeId, null, "transport bipolar"),
    "0..1": nodeGraphSafeFilterNumber(out["0..1"], runtime, nodeId, null, "transport unipolar"),
    Trigger: nodeGraphSafeFilterNumber(out.Trigger, runtime, nodeId, null, "transport trigger"),
    f: nodeGraphSafeFilterNumber(out.f, runtime, nodeId, null, "transport f"),
  };
};
