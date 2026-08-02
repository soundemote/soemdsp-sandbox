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
  const pitchInput = hasInput?.(nodeId, "0.1V/Oct")
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

  const levelKnob = read("level", 1);
  const level = hasInput?.(nodeId, "Amplitude")
    ? levelKnob * nodeGraphSafeFilterNumber(
      mixInput(nodeId, "Amplitude"),
      runtime,
      nodeId,
      1,
      "snowflake amp",
    )
    : levelKnob;

  return nodeGraphSnowflakeSample(state, {
    frequencyHz: effectiveFrequency,
    sampleRate,
    pattern: read("pattern", 1),
    iterations: read("iterations", 3),
    angle: read("angle", 60),
    size: read("size", 1),
    reverse: read("reverse", 0),
    spin: read("spin", 0),
    level,
    reset,
  });
};
