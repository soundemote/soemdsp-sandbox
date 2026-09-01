function defaultNodeGraphModuleGridPoint(type) {
  const count = nodeGraphMvp.nodeTypeCounts[type] || 1;
  return {
    gx: 3 + count * 2,
    gy: 3 + count * 2,
  };
}

function ensureNodeGraphLiveInputModule() {
  // Singleton Input — always allowed; unique in patch (APP_POLICY).
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

function nodeGraphPatchIsLocked(patch = nodeGraphMvp?.patch) {
  const view = typeof normalizeNodeGraphPatchView === "function"
    ? normalizeNodeGraphPatchView(patch?.view)
    : patch?.view;
  return Boolean(view?.locked);
}

function nodeGraphPatchHidesUnusedPorts(patch = nodeGraphMvp?.patch) {
  const view = typeof normalizeNodeGraphPatchView === "function"
    ? normalizeNodeGraphPatchView(patch?.view)
    : patch?.view;
  return Boolean(view?.hideUnusedPorts);
}

function commitNodeGraphPatchViewFlags(nextFlags = {}, status = "view updated") {
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const view = typeof normalizeNodeGraphPatchView === "function"
    ? normalizeNodeGraphPatchView(patch.view)
    : { ...(patch.view || {}) };
  patch.view = { ...view, ...nextFlags };
  commitNodeGraphPatch(patch, { status });
  if (typeof applyNodeGraphWorkspaceView === "function") {
    applyNodeGraphWorkspaceView();
  }
  syncNodeGraphReadyPanelChrome();
}

function syncNodeGraphReadyPanelChrome() {
  const locked = nodeGraphPatchIsLocked();
  const hideUnused = nodeGraphPatchHidesUnusedPorts();
  const lockBtn = document.getElementById("nodePatchLockButton");
  if (lockBtn) {
    lockBtn.setAttribute("aria-pressed", String(locked));
    lockBtn.setAttribute("aria-label", locked ? "Unlock patch" : "Lock patch");
    lockBtn.title = locked
      ? "Unlock patch: select, move, add, and delete again"
      : "Lock patch: no module select, move, add, or delete";
    const label = lockBtn.querySelector(".scene-context-window-button-label");
    if (label) {
      label.textContent = locked ? "🔒" : "🔓";
    }
  }
  const hideBtn = document.getElementById("nodePatchHideUnusedButton");
  if (hideBtn) {
    hideBtn.setAttribute("aria-pressed", String(hideUnused));
    hideBtn.title = hideUnused
      ? "Show unused inlets and outlets"
      : "Hide unused inlets and outlets";
  }
}

function toggleNodeGraphPatchLocked() {
  const next = !nodeGraphPatchIsLocked();
  commitNodeGraphPatchViewFlags({ locked: next }, next ? "patch locked" : "patch unlocked");
}

function toggleNodeGraphPatchHideUnusedPorts() {
  const next = !nodeGraphPatchHidesUnusedPorts();
  commitNodeGraphPatchViewFlags(
    { hideUnusedPorts: next },
    next ? "unused ports hidden" : "unused ports shown",
  );
}

function showNodeGraphModule(node, point = null, options = {}) {
  const type = node;
  if (!Object.hasOwn(nodeGraphModuleDefinitions, type)) {
    return "";
  }
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Patch is locked.");
    }
    return "";
  }
  if (typeof nodeGraphEfficientProductEnabled === "function"
    && nodeGraphEfficientProductEnabled()) {
    const shopOk = typeof nodeGraphModuleIsEfficientProductShopType === "function"
      && nodeGraphModuleIsEfficientProductShopType(type);
    const chromeOk = typeof nodeGraphModuleIsEfficientProductChromeType === "function"
      && nodeGraphModuleIsEfficientProductChromeType(type);
    if (!shopOk && !chromeOk) {
      if (typeof setNodeInteractionHelp === "function") {
        setNodeInteractionHelp("not in efficient build");
      }
      return "";
    }
  }
  if (typeof nodeGraphModuleTypeIsInvisible === "function"
    && nodeGraphModuleTypeIsInvisible(type)) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This module is not listed.");
    }
    return "";
  }
  if (typeof nodeGraphModuleTypeIsUnderConstruction === "function"
    && nodeGraphModuleTypeIsUnderConstruction(type)) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This module is under construction and cannot be added.");
    }
    return "";
  }

  if (typeof nodeGraphModuleTypeIsUniqueInPatch === "function" && nodeGraphModuleTypeIsUniqueInPatch(type)) {
    const existing = typeof nodeGraphFindExistingModuleOfType === "function"
      ? nodeGraphFindExistingModuleOfType(type)
      : nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.type === type);
    if (existing) {
      const gridPoint = point ? nodeGraphPixelToGrid(point) : defaultNodeGraphModuleGridPoint(type);
      existing.gx = gridPoint.gx;
      existing.gy = gridPoint.gy;
      commitNodeGraphPatch(nodeGraphMvp.patch, {
        status: options.status || "module moved",
        layoutEdit: true,
        skipValidate: true,
        record: options.record,
        autosaveWorkingPatch: options.autosaveWorkingPatch,
        skipLivePlan: options.skipLivePlan !== false,
        deferUiPanels: options.deferUiPanels,
      });
      return existing.id;
    }
  }

  const live = nodeGraphMvp.patch;
  const counts = nextNodeGraphTypeCounts(live.nodes);
  counts[type] = (counts[type] || 0) + 1;
  const id = `${type}-${counts[type]}`;
  const gridPoint = point ? nodeGraphPixelToGrid(point) : defaultNodeGraphModuleGridPoint(type);
  // Group Input/Output default to "Input N"/"Output N" at creation so a
  // fresh portal is never left blank until renamed. Duplicate/copy keeps
  // the source alias instead of calling showNodeGraphModule.
  const defaultAlias = type === "groupInput" ? `Input ${counts[type]}`
    : type === "groupOutput" ? `Output ${counts[type]}`
    : undefined;
  const patch = {
    ...live,
    nodes: [
      ...(live.nodes || []),
      createNodeGraphPatchNode(type, {
        id,
        gx: gridPoint.gx,
        gy: gridPoint.gy,
        ...(defaultAlias ? { alias: defaultAlias } : {}),
      }),
    ],
  };
  const commitAdd = () => {
    commitNodeGraphPatch(patch, {
      status: options.status || "module added",
      topologyEdit: true,
      // Ghost drag-from-shop: keep pointer responsive (no history/autosave/live plan
      // until drop). Heavy modules like multi-out crossovers were freezing on grab.
      record: options.record,
      autosaveWorkingPatch: options.autosaveWorkingPatch,
      skipLivePlan: options.skipLivePlan,
      deferUiPanels: options.deferUiPanels !== false,
    });
  };
  if (options.record !== false) {
    if (typeof noteNodeGraphHeavyHistoryAction === "function") {
      noteNodeGraphHeavyHistoryAction("add");
    }
    if (typeof runNodeGraphHistoryAfterGlow === "function") {
      runNodeGraphHistoryAfterGlow("last", commitAdd);
      return id;
    }
  }
  commitAdd();
  return id;
}

function showPaletteNode(node) {
  showNodeGraphModule(node);
}

// Double-clicking empty canvas is a fast path to a Text Box: spawn one at the
// click point, then open its module actions window with the text field
// focused. Face text itself is edited inline; this window is the settings path.
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

function nodeGraphPlacementSnapGhostElement() {
  return document.getElementById("nodeGraphPlacementSnapGhost");
}

function clearNodeGraphPlacementSnapGhost() {
  nodeGraphPlacementSnapGhostElement()?.remove();
}

