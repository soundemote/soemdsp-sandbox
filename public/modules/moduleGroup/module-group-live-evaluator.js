// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphEvaluateModuleGroup(runtime, node, mixInput, sampleRate, frame, frames) {
  const group = node.moduleGroup?.kind === "moduleGroup"
    ? node.moduleGroup
    : normalizeNodeGraphModuleGroup(node.moduleGroup);
  if (!group.sourcePatch) {
    return {};
  }
  let groupRuntime = runtime.moduleGroupRuntimes?.get(node.id);
  if (!groupRuntime) {
    try {
      groupRuntime = createNodeGraphLiveRuntime(nodeGraphBuildLivePlanForPatch(group.sourcePatch));
      runtime.moduleGroupRuntimes?.set(node.id, groupRuntime);
    } catch (error) {
      nodeGraphMarkRuntimeBadNumber(runtime, node.id, `module group plan error ${error?.message || ""}`);
      return {};
    }
  }
  groupRuntime.externalButtonEvents = runtime.externalButtonEvents;
  groupRuntime.wireBreakEvent = runtime.wireBreakEvent;
  groupRuntime.wireConnectEvent = runtime.wireConnectEvent;
  groupRuntime.wireDisconnectEvent = runtime.wireDisconnectEvent;
  groupRuntime.windowReopenEvent = runtime.windowReopenEvent;
  groupRuntime.shootingStarExplosionEvent = runtime.shootingStarExplosionEvent;
  groupRuntime.externalGroupInputs = new Map(
    group.inputs.map((input) => [input.nodeId, mixInput(node.id, input.name)]),
  );
  const groupFrame = evaluateNodeGraphPlanFrame(groupRuntime, sampleRate, frame, frames);
  const output = {};
  for (const endpoint of group.outputs) {
    output[endpoint.name] = readNodeGraphRuntimePortOutput(
      groupRuntime,
      groupFrame.frameValues,
      endpoint.nodeId,
      endpoint.port || "Out",
      frame,
      frames,
    );
  }
  return output;
}


// Registers the offline/render-time dispatch handler for moduleGroup into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.moduleGroup = ({ runtime, node, frame, frames, mixInput, sampleRate }) => nodeGraphEvaluateModuleGroup(runtime, node, mixInput, sampleRate, frame, frames);
