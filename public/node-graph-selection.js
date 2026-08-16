function setNodeGraphSelection(selection) {
  // Finish any in-progress title/alias edit against the *current* target before
  // retargeting selection. Otherwise a focused Command Center alias (or header
  // title) keeps receiving keystrokes while lastModuleActionTarget jumps to the
  // newly clicked module — renaming modules that were never put into edit mode.
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    if (typeof nodeGraphTextBoxIsTypingElement === "function" && nodeGraphTextBoxIsTypingElement(active)) {
      // Title / area editors stay put — window chrome is not a focus target.
    } else if (active.id === "nodeSceneAliasInput" || active.id === "nodeSceneKnobTextInput") {
      try {
        active.blur();
      } catch {
        // ignore
      }
    } else if (
      active.classList?.contains("node-header-title")
      && active.dataset?.titleEditing === "1"
    ) {
      try {
        active.blur();
      } catch {
        // ignore
      }
    }
  }
  nodeGraphMvp.selected = selection;
  const selectedNode = nodeGraphSingleSelectedNodeId(selection);
  if (selectedNode && nodeGraphPatchNode(selectedNode)) {
    nodeGraphMvp.lastModuleActionTargetNode = selectedNode;
  }
  renderNodeGraphSelection();
  if (typeof nodeGraphViewportCullSyncSelection === "function") {
    nodeGraphViewportCullSyncSelection();
  }
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
    "#nodeHotkeysPage",
    "#nodeEmojiPage",
    "#nodeModuleShopView",
    "#nodeUserUiSettingsPanel",
    "#nodePatchDefaultsPanel",
    "#nodeUiDevHelper",
    "#nodePhosphorWaveformSettingsWindow",
    "#nodeCodeBoxWindow",
    "#nodeStandaloneMidiKeyboardDock",

    ".node-canvas-script-dialog",
    ".node-scene-context-menu",
    ".node-parameter-metadata-popover",
    ".node-trace-display-settings-popover",
    ".node-visibility-menu",
    ".node-module-shop-view",
    ".node-user-ui-settings-panel",
    ".node-ui-dev-helper",
    ".node-phosphor-waveform-settings-window",
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

function nodeGraphSelectionDisplaySyncKey() {
  const nodes = [...nodeGraphSelectedNodeIds()].sort().join(",");
  const wire = typeof nodeGraphWireFromSelection === "function"
    ? nodeGraphWireFromSelection()
    : null;
  const wireKey = wire ? `${wire.kind}:${wire.index}` : "";
  return `${nodes}|${wireKey}`;
}

