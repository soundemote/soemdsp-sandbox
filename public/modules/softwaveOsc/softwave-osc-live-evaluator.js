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
  const pitchInput = hasInput(nodeId, "0.1V/Oct")
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
  const pitchedFrequency = Math.max(
    0,
    baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)),
  );
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(pitchedFrequency, fHz)
    : pitchedFrequency;

  const morphKnob = read("morph", 0.5);
  const morphCv = hasInput(nodeId, "Morph")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Morph"), runtime, nodeId, 0, "softwave morph")
    : 0;
  const morph = clampNodeSliderValue(morphKnob + morphCv, 0, 1);

  const phaseKnob = read("phase", 0);
  const phaseCv = hasInput(nodeId, "Phase")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Phase"), runtime, nodeId, 0, "softwave phase")
    : 0;
  const phase = wrapNodeSliderValue(phaseKnob + phaseCv, 0, 1);

  const levelKnob = read("level", 1);
  const level = hasInput(nodeId, "Amplitude")
    ? levelKnob * nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Amplitude"),
      runtime,
      nodeId,
      1,
      "softwave amp",
    )
    : levelKnob;

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
