// SpeedColorInertia — offline/render path. Pure math: speed-color-inertia-math.js.

nodeGraphLiveModuleEvaluators.speedColorInertia = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  if (!runtime.speedColorInertiaStates) {
    runtime.speedColorInertiaStates = new Map();
  }
  const state = runtime.speedColorInertiaStates.get(nodeId) || createNodeGraphSpeedColorInertiaState();
  runtime.speedColorInertiaStates.set(nodeId, state);
  const read = (key, fallback) =>
    readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const raw = nodeGraphSafeFilterNumber(mixInput(nodeId, "In"), runtime, nodeId, null, "speed color in");
  const out = nodeGraphSpeedColorInertiaSample(state, raw, {
    gain: read("gain", 8),
    attack: read("attack", 1),
    release: read("release", 0.005),
  });
  return {
    Raw: nodeGraphSafeFilterNumber(out.Raw, runtime, nodeId, null, "speed color raw"),
    Speed: nodeGraphSafeFilterNumber(out.Speed, runtime, nodeId, null, "speed color speed"),
    Inertia: nodeGraphSafeFilterNumber(out.Inertia, runtime, nodeId, null, "speed color inertia"),
  };
};
