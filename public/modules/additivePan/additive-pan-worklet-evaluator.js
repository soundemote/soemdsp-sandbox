// Worklet: Additive AutoPan — Rate/Depth/Spread swirl harmonics in stereo.

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
  const rate = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "rate", 0.25, frames)
    : num(p.rate != null ? p.rate : 0.25, 0.25);
  const depth = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "depth", 0.85, frames)
    : num(p.depth != null ? p.depth : (p.width != null ? Math.abs(Number(p.width)) : 0.85), 0.85);
  const spread = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "spread", 1, frames)
    : num(p.spread, 1);
  const bias = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "bias", 0, frames)
    : num(p.bias != null ? p.bias : p.pan, 0);
  const sr = Number(this.engineSampleRate) || Number(sampleRate) || 44100;
  const applied = additiveGraphApplyPan(
    out,
    rate,
    depth,
    spread,
    bias,
    state,
    sr,
    frames,
    state.lerpFrom || null,
  );
  this.additivePanStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    phase: applied?.phase || 0,
  });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};
