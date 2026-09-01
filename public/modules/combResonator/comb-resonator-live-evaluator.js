// Comb Resonator — offline/render. Same comb_resonator.wasm as worklet (APP_POLICY §5).

const nodeGraphCombResonatorMainWasm = {
  promise: null,
  exports: null,
  failed: false,
};

function nodeGraphCombResonatorLoadMainWasm() {
  if (nodeGraphCombResonatorMainWasm.promise || nodeGraphCombResonatorMainWasm.failed) return;
  if (typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    nodeGraphCombResonatorMainWasm.failed = true;
    return;
  }
  nodeGraphCombResonatorMainWasm.promise = fetch("/native_modules/comb_resonator/comb_resonator.wasm?v=resonator-clip-1")
    .then((response) => {
      if (!response.ok) throw new Error(`comb_resonator wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphCombResonatorMainWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphCombResonatorMainWasm.failed = true;
    });
}

function nodeGraphCombResonatorResolveFrequencyHz(
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
) {
  const absHz = typeof nodeGraphResolveAbsHzJack === "function"
    ? nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId)
    : null;
  if (absHz != null) {
    const n = Number(absHz);
    return Number.isFinite(n) ? n : 0;
  }
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 110, frame, frames, frameValues);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    return nodeGraphParamResolveOscPitchHz({baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    });
  }
  return frequency;
}

nodeGraphLiveModuleEvaluators.combResonator = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
  hasInput,
}) => {
  nodeGraphCombResonatorLoadMainWasm();
  const wasm = nodeGraphCombResonatorMainWasm.exports;
  if (!wasm?.soemdsp_comb_resonator_create || !wasm?.soemdsp_comb_resonator_sample) {
    return 0;
  }
  if (!runtime.combResonatorMainNativeHandles) runtime.combResonatorMainNativeHandles = new Map();
  let handle = runtime.combResonatorMainNativeHandles.get(nodeId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_comb_resonator_create();
    if (handle) runtime.combResonatorMainNativeHandles.set(nodeId, handle);
  }
  if (!handle) return 0;

  if (!runtime.combResonatorTrigStates) runtime.combResonatorTrigStates = new Map();
  let trigState = runtime.combResonatorTrigStates.get(nodeId);
  if (!trigState) {
    trigState = { _lastTrig: 0 };
    runtime.combResonatorTrigStates.set(nodeId, trigState);
  }

  const freq = Math.max(0, nodeGraphCombResonatorResolveFrequencyHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  ));
  const decay = readNodeGraphLiveEffectiveParam(runtime, node, "decay", 1, frame, frames, frameValues);
  const hold = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "hold", 0, frame, frames, frameValues)) !== 0;
  const damping = readNodeGraphLiveEffectiveParam(runtime, node, "damping", 0, frame, frames, frameValues);
  const topology = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "topology", 0, frame, frames, frameValues));
  const invert = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "invert", 0, frame, frames, frameValues));
  const depth = readNodeGraphLiveEffectiveParam(runtime, node, "depth", 1, frame, frames, frameValues);
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);

  const audioIn = Number(mixInput(nodeId)) || 0;
  const trig = typeof nodeGraphCombResonatorTriggerEdge === "function"
    ? nodeGraphCombResonatorTriggerEdge(trigState, mixInput(nodeId, "Trigger"))
    : 0;
  const x = audioIn + trig;

  const y = wasm.soemdsp_comb_resonator_sample(
    handle,
    x,
    freq,
    decay,
    hold ? 1 : 0,
    damping,
    topology,
    invert,
    depth,
    amplitude,
    Math.max(1, Number(sampleRate) || 44100),
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "comb resonator")
    : y;
};
