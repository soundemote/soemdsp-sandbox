// KickEnvelope — offline/render. Envelope only (T → A).

nodeGraphLiveModuleEvaluators.kickEnvelope = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
}) => {
  if (!runtime.kickEnvelopeStates) runtime.kickEnvelopeStates = new Map();
  let state = runtime.kickEnvelopeStates.get(nodeId);
  if (!state) {
    state = createNodeGraphKickEnvelopeState();
    runtime.kickEnvelopeStates.set(nodeId, state);
  }
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime, node, key, fallback, frame, frames, frameValues,
  );
  const low = typeof nodeGraphKickEnvelopeReadUnit === "function"
    ? nodeGraphKickEnvelopeReadUnit(read("low", NaN), read("lowFreq", NaN), 0)
    : Math.max(0, Math.min(1, Number(read("low", 0)) || 0));
  const high = typeof nodeGraphKickEnvelopeReadUnit === "function"
    ? nodeGraphKickEnvelopeReadUnit(read("high", NaN), read("highFreq", NaN), 1)
    : Math.max(0, Math.min(1, Number(read("high", 1)) || 1));
  const sharpRaw = read("sharpness", NaN);
  const sharpness = Number.isFinite(Number(sharpRaw))
    ? Number(sharpRaw)
    : (typeof nodeGraphKickEnvelopeReadUnit === "function"
      ? nodeGraphKickEnvelopeReadUnit(read("roundness", NaN), read("shape", NaN), 0)
      : Math.max(0, Math.min(1, Number(read("roundness", 0)) || 0)));
  const curve = Math.round(Number(read("curve", 1)) || 0) !== 0 ? 1 : 0;
  const speed = read("speed", 0.2);
  const amplitude = read("amplitude", 1);
  const trigger = mixInput(nodeId, "T");
  const sr = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const out = nodeGraphKickEnvelopeSample(state, trigger, low, high, sharpness, sr, curve, speed, amplitude);
  const safe = (v) => (typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(v, runtime, nodeId, null, "kickEnvelope")
    : (Number(v) || 0));
  return {
    A: safe(out.A),
    U: safe(out.U),
    X: safe(out.X),
    Y: safe(out.Y),
  };
};
