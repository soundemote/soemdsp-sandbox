// Offline / Render Sample host for hypersaw — same native core as the worklet.
// APP_POLICY §2/§5: no JS PolyBLEP twin. Silence until hypersaw.wasm is ready.
// Phosphor voice-bank display data is left empty offline for now (native
// voice_phase can fill that later).

const nodeGraphHypersawWasm = { promise: null, exports: null, failed: false };

function nodeGraphHypersawLoadWasm() {
  if (nodeGraphHypersawWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphHypersawWasm.promise = fetch("/native_modules/hypersaw/hypersaw.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`hypersaw wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphHypersawWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphHypersawWasm.failed = true;
    });
}

function createNodeGraphHypersawState() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphHypersawNativeState(state) {
  const wasm = nodeGraphHypersawWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_hypersaw_destroy) {
    wasm.soemdsp_hypersaw_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

// options: { frequencyHz, sampleRate, phaseOffset, numVoices, spread,
//   randomAmount, driftAmount, level }
// returns: { Left, Right, voicePhases, voiceAmplitudes, voicePans }
function nodeGraphHypersawSample(state, options = {}) {
  nodeGraphHypersawLoadWasm();
  const wasm = nodeGraphHypersawWasm.exports;
  if (!wasm?.soemdsp_hypersaw_create || !wasm?.soemdsp_hypersaw_sample) {
    return { Left: 0, Right: 0, voicePhases: [], voiceAmplitudes: [], voicePans: [] };
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_hypersaw_create();
  }
  if (!state.nativeHandle) {
    return { Left: 0, Right: 0, voicePhases: [], voiceAmplitudes: [], voicePans: [] };
  }
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const frequencyHz = Number(options.frequencyHz) || 0;
  const phaseOffset = Number(options.phaseOffset) || 0;
  const numVoices = Math.round(Number(options.numVoices) || 1);
  const spread = Number(options.spread) || 0;
  const randomAmount = Number(options.randomAmount) || 0;
  const driftAmount = Number(options.driftAmount) || 0;
  const level = Number(options.level) || 0;
  wasm.soemdsp_hypersaw_sample(
    state.nativeHandle,
    frequencyHz,
    sampleRate,
    phaseOffset,
    numVoices,
    spread,
    randomAmount,
    driftAmount,
    level,
  );
  const n = Math.max(0, Math.min(32, numVoices));
  const voicePhases = new Array(n);
  const voiceAmplitudes = new Array(n);
  const voicePans = new Array(n);
  // Optional: native phase taps for later phosphor WISIWIH; amplitudes/pans
  // not exported yet — leave zeros so UI does not invent a JS twin.
  for (let i = 0; i < n; i++) {
    voicePhases[i] = wasm.soemdsp_hypersaw_voice_phase
      ? Number(wasm.soemdsp_hypersaw_voice_phase(state.nativeHandle, i)) || 0
      : 0;
    voiceAmplitudes[i] = 0;
    voicePans[i] = 0;
  }
  return {
    Left: Number(wasm.soemdsp_hypersaw_left(state.nativeHandle)) || 0,
    Right: Number(wasm.soemdsp_hypersaw_right(state.nativeHandle)) || 0,
    voicePhases,
    voiceAmplitudes,
    voicePans,
  };
}
