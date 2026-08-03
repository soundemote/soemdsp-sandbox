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
  attack,
  release,
) {
  return this.safeFilterNumber(
    nodeGraphInertialFilterSample(
      state,
      this.safeFilterNumber(input, state),
      attack,
      release,
    ),
    state,
  );
};
