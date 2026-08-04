// Registers the offline/render-time dispatch handler for antisaw into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.antisaw = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.antisawStates.get(nodeId) || createNodeGraphAntisawState();
  runtime.antisawStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphAntisawSample(
    state,
    {
      fundamental: read("fundamental", 110),
      reflections: read("reflections", 64),
      tilt: read("tilt", 0),
      level: read("amplitude", 1),
    },
    sampleRate,
  );
};
