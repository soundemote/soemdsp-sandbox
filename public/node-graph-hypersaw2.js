// Offline / Render Sample host for hypersaw2 — same native core as the worklet.
// APP_POLICY §2/§5: no JS PolyBLEP twin. Silence until hypersaw2.wasm is ready.

const nodeGraphHypersaw2Wasm = { promise: null, exports: null, failed: false };

function nodeGraphHypersaw2LoadWasm() {
  if (nodeGraphHypersaw2Wasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphHypersaw2Wasm.promise = fetch("/native_modules/hypersaw2/hypersaw2.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`hypersaw2 wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphHypersaw2Wasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphHypersaw2Wasm.failed = true;
    });
}

function createNodeGraphHypersaw2State() {
  return { nativeHandle: 0 };
}

function destroyNodeGraphHypersaw2NativeState(state) {
  const wasm = nodeGraphHypersaw2Wasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_hypersaw2_destroy) {
    wasm.soemdsp_hypersaw2_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

function nodeGraphHypersaw2Sample(state, options = {}) {
  nodeGraphHypersaw2LoadWasm();
  const wasm = nodeGraphHypersaw2Wasm.exports;
  if (!wasm?.soemdsp_hypersaw2_create || !wasm?.soemdsp_hypersaw2_sample) {
    return { Left: 0, Right: 0, voicePhases: [], voiceAmplitudes: [], voicePans: [] };
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_hypersaw2_create();
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
  const randomizePhase = Number(options.randomizePhase ?? options.randomAmount);
  const vibratoAmp = Number(options.vibratoAmp);
  const vibratoSpeedHz = Number(options.vibratoSpeedHz ?? options.vibratoSpeed);
  const vibratoFreqVary = Number(options.vibratoFreqVary);
  const vibratoPhaseVary = Number(options.vibratoPhaseVary);
  const phaseMultiplier = Number(options.phaseMultiplier);
  const jitterDistance = Number(options.jitterDistance);
  const jitterSpeed = Number(options.jitterSpeed ?? options.jitterSpeedHz);
  const jitterPitch = Number(options.jitterPitch ?? options.driftPitch);
  const centerSide = Number(options.centerSide);
  const waveform = Number(options.waveform);
  const morph = Number(options.morph);
  const level = Number(options.level) || 0;
  const seed = Number(options.seed);
  wasm.soemdsp_hypersaw2_sample(
    state.nativeHandle,
    frequencyHz,
    sampleRate,
    phaseGlobal,
    numVoicesExact,
    Number.isFinite(distributePhase) ? distributePhase : 1,
    Number.isFinite(randomizePhase) ? randomizePhase : 0.10,
    Number.isFinite(vibratoAmp) ? vibratoAmp : 0,
    Number.isFinite(vibratoSpeedHz) ? vibratoSpeedHz : 0,
    Number.isFinite(vibratoFreqVary) ? vibratoFreqVary : 0,
    Number.isFinite(vibratoPhaseVary) ? vibratoPhaseVary : 0,
    Number.isFinite(phaseMultiplier) ? phaseMultiplier : 1,
    Number.isFinite(jitterDistance) ? jitterDistance : 0.1,
    Number.isFinite(jitterSpeed) ? jitterSpeed : 1,
    Number.isFinite(jitterPitch) ? jitterPitch : 0,
    Number.isFinite(centerSide) ? centerSide : 0.5,
    Number.isFinite(waveform) ? waveform : 1,
    Number.isFinite(morph) ? morph : 0.5,
    level,
    Number.isFinite(seed) ? seed : 1,
  );
  const n = wasm.soemdsp_hypersaw2_voice_count
    ? Math.max(0, Math.min(64, wasm.soemdsp_hypersaw2_voice_count(state.nativeHandle) | 0))
    : Math.max(0, Math.min(64, Math.ceil(numVoicesExact - 1e-9)));
  const lastFrac = wasm.soemdsp_hypersaw2_voice_last_frac
    ? Number(wasm.soemdsp_hypersaw2_voice_last_frac(state.nativeHandle)) || 0
    : 0;
  const voicePhases = new Array(n);
  const voiceAmplitudes = new Array(n);
  const voicePans = new Array(n);
  for (let i = 0; i < n; i++) {
    voicePhases[i] = wasm.soemdsp_hypersaw2_voice_phase
      ? Number(wasm.soemdsp_hypersaw2_voice_phase(state.nativeHandle, i)) || 0
      : 0;
    const isCenter = i === 0;
    voiceAmplitudes[i] = (lastFrac > 0 && i === n - 1) ? lastFrac : 1;
    voicePans[i] = isCenter ? 0 : (((i - 1) % 2 === 0) ? -1 : 1);
  }
  return {
    Left: Number(wasm.soemdsp_hypersaw2_left(state.nativeHandle)) || 0,
    Right: Number(wasm.soemdsp_hypersaw2_right(state.nativeHandle)) || 0,
    voicePhases,
    voiceAmplitudes,
    voicePans,
  };
}
