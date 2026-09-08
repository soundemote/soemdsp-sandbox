// Offline/render for pluckEnvelope3. Math: pluck-envelope-3-math.js.

nodeGraphLiveModuleEvaluators.pluckEnvelope3 = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.pluckEnvelope3States) runtime.pluckEnvelope3States = new Map();
  const state =
    runtime.pluckEnvelope3States.get(nodeId) || createNodeGraphPluckEnvelope3State();
  runtime.pluckEnvelope3States.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphPluckEnvelope3Sample(
    state,
    mixInput(nodeId, "Trigger"),
    {
      attack: read("attack", 0),
      dampen: read("dampen", 0.5),
      amplitude: read("amplitude", 1),
      recalculateOnTrigger: read("recalculateOnTrigger", 1),
    },
    sampleRate,
  );
};
