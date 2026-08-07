// Sinepulse — offline/render.

function nodeGraphSinepulseResolveFrequencyHz(
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
) {
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 100, frame, frames, frameValues);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    return nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    });
  }
  return frequency;
}

nodeGraphLiveModuleEvaluators.sinepulse = ({
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
  if (!runtime.sinepulseStates) runtime.sinepulseStates = new Map();
  let state = runtime.sinepulseStates.get(nodeId);
  if (!state) {
    state = createNodeGraphSinepulseState();
    runtime.sinepulseStates.set(nodeId, state);
  }

  const freq = nodeGraphSinepulseResolveFrequencyHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  );
  const sweep = readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 0.65, frame, frames, frameValues);
  const direction = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "direction", 0, frame, frames, frameValues));
  const curve = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "curve", 1, frame, frames, frameValues));
  const hardReset = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "hardReset", 1, frame, frames, frameValues));
  const phase = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);
  const increment = Number(mixInput(nodeId, "Increment")) || 0;
  const resetGate = mixInput(nodeId, "Reset");
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);

  const y = nodeGraphSinepulseSample(
    state, freq, sweep, direction, curve, hardReset, phase, amplitude, increment, resetGate, rate,
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "sinepulse")
    : y;
};
