// Offline / Render Sample host for dsfOscillator — same native core as worklet.
// APP_POLICY §2/§5: no JS DSF twin. Silence until dsf_oscillator.wasm is ready.

const nodeGraphDsfOscillatorWasm = { promise: null, exports: null, failed: false };

function nodeGraphDsfOscillatorLoadWasm() {
  if (nodeGraphDsfOscillatorWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphDsfOscillatorWasm.promise = fetch("/native_modules/dsf_oscillator/dsf_oscillator.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`dsf_oscillator wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphDsfOscillatorWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphDsfOscillatorWasm.failed = true;
    });
}

function createNodeGraphDsfOscillatorState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphDsfOscillatorNativeState(state) {
  const wasm = nodeGraphDsfOscillatorWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_dsf_oscillator_destroy) {
    wasm.soemdsp_dsf_oscillator_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

// options: { frequencyHz, sampleRate, waveform, morph, pulseWidth, blend, phase, level }
function nodeGraphDsfOscillatorSample(state, options = {}) {
  nodeGraphDsfOscillatorLoadWasm();
  const wasm = nodeGraphDsfOscillatorWasm.exports;
  if (!wasm?.soemdsp_dsf_oscillator_create || !wasm?.soemdsp_dsf_oscillator_sample) {
    return { Out: 0 };
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_dsf_oscillator_create();
  }
  if (!state.nativeHandle) {
    return { Out: 0 };
  }
  wasm.soemdsp_dsf_oscillator_sample(
    state.nativeHandle,
    Number(options.frequencyHz) || 0,
    Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000,
    Math.round(Number(options.waveform) || 0),
    Number(options.morph) || 0,
    Number(options.pulseWidth) ?? 0.5,
    Number(options.blend) ?? 0.5,
    Number(options.phase) || 0,
    Number(options.level) || 0,
  );
  return { Out: Number(wasm.soemdsp_dsf_oscillator_out(state.nativeHandle)) || 0 };
}
