// Mode Resonator — offline/render. Same mode_resonator.wasm as worklet (APP_POLICY §5).

const nodeGraphModeResonatorMainWasm = {
  promise: null,
  exports: null,
  failed: false,
};

function nodeGraphModeResonatorLoadMainWasm() {
  if (nodeGraphModeResonatorMainWasm.promise || nodeGraphModeResonatorMainWasm.failed) return;
  if (typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    nodeGraphModeResonatorMainWasm.failed = true;
    return;
  }
  nodeGraphModeResonatorMainWasm.promise = fetch("/native_modules/mode_resonator/mode_resonator.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`mode_resonator wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphModeResonatorMainWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphModeResonatorMainWasm.failed = true;
    });
}

function nodeGraphModeResonatorResolveFrequencyHz(
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
) {
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 440, frame, frames, frameValues);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    return nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
    });
  }
  return frequency;
}

nodeGraphLiveModuleEvaluators.modeResonator = ({
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
  nodeGraphModeResonatorLoadMainWasm();
  const wasm = nodeGraphModeResonatorMainWasm.exports;
  if (!wasm?.soemdsp_mode_resonator_create || !wasm?.soemdsp_mode_resonator_sample) {
    return 0;
  }
  if (!runtime.modeResonatorMainNativeHandles) runtime.modeResonatorMainNativeHandles = new Map();
  let handle = runtime.modeResonatorMainNativeHandles.get(nodeId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_mode_resonator_create();
    if (handle) runtime.modeResonatorMainNativeHandles.set(nodeId, handle);
  }
  if (!handle) return 0;

  // Trigger edge still on host state (cheap, no DSP twin).
  if (!runtime.modeResonatorTrigStates) runtime.modeResonatorTrigStates = new Map();
  let trigState = runtime.modeResonatorTrigStates.get(nodeId);
  if (!trigState) {
    trigState = { _lastTrig: 0 };
    runtime.modeResonatorTrigStates.set(nodeId, trigState);
  }

  const freq = Math.max(0, nodeGraphModeResonatorResolveFrequencyHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  ));
  const decay = readNodeGraphLiveEffectiveParam(runtime, node, "decay", 1, frame, frames, frameValues);
  const hold = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "hold", 0, frame, frames, frameValues)) !== 0;
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);

  const audioIn = Number(mixInput(nodeId)) || 0;
  const trig = typeof nodeGraphModeResonatorTriggerEdge === "function"
    ? nodeGraphModeResonatorTriggerEdge(trigState, mixInput(nodeId, "Trigger"))
    : 0;
  const x = audioIn + trig;

  const y = wasm.soemdsp_mode_resonator_sample(
    handle,
    x,
    freq,
    decay,
    hold ? 1 : 0,
    amplitude,
    Math.max(1, Number(sampleRate) || 44100),
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "mode resonator")
    : y;
};
