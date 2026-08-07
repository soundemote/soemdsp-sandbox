// STFT Blur — worklet.

NodeLiveAudioProcessor.prototype.createStftBlurState = function createStftBlurState(fftSize) {
  if (typeof createNodeGraphStftBlurState === "function") {
    return createNodeGraphStftBlurState(fftSize);
  }
  return null;
};

NodeLiveAudioProcessor.prototype.stftBlurSample = function stftBlurSample(
  state,
  input,
  blurTime,
  blurFreq,
  fftSize,
  mix,
) {
  if (typeof nodeGraphStftBlurSample === "function") {
    return this.safeFilterNumber(
      nodeGraphStftBlurSample(state, input, blurTime, blurFreq, fftSize, mix),
      null,
    );
  }
  return this.safeFilterNumber(Number(input) || 0, null);
};
