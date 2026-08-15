// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphSmoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = nodeGraphHashBipolar(left, seed);
  const b = nodeGraphHashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
}
function nodeGraphFractalBrownianNoiseAxisState(state, axis) {
  const key = String(axis || "x");
  if (!state.axes || typeof state.axes !== "object") {
    state.axes = {};
  }
  if (!state.axes[key]) {
    state.axes[key] = { seedKey: "", time: 0 };
  }
  return state.axes[key];
}
function nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime = null, nodeId = "", axis = "x", options = {}) {
  const axisState = nodeGraphFractalBrownianNoiseAxisState(state, axis);
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const seed = Math.max(0, Math.round(nodeGraphSafeFilterNumber(params.seed, runtime, nodeId, null, "fbm seed")));
  const seedKey = nodeGraphSeedKey(nodeId, seed, `fractalBrownianNoise:${axis}`);
  if (axisState.seedKey !== seedKey) {
    axisState.seedKey = seedKey;
    axisState.time = 0;
  }
  const frequency = Math.max(0, nodeGraphSafeFilterNumber(params.frequency, runtime, nodeId, null, "fbm frequency"));
  const octaves = Math.max(1, Math.min(8, Math.round(nodeGraphSafeFilterNumber(params.octaves, runtime, nodeId, null, "fbm octaves"))));
  const persistence = clampNodeSliderValue(nodeGraphSafeFilterNumber(params.persistence, runtime, nodeId, null, "fbm persistence"), 0, 0.99);
  const scale = Math.max(0.000001, nodeGraphSafeFilterNumber(params.scale, runtime, nodeId, null, "fbm scale"));
  const level = nodeGraphSafeFilterNumber(params.amplitude ?? params.level ?? 1, runtime, nodeId, null, "fbm level");
  let total = 0;
  let amplitude = 1;
  let noiseFrequency = 1;
  let maxValue = 0;
  const baseSeed = nodeGraphStableSeed(seedKey);
  for (let i = 0; i < octaves; i += 1) {
    total += nodeGraphSmoothNoise1d(axisState.time * scale * noiseFrequency, baseSeed + i * 1013) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFrequency *= 2;
  }
  axisState.time += frequency / rate;
  const normalized = maxValue > 0 ? total / maxValue : 0;
  return nodeGraphSafeFilterNumber(options.raw ? normalized : normalized * level, runtime, nodeId, null, "fbm output");
}


function nodeGraphFractalBrownianNoiseVector(state, params, sampleRate, runtime = null, nodeId = "", reset = 0) {
  const resetHigh = Number(reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    for (const axisState of Object.values(state.axes || {})) {
      axisState.time = 0;
    }
  }
  state.resetWasHigh = resetHigh;
  const rawX = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, "x", { raw: true });
  const rawY = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, "y", { raw: true });
  const rawZ = nodeGraphFractalBrownianNoiseSample(state, params, sampleRate, runtime, nodeId, "z", { raw: true });
  const level = nodeGraphSafeFilterNumber(params.amplitude ?? params.level ?? 1, runtime, nodeId, null, "fbm level");
  return {
    "Out X": nodeGraphSafeFilterNumber(rawX * level, runtime, nodeId, null, "fbm output"),
    "Out Y": nodeGraphSafeFilterNumber(rawY * level, runtime, nodeId, null, "fbm output"),
    "Out Z": nodeGraphSafeFilterNumber(rawZ * level, runtime, nodeId, null, "fbm output"),
    "Out X Raw": rawX,
    "Out Y Raw": rawY,
    "Out Z Raw": rawZ,
  };
}


function createNodeGraphFractalBrownianNoiseState() {
  return {
    axes: {},
    resetWasHigh: false,
  };
}


// Registers the offline/render-time dispatch handler for fractalBrownianNoise
// into nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.fractalBrownianNoise = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.fractalBrownianNoiseStates.get(nodeId) || createNodeGraphFractalBrownianNoiseState();
  runtime.fractalBrownianNoiseStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphFractalBrownianNoiseVector(
    state,
    {
      frequency: read("frequency", 0.5),
      amplitude: read("amplitude", 1),
      level: read("amplitude", 1),
      octaves: read("octaves", 4),
      persistence: read("persistence", 0.5),
      scale: read("scale", 1),
      seed: read("seed", 1),
    },
    sampleRate,
    runtime,
    nodeId,
    mixInput(nodeId, "Reset"),
  );
};
