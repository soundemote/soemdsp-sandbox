function defaultNodeGraphModuleGridPoint(type) {
  const count = nodeGraphMvp.nodeTypeCounts[type] || 1;
  return {
    gx: 3 + count * 2,
    gy: 3 + count * 2,
  };
}

function ensureNodeGraphLiveInputModule() {
  if (nodeGraphMvp.patch.nodes.some((node) => node.type === "audioInput")) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  const id = counts.audioInput > 0 ? `audioInput-${counts.audioInput + 1}` : "audioInput";
  const gridPoint = nodeGraphFindFreeModuleGridPoint("audioInput", patch.nodes, { gx: 0, gy: 1 });
  patch.nodes.push(createNodeGraphPatchNode("audioInput", {
    id,
    gx: gridPoint.gx,
    gy: gridPoint.gy,
  }));
  commitNodeGraphPatch(patch, { status: "input module shown" });
  return true;
}

function nodeGraphFindFreeModuleGridPoint(type, nodes = nodeGraphMvp.patch.nodes, preferred = null) {
  const start = preferred || defaultNodeGraphModuleGridPoint(type);
  for (let rowOffset = 0; rowOffset < 200; rowOffset += 1) {
    const candidate = {
      gx: start.gx,
      gy: start.gy + rowOffset,
      type,
    };
    const rect = nodeGraphPatchNodeGridRect(candidate);
    const overlaps = nodes.some((node) => nodeGraphGridRectsOverlap(rect, nodeGraphPatchNodeGridRect(node)));
    if (!overlaps) {
      return { gx: candidate.gx, gy: candidate.gy };
    }
  }
  return { gx: start.gx, gy: start.gy + 200 };
}

function nodeGraphPatchNodeGridRect(node) {
  return {
    bottom: node.gy + nodeGraphPatchNodeGridHeightUnits(node),
    left: node.gx,
    right: node.gx + nodeGraphPatchNodeGridWidthUnits(node),
    top: node.gy,
  };
}

function nodeGraphGridRectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function nodeGraphFindCopiedModuleGridPoint(sourceNode, nodes = nodeGraphMvp.patch.nodes) {
  const sourceRect = nodeGraphPatchNodeGridRect(sourceNode);
  const candidate = {
    gx: sourceNode.gx,
    gy: sourceRect.bottom + 1,
  };
  const maxSearchRows = 200;

  for (let offset = 0; offset < maxSearchRows; offset += 1) {
    const rect = nodeGraphPatchNodeGridRect({
      gx: candidate.gx,
      gy: candidate.gy + offset,
      type: sourceNode.type,
    });
    const overlaps = nodes.some((node) => nodeGraphGridRectsOverlap(rect, nodeGraphPatchNodeGridRect(node)));
    if (!overlaps) {
      return { gx: candidate.gx, gy: candidate.gy + offset };
    }
  }

  return { gx: candidate.gx, gy: candidate.gy + maxSearchRows };
}

function showNodeGraphModule(node, point = null, options = {}) {
  const type = node;
  if (!Object.hasOwn(nodeGraphModuleDefinitions, type)) {
    return "";
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  counts[type] = (counts[type] || 0) + 1;
  const id = `${type}-${counts[type]}`;
  const gridPoint = point ? nodeGraphPixelToGrid(point) : defaultNodeGraphModuleGridPoint(type);
  // Group Input/Output are meaningless until named (their name becomes the
  // matching port's name on the outer group box, see
  // nodeGraphModuleGroupEndpointName) -- default to "Input N"/"Output N"
  // right at creation, counted against the patch actually being edited
  // (counts[type], already computed above from patch.nodes), so a fresh
  // one is never left blank/generic until someone remembers to rename it.
  // Only this fresh-creation path gets it: duplicate/copy and group-expand
  // explicitly pass through the source node's own alias instead of calling
  // showNodeGraphModule, so a copy keeps its original name rather than
  // being renumbered.
  const defaultAlias = type === "groupInput" ? `Input ${counts[type]}`
    : type === "groupOutput" ? `Output ${counts[type]}`
    : undefined;
  patch.nodes.push(createNodeGraphPatchNode(type, {
    id,
    gx: gridPoint.gx,
    gy: gridPoint.gy,
    ...(defaultAlias ? { alias: defaultAlias } : {}),
  }));
  commitNodeGraphPatch(patch, { status: options.status || "module added" });
  return id;
}

function showPaletteNode(node) {
  showNodeGraphModule(node);
}

// Double-clicking empty canvas is a fast path to a Text Box: spawn one at the
// click point, then open its module actions window with the text field
// focused -- the same edit surface a manual double-click on an existing text
// box already opens (see .node-text-box-input's dblclick -> openNodeModuleActionMenu).
function handleNodeGraphWorkspaceDoubleClickToAddTextBox(event) {
  if (!nodeGraphEventTargetIsEmptyWorkspaceArea(event)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const point = nodeGraphClientPoint(event);
  const nodeId = showNodeGraphModule("textBox", point, { status: "text box added" });
  if (!nodeId) {
    return;
  }
  setNodeGraphNodeSelection([nodeId]);
  ensureNodeGraphModuleActionsWindowBody();
  nodeGraphMvp.sceneContextPoint = null;
  nodeGraphMvp.sceneContextTargetNode = nodeId;
  nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  nodeGraphMvp.sceneContextTargetWire = null;
  configureNodeSceneContextMenu("module");
  showNodeModuleActionsWindow({
    bottom: event.clientY,
    left: event.clientX,
    right: event.clientX,
    top: event.clientY,
  });
  const textInput = document.getElementById("nodeSceneTextBoxTextInput");
  if (textInput) {
    textInput.focus();
    textInput.select();
  }
}

function addNodeGraphModuleFromContext(event) {
  const type = event.currentTarget.dataset.contextModule;
  beginNodeGraphModulePlacement(type, nodeGraphMvp.sceneContextPoint);
  closeNodeSceneContextMenu();
}

function addNodeGraphModuleFromShop(button) {
  const type = button.dataset.contextModule;
  if (!type) {
    return;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const rect = workspace?.getBoundingClientRect?.();
  const point = rect
    ? nodeGraphClientPoint({
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
    })
    : nodeGraphMvp.sceneContextPoint;
  const nodeId = showNodeGraphModule(type, point, { status: "module added" });
  if (nodeId) {
    setNodeGraphNodeSelection([nodeId]);
  }
  nodeGraphMvp.sceneContextPoint = null;
}

function nodeGraphClientPointInsideWorkspace(event) {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace || workspace.hidden) {
    return false;
  }
  const rect = workspace.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function cancelNodeGraphModulePlacement(status = "module placement cancelled") {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.nodeId) {
    nodeGraphMvp.modulePlacement = null;
    return false;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  patch.nodes = patch.nodes.filter((node) => node.id !== placement.nodeId);
  patch.connections = patch.connections.filter((connection) =>
    connection.sourceNode !== placement.nodeId && connection.destinationNode !== placement.nodeId
  );
  patch.modulations = patch.modulations.filter((modulation) =>
    modulation.sourceNode !== placement.nodeId && modulation.destinationNode !== placement.nodeId
  );
  patch.bypassedNodes = (patch.bypassedNodes || []).filter((nodeId) => nodeId !== placement.nodeId);
  nodeGraphMvp.modulePlacement = null;
  commitNodeGraphPatch(patch, { status });
  clearNodeGraphSelection();
  return true;
}

function nodeGraphModulePlacementPixelFromCursor(cursorPoint, element) {
  const width = element?.offsetWidth || nodeGraphGridWidth() * 6;
  const height = element?.offsetHeight || nodeGraphGridHeight() * 6;
  return {
    x: cursorPoint.x - width * 0.5,
    y: cursorPoint.y - Math.min(height * 0.45, nodeGraphGridHeight() * 3),
  };
}

function positionNodeGraphPendingModuleAtCursor(cursorPoint) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement) {
    return false;
  }
  const element = nodeGraphNodeElement(placement.nodeId);
  if (!element) {
    nodeGraphMvp.modulePlacement = null;
    return false;
  }
  const point = nodeGraphModulePlacementPixelFromCursor(cursorPoint, element);
  positionNodeGraphNode(element, point, { clamp: false, snap: false });
  placement.cursorPoint = cursorPoint;
  placement.point = point;
  drawNodeGraphWires();
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

function beginNodeGraphModulePlacement(type, point = null) {
  if (!type || !Object.hasOwn(nodeGraphModuleDefinitions, type)) {
    return "";
  }
  if (nodeGraphMvp.modulePlacement?.nodeId) {
    cancelNodeGraphModulePlacement();
  }

  const cursorPoint = point || nodeGraphGridToPixel(defaultNodeGraphModuleGridPoint(type));
  const id = showNodeGraphModule(type, cursorPoint, { status: "module ghost: release in modular view" });
  if (!id) {
    return "";
  }

  const element = nodeGraphNodeElement(id);
  nodeGraphMvp.modulePlacement = {
    cursorPoint,
    nodeId: id,
    point: cursorPoint,
    pointerId: null,
    type,
  };
  element?.classList.add("placing", "dragging");
  setNodeGraphNodeSelection([id]);
  positionNodeGraphPendingModuleAtCursor(cursorPoint);
  return id;
}

function beginNodeGraphModuleStorePointerPlacement(event) {
  if (event.button !== undefined && event.button !== 0) {
    return false;
  }
  const addButton = event.target.closest("[data-context-module]");
  if (!addButton) {
    return false;
  }
  const type = addButton.dataset.contextModule;
  const nodeId = beginNodeGraphModulePlacement(type, nodeGraphClientPoint(event));
  if (!nodeId) {
    return false;
  }
  nodeGraphMvp.modulePlacement.pointerId = event.pointerId ?? null;
  nodeGraphMvp.modulePlacement.sourceElement = addButton;
  addButton.classList.add("placing-module");
  addButton.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function finishNodeGraphModulePlacementAtCurrentPosition(status = "module placed") {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.nodeId) {
    return false;
  }
  const element = nodeGraphNodeElement(placement.nodeId);
  if (!element) {
    nodeGraphMvp.modulePlacement = null;
    return false;
  }

  element.classList.remove("placing", "dragging");
  const x = Number.parseFloat(element.style.getPropertyValue("--node-x")) || 0;
  const y = Number.parseFloat(element.style.getPropertyValue("--node-y")) || 0;
  const gridPoint = nodeGraphPixelToGrid({ x, y });
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const patchNode = patch.nodes.find((candidate) => candidate.id === placement.nodeId);
  if (patchNode) {
    patchNode.gx = gridPoint.gx;
    patchNode.gy = gridPoint.gy;
  }
  nodeGraphMvp.modulePlacement = null;
  commitNodeGraphPatch(patch, { status });
  clearNodeGraphSelection();
  return true;
}

function dragNodeGraphModulePlacement(event) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement) {
    return;
  }
  if (
    placement.pointerId !== null &&
    event.pointerId !== undefined &&
    placement.pointerId !== event.pointerId
  ) {
    return;
  }
  positionNodeGraphPendingModuleAtCursor(nodeGraphClientPoint(event));
}

