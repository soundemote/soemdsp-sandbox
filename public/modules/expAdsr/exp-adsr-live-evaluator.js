// Registers the offline/render-time dispatch handler for expAdsr into
// nodeGraphLiveModuleEvaluators. Pure math: exp-adsr-math.js.
nodeGraphLiveModuleEvaluators.expAdsr = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.expAdsrStates.get(nodeId) || createNodeGraphExpAdsrState();
  runtime.expAdsrStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const gate = mixInput(nodeId, "Gate");
  const live = {
    attack: read("attack", 0.08),
    attackShape: read("attackShape", 0),
    decay: read("decay", 0.22),
    delay: read("delay", 0),
    level: read("level", 1),
    loop: read("loop", 0),
    release: read("release", 0.45),
    releaseShape: read("releaseShape", 0),
    sustain: read("sustain", 0.55),
    updateOnTrigger: read("updateOnTrigger", 0),
  };
  const params = typeof nodeGraphExpAdsrParamsForSample === "function"
    ? nodeGraphExpAdsrParamsForSample(state, gate, live, live.updateOnTrigger)
    : live;
  return nodeGraphExpAdsrSample(
    state,
    gate,
    params,
    sampleRate,
    runtime,
    nodeId,
  );
};
