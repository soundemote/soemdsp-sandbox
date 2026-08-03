// Registers the offline/render-time dispatch handler for linearEnvelope into
// nodeGraphLiveModuleEvaluators. Pure math: linear-envelope-math.js.
nodeGraphLiveModuleEvaluators.linearEnvelope = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.linearEnvelopeStates.get(nodeId) || createNodeGraphLinearEnvelopeState();
  runtime.linearEnvelopeStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  return nodeGraphLinearEnvelopeSample(
    state,
    mixInput(nodeId, "Gate"),
    {
      attack: read("attack", 0.08),
      decay: read("decay", 0.22),
      delay: read("delay", 0),
      level: read("level", 1),
      loop: read("loop", 0),
      release: read("release", 0.45),
      sustain: read("sustain", 0.55),
    },
    sampleRate,
    runtime,
    nodeId,
  );
};
