// Worklet peel for attenuverter. Math: attenuverter-math.js (same Blob).

NodeLiveAudioProcessor.prototype.attenuverterFrame = function attenuverterFrame(input, amplitude, offset) {
  return nodeGraphAttenuverterFrame(input, amplitude, offset);
};
