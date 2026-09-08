// Offline/render for thumpEnvelope. Math: thump-envelope-math.js.

nodeGraphLiveModuleEvaluators.thumpEnvelope = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.thumpEnvelopeStates) runtime.thumpEnvelopeStates = new Map();
  const state =
    runtime.thumpEnvelopeStates.get(nodeId) || createNodeGraphThumpEnvelopeState();
  runtime.thumpEnvelopeStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const gate = (Number(mixInput(nodeId, "Gate")) || 0)
    + (Number(mixInput(nodeId, "Trigger")) || 0);
  return nodeGraphThumpEnvelopeSample(
    state,
    gate,
    {
      updateOnTrigger: read("updateOnTrigger", 0),
      attack: read("attack", 0),
      fallCurve: read("fallCurve", 0.8062943900342834),
      decaySnap: read("decaySnap", 0),
      decayBody: read("decayBody", 0),
      release: read("release", 12.824772066678985),
      loop: read("loop", 0),
      amplitude: read("amplitude", 0.980691228326368),
    },
    sampleRate,
  );
};