function syncNodeGraphPlacementSnapGhost(element, visible = true) {
  if (!element || !visible) {
    clearNodeGraphPlacementSnapGhost();
    return null;
  }
  const container = document.getElementById("nodeGraphNodes");
  if (!container) {
    return null;
  }
  let ghost = nodeGraphPlacementSnapGhostElement();
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.id = "nodeGraphPlacementSnapGhost";
    ghost.className = "dsp-node-placement-snap-ghost";
    ghost.setAttribute("aria-hidden", "true");
    container.append(ghost);
  }
  const x = Number.parseFloat(element.style.getPropertyValue("--node-x")) || 0;
  const y = Number.parseFloat(element.style.getPropertyValue("--node-y")) || 0;
  const snapped = typeof snapNodeGraphPointToGrid === "function"
    ? snapNodeGraphPointToGrid({ x, y })
    : { x, y };
  ghost.style.setProperty("--node-x", `${snapped.x}px`);
  ghost.style.setProperty("--node-y", `${snapped.y}px`);
  const cached = nodeGraphMvp._placementGhostMetrics;
  if (cached?.nodeId === element.dataset.node && cached.width > 0) {
    ghost.style.width = `${cached.width}px`;
    ghost.style.height = `${cached.height}px`;
    ghost.style.borderRadius = cached.radius;
  } else {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const radius = getComputedStyle(element).borderRadius;
    nodeGraphMvp._placementGhostMetrics = {
      nodeId: element.dataset.node,
      width,
      height,
      radius,
    };
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    ghost.style.borderRadius = radius;
  }
  return ghost;
}

function cancelNodeGraphModulePlacement(status = "module placement cancelled") {
  const pendingRaf = nodeGraphMvp.modulePlacement?._positionRaf;
  if (pendingRaf) {
    window.cancelAnimationFrame(pendingRaf);
  }
  nodeGraphMvp._placementGhostMetrics = null;
  clearNodeGraphPlacementSnapGhost();
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.nodeId) {
    placement?.sourceElement?.classList.remove("placing-module");
    nodeGraphMvp.modulePlacement = null;
    return false;
  }
  if (placement.teleport) {
    const element = nodeGraphNodeElement(placement.nodeId);
    element?.classList.remove("placing", "dragging");
    const node = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(placement.nodeId)
      : nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === placement.nodeId);
    if (node && element && typeof positionNodeGraphNode === "function") {
      const restore = typeof nodeGraphGridToPixel === "function"
        ? nodeGraphGridToPixel({ gx: node.gx, gy: node.gy })
        : { x: node.gx, y: node.gy };
      positionNodeGraphNode(element, restore);
    }
    nodeGraphMvp.modulePlacement = null;
    if (typeof drawNodeGraphWires === "function") {
      drawNodeGraphWires();
    }
    return true;
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
  // Ghost was never history/autosave/live-plan committed — keep cancel light too.
  commitNodeGraphPatch(patch, {
    status,
    topologyEdit: true,
    record: false,
    autosaveWorkingPatch: false,
    skipLivePlan: true,
    deferUiPanels: true,
  });
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

function applyNodeGraphPendingModuleCursor(cursorPoint) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.nodeId) {
    return false;
  }
  const element = nodeGraphNodeElement(placement.nodeId);
  if (!element) {
    clearNodeGraphPlacementSnapGhost();
    nodeGraphMvp.modulePlacement = null;
    return false;
  }
  const point = nodeGraphModulePlacementPixelFromCursor(cursorPoint, element);
  positionNodeGraphNode(element, point, { clamp: false, snap: false });
  placement.cursorPoint = cursorPoint;
  placement.point = point;
  syncNodeGraphPlacementSnapGhost(element, placement.overWorkspace !== false);
  // New shop ghosts have no cables. A full wire rebuild + scope paint here
  // is what made heavy faces (Sabrina Trace, crossovers) hitch: freeze-move.
  // Teleport of an already-wired unique module still needs a lite wire pass.
  if (placement.teleport && typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires({
      lite: true,
      skipHeatmap: true,
      skipScopes: true,
      skipSelection: true,
    });
  }
  return true;
}

function positionNodeGraphPendingModuleAtCursor(cursorPoint) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement) {
    return false;
  }
  placement._pendingCursorPoint = cursorPoint;
  if (placement._positionRaf) {
    return true;
  }
  placement._positionRaf = window.requestAnimationFrame(() => {
    const live = nodeGraphMvp.modulePlacement;
    if (!live) {
      return;
    }
    live._positionRaf = 0;
    const next = live._pendingCursorPoint;
    live._pendingCursorPoint = null;
    if (next) {
      applyNodeGraphPendingModuleCursor(next);
    }
  });
  return true;
}

function beginNodeGraphModulePlacement(type, point = null, options = {}) {
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Patch is locked.");
    }
    return "";
  }
  if (!type || !Object.hasOwn(nodeGraphModuleDefinitions, type)) {
    return "";
  }
  if (nodeGraphMvp.modulePlacement?.nodeId) {
    cancelNodeGraphModulePlacement();
  }

  const cursorPoint = point || nodeGraphGridToPixel(defaultNodeGraphModuleGridPoint(type));
  const overWorkspace = options.overWorkspace !== false;
  const existingUnique = typeof nodeGraphModuleTypeIsUniqueInPatch === "function"
    && nodeGraphModuleTypeIsUniqueInPatch(type)
    && typeof nodeGraphFindExistingModuleOfType === "function"
    ? nodeGraphFindExistingModuleOfType(type)
    : null;
  if (existingUnique) {
    const element = nodeGraphNodeElement(existingUnique.id);
    nodeGraphMvp.modulePlacement = {
      cursorPoint,
      nodeId: existingUnique.id,
      overWorkspace,
      point: cursorPoint,
      pointerId: null,
      teleport: true,
      type,
    };
    element?.classList.add("placing", "dragging");
    setNodeGraphNodeSelection([existingUnique.id]);
    positionNodeGraphPendingModuleAtCursor(cursorPoint);
    return existingUnique.id;
  }
  const id = showNodeGraphModule(type, cursorPoint, {
    status: "module ghost: release in modular view",
    record: false,
    autosaveWorkingPatch: false,
    skipLivePlan: true,
    deferUiPanels: true,
  });
  if (!id) {
    return "";
  }

  const element = nodeGraphNodeElement(id);
  nodeGraphMvp.modulePlacement = {
    cursorPoint,
    nodeId: id,
    overWorkspace,
    point: cursorPoint,
    pointerId: null,
    type,
  };
  element?.classList.add("placing", "dragging");
  setNodeGraphNodeSelection([id]);
  positionNodeGraphPendingModuleAtCursor(cursorPoint);
  return id;
}

const nodeGraphModuleStoreDragSlopPx = 6;

function beginNodeGraphModuleStorePointerPlacement(event) {
  if (typeof nodeGraphPatchIsLocked === "function" && nodeGraphPatchIsLocked()) {
    return false;
  }
  if (event.button !== undefined && event.button !== 0) {
    return false;
  }
  const addButton = event.target.closest("[data-context-module]");
  if (!addButton) {
    return false;
  }
  const type = addButton.dataset.contextModule;
  if (!type || !Object.hasOwn(nodeGraphModuleDefinitions, type)) {
    return false;
  }
  if (nodeGraphMvp.modulePlacement?.nodeId) {
    cancelNodeGraphModulePlacement();
  }
  nodeGraphMvp.modulePlacement = {
    armed: true,
    cursorPoint: nodeGraphClientPoint(event),
    nodeId: "",
    overWorkspace: nodeGraphClientPointInsideWorkspace(event),
    pointerId: event.pointerId ?? null,
    sourceElement: addButton,
    startClientX: event.clientX,
    startClientY: event.clientY,
    type,
  };
  addButton.classList.add("placing-module");
  addButton.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function spawnNodeGraphModuleStorePlacementIfDragged(event) {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.armed || placement.nodeId) {
    return Boolean(placement?.nodeId);
  }
  const dx = Number(event.clientX) - Number(placement.startClientX);
  const dy = Number(event.clientY) - Number(placement.startClientY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx * dx + dy * dy) < (nodeGraphModuleStoreDragSlopPx ** 2)) {
    return false;
  }
  const type = placement.type;
  const pointerId = placement.pointerId;
  const sourceElement = placement.sourceElement;
  const nodeId = beginNodeGraphModulePlacement(type, nodeGraphClientPoint(event), {
    overWorkspace: nodeGraphClientPointInsideWorkspace(event),
  });
  if (!nodeId || !nodeGraphMvp.modulePlacement) {
    return false;
  }
  nodeGraphMvp.modulePlacement.armed = false;
  nodeGraphMvp.modulePlacement.pointerId = pointerId;
  nodeGraphMvp.modulePlacement.sourceElement = sourceElement;
  return true;
}

