NodeLiveAudioProcessor.prototype.createPhoneToneState = function createPhoneToneState() {
  return typeof createNodeGraphPhoneToneState === "function"
    ? createNodeGraphPhoneToneState()
    : { analog: {}, digital: {} };
};

NodeLiveAudioProcessor.prototype.phoneToneSample = function phoneToneSample(state, options) {
  if (typeof nodeGraphPhoneToneSample !== "function") {
    return { Df1: 0, Df2: 0, Out: 0, X: 0, Z: 0 };
  }
  const next = nodeGraphPhoneToneSample(state, options);
  if (typeof this.safeFilterNumber !== "function") {
    return next;
  }
  return {
    Df1: this.safeFilterNumber(next.Df1, null) ?? 0,
    Df2: this.safeFilterNumber(next.Df2, null) ?? 0,
    Out: this.safeFilterNumber(next.Out, null) ?? 0,
    X: this.safeFilterNumber(next.X, null) ?? 0,
    Z: this.safeFilterNumber(next.Z, null) ?? 0,
  };
};
