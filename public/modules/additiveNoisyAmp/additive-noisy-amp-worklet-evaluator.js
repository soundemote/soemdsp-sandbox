// Worklet: NoisyAmp — CheapWalk / Filtered / WhiteNoise once per quantum.

NodeLiveAudioProcessor.prototype.additiveNoisyAmpWorkletEvaluate = function additiveNoisyAmpWorkletEvaluate(
  node, nodeId, frame, frames,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveNoisyAmpStates) this.additiveNoisyAmpStates = new Map();
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
  let state = this.additiveNoisyAmpStates.get(String(nodeId)) || {};
  const add = p.add != null && Number.isFinite(Number(p.add))
    ? num(p.add, 0.25)
    : num(p.amount, 0.25) * 0.5; // legacy Amount had hidden ×0.5
  const applied = additiveGraphApplyNoisyAmp(
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
  this.additiveNoisyAmpStates.set(String(nodeId), {
    walks: applied.walks,
    lerpFrom: applied.lerpFrom,
  });
  this.additiveGraphWrite(nodeId, applied.graph);
};
