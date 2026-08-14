// Curve Osc — offline / render path.
nodeGraphLiveModuleEvaluators.curveOsc = ({
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
  if (!runtime.curveOscStates) {
    runtime.curveOscStates = new Map();
  }
  const state = runtime.curveOscStates.get(nodeId) || createNodeGraphCurveOscState();
  runtime.curveOscStates.set(nodeId, state);

  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

  if (hasInput?.(nodeId, "Reset")) {
    const reset = nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Reset"),
      runtime,
      nodeId,
      0,
      "curve osc reset",
    );
    if (reset > 0.5) {
      state.phase = 0;
    }
  }

  const baseFrequency = Math.max(0, read("frequency", 110));
  const pitchReferenceAudio = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio)
    : { pitchReferenceMidiNote: 60 };
  const referenceVoltage = (pitchReferenceAudio.pitchReferenceMidiNote || 60) / 120;
  const hasPitch = Boolean(hasInput?.(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? clampNodeSliderValue(
      nodeGraphSafeFilterNumber(
        mixInput(nodeId, "0.1V/Oct"),
        runtime,
        nodeId,
        null,
        "curve osc 0.1v",
      ),
      -1,
      1,
    )
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: baseFrequency,
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

  const phaseKnob = read("phase", 0);
  const phaseCv = hasInput?.(nodeId, "Phase")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Phase"), runtime, nodeId, 0, "curve osc phase")
    : 0;
  const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
    ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
    : wrapNodeSliderValue(phaseKnob + phaseCv, 0, 1);

  const levelKnob = read("amplitude", 1);
  const hasAmp = Boolean(hasInput?.(nodeId, "Amplitude"));
  const ampCv = hasAmp
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Amplitude"), runtime, nodeId, 1, "curve osc amp")
    : 1;
  const level = typeof nodeGraphParamSignalInAmplitude === "function"
    ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
    : (hasAmp ? levelKnob * ampCv : levelKnob);

  return nodeGraphCurveOscillatorSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    curve: read("curve", 0),
    a: read("a", 0.5),
    b: read("b", 0.5),
    morph: read("morph", 0.35),
    project: read("project", 0),
    projectAngle: read("projectAngle", 0),
    phase,
    level,
  });
};
