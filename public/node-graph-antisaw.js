// Self-contained glue for the antisaw native module -- additive
// resynthesis of only the aliased partials of an ideal sawtooth, each
// one computed and placed as a clean in-band sine at its folded
// frequency (see native_modules/antisaw/antisaw.cpp for the actual DSP
// and why this is simulated, not real, aliasing).
//
// Same pattern as node-graph-bradley-2a.js: no pure-JS reimplementation
// (up to 256 independent phase accumulators isn't worth hand-duplicating
// in JS), just a lazy fetch+instantiate of antisaw.wasm on the main
// thread (offline render -- has fetch, unlike the audio worklet's
// restricted scope) and a thin call straight into it. Silent
// (0) output until the wasm finishes loading.
//
// Gotcha: like bradley_2a, "level" is applied inside the wasm --
// soemdsp_antisaw_sample's return value is already level-scaled. Don't
// multiply by level again.

const nodeGraphAntisawWasm = { promise: null, exports: null, failed: false };

function nodeGraphAntisawLoadWasm() {
  if (nodeGraphAntisawWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphAntisawWasm.promise = fetch("/native_modules/antisaw/antisaw.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphAntisawWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphAntisawWasm.failed = true;
    });
}

function createNodeGraphAntisawState() {
  return {
    nativeHandle: 0,
  };
}

function destroyNodeGraphAntisawNativeState(state) {
  const wasm = nodeGraphAntisawWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_antisaw_destroy) {
    wasm.soemdsp_antisaw_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

// params keys match antisaw.cpp's metadata "parameters" array order
// exactly: fundamental, reflections, tilt, level.
function nodeGraphAntisawSample(state, params = {}, sampleRate = 44100) {
  nodeGraphAntisawLoadWasm();
  const wasm = nodeGraphAntisawWasm.exports;
  if (!wasm?.soemdsp_antisaw_create || !wasm?.soemdsp_antisaw_sample) {
    return 0;
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_antisaw_create();
  }
  if (!state.nativeHandle) {
    return 0;
  }
  const out = wasm.soemdsp_antisaw_sample(
    state.nativeHandle,
    Number(params.fundamental) || 0,
    Number(params.reflections) || 0,
    Number(params.tilt) || 0,
    Number(params.level) || 0,
    Math.max(1, Number(sampleRate) || 44100),
  );
  return Number.isFinite(out) ? out : 0;
}
