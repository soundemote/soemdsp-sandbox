// Registers the offline/render-time dispatch handler for additiveOsc and
// gpuAdditiveOsc into nodeGraphLiveModuleEvaluators (declared in
// node-graph-live-frame-evaluator.js). Both types share the same evaluator
// -- extracted from the inline if/else-if branch that used to live in that
// file, which matched both type strings via a single condition.
function nodeGraphAdditiveOscLiveEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate, graphInputValue }) {
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "additive osc reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  const phaseOffset = nodeGraphPhaseRadians(readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "phase",
    0,
    frame,
    frames,
    frameValues,
  ));
  const frequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "frequency",
    100,
    frame,
    frames,
    frameValues,
  );
  const referenceVoltage = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120;
  const pitchInput = hasInput(nodeId, "0.1V/Oct")
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "additive osc 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = Math.max(0, frequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const effectiveFrequency = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(pitchedFrequency, fHz)
    : pitchedFrequency;
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "additive osc increment input",
  );
  const phaseIncrement = (effectiveFrequency / sampleRate) + incrementInput;
  const additiveSample = nodeGraphAdditiveOscillatorSample(
    runtime,
    nodeId,
    phase + phaseOffset,
    {
      frequency: effectiveFrequency,
      dampingFilterFrequency: readNodeGraphLiveEffectiveParam(runtime, node, "dampingFilterFrequency", 20000, frame, frames, frameValues),
      dampingGraphValueAt: (x) => graphInputValue(nodeId, "Damping Graph", x, 1),
      harmonics: readNodeGraphLiveEffectiveParam(runtime, node, "harmonics", 32, frame, frames, frameValues),
      harmonicPhaseAdd: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseAdd", 0, frame, frames, frameValues),
      harmonicPhaseMultiply: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseMultiply", 0, frame, frames, frameValues),
      level: readNodeGraphLiveEffectiveParam(runtime, node, "level", 0.35, frame, frames, frameValues),
      modA: readNodeGraphLiveEffectiveParam(runtime, node, "modA", 0.5, frame, frames, frameValues),
      phaseGraphValueAt: (x) => graphInputValue(nodeId, "Phase Graph", x, 0),
      waveform: readNodeGraphLiveEffectiveParam(runtime, node, "waveform", 1, frame, frames, frameValues),
    },
    sampleRate,
  );
  const value = { Out: additiveSample };
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
}
nodeGraphLiveModuleEvaluators.additiveOsc = nodeGraphAdditiveOscLiveEvaluator;
nodeGraphLiveModuleEvaluators.gpuAdditiveOsc = nodeGraphAdditiveOscLiveEvaluator;
