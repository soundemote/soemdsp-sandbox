// Soft Fractal worklet: Hx/Hy = map z←z²+c (pure math: rgb-fractal-math.js).

NodeLiveAudioProcessor.prototype.createRgbFractalState = function createRgbFractalState() {
  if (typeof createNodeGraphRgbFractalAudioState === "function") {
    return createNodeGraphRgbFractalAudioState();
  }
  return {
    orbitPhasor: 0,
    zx: 0.12,
    zy: 0.07,
    mapPhase: 0,
    dcRe: 0,
    dcIm: 0,
    stepCount: 0,
    hasStarted: false,
    lastDeltaHx: 0,
    lastDeltaHy: 0,
  };
};

NodeLiveAudioProcessor.prototype.rgbFractalSample = function rgbFractalSample(state, params, input, rate) {
  if (typeof nodeGraphRgbFractalAudioSample === "function") {
    return nodeGraphRgbFractalAudioSample(state, params, input, rate);
  }
  return { Hx: 0, Hy: 0 };
};
