// Offline / main-thread glue for fbm_field.wasm (optional native path).
// Pure JS mirror: modules/fbmField/fbm-field-math.js (fallback). Live prefers
// JS math when present; worklet prefers native when loaded.

const nodeGraphFbmFieldWasm = { promise: null, exports: null, failed: false };

function nodeGraphFbmFieldLoadWasm() {
  if (nodeGraphFbmFieldWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphFbmFieldWasm.promise = fetch("/native_modules/fbm_field/fbm_field.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphFbmFieldWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphFbmFieldWasm.failed = true;
    });
}

function createNodeGraphFbmFieldNativeState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphFbmFieldNativeState(state) {
  const wasm = nodeGraphFbmFieldWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_fbm_field_destroy) {
    wasm.soemdsp_fbm_field_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

/**
 * Native offline sample → { X, Y, "X Raw", "Y Raw" } or null if wasm not ready.
 */
function nodeGraphFbmFieldNativeSample(options = {}) {
  nodeGraphFbmFieldLoadWasm();
  const wasm = nodeGraphFbmFieldWasm.exports;
  if (!wasm?.soemdsp_fbm_field_create || !wasm?.soemdsp_fbm_field_sample) {
    return null;
  }
  const state = options.state || createNodeGraphFbmFieldNativeState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_fbm_field_create();
  }
  if (!state.nativeHandle) {
    return null;
  }
  wasm.soemdsp_fbm_field_sample(
    state.nativeHandle,
    Number(options.reset) > 0.5 ? 1 : 0,
    Math.max(0, Number(options.frequency) || 0),
    Math.max(0, Math.round(Number(options.seed) || 0)),
    Math.max(1, Math.min(8, Math.round(Number(options.octaves) || 4))),
    Math.max(0, Math.min(0.99, Number(options.persistence) || 0.5)),
    Math.max(1, Math.min(4, Number(options.lacunarity) || 2)),
    Math.max(0.000001, Number(options.scale) || 1),
    Math.max(0, Math.min(1, Number(options.smoothness) || 0.55)),
    Math.max(0.05, Number(options.zoom) || 1),
    Number(options.panX) || 0,
    Number(options.panY) || 0,
    Number(options.level) || 0,
    Math.max(1, Number(options.sampleRate) || 44100),
  );
  const x = wasm.soemdsp_fbm_field_x(state.nativeHandle);
  const y = wasm.soemdsp_fbm_field_y(state.nativeHandle);
  const xRaw = wasm.soemdsp_fbm_field_x_raw?.(state.nativeHandle) ?? x;
  const yRaw = wasm.soemdsp_fbm_field_y_raw?.(state.nativeHandle) ?? y;
  return {
    X: Number.isFinite(x) ? x : 0,
    Y: Number.isFinite(y) ? y : 0,
    "X Raw": Number.isFinite(xRaw) ? xRaw : 0,
    "Y Raw": Number.isFinite(yRaw) ? yRaw : 0,
  };
}
