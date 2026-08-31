// Worklet: QuantizePhase — quarter-cycle snap, then random phase offset.

NodeLiveAudioProcessor.prototype.additiveQuantizePhaseWorkletEvaluate = function additiveQuantizePhaseWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveQuantizePhaseStates) this.additiveQuantizePhaseStates = new Map();
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
  let state = this.additiveQuantizePhaseStates.get(id) || {};
  const eff = (key, fb) => (typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, key, fb, 128)
    : num(p[key], fb));
  const applied = additiveGraphApplyQuantizePhase(
    out,
    num(p.quantizePhase, 0),
    eff("randomPhaseAmount", 0),
    num(p.seed, 1),
    state.lerpFrom || null,
  );
  this.additiveQuantizePhaseStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};
