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
  const pitchInput = hasInput(nodeId, "0.1V/Oct")
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "dsf oscillator 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphPitchedFrequency === "function"
    ? nodeGraphPitchedFrequency(baseFrequency, pitchInput, referenceVoltage)
    : Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(pitchedFrequency, fHz)
    : pitchedFrequency;

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
  const phase = wrapNodeSliderValue(phaseKnob + phaseCv, 0, 1);

  const levelKnob = read("level", 1);
  const level = hasInput(nodeId, "Amplitude")
    ? levelKnob * nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Amplitude"),
      runtime,
      nodeId,
      1,
      "dsf oscillator amplitude input",
    )
    : levelKnob;

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
