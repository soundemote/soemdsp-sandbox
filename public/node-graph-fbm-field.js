// Main-thread fbm_field.wasm — native only for audio sample + face grid fill.
// Face grid and X/Y/Z probes share fieldAt() (What I See Is What I Hear).

const nodeGraphFbmFieldWasm = { promise: null, exports: null, failed: false };

/** Finite number or fallback — allows 0 (never use `x || default` for knobs). */
function nodeGraphFbmFieldNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Motion: 0 Scroll, 1 Volume. */
function nodeGraphFbmFieldMotionMode(value) {
  const n = Math.round(nodeGraphFbmFieldNum(value, 1));
  return Math.max(0, Math.min(1, n));
}

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
    return { X: 0, Y: 0, Z: 0, "X Raw": 0, "Y Raw": 0, "Z Raw": 0 };
  }
  const state = options.state || createNodeGraphFbmFieldState();
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_fbm_field_create();
  }
  if (!state.nativeHandle) {
    return { X: 0, Y: 0, Z: 0, "X Raw": 0, "Y Raw": 0, "Z Raw": 0 };
  }
  wasm.soemdsp_fbm_field_sample(
    state.nativeHandle,
    Number(options.reset) > 0.5 ? 1 : 0,
    Math.max(0, nodeGraphFbmFieldNum(options.frequency, 0)),
    Math.max(0, Math.round(nodeGraphFbmFieldNum(options.seed, 0))),
    Math.max(1, Math.min(8, Math.round(nodeGraphFbmFieldNum(options.octaves, 4)))),
    Math.max(0, Math.min(0.99, nodeGraphFbmFieldNum(options.persistence, 0.5))),
    Math.max(1, Math.min(4, nodeGraphFbmFieldNum(options.lacunarity, 2))),
    Math.max(0.000001, nodeGraphFbmFieldNum(options.scale, 1)),
    Math.max(0, Math.min(1, nodeGraphFbmFieldNum(options.smoothness, 0.55))),
    Math.max(0.05, nodeGraphFbmFieldNum(options.zoom, 1)),
    nodeGraphFbmFieldNum(options.panX, 0),
    nodeGraphFbmFieldNum(options.panY, 0),
    Math.max(0, nodeGraphFbmFieldNum(options.brightness, 1)),
    Math.max(1, nodeGraphFbmFieldNum(options.sampleRate, 44100)),
    nodeGraphFbmFieldMotionMode(options.motion),
    Math.max(0, nodeGraphFbmFieldNum(options.contrast, 1)),
  );
  const amp = Math.max(0, nodeGraphFbmFieldNum(options.amplitude, 1));
  const scale = (value) => (Number.isFinite(value) ? value * amp : 0);
  const x = wasm.soemdsp_fbm_field_x(state.nativeHandle);
  const y = wasm.soemdsp_fbm_field_y(state.nativeHandle);
  const z = wasm.soemdsp_fbm_field_z?.(state.nativeHandle) ?? 0;
  const xRaw = wasm.soemdsp_fbm_field_x_raw?.(state.nativeHandle) ?? x;
  const yRaw = wasm.soemdsp_fbm_field_y_raw?.(state.nativeHandle) ?? y;
  const zRaw = wasm.soemdsp_fbm_field_z_raw?.(state.nativeHandle) ?? z;
  return {
    X: scale(x),
    Y: scale(y),
    Z: scale(z),
    "X Raw": scale(xRaw),
    "Y Raw": scale(yRaw),
    "Z Raw": scale(zRaw),
  };
}

/**
 * Fill mono 0…1 grid via native fieldAt (same mapping as X/Y/Z).
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
    nodeGraphFbmFieldNum(options.domainTime, 0),
    Math.max(0.05, nodeGraphFbmFieldNum(options.zoom, 1)),
    nodeGraphFbmFieldNum(options.panX, 0),
    nodeGraphFbmFieldNum(options.panY, 0),
    nodeGraphFbmFieldNum(options.rotate, 0),
    Math.max(0, Math.round(nodeGraphFbmFieldNum(options.seed, 0))),
    Math.max(1, Math.min(8, Math.round(nodeGraphFbmFieldNum(options.octaves, 4)))),
    Math.max(0, Math.min(0.99, nodeGraphFbmFieldNum(options.persistence, 0.5))),
    Math.max(1, Math.min(4, nodeGraphFbmFieldNum(options.lacunarity, 2))),
    Math.max(0.000001, nodeGraphFbmFieldNum(options.scale, 1)),
    Math.max(0, Math.min(1, nodeGraphFbmFieldNum(options.smoothness, 0.55))),
    Math.max(0, nodeGraphFbmFieldNum(options.contrast, 1)),
    nodeGraphFbmFieldMotionMode(options.motion),
    Math.max(0, nodeGraphFbmFieldNum(options.brightness, 1)),
  );
  if (!cells) return null;
  const gw = wasm.soemdsp_fbm_field_grid_width();
  const gh = wasm.soemdsp_fbm_field_grid_height();
  const ptr = wasm.soemdsp_fbm_field_grid_ptr();
  const mono = new Float32Array(wasm.memory.buffer, ptr, gw * gh);
  return { mono: new Float32Array(mono), width: gw, height: gh };
}
