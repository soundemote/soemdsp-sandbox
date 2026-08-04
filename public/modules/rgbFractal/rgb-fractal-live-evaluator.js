// Soft Fractal live/offline: Hx/Hy = map z←z²+c (pure planetary c).

function createNodeGraphRgbFractalState() {
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
}

function nodeGraphRgbFractalSafeOut(runtime, nodeId, value, label) {
  if (typeof nodeGraphSafeFilterNumber === "function") {
    return nodeGraphSafeFilterNumber(value, runtime, nodeId, null, label);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

nodeGraphLiveModuleEvaluators.rgbFractal = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  if (!runtime.rgbFractalStates) {
    runtime.rgbFractalStates = new Map();
  }
  const state = runtime.rgbFractalStates.get(nodeId) || createNodeGraphRgbFractalState();
  runtime.rgbFractalStates.set(nodeId, state);

  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);

  const params = {
    speed: read("speed", 1),
    seed: read("seed", 0),
    orbitSize: read("orbitSize", 1),
    detune: read("detune", 0.45),
  };

  if (typeof nodeGraphRgbFractalAudioSample !== "function") {
    return { Hx: 0, Hy: 0 };
  }

  const sr = Math.max(1, Number(sampleRate) || Number(runtime?.sampleRate) || 44100);
  const result = nodeGraphRgbFractalAudioSample(state, params, 0, sr);
  return {
    Hx: nodeGraphRgbFractalSafeOut(runtime, nodeId, result.Hx, "rgb fractal Hx"),
    Hy: nodeGraphRgbFractalSafeOut(runtime, nodeId, result.Hy, "rgb fractal Hy"),
  };
};
