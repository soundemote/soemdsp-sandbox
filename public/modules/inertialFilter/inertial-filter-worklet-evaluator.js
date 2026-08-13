// Inertial Filter — worklet. Pure math: inertial-filter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createInertialFilterState = function createInertialFilterState() {
  return createNodeGraphInertialFilterState();
};

NodeLiveAudioProcessor.prototype.createStereoInertialFilterState = function createStereoInertialFilterState() {
  return createNodeGraphStereoInertialFilterState();
};

NodeLiveAudioProcessor.prototype.inertialFilterSample = function inertialFilterSample(
  state,
  input,
  attackHz,
  releaseHz,
  rate = sampleRate,
) {
  return this.safeFilterNumber(
    nodeGraphInertialFilterSampleHz(
      state,
      this.safeFilterNumber(input, state),
      attackHz,
      releaseHz,
      rate,
    ),
    state,
  );
};
