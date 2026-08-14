// Registers the offline/render-time dispatch handler for dsfOscillator into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
//
// CV jacks (same idea as PolyBLEP's left-side inputs):
//   0.1V/Oct  -- pitch tracking vs patch pitch-reference note
//   Phase     -- adds to the Phase knob (cycles)
//   Amplitude -- multiplies the Amplitude knob when wired
nodeGraphLiveModuleEvaluators.dsfOscillator = ({
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
  const state = runtime.dsfOscillatorStates.get(nodeId) || createNodeGraphDsfOscillatorState();
  runtime.dsfOscillatorStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

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
      "dsf oscillator 0.1v/oct input",
    ), -1, 1)
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
  const phaseCv = hasInput(nodeId, "Phase")
    ? nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Phase"),
      runtime,
      nodeId,
      0,
      "dsf oscillator phase input",
    )
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

  return nodeGraphDsfOscillatorSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    waveform: read("waveform", 1),
    morph: read("morph", 1),
    pulseWidth: read("pulseWidth", 0.5),
    blend: read("blend", 0.5),
    phase,
    level,
  });
};
