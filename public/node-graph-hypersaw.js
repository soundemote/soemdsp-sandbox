// Offline / Render Sample host for hypersaw — same native core as the worklet.
// APP_POLICY §2/§5: no JS PolyBLEP twin. Silence until hypersaw.wasm is ready.

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
  const phaseGlobal = Number(options.phaseOffset) || 0;
  let numVoicesExact = Number(options.numVoices);
  if (!Number.isFinite(numVoicesExact) || numVoicesExact < 1) numVoicesExact = 1;
  if (numVoicesExact > 64) numVoicesExact = 64;
  const distributePhase = Number(options.distributePhase ?? options.spread);
  const randomizePhase = Number(options.randomizePhase ?? options.randomAmount) || 0;
  const vibratoDistribution = Number(
    options.vibratoDistribution ?? options.vibratoOffset,
  ) || 0;
  const vibratoAmp = Number(options.vibratoAmp) || 0;
  const vibratoSpeedHz = Number(options.vibratoSpeedHz ?? options.vibratoSpeed) || 0;
  const driftStyle = Number(options.driftStyle);
  const driftAmp = Number(options.driftAmp ?? options.driftAmount);
  const driftPitch = Number(options.driftPitch);
  const driftJitterHz = Number(options.driftJitterHz ?? options.driftJitter);
  const driftCompensation = Number(options.driftCompensation) || 0;
  const centerSide = Number(options.centerSide);
  const waveform = Number(options.waveform);
  const morph = Number(options.morph);
  const level = Number(options.level) || 0;
  const seed = Number(options.seed);
  wasm.soemdsp_hypersaw_sample(
    state.nativeHandle,
    frequencyHz,
    sampleRate,
    phaseGlobal,
    numVoicesExact,
    Number.isFinite(distributePhase) ? distributePhase : 1,
    randomizePhase,
    vibratoDistribution,
    vibratoAmp,
    vibratoSpeedHz,
    Number.isFinite(driftStyle) ? driftStyle : 0,
    Number.isFinite(driftAmp) ? driftAmp : 22.6,
    Number.isFinite(driftPitch) ? driftPitch : 64.256,
    Number.isFinite(driftJitterHz) ? driftJitterHz : 246,
    driftCompensation,
    Number.isFinite(centerSide) ? centerSide : 0.5,
    Number.isFinite(waveform) ? waveform : 1,
    Number.isFinite(morph) ? morph : 0.5,
    level,
    Number.isFinite(seed) ? seed : 1,
  );
  const n = wasm.soemdsp_hypersaw_voice_count
    ? Math.max(0, Math.min(64, wasm.soemdsp_hypersaw_voice_count(state.nativeHandle) | 0))
    : Math.max(0, Math.min(64, Math.ceil(numVoicesExact - 1e-9)));
  const lastFrac = wasm.soemdsp_hypersaw_voice_last_frac
    ? Number(wasm.soemdsp_hypersaw_voice_last_frac(state.nativeHandle)) || 0
    : 0;
  const voicePhases = new Array(n);
  const voiceAmplitudes = new Array(n);
  const voicePans = new Array(n);
  for (let i = 0; i < n; i++) {
    voicePhases[i] = wasm.soemdsp_hypersaw_voice_phase
      ? Number(wasm.soemdsp_hypersaw_voice_phase(state.nativeHandle, i)) || 0
      : 0;
    const isCenter = i === 0;
    voiceAmplitudes[i] = (lastFrac > 0 && i === n - 1) ? lastFrac : 1;
    voicePans[i] = isCenter ? 0 : (((i - 1) % 2 === 0) ? -1 : 1);
  }
  return {
    Left: Number(wasm.soemdsp_hypersaw_left(state.nativeHandle)) || 0,
    Right: Number(wasm.soemdsp_hypersaw_right(state.nativeHandle)) || 0,
    voicePhases,
    voiceAmplitudes,
    voicePans,
  };
}
