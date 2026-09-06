// Registers the offline/render-time dispatch handler for hypersaw2 into
// nodeGraphLiveModuleEvaluators (main-thread / offline path).

globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

nodeGraphLiveModuleEvaluators.hypersaw2 = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  if (!runtime.hypersaw2States) runtime.hypersaw2States = new Map();
  const state = runtime.hypersaw2States.get(nodeId) || createNodeGraphHypersaw2State();
  runtime.hypersaw2States.set(nodeId, state);

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
      const wasm = nodeGraphHypersaw2Wasm?.exports;
      if (state.nativeHandle && wasm?.soemdsp_hypersaw2_reset) {
        wasm.soemdsp_hypersaw2_reset(state.nativeHandle);
      }
    }
    state.lastReset = Number.isFinite(rv) ? rv : 0;
  } else {
    state.lastReset = 0;
  }

  const result = nodeGraphHypersaw2Sample(state, {
    frequencyHz,
    sampleRate,
    phaseOffset: read("phase", 0),
    numVoices: read("voices", 7),
    distributePhase: read("distributePhase", 1),
    randomizePhase: read("randomizePhase", 0.10),
    vibratoAmp: read("vibratoAmp", 0),
    vibratoSpeed: read("vibratoSpeed", 0),
    vibratoFreqVary: read("vibratoFreqVary", 0),
    vibratoPhaseVary: read("vibratoPhaseVary", 0),
    phaseMultiplier: read("phaseMultiplier", 1),
    jitterDistance: read("jitterDistance", 0.1),
    jitterSpeed: read("jitterSpeed", 1),
    jitterPitch: read("jitterPitch", 0),
    distanceSlew: read("distanceSlew", 8),
    centerSide: read("centerSide", 0.5),
    waveform: read("waveform", 1),
    morph: read("morph", 0.5),
    level: read("amplitude", 0.35),
    seed: read("seed", 1),
  });

  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Phases", result.voicePhases);
    writeNodeGraphDataOutput(String(nodeId), "Amplitudes", result.voiceAmplitudes);
    writeNodeGraphDataOutput(String(nodeId), "Pans", result.voicePans);
  }

  return {
    Left: result.Left,
    Right: result.Right,
  };
};
