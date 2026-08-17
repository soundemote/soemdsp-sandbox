// Worklet peel for MixStereo. Math: mix-stereo-math.js (same Blob).

NodeLiveAudioProcessor.prototype.mixStereoFrame = function mixStereoFrame(inputs, params) {
  if (typeof nodeGraphMixStereoFrame === "function") {
    return nodeGraphMixStereoFrame(inputs, params);
  }
  return { Left: 0, Right: 0 };
};
