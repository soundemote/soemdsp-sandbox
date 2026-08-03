// FBM Field — worklet. Pure math: fbm-field-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createFbmFieldState = function createFbmFieldState() {
  if (typeof createNodeGraphFbmFieldState === "function") {
    return createNodeGraphFbmFieldState();
  }
  return { resetWasHigh: false, time: 0 };
};

NodeLiveAudioProcessor.prototype.fbmFieldVector = function fbmFieldVector(state, params, rate = sampleRate, reset = 0) {
  if (typeof nodeGraphFbmFieldVector === "function") {
    const out = nodeGraphFbmFieldVector(state, params, rate, reset);
    return {
      X: this.safeFilterNumber(out.X, null),
      Y: this.safeFilterNumber(out.Y, null),
      "X Raw": this.safeFilterNumber(out["X Raw"], null),
      "Y Raw": this.safeFilterNumber(out["Y Raw"], null),
    };
  }
  return { X: 0, Y: 0, "X Raw": 0, "Y Raw": 0 };
};
