// Registers the offline/render-time dispatch handler for sineWavetable into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.sineWavetable = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const resetState = runtime.oscResetStates.get(nodeId) || (typeof createNodeGraphOscResetState === "function"
    ? createNodeGraphOscResetState()
    : { lastReset: 0 });
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "n-phase reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
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
  const mode = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "mode",
    2,
    frame,
    frames,
    frameValues,
  );
  const baseFrequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "freq",
    100,
    frame,
    frames,
    frameValues,
  );
  const freqInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "f"),
    runtime,
    nodeId,
    null,
    "n-phase freq input",
  );
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "n-phase increment input",
  );
  const amplitude = Math.max(
    0,
    readNodeGraphLiveEffectiveParam(
      runtime,
      node,
      "amp",
      1,
      frame,
      frames,
      frameValues,
    ),
  );
  const referenceVoltage = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "n-phase 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const baseWithFreqJack = baseFrequency + (Number(freqInput) || 0);
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: baseWithFreqJack,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseWithFreqJack, pitchCv, referenceVoltage)
      : Math.max(0, baseWithFreqJack * (2 ** ((pitchCv - referenceVoltage) / 0.1))));
  const phaseIncrement = (effectiveFrequency / sampleRate) + (Number(incrementInput) || 0);
  const pair = nodeGraphSineCosWavetableSample(phase + phaseOffset, effectiveFrequency, amplitude, sampleRate);
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return typeof nodeGraphNPhaseFromSinCos === "function"
    ? nodeGraphNPhaseFromSinCos(pair.sin, pair.cos, mode)
    : { A: pair.sin, B: pair.cos, C: 0, D: 0, sin: pair.sin, cos: pair.cos };
};
