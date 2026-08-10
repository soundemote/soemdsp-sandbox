// Mode Resonator — offline/render.

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
  if (!runtime.modeResonatorStates) runtime.modeResonatorStates = new Map();
  let state = runtime.modeResonatorStates.get(nodeId);
  if (!state) {
    state = createNodeGraphModeResonatorState();
    runtime.modeResonatorStates.set(nodeId, state);
  }

  const freq = Math.max(0, nodeGraphModeResonatorResolveFrequencyHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  ));
  const decay = readNodeGraphLiveEffectiveParam(runtime, node, "decay", 1, frame, frames, frameValues);
  const hold = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "hold", 0, frame, frames, frameValues)) !== 0;
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);

  const audioIn = Number(mixInput(nodeId)) || 0;
  const trig = nodeGraphModeResonatorTriggerEdge(state, mixInput(nodeId, "Trigger"));
  const x = audioIn + trig;

  const y = nodeGraphModeResonatorSample(
    state, x, freq, decay, hold, amplitude, sampleRate,
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "mode resonator")
    : y;
};
