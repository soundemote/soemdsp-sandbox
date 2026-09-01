// Worklet: Additive AutoPan — Width fan + wrap + swirl + HF shimmer + orbit.

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
  const eff = (key, fb) => (typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, key, fb, frames)
    : num(p[key], fb));
  const out = additiveGraphClonePayload(incoming);
  const id = String(nodeId);
  let state = this.additivePanStates.get(id) || {};
  const width = eff("width", 0.75);
  const rate = eff("rate", 0.25);
  const depth = eff("depth", 0.85);
  const spread = eff("spread", 1);
  const bias = eff("bias", 0);
  const shimmer = eff("shimmer", 0.35);
  const orbit = eff("orbit", 1);
  const shimmerRate = eff("shimmerRate", 18);
  const sr = Number(this.engineSampleRate) || Number(sampleRate) || 44100;
  const applied = additiveGraphApplyPan(
    out,
    width,
    rate,
    depth,
    spread,
    bias,
    shimmer,
    orbit,
    shimmerRate,
    state,
    sr,
    frames,
    state.lerpFrom || null,
  );
  this.additivePanStates.set(id, {
    lerpFrom: applied?.lerpFrom || null,
    phase: applied?.phase || 0,
    shimmerPhase: applied?.shimmerPhase || 0,
  });
  this.additiveGraphWrite(nodeId, applied?.graph || out);
};