function completeNodeGraphModulePlacement(event) {
  if (!nodeGraphMvp.modulePlacement) {
    return false;
  }
  if (event.button !== undefined && event.button !== 0) {
    return false;
  }
  positionNodeGraphPendingModuleAtCursor(nodeGraphClientPoint(event));
  finishNodeGraphModulePlacementAtCurrentPosition();
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function releaseNodeGraphModuleStorePointerPlacement(event) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement) {
    return false;
  }
  if (
    placement.pointerId !== null &&
    event.pointerId !== undefined &&
    placement.pointerId !== event.pointerId
  ) {
    return false;
  }
  positionNodeGraphPendingModuleAtCursor(nodeGraphClientPoint(event));
  placement.sourceElement?.classList.remove("placing-module");
  if (event.pointerId !== undefined && placement.sourceElement?.hasPointerCapture?.(event.pointerId)) {
    placement.sourceElement.releasePointerCapture(event.pointerId);
  }
  const placed = nodeGraphClientPointInsideWorkspace(event)
    ? finishNodeGraphModulePlacementAtCurrentPosition()
    : cancelNodeGraphModulePlacement();
  event.preventDefault();
  event.stopPropagation();
  return placed;
}

function cancelNodeGraphModuleStorePointerPlacement(event) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement) {
    return false;
  }
  if (
    placement.pointerId !== null &&
    event?.pointerId !== undefined &&
    placement.pointerId !== event.pointerId
  ) {
    return false;
  }
  placement.sourceElement?.classList.remove("placing-module");
  if (event?.pointerId !== undefined && placement.sourceElement?.hasPointerCapture?.(event.pointerId)) {
    placement.sourceElement.releasePointerCapture(event.pointerId);
  }
  cancelNodeGraphModulePlacement();
  event?.preventDefault?.();
  event?.stopPropagation?.();
  return true;
}

function handleNodeGraphModuleStoreClick(event) {
  const addButton = event.target.closest("[data-context-module]");
  if (addButton) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const deleteGroupButton = event.target.closest("[data-delete-group]");
  if (deleteGroupButton) {
    event.preventDefault();
    event.stopPropagation();
    deleteNodeGraphModuleGroupLocal(deleteGroupButton.dataset.deleteGroup);
    return;
  }
  const groupButton = event.target.closest("[data-context-group]");
  if (groupButton) {
    addNodeGraphModuleGroupFromBrowser(groupButton.dataset.contextGroup);
    return;
  }
  const toggleButton = event.target.closest("[data-store-toggle-module]");
  if (toggleButton) {
    setNodeGraphModuleCatalogVisibility(
      toggleButton.dataset.storeToggleModule,
      toggleButton.dataset.visible === "true",
      toggleButton.dataset.storeToggleShelf,
    );
  }
}

function handleNodeGraphModuleStoreKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const addButton = event.target.closest("[data-context-module]");
  if (!addButton) {
    return;
  }
  event.preventDefault();
  addNodeGraphModuleFromShop(addButton);
}

function nodeGraphModuleGroupSelection() {
  const targetNodeId = nodeGraphModuleActionTargetNodeId();
  const selectedIds = [...nodeGraphSelectedNodeIds()].filter((id) => nodeGraphPatchNode(id));
  return selectedIds.length ? selectedIds : targetNodeId ? [targetNodeId] : [];
}

function nodeGraphModuleActionTargetNodeIds() {
  return [...new Set(nodeGraphModuleGroupSelection())].filter((id) => nodeGraphPatchNode(id));
}

