// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphVactrolEnvelopeCoefficient(seconds, sampleRate) {
  const time = Number(seconds);
  if (!Number.isFinite(time) || time <= 0) {
    return 1;
  }
  const samples = Math.max(1, time * Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100));
  return 1 - Math.exp(-1 / samples);
}


function createNodeGraphVactrolEnvelopeState() {
  return {
    out: 0,
    raw: 0,
  };
}

function nodeGraphVactrolEnvelopeSample(state, light, params, sampleRate, runtime = null, nodeId = "") {
  const safeLight = nodeGraphSafeFilterNumber(light, runtime, nodeId, null, "vactrol light");
  const attack = Math.max(0, nodeGraphSafeFilterNumber(params.attack, runtime, nodeId, null, "vactrol attack"));
  const release = Math.max(0, nodeGraphSafeFilterNumber(params.release, runtime, nodeId, null, "vactrol release"));
  const curve = Math.max(0.001, nodeGraphSafeFilterNumber(params.curve, runtime, nodeId, null, "vactrol curve"));
  const sensitivity = Math.max(0, nodeGraphSafeFilterNumber(params.sensitivity, runtime, nodeId, null, "vactrol sensitivity"));
  const lightOffset = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params.lightOffset, runtime, nodeId, null, "vactrol light offset"),
    0,
    1,
  );
  const darkCurrent = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(params.darkCurrent, runtime, nodeId, null, "vactrol dark current"),
    0,
    1,
  );
  const rate = Math.max(1, sampleRate || nodeGraphMvp.sampleRate || 44100);
  const target = clampNodeSliderValue(safeLight * sensitivity + lightOffset, 0, 1);
  const coefficient = target > state.raw
    ? nodeGraphVactrolEnvelopeCoefficient(attack, rate)
    : nodeGraphVactrolEnvelopeCoefficient(release, rate);
  state.raw += (target - state.raw) * coefficient;
  const shaped = Math.pow(clampNodeSliderValue(state.raw, 0, 1), curve);
  state.out = clampNodeSliderValue(darkCurrent + shaped * (1 - darkCurrent), 0, 1);
  return nodeGraphSafeFilterNumber(state.out, runtime, nodeId, null, "vactrol output");
}


// Registers the offline/render-time dispatch handler for vactrolEnvelopeSeries
// and vactrolEnvelopeCustom into nodeGraphLiveModuleEvaluators (declared in
// node-graph-live-frame-evaluator.js) -- both types share one implementation,
// same as the original combined if-branch. Extracted from the inline
// if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.vactrolEnvelopeSeries = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.vactrolEnvelopeStates.get(nodeId) || createNodeGraphVactrolEnvelopeState();
  runtime.vactrolEnvelopeStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const isSeries = node?.type === "vactrolEnvelopeSeries";
  const seriesSpec = isSeries ? nodeGraphVactrolSeriesSpec(read("part", 2)) : null;
  return nodeGraphVactrolEnvelopeSample(
    state,
    mixInput(nodeId, "Light"),
    {
      attack: isSeries ? seriesSpec.attack : read("attack", 0.01),
      curve: read("curve", 1),
      darkCurrent: read("darkCurrent", 0),
      lightOffset: read("lightOffset", 0),
      release: isSeries ? seriesSpec.release : read("release", 0.1),
      sensitivity: read("sensitivity", 1),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
nodeGraphLiveModuleEvaluators.vactrolEnvelopeCustom = nodeGraphLiveModuleEvaluators.vactrolEnvelopeSeries;
