// Worklet: NoisyPan — CheapWalk / Filtered / WhiteNoise once per quantum.

NodeLiveAudioProcessor.prototype.additiveNoisyPanWorkletEvaluate = function additiveNoisyPanWorkletEvaluate(
  node, nodeId, frame, frames,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveNoisyPanStates) this.additiveNoisyPanStates = new Map();
  const incoming = this.additiveGraphReadWired(nodeId, "Graph");
  if (!incoming || !incoming.ratio) {
    this.additiveGraphWrite(nodeId, null);
    return;
  }
  const p = node?.params || node?.parameters || {};
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  let state = this.additiveNoisyPanStates.get(String(nodeId)) || {};
  const add = p.add != null && Number.isFinite(Number(p.add))
    ? num(p.add, 0.25)
    : num(p.amount, 0.25);
  const applied = additiveGraphApplyNoisyPan(
    additiveGraphClonePayload(incoming),
    add,
    num(p.speed, 35),
    state.walks,
    this.engineSampleRate || sampleRate,
    frames,
    num(p.noise, 0),
    state.lerpFrom,
    num(p.seed, 1),
  );
  this.additiveNoisyPanStates.set(String(nodeId), {
    walks: applied.walks,
    lerpFrom: applied.lerpFrom,
  });
  this.additiveGraphWrite(nodeId, applied.graph);
};
