// AirClipper — pure JS Density3 (air-clipper-math.js). No native path.

NodeLiveAudioProcessor.prototype.createAirClipperState = function createAirClipperState() {
  return createNodeGraphAirClipperState();
};

NodeLiveAudioProcessor.prototype.airClipperFrame = function airClipperFrame(
  state,
  mono,
  left,
  right,
  densityA,
  highpassB,
  outputC,
  wetD,
  sampleRate,
) {
  if (typeof nodeGraphAirClipperFrame === "function") {
    return nodeGraphAirClipperFrame(
      state,
      mono,
      left,
      right,
      densityA,
      highpassB,
      outputC,
      wetD,
      sampleRate,
    );
  }
  const m = Number(mono) || 0;
  return {
    Out: m,
    Left: (Number(left) || 0) + m,
    Right: (Number(right) || 0) + m,
  };
};
