// Offline/render: CurveEnvelopeMod — block-rate cyan Out (last sample).

const nodeGraphAdditiveCurveEnvelopeStates = new Map();

function nodeGraphAdditiveCurveEnvelopeLiveEvaluator({
  node,
  nodeId,
  frame,
  frames,
  mixInput,
  hasInput,
  sampleRate,
}) {
  const id = String(nodeId);
  let state = nodeGraphAdditiveCurveEnvelopeStates.get(id);
  if (!state) {
    state = typeof createNodeGraphExpAdsrState === "function"
      ? createNodeGraphExpAdsrState()
      : { lastGate: 0, out: 0, secondsPassed: 0, state: "off" };
    nodeGraphAdditiveCurveEnvelopeStates.set(id, state);
  }

  if (node?.bypassed) {
    return { Out: 0 };
  }

  const read = (key, fallback) => {
    const n = Number(node?.parameters?.[key] ?? node?.params?.[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const live = {
    delay: read("delay", 0),
    attack: read("attack", 0.08),
    decay: read("decay", 0.22),
    sustain: read("sustain", 0.55),
    release: read("release", 0.45),
    attackShape: read("attackShape", 0),
    releaseShape: read("releaseShape", 0),
    loop: read("loop", 0),
    level: read("level", 1),
    updateOnTrigger: read("updateOnTrigger", 0),
  };
  const gate = hasInput?.(nodeId, "Gate")
    ? Number(mixInput(nodeId, "Gate")) || 0
    : 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const params = typeof nodeGraphExpAdsrParamsForSample === "function"
    ? nodeGraphExpAdsrParamsForSample(state, gate, live, live.updateOnTrigger)
    : live;
  let out = 0;
  if (typeof nodeGraphExpAdsrCore === "function") {
    out = nodeGraphExpAdsrCore(state, gate, params, sr);
  }
  // Publish for cyan/mod consumers that peek nodeOutputs on the main thread.
  if (typeof writeNodeGraphDataOutput === "function" && frame === (frames | 0) - 1) {
    writeNodeGraphDataOutput(id, "Out", out);
  }
  return { Out: out };
}

nodeGraphLiveModuleEvaluators.curveEnvelopeMod = nodeGraphAdditiveCurveEnvelopeLiveEvaluator;
// Load-time migrator rewrites old type ids; keep alias if anything bypasses migrate.
nodeGraphLiveModuleEvaluators.additiveCurveEnvelope = nodeGraphAdditiveCurveEnvelopeLiveEvaluator;
