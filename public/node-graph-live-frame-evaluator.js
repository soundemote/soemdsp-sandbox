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
  // soemdsp SmootherManager::run — dirty chases only, once per sample.
  if (typeof nodeGraphRunActiveParameterSmoothers === "function") {
    nodeGraphRunActiveParameterSmoothers(runtime, frames);
  }
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

  // Map a raw control input from [inputMin, inputMax] into the graph's unit
  // domain [0, 1]. Equal endpoints fall back to 0 so a zero-width range does
  // not produce NaN; the result is not clamped so wrap/phase can still loop.
  const graphMapInputToUnit = (raw, inputMin, inputMax) => {
    const min = Number(inputMin);
    const max = Number(inputMax);
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) ? max : 1;
    const span = hi - lo;
    if (Math.abs(span) < 1e-12) {
      return 0;
    }
    return ((Number(raw) || 0) - lo) / span;
  };
  const graphSampleX = (node, nodeId) => {
    const mode = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues));
    const phase = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
    // Phase is always a pure time/position offset: the curve shape is unchanged
    // and we simply start reading at phase (wraps through the same loop).
    if (mode <= 0) {
      const inputMin = readNodeGraphLiveEffectiveParam(runtime, node, "inputMin", 0, frame, frames, frameValues);
      const inputMax = readNodeGraphLiveEffectiveParam(runtime, node, "inputMax", 1, frame, frames, frameValues);
      return wrapNodeSliderValue(
        graphMapInputToUnit(mixInput(nodeId), inputMin, inputMax) + phase,
        0,
        1,
      );
    }
    const safeRate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
    const absoluteFrame = Number.isFinite(runtime.absoluteFrame) ? runtime.absoluteFrame : frame;
    const rate = Math.max(0, readNodeGraphLiveEffectiveParam(runtime, node, "rate", 1, frame, frames, frameValues));
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
    const sampleX = graphSampleX(node, nodeId);
    const nodeTension = Number(node?.params?.tension) ?? 1;
    const normalizedValue = nodeGraphGraphValueAt(
      nodeGraphGraphForNode(node),
      sampleX,
      nodeGraphGraphSmoothingModeForNode(node),
      nodeTension,
    );
    const outputMin = readNodeGraphLiveEffectiveParam(runtime, node, "outputMin", 0, frame, frames, frameValues);
    const outputMax = readNodeGraphLiveEffectiveParam(runtime, node, "outputMax", 1, frame, frames, frameValues);
    return {
      Out: outputMin + normalizedValue * (outputMax - outputMin),
      // Live playhead on the graph editor reads this port (see
      // syncNodeGraphGraphLivePlayheads) so Rate/Phase show motion.
      __GraphPhase: sampleX,
    };
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
      Number(source?.params?.tension) ?? 1,
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
