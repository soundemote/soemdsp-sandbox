// Scope slot registry / monitors / drawable queries (Phase D).
// Load after scopes.js. Extract-only.

function registerNodeGraphModuleScopeSlot(moduleElement, options = {}) {
  const nodeId = moduleElement?.dataset?.node || options.nodeId || "";
  if (!nodeId) {
    return null;
  }
  const scopeElement = options.scopeElement
    || moduleElement?.querySelector?.(".node-module-scope-window")
    || null;
  const slot = {
    element: moduleElement,
    nodeId,
    scopeElement,
    type: options.type || moduleElement?.dataset?.nodeType || "",
  };
  if (options.viewDrag !== false) {
    bindNodeGraphModuleScopeWindowEvents(scopeElement);
  }
  nodeGraphModuleScopeState.slots.set(nodeId, slot);
  if (slot.type === "rasterRgb" && typeof scheduleNodeGraphRasterRgbPump === "function") {
    scheduleNodeGraphRasterRgbPump();
  }
  // Patch load registers many slots; don't queue a full scope pass while
  // stopped (each schedule used to reflow every face via HasModelDisplay).
  if (typeof nodeGraphModuleScopePaused !== "function" || !nodeGraphModuleScopePaused()) {
    scheduleNodeGraphModuleScopeDraw();
  }
  return slot;
}

function unregisterNodeGraphModuleScopeSlot(nodeId) {
  const slot = nodeGraphModuleScopeState.slots.get(nodeId);
  const burnCanvas = slot?.scopeElement?.querySelector?.(
    ":scope > .node-module-scope-local-fallback-canvas",
  );
  if (burnCanvas && typeof disposeNodeGraphScope2dBurnRendererForCanvas === "function") {
    disposeNodeGraphScope2dBurnRendererForCanvas(burnCanvas);
  }
  nodeGraphModuleScopeState.slots.delete(nodeId);
  nodeGraphModuleScopeState.lightDisplayStates.delete(nodeId);
  nodeGraphModuleScopeState.modelFrameTimes.delete(nodeId);
  nodeGraphModuleScopeState.clockPhasors.delete(nodeId);
  nodeGraphModuleScopeState.oscillatorPhasors.delete(nodeId);
  if (typeof nodeGraphPhosphorWaveformClearViewKeys === "function") {
    nodeGraphPhosphorWaveformClearViewKeys(nodeId);
  } else if (typeof nodeGraphPhosphorWaveformViewStates !== "undefined") {
    nodeGraphPhosphorWaveformViewStates.delete(nodeId);
  }
}

function nodeGraphModuleScopeSlots() {
  return [...nodeGraphModuleScopeState.slots.values()]
    .filter((slot) => slot.element?.isConnected && !slot.element.hidden && slot.scopeElement);
}

function nodeGraphModuleScopeSlotDisplayVisible(slot) {
  if (!slot?.element?.isConnected || slot.element.hidden || !slot.scopeElement) {
    return false;
  }
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(slot.nodeId)
    : null;
  if (
    slot.nodeId &&
    typeof nodeGraphNodeIsBypassed === "function" &&
    nodeGraphNodeIsBypassed(slot.nodeId)
  ) {
    return false;
  }
  // Use DisplayVisibleForUi so custom faces (Number Readout, Knob, LED, …)
  // stay live when the global "Show displays" toggle is off. That flag only
  // hides analyzer scopes — not always-on module plates.
  const type = patchNode?.type || slot.type || "";
  if (typeof nodeGraphModuleDisplayVisibleForUi === "function") {
    return nodeGraphModuleDisplayVisibleForUi(type, patchNode?.ui || {});
  }
  if (nodeGraphMvp?.moduleOscilloscopesVisible === false) {
    return false;
  }
  const normalizedUi = patchNode?.ui && typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(patchNode.ui, type)
    : (patchNode?.ui || {});
  return normalizedUi?.oscilloscopeHidden !== true;
}

function nodeGraphModuleScopeSlotIsDrawable(slot) {
  return nodeGraphModuleScopeSlotDisplayVisible(slot);
}

function nodeGraphVisibleModuleScopeSlots() {
  const slots = nodeGraphModuleScopeSlots().filter(nodeGraphModuleScopeSlotIsDrawable);
  if (typeof nodeGraphScreenSoloAllowsNode !== "function" || !nodeGraphScreenSoloIsActive?.()) {
    return slots;
  }
  return slots.filter((slot) => nodeGraphScreenSoloAllowsNode(slot?.nodeId));
}

