// Worklet: QuantizeFreq — fund-relative ratio snap, then random offset.

NodeLiveAudioProcessor.prototype.additiveQuantizeFreqWorkletEvaluate = function additiveQuantizeFreqWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveQuantizeFreqStates) this.additiveQuantizeFreqStates = new Map();
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
  let state = this.additiveQuantizeFreqStates.get(id) || {};
  const eff = (key, fb) => (typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, key, fb, 128)
    : num(p[key], fb));
  const applied = additiveGraphApplyQuantizeFreq(
    out,
    num(p.quantizeFreq != null ? p.quantizeFreq : p.quantize, 0),
    eff("randomFreqAmount", 0),
    num(p.seed, 1),
    state.lerpFrom || null,
  );
  this.additiveQuantizeFreqStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};

NodeLiveAudioProcessor.prototype.additiveHarmonicMathWorkletEvaluate =
  NodeLiveAudioProcessor.prototype.additiveQuantizeFreqWorkletEvaluate;
NodeLiveAudioProcessor.prototype.additiveFrequencyMathWorkletEvaluate =
  NodeLiveAudioProcessor.prototype.additiveQuantizeFreqWorkletEvaluate;
