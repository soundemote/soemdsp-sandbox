// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphPatchCommandState() {
  return {
    lastTrigger: 0,
  };
}

function nodeGraphPatchCommandTriggerSample(state, trigger, threshold, command, nodeId) {
  const safeTrigger = Number.isFinite(Number(trigger)) ? Number(trigger) : 0;
  const safeThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 0;
  if (state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) {
    if (typeof queueNodeGraphLivePatchCommand === "function") {
      queueNodeGraphLivePatchCommand(command, nodeId);
    }
  }
  state.lastTrigger = safeTrigger;
  return 0;
}


// Registers the offline/render-time dispatch handler for nextPatch and
// previousPatch into nodeGraphLiveModuleEvaluators (declared in
// node-graph-live-frame-evaluator.js) -- both types share one implementation,
// same as the original combined if-branch. Extracted from the inline
// if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.nextPatch = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput }) => {
  const state = runtime.patchCommandStates.get(nodeId) || createNodeGraphPatchCommandState();
  runtime.patchCommandStates.set(nodeId, state);
  return nodeGraphPatchCommandTriggerSample(
    state,
    mixInput(nodeId, "Trigger"),
    readNodeGraphLiveEffectiveParam(runtime, node, "threshold", 0, frame, frames, frameValues),
    node?.type === "previousPatch" ? "previousPatch" : "nextPatch",
    nodeId,
  );
};
nodeGraphLiveModuleEvaluators.previousPatch = nodeGraphLiveModuleEvaluators.nextPatch;
