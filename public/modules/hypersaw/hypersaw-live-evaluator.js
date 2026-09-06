// Registers the offline/render-time dispatch handler for hypersaw into
// nodeGraphLiveModuleEvaluators (main-thread / offline path).

globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.hypersaw = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.hypersawStates.get(nodeId) || createNodeGraphHypersawState();
  runtime.hypersawStates.set(nodeId, state);

  const read = (key, fallback) => {
    if (typeof readNodeGraphLiveEffectiveParam === "function") {
      return readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
    }
    const raw = Number(node?.params?.[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };

  let frequencyHz = read("frequency", 100);
  if (hasInput?.("f") || hasInput?.("ƒ")) {
    const f = Number(mixInput?.("f") ?? mixInput?.("ƒ"));
    if (Number.isFinite(f)) frequencyHz = f;
  } else if (hasInput?.("0.1V/Oct") || hasInput?.("0.1V")) {
    const cv = Number(mixInput?.("0.1V/Oct") ?? mixInput?.("0.1V"));
    if (Number.isFinite(cv) && typeof nodeGraphPitchedFrequency === "function") {
      frequencyHz = nodeGraphPitchedFrequency(frequencyHz, cv, 48 / 120);
    }
  }

  if (hasInput?.("Reset")) {
    const rv = Number(mixInput?.("Reset"));
    if (Number.isFinite(rv) && rv > 0 && state.lastReset <= 0) {
      const wasm = nodeGraphHypersawWasm?.exports;
      if (state.nativeHandle && wasm?.soemdsp_hypersaw_reset) {
        wasm.soemdsp_hypersaw_reset(state.nativeHandle);
      }
    }
    state.lastReset = Number.isFinite(rv) ? rv : 0;
  } else {
    state.lastReset = 0;
  }

  const hypersawResult = nodeGraphHypersawSample(state, {
    frequencyHz,
    sampleRate,
    phaseOffset: read("phase", 0),
    numVoices: read("voices", 32),
    distributePhase: read("distributePhase", 1),
    randomizePhase: read("randomizePhase", 0),
    vibratoDistribution: read("vibratoDistribution", read("vibratoOffset", 0)),
    vibratoAmp: read("vibratoAmp", 0),
    vibratoSpeedHz: read("vibratoSpeed", 0),
    driftStyle: read("driftStyle", 0),
    driftAmp: read("driftAmp", 22.6),
    driftPitch: read("driftPitch", 64.256),
    driftJitterHz: read("driftJitter", 246),
    driftCompensation: read("driftCompensation", 0),
    centerSide: read("centerSide", 0.5),
    waveform: read("waveform", 1),
    morph: read("morph", 0.5),
    level: read("amplitude", 0.35),
    seed: read("seed", 1),
  });

  // Face burn stems only — not exposed as dataOutput jacks.
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Phases", hypersawResult.voicePhases);
    writeNodeGraphDataOutput(String(nodeId), "Amplitudes", hypersawResult.voiceAmplitudes);
    writeNodeGraphDataOutput(String(nodeId), "Pans", hypersawResult.voicePans);
  }

  return {
    Left: hypersawResult.Left,
    Right: hypersawResult.Right,
  };
};
