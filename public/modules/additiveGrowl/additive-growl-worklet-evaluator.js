// Worklet: Growl — Yellow Graph phase warp once per quantum.

NodeLiveAudioProcessor.prototype.additiveGrowlWorkletEvaluate = function additiveGrowlWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
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
  additiveGraphApplyGrowl(
    out,
    num(p.phaseRotation, 0),
    num(p.phaseSkew, 0),
    num(p.phaseSkewCurve, 0),
  );
  this.additiveGraphWrite(nodeId, out);
};
