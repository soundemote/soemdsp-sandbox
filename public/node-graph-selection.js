function setNodeGraphSelection(selection) {
  nodeGraphMvp.selected = selection;
  const selectedNode = nodeGraphSingleSelectedNodeId(selection);
  if (selectedNode && nodeGraphPatchNode(selectedNode)) {
    nodeGraphMvp.lastModuleActionTargetNode = selectedNode;
  }
  renderNodeGraphSelection();
}

function clearNodeGraphSelection() {
  setNodeGraphSelection(null);
}

function handleNodeGraphEnvironmentCommand(event) {
  if (event.detail?.command === "clear-selection") {
    clearNodeGraphSelection();
  }
}

function sendNodeGraphEnvironmentCommand(command) {
  document.getElementById("nodeGraphWorkspace")?.dispatchEvent(
    new CustomEvent("nodegraph:environment-command", {
      bubbles: false,
      detail: { command },
    }),
  );
}

function handleNodeGraphDocumentClick(event) {
  if (completeNodeGraphModulePlacement(event)) {
    return;
  }
  const target = event.target;
  if (
    !(target instanceof Element) ||
    target.closest("#nodeGraphWorkspace, #nodeSceneContextMenu, #nodeModuleActionsWindow, #nodeCodeBoxWindow, #nodeScopeContextMenu, #nodeGlobalScopeMenu, #nodeParameterMetadataPopover")
  ) {
    return;
  }
  sendNodeGraphEnvironmentCommand("clear-selection");
}

function nodeGraphSelectedNodeIds(selection = nodeGraphMvp.selected) {
  if (selection?.type === "node" && selection.id) {
    return new Set([selection.id]);
  }
  if (selection?.type === "nodes" && Array.isArray(selection.ids)) {
    return new Set(selection.ids);
  }
  return new Set();
}

function syncNodeGraphSelectionCountReadout(selection = nodeGraphMvp.selected) {
  const readout = document.getElementById("nodeSelectionCountReadout");
  if (!readout) {
    return;
  }
  const count = nodeGraphSelectedNodeIds(selection).size;
  const value = readout.querySelector("[data-selection-count-value]");
  if (value) {
    value.textContent = String(count);
  }
  readout.dataset.selectedModuleCount = String(count);
  readout.setAttribute(
    "aria-label",
    `${count} selected module${count === 1 ? "" : "s"}`,
  );
}

function nodeGraphSingleSelectedNodeId(selection = nodeGraphMvp.selected) {
  const selectedNodeIds = [...nodeGraphSelectedNodeIds(selection)];
  return selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
}

function nodeGraphModuleActionTargetNodeId() {
  const contextNode = nodeGraphMvp.sceneContextTargetNode;
  if (contextNode && nodeGraphPatchNode(contextNode)) {
    return contextNode;
  }
  const selectedNode = nodeGraphSingleSelectedNodeId();
  if (selectedNode && nodeGraphPatchNode(selectedNode)) {
    return selectedNode;
  }
  const lastNode = nodeGraphMvp.lastModuleActionTargetNode;
  if (lastNode && nodeGraphPatchNode(lastNode)) {
    return lastNode;
  }
  return null;
}

function syncNodeGraphModuleActionTargetFromSelection() {
  const commandMenu = document.getElementById("nodeSceneContextMenu");
  const actionWindow = document.getElementById("nodeModuleActionsWindow");
  const commandMenuOpen = commandMenu && !commandMenu.hidden && commandMenu.dataset.mode !== "add";
  const actionWindowOpen = actionWindow && !actionWindow.hidden;
  if (!commandMenuOpen && !actionWindowOpen) {
    return;
  }
  const selectedWire = nodeGraphWireFromSelection();
  if (selectedWire) {
    nodeGraphMvp.sceneContextTargetWire = {
      index: selectedWire.index,
      kind: selectedWire.kind,
    };
    nodeGraphMvp.sceneContextTargetNode = null;
    configureNodeSceneContextMenu("wire");
    return;
  }
  const selectedNode = nodeGraphSingleSelectedNodeId();
  if (selectedNode && nodeGraphPatchNode(selectedNode)) {
    nodeGraphMvp.sceneContextTargetNode = selectedNode;
    nodeGraphMvp.lastModuleActionTargetNode = selectedNode;
    nodeGraphMvp.sceneContextTargetWire = null;
    configureNodeSceneContextMenu("module");
  } else {
    const selectedNodeIds = nodeGraphSelectedNodeIds();
    nodeGraphMvp.sceneContextTargetNode = null;
    nodeGraphMvp.sceneContextTargetWire = null;
    if (selectedNodeIds.size > 1) {
      configureNodeSceneContextMenu("module");
    } else if (actionWindowOpen) {
      configureNodeSceneContextMenu("module");
    }
  }
}

