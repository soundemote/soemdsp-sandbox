// Bode Shifter — worklet.

NodeLiveAudioProcessor.prototype.createBodeState = function createBodeState() {
  if (typeof createNodeGraphBodeState === "function") {
    return createNodeGraphBodeState();
  }
  return { buf: new Float32Array(63), write: 0, filled: 0, phase: 0, fbZ: 0 };
};

NodeLiveAudioProcessor.prototype.bodeSample = function bodeSample(
  state,
  input,
  shiftHz,
  fineHz,
  feedback,
  mix,
  rate = sampleRate,
) {
  if (typeof nodeGraphBodeSample === "function") {
    return this.safeFilterNumber(
      nodeGraphBodeSample(state, input, shiftHz, fineHz, feedback, mix, rate),
      null,
    );
  }
  return this.safeFilterNumber(Number(input) || 0, null);
};
