// Offline / render-time Vibrato Generator (native wasm when available).

const nodeGraphVibratoGeneratorWasm = { promise: null, exports: null, failed: false };

function nodeGraphVibratoGeneratorLoadWasm() {
  if (nodeGraphVibratoGeneratorWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphVibratoGeneratorWasm.promise = fetch("/native_modules/vibrato_generator/vibrato_generator.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`vibrato_generator wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphVibratoGeneratorWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphVibratoGeneratorWasm.failed = true;
    });
}

function createNodeGraphVibratoGeneratorState() {
  return { nativeHandle: 0, lastReset: 0 };
}

globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.vibratoGenerator = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  if (!runtime.vibratoGeneratorStates) runtime.vibratoGeneratorStates = new Map();
  const state = runtime.vibratoGeneratorStates.get(nodeId) || createNodeGraphVibratoGeneratorState();
  runtime.vibratoGeneratorStates.set(nodeId, state);

  const read = (key, fallback) => {
    if (typeof readNodeGraphLiveEffectiveParam === "function") {
      return readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    }
    const raw = Number(node?.params?.[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };

  nodeGraphVibratoGeneratorLoadWasm();
  const wasm = nodeGraphVibratoGeneratorWasm.exports;
  if (!wasm?.soemdsp_vibrato_generator_create || !wasm?.soemdsp_vibrato_generator_sample) {
    return { Out: 0, Left: 0, Right: 0 };
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_vibrato_generator_create();
  }
  if (!state.nativeHandle) {
    return { Out: 0, Left: 0, Right: 0 };
  }

  const phaseOff = read("phase", 0);
  if (hasInput?.("Reset")) {
    const rv = Number(mixInput?.("Reset"));
    if (Number.isFinite(rv) && rv > 0 && state.lastReset <= 0 && wasm.soemdsp_vibrato_generator_reset) {
      wasm.soemdsp_vibrato_generator_reset(state.nativeHandle, phaseOff);
    }
    state.lastReset = Number.isFinite(rv) ? rv : 0;
  } else {
    state.lastReset = 0;
  }

  const y = wasm.soemdsp_vibrato_generator_sample(
    state.nativeHandle,
    read("frequency", 5),
    sampleRate,
    phaseOff,
    read("amplitude", 1),
    read("morph", 0),
    read("randomFreq", 0),
    read("randomAmp", 0),
    read("seed", 1),
  );
  return { Out: y, Left: y, Right: y };
};
