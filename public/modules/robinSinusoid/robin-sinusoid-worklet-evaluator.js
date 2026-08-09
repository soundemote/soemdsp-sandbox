// RobinSinusoid — pure JS recursive sine (robin-sinusoid-math.js). No native path.

NodeLiveAudioProcessor.prototype.createRobinSinusoidState = function createRobinSinusoidState() {
  return createNodeGraphRobinSinusoidState();
};

NodeLiveAudioProcessor.prototype.robinSinusoidSample = function robinSinusoidSample(
  state,
  frequencyHz,
  amplitude,
  sampleRate,
  startPhaseRadians,
  reset,
) {
  if (typeof nodeGraphRobinSinusoidSample === "function") {
    return this.safeFilterNumber(
      nodeGraphRobinSinusoidSample(
        state,
        frequencyHz,
        amplitude,
        sampleRate,
        startPhaseRadians,
        reset,
      ),
      state,
    );
  }
  return 0;
};
