// Registers the offline/render-time dispatch handler for ellipsoid into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.ellipsoid = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
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
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  const phaseOffset = nodeGraphPhaseRadians(read("phase", 0));
  const frequency = read("frequency", 100);
  const pitchInput = clampNodeSliderValue(nodeGraphSafeFilterNumber(
    mixInput(nodeId, "0.1V/Oct"),
    runtime,
    nodeId,
    null,
    "ellipsoid 0.1v/oct input",
  ), -1, 1);
  const pitchedFrequency = (typeof nodeGraphPitchedFrequency === "function" ? nodeGraphPitchedFrequency(frequency, pitchInput, 0) : Math.max(0, frequency * (2 ** (pitchInput / 0.1))));
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "ellipsoid increment input",
  );
  const phaseIncrement = (pitchedFrequency / sampleRate) + incrementInput;
  const value = nodeGraphEllipsoidVectorSample(phase + phaseOffset, {
    level: read("level", 1),
    offsetX: read("offsetX", 0),
    offsetY: read("offsetY", 0),
    scaleX: read("scaleX", 1),
    scaleY: read("scaleY", 1),
    shapeX: read("shapeX", 0),
    shapeY: read("shapeY", 0),
  });
  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
};