function finishNodeGraphModulePlacementAtCurrentPosition(status = "module placed") {
  const placement = nodeGraphMvp.modulePlacement;
  if (!placement?.nodeId) {
    return false;
  }
  if (placement._positionRaf) {
    window.cancelAnimationFrame(placement._positionRaf);
    placement._positionRaf = 0;
  }
  if (placement._pendingCursorPoint) {
    applyNodeGraphPendingModuleCursor(placement._pendingCursorPoint);
    placement._pendingCursorPoint = null;
  }
  nodeGraphMvp._placementGhostMetrics = null;
  const element = nodeGraphNodeElement(placement.nodeId);
  if (!element) {
    clearNodeGraphPlacementSnapGhost();
    nodeGraphMvp.modulePlacement = null;
    return false;
  }

  element.classList.remove("placing", "dragging");
  clearNodeGraphPlacementSnapGhost();
  const x = Number.parseFloat(element.style.getPropertyValue("--node-x")) || 0;
  const y = Number.parseFloat(element.style.getPropertyValue("--node-y")) || 0;
  const gridPoint = nodeGraphPixelToGrid({ x, y });
  const patchNode = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(placement.nodeId)
    : nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === placement.nodeId);
  if (patchNode) {
    patchNode.gx = gridPoint.gx;
    patchNode.gy = gridPoint.gy;
  }
  nodeGraphMvp.modulePlacement = null;
  const commitDrop = () => {
    // Position is already on the DOM. Ghost create skipped live plan — start it now.
    commitNodeGraphPatch(nodeGraphMvp.patch, {
      status,
      layoutEdit: true,
      skipValidate: true,
      livePlan: true,
    });
    clearNodeGraphSelection();
  };
  if (typeof noteNodeGraphHeavyHistoryAction === "function") {
    noteNodeGraphHeavyHistoryAction("add");
  }
  if (typeof runNodeGraphHistoryAfterGlow === "function") {
    runNodeGraphHistoryAfterGlow("last", commitDrop);
    return true;
  }
  commitDrop();
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
  if (!placement.nodeId) {
    spawnNodeGraphModuleStorePlacementIfDragged(event);
    if (!nodeGraphMvp.modulePlacement?.nodeId) {
      return;
    }
  }
  nodeGraphMvp.modulePlacement.overWorkspace = nodeGraphClientPointInsideWorkspace(event);
  positionNodeGraphPendingModuleAtCursor(nodeGraphClientPoint(event));
}

function completeNodeGraphModulePlacement(event) {
  if (!nodeGraphMvp.modulePlacement?.nodeId) {
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
  placement.sourceElement?.classList.remove("placing-module");
  if (event.pointerId !== undefined && placement.sourceElement?.hasPointerCapture?.(event.pointerId)) {
    placement.sourceElement.releasePointerCapture(event.pointerId);
  }
  if (!placement.nodeId) {
    nodeGraphMvp.modulePlacement = null;
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
  positionNodeGraphPendingModuleAtCursor(nodeGraphClientPoint(event));
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

function nodeGraphModuleActionTargetNodeIds() {
  const targetNodeId = nodeGraphModuleActionTargetNodeId();
  const selectedIds = [...nodeGraphSelectedNodeIds()].filter((id) => nodeGraphPatchNode(id));
  const ids = selectedIds.length ? selectedIds : targetNodeId ? [targetNodeId] : [];
  return [...new Set(ids)].filter((id) => nodeGraphPatchNode(id));
}

function nodeGraphDeepCloneModuleField(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function nodeGraphCopiedModuleSizeOptions(sourceNode) {
  const options = {};
  if (!sourceNode) {
    return options;
  }
  // Always pin effective width so copies match the on-screen box even when
  // widthGu was omitted because it matched the type default.
  if (typeof nodeGraphPatchNodeGridWidthUnits === "function") {
    options.widthGu = nodeGraphPatchNodeGridWidthUnits(sourceNode);
  } else if (Object.hasOwn(sourceNode, "widthGu")) {
    options.widthGu = sourceNode.widthGu;
  }
  const heightCapability = typeof nodeGraphModuleSizingCapabilities === "function"
    ? nodeGraphModuleSizingCapabilities(sourceNode.type)?.moduleHeight
    : "";
  // Face modules store height as ui.displayHeightOffsetGu — do not invent a
  // heightGu that fights that offset. Freehand-height modules always pin heightGu.
  if (Object.hasOwn(sourceNode, "heightGu")) {
    options.heightGu = sourceNode.heightGu;
  } else if (heightCapability === "textBox" || heightCapability === "custom") {
    options.heightGu = typeof nodeGraphPatchNodeGridHeightUnits === "function"
      ? nodeGraphPatchNodeGridHeightUnits(sourceNode)
      : sourceNode.heightGu;
  }
  return options;
}

function copyNodeGraphModule(sourceNode) {
  if (typeof nodeGraphModuleTypeIsUniqueInPatch === "function"
    && nodeGraphModuleTypeIsUniqueInPatch(sourceNode?.type)) {
    return;
  }
  if (typeof nodeGraphEfficientProductEnabled === "function"
    && nodeGraphEfficientProductEnabled()
    && typeof nodeGraphModuleIsEfficientProductPlanType === "function"
    && !nodeGraphModuleIsEfficientProductPlanType(sourceNode?.type)) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("not in efficient build");
    }
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  counts[sourceNode.type] = (counts[sourceNode.type] || 0) + 1;
  const id = `${sourceNode.type}-${counts[sourceNode.type]}`;
  const gridPoint = nodeGraphFindCopiedModuleGridPoint(sourceNode, patch.nodes);
  const sizingOptions = nodeGraphCopiedModuleSizeOptions(sourceNode);
  // Seed through createNodeGraphPatchNode for normalization, then overlay every
  // own property from the source so nothing (ui offsets, display settings,
  // playlists, …) is dropped by the old per-type allowlist.
  const created = createNodeGraphPatchNode(sourceNode.type, {
    alias: sourceNode.alias,
    gx: gridPoint.gx,
    gy: gridPoint.gy,
    id,
    layout: sourceNode.layout,
    led: sourceNode.led,
    graph: sourceNode.graph,
    codeblock: sourceNode.codeblock,
    ui: nodeGraphDeepCloneModuleField(sourceNode.ui),
    ...sizingOptions,
  });
  const skip = new Set(["id", "gx", "gy", "type"]);
  for (const key of Object.keys(sourceNode)) {
    if (skip.has(key)) {
      continue;
    }
    created[key] = nodeGraphDeepCloneModuleField(sourceNode[key]);
  }
  created.id = id;
  created.gx = gridPoint.gx;
  created.gy = gridPoint.gy;
  created.type = sourceNode.type;
  if (Number.isFinite(Number(sizingOptions.widthGu))) {
    created.widthGu = sizingOptions.widthGu;
  }
  if (Number.isFinite(Number(sizingOptions.heightGu))) {
    created.heightGu = sizingOptions.heightGu;
  }
  if (typeof cloneNodeGraphTypedDisplaySettings === "function") {
    Object.assign(created, cloneNodeGraphTypedDisplaySettings(sourceNode));
  }
  patch.nodes.push(created);
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
// Settings / Paste Settings / Save to Default actions -- everything about a
// module except its grid position/id/type.
const nodeGraphModuleSettingsFields = Object.freeze([
  "alias",
  "widthGu",
  "heightGu",
  "ui",
  "layout",
  "led",
  "graph",
  "codeblock",
  "customDisplay",
  "knobFace",
  "canvasScript",
  "screenSpaceShader",
  "scopeShader",
  "paramMeta",
  "params",
  "traceDisplaySettings",
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

/**
 * Batch: for each selected module, set every param's metadata default (def)
 * to the current value. Next "reset to default" / new instances of this
 * snapshot use those values.
 */
const nodeGraphPatchDefaultsWindowDefaultSize = Object.freeze({
  width: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.width
    : 380,
  height: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.height
    : 620,
  minWidth: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.minWidth
    : (typeof nodeGraphUnifiedWindowMinSize !== "undefined"
      ? nodeGraphUnifiedWindowMinSize.minWidth
      : 24),
  maxWidth: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.maxWidth
    : 980,
  minHeight: typeof nodeGraphUnifiedWindowDefaultSize !== "undefined"
    ? nodeGraphUnifiedWindowDefaultSize.minHeight
    : (typeof nodeGraphUnifiedWindowMinSize !== "undefined"
      ? nodeGraphUnifiedWindowMinSize.minHeight
      : 120),
});

function applyNodeGraphPatchDefaultsWindowSize(size = {}, element = null) {
  const panel = element || document.getElementById("nodePatchDefaultsPanel");
  if (!panel) {
    return null;
  }
  const normalized = typeof normalizeNodeGraphFloatingWindowSize === "function"
    ? normalizeNodeGraphFloatingWindowSize(size, nodeGraphPatchDefaultsWindowDefaultSize, { element: panel })
    : {
      width: Number(size?.width) || nodeGraphPatchDefaultsWindowDefaultSize.width,
      height: Number(size?.height) || nodeGraphPatchDefaultsWindowDefaultSize.height,
    };
  if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
    applyNodeGraphFloatingWindowSizeVars(panel, "--node-patch-defaults", nodeGraphPatchDefaultsWindowDefaultSize, normalized);
  }
  panel.style.width = `${normalized.width}px`;
  panel.style.height = `${normalized.height}px`;
  if (!nodeGraphMvp.workspaceWindowStates) {
    nodeGraphMvp.workspaceWindowStates = {};
  }
  const prior = nodeGraphMvp.workspaceWindowStates.patchDefaults || {};
  nodeGraphMvp.workspaceWindowStates.patchDefaults = {
    ...prior,
    size: { width: normalized.width, height: normalized.height },
  };
  return normalized;
}

function setNodeGraphPatchDefaultsVisible(visible) {
  const panel = document.getElementById("nodePatchDefaultsPanel");
  if (!panel) {
    return;
  }
  if (visible && !panel.hidden) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(panel);
    }
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("patchDefaults", panel);
    }
    return;
  }
  panel.hidden = !visible;
  if (visible) {
    if (typeof bindNodeGraphFloatingWindowResizeHandle === "function") {
      bindNodeGraphFloatingWindowResizeHandle("patchDefaults");
    }
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(panel);
    }
    const savedSize = nodeGraphMvp.workspaceWindowStates?.patchDefaults?.size
      || nodeGraphPatchDefaultsWindowDefaultSize;
    applyNodeGraphPatchDefaultsWindowSize(savedSize, panel);
    if (nodeGraphMvp._unifiedWindowSwitching) {
      if (typeof markNodeGraphFloatingWindowSurface === "function") {
        markNodeGraphFloatingWindowSurface(panel);
      }
    } else if (typeof applyNodeGraphUnifiedSeatToElement === "function"
      && applyNodeGraphUnifiedSeatToElement(panel)) {
      // Shared Command Center seat.
    } else if (typeof positionNodeGraphWorkspaceWindowFromState === "function") {
      positionNodeGraphWorkspaceWindowFromState("patchDefaults", panel);
    }
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("patchDefaults", panel);
    }
    if (typeof syncNodeGraphSettingsView === "function") {
      syncNodeGraphSettingsView();
    }
    syncNodeGraphReadyPanelChrome();
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("patchDefaults", panel, { open: visible }, { status: false });
  }
}

