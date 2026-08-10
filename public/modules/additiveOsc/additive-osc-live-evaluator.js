// Offline/render host for additiveOsc / gpuAdditiveOsc.
// Same additive_osc.wasm as the worklet (APP_POLICY §5). Silence when
// Damping/Phase graphs are wired (native has no curve path) or WASM cold.
function nodeGraphAdditiveOscLiveEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate, graphInputValue }) {
  void graphInputValue;
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
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "additive osc 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
      : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "additive osc increment input",
  );
  const phaseIncrement = (effectiveFrequency / sampleRate) + incrementInput;
  const graphKey = typeof nodeGraphGraphInputKey === "function"
    ? (id, name) => nodeGraphGraphInputKey(id, name)
    : (id, name) => `${id}:${name}`;
  const hasGraphInput = (
    (runtime.graphInputConnections?.get(graphKey(nodeId, "Damping Graph")) || []).length > 0
    || (runtime.graphInputConnections?.get(graphKey(nodeId, "Phase Graph")) || []).length > 0
  );
  const additiveSample = nodeGraphAdditiveOscillatorSample(
    runtime,
    nodeId,
    phase + phaseOffset,
    {
      frequency: effectiveFrequency,
      dampingFilterFrequency: readNodeGraphLiveEffectiveParam(runtime, node, "dampingFilterFrequency", 20000, frame, frames, frameValues),
      hasGraphInput,
      harmonics: readNodeGraphLiveEffectiveParam(runtime, node, "harmonics", 32, frame, frames, frameValues),
      harmonicPhaseAdd: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseAdd", 0, frame, frames, frameValues),
      harmonicPhaseMultiply: readNodeGraphLiveEffectiveParam(runtime, node, "harmonicPhaseMultiply", 0, frame, frames, frameValues),
      level: readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 0.35, frame, frames, frameValues),
      modA: readNodeGraphLiveEffectiveParam(runtime, node, "modA", 0.5, frame, frames, frameValues),
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