function syncNodeGraphSharedInspectorTargetFromSelection() {
  const selectedNode = nodeGraphSingleSelectedNodeId();
  const hasNode = Boolean(selectedNode && nodeGraphPatchNode(selectedNode));

  // Display Settings: follow a single selected module when it has a display;
  // otherwise stay open but blank ("Right-click on a display").
  if (nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings") {
    const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
    if (popover && !popover.hidden) {
      if (hasNode && typeof syncOpenNodeGraphTraceDisplaySettingsToNode === "function") {
        syncOpenNodeGraphTraceDisplaySettingsToNode(selectedNode);
      } else if (typeof showBlankNodeGraphTraceDisplaySettingsContent === "function") {
        showBlankNodeGraphTraceDisplaySettingsContent();
      }
    }
  }

  // Parameter Settings: never auto-fill from module selection. Right-click on a
  // slider is the only way to populate. Selection only clears back to blank.
  if (nodeGraphMvp.sharedInspectorActive === "metaparameters") {
    const popover = document.getElementById("nodeParameterMetadataPopover");
    if (popover && !popover.hidden && typeof syncOpenNodeMetadataPopoverToModule === "function") {
      syncOpenNodeMetadataPopoverToModule(hasNode ? selectedNode : "");
    }
  }
}

function setNodeGraphNodeSelection(ids) {
  const uniqueIds = [...new Set(ids)].filter((id) => nodeGraphMvp.activeNodes.has(id));
  if (!uniqueIds.length) {
    setNodeGraphSelection(null);
    return;
  }
  if (uniqueIds.length === 1) {
    setNodeGraphSelection({ type: "node", id: uniqueIds[0] });
    return;
  }
  setNodeGraphSelection({ type: "nodes", ids: uniqueIds });
}

function selectAllNodeGraphModules() {
  setNodeGraphNodeSelection(nodeGraphMvp.patch.nodes.map((node) => node.id));
}

function toggleNodeGraphNodeSelection(id, additive = false) {
  if (!nodeGraphMvp.activeNodes.has(id)) {
    return;
  }
  if (!additive) {
    if (nodeGraphSelectedNodeIds().has(id)) {
      setNodeGraphSelection(null);
    } else {
      setNodeGraphNodeSelection([id]);
    }
    return;
  }

  const selectedNodeIds = nodeGraphSelectedNodeIds();
  if (selectedNodeIds.has(id)) {
    selectedNodeIds.delete(id);
  } else {
    selectedNodeIds.add(id);
  }
  setNodeGraphNodeSelection([...selectedNodeIds]);
}

function sameNodeGraphSelection(a, b) {
  if (a?.type !== b?.type) {
    return false;
  }
  if (a?.type === "wire") {
    return (
      (a.kind || "signal") === (b.kind || "signal") &&
      a.index === b.index
    );
  }
  if (a?.type === "nodes") {
    return (
      Array.isArray(a.ids) &&
      Array.isArray(b.ids) &&
      a.ids.length === b.ids.length &&
      a.ids.every((id, index) => id === b.ids[index])
    );
  }
  return a?.id === b?.id && a?.index === b?.index;
}

function nodeGraphWireSelectionExists(selection = nodeGraphMvp.selected) {
  if (selection?.type !== "wire") {
    return false;
  }
  const index = Number(selection.index);
  const wires = (selection.kind || "signal") === "graph"
    ? nodeGraphMvp.graphConnections
    : (selection.kind || "signal") === "modulation"
      ? nodeGraphMvp.modulations
      : nodeGraphMvp.connections;
  return Number.isInteger(index) && index >= 0 && index < wires.length;
}

function nodeGraphWireFromSelection(selection = nodeGraphMvp.selected) {
  if (!nodeGraphWireSelectionExists(selection)) {
    return null;
  }
  const kind = selection.kind || "signal";
  const wire = kind === "graph"
    ? nodeGraphMvp.graphConnections[selection.index]
    : kind === "modulation"
      ? nodeGraphMvp.modulations[selection.index]
      : nodeGraphMvp.connections[selection.index];
  return { kind, index: selection.index, wire };
}

