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

/** Spawn the Portal MIDI (keyboardController) module if the patch has none. */
function ensureNodeGraphMidiModule() {
  if (nodeGraphMvp.patch.nodes.some((node) => node.type === "keyboardController")) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const counts = nextNodeGraphTypeCounts(patch.nodes);
  const id = counts.keyboardController > 0
    ? `keyboardController-${counts.keyboardController + 1}`
    : "keyboardController";
  const gridPoint = nodeGraphFindFreeModuleGridPoint("keyboardController", patch.nodes, { gx: 2, gy: 1 });
  patch.nodes.push(createNodeGraphPatchNode("keyboardController", {
    id,
    gx: gridPoint.gx,
    gy: gridPoint.gy,
  }));
  commitNodeGraphPatch(patch, { status: "MIDI module shown" });
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
  // Meta In/Out / Voice* only exist inside a Metamodule view (always hidden on Root).
  if (
    typeof nodeGraphMetamoduleIsRootView === "function"
    && nodeGraphMetamoduleIsRootView()
    && (
      (typeof nodeGraphIsMetamoduleBoundaryType === "function"
        && nodeGraphIsMetamoduleBoundaryType(type))
      || (typeof nodeGraphIsMetamoduleVoicePortalType === "function"
        && nodeGraphIsMetamoduleVoicePortalType(type))
    )
  ) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(
        nodeGraphIsMetamoduleVoicePortalType?.(type)
          ? "Open a Metamodule (double-click) to use Voice Frequency / Gate / Trigger."
          : "Open a Metamodule (double-click) to place Meta In / Meta Out.",
      );
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
  const newNode = createNodeGraphPatchNode(type, {
    id,
    gx: gridPoint.gx,
    gy: gridPoint.gy,
  });
  // Inside a Metamodule: claim ownership (and boundary for Meta In/Out).
  if (typeof nodeGraphMetamoduleClaimPlacedNode === "function") {
    nodeGraphMetamoduleClaimPlacedNode(newNode, live);
  }
  const patch = {
    ...live,
    nodes: [
      ...(live.nodes || []),
      newNode,
    ],
  };
  // Fresh Metamodule shell on Root: seed Voice* + default Left/Right outs.
  if (
    typeof nodeGraphIsMetamoduleType === "function"
    && nodeGraphIsMetamoduleType(type)
    && typeof nodeGraphMetamoduleEnsureInterior === "function"
  ) {
    nodeGraphMetamoduleEnsureInterior(newNode.id, patch);
  }
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
  // Face modules store Display Height as ui.displayHeightGu — do not invent a
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
  // Shell/boundary copy would share children/portals (same ids) — not supported yet.
  if (
    typeof nodeGraphIsContainerShellType === "function"
    && nodeGraphIsContainerShellType(sourceNode?.type)
  ) {
    if (typeof setNodeInteractionHelp === "function") {
      const kind = typeof nodeGraphIsGroupType === "function" && nodeGraphIsGroupType(sourceNode?.type)
        ? "Group"
        : "Metamodule";
      setNodeInteractionHelp(
        `Duplicate ${kind} is not supported yet (would share children). Group a new selection instead.`,
      );
    }
    return;
  }
  if (
    typeof nodeGraphIsMetamoduleBoundaryType === "function"
    && nodeGraphIsMetamoduleBoundaryType(sourceNode?.type)
  ) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Duplicate Meta In/Out is not supported. Place a new one inside the Metamodule.");
    }
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
      width: nodeGraphFiniteNumber(size?.width, nodeGraphPatchDefaultsWindowDefaultSize.width),
      height: nodeGraphFiniteNumber(size?.height, nodeGraphPatchDefaultsWindowDefaultSize.height),
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
    // Always persist width — omitting “equal to type default” re-binds old
    // modules when spawn defaults change later.
    targetNode.widthGu = nextWidthGu;
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
    // Always persist height (same reason as widthGu).
    targetNode.heightGu = nextHeightGu;
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
  // Already in edit on this field — do not PlaceCaretAtPoint (kills word select).
  if (primaryInput.dataset.titleEditing === "1") {
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
  // Meta In/Out alias → Root shell jack label.
  const ownerMetaIds = new Set();
  for (const id of ids) {
    const targetNode = patch.nodes.find((node) => node.id === id);
    if (
      targetNode
      && typeof nodeGraphIsMetamoduleBoundaryType === "function"
      && nodeGraphIsMetamoduleBoundaryType(targetNode.type)
      && targetNode.ownerMetamoduleId
    ) {
      ownerMetaIds.add(String(targetNode.ownerMetamoduleId));
    }
  }
  for (const metaId of ownerMetaIds) {
    if (typeof nodeGraphMetamoduleSyncBoundaryShellPorts === "function") {
      nodeGraphMetamoduleSyncBoundaryShellPorts(metaId, patch);
    }
  }
  commitNodeGraphPatch(patch, {
    status: changed > 1
      ? (alias ? "module titles changed" : "module titles cleared")
      : (alias ? "module title changed" : "module title cleared"),
  });
  for (const metaId of ownerMetaIds) {
    if (typeof nodeGraphMetamoduleRemountShell === "function") {
      nodeGraphMetamoduleRemountShell(metaId);
    }
  }
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

function setNodeGraphKnobPluginIdentityFromContext() {
  if (typeof commitNodeGraphKnobPluginIdentity === "function") {
    commitNodeGraphKnobPluginIdentity();
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
  const ownerMetaId = (
    typeof nodeGraphIsMetamoduleBoundaryType === "function"
    && nodeGraphIsMetamoduleBoundaryType(targetNode.type)
    && targetNode.ownerMetamoduleId
  ) ? String(targetNode.ownerMetamoduleId) : "";
  if (ownerMetaId && typeof nodeGraphMetamoduleSyncBoundaryShellPorts === "function") {
    nodeGraphMetamoduleSyncBoundaryShellPorts(ownerMetaId, patch);
  }
  commitNodeGraphPatch(patch, {
    record,
    status: alias ? "module alias changed" : "module alias cleared",
  });
  if (ownerMetaId && typeof nodeGraphMetamoduleRemountShell === "function") {
    nodeGraphMetamoduleRemountShell(ownerMetaId);
  }
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

/** Selected graph node index for face / patch edits (no Module Settings list). */
function selectedNodeGraphGraphIndex(graph, fallback = undefined) {
  const maxIndex = Math.max(0, (graph?.nodes?.length || 1) - 1);
  if (Number.isFinite(Number(fallback))) {
    return Math.max(0, Math.min(maxIndex, Math.round(Number(fallback))));
  }
  return maxIndex;
}

/**
 * Sync Smooth/Step Graph face after edits.
 * Module Settings point-list / presets / transform / clipboard UI was removed —
 * the face is the editor.
 */
function syncNodeGraphGraphControls(graph, selectedIndex = selectedNodeGraphGraphIndex(graph), options = {}) {
  const graphData = normalizeNodeGraphGraph(graph);
  const index = selectedNodeGraphGraphIndex(graphData, selectedIndex);
  const nodeId = String(options.nodeId || nodeGraphModuleActionTargetNodeId() || "").trim();
  const patchNode = nodeGraphPatchNode(nodeId);
  const graphNodeType = patchNode?.type || "";
  const paintFace = options.face !== false;
  if (!nodeGraphModuleIsGraphType(graphNodeType)) {
    return;
  }
  setNodeGraphGraphSelectedNodeIndex(nodeId, graphData, index);
  if (!paintFace) {
    return;
  }
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

function commitNodeGraphGraphEdit(patch, targetNode, status, options = {}) {
  let selectedIndex = selectedNodeGraphGraphIndex(targetNode.graph, options.selectedIndex);
  targetNode.graph = nodeGraphGraphEndpointYLockEnabledForNode(targetNode)
    ? nodeGraphGraphWithLockedEndpointY(targetNode.graph, selectedIndex)
    : normalizeNodeGraphGraph(targetNode.graph);
  if (options.selectedX != null && Number.isFinite(Number(options.selectedX))) {
    selectedIndex = targetNode.graph.nodes.reduce((bestIndex, node, index) => {
      const best = targetNode.graph.nodes[bestIndex];
      return Math.abs(node.x - options.selectedX) < Math.abs(best.x - options.selectedX)
        ? index
        : bestIndex;
    }, 0);
  }
  commitNodeGraphPatch(patch, { record: options.record ?? true, status });
  syncNodeGraphGraphControls(targetNode.graph, selectedIndex, {
    nodeId: targetNode.id,
    face: options.face,
  });
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
  // Persist ui when any non-default chrome flag OR stored face size is set.
  // displayHeightGu must persist — dropping ui here made Display Height +/- a no-op.
  const hasFaceSize = Number.isFinite(Number(normalizedUi.displayHeightGu))
    || Number(normalizedUi.displayHeightOffsetGu) !== 0;
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
    || hasFaceSize
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
    // Chrome path refreshes --node-grid-height-units from outer SSOT after
    // unused-hidden class flips (same refresh as Displays / param visibility).
    commitNodeGraphPatch(patch, nodeGraphChromeCommitOptions(targetNodeIds, {
      status: wantHidden
        ? (changedCount > 1 ? "unused ports hidden" : "unused ports hidden")
        : (changedCount > 1 ? "unused ports shown" : "unused ports shown"),
    }));
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
  if (!entry) {
    const label = targetNode
      ? (typeof nodeGraphNodeDisplayName === "function"
        ? nodeGraphNodeDisplayName(targetNode.id)
        : targetNode.type)
      : "module";
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`No code found: ${label}.`);
    }
    return;
  }
  // Prefer local sandbox paths — GitHub master often lacks branch-only natives
  // (Ping Envelope, Hypersaw2, …) and 404s as "no code found".
  const localHref = typeof nodeGraphLocalSourceHrefForEntry === "function"
    ? nodeGraphLocalSourceHrefForEntry(entry)
    : "";
  if (localHref) {
    nodeGraphOpenUrlInNewTab(localHref);
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`Opened local ${entry.source || localHref}.`);
    }
    return;
  }
  if (entry.sourceUrl) {
    nodeGraphOpenUrlInNewTab(entry.sourceUrl);
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`Opened ${entry.source || entry.sourceUrl}.`);
    }
    return;
  }
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp("No code found for this module.");
  }
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
