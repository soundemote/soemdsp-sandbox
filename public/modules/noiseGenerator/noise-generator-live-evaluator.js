// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphNoiseGeneratorChannelSample(state, mode, mean, deviation) {
  const white = nodeGraphNextSeededBipolar(state);
  if (mode === 1) {
    return mean + nodeGraphNextSeededGaussian(state) * deviation;
  }
  if (mode === 2) {
    state.brown = clampNodeSliderValue(state.brown + white * Math.max(0.001, deviation) * 0.05, -1, 1);
    return mean + state.brown;
  }
  if (mode === 3) {
    state.pink[0] = 0.99886 * state.pink[0] + white * 0.0555179;
    state.pink[1] = 0.99332 * state.pink[1] + white * 0.0750759;
    state.pink[2] = 0.969 * state.pink[2] + white * 0.153852;
    state.pink[3] = 0.8665 * state.pink[3] + white * 0.3104856;
    state.pink[4] = 0.55 * state.pink[4] + white * 0.5329522;
    state.pink[5] = -0.7616 * state.pink[5] - white * 0.016898;
    const out = mean + (state.pink[0] + state.pink[1] + state.pink[2] + state.pink[3] + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
    state.pink[6] = white * 0.115926;
    return out;
  }
  if (mode === 4) {
    return Math.abs(white) > 0.94 ? mean + Math.sign(white) * deviation : mean;
  }
  return mean + white * deviation;
}


function createNodeGraphNoiseGeneratorState() {
  return { left: createNodeGraphNoiseGeneratorChannelState(), right: createNodeGraphNoiseGeneratorChannelState() };
}

function nodeGraphNoiseGeneratorSample(state, params, runtime = null, nodeId = "") {
  nodeGraphResetSeededState(state.left, `${nodeId}:left`, params.seed, "noiseGenerator");
  nodeGraphResetSeededState(state.right, `${nodeId}:right`, params.seed, "noiseGenerator");
  const mode = Math.max(0, Math.min(4, Math.round(nodeGraphSafeFilterNumber(params.mode, runtime, nodeId, null, "noise generator mode"))));
  const mean = nodeGraphSafeFilterNumber(params.mean, runtime, nodeId, null, "noise generator mean");
  const deviation = Math.max(0, nodeGraphSafeFilterNumber(params.deviation, runtime, nodeId, null, "noise generator deviation"));
  const level = nodeGraphSafeFilterNumber(params.level, runtime, nodeId, null, "noise generator level");
  const left = clampNodeSliderValue(nodeGraphNoiseGeneratorChannelSample(state.left, mode, mean, deviation), -1, 1) * level;
  const right = clampNodeSliderValue(nodeGraphNoiseGeneratorChannelSample(state.right, mode, mean, deviation), -1, 1) * level;
  return {
    "Left Out": nodeGraphSafeFilterNumber(left, runtime, nodeId, null, "noise generator left out"),
    "Right Out": nodeGraphSafeFilterNumber(right, runtime, nodeId, null, "noise generator right out"),
  };
}


// Registers the offline/render-time dispatch handler for noiseGenerator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.noiseGenerator = ({ runtime, node, nodeId, frame, frames, frameValues }) => {
  const state = runtime.noiseGeneratorStates.get(nodeId) || createNodeGraphNoiseGeneratorState();
  runtime.noiseGeneratorStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphNoiseGeneratorSample(
    state,
    {
      deviation: read("deviation", 0.5),
      level: read("level", 1),
      mean: read("mean", 0),
      mode: read("mode", 0),
      seed: read("seed", 1),
    },
    runtime,
    nodeId,
  );
};
