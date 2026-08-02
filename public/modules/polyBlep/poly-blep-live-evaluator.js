// Registers the offline/render-time dispatch handler for osc, polyBlep, and
// blit into nodeGraphLiveModuleEvaluators (declared in
// node-graph-live-frame-evaluator.js). Extracted from the inline
// if/else-if branch that used to live in that file, which matched all
// three (plus sineWavetable, migrated separately and checked earlier in
// the registry lookup) via nodeGraphIsPolyBlepOscillatorType -- a
// hardcoded type === "osc" || "polyBlep" || "sineWavetable" || "blit"
// predicate, not a data-driven one, so registering the three remaining
// literal keys here is behavior-preserving.
function nodeGraphPolyBlepOscillatorLiveEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) {
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "osc reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  if (resetEdge) {
    runtime.triangleStates.set(nodeId, 0);
  }
  const phaseOffset = nodeGraphPhaseRadians(
    readNodeGraphLiveEffectiveParam(
      runtime,
      node,
      "phase",
      0,
      frame,
      frames,
      frameValues,
    ),
  );
  const frequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "frequency",
    100,
    frame,
    frames,
    frameValues,
  );
  const waveform = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "waveform",
    0,
    frame,
    frames,
    frameValues,
  );
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "osc increment input",
  );
  const referenceVoltage = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120;
  const pitchInput = hasInput(nodeId, "0.1V/Oct")
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "osc 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphPitchedFrequency === "function"
    ? nodeGraphPitchedFrequency(frequency, pitchInput, referenceVoltage)
    : Math.max(0, frequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
  // Universal `f` jack: absolute Hz 0..Speed Limit overrides pitch path when wired.
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(pitchedFrequency, fHz)
    : pitchedFrequency;
  const phaseIncrement = (effectiveFrequency / sampleRate) + incrementInput;
  const level = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "level",
    1,
    frame,
    frames,
    frameValues,
  );
  const sampleOscillator = nodeGraphOscillatorWaveformSample;
  const selected = sampleOscillator(
    runtime,
    nodeId,
    phase + phaseOffset,
    phaseIncrement,
    waveform,
  ) * level;
  const value = {
    Out: selected,
    Saw: sampleOscillator(runtime, `${nodeId}:saw`, phase + phaseOffset, phaseIncrement, 0) * level,
    Ramp: sampleOscillator(runtime, `${nodeId}:ramp`, phase + phaseOffset, phaseIncrement, 1) * level,
    Square: sampleOscillator(runtime, `${nodeId}:square`, phase + phaseOffset, phaseIncrement, 2) * level,
    Tri: sampleOscillator(runtime, `${nodeId}:tri`, phase + phaseOffset, phaseIncrement, 3) * level,
    Sine: sampleOscillator(runtime, `${nodeId}:sine`, phase + phaseOffset, phaseIncrement, 4) * level,
    "Wave Out": selected,
    Noise: selected,
  };
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
}
nodeGraphLiveModuleEvaluators.osc = nodeGraphPolyBlepOscillatorLiveEvaluator;
nodeGraphLiveModuleEvaluators.polyBlep = nodeGraphPolyBlepOscillatorLiveEvaluator;
nodeGraphLiveModuleEvaluators.blit = nodeGraphPolyBlepOscillatorLiveEvaluator;