function applyNodeGraphPatchDefaultsFromCurrentSelection() {
  const ids = typeof nodeGraphSelectedNodeIds === "function"
    ? nodeGraphSelectedNodeIds()
    : [...(nodeGraphMvp?.selectedNodes || [])];
  const targetIds = ids.length
    ? ids
    : (typeof nodeGraphModuleActionTargetNodeId === "function"
      ? [nodeGraphModuleActionTargetNodeId()].filter(Boolean)
      : []);
  if (!targetIds.length) {
    const empty = "Select one or more modules to write current values as defaults.";
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(empty);
    }
    const status = document.getElementById("nodePatchDefaultsStatus");
    if (status) {
      status.textContent = empty;
    }
    return 0;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changed = 0;
  for (const id of targetIds) {
    const node = patch.nodes.find((n) => n.id === id);
    if (!node) {
      continue;
    }
    const keys = Object.keys(node.params || {});
    if (!keys.length) {
      continue;
    }
    node.paramMeta = cloneNodeGraphParamMeta(node.paramMeta || {});
    for (const key of keys) {
      const cur = Number(node.params[key]);
      if (!Number.isFinite(cur)) {
        continue;
      }
      const prev = node.paramMeta[key] && typeof node.paramMeta[key] === "object"
        ? node.paramMeta[key]
        : {};
      node.paramMeta[key] = { ...prev, def: cur, defaultValue: cur };
      changed += 1;
    }
  }
  if (changed) {
    commitNodeGraphPatch(patch, { status: "patch defaults from current values" });
  }
  const message = !targetIds.length
    ? "Select one or more modules to write current values as defaults."
    : changed
      ? `Wrote ${changed} parameter default${changed === 1 ? "" : "s"} from current values.`
      : "No numeric parameters to write as defaults.";
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(message);
  }
  const status = document.getElementById("nodePatchDefaultsStatus");
  if (status) {
    status.textContent = message;
  }
  return changed;
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

function nodeGraphChromeCommitOptions(nodeIds, extra = {}) {
  return {
    chromeEdit: true,
    chromeNodeIds: Array.isArray(nodeIds) ? [...nodeIds] : [],
    markPending: false,
    skipLivePlan: extra.skipLivePlan !== false,
    skipValidate: extra.skipValidate !== false,
    deferUiPanels: true,
    ...extra,
  };
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
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: changedCount > 1 ? "module widths changed" : "module width changed",
    }));
  }
  configureNodeSceneContextMenu("module");
}

function adjustNodeGraphModuleDisplayHeightFromContext(delta) {
  // Resize applies to any display AREA -- oscilloscope or custom UI (e.g.
  // xyPad's pad); the show/hide toggle stays oscilloscope-only.
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
    if (!nodeGraphPatchNodeHasResizableDisplayArea(targetNode)) {
      continue;
    }
    if (nodeGraphApplyModuleHeightDelta(targetNode, delta)) {
      changedCount += 1;
    }
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: changedCount > 1 ? "module display heights changed" : "module display height changed",
    }));
  }
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
  commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions([sourceNode.id], {
    status: "text box text size changed",
  }));
  configureNodeSceneContextMenu("module");
}

function adjustNodeGraphModuleHeightFromContext(delta) {
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
    const targetCapability = nodeGraphModuleSizingCapabilities(targetNode?.type).moduleHeight;
    if (!["custom", "textBox"].includes(targetCapability)) {
      continue;
    }
    const currentHeightGu = nodeGraphPatchNodeGridHeightUnits(targetNode);
    const nextHeightGu = targetCapability === "textBox"
      ? normalizeNodeGraphTextBoxHeightUnits(currentHeightGu + delta, targetNode.ui)
      : normalizeNodeGraphModuleHeightUnits(targetNode.type, currentHeightGu + delta, targetNode.ui);
    if (nextHeightGu === currentHeightGu) {
      continue;
    }
    const defaultHeightGu = nodeGraphModuleGridHeightUnitsForUi(targetNode.type, targetNode.ui);
    if (nextHeightGu === defaultHeightGu) {
      delete targetNode.heightGu;
    } else {
      targetNode.heightGu = nextHeightGu;
    }
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: changedCount > 1 ? "module heights changed" : "module height changed",
    }));
  }
  configureNodeSceneContextMenu("module");
}

/**
 * Header titles are a label until an explicit rename session (double-click).
 * Multi-select may rename several modules at once; selection changes must not
 * silently retarget a focused alias/title field onto a non-editing module.
 */
function nodeGraphModuleTitleFieldText(el) {
  return String(el?.textContent ?? "").replace(/\u00a0/g, " ");
}

function nodeGraphModuleTitleInputIsEditing(input) {
  return Boolean(input?.dataset?.titleEditing === "1");
}

function nodeGraphModuleTitleInputsEditing() {
  return [...document.querySelectorAll(".node-header-title[data-title-editing='1']")];
}

function nodeGraphModuleTitleInputForNodeId(nodeId) {
  const id = String(nodeId || "");
  if (!id) {
    return null;
  }
  return document.querySelector(
    `.dsp-node[data-node="${CSS.escape(id)}"] .node-header-title`,
  );
}