function saveNodeGraphSelectionAsModuleGroup() {
  setNodeGraphScriptStatus("module grouping is under construction", false);
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("Add to group under construction. Module grouping is under construction.");
  }
  return;
  const selectedIds = new Set(nodeGraphModuleGroupSelection());
  const selectionActive = selectedIds.size > 0;
  const sourceNodes = nodeGraphMvp.patch.nodes.filter((node) =>
    (selectionActive ? selectedIds.has(node.id) : node.type !== "output") &&
    node.type !== "output"
  );
  if (!sourceNodes.length) {
    return;
  }
  if (!sourceNodes.some((node) => node.type === "groupInput") || !sourceNodes.some((node) => node.type === "groupOutput")) {
    setNodeGraphScriptStatus("module group needs Group Input and Group Output", false);
    return;
  }
  const names = sourceNodes.map((node) => nodeGraphNodeDisplayName(node.id)).join(" + ");
  const groupName = names.length > 48 ? `${names.slice(0, 45)}...` : names;
  const sourceNodeIds = new Set(sourceNodes.map((node) => node.id));
  const sourcePatch = validateNodeGraphPatch({
    ...cloneNodeGraphPatch(nodeGraphMvp.patch),
    bypassedNodes: (nodeGraphMvp.patch.bypassedNodes || []).filter((nodeId) => sourceNodeIds.has(nodeId)),
    connections: nodeGraphMvp.patch.connections
      .filter((connection) => sourceNodeIds.has(connection.sourceNode) && sourceNodeIds.has(connection.destinationNode))
      .map((connection) => ({ ...connection })),
    modulations: nodeGraphMvp.patch.modulations
      .filter((modulation) => sourceNodeIds.has(modulation.sourceNode) && sourceNodeIds.has(modulation.destinationNode))
      .map((modulation) => ({ ...modulation })),
    nodes: sourceNodes,
    uiItems: [],
  });
  const inferred = nodeGraphModuleGroupInterfaceFromPatch(sourcePatch);
  const groups = loadNodeGraphModuleGroupsLocal();
  // groupName is auto-derived from the selected nodes' display names, so
  // two DIFFERENT selections (e.g. plain default-labeled Group Input +
  // Group Output pairs from separate test runs) can easily produce the
  // exact same string and silently clobber an unrelated saved group with
  // zero indication anything happened -- no new card, no overwrite
  // warning. De-duping here means "Add to group" always produces a new,
  // distinct entry; nothing is ever silently replaced. Explicit deletion
  // (deleteNodeGraphModuleGroupLocal) is the only way to remove one.
  let finalName = groupName;
  let suffix = 2;
  while (Object.hasOwn(groups, finalName)) {
    finalName = `${groupName} (${suffix})`;
    suffix += 1;
  }
  groups[finalName] = {
    createdAt: new Date().toISOString(),
    defaultSize: { heightGu: 6, widthGu: 8 },
    description: "",
    id: `group-${nodeGraphStableSeed(`${finalName}:${Date.now()}`).toString(16)}`,
    inputs: inferred.inputs,
    kind: "moduleGroup",
    name: finalName,
    outputs: inferred.outputs,
    parameters: [],
    sourcePatch,
    // Legacy expansion fields stay for compatibility with older saved circuit UI code.
    nodes: sourceNodes.map((node) => ({
      ...node,
      paramMeta: cloneNodeGraphParamMeta(node.paramMeta),
      params: { ...(node.params || {}) },
    })),
    connections: nodeGraphMvp.patch.connections
      .filter((connection) => selectedIds.has(connection.sourceNode) && selectedIds.has(connection.destinationNode))
      .map((connection) => ({ ...connection })),
    modulations: nodeGraphMvp.patch.modulations
      .filter((modulation) => selectedIds.has(modulation.sourceNode) && selectedIds.has(modulation.destinationNode))
      .map((modulation) => ({ ...modulation })),
  };
  saveNodeGraphModuleGroupsLocal(groups);
  renderNodeGraphModuleStoreCatalog();
  configureNodeSceneContextMenu("module");
  setNodeGraphScriptStatus(`saved module group "${finalName}" -- find it in the Module Browser's Portals section to add it to the scene`, true);
}

function deleteNodeGraphModuleGroupLocal(name) {
  const groups = loadNodeGraphModuleGroupsLocal();
  if (!Object.hasOwn(groups, name)) {
    return;
  }
  delete groups[name];
  saveNodeGraphModuleGroupsLocal(groups);
  renderNodeGraphModuleStoreCatalog();
  setNodeGraphScriptStatus(`deleted module group "${name}"`, true);
}

function addNodeGraphModuleGroupFromBrowser(name) {
  const group = loadNodeGraphModuleGroupsLocal()[name];
  if (!group?.nodes?.length && !group?.sourcePatch?.nodes?.length) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  if (group.kind === "moduleGroup" && group.sourcePatch) {
    counts.moduleGroup = (counts.moduleGroup || 0) + 1;
    const moduleGroup = normalizeNodeGraphModuleGroup(group);
    const anchor = nodeGraphMvp.sceneContextPoint
      ? nodeGraphPixelToGrid(nodeGraphMvp.sceneContextPoint)
      : defaultNodeGraphModuleGridPoint("moduleGroup");
    patch.nodes.push(createNodeGraphPatchNode("moduleGroup", {
      gx: anchor.gx,
      gy: anchor.gy,
      id: `moduleGroup-${counts.moduleGroup}`,
      moduleGroup,
      widthGu: moduleGroup.defaultSize.widthGu,
    }));
    setNodeGraphViewMode("modular");
    commitNodeGraphPatch(patch, { status: "module group added" });
    return;
  }
  const sourceNodes = group.nodes.filter((node) => Object.hasOwn(nodeGraphModuleDefinitions, node.type));
  if (!sourceNodes.length) {
    return;
  }
  const minGx = Math.min(...sourceNodes.map((node) => Number(node.gx) || 0));
  const minGy = Math.min(...sourceNodes.map((node) => Number(node.gy) || 0));
  const anchor = nodeGraphMvp.sceneContextPoint
    ? nodeGraphPixelToGrid(nodeGraphMvp.sceneContextPoint)
    : defaultNodeGraphModuleGridPoint(sourceNodes[0].type);
  const idMap = {};
  for (const sourceNode of sourceNodes) {
    counts[sourceNode.type] = (counts[sourceNode.type] || 0) + 1;
    const id = `${sourceNode.type}-${counts[sourceNode.type]}`;
    idMap[sourceNode.id] = id;
    const sizingOptions = {
      ...(Object.hasOwn(sourceNode, "widthGu") ? { widthGu: sourceNode.widthGu } : {}),
    };
    patch.nodes.push({
      ...createNodeGraphPatchNode(sourceNode.type, {
        alias: sourceNode.alias,
        gx: anchor.gx + ((Number(sourceNode.gx) || 0) - minGx),
        gy: anchor.gy + ((Number(sourceNode.gy) || 0) - minGy),
        id,
        layout: sourceNode.layout,
        graph: sourceNode.graph,
        codeblock: sourceNode.codeblock,
        ui: sourceNode.ui,
        ...sizingOptions,
      }),
      ...(nodeGraphModuleIsGraphType(sourceNode.type)
        ? { graph: nodeGraphGraphForNode(sourceNode) }
        : {}),
      ...(sourceNode.type === "codeblock"
        ? { codeblock: normalizeNodeGraphCodeblock(sourceNode.codeblock) }
        : {}),
      paramMeta: cloneNodeGraphParamMeta(sourceNode.paramMeta),
      params: { ...(sourceNode.params || {}) },
    });
  }
  patch.connections.push(...(group.connections || [])
    .filter((connection) => idMap[connection.sourceNode] && idMap[connection.destinationNode])
    .map((connection) => ({
      ...connection,
      destinationNode: idMap[connection.destinationNode],
      sourceNode: idMap[connection.sourceNode],
    })));
  patch.modulations.push(...(group.modulations || [])
    .filter((modulation) => idMap[modulation.sourceNode] && idMap[modulation.destinationNode])
    .map((modulation) => ({
      ...modulation,
      destinationNode: idMap[modulation.destinationNode],
      sourceNode: idMap[modulation.sourceNode],
    })));
  setNodeGraphViewMode("modular");
  commitNodeGraphPatch(patch, { status: "group added" });
}

function copyNodeGraphModule(sourceNode) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  counts[sourceNode.type] = (counts[sourceNode.type] || 0) + 1;
  const id = `${sourceNode.type}-${counts[sourceNode.type]}`;
  const gridPoint = nodeGraphFindCopiedModuleGridPoint(sourceNode, patch.nodes);
  patch.nodes.push({
    ...createNodeGraphPatchNode(sourceNode.type, {
      alias: sourceNode.alias,
      gx: gridPoint.gx,
      gy: gridPoint.gy,
      id,
      layout: sourceNode.layout,
      led: sourceNode.led,
      graph: sourceNode.graph,
      codeblock: sourceNode.codeblock,
      ui: sourceNode.ui,
      ...(Object.hasOwn(sourceNode, "widthGu") ? { widthGu: sourceNode.widthGu } : {}),
    }),
    ...(nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)
      ? { layout: normalizeNodeGraphTextBoxLayout(sourceNode.layout) }
      : {}),
    ...(sourceNode.type === "image"
      ? { layout: normalizeNodeGraphImageLayout(sourceNode.layout) }
      : {}),
    ...(sourceNode.type === "led"
      ? { led: normalizeNodeGraphLedLayout(sourceNode.led) }
      : {}),
    ...(nodeGraphModuleIsGraphType(sourceNode.type)
      ? { graph: nodeGraphGraphForNode(sourceNode) }
      : {}),
    ...(sourceNode.type === "codeblock"
      ? { codeblock: normalizeNodeGraphCodeblock(sourceNode.codeblock) }
      : {}),
    ...(sourceNode.type === "customDisplay"
      ? { customDisplay: normalizeNodeGraphCustomDisplay(sourceNode.customDisplay) }
      : {}),
    paramMeta: cloneNodeGraphParamMeta(sourceNode.paramMeta),
    params: { ...(sourceNode.params || {}) },
  });
  commitNodeGraphPatch(patch, { status: "module copied" });
  return id;
}

function copyNodeGraphModuleFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (sourceNode && sourceNode.type !== "output") {
    const copiedNodeId = copyNodeGraphModule(sourceNode);
    if (copiedNodeId) {
      nodeGraphMvp.sceneContextTargetNode = copiedNodeId;
      setNodeGraphNodeSelection([copiedNodeId]);
    }
  }
  configureNodeSceneContextMenu("module");
}

// The subset of a node's fields that count as "settings" for the Copy
// Settings / Paste Settings / Set as Default actions -- everything about a
// module except its grid position/id/type. Deliberately excludes
// `moduleGroup` (a full nested sub-patch) and `clap` (a plugin instance
// binding) since those aren't meaningfully "default-able" per module type.
const nodeGraphModuleSettingsFields = Object.freeze([
  "alias",
  "widthGu",
  "ui",
  "layout",
  "led",
  "graph",
  "codeblock",
  "customDisplay",
  "canvasScript",
  "screenSpaceShader",
  "scopeShader",
  "paramMeta",
  "params",
]);

function nodeGraphModuleSettingsSnapshot(node) {
  const snapshot = {};
  for (const field of nodeGraphModuleSettingsFields) {
    if (Object.hasOwn(node, field)) {
      snapshot[field] = JSON.parse(JSON.stringify(node[field]));
    }
  }
  return snapshot;
}

// Re-runs the settings through createNodeGraphPatchNode so every field gets
// the same normalization/validation a freshly-created node would get.
function applyNodeGraphModuleSettingsSnapshot(targetNode, snapshot) {
  const merged = createNodeGraphPatchNode(targetNode.type, {
    id: targetNode.id,
    gx: targetNode.gx,
    gy: targetNode.gy,
    ...snapshot,
  });
  for (const field of nodeGraphModuleSettingsFields) {
    if (Object.hasOwn(merged, field)) {
      targetNode[field] = merged[field];
    } else {
      delete targetNode[field];
    }
  }
}

function copyNodeGraphModuleSettingsFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }
  nodeGraphMvp.moduleSettingsClipboard = {
    type: sourceNode.type,
    settings: nodeGraphModuleSettingsSnapshot(sourceNode),
  };
  setNodeInteractionHelp(`${nodeGraphNodeDisplayName(sourceNode.id)} settings copied.`);
  configureNodeSceneContextMenu("module");
}

function pasteNodeGraphModuleSettingsFromContext() {
  const clipboard = nodeGraphMvp.moduleSettingsClipboard;
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!clipboard || !sourceNode) {
    return;
  }
  if (clipboard.type !== sourceNode.type) {
    setNodeInteractionHelp(`Can't paste: clipboard holds ${clipboard.type} settings, not ${sourceNode.type}.`);
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  applyNodeGraphModuleSettingsSnapshot(targetNode, clipboard.settings);
  commitNodeGraphPatch(patch, { status: "module settings pasted" });
  configureNodeSceneContextMenu("module");
}

async function setNodeGraphModuleSettingsAsDefaultFromButton(event) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget, () => {
    setNodeInteractionHelp(`Click again to save these settings as the default for new ${sourceNode.type} modules.`);
  }, { confirmText: "Confirm Default" })) {
    return;
  }
  nodeGraphMvp.moduleDefaultOverrides = {
    ...nodeGraphMvp.moduleDefaultOverrides,
    [sourceNode.type]: nodeGraphModuleSettingsSnapshot(sourceNode),
  };
  saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  flashNodeGraphDefaultButtonSaved(event.currentTarget);
  setNodeInteractionHelp(`Default settings saved for ${sourceNode.type}.`);
}

function addNodeGraphModuleToUiFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const uiItems = normalizeNodeGraphPatchUiItems(patch.uiItems);
  if (uiItems.some((item) => item.sourceNodeId === sourceNode.id)) {
    closeNodeSceneContextMenu();
    setNodeGraphViewMode("ui");
    return;
  }
  const nextIndex = uiItems.length + 1;
  const idBase = `ui-${sourceNode.id}`.replace(/[^a-z0-9_-]/gi, "-").slice(0, 58) || "ui-module";
  let id = idBase;
  let suffix = 2;
  const existingIds = new Set(uiItems.map((item) => item.id));
  while (existingIds.has(id)) {
    id = `${idBase}-${suffix}`;
    suffix += 1;
  }
  const type = nodeGraphUiItemTypeForNode(sourceNode);
  uiItems.push({
    h: type === "graphEditor" ? 260 : 44,
    id,
    label: nodeGraphPatchNodeTitle(sourceNode),
    sourceNodeId: sourceNode.id,
    type,
    w: type === "graphEditor" ? 460 : 132,
    x: 24 + ((nextIndex - 1) % 4) * 156,
    y: 24 + Math.floor((nextIndex - 1) / 4) * (type === "graphEditor" ? 284 : 68),
  });
  patch.uiItems = uiItems;
  commitNodeGraphPatch(patch, { status: "module added to ui view" });
  closeNodeSceneContextMenu();
  setNodeGraphViewMode("ui");
}

function deleteNodeGraphSelectionFromContext() {
  if (!nodeGraphMvp.selected && nodeGraphModuleActionTargetNodeId()) {
    setNodeGraphSelection({ type: "node", id: nodeGraphModuleActionTargetNodeId() });
  }
  deleteSelectedNodeGraphItem();
  const commandMenu = document.getElementById("nodeSceneContextMenu");
  const actionWindow = document.getElementById("nodeModuleActionsWindow");
  if ((!commandMenu || commandMenu.hidden) && (!actionWindow || actionWindow.hidden)) {
    return;
  }
  if (nodeGraphMvp.selected?.type === "wire") {
    configureNodeSceneContextMenu("wire");
  } else if (nodeGraphSelectedNodeIds().size) {
    configureNodeSceneContextMenu("module");
  } else {
    configureNodeSceneContextMenu(commandMenu?.dataset?.mode === "wire" ? "wire" : "module");
  }
}

function adjustNodeGraphModuleWidthFromContext(delta) {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const currentWidthGu = nodeGraphPatchNodeGridWidthUnits(targetNode);
    const nextWidthGu = normalizeNodeGraphModuleWidthUnits(targetNode.type, currentWidthGu + delta);
    if (nextWidthGu === currentWidthGu) {
      continue;
    }
    const defaultWidthGu = nodeGraphDefaultModuleGridWidthUnits(targetNode.type);
    if (nextWidthGu === defaultWidthGu) {
      delete targetNode.widthGu;
    } else {
      targetNode.widthGu = nextWidthGu;
    }
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, { status: changedCount > 1 ? "module widths changed" : "module width changed" });
  }
  configureNodeSceneContextMenu("module");
}

function adjustNodeGraphModuleDisplayHeightFromContext(delta) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  // Resize applies to any display AREA -- oscilloscope or custom UI (e.g.
  // xyPad's pad); the show/hide toggle below stays oscilloscope-only.
  if (!sourceNode || !nodeGraphPatchNodeHasResizableDisplayArea(sourceNode)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphPatchNodeHasResizableDisplayArea(targetNode)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  const nextOffsetGu = normalizeNodeGraphModuleDisplayHeightOffsetUnits(
    targetNode.type,
    ui.displayHeightOffsetGu + delta * nodeGraphModuleDisplayHeightLimits.stepGu,
  );
  if (nextOffsetGu === ui.displayHeightOffsetGu) {
    configureNodeSceneContextMenu("module");
    return;
  }
  ui.displayHeightOffsetGu = nextOffsetGu;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, { status: "module display height changed" });
  configureNodeSceneContextMenu("module");
}

function adjustNodeGraphTextBoxTextSizeFromContext(delta) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const currentLayout = normalizeNodeGraphTextBoxLayout(targetNode.layout);
  const nextTextSizePercent = normalizeNodeGraphTextBoxTextSizePercent(
    currentLayout.textSizePercent + delta,
  );
  if (nextTextSizePercent === currentLayout.textSizePercent) {
    configureNodeSceneContextMenu("module");
    return;
  }
  targetNode.layout = normalizeNodeGraphTextBoxLayout({
    ...currentLayout,
    textSizePercent: nextTextSizePercent,
  });
  commitNodeGraphPatch(patch, { status: "text box text size changed" });
  configureNodeSceneContextMenu("module");
}

