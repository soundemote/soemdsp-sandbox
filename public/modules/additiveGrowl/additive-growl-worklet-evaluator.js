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
  let cutoff = num(p.cutoff, NaN);
  if (!(cutoff === cutoff)) {
    const legacy = num(p.harmonicReduce, NaN);
    cutoff = legacy === legacy ? 1 - legacy : 1;
  }
  const phaseSkew = additiveGraphBubbleEffectivePhaseSkew(
    num(p.phaseSkew, 0),
    num(p.unskew, 0),
    cutoff,
  );
  const applied = additiveGraphApplyGrowl(
    out,
    0, // phase rotation removed
    phaseSkew,
    num(p.phaseSkewCurve, 0),
    2, // Logarithmic
    cutoff,
    0,
    state.lerpFrom || null,
  );
  this.additiveBubbleStates.set(id, { lerpFrom: applied?.lerpFrom || null });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};

// Legacy name kept so older worklet bundles still resolve during hot reload.
NodeLiveAudioProcessor.prototype.additiveGrowlWorkletEvaluate =
  NodeLiveAudioProcessor.prototype.additiveBubbleWorkletEvaluate;
