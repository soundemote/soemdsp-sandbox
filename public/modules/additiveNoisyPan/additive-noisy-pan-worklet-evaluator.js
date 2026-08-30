// Worklet: NoisyPan — Magenta Graph pan walks once per quantum.

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
  const p = node?.parameters || {};
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  let state = this.additiveNoisyPanStates.get(String(nodeId)) || {};
  const applied = additiveGraphApplyNoisyPan(
    additiveGraphClonePayload(incoming),
    num(p.amount, 0.25),
    num(p.speed, 35),
    state.walks,
    this.engineSampleRate || sampleRate,
    frames,
  );
  this.additiveNoisyPanStates.set(String(nodeId), { walks: applied.walks });
  this.additiveGraphWrite(nodeId, applied.graph);
};
