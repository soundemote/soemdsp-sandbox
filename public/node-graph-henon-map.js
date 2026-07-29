// Offline / main-thread glue for henon_map.wasm — no pure-JS DSP mirror.
// Silent (0,0) until wasm finishes loading. Live path uses worklet native only.

const nodeGraphHenonMapWasm = { promise: null, exports: null, failed: false };

function nodeGraphHenonMapLoadWasm() {
  if (nodeGraphHenonMapWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphHenonMapWasm.promise = fetch("/native_modules/henon_map/henon_map.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphHenonMapWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphHenonMapWasm.failed = true;
    });
}

function createNodeGraphHenonMapState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphHenonMapNativeState(state) {
  const wasm = nodeGraphHenonMapWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_henon_map_destroy) {
    wasm.soemdsp_henon_map_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphHenonMapSample(options = {}) {
  nodeGraphHenonMapLoadWasm();
  const wasm = nodeGraphHenonMapWasm.exports;
  if (!wasm?.soemdsp_henon_map_create || !wasm?.soemdsp_henon_map_sample) {
    return { x: 0, y: 0 };
  }
  const state = options.state || createNodeGraphHenonMapState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_henon_map_create();
  }
  if (!state.nativeHandle) {
    return { x: 0, y: 0 };
  }
  wasm.soemdsp_henon_map_sample(
    state.nativeHandle,
    Number(options.reset) > 0 ? 1 : 0,
    Math.max(0, Number(options.rate) || 0),
    Math.max(0, Math.min(2, Number(options.a) || 0)),
    Math.max(-1, Math.min(1, Number(options.b) || 0)),
    Number(options.seedX) || 0,
    Number(options.seedY) || 0,
    Math.max(1, Number(options.sampleRate) || 44100),
  );
  const x = wasm.soemdsp_henon_map_x(state.nativeHandle);
  const y = wasm.soemdsp_henon_map_y(state.nativeHandle);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}