function nodeGraphModuleTitleFieldBeginEdit(el) {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.contentEditable = "true";
  el.tabIndex = 0;
  el.dataset.titleEditing = "1";
  el.setAttribute("role", "textbox");
  el.setAttribute("aria-multiline", "false");
}

function nodeGraphModuleTitleFieldEndEdit(el) {
  if (!(el instanceof HTMLElement)) {
    return;
  }
  el.contentEditable = "false";
  el.tabIndex = -1;
  delete el.dataset.titleEditing;
  el.setAttribute("role", "text");
}

/** End any open header-title rename sessions (commit or revert). */
function endAllNodeGraphModuleTitleEdits({ commit = true, revert = false } = {}) {
  const editing = nodeGraphModuleTitleInputsEditing();
  if (!editing.length) {
    return;
  }
  const primary = editing.find((el) => document.activeElement === el) || editing[0];
  const value = nodeGraphModuleTitleFieldText(primary);
  const ids = editing.map((el) => el.dataset.node).filter(Boolean);
  for (const input of editing) {
    if (revert && input.dataset.node) {
      const patchNode = typeof nodeGraphPatchNode === "function"
        ? nodeGraphPatchNode(input.dataset.node)
        : null;
      input.textContent = typeof nodeGraphPatchNodeTitle === "function"
        ? nodeGraphPatchNodeTitle(patchNode || { id: input.dataset.node })
        : nodeGraphModuleTitleFieldText(input);
    }
    nodeGraphModuleTitleFieldEndEdit(input);
  }
  if (commit && !revert && ids.length) {
    commitNodeGraphModuleTitleFromHeaderInput(ids[0], value, { multiIds: ids });
  }
}

/**
 * Begin rename on the title label. Multi-select opens the same session on
 * every selected module (same alias applied on commit).
 */
function startNodeGraphModuleTitleEdit(primaryInput, pointerEvent = null) {
  if (!(primaryInput instanceof HTMLElement)) {
    return;
  }
  if (primaryInput.dataset.titleLocked === "1") {
    return;
  }
  const primaryId = String(primaryInput.dataset.node || "");
  if (!primaryId) {
    return;
  }
  let ids = [primaryId];
  if (typeof nodeGraphSelectedNodeIds === "function") {
    const selected = [...nodeGraphSelectedNodeIds()];
    if (selected.includes(primaryId) && selected.length > 1) {
      ids = selected;
    }
  }
  const already = nodeGraphModuleTitleInputsEditing();
  const alreadyIds = new Set(already.map((el) => el.dataset.node));
  if (already.length && ![...alreadyIds].every((id) => ids.includes(id))) {
    endAllNodeGraphModuleTitleEdits({ commit: true });
  }
  for (const id of ids) {
    const field = id === primaryId
      ? primaryInput
      : nodeGraphModuleTitleInputForNodeId(id);
    if (!(field instanceof HTMLElement) || field.dataset.titleLocked === "1") {
      continue;
    }
    nodeGraphModuleTitleFieldBeginEdit(field);
  }
  if (typeof textBoxWidgetPlaceCaretAtPoint === "function"
    && Number.isFinite(Number(pointerEvent?.clientX))) {
    textBoxWidgetPlaceCaretAtPoint(
      primaryInput,
      Number(pointerEvent.clientX),
      Number(pointerEvent.clientY),
    );
    return;
  }
  try {
    primaryInput.focus({ preventScroll: true });
  } catch {
    primaryInput.focus();
  }
}

/** Sync sibling multi-edit title fields while typing. */
function syncNodeGraphModuleTitleEditPeers(sourceInput) {
  if (!nodeGraphModuleTitleInputIsEditing(sourceInput)) {
    return;
  }
  const value = nodeGraphModuleTitleFieldText(sourceInput);
  for (const field of nodeGraphModuleTitleInputsEditing()) {
    if (field !== sourceInput && nodeGraphModuleTitleFieldText(field) !== value) {
      field.textContent = value;
    }
  }
}

// Commits an inline edit made directly in a module's header title field
// (see createNodeGraphModuleHeader) to node.alias -- same normalize/commit
// as the context-menu alias field (setNodeGraphModuleAliasFromContext),
// just addressed by node id instead of reading the currently-targeted
// context-menu node, since the header input can be edited without the
// context menu open at all.
// multiIds: optional list for multi-select rename (one undo step).
function commitNodeGraphModuleTitleFromHeaderInput(nodeId, value, { multiIds = null } = {}) {
  const ids = [...new Set(
    (Array.isArray(multiIds) && multiIds.length ? multiIds : [nodeId])
      .map((id) => String(id || ""))
      .filter(Boolean),
  )];
  if (!ids.length) {
    return;
  }
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const alias = normalizeNodeGraphPatchNodeAlias(value);
  let changed = 0;
  for (const id of ids) {
    const targetNode = patch.nodes.find((node) => node.id === id);
    if (!targetNode) {
      continue;
    }
    const prev = normalizeNodeGraphPatchNodeAlias(targetNode.alias) || "";
    const next = alias || "";
    if (prev === next && Boolean(targetNode.alias) === Boolean(alias)) {
      continue;
    }
    if (alias) {
      targetNode.alias = alias;
    } else {
      delete targetNode.alias;
    }
    changed += 1;
  }
  if (!changed) {
    return;
  }
  commitNodeGraphPatch(patch, {
    status: changed > 1
      ? (alias ? "module titles changed" : "module titles cleared")
      : (alias ? "module title changed" : "module title cleared"),
  });
}

function setNodeGraphKnobTextFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "knob") {
    return;
  }
  const input = document.getElementById("nodeSceneKnobTextInput");
  if (typeof nodeGraphKnobFaceWriteLabelText === "function") {
    nodeGraphKnobFaceWriteLabelText(sourceNode.id, input?.value, { record });
  }
}

function setNodeGraphModuleAliasFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode) {
    return;
  }
  const input = document.getElementById("nodeSceneAliasInput");
  // Capture before any commit — applyNodeGraphPatchToDom rebuilds modules and
  // can blur the field mid-keystroke (Backspace was the usual repro).
  const hadFocus = Boolean(input && document.activeElement === input);
  const selectionStart = input?.selectionStart ?? null;
  const selectionEnd = input?.selectionEnd ?? selectionStart;
  const alias = normalizeNodeGraphPatchNodeAlias(input?.value);

  // Live typing (input event, record:false): mutate the live patch + soft-update
  // alias consumers (header title, Knob face) without a full commit
  // (which rebuilds every module DOM and kicks the caret out of the field).
  if (!record) {
    if (alias) {
      sourceNode.alias = alias;
    } else {
      delete sourceNode.alias;
    }
    if (nodeGraphMvp) {
      nodeGraphMvp.patchDirtyState = "edited";
    }
    // Header title tracks alias live while Module Settings is open.
    const moduleEl = document.querySelector(`.dsp-node[data-node="${CSS.escape(sourceNode.id)}"]`);
    const headerTitle = moduleEl?.querySelector?.(".node-header-title");
    if (headerTitle && document.activeElement !== headerTitle) {
      const display = alias || nodeGraphDefaultNodeTitle(sourceNode.type, sourceNode.id);
      if (headerTitle.tagName === "INPUT") {
        headerTitle.value = display;
      } else {
        headerTitle.textContent = display;
      }
    }
    return;
  }

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
  // Restore after full rebuild (change/blur path). Use hadFocus — activeElement
  // is often already body by the time we get here.
  if (hadFocus && input?.isConnected) {
    input.focus({ preventScroll: true });
    if (selectionStart !== null && typeof input.setSelectionRange === "function") {
      try {
        input.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
      } catch {
        // setSelectionRange can throw on non-text inputs; alias is type=text.
      }
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
  // Step Graph: x/y + curve + shape on one row. Smooth Graph: x/y only.
  const usesPerNodeContour = Boolean(options.usesPerNodeContour);
  const usesPerNodeShapeSelect = Boolean(options.usesPerNodeShapeSelect);
  const activeIndex = selectedNodeGraphGraphIndex(graphData, selectedIndex);
  const canRemove = graphData.nodes.length > 2;
  list.replaceChildren();
  const header = document.createElement("div");
  header.className = "scene-context-graph-node-row scene-context-graph-node-row-header";
  const labels = usesPerNodeContour
    ? (usesPerNodeShapeSelect
      ? ["#", "x", "y", "curve", "shape", ""]
      : ["#", "x", "y", "curve", ""])
    : ["#", "x", "y", ""];
  for (const label of labels) {
    const span = document.createElement("span");
    span.textContent = label;
    header.append(span);
  }
  list.append(header);
  list.dataset.graphListMode = usesPerNodeContour
    ? (usesPerNodeShapeSelect ? "curve-shape" : "curve")
    : "points";
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
    label.title = "Select node";
    row.append(label);
    row.append(createNodeGraphGraphRowNumberInput(index, "x", node.x));
    row.append(createNodeGraphGraphRowNumberInput(index, "y", node.y));
    if (usesPerNodeContour) {
      // Curve + shape sit on the same row (never a separate editor block).
      row.append(createNodeGraphGraphRowNumberInput(index, "c", node.c, {
        min: -1,
        max: 1,
      }));
      if (usesPerNodeShapeSelect) {
        row.append(createNodeGraphGraphRowShapeSelect(index, node.shape));
      }
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "scene-context-graph-node-remove";
    remove.textContent = "✕";
    remove.dataset.graphNodeRemove = String(index);
    remove.setAttribute("aria-label", `Remove graph node ${index + 1}`);
    remove.title = canRemove ? "Remove node" : "Need at least 2 nodes";
    remove.disabled = !canRemove;
    row.append(remove);
    list.append(row);
  });
  // [+] square under the last node — only add affordance.
  const addRow = document.createElement("div");
  addRow.className = "scene-context-graph-node-add-row";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "nodeSceneGraphAddNode";
  addButton.className = "scene-context-graph-node-add";
  addButton.textContent = "+";
  addButton.setAttribute("aria-label", "Add graph node");
  addButton.title = "Add node";
  addRow.append(addButton);
  list.append(addRow);
}

