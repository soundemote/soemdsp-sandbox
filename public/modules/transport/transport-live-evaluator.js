// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphTransportDivisionFactor(divisions) {
  const division = Math.round(Number(divisions) || 0);
  if (division > 0) {
    return division + 1;
  }
  if (division < 0) {
    return 1 / (Math.abs(division) + 1);
  }
  return 1;
}


function nodeGraphTransportSample(params, absoluteFrame, sampleRate, runtime = null, nodeId = "") {
  const timing = normalizeNodeGraphPatchTiming(runtime?.timing);
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const baseHz = Math.max(0, Number(timing.tempoBpm) || 120) / 60;
  const divisionFactor = nodeGraphTransportDivisionFactor(params.divisions);
  const frequency = baseHz * divisionFactor;
  const amplitude = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params.amplitude, runtime, nodeId, null, "transport amplitude"),
    0,
    1,
  );
  const frame = Math.max(0, Number(absoluteFrame) || 0);
  const phase = frequency > 0 ? wrapNodeSliderValue((frame / rate) * frequency, 0, 1) : 0;
  const high = phase < 0.5;
  return {
    "-1..1": high ? amplitude : -amplitude,
    "0..1": high ? amplitude : 0,
  };
}


// Registers the offline/render-time dispatch handler for transport into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.transport = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphTransportSample(
    {
      amplitude: read("amplitude", 1),
      divisions: read("divisions", 0),
    },
    Number.isFinite(runtime.absoluteFrame) ? runtime.absoluteFrame : frame,
    sampleRate,
    runtime,
    nodeId,
  );
};
