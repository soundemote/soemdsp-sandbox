// Registers the offline/render-time dispatch handler for mushroom into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.mushroom = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.mushroomStates.get(nodeId) || createNodeGraphMushroomState();
  runtime.mushroomStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const mushroom = nodeGraphMushroomSample({
    apart: read("apart", 0),
    capRotation: read("capRotation", 0),
    capStemTransition: read("capStemTransition", 0.1),
    clusterRotation: read("clusterRotation", 0),
    clusterRotationSpeed: read("clusterRotationSpeed", 0),
    density: read("density", 3),
    frequency: read("frequency", 8),
    grow: read("grow", 1),
    head: read("head", 0.6667),
    numMushrooms: read("numMushrooms", 1),
    phaseOffset: read("phaseOffset", 0),
    reset: mixInput(nodeId, "Reset"),
    sampleRate,
    sharp: read("sharp", 0),
    spread: read("spread", 0.5),
    state,
    stem: read("stem", 0),
    stemRotationSpeed: read("stemRotationSpeed", 0),
    width: read("width", 1),
    wobble: read("wobble", 0.0625),
  });
  const mushroomLevel = read("amplitude", 1);
  return {
    X: mushroom.x * mushroomLevel,
    Y: mushroom.y * mushroomLevel,
  };
};
