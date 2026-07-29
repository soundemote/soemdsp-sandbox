// Offline / main-thread glue for chua_attractor.wasm — no pure-JS DSP mirror.
// Silent (0,0,0) until wasm finishes loading.

const nodeGraphChuaAttractorWasm = { promise: null, exports: null, failed: false };

function nodeGraphChuaAttractorLoadWasm() {
  if (nodeGraphChuaAttractorWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphChuaAttractorWasm.promise = fetch("/native_modules/chua_attractor/chua_attractor.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphChuaAttractorWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphChuaAttractorWasm.failed = true;
    });
}

function createNodeGraphChuaAttractorState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphChuaAttractorNativeState(state) {
  const wasm = nodeGraphChuaAttractorWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_chua_attractor_destroy) {
    wasm.soemdsp_chua_attractor_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphChuaAttractorSample(options = {}) {
  nodeGraphChuaAttractorLoadWasm();
  const wasm = nodeGraphChuaAttractorWasm.exports;
  if (!wasm?.soemdsp_chua_attractor_create || !wasm?.soemdsp_chua_attractor_sample) {
    return { x: 0, y: 0, z: 0 };
  }
  const state = options.state || createNodeGraphChuaAttractorState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_chua_attractor_create();
  }
  if (!state.nativeHandle) {
    return { x: 0, y: 0, z: 0 };
  }
  wasm.soemdsp_chua_attractor_sample(
    state.nativeHandle,
    Number(options.reset) > 0.5 ? 1 : 0,
    Math.max(0, Number(options.speed) || 0),
    Number(options.alpha) || 0,
    Number(options.beta) || 0,
    Number(options.m0) || 0,
    Number(options.m1) || 0,
    Math.max(1, Number(options.sampleRate) || 44100),
  );
  const x = wasm.soemdsp_chua_attractor_x(state.nativeHandle);
  const y = wasm.soemdsp_chua_attractor_y(state.nativeHandle);
  const z = wasm.soemdsp_chua_attractor_z(state.nativeHandle);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}
