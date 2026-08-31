// Worklet: NoisyFreq — ratio Add jitter once per quantum.

NodeLiveAudioProcessor.prototype.additiveNoisyFreqWorkletEvaluate = function additiveNoisyFreqWorkletEvaluate(
  node, nodeId, frame, frames,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveNoisyFreqStates) this.additiveNoisyFreqStates = new Map();
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
  let add = Number(p.add);
  if (!Number.isFinite(add)) {
    const legacy = Number(p.amount);
    add = Number.isFinite(legacy) ? legacy * 0.5 : 0.5;
  }
  let state = this.additiveNoisyFreqStates.get(String(nodeId)) || {};
  const applied = additiveGraphApplyNoisyFreq(
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
  this.additiveNoisyFreqStates.set(String(nodeId), {
    walks: applied.walks,
    lerpFrom: applied.lerpFrom,
  });
  this.additiveGraphWrite(nodeId, applied.graph);
};
