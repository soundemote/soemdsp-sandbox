// Worklet: Additive Linear Filter — rational-curve skirts, once per quantum.

NodeLiveAudioProcessor.prototype.additiveLinearFilterWorkletEvaluate = function additiveLinearFilterWorkletEvaluate(
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
  const sr = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
  const cutoffHz = num(p.cutoff, 2000);
  const fundHz = typeof additiveGraphResolveFundamentalHz === "function"
    ? additiveGraphResolveFundamentalHz({
      graph: incoming,
      nodes: this.nodes,
      connections: this._planConnections,
      fromNodeId: nodeId,
      readFrequency: (outNode) => num(outNode?.params?.frequency, 100),
      fallback: 100,
    })
    : 100;
  const out = additiveGraphClonePayload(incoming);
  additiveGraphApplyLinearFilter(
    out, num(p.filter, 0), cutoffHz, num(p.slope, 0.25), num(p.skew, 0), fundHz, sr,
  );
  this.additiveGraphWrite(nodeId, out);
};
