// Offline / main-thread glue for lorenz_attractor.wasm — no pure-JS DSP mirror.
// Silent (0,0,0) until wasm finishes loading. Live path uses worklet native only.

const nodeGraphLorenzAttractorWasm = { promise: null, exports: null, failed: false };

function nodeGraphLorenzAttractorLoadWasm() {
  if (nodeGraphLorenzAttractorWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphLorenzAttractorWasm.promise = fetch("/native_modules/lorenz_attractor/lorenz_attractor.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphLorenzAttractorWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphLorenzAttractorWasm.failed = true;
    });
}

function createNodeGraphLorenzAttractorState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphLorenzAttractorNativeState(state) {
  const wasm = nodeGraphLorenzAttractorWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_lorenz_attractor_destroy) {
    wasm.soemdsp_lorenz_attractor_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphLorenzAttractorSample(options = {}) {
  nodeGraphLorenzAttractorLoadWasm();
  const wasm = nodeGraphLorenzAttractorWasm.exports;
  if (!wasm?.soemdsp_lorenz_attractor_create || !wasm?.soemdsp_lorenz_attractor_sample) {
    return { x: 0, y: 0, z: 0 };
  }
  const state = options.state || createNodeGraphLorenzAttractorState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_lorenz_attractor_create();
  }
  if (!state.nativeHandle) {
    return { x: 0, y: 0, z: 0 };
  }
  wasm.soemdsp_lorenz_attractor_sample(
    state.nativeHandle,
    Number(options.reset) || 0,
    Math.max(0, Number(options.speed) || 0),
    Math.max(0, Number(options.sigma) || 10),
    Number.isFinite(Number(options.rho)) ? Number(options.rho) : 28,
    Math.max(0, Number(options.beta) || 8 / 3),
    Number(options.rotate) || 0,
    Math.max(0, Number(options.scale) || 1),
    Math.max(0, Math.min(1, Number(options.zDepth) || 0)),
    Math.max(1, Number(options.sampleRate) || 44100),
  );
  const x = wasm.soemdsp_lorenz_attractor_x(state.nativeHandle);
  const y = wasm.soemdsp_lorenz_attractor_y(state.nativeHandle);
  const z = wasm.soemdsp_lorenz_attractor_z(state.nativeHandle);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}