function syncNodeGraphModuleActionTargetFromSelection() {
  const commandMenu = document.getElementById("nodeSceneContextMenu");
  const actionWindow = document.getElementById("nodeModuleActionsWindow");
  const commandMenuOpen = commandMenu && !commandMenu.hidden && commandMenu.dataset.mode !== "add";
  const actionWindowOpen = actionWindow && !actionWindow.hidden;
  if (!commandMenuOpen && !actionWindowOpen) {
    return;
  }
  const syncKey = nodeGraphSelectionDisplaySyncKey();
  const displayChanged = syncKey !== nodeGraphMvp._displayChangeSyncKey;
  nodeGraphMvp._displayChangeSyncKey = syncKey;
  // Wire redraw also calls renderNodeGraphSelection. Only retarget the
  // inspector when the actual selection changed — right-click pins a
  // context module without becoming the selection.
  if (!displayChanged) {
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
    if (displayChanged && typeof noteNodeGraphDisplayChange === "function") {
      noteNodeGraphDisplayChange();
    }
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
  if (displayChanged && typeof noteNodeGraphDisplayChange === "function") {
    noteNodeGraphDisplayChange();
  }
}

function syncNodeGraphSharedInspectorTargetFromSelection() {
  // Display Settings: follow single- or multi-select of display modules.
  // Uses schema-matched multi cohort when several faces share a form type.
  // When selection is cleared / non-display only, KEEP the pinned target so
  // gradient / color edits in the open window are not wiped mid-interaction.
  if (nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings") {
    const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
    if (popover && !popover.hidden) {
      if (typeof syncOpenNodeGraphTraceDisplaySettingsToSelection === "function") {
        syncOpenNodeGraphTraceDisplaySettingsToSelection();
      } else if (typeof syncOpenNodeGraphTraceDisplaySettingsToNode === "function") {
        // Fallback: single-select only (legacy).
        const selectedNode = nodeGraphSingleSelectedNodeId();
        if (selectedNode && nodeGraphPatchNode(selectedNode)) {
          syncOpenNodeGraphTraceDisplaySettingsToNode(selectedNode);
        }
      }
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

function nodeGraphWireSelectionKey(kind, index) {
  return `${kind || "signal"}:${Number(index)}`;
}

/** Normalize selection → [{ kind, index }, ...] for single or multi wire. */
function nodeGraphSelectedWireEntries(selection = nodeGraphMvp.selected) {
  if (selection?.type === "wire") {
    const index = Number(selection.index);
    if (!Number.isInteger(index) || index < 0) {
      return [];
    }
    return [{ kind: selection.kind || "signal", index }];
  }
  if (selection?.type === "wires" && Array.isArray(selection.items)) {
    const seen = new Set();
    const out = [];
    for (const item of selection.items) {
      const kind = item?.kind || "signal";
      const index = Number(item?.index);
      if (!Number.isInteger(index) || index < 0) {
        continue;
      }
      const key = nodeGraphWireSelectionKey(kind, index);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ kind, index });
    }
    return out;
  }
  return [];
}

function setNodeGraphWireSelection(items) {
  const entries = [];
  const seen = new Set();
  for (const item of items || []) {
    const kind = item?.kind || "signal";
    const index = Number(item?.index);
    if (!Number.isInteger(index) || index < 0) {
      continue;
    }
    const key = nodeGraphWireSelectionKey(kind, index);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({ kind, index });
  }
  if (!entries.length) {
    setNodeGraphSelection(null);
    return;
  }
  if (entries.length === 1) {
    setNodeGraphSelection({ type: "wire", kind: entries[0].kind, index: entries[0].index });
    return;
  }
  setNodeGraphSelection({ type: "wires", items: entries });
}

function selectAllNodeGraphModules() {
  setNodeGraphNodeSelection(nodeGraphMvp.patch.nodes.map((node) => node.id));
}

function toggleNodeGraphNodeSelection(id, additive = false) {
  if (!nodeGraphMvp.activeNodes.has(id)) {
    return;
  }
  const selectedNodeIds = nodeGraphSelectedNodeIds();
  if (!additive) {
    // Click (no drag) toggles: unselected → sole selection; selected → drop it.
    // Drag never reaches here — endNodeGraphNodeDrag only calls this when !moved.
    if (selectedNodeIds.has(id)) {
      selectedNodeIds.delete(id);
      setNodeGraphNodeSelection([...selectedNodeIds]);
    } else {
      setNodeGraphNodeSelection([id]);
    }
    return;
  }

  if (selectedNodeIds.has(id)) {
    // Multi-select remove only when other modules stay selected. Shift+click on
    // the sole selected module (common before Shift+arrow resize) must not
    // clear selection.
    if (selectedNodeIds.size <= 1) {
      return;
    }
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
  if (a?.type === "wires") {
    const ae = nodeGraphSelectedWireEntries(a);
    const be = nodeGraphSelectedWireEntries(b);
    if (ae.length !== be.length) {
      return false;
    }
    const keys = new Set(ae.map((e) => nodeGraphWireSelectionKey(e.kind, e.index)));
    return be.every((e) => keys.has(nodeGraphWireSelectionKey(e.kind, e.index)));
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

function nodeGraphWireEntryExists(kind, index) {
  const i = Number(index);
  const wires = (kind || "signal") === "graph"
    ? nodeGraphMvp.graphConnections
    : (kind || "signal") === "modulation"
      ? nodeGraphMvp.modulations
      : nodeGraphMvp.connections;
  return Number.isInteger(i) && i >= 0 && i < (wires?.length || 0);
}

function nodeGraphWireSelectionExists(selection = nodeGraphMvp.selected) {
  const entries = nodeGraphSelectedWireEntries(selection);
  if (!entries.length) {
    return false;
  }
  return entries.some((e) => nodeGraphWireEntryExists(e.kind, e.index));
}

function nodeGraphWireFromSelection(selection = nodeGraphMvp.selected) {
  const entries = nodeGraphSelectedWireEntries(selection);
  for (const entry of entries) {
    if (!nodeGraphWireEntryExists(entry.kind, entry.index)) {
      continue;
    }
    const kind = entry.kind || "signal";
    const wire = kind === "graph"
      ? nodeGraphMvp.graphConnections[entry.index]
      : kind === "modulation"
        ? nodeGraphMvp.modulations[entry.index]
        : nodeGraphMvp.connections[entry.index];
    return { kind, index: entry.index, wire };
  }
  return null;
}

function nodeGraphWireSelectionLabel(selection = nodeGraphMvp.selected) {
  const entries = typeof nodeGraphSelectedWireEntries === "function"
    ? nodeGraphSelectedWireEntries(selection)
    : [];
  if (entries.length > 1) {
    return `${entries.length} wires`;
  }
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
  if (selection.type === "wire" || selection.type === "wires") {
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
  if (selection.type === "wire" || selection.type === "wires") {
    const count = nodeGraphSelectedWireEntries(selection).filter((e) =>
      nodeGraphWireEntryExists(e.kind, e.index),
    ).length;
    if (count <= 0) {
      return nodeGraphTooltipText("actions.deleteWireMissing");
    }
    if (count === 1) {
      return nodeGraphTooltipText("actions.deleteWireShort");
    }
    return `Delete ${count} wires`;
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
  if (selection.type === "wire" || selection.type === "wires") {
    const valid = nodeGraphSelectedWireEntries(selection).filter((e) =>
      nodeGraphWireEntryExists(e.kind, e.index),
    );
    if (!valid.length) {
      setNodeGraphSelection(null);
      return;
    }
    if (valid.length !== nodeGraphSelectedWireEntries(selection).length) {
      setNodeGraphWireSelection(valid);
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
  const frameDirty = [];
  for (const node of document.querySelectorAll(".dsp-node")) {
    const wantSelected = selectedNodeIds.has(node.dataset.node);
    const wasSelected = node.classList.contains("selected");
    node.classList.toggle("selected", wantSelected);
    // Selected stroke uses rounded path corners — rebuild when selection flips.
    if (wasSelected !== wantSelected) {
      frameDirty.push(node);
    }
  }
  if (frameDirty.length) {
    for (const node of frameDirty) {
      delete node.dataset.moduleFrameFp;
      // Synchronous rebuild so rounded selected stroke appears this frame
      // (rAF schedule could be coalesced away under heavy UI work).
      if (typeof updateNodeGraphModuleFrame === "function") {
        updateNodeGraphModuleFrame(node);
      } else if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
        scheduleNodeGraphModuleFramesUpdate({ force: true, nodeElement: node });
      }
    }
  }

  const selectedWireKeys = new Set(
    nodeGraphSelectedWireEntries().map((e) => nodeGraphWireSelectionKey(e.kind, e.index)),
  );
  for (const path of document.querySelectorAll(".node-wire-path")) {
    const key = nodeGraphWireSelectionKey(
      path.dataset.connectionKind || "signal",
      Number(path.dataset.connectionIndex),
    );
    path.classList.toggle("selected", selectedWireKeys.has(key));
  }

  for (const item of document.querySelectorAll("[data-connection-row-index]")) {
    const key = nodeGraphWireSelectionKey(
      item.dataset.connectionRowKind || "signal",
      Number(item.dataset.connectionRowIndex),
    );
    item.classList.toggle("selected", selectedWireKeys.has(key));
  }
  renderNodeGraphExecutionSummarySelection();

  const canDelete = nodeGraphSelectionCanDelete();
  const deleteTitle = nodeGraphDeleteTitle();
  for (const id of ["nodeDeleteButton", "nodeSceneHistoryDeleteButton"]) {
    const button = document.getElementById(id);
    if (!button) {
      continue;
    }
    button.disabled = !canDelete;
    button.title = deleteTitle;
  }

  syncNodeGraphModuleActionTargetFromSelection();
  syncNodeGraphSharedInspectorTargetFromSelection();
  setNodeInteractionHelp(nodeInteractionHelpText(document.activeElement));
}

function selectNodeGraphWire(event, index, kind = "signal") {
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    event?.stopPropagation?.();
    return;
  }
  event.stopPropagation();
  setNodeGraphSelection({ type: "wire", kind, index });
}