function syncNodeGraphGraphControls(graph, selectedIndex = selectedNodeGraphGraphIndex(graph), options = {}) {
  const graphData = normalizeNodeGraphGraph(graph);
  const index = selectedNodeGraphGraphIndex(graphData, selectedIndex);
  // Prefer an explicit node id (drag / caller). Falling back to the module
  // actions target is fine for panel edits, but must never paint face A with
  // graph data meant for face B.
  const nodeId = String(options.nodeId || nodeGraphModuleActionTargetNodeId() || "").trim();
  const patchNode = nodeGraphPatchNode(nodeId);
  const graphNodeType = patchNode?.type || "";
  const usesPerNodeContour = typeof nodeGraphGraphUsesPerNodeContour === "function"
    ? nodeGraphGraphUsesPerNodeContour(graphNodeType)
    : nodeGraphGraphUsesPerNodeShapes(graphNodeType);
  const usesPerNodeShapeSelect = typeof nodeGraphGraphUsesPerNodeShapeSelect === "function"
    ? nodeGraphGraphUsesPerNodeShapeSelect(graphNodeType)
    : false;
  const paintFace = options.face !== false;
  if (nodeGraphModuleIsGraphType(graphNodeType)) {
    setNodeGraphGraphSelectedNodeIndex(nodeId, graphData, index);
    if (paintFace) {
      // Only ever paint the workspace face for this exact node id.
      const moduleElement = typeof nodeGraphGraphLiveDisplayForNodeId === "function"
        ? nodeGraphGraphLiveDisplayForNodeId(nodeId)?.closest?.(".dsp-node")
        : nodeGraphNodeElement(nodeId);
      if (moduleElement) {
        syncNodeGraphGraphElement(moduleElement, {
          ...patchNode,
          graph: graphData,
          id: nodeId,
        });
      }
    }
  }
  renderNodeGraphGraphNodeList(graphData, index, { usesPerNodeContour, usesPerNodeShapeSelect });
  const cursorInput = document.getElementById("nodeSceneGraphCursorX");
  if (cursorInput) {
    cursorInput.value = graphData.cursorX.toFixed(3);
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
  syncNodeGraphGraphPhaseParameterFromCursor(targetNode);
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

function selectNodeGraphGraphNodeFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphModuleIsGraphType(sourceNode.type)) {
    return;
  }
  syncNodeGraphGraphControls(nodeGraphGraphForNode(sourceNode));
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
  const usesPerNodeContour = typeof nodeGraphGraphUsesPerNodeContour === "function"
    ? nodeGraphGraphUsesPerNodeContour(targetNode.type)
    : nodeGraphGraphUsesPerNodeShapes(targetNode.type);
  const usesPerNodeShapeSelect = typeof nodeGraphGraphUsesPerNodeShapeSelect === "function"
    ? nodeGraphGraphUsesPerNodeShapeSelect(targetNode.type)
    : false;
  if (field === "c" && !usesPerNodeContour) {
    return;
  }
  if (field === "shape" && !usesPerNodeShapeSelect) {
    return;
  }
  // While typing, intermediate values like "" or "0." are not finite yet.
  // Keep focus and wait for a complete number; shape selects always apply.
  if (field !== "shape") {
    const raw = String(event.target.value ?? "").trim();
    if (raw === "" || raw === "-" || raw === "." || raw === "-." || raw.endsWith("e") || raw.endsWith("E") || raw.endsWith("-")) {
      return;
    }
    if (!Number.isFinite(Number(raw))) {
      return;
    }
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  const selectedIndex = nodeGraphGraphNodeIndexFromValue(graph, rowIndex);
  const node = graph.nodes[selectedIndex];
  graph.nodes[selectedIndex] = normalizeNodeGraphGraphNode({
    ...node,
    [field]: event.target.value,
  }, selectedIndex);
  targetNode.graph = graph;

  if (!record) {
    // Live typing path: update curve + worklet graph WITHOUT rebuilding the
    // node list (which would steal focus from the input being edited).
    const liveNode = nodeGraphMvp?.patch?.nodes?.find?.((candidate) => candidate.id === targetNode.id);
    if (liveNode) {
      liveNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(liveNode)
        ? nodeGraphGraphWithLockedEndpointY(graph, selectedIndex)
        : normalizeNodeGraphGraph(graph);
      syncNodeGraphGraphDisplaysForNode(targetNode.id, liveNode);
    }
    if (typeof scheduleNodeGraphLivePlanSync === "function") {
      scheduleNodeGraphLivePlanSync();
    }
    if (typeof setNodeGraphPatchDirtyState === "function") {
      setNodeGraphPatchDirtyState("edited");
    } else {
      nodeGraphMvp.patchDirtyState = "edited";
    }
    return;
  }

  // Blur/change: commit to history and full-sync controls.
  commitNodeGraphGraphEdit(patch, targetNode, "graph node changed", { record: true, selectedIndex });
}

function handleNodeGraphGraphNodeListClick(event) {
  const addButton = event.target?.closest?.("#nodeSceneGraphAddNode, .scene-context-graph-node-add");
  if (addButton) {
    addNodeGraphGraphNodeFromContext();
    return;
  }
  const removeButton = event.target?.closest?.("[data-graph-node-remove]");
  if (removeButton) {
    removeNodeGraphGraphNodeFromContext(removeButton.dataset.graphNodeRemove);
    return;
  }
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

function removeNodeGraphGraphNodeFromContext(indexOverride = null) {
  const { patch, targetNode } = nodeGraphGraphTargetFromContext();
  if (!targetNode) {
    return;
  }
  const graph = normalizeNodeGraphGraph(targetNode.graph);
  if (graph.nodes.length <= 2) {
    return;
  }
  const selectedIndex = indexOverride != null && String(indexOverride).trim() !== ""
    ? nodeGraphGraphNodeIndexFromValue(graph, indexOverride)
    : selectedNodeGraphGraphIndex(graph);
  graph.nodes.splice(selectedIndex, 1);
  targetNode.graph = graph;
  const nextIndex = Math.max(0, Math.min(selectedIndex, graph.nodes.length - 1));
  setNodeGraphGraphSelectedNodeIndex(targetNode.id, graph, nextIndex);
  commitNodeGraphGraphEdit(patch, targetNode, "graph node removed", {
    selectedIndex: nextIndex,
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
  commitNodeGraphPatch(patch, { softDom: true, skipLivePlan: true, status: "text box mode changed" });
  const live = nodeGraphPatchNode(sourceNode.id);
  const el = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(sourceNode.id) : null;
  if (el && live && typeof syncNodeGraphTextBoxElement === "function") {
    syncNodeGraphTextBoxElement(el, live);
  }
  configureNodeSceneContextMenu("module");
}

function setNodeGraphTextBoxTextFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || !nodeGraphNodeTypeHasTextBoxLayout(sourceNode.type)) {
    return;
  }
  const input = document.getElementById("nodeSceneTextBoxTextInput");
  const text = input?.value ?? "";
  if (typeof nodeGraphTextBoxHostApplySceneText === "function") {
    nodeGraphTextBoxHostApplySceneText(sourceNode.id, text, { commit: record === true });
    return;
  }
  nodeGraphTextBoxHostWriteLiveText?.(sourceNode.id, text);
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
  commitNodeGraphPatch(patch, { softDom: true, skipLivePlan: true, status: "text box alignment changed" });
  const live = nodeGraphPatchNode(sourceNode.id);
  const el = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(sourceNode.id) : null;
  if (el && live && typeof syncNodeGraphTextBoxElement === "function") {
    syncNodeGraphTextBoxElement(el, live);
  }
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
    softDom: true,
    skipLivePlan: true,
    status: "text box vertical position changed",
  });
  const live = nodeGraphPatchNode(sourceNode.id);
  const el = typeof nodeGraphNodeElement === "function" ? nodeGraphNodeElement(sourceNode.id) : null;
  if (el && live && typeof syncNodeGraphTextBoxElement === "function") {
    syncNodeGraphTextBoxElement(el, live);
  }
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
  if (typeof nodeGraphPickImageFile !== "function") {
    return;
  }
  nodeGraphPickImageFile((asset) => {
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
    if (!targetNode) {
      return;
    }
    targetNode.layout = normalizeNodeGraphImageLayout({
      dataUrl: asset.dataUrl,
      fileName: asset.fileName || "trace-image",
      refreshedAt: Date.now(),
    });
    commitNodeGraphPatch(patch, { status: "image loaded" });
    configureNodeSceneContextMenu("module");
    scheduleNodeGraphModuleScopeDraw();
  });
}

