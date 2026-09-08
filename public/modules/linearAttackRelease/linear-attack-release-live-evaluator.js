// Offline/render dispatch for linearAttackRelease.
// Pure math: linear-attack-release-math.js.

nodeGraphLiveModuleEvaluators.linearAttackRelease = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.linearAttackReleaseStates) {
    runtime.linearAttackReleaseStates = new Map();
  }
  const state =
    runtime.linearAttackReleaseStates.get(nodeId) || createNodeGraphLinearAttackReleaseState();
  runtime.linearAttackReleaseStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphLinearAttackReleaseSample(
    state,
    mixInput(nodeId, "Gate"),
    {
      attack: read("attack", 0.01),
      release: read("release", 0.25),
      amplitude: read("amplitude", 1),
      inputMode: read("inputMode", 0),
    },
    sampleRate,
  );
};
