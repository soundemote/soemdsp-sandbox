// Tilt Filter — worklet. Pure math: tilt-filter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createTiltFilterState = function createTiltFilterState() {
  return createNodeGraphTiltFilterState();
};

NodeLiveAudioProcessor.prototype.createStereoTiltFilterState = function createStereoTiltFilterState() {
  return createNodeGraphStereoTiltFilterState();
};

NodeLiveAudioProcessor.prototype.tiltFilterSample = function tiltFilterSample(
  state,
  input,
  amountDb,
  pivotHz,
  rate,
) {
  return this.safeFilterNumber(
    nodeGraphTiltFilterSample(
      state,
      this.safeFilterNumber(input, state),
      amountDb,
      pivotHz,
      rate,
    ),
    state,
  );
};