function saveNodeGraphImageFromContext() {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  const layout = normalizeNodeGraphImageLayout(sourceNode?.layout);
  if (!sourceNode || sourceNode.type !== "image" || !layout.dataUrl) {
    return;
  }
  if (typeof nodeGraphSaveImageAsset === "function") {
    nodeGraphSaveImageAsset(layout, "trace-image");
  }
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

function setNodeGraphKeypadLayoutFromContext() {
  // Keypad look is Display Settings only (Sound Color Widgets + steppers).
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
  const hue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(input?.value)
    : 0;
  targetNode.vectorDotSettings = typeof normalizeNodeGraphVectorDotSettings === "function"
    ? normalizeNodeGraphVectorDotSettings({
      ...(targetNode.vectorDotSettings || {}),
      hue,
      color: input?.value,
      dot1Color: input?.value,
    })
    : { ...(targetNode.vectorDotSettings || {}), hue };
  commitNodeGraphPatch(patch, {
    record,
    status: "led color changed",
  });
  scheduleNodeGraphModuleScopeDraw();
  if (document.activeElement === input) {
    input.focus();
  }
}

function setNodeGraphBugButtonGlyphFromContext({ record = true } = {}) {
  const sourceNode = nodeGraphPatchNode(nodeGraphModuleActionTargetNodeId());
  if (!sourceNode || sourceNode.type !== "bugButton") {
    return;
  }
  const input = document.getElementById("nodeSceneBugButtonGlyph");
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const targetNode = patch.nodes.find((node) => node.id === sourceNode.id);
  if (!targetNode) {
    return;
  }
  const glyph = normalizeNodeGraphBugButtonGlyph(input?.value);
  if (glyph === normalizeNodeGraphBugButtonGlyph(targetNode.bugButton?.glyph)) {
    return;
  }
  targetNode.bugButton = { glyph };
  const selectionStart = input?.selectionStart;
  const selectionEnd = input?.selectionEnd;
  commitNodeGraphPatch(patch, {
    record,
    status: "bug button character changed",
  });
  if (input && document.getElementById("nodeSceneBugButtonGlyph") === input) {
    input.focus();
    try {
      if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    } catch (_) {}
  }
}

/** Multi-select visibility: if any eligible is visible → hide all; else show all. */
function nodeGraphModuleActionMultiWantHidden(eligibleNodes, isEffectivelyHidden) {
  if (!eligibleNodes.length) {
    return null;
  }
  const anyVisible = eligibleNodes.some((node) => !isEffectivelyHidden(node));
  return anyVisible;
}

function toggleNodeGraphModuleButtonsFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).buttonsHidden,
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const ui = nodeGraphPatchNodeUiSetSectionWantHidden(
      normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type),
      "buttons",
      wantHidden,
      nodeGraphMvp.moduleButtonsVisible,
    );
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "module buttons hidden" : "module buttons hidden")
        : (changedCount > 1 ? "module buttons shown" : "module buttons shown"),
    }));
  }
  renderNodeGraphModuleVisibilityToggles({ skipModuleSync: true });
  configureNodeSceneContextMenu("module");
}

/** If any selected/target module is enabled → disable all; if all disabled → enable. */
function toggleNodeGraphModulesEnabledForIds(targetNodeIds, options = {}) {
  const ids = [...new Set((targetNodeIds || []).map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) {
    return false;
  }
  const sources = ids.map((id) => nodeGraphPatchNode(id)).filter(Boolean);
  if (!sources.length) {
    return false;
  }

  // Single Output selection keeps the dedicated live-output toggle.
  if (sources.length === 1 && sources[0].id === "output") {
    toggleNodeGraphLiveOutput();
    if (options.configureMenu !== false) {
      configureNodeSceneContextMenu("module");
    }
    return true;
  }

  const isEnabled = (node) => {
    if (node.id === "output") {
      return Boolean(nodeGraphMvp.live.outputEnabled);
    }
    return !nodeGraphNodeDisplaysBypassed(node.id);
  };
  const anyEnabled = sources.some(isEnabled);
  const wantEnabled = !anyEnabled;

  let outputToggled = false;
  if (sources.some((node) => node.id === "output")) {
    const outputEnabled = Boolean(nodeGraphMvp.live.outputEnabled);
    if (outputEnabled !== wantEnabled) {
      toggleNodeGraphLiveOutput();
      outputToggled = true;
    }
  }

  const nonOutputIds = sources
    .filter((node) => node.id !== "output")
    .map((node) => node.id);
  if (!nonOutputIds.length) {
    if (outputToggled && options.configureMenu !== false) {
      configureNodeSceneContextMenu("module");
    }
    return outputToggled;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const bypassed = new Set(patch.bypassedNodes || []);
  for (const id of nonOutputIds) {
    if (wantEnabled) {
      bypassed.delete(id);
    } else {
      bypassed.add(id);
    }
  }
  patch.bypassedNodes = [...bypassed];
  commitNodeGraphPatch(patch, {
    status: wantEnabled
      ? (nonOutputIds.length > 1 ? "modules enabled" : "module enabled")
      : (nonOutputIds.length > 1 ? "modules disabled" : "module disabled"),
  });
  if (options.configureMenu !== false) {
    configureNodeSceneContextMenu("module");
  }
  return true;
}

function toggleNodeGraphModuleEnabledFromContext() {
  toggleNodeGraphModulesEnabledForIds(nodeGraphModuleActionTargetNodeIds());
}

/** Command-center Disable: selection only (no-op if nothing selected, like Delete). */
function toggleNodeGraphSelectedModulesEnabled() {
  const selectedIds = typeof nodeGraphSelectedNodeIds === "function"
    ? [...nodeGraphSelectedNodeIds()]
    : [];
  if (!selectedIds.length) {
    return;
  }
  toggleNodeGraphModulesEnabledForIds(selectedIds);
}

function toggleNodeGraphModuleTitleFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => Boolean(normalizeNodeGraphPatchNodeUi(node.ui, node.type).titleHidden),
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
    if (Boolean(ui.titleHidden) === wantHidden) {
      continue;
    }
    ui.titleHidden = wantHidden;
    applyNodeGraphPatchNodeUi(targetNode, ui);
    // LayoutC height is content-derived: raise stored heightGu if title needs more room.
    if (
      typeof nodeGraphModuleUsesLayoutC === "function"
      && nodeGraphModuleUsesLayoutC(targetNode.type)
      && typeof nodeGraphLayoutCGridHeightUnits === "function"
    ) {
      const nextHeight = nodeGraphLayoutCGridHeightUnits(targetNode.type, ui, targetNode.heightGu);
      if (Number.isFinite(nextHeight)) {
        targetNode.heightGu = nextHeight;
      }
    }
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "module titles hidden" : "module title hidden")
        : (changedCount > 1 ? "module titles shown" : "module title shown"),
    }));
  }
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleOscilloscopeFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter((node) => node && nodeGraphPatchNodeHasHideableOscilloscope(node));
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).oscilloscopeHidden,
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  const eligibleIds = new Set(sources.map((node) => node.id));
  for (const targetNode of patch.nodes) {
    if (!eligibleIds.has(targetNode.id) || !nodeGraphPatchNodeHasHideableOscilloscope(targetNode)) {
      continue;
    }
    const ui = nodeGraphPatchNodeUiSetSectionWantHidden(
      normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type),
      "oscilloscope",
      wantHidden,
      nodeGraphMvp.moduleOscilloscopesVisible,
    );
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      deferLivePlan: true,
      status: wantHidden
        ? (changedCount > 1 ? "module displays hidden" : "module display hidden")
        : (changedCount > 1 ? "module displays shown" : "module display shown"),
    }));
  }
  renderNodeGraphModuleVisibilityToggles({ skipModuleSync: true });
  configureNodeSceneContextMenu("module");
}

