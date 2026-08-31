// Worklet: FrequencySkew — Low/High Stretch + Skew/Curve on ratios.

NodeLiveAudioProcessor.prototype.additiveFrequencySkewWorkletEvaluate = function additiveFrequencySkewWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveFrequencySkewStates) this.additiveFrequencySkewStates = new Map();
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
  let state = this.additiveFrequencySkewStates.get(id) || {};
  const lowStretch = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "lowStretch", 1, 128)
    : num(p.lowStretch, 1);
  const highStretch = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "highStretch", 1, 128)
    : num(p.highStretch, 1);
  const skew = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "skew", 0, 128)
    : num(p.skew, 0);
  const applied = additiveGraphApplyFrequencySkew(
    out,
    lowStretch,
    highStretch,
    skew,
    num(p.curve, 0),
    state.lerpFrom || null,
  );
  this.additiveFrequencySkewStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};

NodeLiveAudioProcessor.prototype.additiveFrequencySlopeWorkletEvaluate =
  NodeLiveAudioProcessor.prototype.additiveFrequencySkewWorkletEvaluate;
