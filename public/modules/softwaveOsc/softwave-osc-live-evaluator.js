// Softwave Oscillator — offline/render path (DistortionOscillator math, Softwave name).
// Morph / Phase / Amp are parameters (+ MOD). Reset is rising-edge phase hard-sync.

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

  const resetValue = hasInput(nodeId, "Reset")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Reset"), runtime, nodeId, 0, "softwave reset")
    : 0;
  const resetEdge = (state.lastReset || 0) <= 0 && resetValue > 0;
  state.lastReset = resetValue;
  if (resetEdge) {
    nodeGraphSoftwaveOscillatorReset(state);
  }

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

  const morph = clampNodeSliderValue(read("morph", 0.5), 0, 1);
  const phase = wrapNodeSliderValue(read("phase", 0), 0, 1);
  const level = clampNodeSliderValue(read("amplitude", 1), 0, 1);

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
