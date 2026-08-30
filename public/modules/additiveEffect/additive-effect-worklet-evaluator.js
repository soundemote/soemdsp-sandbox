// Worklet: Additive Effect — Magenta Graph IN → OUT once per quantum.

NodeLiveAudioProcessor.prototype.additiveEffectWorkletEvaluate = function additiveEffectWorkletEvaluate(
  node, nodeId, frame, frames
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  const incoming = this.additiveGraphReadWired(nodeId, "Graph");
  if (!incoming || !incoming.ratio) {
    this.additiveGraphWrite(nodeId, null);
    return;
  }
  const p = node?.parameters || {};
  const modeIdx = Math.round(Number(p.effect) || 0);
  const modes = ["LinearFilter", "AnalogFilter", "Growl", "Noisy"];
  const mode = modes[Math.max(0, Math.min(3, modeIdx))] || "LinearFilter";
  let state = this.additiveEffectStates.get(String(nodeId));
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const applied = additiveGraphApplyEffect(
    incoming,
    mode,
    num(p.parA, 0.5),
    num(p.parB, 1),
    num(p.parC, 0),
    num(p.parD, 0),
    state
  );
  this.additiveEffectStates.set(String(nodeId), applied.state);
  this.additiveGraphWrite(nodeId, applied.graph);
};
