// Main-thread fbm_field.wasm — native only for audio sample + face grid fill.
// Face grid uses the same fbm2d kernel as X/Y probes (soemdsp_fbm_field_fill_grid).

const nodeGraphFbmFieldWasm = { promise: null, exports: null, failed: false };

function nodeGraphFbmFieldLoadWasm() {
  if (nodeGraphFbmFieldWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return nodeGraphFbmFieldWasm.promise;
  }
  nodeGraphFbmFieldWasm.promise = fetch("/native_modules/fbm_field/fbm_field.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphFbmFieldWasm.exports = result.instance.exports;
      return nodeGraphFbmFieldWasm.exports;
    })
    .catch(() => {
      nodeGraphFbmFieldWasm.failed = true;
      return null;
    });
  return nodeGraphFbmFieldWasm.promise;
}

function createNodeGraphFbmFieldState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphFbmFieldNativeState(state) {
  const wasm = nodeGraphFbmFieldWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_fbm_field_destroy) {
    wasm.soemdsp_fbm_field_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphFbmFieldSample(options = {}) {
  nodeGraphFbmFieldLoadWasm();
  const wasm = nodeGraphFbmFieldWasm.exports;
  if (!wasm?.soemdsp_fbm_field_create || !wasm?.soemdsp_fbm_field_sample) {
    return { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
  }
  const state = options.state || createNodeGraphFbmFieldState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_fbm_field_create();
  }
  if (!state.nativeHandle) {
    return { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
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

/**
 * Fill mono 0…1 grid via native fbm2d (same kernel as X/Y).
 * @returns {{ mono: Float32Array, width: number, height: number } | null}
 */
function nodeGraphFbmFieldFillGrid(options = {}) {
  nodeGraphFbmFieldLoadWasm();
  const wasm = nodeGraphFbmFieldWasm.exports;
  if (!wasm?.soemdsp_fbm_field_fill_grid || !wasm?.soemdsp_fbm_field_grid_ptr || !wasm.memory) {
    return null;
  }
  const maxW = wasm.soemdsp_fbm_field_grid_max_width?.() || 256;
  const maxH = wasm.soemdsp_fbm_field_grid_max_height?.() || 256;
  const width = Math.max(8, Math.min(maxW, Math.round(Number(options.width) || 192)));
  const height = Math.max(8, Math.min(maxH, Math.round(Number(options.height) || 192)));
  const cells = wasm.soemdsp_fbm_field_fill_grid(
    width,
    height,
    Number(options.domainTime) || 0,
    Math.max(0.05, Number(options.zoom) || 1),
    Number(options.panX) || 0,
    Number(options.panY) || 0,
    Number(options.rotate) || 0,
    Math.max(0, Math.round(Number(options.seed) || 0)),
    Math.max(1, Math.min(8, Math.round(Number(options.octaves) || 4))),
    Math.max(0, Math.min(0.99, Number(options.persistence) || 0.5)),
    Math.max(1, Math.min(4, Number(options.lacunarity) || 2)),
    Math.max(0.000001, Number(options.scale) || 1),
    Math.max(0, Math.min(1, Number(options.smoothness) || 0.55)),
    Math.max(0, Number(options.contrast) || 1),
  );
  if (!cells) return null;
  const gw = wasm.soemdsp_fbm_field_grid_width();
  const gh = wasm.soemdsp_fbm_field_grid_height();
  const ptr = wasm.soemdsp_fbm_field_grid_ptr();
  // float32 mono
  const mono = new Float32Array(wasm.memory.buffer, ptr, gw * gh);
  // Copy so caller is safe if wasm reallocates (it won't grow, but keep stable)
  return { mono: new Float32Array(mono), width: gw, height: gh };
}
