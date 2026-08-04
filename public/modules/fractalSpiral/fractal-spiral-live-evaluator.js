// Registers the offline/render-time dispatch handler for fractalSpiral into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.fractalSpiral = ({ runtime, node, nodeId, frame, frames, frameValues, sampleRate }) => {
  const state = runtime.fractalSpiralStates.get(nodeId) || createFractalSpiralState();
  runtime.fractalSpiralStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    key,
    fallback,
    frame,
    frames,
    frameValues,
  );
  const fractal = fractalSpiralSample({
    frequency: read("frequency", 1),
    gain: read("gain", 0.5),
    growth: read("growth", 1.5),
    lacunarity: read("lacunarity", 2),
    octaves: read("octaves", 5),
    sampleRate,
    size: read("size", 0.5),
    spin: read("spin", 0.05),
    state,
    twist: read("twist", 0.381966),
  });
  const fractalLevel = read("amplitude", 1);
  return {
    X: fractal.x * fractalLevel,
    Y: fractal.y * fractalLevel,
    Z: fractal.z * fractalLevel,
  };
};
