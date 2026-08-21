// BasicShape (modulator): naive sine / tri / saw / square. No anti-aliasing.
// PWM (`shape`) only affects Square / selected square Wave Out.

function nodeGraphBasicShapeNaiveWaves(phase01, pulseWidth) {
  const p = Number(phase01) || 0;
  const cycle = p - Math.floor(p);
  const sine = Math.sin(cycle * Math.PI * 2);
  const tri = 1 - 4 * Math.abs(cycle - 0.5);
  const saw = 1 - cycle * 2;
  const pw = Number(pulseWidth);
  const width = Number.isFinite(pw) ? Math.max(0, Math.min(1, pw)) : 0.5;
  const square = cycle < width ? 1 : -1;
  return { sine, tri, saw, square };
}

function nodeGraphBasicShapeSelect(waves, waveform) {
  const i = Math.max(0, Math.min(3, Math.round(Number(waveform) || 0)));
  if (i === 1) return waves.tri;
  if (i === 2) return waves.saw;
  if (i === 3) return waves.square;
  return waves.sine;
}

function nodeGraphBasicShapePitchAndPhase({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) {
  if (typeof nodeGraphEllipsoidLivePitchAndPhase === "function") {
    return nodeGraphEllipsoidLivePitchAndPhase({
      runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
      defaultFrequency: 1,
    });
  }
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "basicShape reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime, node, key, fallback, frame, frames, frameValues,
  );
  const phaseOffset = Number(read("phase", 0)) || 0;
  const frequency = read("frequency", 1);
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
      "basicShape 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : frequency;
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "basicShape increment input",
  );
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const motion = Math.max(0, Math.min(3, Math.round(Number(read("motion", 1)) || 0)));
  const clockWise = motion === 0 || motion === 2;
  const useSimTime = motion >= 2;
  const dir = clockWise ? -1 : 1;
  const phaseIncrement = useSimTime
    ? 0
    : (dir * pitchedFrequency / safeRate) + incrementInput;
  return {
    read,
    phase,
    phaseOffset,
    phaseIncrement,
    pitchedFrequency,
    sampleRate: safeRate,
    useSimTime,
    dir,
    incrementInput,
  };
}

nodeGraphLiveModuleEvaluators.basicShape = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const ctx = nodeGraphBasicShapePitchAndPhase({
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
  });
  const waveform = ctx.read("waveform", 0);
  const pulseWidth = ctx.read("shape", 0.5);
  const level = ctx.read("amplitude", 1);
  let samplePhase;
  if (ctx.useSimTime) {
    const simSamples = Math.max(0, Number(runtime.absoluteFrame) || Number(frame) || 0);
    samplePhase = ctx.dir
      * ((ctx.pitchedFrequency / ctx.sampleRate) + ctx.incrementInput)
      * simSamples
      + ctx.phaseOffset;
  } else {
    samplePhase = ctx.phase + ctx.phaseOffset;
  }
  samplePhase -= Math.floor(samplePhase);
  const waves = nodeGraphBasicShapeNaiveWaves(samplePhase, pulseWidth);
  const selected = nodeGraphBasicShapeSelect(waves, waveform) * level;
  let nextPhase = ctx.phase + ctx.phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  runtime.phases.set(nodeId, nextPhase);
  return {
    Out: selected,
    Saw: waves.saw * level,
    Sine: waves.sine * level,
    Square: waves.square * level,
    Tri: waves.tri * level,
    "Wave Out": selected,
    __Phase: samplePhase,
  };
};
