// Offline/render-time RobinSupersaw. Pure math: node-graph-robin-supersaw.js.

nodeGraphLiveModuleEvaluators.robinSupersaw = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  const state = runtime.robinSupersawStates.get(nodeId) || createNodeGraphRobinSupersawState();
  runtime.robinSupersawStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

  const baseFrequency = Math.max(0, read("frequency", 100));
  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "RobinSupersaw 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseFrequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseFrequency, pitchCv, referenceVoltage)
      : baseFrequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));

  let reset = 0;
  if (hasInput?.(nodeId, "Reset") || hasInput?.("Reset")) {
    reset = Number(mixInput?.(nodeId, "Reset") ?? mixInput?.("Reset")) || 0;
  }

  const result = nodeGraphRobinSupersawSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    detuneCents: read("detuneCents", 30),
    voices: read("voices", 7),
    level: read("amplitude", 1),
    phaseSpread: read("phaseSpread", 1),
    stereoMode: read("stereoMode", 0),
    detuneAlgorithm: read("detuneAlgorithm", 2),
    portaTimeMin: read("portaTimeMin", 0),
    portaTimeMax: read("portaTimeMax", 0),
    portamentoStyle: read("portamentoStyle", 0.126),
    reset,
  });

  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Phases", result.voicePhases);
    writeNodeGraphDataOutput(String(nodeId), "Amplitudes", result.voiceAmplitudes);
    writeNodeGraphDataOutput(String(nodeId), "Pans", result.voicePans);
  }

  return {
    Mono: result.Mono,
    Left: result.Left,
    Right: result.Right,
  };
};
