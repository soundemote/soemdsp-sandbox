// Hilbert — worklet peel. Math: hilbert-math.js.

NodeLiveAudioProcessor.prototype.createHilbertState = function createHilbertState() {
  if (typeof createNodeGraphHilbertState === "function") {
    return createNodeGraphHilbertState();
  }
  return { net: null };
};

NodeLiveAudioProcessor.prototype.hilbertFrame = function hilbertFrame(state, input, mode) {
  if (typeof nodeGraphHilbertFrame === "function") {
    const out = nodeGraphHilbertFrame(state, input, mode);
    return { Out: this.safeFilterNumber(out.Out, state?.net) ?? 0 };
  }
  return { Out: 0 };
};
