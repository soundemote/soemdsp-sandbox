// Offline/render dispatch for Chaosfly (chaosfly-math.js).

nodeGraphLiveModuleEvaluators.chaosfly = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  sampleRate,
}) => {
  if (!runtime.chaosflyStates) runtime.chaosflyStates = new Map();
  let state = runtime.chaosflyStates.get(nodeId);
  if (!state) {
    state = typeof createNodeGraphChaosflyState === "function"
      ? createNodeGraphChaosflyState()
      : {};
    runtime.chaosflyStates.set(nodeId, state);
  }
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const sample = typeof nodeGraphChaosflyCore === "function"
    ? nodeGraphChaosflyCore(state, {
      amplitude: read("amplitude", 0.5),
      fm1: read("fm1", 0),
      fm2: read("fm2", 0),
      frequency: read("frequency", 0),
      highpass: read("highpass", -2),
      hpPosition: read("hpPosition", 0),
      lowpass: read("lowpass", 6),
      masterFm: read("masterFm", 0),
      osc1Detune: read("osc1Detune", 0),
      osc2Detune: read("osc2Detune", 0),
      outputMode: read("outputMode", 0),
      pan: read("pan", 0),
      phase: read("phase", 0),
      pitch: read("pitch", 0),
      sampleRate,
      taps: read("taps", 4),
    })
    : { left: 0, right: 0, out: 0, x: 0, y: 0, z: 0 };
  return {
    Left: sample.left,
    Out: sample.out,
    Right: sample.right,
    X: sample.x,
    Y: sample.y,
    Z: sample.z,
  };
};
