// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphAliasSineState() {
  return { phase: 0 };
}

function nodeGraphAliasSineSample(state, normFreq, level, runtime = null, nodeId = "") {
  const safeNormFreq = nodeGraphSafeFilterNumber(normFreq, runtime, nodeId, null, "alias sine norm freq");
  const safeLevel = nodeGraphSafeFilterNumber(level, runtime, nodeId, null, "alias sine level");

  state.phase += safeNormFreq;
  state.phase -= Math.floor(state.phase);

  const out = Math.sin(state.phase * Math.PI * 2) * safeLevel;
  return nodeGraphSafeFilterNumber(Math.max(-1, Math.min(1, out)), runtime, nodeId, null, "alias sine output");
}


// Registers the offline/render-time dispatch handler for aliasSine into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Follows the same extraction pattern as pulseExplosion's live evaluator.
nodeGraphLiveModuleEvaluators.aliasSine = ({ runtime, node, nodeId, frame, frames, frameValues }) => {
  const state = runtime.aliasSineStates.get(nodeId) || createNodeGraphAliasSineState();
  runtime.aliasSineStates.set(nodeId, state);
  return nodeGraphAliasSineSample(
    state,
    readNodeGraphLiveEffectiveParam(runtime, node, "normFreq", 0.1, frame, frames, frameValues),
    readNodeGraphLiveEffectiveParam(runtime, node, "level", 1, frame, frames, frameValues),
    runtime,
    nodeId,
  );
};