function nodeGraphWireSelectionLabel(selection = nodeGraphMvp.selected) {
  const selectedWire = nodeGraphWireFromSelection(selection);
  if (!selectedWire) {
    return "none";
  }
  const { kind, wire } = selectedWire;
  if (kind === "modulation") {
    return `${nodeGraphLabel(wire.sourceNode, wire.sourcePort)} -> ${nodeGraphLabel(
      wire.destinationNode,
      wire.destinationParam,
    )} mod`;
  }
  if (kind === "graph") {
    return `${nodeGraphLabel(wire.sourceNode, wire.sourcePort)} -> ${nodeGraphNodeDisplayName(
      wire.destinationNode,
    )}.${wire.destinationGraphInput} graph`;
  }
  return `${nodeGraphLabel(wire.sourceNode, wire.sourcePort)} -> ${nodeGraphLabel(
    wire.destinationNode,
    wire.destinationPort,
  )}`;
}

function nodeGraphNodeCanBeDeleted(node) {
  return Boolean(node && node.type !== "output" && node.id !== "home");
}

function nodeGraphNodeDeleteHidesOnly(node) {
  return node?.type === "audioInput";
}

function nodeGraphSelectionCanDelete(selection = nodeGraphMvp.selected) {
  if (!selection) {
    return false;
  }
  if (selection.type === "wire") {
    return nodeGraphWireSelectionExists(selection);
  }
  return [...nodeGraphSelectedNodeIds(selection)].some((id) => {
    const node = nodeGraphPatchNode(id);
    return nodeGraphMvp.activeNodes.has(id) && nodeGraphNodeCanBeDeleted(node);
  });
}

function nodeGraphDeleteTitle(selection = nodeGraphMvp.selected) {
  if (!selection) {
    return nodeGraphTooltipText("actions.deleteNothing");
  }
  if (selection.type === "wire") {
    return nodeGraphWireSelectionExists(selection)
      ? nodeGraphTooltipText("actions.deleteWireShort")
      : nodeGraphTooltipText("actions.deleteWireMissing");
  }
  const selectedNodeIds = nodeGraphSelectedNodeIds(selection);
  if (!selectedNodeIds.size) {
    return nodeGraphTooltipText("actions.deleteNothing");
  }
  if ([...selectedNodeIds].every((id) => id === "output")) {
    return nodeGraphTooltipText("actions.deleteUnavailableOutput");
  }
  return selectedNodeIds.size === 1
    ? nodeGraphTooltipText("actions.deleteModuleShort")
    : nodeGraphTooltipText("actions.deleteModulesShort");
}

function pruneNodeGraphSelectionAfterPatch() {
  const selection = nodeGraphMvp.selected;
  if (!selection) {
    return;
  }
  if (selection.type === "wire") {
    if (!nodeGraphWireSelectionExists(selection)) {
      setNodeGraphSelection(null);
    }
    return;
  }

  const selectedNodeIds = nodeGraphSelectedNodeIds(selection);
  if (!selectedNodeIds.size) {
    setNodeGraphSelection(null);
    return;
  }
  const activeSelectedNodes = [...selectedNodeIds].filter((id) =>
    nodeGraphMvp.activeNodes.has(id),
  );
  if (activeSelectedNodes.length !== selectedNodeIds.size) {
    setNodeGraphNodeSelection(activeSelectedNodes);
  }
}

function renderNodeGraphSelection() {
  const selectedNodeIds = nodeGraphSelectedNodeIds();
  syncNodeGraphSelectionCountReadout();
  for (const node of document.querySelectorAll(".dsp-node")) {
    node.classList.toggle("selected", selectedNodeIds.has(node.dataset.node));
  }
  // Frame stroke color follows .selected via CSS; no path rebuild needed.

  for (const path of document.querySelectorAll(".node-wire-path")) {
    path.classList.toggle(
      "selected",
      sameNodeGraphSelection(nodeGraphMvp.selected, {
        type: "wire",
        kind: path.dataset.connectionKind || "signal",
        index: Number(path.dataset.connectionIndex),
      }),
    );
  }

  for (const item of document.querySelectorAll("[data-connection-row-index]")) {
    item.classList.toggle(
      "selected",
      sameNodeGraphSelection(nodeGraphMvp.selected, {
        type: "wire",
        kind: item.dataset.connectionRowKind || "signal",
        index: Number(item.dataset.connectionRowIndex),
      }),
    );
  }
  renderNodeGraphExecutionSummarySelection();

  const button = document.getElementById("nodeDeleteButton");
  button.disabled = !nodeGraphSelectionCanDelete();
  button.title = nodeGraphDeleteTitle();

  syncNodeGraphModuleActionTargetFromSelection();
  syncNodeGraphSharedInspectorTargetFromSelection();
  setNodeInteractionHelp(nodeInteractionHelpText(document.activeElement));
}

function selectNodeGraphWire(event, index, kind = "signal") {
  event.stopPropagation();
  setNodeGraphSelection({ type: "wire", kind, index });
}
