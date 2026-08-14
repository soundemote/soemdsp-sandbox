// Snowflake — offline / Render Sample path (L-system turtle → X/Y).
nodeGraphLiveModuleEvaluators.snowflake = ({
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
  if (!runtime.snowflakeStates) {
    runtime.snowflakeStates = new Map();
  }
  const state = runtime.snowflakeStates.get(nodeId) || createNodeGraphSnowflakeState();
  runtime.snowflakeStates.set(nodeId, state);

  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

  let reset = 0;
  if (hasInput?.(nodeId, "Reset")) {
    reset = nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Reset"),
      runtime,
      nodeId,
      0,
      "snowflake reset",
    );
  }

  const baseFrequency = Math.max(0, read("frequency", 55));
  const pitchReferenceAudio = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio)
    : { pitchReferenceMidiNote: 60 };
  const referenceVoltage = (pitchReferenceAudio.pitchReferenceMidiNote || 60) / 120;
  const hasPitch = Boolean(hasInput?.(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? clampNodeSliderValue(
      nodeGraphSafeFilterNumber(
        mixInput(nodeId, "0.1V/Oct"),
        runtime,
        nodeId,
        null,
        "snowflake 0.1v",
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

  const levelKnob = read("amplitude", 1);
  const hasAmp = Boolean(hasInput?.(nodeId, "Amplitude"));
  const ampCv = hasAmp
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Amplitude"), runtime, nodeId, 1, "snowflake amp")
    : 1;
  const level = typeof nodeGraphParamSignalInAmplitude === "function"
    ? nodeGraphParamSignalInAmplitude(levelKnob, ampCv, hasAmp)
    : (hasAmp ? levelKnob * ampCv : levelKnob);

  // Direction −1…1 (trisaw); migrate legacy reverse if direction missing on patch.
  let direction = read("direction", null);
  if (direction == null || !Number.isFinite(Number(direction))) {
    const legacyReverse = read("reverse", 0);
    direction = Number(legacyReverse) > 0.5 ? 0 : 1;
  }

  return nodeGraphSnowflakeSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    pattern: read("pattern", 1),
    iterations: read("iterations", 3),
    angle: read("angle", 60),
    direction,
    spin: read("spin", 0),
    level,
    reset,
  });
};