function applyNodeGraphPatchNodeUi(targetNode, ui) {
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, targetNode?.type);
  // Persist ui only when a non-default flag is set. LayoutB titles default on
  // (titleHidden:false); Hide title persists via titleHidden:true.
  if (
    normalizedUi.buttonsHidden
    || normalizedUi.buttonsForceShow
    || normalizedUi.ioHidden
    || normalizedUi.hideUnused
    || normalizedUi.interfaceControlsHidden
    || normalizedUi.interfaceControlsForceShow
    || normalizedUi.titleHidden
    || normalizedUi.oscilloscopeHidden
    || normalizedUi.oscilloscopeForceShow
    || normalizedUi.slidersHidden
    || normalizedUi.slidersForceShow
    || normalizedUi.displayHeightOffsetGu
  ) {
    targetNode.ui = normalizedUi;
  } else {
    delete targetNode.ui;
  }
}

function toggleNodeGraphModuleCollapsedFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!sources.length) {
    return;
  }
  const wantCollapsed = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => typeof nodeGraphModuleIsCollapsedUi === "function"
      && nodeGraphModuleIsCollapsedUi(node.type, node.ui),
  );
  if (wantCollapsed === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
    const already = typeof nodeGraphModuleIsCollapsedUi === "function"
      && nodeGraphModuleIsCollapsedUi(targetNode.type, ui);
    if (already === wantCollapsed) {
      continue;
    }
    ui.titleHidden = wantCollapsed;
    ui.buttonsHidden = wantCollapsed;
    ui.ioHidden = wantCollapsed;
    if (typeof nodeGraphModuleTypeHasHideableSliders === "function"
      && nodeGraphModuleTypeHasHideableSliders(targetNode.type)) {
      ui.slidersHidden = wantCollapsed;
    }
    if (typeof nodeGraphPatchNodeHasHideableOscilloscope === "function"
      && nodeGraphPatchNodeHasHideableOscilloscope(targetNode)) {
      const next = typeof nodeGraphPatchNodeUiSetSectionWantHidden === "function"
        ? nodeGraphPatchNodeUiSetSectionWantHidden(
          ui,
          "oscilloscope",
          wantCollapsed,
          nodeGraphMvp.moduleOscilloscopesVisible,
        )
        : ui;
      next.oscilloscopeHidden = wantCollapsed;
      applyNodeGraphPatchNodeUi(targetNode, next);
    } else {
      applyNodeGraphPatchNodeUi(targetNode, ui);
    }
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      deferLivePlan: true,
      status: wantCollapsed
        ? (changedCount > 1 ? "modules collapsed" : "module collapsed")
        : (changedCount > 1 ? "modules expanded" : "module expanded"),
    }));
  }
  if (typeof renderNodeGraphModuleVisibilityToggles === "function") {
    renderNodeGraphModuleVisibilityToggles({ skipModuleSync: true });
  }
  configureNodeSceneContextMenu("module");
}

/** Hide unconnected jacks on selected modules (CSS unused-hidden). */
function toggleNodeGraphModuleHideUnusedFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => Boolean(normalizeNodeGraphPatchNodeUi(node.ui, node.type).hideUnused),
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
    if (Boolean(ui.hideUnused) === wantHidden) {
      continue;
    }
    ui.hideUnused = wantHidden;
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, {
      status: wantHidden
        ? (changedCount > 1 ? "unused ports hidden" : "unused ports hidden")
        : (changedCount > 1 ? "unused ports shown" : "unused ports shown"),
    });
  }
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleInterfaceControlsFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter((node) => node && nodeGraphModuleTypeHasInterfaceControls(node.type));
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).interfaceControlsHidden,
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  const eligibleIds = new Set(sources.map((node) => node.id));
  for (const targetNode of patch.nodes) {
    if (!eligibleIds.has(targetNode.id) || !nodeGraphModuleTypeHasInterfaceControls(targetNode.type)) {
      continue;
    }
    const ui = nodeGraphPatchNodeUiSetSectionWantHidden(
      normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type),
      "interfaceControls",
      wantHidden,
      nodeGraphMvp.moduleInterfaceControlsVisible,
    );
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "module control surfaces hidden" : "module control surface hidden")
        : (changedCount > 1 ? "module control surfaces shown" : "module control surface shown"),
    }));
  }
  renderNodeGraphModuleVisibilityToggles({ skipModuleSync: true });
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleIoFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => Boolean(normalizeNodeGraphPatchNodeUi(node.ui, node.type).ioHidden),
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const targetNode of patch.nodes) {
    if (!targetNodeIds.includes(targetNode.id)) {
      continue;
    }
    const ui = normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type);
    if (Boolean(ui.ioHidden) === wantHidden) {
      continue;
    }
    ui.ioHidden = wantHidden;
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "module in/out hidden" : "module in/out hidden")
        : (changedCount > 1 ? "module in/out shown" : "module in/out shown"),
    }));
  }
  configureNodeSceneContextMenu("module");
}

function toggleNodeGraphModuleSlidersFromContext() {
  const targetNodeIds = nodeGraphModuleActionTargetNodeIds();
  if (!targetNodeIds.length) {
    return;
  }
  const sources = targetNodeIds
    .map((id) => nodeGraphPatchNode(id))
    .filter((node) => node && nodeGraphModuleTypeHasHideableSliders(node.type));
  if (!sources.length) {
    return;
  }
  const wantHidden = nodeGraphModuleActionMultiWantHidden(
    sources,
    (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).slidersHidden,
  );
  if (wantHidden === null) {
    return;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  const eligibleIds = new Set(sources.map((node) => node.id));
  for (const targetNode of patch.nodes) {
    if (!eligibleIds.has(targetNode.id) || !nodeGraphModuleTypeHasHideableSliders(targetNode.type)) {
      continue;
    }
    const ui = nodeGraphPatchNodeUiSetSectionWantHidden(
      normalizeNodeGraphPatchNodeUi(targetNode.ui, targetNode.type),
      "sliders",
      wantHidden,
      nodeGraphMvp.moduleSlidersVisible,
    );
    applyNodeGraphPatchNodeUi(targetNode, ui);
    changedCount += 1;
  }
  if (changedCount) {
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "module sliders hidden" : "module sliders hidden")
        : (changedCount > 1 ? "module sliders shown" : "module sliders shown"),
    }));
  }
  renderNodeGraphModuleVisibilityToggles({ skipModuleSync: true });
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
  return Boolean(copyNodeGraphModule(sourceNode));
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
    setNodeGraphSelection({ type: "node", id: targetNode.id });
    deleteSelectedNodeGraphItem();
    nodeGraphMvp.sceneContextTargetNode = null;
    return;
  }
  configureNodeSceneContextMenu("module");
}
