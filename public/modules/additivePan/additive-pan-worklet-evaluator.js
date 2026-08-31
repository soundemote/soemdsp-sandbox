// Worklet: Additive Pan — Pan + Width across harmonics (deterministic).

NodeLiveAudioProcessor.prototype.additivePanWorkletEvaluate = function additivePanWorkletEvaluate(
  node, nodeId, frame, frames,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additivePanStates) this.additivePanStates = new Map();
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
  const out = additiveGraphClonePayload(incoming);
  const id = String(nodeId);
  let state = this.additivePanStates.get(id) || {};
  const applied = additiveGraphApplyPan(
    out,
    num(p.pan, 0),
    num(p.width, 0),
    state.lerpFrom || null,
  );
  this.additivePanStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};
