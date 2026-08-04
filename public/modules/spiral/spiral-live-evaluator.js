// Registers the offline/render-time dispatch handler for spiral into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.spiral = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.spiralStates.get(nodeId) || createJerobeamSpiralState();
  runtime.spiralStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  const spiral = jerobeamSpiralSample({
    density: read("density", 1),
    frequency: read("frequency", 440),
    morph: read("morph", 0),
    morphSpeed: read("morphSpeed", 0),
    position: read("position", 0),
    positionSpeed: read("positionSpeed", 0),
    rotX: read("rotX", 0),
    rotXSpeed: read("rotXSpeed", 0),
    rotY: read("rotY", 0),
    rotYSpeed: read("rotYSpeed", 0),
    sampleRate,
    sharp: read("sharp", 0.5),
    sharpCurve: read("sharpCurve", 0),
    sharpCurveMult: read("sharpCurveMult", 1),
    size: read("size", 0.5),
    state,
    zAmount: read("zAmount", 0),
    zDepth: read("zDepth", 0),
  });
  const level = read("amplitude", 1);
  return {
    X: spiral.x * level,
    Y: spiral.y * level,
    Z: spiral.z * level,
  };
};
