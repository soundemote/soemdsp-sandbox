// Quadrature — worklet peel. Math: quadrature-math.js.

NodeLiveAudioProcessor.prototype.createQuadratureState = function createQuadratureState() {
  if (typeof createNodeGraphQuadratureState === "function") {
    return createNodeGraphQuadratureState();
  }
  return { side: null, mid: null };
};

NodeLiveAudioProcessor.prototype.quadratureFrame = function quadratureFrame(state, sideIn, midIn) {
  if (typeof nodeGraphQuadratureFrame === "function") {
    const out = nodeGraphQuadratureFrame(state, sideIn, midIn);
    return {
      I: this.safeFilterNumber(out.I, state?.side) ?? 0,
      Q: this.safeFilterNumber(out.Q, state?.side) ?? 0,
      MidI: this.safeFilterNumber(out.MidI, state?.mid) ?? 0,
      SideQ: this.safeFilterNumber(out.SideQ, state?.side) ?? 0,
    };
  }
  return { I: 0, Q: 0, MidI: 0, SideQ: 0 };
};
