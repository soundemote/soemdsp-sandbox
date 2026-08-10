// Comb Resonator — offline/render.

function nodeGraphCombResonatorResolveFrequencyHz(
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
) {
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 110, frame, frames, frameValues);
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
  if (!runtime.combResonatorStates) runtime.combResonatorStates = new Map();
  let state = runtime.combResonatorStates.get(nodeId);
  if (!state) {
    state = createNodeGraphCombResonatorState();
    runtime.combResonatorStates.set(nodeId, state);
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
  const trig = nodeGraphCombResonatorTriggerEdge(state, mixInput(nodeId, "Trigger"));
  const x = audioIn + trig;

  const y = nodeGraphCombResonatorSample(
    state, x, freq, decay, hold, damping, topology, invert, depth, amplitude, sampleRate,
  );
  return typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(y, runtime, nodeId, null, "comb resonator")
    : y;
};
