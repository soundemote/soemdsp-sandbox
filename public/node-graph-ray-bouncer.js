// Self-contained glue for the ray_bouncer native module (RS-MET Ray Bouncer).
// Same pattern as node-graph-antisaw.js / node-graph-bradley-2a.js:
// no pure-JS reimplementation of the ellipse billiard — lazy fetch+instantiate
// of ray_bouncer.wasm on the main thread (offline render) and
// a thin call into it. Silent (0,0) until the wasm finishes loading.
//
// Live Audio uses the worklet path (also native-only; silence if wasm not ready).

const nodeGraphRayBouncerWasm = { promise: null, exports: null, failed: false };

function nodeGraphRayBouncerLoadWasm() {
  if (nodeGraphRayBouncerWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphRayBouncerWasm.promise = fetch("/native_modules/ray_bouncer/ray_bouncer.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphRayBouncerWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphRayBouncerWasm.failed = true;
    });
}

function createNodeGraphRayBouncerState() {
  return {
    nativeHandle: 0,
  };
}

function destroyNodeGraphRayBouncerNativeState(state) {
  const wasm = nodeGraphRayBouncerWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_ray_bouncer_destroy) {
    wasm.soemdsp_ray_bouncer_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphRayBouncerSample(options = {}) {
  nodeGraphRayBouncerLoadWasm();
  const wasm = nodeGraphRayBouncerWasm.exports;
  if (!wasm?.soemdsp_ray_bouncer_create || !wasm?.soemdsp_ray_bouncer_sample) {
    return { x: 0, y: 0 };
  }
  const state = options.state || createNodeGraphRayBouncerState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_ray_bouncer_create();
  }
  if (!state.nativeHandle) {
    return { x: 0, y: 0 };
  }
  const sampleRate = Math.max(1, Number(options.sampleRate) || 44100);
  wasm.soemdsp_ray_bouncer_sample(
    state.nativeHandle,
    Number(options.reset) > 0.5 ? 1 : 0,
    Math.max(0, Number(options.frequency) || 0),
    Number.isFinite(Number(options.launchAngle)) ? Number(options.launchAngle) : 30,
    Number(options.startX) || 0,
    Number(options.startY) || 0,
    Math.max(0.01, Number(options.size) || 1),
    Math.max(0.05, Number(options.aspect) || 1),
    Number.isFinite(Number(options.rotate)) ? Number(options.rotate) : 0,
    Number(options.centerX) || 0,
    Number(options.centerY) || 0,
    Math.max(0, Number(options.maxDistance) || 0),
    Math.max(-4, Math.min(4, Number(options.bend) || 0)),
    Math.max(-4, Math.min(4, Number(options.xToY) || 0)),
    Math.max(-4, Math.min(4, Number(options.yToX) || 0)),
    sampleRate,
  );
  const x = wasm.soemdsp_ray_bouncer_x(state.nativeHandle);
  const y = wasm.soemdsp_ray_bouncer_y(state.nativeHandle);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}
