NodeLiveAudioProcessor.prototype.numberGateSample = function numberGateSample(options) {
  return typeof nodeGraphNumberGateSample === "function"
    ? nodeGraphNumberGateSample(options)
    : {};
};
