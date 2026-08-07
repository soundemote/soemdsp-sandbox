// Softpop Oscillator — offline/render.

function nodeGraphSoftpopResolveFrequencyHz(runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput) {
  const frequency = readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function"
    ? hasInput(nodeId, "0.1V/Oct")
    : false;
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
  if (typeof nodeGraphPitchedFrequency === "function") {
    return nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage);
  }
  return frequency;
}

nodeGraphLiveModuleEvaluators.softpopOscillator = ({
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
  if (!runtime.softpopOscillatorStates) {
    runtime.softpopOscillatorStates = new Map();
  }
  const state = runtime.softpopOscillatorStates.get(nodeId) || createNodeGraphSoftpopOscillatorState();
  runtime.softpopOscillatorStates.set(nodeId, state);

  const effectiveHz = nodeGraphSoftpopResolveFrequencyHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  );
  const out = nodeGraphSoftpopOscillatorSample(
    state,
    {
      amplitude: readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues),
      color: readNodeGraphLiveEffectiveParam(runtime, node, "color", 0, frame, frames, frameValues),
      frequency: Math.max(0, effectiveHz),
      q: readNodeGraphLiveEffectiveParam(runtime, node, "q", 4, frame, frames, frameValues),
      reset: mixInput(nodeId, "Reset"),
      seed: readNodeGraphLiveEffectiveParam(runtime, node, "seed", 1, frame, frames, frameValues),
      stereoMode: readNodeGraphLiveEffectiveParam(runtime, node, "stereoMode", 0, frame, frames, frameValues),
    },
    sampleRate,
    nodeId,
  );
  return {
    Left: nodeGraphSafeFilterNumber(out.Left, runtime, nodeId, null, "softpop left"),
    Right: nodeGraphSafeFilterNumber(out.Right, runtime, nodeId, null, "softpop right"),
    Out: nodeGraphSafeFilterNumber(out.Out, runtime, nodeId, null, "softpop mono"),
  };
};

