// EQ Filter — worklet. Pure math: eq-filter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createEqFilterState = function createEqFilterState() {
  return createNodeGraphEqFilterState();
};

NodeLiveAudioProcessor.prototype.createStereoEqFilterState = function createStereoEqFilterState() {
  return createNodeGraphStereoEqFilterState();
};

NodeLiveAudioProcessor.prototype.eqFilterSample = function eqFilterSample(
  state,
  input,
  mode,
  frequency,
  q,
  gainDb,
  rate,
) {
  return this.safeFilterNumber(
    nodeGraphEqFilterSample(
      state,
      this.safeFilterNumber(input, state),
      mode,
      frequency,
      q,
      gainDb,
      rate,
    ),
    state,
  );
};