function adjustNodeGraphTextBoxHeightFromContext(delta) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || nodeGraphModuleSizingCapabilities(sourceNode.type).moduleHeight !== "textBox") {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || nodeGraphModuleSizingCapabilities(targetNode.type).moduleHeight !== "textBox") {
    return;
  }
  const currentHeightGu = nodeGraphPatchNodeGridHeightUnits(targetNode);
  const nextHeightGu = normalizeNodeGraphTextBoxHeightUnits(currentHeightGu + delta);
  if (nextHeightGu === currentHeightGu) {
    configureNodeSceneContextMenu("module");
    return;
  }
  const defaultHeightGu = nodeGraphModuleGridHeightUnitsForUi("textBox", targetNode.ui);
  if (nextHeightGu === defaultHeightGu) {
    delete targetNode.heightGu;
  } else {
    targetNode.heightGu = nextHeightGu;
  }
  commitNodeGraphPatch(patch, { status: "text box height changed" });
  configureNodeSceneContextMenu("module");
}

// Commits an inline edit made directly in a module's header title field
// (see createNodeGraphModuleHeader) to node.alias -- same normalize/commit
// as the context-menu alias field (setNodeGraphModuleAliasFromContext),
// just addressed by node id instead of reading the currently-targeted
// context-menu node, since the header input can be edited without the
// context menu open at all.
function commitNodeGraphModuleTitleFromHeaderInput(nodeId, value) {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === nodeId);
  if (!targetNode) {
    return;
  }
  const alias = normalizeNodeGraphPatchNodeAlias(value);
  if (alias) {
    targetNode.alias = alias;
  } else {
    delete targetNode.alias;
  }
  commitNodeGraphPatch(patch, {
    status: alias ? "module title changed" : "module title cleared",
  });
}

function setNodeGraphModuleAliasFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }
  const input = document.getElementById("nodeSceneAliasInput");
  const selectionStart = input?.selectionStart ?? null;
  const selectionEnd = input?.selectionEnd ?? selectionStart;
  const alias = normalizeNodeGraphPatchNodeAlias(input?.value);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  if (alias) {
    targetNode.alias = alias;
  } else {
    delete targetNode.alias;
  }
  commitNodeGraphPatch(patch, {
    record,
    status: alias ? "module alias changed" : "module alias cleared",
  });
  if (document.activeElement === input) {
    input.focus();
    if (selectionStart !== null) {
      input.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
}

function nodeGraphGraphTargetFromContext(patch = cloneNodeGraphPatch(nodeGraphMvp.patch)) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return { patch, targetNode: null };
  }
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return { patch, targetNode: null };
  }
  targetNode.graph = nodeGraphGraphForNode(targetNode);
  return { patch, targetNode };
}

function selectedNodeGraphGraphIndex(graph, fallback = undefined) {
  const input = document.getElementById("nodeSceneGraphNodeIndex");
  const rawIndex = Number(input?.value);
  const maxIndex = Math.max(0, (graph?.nodes?.length || 1) - 1);
  const hasFallback = Number.isFinite(Number(fallback));
  const index = hasFallback
    ? Number(fallback)
    : Number.isFinite(rawIndex)
      ? rawIndex
      : maxIndex;
  return Math.max(0, Math.min(maxIndex, Math.round(index)));
}

