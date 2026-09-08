// Expo Pluck Envelope 2 — SoEmPluck offline/render dispatch.

nodeGraphLiveModuleEvaluators.expoPluckEnvelope2 = ({
  nodeId,
  node,
  inputs,
  params,
  runtime,
  sampleRate,
}) => {
  if (!runtime.expoPluckEnvelope2States) runtime.expoPluckEnvelope2States = new Map();
  let state = runtime.expoPluckEnvelope2States.get(nodeId);
  if (!state) {
    state = typeof createExpoPluckEnvelope2State === "function"
      ? createExpoPluckEnvelope2State()
      : { currentValue: 0, stage: "off", lastTrigger: 0, lastRelease: 0 };
    runtime.expoPluckEnvelope2States.set(nodeId, state);
  }
  const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 44100;
  const trig = Number(inputs?.Trigger ?? inputs?.Trig ?? inputs?.T ?? 0) || 0;
  const relGate = Number(inputs?.Release ?? inputs?.Rel ?? 0) || 0;
  const out = expoPluckEnvelope2Sample(state, {
    trigger: trig,
    releaseGate: relGate,
    attack: params?.attack,
    decaySlopeTop: params?.decaySlopeTop,
    decaySlopeMid: params?.decaySlopeMid,
    decaySlopeBottom: params?.decaySlopeBottom,
    sustain: params?.sustain,
    release: params?.release,
    autoReleaseTime: params?.autoReleaseTime,
    envelopeCurve: params?.envelopeCurve,
    envelopeDamping: params?.envelopeDamping,
    velocity: params?.velocity,
    velocitySensitivity: params?.velocitySensitivity,
    level: params?.level,
  }, rate);
  return { Env: out, Out: out, A: out, Mono: out };
};
