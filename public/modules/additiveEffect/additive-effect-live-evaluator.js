// Offline/render: Additive Effect mutates Magenta Graph once per quantum.

const nodeGraphAdditiveEffectStates = new Map();

function nodeGraphAdditiveEffectLiveEvaluator({ node, nodeId }) {
  const incoming = typeof readNodeGraphDataInput === "function"
    ? readNodeGraphDataInput(String(nodeId), "Graph")
    : undefined;
  if (!incoming || !incoming.ratio) {
    if (typeof writeNodeGraphDataOutput === "function") {
      writeNodeGraphDataOutput(String(nodeId), "Graph", null);
    }
    return {};
  }
  const read = (key, fallback) => {
    const n = Number(node?.parameters?.[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const modeIdx = Math.round(read("effect", 0));
  const modes = ["LinearFilter", "AnalogFilter", "Growl", "Noisy"];
  const mode = modes[additiveGraphClamp(modeIdx, 0, 3)] || "LinearFilter";
  let state = nodeGraphAdditiveEffectStates.get(String(nodeId));
  const applied = additiveGraphApplyEffect(
    incoming,
    mode,
    read("parA", 0.5),
    read("parB", 1),
    read("parC", 0),
    read("parD", 0),
    state
  );
  nodeGraphAdditiveEffectStates.set(String(nodeId), applied.state);
  if (typeof writeNodeGraphDataOutput === "function") {
    writeNodeGraphDataOutput(String(nodeId), "Graph", applied.graph);
  }
  return {};
}

nodeGraphLiveModuleEvaluators.additiveEffect = nodeGraphAdditiveEffectLiveEvaluator;
