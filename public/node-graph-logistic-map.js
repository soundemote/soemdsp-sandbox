// Offline / main-thread glue for logistic_map.wasm — no pure-JS DSP mirror.
// Native sample() already applies level and returns bipolar scaled output.
// Silent 0 until wasm finishes loading.

const nodeGraphLogisticMapWasm = { promise: null, exports: null, failed: false };

function nodeGraphLogisticMapLoadWasm() {
  if (nodeGraphLogisticMapWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphLogisticMapWasm.promise = fetch("/native_modules/logistic_map/logistic_map.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphLogisticMapWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphLogisticMapWasm.failed = true;
    });
}

function createNodeGraphLogisticMapState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphLogisticMapNativeState(state) {
  const wasm = nodeGraphLogisticMapWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_logistic_map_destroy) {
    wasm.soemdsp_logistic_map_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphLogisticMapSample(options = {}) {
  nodeGraphLogisticMapLoadWasm();
  const wasm = nodeGraphLogisticMapWasm.exports;
  if (!wasm?.soemdsp_logistic_map_create || !wasm?.soemdsp_logistic_map_sample) {
    return 0;
  }
  const state = options.state || createNodeGraphLogisticMapState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_logistic_map_create();
  }
  if (!state.nativeHandle) {
    return 0;
  }
  const out = wasm.soemdsp_logistic_map_sample(
    state.nativeHandle,
    Number(options.reset) > 0 ? 1 : 0,
    Math.max(0, Number(options.rate) || 0),
    Math.max(0, Math.min(4, Number(options.r) || 0)),
    Math.max(0.0001, Math.min(0.9999, Number(options.seed) || 0.5)),
    Number(options.level) || 0,
    Math.max(1, Number(options.sampleRate) || 44100),
  );
  return Number.isFinite(out) ? out : 0;
}
