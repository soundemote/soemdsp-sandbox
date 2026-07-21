function nodeGraphEventTargetIsEditable(target) {
  return target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function nudgeSelectedNodeGraphModulesOnGrid(axis, direction) {
  const selectedNodeIds = new Set([...nodeGraphSelectedNodeIds()].filter((id) =>
    nodeGraphMvp.activeNodes.has(id),
  ));
  if (!selectedNodeIds.size) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let movedCount = 0;
  for (const patchNode of patch.nodes) {
    if (!selectedNodeIds.has(patchNode.id)) {
      continue;
    }
    const gridKey = axis === "x" ? "gx" : "gy";
    const gridValue = Number(patchNode[gridKey]);
    patchNode[gridKey] = (Number.isFinite(gridValue) ? gridValue : 0) + direction;
    movedCount += 1;
  }
  if (!movedCount) {
    return false;
  }

  commitNodeGraphPatch(patch, {
    status: movedCount === 1 ? "module moved" : "modules moved",
  });
  return true;
}

function nodeGraphCanvasScriptSourceWithGridUnits(source, widthGu, heightGu) {
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits("canvas", widthGu);
  const nextHeightGu = normalizeNodeGraphModuleHeightUnits("canvas", heightGu);
  const gridLine = `canvas.grid(${nextWidthGu}, ${nextHeightGu});`;
  const baseSource = String(source || nodeGraphCanvasScriptDefaultSource || "").trim();
  const gridPattern = /(^|\n)\s*canvas\.grid\s*\(\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)\s*;?/i;
  if (gridPattern.test(baseSource)) {
    return baseSource.replace(gridPattern, (match, prefix) => `${prefix}${gridLine}`);
  }
  return `${gridLine}\n${baseSource}`;
}

function resizeNodeGraphCanvasModuleOnGrid(patchNode, delta) {
  if (nodeGraphModuleSizingCapabilities(patchNode?.type).moduleHeight !== "canvasScript") {
    return false;
  }
  const canvasScript = normalizeNodeGraphCanvasScript(patchNode.canvasScript);
  const currentWidthGu = nodeGraphPatchNodeGridWidthUnits(patchNode);
  const currentHeightGu = nodeGraphPatchNodeGridHeightUnits(patchNode);
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits("canvas", currentWidthGu + delta);
  if (nextWidthGu === currentWidthGu) {
    return false;
  }
  const source = nodeGraphCanvasScriptSourceWithGridUnits(canvasScript.source, nextWidthGu, currentHeightGu);
  patchNode.canvasScript = normalizeNodeGraphCanvasScript({ ...canvasScript, source });
  delete patchNode.widthGu;
  delete patchNode.heightGu;
  return true;
}

function resizeNodeGraphTextBoxModuleHeightOnGrid(patchNode, delta) {
  if (nodeGraphModuleSizingCapabilities(patchNode?.type).moduleHeight !== "textBox") {
    return false;
  }
  const currentHeightGu = nodeGraphPatchNodeGridHeightUnits(patchNode);
  const nextHeightGu = normalizeNodeGraphTextBoxHeightUnits(currentHeightGu + delta);
  if (nextHeightGu === currentHeightGu) {
    return false;
  }
  const defaultHeightGu = nodeGraphModuleGridHeightUnitsForUi("textBox", patchNode.ui);
  if (nextHeightGu === defaultHeightGu) {
    delete patchNode.heightGu;
  } else {
    patchNode.heightGu = nextHeightGu;
  }
  return true;
}

function resizeNodeGraphDisplayModuleHeightOnGrid(patchNode, delta) {
  if (!nodeGraphModuleSizingCapabilities(patchNode?.type).displayHeight) {
    return false;
  }
  const ui = normalizeNodeGraphPatchNodeUi(patchNode.ui, patchNode.type);
  const nextOffsetGu = normalizeNodeGraphModuleDisplayHeightOffsetUnits(
    patchNode.type,
    ui.displayHeightOffsetGu + delta * nodeGraphModuleDisplayHeightLimits.stepGu,
  );
  if (nextOffsetGu === ui.displayHeightOffsetGu) {
    return false;
  }
  ui.displayHeightOffsetGu = nextOffsetGu;
  applyNodeGraphPatchNodeUi(patchNode, ui);
  return true;
}

function resizeNodeGraphHeightAdjustableModuleOnGrid(patchNode, delta) {
  const capabilities = nodeGraphModuleSizingCapabilities(patchNode?.type);
  if (capabilities.moduleHeight === "textBox") {
    return resizeNodeGraphTextBoxModuleHeightOnGrid(patchNode, delta);
  }
  if (capabilities.displayHeight) {
    return resizeNodeGraphDisplayModuleHeightOnGrid(patchNode, delta);
  }
  return false;
}

function resizeNodeGraphWidthAdjustableModuleOnGrid(patchNode, delta) {
  const capabilities = nodeGraphModuleSizingCapabilities(patchNode?.type);
  if (!capabilities.width) {
    return false;
  }
  if (capabilities.moduleHeight === "canvasScript") {
    return resizeNodeGraphCanvasModuleOnGrid(patchNode, delta);
  }
  const currentWidthGu = nodeGraphPatchNodeGridWidthUnits(patchNode);
  const nextWidthGu = normalizeNodeGraphModuleWidthUnits(patchNode.type, currentWidthGu + delta);
  if (nextWidthGu === currentWidthGu) {
    return false;
  }
  if (nextWidthGu === nodeGraphDefaultModuleGridWidthUnits(patchNode.type)) {
    delete patchNode.widthGu;
  } else {
    patchNode.widthGu = nextWidthGu;
  }
  return true;
}

function resizeSelectedNodeGraphModulesOnGrid(axis, delta) {
  const selectedNodeIds = new Set([...nodeGraphSelectedNodeIds()].filter((id) =>
    nodeGraphMvp.activeNodes.has(id),
  ));
  if (!selectedNodeIds.size) {
    return false;
  }

  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  let changedCount = 0;
  for (const patchNode of patch.nodes) {
    if (!selectedNodeIds.has(patchNode.id)) {
      continue;
    }

    if (axis === "height") {
      if (resizeNodeGraphHeightAdjustableModuleOnGrid(patchNode, delta)) {
        changedCount += 1;
      }
      continue;
    }

    if (axis === "width") {
      if (resizeNodeGraphWidthAdjustableModuleOnGrid(patchNode, delta)) {
        changedCount += 1;
      }
      continue;
    }

    continue;
  }

  if (!changedCount) {
    return false;
  }
  commitNodeGraphPatch(patch, {
    status: axis === "height" ? "module height changed" : "module width changed",
  });
  configureNodeSceneContextMenu("module");
  return true;
}

function handleNodeGraphKeydown(event) {
  if (handleNodeGraphFloatingWindowKeyboardNudge(event)) {
    return;
  }
  if (event.key === "Escape" && nodeGraphWireInteractions?.cancelPortConnectionMode?.()) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape" && document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view")) {
    setNodeGraphViewMode("modular");
    return;
  }
  // Space ALWAYS controls audio transport (pause/play/start) — even when
  // an input is focused. Misused audio can cause distress; Space must be a
  // reliable panic button regardless of UI focus.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === "Space") {
    event.preventDefault();
    event.stopPropagation(); // prevent the editable-target check below from eating it
    if (nodeGraphMvp?.live?.outputEnabled && nodeGraphMvp?.live?.node) {
      // Engine is running: Space toggles speed between 0 (pause) and 1 (play).
      const isPaused = (nodeGraphMvp.live.speedMultiplier ?? 1) === 0;
      const nextSpeed = isPaused ? 1 : 0;
      if (typeof setNodeGraphLiveSpeed === "function") {
        setNodeGraphLiveSpeed(nextSpeed);
      }
    } else if (typeof toggleNodeGraphLiveOutput === "function") {
      // Engine is off: Space starts it.
      toggleNodeGraphLiveOutput();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undoNodeGraphPatch();
    return;
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
  ) {
    event.preventDefault();
    redoNodeGraphPatch();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    alignNodeGraphViewToGrid();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllNodeGraphModules();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (copySelectedNodeGraphModule()) {
      event.preventDefault();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    if (duplicateFocusedNodeGraphGraphNode()) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (typeof toggleNodeGraphStandaloneMidiKeyboard === "function") {
      toggleNodeGraphStandaloneMidiKeyboard();
    }
    return;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    openNodeGraphModuleShop(null);
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "m") {
    event.preventDefault();
    if (typeof toggleNodeGraphModularOnlyView === "function") {
      toggleNodeGraphModularOnlyView();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "v") {
    event.preventDefault();
    if (typeof toggleNodeGraphViewButtonsVisibility === "function") {
      toggleNodeGraphViewButtonsVisibility();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    if (typeof toggleNodeGraphKeyboardDebugVisibility === "function") {
      toggleNodeGraphKeyboardDebugVisibility();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    if (typeof toggleNodeGraphTooltipWindow === "function") {
      toggleNodeGraphTooltipWindow();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "a") {
    if (addFocusedNodeGraphGraphNode()) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "s") {
    if (cycleFocusedNodeGraphGraphShape()) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "[") {
    if (selectFocusedNodeGraphGraphNodeOffset(-1)) {
      event.preventDefault();
    }
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "]") {
    if (selectFocusedNodeGraphGraphNodeOffset(1)) {
      event.preventDefault();
    }
    return;
  }
  if (nudgeFocusedNodeGraphGraphNode(event)) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const shiftArrowSizeActions = {
      ArrowLeft: ["width", -1],
      ArrowRight: ["width", 1],
      ArrowDown: ["height", 1],
      ArrowUp: ["height", -1],
    };
    const action = shiftArrowSizeActions[event.key];
    if (action) {
      if (resizeSelectedNodeGraphModulesOnGrid(action[0], action[1])) {
        event.preventDefault();
      }
      return;
    }
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const arrowMoveActions = {
      ArrowDown: ["y", 1],
      ArrowLeft: ["x", -1],
      ArrowRight: ["x", 1],
      ArrowUp: ["y", -1],
    };
    const action = arrowMoveActions[event.key];
    if (action) {
      if (nudgeSelectedNodeGraphModulesOnGrid(action[0], action[1])) {
        event.preventDefault();
      }
      return;
    }
  }
  if (event.key !== "Delete" && event.key !== "Backspace") {
    return;
  }

  if (removeFocusedNodeGraphGraphNode()) {
    event.preventDefault();
    return;
  }
  if (nodeGraphSelectionCanDelete()) {
    event.preventDefault();
    deleteSelectedNodeGraphItem();
  }
}
