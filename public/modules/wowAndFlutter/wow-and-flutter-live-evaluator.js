// Offline / render-time Wow And Flutter (native wasm when available).

const nodeGraphWowAndFlutterWasm = { promise: null, exports: null, failed: false };

function nodeGraphWowAndFlutterLoadWasm() {
  if (nodeGraphWowAndFlutterWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphWowAndFlutterWasm.promise = fetch("/native_modules/wow_and_flutter/wow_and_flutter.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`wow_and_flutter wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphWowAndFlutterWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphWowAndFlutterWasm.failed = true;
    });
}

function createNodeGraphWowAndFlutterState() {
  return { nativeHandle: 0, lastReset: 0 };
}

globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.wowAndFlutter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  if (!runtime.wowAndFlutterStates) runtime.wowAndFlutterStates = new Map();
  const state = runtime.wowAndFlutterStates.get(nodeId) || createNodeGraphWowAndFlutterState();
  runtime.wowAndFlutterStates.set(nodeId, state);

  const read = (key, fallback) => {
    if (typeof readNodeGraphLiveEffectiveParam === "function") {
      return readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    }
    const raw = Number(node?.params?.[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };

  nodeGraphWowAndFlutterLoadWasm();
  const wasm = nodeGraphWowAndFlutterWasm.exports;
  if (!wasm?.soemdsp_wow_and_flutter_create || !wasm?.soemdsp_wow_and_flutter_sample) {
    return { Out: 0, Left: 0, Right: 0 };
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_wow_and_flutter_create();
  }
  if (!state.nativeHandle) {
    return { Out: 0, Left: 0, Right: 0 };
  }

  const phaseOff = read("phase", 0);
  if (hasInput?.("Reset")) {
    const rv = Number(mixInput?.("Reset"));
    if (Number.isFinite(rv) && rv > 0 && state.lastReset <= 0 && wasm.soemdsp_wow_and_flutter_reset) {
      wasm.soemdsp_wow_and_flutter_reset(state.nativeHandle, phaseOff);
    }
    state.lastReset = Number.isFinite(rv) ? rv : 0;
  } else {
    state.lastReset = 0;
  }

  const y = wasm.soemdsp_wow_and_flutter_sample(
    state.nativeHandle,
    read("wowSpeed", 1),
    sampleRate,
    phaseOff,
    read("wowAmp", 1),
    read("flutterFrequency", 1),
    read("flutterJitter", 0.01),
    read("flutterAmp", 1),
    read("seed", 1),
    read("amplitude", 1),
  );
  return { Out: y, Left: y, Right: y };
};
