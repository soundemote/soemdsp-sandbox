function nodeGraphSafeFilterNumber(value, runtime, nodeId, state, source) {
  const number = Number(value);
  const reason = nodeGraphBadValueReason(number);
  if (!reason) {
    return number;
  }
  if (state) {
    state.inputBuffer = 0;
    state.outputBuffer = 0;
  }
  nodeGraphMarkRuntimeBadNumber(runtime, nodeId, `${source} ${reason}`);
  return 0;
}

// Registry of per-module-type dispatch handlers extracted into their own
// files (e.g. native_modules/logistic_map/logistic_map-live-evaluator.js),
// each self-registering on load. Checked ahead of the big if/else-if chain
// below so a migrated module type never requires editing this file again.
const nodeGraphLiveModuleEvaluators = {};

function evaluateNodeGraphPlanFrame(runtime, sampleRate, frame, frames) {
  const frameValues = new Map();
  const mixInput = (nodeId, port = "In") => {
    const base = (runtime.inputConnections.get(`${nodeId}.${port}`) || []).reduce(
      (sum, connection) => sum + readNodeGraphRuntimePortOutput(
        runtime,
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      ),
      0,
    );
    const triggerKey = `${nodeId}.${port}`;
    if (runtime.inputWireBreakTriggers.has(triggerKey)) {
      runtime.inputWireBreakTriggers.delete(triggerKey);
      return base + 1;
    }
    return base;
  };
  const hasInput = (nodeId, port) => runtime.inputConnections.has(`${nodeId}.${port}`);

  const graphSampleX = (node, nodeId) => {
    const mode = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues));
    if (mode <= 0) {
      return mixInput(nodeId);
    }
    const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
    const absoluteFrame = Number.isFinite(runtime.absoluteFrame) ? runtime.absoluteFrame : frame;
    const rate = Math.max(0, readNodeGraphLiveEffectiveParam(runtime, node, "rate", 1, frame, frames, frameValues));
    const phase = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
    const state = runtime.graphLfoStates.get(nodeId) || createNodeGraphGraphLfoState();
    runtime.graphLfoStates.set(nodeId, state);
    const resetValue = 0;
    if (state.lastReset <= 0 && resetValue > 0) {
      state.resetFrame = absoluteFrame;
    }
    state.lastReset = resetValue;
    const resetFrame = Number.isFinite(state.resetFrame) ? state.resetFrame : 0;
    return wrapNodeSliderValue(((absoluteFrame - resetFrame) / safeRate) * rate + phase, 0, 1);
  };
  const graphOutputValue = (node, nodeId) => {
    const normalizedValue = nodeGraphGraphValueAt(
      nodeGraphGraphForNode(node),
      graphSampleX(node, nodeId),
      nodeGraphGraphSmoothingModeForNode(node),
    );
    const outputMin = readNodeGraphLiveEffectiveParam(runtime, node, "outputMin", 0, frame, frames, frameValues);
    const outputMax = readNodeGraphLiveEffectiveParam(runtime, node, "outputMax", 1, frame, frames, frameValues);
    return outputMin + normalizedValue * (outputMax - outputMin);
  };
  const graphInputValue = (nodeId, graphInput, x, fallback) => {
    const connection = (runtime.graphInputConnections?.get(nodeGraphGraphInputKey(nodeId, graphInput)) || [])[0];
    const source = connection ? runtime.nodes.get(connection.sourceNode) : null;
    if (!source || !nodeGraphModuleIsGraphType(source.type)) {
      return fallback;
    }
    return nodeGraphGraphValueAt(
      nodeGraphGraphForNode(source),
      clampNodeSliderValue(Number(x) || 0, 0, 1),
      nodeGraphGraphSmoothingModeForNode(source),
    );
  };

  for (const nodeId of runtime.order || []) {
    const node = runtime.nodes.get(nodeId);
    let value = 0;

    const liveModuleEvaluator = node?.type ? nodeGraphLiveModuleEvaluators[node.type] : null;
    if (liveModuleEvaluator) {
      value = liveModuleEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate, graphInputValue, graphOutputValue });
    }

    frameValues.set(nodeId, value);
    runtime.nodeOutputs?.set(nodeId, value);
  }

  const outputNode = runtime.nodes.get(runtime.outputNode || "output");
  const outputVolume = outputNode
    ? readNodeGraphLiveEffectiveParam(
      runtime,
      outputNode,
      "volume",
      0.1,
      frame,
      frames,
      frameValues,
    )
    : 1;

  const outputMono = mixInput(runtime.outputNode || "output", "Mono");
  return {
    frameValues,
    left: (outputMono + mixInput(runtime.outputNode || "output", "Left")) * outputVolume,
    right: (outputMono + mixInput(runtime.outputNode || "output", "Right")) * outputVolume,
  };
}
