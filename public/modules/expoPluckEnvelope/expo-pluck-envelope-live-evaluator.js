// Expo Pluck Envelope — offline/render dispatch (native graph for Efficient Live).

nodeGraphLiveModuleEvaluators.expoPluckEnvelope = ({
  nodeId,
  node,
  inputs,
  params,
  runtime,
  sampleRate,
}) => {
  if (!runtime.expoPluckEnvelopeStates) runtime.expoPluckEnvelopeStates = new Map();
  let state = runtime.expoPluckEnvelopeStates.get(nodeId);
  if (!state) {
    state = typeof createExpoPluckEnvelopeState === "function"
      ? createExpoPluckEnvelopeState()
      : { env: 0, stage: "idle", lastTrigger: 0, lastGate: 0 };
    runtime.expoPluckEnvelopeStates.set(nodeId, state);
  }
  const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 44100;
  const trig = Number(inputs?.Trigger ?? inputs?.Trig ?? inputs?.T ?? 0) || 0;
  const gate = Number(inputs?.Gate ?? inputs?.gate ?? 0) || 0;
  const out = expoPluckEnvelopeSample(state, {
    trigger: trig,
    gate,
    attack: params?.attack,
    decay: params?.decay,
    frequency: params?.frequency,
    damping: params?.damping,
    recalculateOnTrigger: params?.recalculateOnTrigger,
    level: params?.level,
  }, rate);
  return { Env: out, Out: out, A: out, Mono: out };
};
