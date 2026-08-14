// Softwave Oscillator — offline/render path (DistortionOscillator math, Softwave name).

nodeGraphLiveModuleEvaluators.softwaveOsc = ({
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
  const state = runtime.softwaveOscStates.get(nodeId) || createNodeGraphSoftwaveOscillatorState();
  runtime.softwaveOscStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

  const baseFrequency = Math.max(0, read("frequency", 100));
  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(
      nodeGraphSafeFilterNumber(
        mixInput(nodeId, "0.1V/Oct"),
        runtime,
        nodeId,
        null,
        "softwave 0.1v/oct",
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

  const morphKnob = read("morph", 0.5);
  const morphCv = hasInput(nodeId, "Morph")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Morph"), runtime, nodeId, 0, "softwave morph")
    : 0;
  // Morph jack is additive domain CV (clamp), not param-row MOD.
  const morphRaw = typeof nodeGraphParamSignalInAdditive === "function"
    ? nodeGraphParamSignalInAdditive(morphKnob, morphCv)
    : morphKnob + morphCv;
  const morph = clampNodeSliderValue(morphRaw, 0, 1);

  const phaseKnob = read("phase", 0);
  const phaseCv = hasInput(nodeId, "Phase")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Phase"), runtime, nodeId, 0, "softwave phase")
    : 0;
  const phase = typeof nodeGraphParamSignalInPhaseAdd === "function"
    ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
    : wrapNodeSliderValue(phaseKnob + phaseCv, 0, 1);

  const levelKnob = read("amplitude", 1);
  const hasAmp = hasInput?.(nodeId, "Amplitude") || hasInput(nodeId, "Amplitude");
  const ampCv = hasAmp
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Amplitude"), runtime, nodeId, 1, "amp")
    : 1;
  const level = typeof nodeGraphParamSignalInAmplitude === "function"
    ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
    : (hasAmp ? levelKnob * ampCv : levelKnob);

  return nodeGraphSoftwaveOscillatorSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    waveform: read("waveform", 0),
    morph,
    phase,
    level,
    antialias: read("antialias", 0),
  });
};
