// Worklet: Bubble — logarithmic phase cascade + Cutoff.
// Stamps phaseLerp/ampLerp so Out glides across the block (no zipper).

NodeLiveAudioProcessor.prototype.additiveBubbleWorkletEvaluate = function additiveBubbleWorkletEvaluate(
  node, nodeId, frame,
) {
  if (frame !== 0) return;
  this.ensureAdditiveGraphBus();
  if (!this.additiveBubbleStates) this.additiveBubbleStates = new Map();
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
  let state = this.additiveBubbleStates.get(id) || {};
  const cutoff = num(p.cutoff, 1);
  const phaseSkew = additiveGraphBubbleEffectivePhaseSkew(
    num(p.phaseSkew, 0),
    num(p.unskew, 481.53),
    cutoff,
  );
  let bubble = Math.max(0, Math.min(1, num(p.bubble, 0)));
  const invert = num(p.invertBubble, 0) >= 0.5;
  let curveAmt = invert ? -bubble : bubble;
  if (curveAmt > 0.9999) curveAmt = 0.9999;
  if (curveAmt < -0.9999) curveAmt = -0.9999;
  const applied = additiveGraphApplyGrowl(
    out,
    0,
    phaseSkew,
    curveAmt,
    2, // Logarithmic
    cutoff,
    0,
    state.lerpFrom || null,
  );
  this.additiveBubbleStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};

