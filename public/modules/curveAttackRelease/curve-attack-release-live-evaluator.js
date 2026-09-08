// Offline/render for curveAttackRelease. Math: curve-attack-release-math.js.

nodeGraphLiveModuleEvaluators.curveAttackRelease = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.curveAttackReleaseStates) runtime.curveAttackReleaseStates = new Map();
  const state =
    runtime.curveAttackReleaseStates.get(nodeId) || createNodeGraphCurveAttackReleaseState();
  runtime.curveAttackReleaseStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphCurveAttackReleaseSample(
    state,
    mixInput(nodeId, "Gate"),
    {
      inputMode: read("inputMode", 0),
      updateOnTrigger: read("updateOnTrigger", 0),
      attack: read("attack", 0.01),
      attackShape: read("attackShape", 0),
      release: read("release", 0.25),
      releaseShape: read("releaseShape", 0),
      amplitude: read("amplitude", 1),
    },
    sampleRate,
  );
};