function nodeGraphVisibleModuleScopeNodeIds() {
  return new Set(nodeGraphVisibleModuleScopeSlots()
    .map((slot) => String(slot?.nodeId || ""))
    .filter(Boolean));
}

function nodeGraphModuleScopeHasDrawableSlots() {
  return nodeGraphVisibleModuleScopeSlots().length > 0;
}

function nodeGraphModuleScopeMonitorFingerprint(monitors = []) {
  return normalizeNodeGraphPatchMonitors(monitors)
    .map(nodeGraphMonitorEndpointKey)
    .sort()
    .join("|");
}

function nodeGraphModuleScopeIsOscillatorType(type) {
  return nodeGraphModuleIsRealtimeOscillatorType(type);
}

function nodeGraphModuleScopeIsAdditiveType(type) {
  return type === "additiveOsc" || type === "gpuAdditiveOsc";
}

function nodeGraphDefaultModuleScopeMonitors(patch = nodeGraphMvp?.patch) {
  return (Array.isArray(patch?.nodes) ? patch.nodes : [])
    .map((node) => {
      if (nodeGraphModuleScopeIsOscillatorType(node?.type)) {
        return {
          io: "output",
          node: node.id,
          port: nodeGraphOscillatorSelectedOutputPort(node),
        };
      }
      const inputs = nodeGraphPatchNodeInputPorts(node);
      if (inputs.length) {
        return {
          io: "input",
          node: node.id,
          port: inputs[0],
        };
      }
      const outputs = nodeGraphPatchNodeOutputPorts(node);
      if (!outputs.length) {
        return null;
      }
      const port = outputs.includes("Out") ? "Out" : outputs[0];
      return {
        io: "output",
        node: node.id,
        port,
      };
    })
    .filter(Boolean);
}

function nodeGraphOscillatorSelectedOutputPort(node) {
  const outputs = nodeGraphPatchNodeOutputPorts(node);
  return outputs.includes("Wave Out") ? "Wave Out" : outputs[0] || "Out";
}

// nodeGraphModuleScopeCaptureMonitors → node-graph-module-scope-capture.js
function nodeGraphModuleScopeHasModelDisplay() {
  return nodeGraphVisibleModuleScopeSlots().some((slot) => {
    const renderer = nodeGraphModuleDisplayRendererForSlot(slot);
    const outputs = nodeGraphPatchNodeOutputPorts(nodeGraphModuleScopeNodeForSlot(slot));
    return slot.type === "clock" ||
      slot.type === "transport" ||
      nodeGraphModuleScopeIsOscillatorType(slot.type) ||
      (["traceDisplay", "dotOscilloscope", "valueOscilloscope", "lineBurnOscilloscope", "led"].includes(slot.type) &&
        nodeGraphModuleScopeConnectionsTo(slot.nodeId, "In").length > 0) ||
      (["scope2d", "scope2dTrace", "phosphorLight"].includes(renderer) && (
        // Prefer live X/Y wires. Do NOT treat dry Thru ports alone as a model:
        // pure 2D Phosphor faces now always declare outputs ["X","Y"] for thrus,
        // which used to make hasModelDisplay true with empty capture buffers.
        (
          nodeGraphModuleScopeConnectionsTo(slot.nodeId, "X").length > 0 &&
          nodeGraphModuleScopeConnectionsTo(slot.nodeId, "Y").length > 0
        ) || (
          // Generators (Lorenz, Chua, …): X/Y are real outs, not dry thrus.
          outputs.includes("X")
          && outputs.includes("Y")
          && nodeGraphModuleDefinitions[slot.type]?.visualSink !== true
        )
      )) ||
      (slot.type === "gain" && nodeGraphModuleScopeConnectionsTo(slot.nodeId, "In").length > 0) ||
      (slot.type === "output" && nodeGraphModuleScopeOutputConnectionList(
        nodeGraphModuleScopeOutputInputConnections(slot.nodeId),
      ).length > 0);
  });
}

function nodeGraphModuleScopeHasRenderableSlots() {
  return nodeGraphVisibleModuleScopeSlots().some((slot) => slot?.scopeElement);
}

