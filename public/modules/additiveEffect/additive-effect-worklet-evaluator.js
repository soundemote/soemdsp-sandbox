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
  const applied = additiveGraphApplyEffect(
    incoming,
    mode,
    Number(p.parA) || 0.5,
    Number(p.parB) || 1,
    Number(p.parC) || 0,
    Number(p.parD) || 0,
    state
  );
  this.additiveEffectStates.set(String(nodeId), applied.state);
  this.additiveGraphWrite(nodeId, applied.graph);
};