function populateNodeGraphGraphNodeIndexSelect(graph, selectedIndex = selectedNodeGraphGraphIndex(graph)) {
  const select = document.getElementById("nodeSceneGraphNodeIndex");
  if (!select) {
    return;
  }
  const graphData = normalizeNodeGraphGraph(graph);
  select.replaceChildren();
  graphData.nodes.forEach((node, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}: x ${node.x.toFixed(3)}`;
    select.append(option);
  });
  select.value = String(selectedNodeGraphGraphIndex(graphData, selectedIndex));
}

function createNodeGraphGraphRowNumberInput(index, field, value, options = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(options.min ?? 0);
  input.max = String(options.max ?? 1);
  input.step = String(options.step ?? 0.001);
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.value = Number(value).toFixed(3);
  input.dataset.graphNodeRow = String(index);
  input.dataset.graphNodeField = field;
  input.setAttribute("aria-label", `Graph node ${index + 1} ${field}`);
  if (options.disabled) {
    input.disabled = true;
  }
  return input;
}

function createNodeGraphGraphRowShapeSelect(index, value, options = {}) {
  const select = document.createElement("select");
  select.dataset.graphNodeRow = String(index);
  select.dataset.graphNodeField = "shape";
  select.setAttribute("aria-label", `Graph node ${index + 1} shape`);
  for (const shape of nodeGraphGraphShapes) {
    const option = document.createElement("option");
    option.value = shape;
    option.textContent = shape;
    select.append(option);
  }
  select.value = normalizeNodeGraphGraphShape(value);
  if (options.disabled) {
    select.disabled = true;
  }
  return select;
}

function renderNodeGraphGraphNodeList(graph, selectedIndex = selectedNodeGraphGraphIndex(graph), options = {}) {
  const list = document.getElementById("nodeSceneGraphNodeList");
  if (!list) {
    return;
  }
  const graphData = normalizeNodeGraphGraph(graph);
  const usesGlobalSmoothing = Boolean(options.usesGlobalSmoothing);
  const activeIndex = selectedNodeGraphGraphIndex(graphData, selectedIndex);
  list.replaceChildren();
  const header = document.createElement("div");
  header.className = "scene-context-graph-node-row scene-context-graph-node-row-header";
  for (const label of ["node", "x", "y", usesGlobalSmoothing ? "global" : "curve", usesGlobalSmoothing ? "mode" : "shape"]) {
    const span = document.createElement("span");
    span.textContent = label;
    header.append(span);
  }
  list.append(header);
  graphData.nodes.forEach((node, index) => {
    const row = document.createElement("div");
    row.className = "scene-context-graph-node-row";
    row.dataset.graphNodeRow = String(index);
    row.dataset.selected = index === activeIndex ? "true" : "false";

    const label = document.createElement("button");
    label.type = "button";
    label.textContent = String(index + 1);
    label.dataset.graphNodeSelect = String(index);
    label.setAttribute("aria-pressed", index === activeIndex ? "true" : "false");
    row.append(label);
    row.append(createNodeGraphGraphRowNumberInput(index, "x", node.x));
    row.append(createNodeGraphGraphRowNumberInput(index, "y", node.y));
    row.append(createNodeGraphGraphRowNumberInput(index, "c", node.c, {
      disabled: usesGlobalSmoothing,
      min: -0.999,
      max: 0.999,
    }));
    row.append(createNodeGraphGraphRowShapeSelect(index, node.shape, { disabled: usesGlobalSmoothing }));
    list.append(row);
  });
}

function syncNodeGraphGraphControls(graph, selectedIndex = selectedNodeGraphGraphIndex(graph)) {
  const graphData = normalizeNodeGraphGraph(graph);
  const index = selectedNodeGraphGraphIndex(graphData, selectedIndex);
  const nodeId = nodeGraphModuleActionTargetNodeId();
  const graphNodeType = nodeGraphPatchNode(nodeId)?.type || "";
  const usesGlobalSmoothing = graphNodeType === "graph2";
  if (nodeGraphModuleIsGraphType(nodeGraphPatchNode(nodeId)?.type)) {
    setNodeGraphGraphSelectedNodeIndex(nodeId, graphData, index);
    syncNodeGraphGraphElement(nodeGraphNodeElement(nodeId), {
      ...nodeGraphPatchNode(nodeId),
      graph: graphData,
      id: nodeId,
    });
  }
  const node = graphData.nodes[index] || graphData.nodes.at(-1);
  populateNodeGraphGraphNodeIndexSelect(graphData, index);
  renderNodeGraphGraphNodeList(graphData, index, { usesGlobalSmoothing });
  const cursorInput = document.getElementById("nodeSceneGraphCursorX");
  const xInput = document.getElementById("nodeSceneGraphNodeX");
  const yInput = document.getElementById("nodeSceneGraphNodeY");
  const contourInput = document.getElementById("nodeSceneGraphNodeContour");
  const shapeInput = document.getElementById("nodeSceneGraphNodeShape");
  const previousButton = document.getElementById("nodeSceneGraphPreviousNode");
  const nextButton = document.getElementById("nodeSceneGraphNextNode");
  const removeButton = document.getElementById("nodeSceneGraphRemoveNode");
  if (cursorInput) {
    cursorInput.value = graphData.cursorX.toFixed(3);
  }
  if (xInput) {
    xInput.value = node.x.toFixed(3);
  }
  if (yInput) {
    yInput.value = node.y.toFixed(3);
  }
  if (contourInput) {
    contourInput.value = node.c.toFixed(3);
  }
  if (shapeInput) {
    shapeInput.value = normalizeNodeGraphGraphShape(node.shape);
    shapeInput.disabled = usesGlobalSmoothing;
  }
  if (contourInput) {
    contourInput.disabled = usesGlobalSmoothing;
  }
  if (previousButton) {
    previousButton.disabled = index <= 0;
  }
  if (nextButton) {
    nextButton.disabled = index >= graphData.nodes.length - 1;
  }
  if (removeButton) {
    removeButton.disabled = graphData.nodes.length <= 2;
  }
}

function setNodeGraphGraphSelectedIndex(index) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  syncNodeGraphGraphControls(graph, nodeGraphGraphNodeIndexFromValue(graph, index));
}

function commitNodeGraphGraphEdit(patch, targetNode, status, options = {}) {
  let selectedIndex = selectedNodeGraphGraphIndex(targetNode.graph, options.selectedIndex);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(targetNode.graph, selectedIndex)
    : normalizeNodeGraphGraph(targetNode.graph);
  if (Number.isFinite(options.selectedX)) {
    selectedIndex = targetNode.graph.nodes.reduce((bestIndex, node, index) => {
      const best = targetNode.graph.nodes[bestIndex];
      return Math.abs(node.x - options.selectedX) < Math.abs(best.x - options.selectedX)
        ? index
        : bestIndex;
    }, 0);
  }
  commitNodeGraphPatch(patch, { record: options.record ?? true, status });
  syncNodeGraphGraphControls(targetNode.graph, selectedIndex);
}

function setNodeGraphGraphCursorFromContext({ record = true } = {}) {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const input = document.getElementById("nodeSceneGraphCursorX");
  targetNode.graph = normalizeNodeGraphGraph({
    ...targetNode.graph,
    cursorX: normalizeNodeGraphGraphNumber(input?.value, targetNode.graph.cursorX),
  });
  commitNodeGraphGraphEdit(patch, targetNode, "graph cursor changed", { record });
}

function setNodeGraphGraphNodeFromContext({ record = true } = {}) {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  const selectedIndex = selectedNodeGraphGraphIndex(graph);
  const node = graph.nodes[selectedIndex];
  const usesGlobalSmoothing = targetNode.type === "graph2";
  graph.nodes[selectedIndex] = normalizeNodeGraphGraphNode({
    c: usesGlobalSmoothing ? node.c : document.getElementById("nodeSceneGraphNodeContour")?.value ?? node.c,
    shape: usesGlobalSmoothing ? node.shape : document.getElementById("nodeSceneGraphNodeShape")?.value ?? node.shape,
    x: document.getElementById("nodeSceneGraphNodeX")?.value ?? node.x,
    y: document.getElementById("nodeSceneGraphNodeY")?.value ?? node.y,
  }, selectedIndex);
  targetNode.graph = graph;
  commitNodeGraphGraphEdit(patch, targetNode, "graph node changed", { record, selectedIndex });
}

function selectNodeGraphGraphNodeFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  syncNodeGraphGraphControls(nodeGraphGraphForNode(sourceNode));
}

function selectNodeGraphGraphNodeOffsetFromContext(offset) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  const selectedIndex = selectedNodeGraphGraphIndex(graph);
  const nextIndex = nodeGraphGraphNodeIndexFromValue(graph, selectedIndex + Number(offset || 0));
  syncNodeGraphGraphControls(graph, nextIndex);
}

function setNodeGraphGraphNodeListValueFromContext(event, { record = true } = {}) {
  const field = event.target?.dataset?.graphNodeField;
  const rowIndex = event.target?.dataset?.graphNodeRow;
  if (!field || rowIndex === undefined) {
    return;
  }
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  if (targetNode.type === "graph2" && (field === "c" || field === "shape")) {
    syncNodeGraphGraphControls(nodeGraphGraphForNode(targetNode));
    return;
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  const selectedIndex = nodeGraphGraphNodeIndexFromValue(graph, rowIndex);
  const node = graph.nodes[selectedIndex];
  graph.nodes[selectedIndex] = normalizeNodeGraphGraphNode({
    ...node,
    [field]: event.target.value,
  }, selectedIndex);
  targetNode.graph = graph;
  commitNodeGraphGraphEdit(patch, targetNode, "graph node changed", { record, selectedIndex });
}

function handleNodeGraphGraphNodeListClick(event) {
  const selectButton = event.target?.closest?.("[data-graph-node-select]");
  if (!selectButton) {
    return;
  }
  setNodeGraphGraphSelectedIndex(selectButton.dataset.graphNodeSelect);
}

function handleNodeGraphGraphNodeListInput(event) {
  setNodeGraphGraphNodeListValueFromContext(event, { record: false });
}

function handleNodeGraphGraphNodeListChange(event) {
  setNodeGraphGraphNodeListValueFromContext(event, { record: true });
}

function addNodeGraphGraphNodeFromContext() {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const addition = addNodeGraphGraphNodeData(targetNode.graph);
  if (!addition.added) {
    return;
  }
  targetNode.graph = addition.graph;
  commitNodeGraphGraphEdit(patch, targetNode, "graph node added", {
    selectedIndex: addition.selectedIndex,
  });
}

function duplicateNodeGraphGraphNodeFromContext() {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  const selectedIndex = selectedNodeGraphGraphIndex(graph);
  const duplicate = duplicateNodeGraphGraphNodeData(graph, selectedIndex);
  if (!duplicate.duplicated) {
    return;
  }
  targetNode.graph = duplicate.graph;
  commitNodeGraphGraphEdit(patch, targetNode, "graph node duplicated", {
    selectedIndex: duplicate.selectedIndex,
  });
}

function removeNodeGraphGraphNodeFromContext() {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  if (graph.nodes.length <= 2) {
    return;
  }
  const selectedIndex = selectedNodeGraphGraphIndex(graph);
  graph.nodes.splice(selectedIndex, 1);
  targetNode.graph = graph;
  setNodeGraphGraphSelectedNodeIndex(targetNode.id, graph, Math.max(0, selectedIndex - 1));
  commitNodeGraphGraphEdit(patch, targetNode, "graph node removed", {
    selectedIndex: Math.max(0, selectedIndex - 1),
  });
}

function resetNodeGraphGraphFromContext() {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  targetNode.graph = normalizeNodeGraphGraph();
  commitNodeGraphGraphEdit(patch, targetNode, "graph reset", { selectedIndex: 1 });
}

function setNodeGraphGraphPresetFromContext(preset) {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  targetNode.graph = nodeGraphGraphPresetData(preset);
  commitNodeGraphGraphEdit(patch, targetNode, `graph preset: ${preset}`, {
    selectedIndex: Math.min(1, targetNode.graph.nodes.length - 1),
  });
}

function setNodeGraphGraphOutputRangeFromContext(minValue, maxValue) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphModuleIsGraphType(targetNode.type)) {
    return;
  }
  targetNode.params = {
    ...(targetNode.params || {}),
    outputMax: normalizeNodeGraphPatchParameter(targetNode.type, "outputMax", maxValue),
    outputMin: normalizeNodeGraphPatchParameter(targetNode.type, "outputMin", minValue),
  };
  commitNodeGraphPatch(patch, { status: "graph output range changed" });
  syncNodeGraphPatchParameters();
  configureNodeSceneContextMenu("module");
}

function transformNodeGraphGraphFromContext(transform) {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  targetNode.graph = nodeGraphGraphTransformedData(targetNode.graph, transform);
  commitNodeGraphGraphEdit(patch, targetNode, `graph transformed: ${transform}`, {
    selectedIndex: Math.min(1, targetNode.graph.nodes.length - 1),
  });
}

async function copyNodeGraphGraphFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  const graph = nodeGraphGraphForNode(sourceNode);
  const text = serializeNodeGraphGraphClipboard(graph);
  nodeGraphMvp.graphClipboard = text;
  try {
    await copyTextToClipboard(text);
  } catch (_error) {
    // Local clipboard remains available when browser clipboard access is blocked.
  }
  configureNodeSceneContextMenu("module");
}

async function pasteNodeGraphGraphFromContext() {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  let text = nodeGraphMvp.graphClipboard || "";
  try {
    text = await navigator.clipboard?.readText?.() || text;
  } catch (_error) {
    // Browser clipboard read may be unavailable; use the local graph clipboard.
  }
  const graph = parseNodeGraphGraphClipboard(text);
  if (!graph) {
    configureNodeSceneContextMenu("module");
    return;
  }
  nodeGraphMvp.graphClipboard = serializeNodeGraphGraphClipboard(graph);
  targetNode.graph = graph;
  commitNodeGraphGraphEdit(patch, targetNode, "graph pasted", {
    selectedIndex: Math.min(1, graph.nodes.length - 1),
  });
}

function nodeGraphCodeblockBuildFunctionBody(codeblock) {
  const context = [
    "const state = __state;",
    "const __ctx = __context || {};",
    "const sampleRate = Number(__ctx.sampleRate) || 44100;",
    "const frame = Number(__ctx.frame) || 0;",
    "const frames = Number(__ctx.frames) || 1;",
    "const time = Number(__ctx.time) || 0;",
    "const dt = 1 / sampleRate;",
  ].join("\n");
  const inputs = codeblock.inputs
    .map((port, index) => `const ${port} = __inputs[${index}] || 0;`)
    .join("\n");
  const outputs = codeblock.outputs.map((port) => `let ${port} = 0;`).join("\n");
  const writes = codeblock.outputs
    .map((port) => `__outputs[${JSON.stringify(port)}] = ${port};`)
    .join("\n");
  const shadows = nodeGraphCodeblockShadowedGlobals
    .filter((name) => name !== "eval")
    .map((name) => `const ${name} = undefined;`)
    .join("\n");
  return `"use strict";\n${shadows}\n${context}\n${inputs}\n${outputs}\n${codeblock.code}\n${writes}\nreturn __outputs;`;
}

function nodeGraphCodeblockCompileStatus(codeblock) {
  try {
    const normalized = normalizeNodeGraphCodeblock(codeblock);
    Function(
      "__inputs",
      "__outputs",
      "__state",
      "__context",
      nodeGraphCodeblockBuildFunctionBody(normalized),
    );
    return { ok: true, message: "code ok" };
  } catch (error) {
    return { ok: false, message: error?.message || "compile error" };
  }
}

function nodeGraphCodeblockPortsFromInput(id, fallbackPrefix) {
  return normalizeNodeGraphCodeblockPortList(
    document.getElementById(id)?.value,
    fallbackPrefix,
  );
}

function pruneNodeGraphConnectionsForCodeblockPortChange(patch, nodeId, inputs, outputs) {
  const inputSet = new Set(inputs);
  const outputSet = new Set(outputs);
  patch.connections = (patch.connections || []).filter((connection) => {
    if (connection.destinationNode === nodeId && !inputSet.has(connection.destinationPort)) {
      return false;
    }
    if (connection.sourceNode === nodeId && !outputSet.has(connection.sourcePort)) {
      return false;
    }
    return true;
  });
  patch.modulations = (patch.modulations || []).filter((modulation) => (
    modulation.sourceNode !== nodeId || outputSet.has(modulation.sourcePort)
  ));
}

function applyNodeGraphCodeblockPortsFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "codeblock") {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const current = normalizeNodeGraphCodeblock(targetNode.codeblock);
  const next = normalizeNodeGraphCodeblock({
    ...current,
    inputs: nodeGraphCodeblockPortsFromInput("nodeSceneCodeblockInputs", "In"),
    outputs: nodeGraphCodeblockPortsFromInput("nodeSceneCodeblockOutputs", "Out"),
  });
  targetNode.codeblock = next;
  pruneNodeGraphConnectionsForCodeblockPortChange(patch, targetNode.id, next.inputs, next.outputs);
  commitNodeGraphPatch(patch, { status: "codeblock ports changed" });
  configureNodeSceneContextMenu("module");
}

function setNodeGraphCodeblockSourceFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "codeblock") {
    return;
  }
  const sourceInput = document.getElementById("nodeSceneCodeblockSource");
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const codeblock = normalizeNodeGraphCodeblock(targetNode.codeblock);
  targetNode.codeblock = normalizeNodeGraphCodeblock({
    ...codeblock,
    code: sourceInput?.value ?? nodeGraphCodeblockDefaultCode,
  });
  const status = nodeGraphCodeblockCompileStatus(targetNode.codeblock);
  const statusOutput = document.getElementById("nodeSceneCodeblockStatus");
  if (statusOutput) {
    statusOutput.textContent = status.ok ? "code ok" : `compile error: ${status.message}`;
  }
  commitNodeGraphPatch(patch, {
    record,
    status: status.ok ? "codeblock code changed" : "codeblock compile error",
  });
  if (document.activeElement === sourceInput) {
    sourceInput.focus();
  }
}

function setNodeGraphTextBoxPortScriptFromContext(port, { record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "animatedTextBox") {
    return;
  }
  const elementId = port === "Title" ? "nodeSceneTextBoxTitleScript" : "nodeSceneTextBoxTextScript";
  const sourceInput = document.getElementById(elementId);
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const nextScripts = { ...(targetNode.portScripts || {}) };
  const source = sourceInput?.value ?? "";
  if (source.trim()) {
    nextScripts[port] = source;
  } else {
    delete nextScripts[port];
  }
  targetNode.portScripts = nextScripts;
  const statusOutput = document.getElementById(
    port === "Title" ? "nodeSceneTextBoxTitleScriptStatus" : "nodeSceneTextBoxTextScriptStatus",
  );
  if (statusOutput) {
    if (!source.trim()) {
      statusOutput.textContent = "";
    } else {
      const compiled = compileNodeGraphPortScript(source);
      statusOutput.textContent = compiled ? "code ok" : "compile error";
    }
  }
  commitNodeGraphPatch(patch, { record, status: `text box ${port.toLowerCase()} script changed` });
  if (document.activeElement === sourceInput) {
    sourceInput.focus();
  }
}

function setNodeGraphTextBoxModeFromContext(textMode) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  targetNode.layout = normalizeNodeGraphTextBoxLayout({
    ...(targetNode.layout || {}),
    textMode,
  });
  commitNodeGraphPatch(patch, { status: "text box mode changed" });
  configureNodeSceneContextMenu("module");
}

function setNodeGraphTextBoxTextFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }
  const input = document.getElementById("nodeSceneTextBoxTextInput");
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const currentLayout = normalizeNodeGraphTextBoxLayout(targetNode.layout);
  targetNode.layout = normalizeNodeGraphTextBoxLayout({
    ...currentLayout,
    text: input?.value ?? "",
  });
  commitNodeGraphPatch(patch, {
    record,
    status: "text box text changed",
  });
  if (document.activeElement === input) {
    input.focus();
  }
}

function setNodeGraphTextBoxHorizontalAlignFromContext(value) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const currentLayout = normalizeNodeGraphTextBoxLayout(targetNode.layout);
  targetNode.layout = normalizeNodeGraphTextBoxLayout({
    ...currentLayout,
    horizontalAlign: value,
  });
  commitNodeGraphPatch(patch, { status: "text box alignment changed" });
  configureNodeSceneContextMenu("module");
}

function setNodeGraphTextBoxVerticalAlignFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }
  const input = document.getElementById("nodeSceneTextBoxVerticalAlign");
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const currentLayout = normalizeNodeGraphTextBoxLayout(targetNode.layout);
  const verticalAlignPercent = normalizeNodeGraphTextBoxVerticalAlignPercent(input?.value);
  targetNode.layout = normalizeNodeGraphTextBoxLayout({
    ...currentLayout,
    verticalAlignPercent,
  });
  commitNodeGraphPatch(patch, {
    record,
    status: "text box vertical position changed",
  });
  document.getElementById("nodeSceneTextBoxVerticalAlignValue").textContent = `${verticalAlignPercent}%`;
  if (document.activeElement === input) {
    input.focus();
  }
}

function loadNodeGraphImageFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "image") {
    return;
  }
  setNodeInteractionHelp("Native image file picker is disabled.");
}

function handleNodeGraphImageFileInputChange(event) {
  const input = event.currentTarget;
  const targetNodeId = input.dataset.targetNode || nodeGraphModuleActionTargetNodeId();
  const sourceNode = nodeGraphPatchNode(targetNodeId);
  const file = input.files?.[0];
  if (!sourceNode || sourceNode.type !== "image" || !file) {
    return;
  }
  if (!nodeGraphImageAcceptedTypes.includes(file.type)) {
    setNodeInteractionHelp("Image type not supported.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = normalizeNodeGraphImageDataUrl(reader.result);
    if (!dataUrl) {
      setNodeInteractionHelp("Image is too large or invalid.");
      return;
    }
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
    if (!targetNode) {
      return;
    }
    targetNode.layout = normalizeNodeGraphImageLayout({
      dataUrl,
      fileName: file.name || "trace-image",
      refreshedAt: Date.now(),
    });
    commitNodeGraphPatch(patch, { status: "image loaded" });
    configureNodeSceneContextMenu("module");
    scheduleNodeGraphModuleScopeDraw();
  };
  reader.readAsDataURL(file);
}

function saveNodeGraphImageFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  const layout = normalizeNodeGraphImageLayout(sourceNode?.layout);
  if (!sourceNode || sourceNode.type !== "image" || !layout.dataUrl) {
    return;
  }
  const link = document.createElement("a");
  link.href = layout.dataUrl;
  link.download = nodeGraphImageFileName(layout);
  document.body.append(link);
  link.click();
  link.remove();
  setNodeInteractionHelp("Image saved.");
}

function refreshNodeGraphImageFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "image") {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  targetNode.layout = normalizeNodeGraphImageLayout({
    ...targetNode.layout,
    refreshedAt: Date.now(),
  });
  commitNodeGraphPatch(patch, { record: false, status: "image refreshed" });
  refreshNodeGraphImageBodies();
  scheduleNodeGraphModuleScopeDraw();
}

function setNodeGraphLedColorFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "led") {
    return;
  }
  const input = document.getElementById("nodeSceneLedColor");
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  targetNode.led = normalizeNodeGraphLedLayout({
    ...targetNode.led,
    color: input?.value,
  });
  commitNodeGraphPatch(patch, {
    record,
    status: "led color changed",
  });
  scheduleNodeGraphModuleScopeDraw();
  if (document.activeElement === input) {
    input.focus();
  }
}

function toggleNodeGraphModuleButtonsFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.buttonsHidden = !ui.buttonsHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.buttonsHidden ? "module buttons hidden" : "module buttons shown",
  });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleEnabledFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }
  if (sourceNode.id === "output") {
    toggleNodeGraphLiveOutput();
    configureNodeSceneContextMenu("module");
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const bypassed = new Set(patch.bypassedNodes || []);
  if (bypassed.has(targetNode.id)) {
    bypassed.delete(targetNode.id);
  } else {
    bypassed.add(targetNode.id);
  }
  patch.bypassedNodes = [...bypassed];
  commitNodeGraphPatch(patch, {
    status: bypassed.has(targetNode.id) ? "module disabled" : "module enabled",
  });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleTitleFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.titleHidden = !ui.titleHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.titleHidden ? "module title hidden" : "module title shown",
  });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleOscilloscopeFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphPatchNodeHasHideableOscilloscope(sourceNode)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphPatchNodeHasHideableOscilloscope(targetNode)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.oscilloscopeHidden = !ui.oscilloscopeHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.oscilloscopeHidden ? "module display hidden" : "module display shown",
  });
  configureNodeSceneContextMenu("module");
}

function applyNodeGraphPatchNodeUi(targetNode, ui) {
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, targetNode?.type);
  if (
    normalizedUi.buttonsHidden ||
    normalizedUi.ioHidden ||
    normalizedUi.interfaceControlsHidden ||
    normalizedUi.titleHidden ||
    normalizedUi.oscilloscopeHidden ||
    normalizedUi.slidersHidden ||
    normalizedUi.displayHeightOffsetGu
  ) {
    targetNode.ui = normalizedUi;
  } else {
    delete targetNode.ui;
  }
}

function toggleNodeGraphModuleInterfaceControlsFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleTypeHasInterfaceControls(sourceNode.type)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphModuleTypeHasInterfaceControls(targetNode.type)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.interfaceControlsHidden = !ui.interfaceControlsHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.interfaceControlsHidden ? "module control surface hidden" : "module control surface shown",
  });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleIoFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.ioHidden = !ui.ioHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.ioHidden ? "module in/out hidden" : "module in/out shown",
  });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleSlidersFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleTypeHasHideableSliders(sourceNode.type)) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode || !nodeGraphModuleTypeHasHideableSliders(targetNode.type)) {
    return;
  }
  const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
  ui.slidersHidden = !ui.slidersHidden;
  applyNodeGraphPatchNodeUi(targetNode, ui);
  commitNodeGraphPatch(patch, {
    status: ui.slidersHidden ? "module sliders hidden" : "module sliders shown",
  });
  configureNodeSceneContextMenu("module");
}

function copySelectedNodeGraphModule() {
  const selectedNodeIds = [...nodeGraphSelectedNodeIds()];
  if (selectedNodeIds.length !== 1) {
    return false;
  }
  const sourceNode = nodeGraphPatchNode(selectedNodeIds[0]);
  if (!sourceNode || sourceNode.type === "output") {
    return false;
  }
  copyNodeGraphModule(sourceNode);
  return true;
}

function nodeGraphNativeModuleCodeEntryForNode(node) {
  if (!node || typeof nodeGraphCodeEntryForType !== "function") {
    return null;
  }
  return nodeGraphCodeEntryForType(node.type) || null;
}

function nodeGraphNativeModuleLibEntryForNode(node) {
  if (!node || typeof nodeGraphLibEntryForType !== "function") {
    return null;
  }
  return nodeGraphLibEntryForType(node.type) || null;
}

function nodeGraphOpenUrlInNewTab(url) {
  // window.open's return value can't be trusted here: with "noopener" set,
  // many browsers return null even on success (there's no opener reference
  // to hand back), so checking it to decide whether to fall back caused a
  // second tab to open on every click. The anchor-click approach alone is
  // reliable and still gets the noopener/noreferrer protection.
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

function openNodeGraphNativeModuleCodeFromContext() {
  const targetNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  const entry = nodeGraphNativeModuleCodeEntryForNode(targetNode);
  if (!entry?.sourceUrl) {
    return;
  }
  nodeGraphOpenUrlInNewTab(entry.sourceUrl);
  setNodeInteractionHelp(`Opened ${entry.source || entry.sourceUrl}.`);
}

function openNodeGraphNativeModuleLibFromContext() {
  const targetNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  const entry = nodeGraphNativeModuleLibEntryForNode(targetNode);
  if (!entry?.libUrl) {
    return;
  }
  nodeGraphOpenUrlInNewTab(entry.libUrl);
  setNodeInteractionHelp(`Opened ${entry.libUrl}.`);
}

function deleteNodeGraphModuleFromContext() {
  const targetNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (nodeGraphNodeCanBeDeleted(targetNode)) {
    const targetNodeIds = new Set([targetNode.id]);
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    patch.nodes = patch.nodes.filter((node) => !targetNodeIds.has(node.id));
    patch.bypassedNodes = patch.bypassedNodes.filter((nodeId) => !targetNodeIds.has(nodeId));
    patch.connections = patch.connections.filter(
      (connection) =>
        !targetNodeIds.has(connection.sourceNode) &&
        !targetNodeIds.has(connection.destinationNode),
    );
    patch.modulations = patch.modulations.filter(
      (modulation) =>
        !targetNodeIds.has(modulation.sourceNode) &&
        !targetNodeIds.has(modulation.destinationNode),
    );
    commitNodeGraphPatch(patch, { status: "module deleted" });
    nodeGraphMvp.sceneContextTargetNode = null;
    if (nodeGraphSelectedNodeIds().has(targetNode.id)) {
      setNodeGraphSelection(null);
    } else {
      configureNodeSceneContextMenu("module");
    }
    return;
  }
  configureNodeSceneContextMenu("module");
}
