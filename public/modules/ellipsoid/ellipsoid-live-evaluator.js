// Offline/render: RoundShape (ellipsoid) + full Ellipsoid osc (ellipsoidOsc).
// Limit AA always on — no Auto/None mode switch.

function nodeGraphEllipsoidLivePitchAndPhase({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate, defaultFrequency,
}) {
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "ellipsoid reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime, node, key, fallback, frame, frames, frameValues,
  );
  const phaseOffset = Number(read("phase", 0)) || 0;
  const frequency = read("frequency", defaultFrequency);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio).pitchReferenceMidiNote / 120
    : 0;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "ellipsoid 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
      : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "ellipsoid increment input",
  );
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
  return { read, phase, phaseOffset, phaseIncrement, pitchedFrequency, sampleRate: safeRate };
}

// RoundShape — sine→square
nodeGraphLiveModuleEvaluators.ellipsoid = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const ctx = nodeGraphEllipsoidLivePitchAndPhase({
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
    defaultFrequency: 1,
  });
  const shape = clampNodeSliderValue(ctx.read("shape", 0), 0, 1);
  const level = ctx.read("amplitude", 1);
  let samplePhase = ctx.phase + ctx.phaseOffset;
  samplePhase -= Math.floor(samplePhase);
  const value = nodeGraphEllipsoidSineToSquareVector(samplePhase, {
    amplitude: level,
    shape,
    frequencyHz: ctx.pitchedFrequency,
    sampleRate: ctx.sampleRate,
    phaseInc: ctx.phaseIncrement,
  });
  let nextPhase = ctx.phase + ctx.phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  runtime.phases.set(nodeId, nextPhase);
  return value;
};

// Full multi-param ellipsoid oscillator
nodeGraphLiveModuleEvaluators.ellipsoidOsc = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const ctx = nodeGraphEllipsoidLivePitchAndPhase({
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
    defaultFrequency: 100,
  });
  // Phase in cycles → radians for legacy getEllipsoid
  let samplePhaseCycles = ctx.phase + ctx.phaseOffset;
  samplePhaseCycles -= Math.floor(samplePhaseCycles);
  const phaseRadians = samplePhaseCycles * Math.PI * 2;
  const value = nodeGraphEllipsoidVectorSample(phaseRadians, {
    amplitude: ctx.read("amplitude", 1),
    offsetX: ctx.read("offsetX", 0),
    offsetY: ctx.read("offsetY", 0),
    shapeX: ctx.read("shapeX", 0),
    shapeY: ctx.read("shapeY", 0),
    scaleX: ctx.read("scaleX", 1),
    scaleY: ctx.read("scaleY", 1),
    frequencyHz: ctx.pitchedFrequency,
    sampleRate: ctx.sampleRate,
  });
  let nextPhase = ctx.phase + ctx.phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  runtime.phases.set(nodeId, nextPhase);
  return value;
};
