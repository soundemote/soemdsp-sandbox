// Worklet: Additive Analog Filter — Yellow Graph once per quantum.

NodeLiveAudioProcessor.prototype.additiveAnalogFilterWorkletEvaluate = function additiveAnalogFilterWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
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
  const out = additiveGraphClonePayload(incoming);
  additiveGraphApplyAnalogFilter(
    out,
    num(p.filter, 0),
    num(p.cutoff, 0.5),
    num(p.slope, 0.25),
    num(p.skew, 0),
  );
  this.additiveGraphWrite(nodeId, out);
};
