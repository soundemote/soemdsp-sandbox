// Softwave Oscillator — offline host for softwave.wasm (APP_POLICY §5).
// User-facing name Softwave; DistortionOscillator shapes live in native.

const nodeGraphSoftwaveWaveshape = Object.freeze({
  AnalogSawSine: 0,
  AnalogSawParabol: 1,
  PerfectSaw: 2,
  AnalogSquare: 3,
  Square: 4,
  Tri: 5,
  BowTri: 6,
  SoftBowTri: 7,
  WalterWave: 8,
  ParabolSine: 9,
});

const nodeGraphSoftwaveWaveformChoices = Object.freeze([
  "Analog Saw Sine",
  "Analog Saw Parabol",
  "Perfect Saw",
  "Analog Square",
  "Square",
  "Tri",
  "Bow Tri",
  "Soft Bow Tri",
  "Walter Wave",
  "Parabol Sine",
]);

const nodeGraphSoftwaveWasm = { promise: null, exports: null, failed: false };

function nodeGraphSoftwaveLoadWasm() {
  if (nodeGraphSoftwaveWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphSoftwaveWasm.promise = fetch("/native_modules/softwave/softwave.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`softwave wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphSoftwaveWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphSoftwaveWasm.failed = true;
    });
}

function createNodeGraphSoftwaveOscillatorState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphSoftwaveNativeState(state) {
  const wasm = nodeGraphSoftwaveWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_softwave_destroy) {
    wasm.soemdsp_softwave_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

/** @returns {{ Out: number }} */
function nodeGraphSoftwaveOscillatorSample(state, options = {}) {
  nodeGraphSoftwaveLoadWasm();
  const wasm = nodeGraphSoftwaveWasm.exports;
  if (!wasm?.soemdsp_softwave_create || !wasm?.soemdsp_softwave_sample) {
    return { Out: 0 };
  }
  const st = state || createNodeGraphSoftwaveOscillatorState();
  if (!st.nativeHandle) {
    st.nativeHandle = wasm.soemdsp_softwave_create();
  }
  if (!st.nativeHandle) {
    return { Out: 0 };
  }
  const out = wasm.soemdsp_softwave_sample(
    st.nativeHandle,
    Math.max(0, Number(options.frequencyHz) || 0),
    Math.max(1, Number(options.sampleRate) || 44100),
    Math.round(Number(options.waveform) || 0),
    Number(options.morph) || 0,
    Number(options.phase) || 0,
    Number.isFinite(Number(options.level)) ? Number(options.level) : 1,
    Math.max(0, Number(options.antialias) || 0),
  );
  return { Out: Number.isFinite(out) ? out : 0 };
}
