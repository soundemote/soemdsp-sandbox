// SineKick — worklet.

NodeLiveAudioProcessor.prototype.createSineKickState = function createSineKickState() {
  if (typeof createNodeGraphSineKickState === "function") {
    return createNodeGraphSineKickState();
  }
  return { t: 0, phase: 0, lastTrig: 0, active: 0, a: 0 };
};

NodeLiveAudioProcessor.prototype.sineKickSample = function sineKickSample(
  state,
  trigger,
  pitchHz,
  punchOct,
  decayS,
  amplitude,
  rate = sampleRate,
  pitchCvRatio = 1,
  sharpness = 0,
) {
  if (typeof nodeGraphSineKickSample === "function") {
    const out = nodeGraphSineKickSample(
      state,
      trigger,
      pitchHz,
      punchOct,
      decayS,
      amplitude,
      rate,
      pitchCvRatio,
      sharpness,
    );
    return {
      Out: this.safeFilterNumber(out?.Out, null) ?? 0,
      A: this.safeFilterNumber(out?.A, null) ?? 0,
      U: this.safeFilterNumber(out?.U, null) ?? 0,
      X: this.safeFilterNumber(out?.X, null) ?? 0,
      Y: this.safeFilterNumber(out?.Y, null) ?? 0,
    };
  }
  return { Out: 0, A: 0, U: 0, X: 0, Y: 0 };
};
