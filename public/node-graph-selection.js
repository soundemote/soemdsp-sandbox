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

/** True when the event is inside a floating inspector / dialog (not the graph). */
function nodeGraphEventTargetIsFloatingWindow(target) {
  if (!(target instanceof Element) && !(target instanceof Node)) {
    return false;
  }
  const el = target instanceof Element ? target : target.parentElement;
  if (!el) {
    return false;
  }
  if (el.closest(".node-floating-window-surface")) {
    return true;
  }
  if (typeof nodeGraphFloatingWindowSurfaceFromTarget === "function") {
    if (nodeGraphFloatingWindowSurfaceFromTarget(el)) {
      return true;
    }
  }
  // Registry + workspace window map cover command center, display settings, etc.
  // Do not require !hidden for contains() — a half-open transition should still count.
  if (typeof nodeGraphFloatingWindowRegistry === "function") {
    for (const entry of nodeGraphFloatingWindowRegistry()) {
      const element = document.getElementById(entry.elementId);
      if (element?.contains(el)) {
        return true;
      }
    }
  }
  if (typeof nodeGraphWorkspaceWindowElements === "object" && nodeGraphWorkspaceWindowElements) {
    for (const elementId of Object.values(nodeGraphWorkspaceWindowElements)) {
      const element = document.getElementById(elementId);
      if (element?.contains(el)) {
        return true;
      }
    }
  }
  // Known dialogs / inspectors (id or class), including ones not yet in the map.
  if (el.closest([
    "#nodeCanvasScriptDialog",
    "#nodeScopeContextMenu",
    "#nodeSceneContextMenu",
    "#nodeModuleActionsWindow",
    "#nodeParameterMetadataPopover",
    "#nodeTraceDisplaySettingsPopover",
    "#nodeGlobalScopeMenu",
    "#nodeVisibilityMenu",
    "#nodeSavedPatchesWindow",
    "#nodeModuleShopView",
    "#nodeUserUiSettingsPanel",
    "#nodeUiDevHelper",
    "#nodePhosphorWaveformSettingsWindow",
    "#nodeLedSettingsWindow",
    "#nodeCodeBoxWindow",
    "#nodeStandaloneMidiKeyboardDock",
    "#nodeTooltipWindow",
    ".node-canvas-script-dialog",
    ".node-scene-context-menu",
    ".node-parameter-metadata-popover",
    ".node-trace-display-settings-popover",
    ".node-visibility-menu",
    ".node-saved-patches-window",
    ".node-module-shop-view",
    ".node-user-ui-settings-panel",
    ".node-ui-dev-helper",
    ".node-phosphor-waveform-settings-window",
    ".node-led-settings-window",
  ].join(", "))) {
    return true;
  }
  return false;
}

/** Form / toolbar chrome that must never deselect a module. */
function nodeGraphEventTargetIsAppChrome(target) {
  if (!(target instanceof Element) && !(target instanceof Node)) {
    return false;
  }
  const el = target instanceof Element ? target : target.parentElement;
  if (!el) {
    return false;
  }
  return Boolean(el.closest([
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "option",
    "summary",
    "a",
    "[role='dialog']",
    "[role='menu']",
    "[role='listbox']",
    "[role='toolbar']",
    "[role='tablist']",
    "[contenteditable='true']",
    ".node-view-toolbar",
    ".panel",
    ".panel-heading",
    ".node-gradient-selector",
    "[data-gradient-selector-host]",
    "[data-shared-gradient-host]",
    "[data-spectrogram-gradient-host]",
    ".scw-root",
    ".sound-color-widget",
    "#seDebugPanel",
    "#seDebugButton",
    ".node-history-controls",
    ".node-patch-timing-controls",
  ].join(", ")));
}

function handleNodeGraphDocumentClick(event) {
  if (completeNodeGraphModulePlacement(event)) {
    return;
  }
  const raw = event.target;
  const target = raw instanceof Element
    ? raw
    : (raw instanceof Node ? raw.parentElement : null);
  if (!target) {
    return;
  }

  // Floating inspectors / settings (display, module settings, gradient hosts, …)
  // must never clear module selection — blanking display settings follows that.
  if (nodeGraphEventTargetIsFloatingWindow(target) || nodeGraphEventTargetIsAppChrome(target)) {
    return;
  }

  // Module / wire hits manage selection themselves.
  if (target.closest(".dsp-node, .node-wire-path, .node-wire-hit-path, .node-port, .node-param-port, .node-io-row")) {
    return;
  }

  // Only empty modular canvas background deselects.
  if (target.closest("#nodeGraphWorkspace, #nodeGraphZoomSurface, #nodeGraphWireLayer")) {
    sendNodeGraphEnvironmentCommand("clear-selection");
  }
  // Clicks outside the modular workspace (toolbars already filtered above) do
  // not clear selection — editing UI must keep the module pinned.
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

  // Display Settings: when the user selects a (single) module, follow it.
  // When selection is cleared, KEEP the pinned target so gradient / color
  // edits in the open window are not wiped mid-interaction.
  if (nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings") {
    const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
    if (popover && !popover.hidden) {
      if (hasNode && typeof syncOpenNodeGraphTraceDisplaySettingsToNode === "function") {
        syncOpenNodeGraphTraceDisplaySettingsToNode(selectedNode);
      }
      // else: leave current traceDisplaySettingsTargetNode / form as-is
    }
  }

  // Parameter Settings: never auto-fill from module selection. Right-click on a
  // slider is the only way to populate. Do not blank the open form when
  // selection clears — only explicit close / open-blank does that.
  if (nodeGraphMvp.sharedInspectorActive === "metaparameters") {
    // no-op on selection change (pinned slider target is independent)
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
