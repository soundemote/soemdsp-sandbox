function closeNodeSceneContextMenu(options = {}) {
  const explicit =
    options === true ||
    options?.explicit === true ||
    options?.currentTarget?.id === "nodeSceneCloseMenu";
  if (!explicit) {
    return false;
  }
  const menu = document.getElementById("nodeSceneContextMenu");
  menu.hidden = true;
  clearNodeSceneContextMenuDragState();
  if (nodeGraphMvp.sceneContextResizing?.handle) {
    nodeGraphMvp.sceneContextResizing.handle.classList.remove("dragging");
  }
  nodeGraphMvp.sceneContextDragging = null;
  nodeGraphMvp.sceneContextResizing = null;
  nodeGraphMvp.sceneContextPoint = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("commandCenter", menu, { open: false }, { status: false });
  }
  return true;
}

function clearNodeSceneContextMenuDragState() {
  const menu = document.getElementById("nodeSceneContextMenu");
  nodeGraphMvp.sceneContextDragging?.handle?.classList.remove("dragging");
  menu?.querySelector(".scene-context-heading")?.classList.remove("dragging");
  menu?.querySelector(".scene-context-drag-handle")?.classList.remove("dragging");
}

const nodeSceneContextWindowDefaultSize = Object.freeze({
  width: 185,
  minWidth: 24,
  maxWidth: 430,
});

const nodeModuleActionsWindowDefaultSize = Object.freeze({
  width: 185,
  height: 620,
  minWidth: 24,
  maxWidth: 360,
  minHeight: 120,
  maxHeight: 820,
});

function pulseNodeGraphFloatingWindowAttention(element) {
  if (!element) {
    return false;
  }
  if (typeof triggerNodeGraphWindowReopenEvent === "function") {
    triggerNodeGraphWindowReopenEvent(element.id || element.dataset?.windowKey || "floating-window");
  }
  element.classList.remove("node-floating-window-attention");
  void element.offsetWidth;
  element.classList.add("node-floating-window-attention");
  window.setTimeout(() => {
    element.classList.remove("node-floating-window-attention");
  }, 1050);
  return true;
}

function normalizeNodeSceneContextWindowSize(size = {}) {
  const normalized = normalizeNodeGraphFloatingWindowSize(size, nodeSceneContextWindowDefaultSize);
  return { width: normalized.width };
}

function normalizeNodeModuleActionsWindowSize(size = {}) {
  return normalizeNodeGraphFloatingWindowSize(size, nodeModuleActionsWindowDefaultSize);
}

function syncNodeModuleActionsWindowHeightLimit() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu) {
    return null;
  }
  const normalized = normalizeNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize || nodeModuleActionsWindowDefaultSize);
  const effectiveHeight = Math.max(
    nodeModuleActionsWindowDefaultSize.minHeight,
    Math.min(nodeModuleActionsWindowDefaultSize.maxHeight, Number(normalized.height) || nodeModuleActionsWindowDefaultSize.height),
  );
  menu.style.setProperty("--node-module-actions-height", `${Math.round(effectiveHeight)}px`);
  return effectiveHeight;
}

function applyNodeSceneContextWindowSize(size = nodeGraphMvp.sceneContextWindowSize) {
  const menu = document.getElementById("nodeSceneContextMenu");
  const normalized = normalizeNodeSceneContextWindowSize(size || nodeSceneContextWindowDefaultSize);
  nodeGraphMvp.sceneContextWindowSize = normalized;
  if (!menu) {
    return normalized;
  }
  applyNodeGraphFloatingWindowSizeVars(menu, "node-scene-context", nodeSceneContextWindowDefaultSize, normalized);
  return normalized;
}

function applyNodeModuleActionsWindowSize(size = nodeGraphMvp.moduleActionWindowSize) {
  const menu = document.getElementById("nodeModuleActionsWindow");
  const normalized = normalizeNodeModuleActionsWindowSize(size || nodeModuleActionsWindowDefaultSize);
  nodeGraphMvp.moduleActionWindowSize = normalized;
  if (!menu) {
    return normalized;
  }
  applyNodeGraphFloatingWindowSizeVars(menu, "node-module-actions", nodeModuleActionsWindowDefaultSize, normalized);
  syncNodeModuleActionsWindowHeightLimit();
  return normalized;
}

function saveNodeSceneContextWindowSizeToUserSettings() {
  if (typeof saveNodeGraphWorkspaceWindowStatesToUserSettings === "function") {
    saveNodeGraphWorkspaceWindowStatesToUserSettings();
  }
}

function saveNodeModuleActionsWindowStateToUserSettings() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleActions",
      menu,
      {
        open: menu ? !menu.hidden : true,
        size: normalizeNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize),
      },
      { status: false },
    );
    return;
  }
  saveNodeSceneContextWindowSizeToUserSettings();
}

function nodeModuleActionsWindowVisibleRect() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu || menu.hidden) {
    return null;
  }
  const rect = menu.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function hideNodeModuleActionsWindowForInspectorReplacement() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (menu) {
    menu.hidden = true;
  }
  if (nodeGraphMvp.moduleActionDragging?.handle) {
    nodeGraphMvp.moduleActionDragging.handle.classList.remove("dragging");
  }
  if (nodeGraphMvp.moduleActionResizing?.handle) {
    nodeGraphMvp.moduleActionResizing.handle.classList.remove("dragging");
  }
  nodeGraphMvp.moduleActionDragging = null;
  nodeGraphMvp.moduleActionResizing = null;
}

function prepareNodeModuleActionsWindowForInspectorReplacement() {
  const rect = nodeModuleActionsWindowVisibleRect();
  if (!rect) {
    return null;
  }
  hideNodeModuleActionsWindowForInspectorReplacement();
  return rect;
}

function closeNodeModuleActionsWindow() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (menu) {
    menu.hidden = true;
  }
  if (nodeGraphMvp.moduleActionDragging?.handle) {
    nodeGraphMvp.moduleActionDragging.handle.classList.remove("dragging");
  }
  if (nodeGraphMvp.moduleActionResizing?.handle) {
    nodeGraphMvp.moduleActionResizing.handle.classList.remove("dragging");
  }
  nodeGraphMvp.moduleActionDragging = null;
  nodeGraphMvp.moduleActionResizing = null;
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("moduleActions", menu, { open: false }, { status: false });
  }
}

function nodeSceneContextHomeModulesHasContent(homeModules) {
  return Boolean(homeModules?.children?.length);
}

function closeNodeScopeContextMenu() {
  const menu = document.getElementById("nodeScopeContextMenu");
  if (menu) {
    menu.hidden = true;
  }
  if (nodeGraphMvp.scopeContextDragging?.handle) {
    nodeGraphMvp.scopeContextDragging.handle.classList.remove("dragging");
  }
  nodeGraphMvp.scopeContextDragging = null;
  nodeGraphMvp.scopeContextTargetNode = null;
  renderNodeGraphSceneScopeControls();
}

function closeNodeGlobalScopeMenu() {
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (menu) {
    menu.hidden = true;
  }
  if (nodeGraphMvp.globalScopeDragging?.handle) {
    nodeGraphMvp.globalScopeDragging.handle.classList.remove("dragging");
  }
  nodeGraphMvp.globalScopeDragging = null;
  closeNodeScopeContextMenu();
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", menu, { open: false }, { status: false });
  }
}

function positionNodeSceneContextMenu(menu, x, y, remember = false) {
  if (!menu) {
    return;
  }
  menu.hidden = false;
  if (menu?.id === "nodeSceneContextMenu") {
    applyNodeSceneContextWindowSize();
  } else if (menu?.id === "nodeModuleActionsWindow") {
    applyNodeModuleActionsWindowSize();
  } else if (menu?.id === "nodeCodeBoxWindow" && typeof applyNodeGraphCodeBoxWindowSize === "function") {
    applyNodeGraphCodeBoxWindowSize();
  }
  const { left, top } = nodeGraphFloatingWindowPosition(menu, x, y);
  setNodeSceneContextMenuViewportPosition(menu, left, top);
  if (menu?.id === "nodeSceneContextMenu" && remember) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("commandCenter", menu, { open: !menu.hidden, position: { left, top } }, { persist: false });
    }
  } else if (menu?.id === "nodeModuleActionsWindow" && remember) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("moduleActions", menu, { open: !menu.hidden, position: { left, top } }, { persist: false });
    }
  } else if (menu?.id === "nodeCodeBoxWindow" && remember) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("codeBox", menu, { open: !menu.hidden, position: { left, top } }, { persist: false });
    }
  } else if (menu?.id === "nodeGlobalScopeMenu" && remember) {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", menu, { open: !menu.hidden, position: { left, top } }, { persist: false });
    }
  }
}

function setNodeSceneContextMenuViewportPosition(menu, left, top) {
  if (!menu) {
    return;
  }
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(menu, left, top);
    return;
  }
  menu.style.left = `${Math.round(Number(left) || 0)}px`;
  menu.style.top = `${Math.round(Number(top) || 0)}px`;
  menu.style.right = "auto";
}

function positionNodeSceneContextMenuHeaderAtPoint(menu, x, y, remember = false) {
  if (!menu) {
    return;
  }
  menu.hidden = false;
  const menuRect = menu.getBoundingClientRect();
  const headingRect = menu.querySelector(".scene-context-heading")?.getBoundingClientRect();
  positionNodeSceneContextMenu(
    menu,
    (Number(x) || 0) - (menuRect.width * 0.5),
    (Number(y) || 0) - ((headingRect?.height || 42) * 0.5),
    remember,
  );
}

function rememberNodeGraphContextMenuClientPoint(event) {
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  nodeGraphMvp.lastContextMenuClientPoint = { x, y };
  return nodeGraphMvp.lastContextMenuClientPoint;
}

function nodeGraphLastContextMenuClientPoint() {
  const point = nodeGraphMvp.lastContextMenuClientPoint;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null;
}

function nodeGraphContextMenuInitialWindowPoint(x, y) {
  const explicitX = Number(x);
  const explicitY = Number(y);
  if (Number.isFinite(explicitX) && Number.isFinite(explicitY)) {
    return { x: explicitX, y: explicitY };
  }
  return nodeGraphLastContextMenuClientPoint() || {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.25,
  };
}

function nodeSceneContextMenuCurrentPosition(menu) {
  if (!menu) {
    return null;
  }
  const left = Number.parseFloat(menu.style.left);
  const top = Number.parseFloat(menu.style.top);
  if (Number.isFinite(left) && Number.isFinite(top)) {
    return typeof nodeGraphFloatingWindowViewportPositionFromCss === "function"
      ? nodeGraphFloatingWindowViewportPositionFromCss(left, top)
      : { left, top };
  }
  if (menu.hidden) {
    return null;
  }
  const rect = menu.getBoundingClientRect();
  if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
    return { left: rect.left, top: rect.top };
  }
  return null;
}

function nodeSceneContextMenuStyleOrRectPosition(menu) {
  if (!menu) {
    return { left: 0, top: 0 };
  }
  const rect = menu.getBoundingClientRect();
  const styleLeft = Number.parseFloat(menu.style.left);
  const styleTop = Number.parseFloat(menu.style.top);
  if (
    Number.isFinite(styleLeft) &&
    Number.isFinite(styleTop) &&
    typeof nodeGraphFloatingWindowViewportPositionFromCss === "function"
  ) {
    return nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop);
  }
  return {
    left: Number.isFinite(styleLeft) ? styleLeft : rect.left,
    top: Number.isFinite(styleTop) ? styleTop : rect.top,
  };
}

function positionNodeSceneContextMenuAtCurrentSavedOrInitial(menu, x, y) {
  if (!menu) {
    return;
  }
  applyNodeSceneContextWindowSize();
  const currentPosition = menu.hidden ? null : nodeSceneContextMenuCurrentPosition(menu);
  const workspaceState = nodeGraphMvp.workspaceWindowStates?.commandCenter;
  const savedPosition = workspaceState?.position;
  const chosenPosition = savedPosition || currentPosition;
  const hasChosenPosition =
    Number.isFinite(Number(chosenPosition?.left)) &&
    Number.isFinite(Number(chosenPosition?.top));
  if (hasChosenPosition) {
    menu.hidden = false;
    setNodeSceneContextMenuViewportPosition(menu, chosenPosition.left, chosenPosition.top);
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "commandCenter",
        null,
        { open: true },
        { capturePosition: false, persist: false },
      );
    }
    return;
  }
  const initial = nodeGraphContextMenuInitialWindowPoint(x, y);
  positionNodeSceneContextMenuHeaderAtPoint(menu, initial.x, initial.y, true);
}

function positionNodeSceneContextMenuAtSavedOr(menu, x, y) {
  const workspaceState = nodeGraphMvp.workspaceWindowStates?.commandCenter;
  const savedPosition = workspaceState?.position;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    !hasSavedPosition,
  );
}

function positionNodeModuleActionsWindowAtSavedOr(menu, x, y) {
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  const savedPosition = sharedInspectorState.position || nodeGraphMvp.moduleActionWindowPosition;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  applyNodeModuleActionsWindowSize(sharedInspectorState.size);
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    true,
  );
}

function positionNodeScopeContextMenuAtSavedOr(menu, x, y) {
  const savedPosition = nodeGraphMvp.scopeContextWindowPosition;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    false,
  );
  if (!hasSavedPosition) {
    nodeGraphMvp.scopeContextWindowPosition = nodeSceneContextMenuStyleOrRectPosition(menu);
  }
}

function positionNodeGlobalScopeMenuAtSavedOr(menu, x, y) {
  const workspaceState = nodeGraphMvp.workspaceWindowStates?.oscilloscopeSettings;
  const savedPosition = workspaceState?.position || nodeGraphMvp.globalScopeWindowPosition;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    false,
  );
  if (!hasSavedPosition) {
    nodeGraphMvp.globalScopeWindowPosition = nodeSceneContextMenuStyleOrRectPosition(menu);
  }
}

function openNodeGlobalScopeMenu() {
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (!menu) {
    return false;
  }
  menu.hidden = true;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", menu, { open: false }, { status: false });
  }
  return false;
}

function toggleNodeGlobalScopeMenu() {
  closeNodeGlobalScopeMenu();
  return false;
}

function beginNodeSceneContextMenuDrag(event) {
  if (nodeGraphMvp.sceneContextDragging) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const menu = document.getElementById("nodeSceneContextMenu");
  if (menu.hidden) {
    return;
  }

  clearNodeSceneContextMenuDragState();
  beginNodeGraphFloatingWindowDrag(event, menu, "sceneContextDragging");
}

function dragNodeSceneContextMenu(event) {
  dragNodeGraphFloatingWindow(
    event,
    "sceneContextDragging",
    document.getElementById("nodeSceneContextMenu"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState("commandCenter", document.getElementById("nodeSceneContextMenu"), { open: true, position: next }, { persist: false });
      }
    },
  );
}

function endNodeSceneContextMenuDrag(event) {
  const drag = nodeGraphMvp.sceneContextDragging;
  endNodeGraphFloatingWindowDrag(event, "sceneContextDragging", () => {
    clearNodeSceneContextMenuDragState();
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      const position = Number.isFinite(Number(drag?.currentLeft)) && Number.isFinite(Number(drag?.currentTop))
        ? { left: drag.currentLeft, top: drag.currentTop }
        : undefined;
      rememberNodeGraphWorkspaceWindowState("commandCenter", null, { open: true, ...(position ? { position } : {}) }, { capturePosition: false, status: false });
    }
  });
}

function beginNodeModuleActionsWindowDrag(event) {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu || menu.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, menu, "moduleActionDragging");
}

function dragNodeModuleActionsWindow(event) {
  dragNodeGraphFloatingWindow(
    event,
    "moduleActionDragging",
    document.getElementById("nodeModuleActionsWindow"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState("moduleActions", document.getElementById("nodeModuleActionsWindow"), { open: true, position: next }, { persist: false });
      }
    },
  );
}

function endNodeModuleActionsWindowDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "moduleActionDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("moduleActions", document.getElementById("nodeModuleActionsWindow"), { open: true }, { status: false });
    }
  });
}

function beginNodeModuleActionsWindowResize(event) {
  const menu = document.getElementById("nodeModuleActionsWindow");
  beginNodeGraphFloatingWindowResize(event, menu, "moduleActionResizing");
}

function dragNodeModuleActionsWindowResize(event) {
  dragNodeGraphFloatingWindowResize(event, "moduleActionResizing", applyNodeModuleActionsWindowSize);
}

function endNodeModuleActionsWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "moduleActionResizing", saveNodeModuleActionsWindowStateToUserSettings);
}

function beginNodeSceneContextWindowResize(event) {
  const menu = document.getElementById("nodeSceneContextMenu");
  beginNodeGraphFloatingWindowResize(event, menu, "sceneContextResizing");
}

function dragNodeSceneContextWindowResize(event) {
  dragNodeGraphFloatingWindowResize(event, "sceneContextResizing", applyNodeSceneContextWindowSize, { height: false });
}

function endNodeSceneContextWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "sceneContextResizing", saveNodeSceneContextWindowSizeToUserSettings);
}

function beginNodeScopeContextMenuDrag(event) {
  const menu = document.getElementById("nodeScopeContextMenu");
  if (!menu || menu.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, menu, "scopeContextDragging");
}

function beginNodeGlobalScopeMenuDrag(event) {
  const menu = document.getElementById("nodeGlobalScopeMenu");
  if (!menu || menu.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, menu, "globalScopeDragging");
}

function dragNodeGlobalScopeMenu(event) {
  const menu = document.getElementById("nodeGlobalScopeMenu");
  dragNodeGraphFloatingWindow(event, "globalScopeDragging", menu, (next) => {
    nodeGraphMvp.globalScopeWindowPosition = next;
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", menu, { open: true, position: next }, { persist: false });
    }
  });
}

function endNodeGlobalScopeMenuDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "globalScopeDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("oscilloscopeSettings", document.getElementById("nodeGlobalScopeMenu"), { open: true }, { status: false });
    }
  });
}

function dragNodeScopeContextMenu(event) {
  const menu = document.getElementById("nodeScopeContextMenu");
  dragNodeGraphFloatingWindow(event, "scopeContextDragging", menu, (next) => {
    nodeGraphMvp.scopeContextWindowPosition = next;
  });
}

function endNodeScopeContextMenuDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "scopeContextDragging");
}

function nodeGraphContextTargetModuleElement(nodeId = nodeGraphModuleActionTargetNodeId()) {
  if (!nodeId) {
    return null;
  }
  return document.querySelector(`.dsp-node[data-node="${CSS.escape(nodeId)}"]`);
}

function nodeGraphContextTargetSliderReadout(nodeId = nodeGraphModuleActionTargetNodeId()) {
  return nodeGraphContextTargetModuleElement(nodeId)?.querySelector(".node-slider-readout") || null;
}

const nodeGraphModuleActionControlIds = [
  "nodeSceneCopyModule",
  "nodeSceneCopyModuleSettings",
  "nodeScenePasteModuleSettings",
  "nodeSceneSetModuleSettingsAsDefault",
  "nodeSceneSelectedModule",
  "nodeSceneAddToUi",
  "nodeSceneWireTypeControl",
  "nodeSceneAliasControl",
  "nodeSceneWidthControls",
  "nodeSceneTextBoxTextSizeControls",
  "nodeSceneTextBoxHeightControls",
  "nodeSceneTextBoxTextControls",
  "nodeSceneCodeblockControls",
  "nodeSceneGraphControls",
  "nodeSceneDisplayHeightControls",
  "nodeSceneToggleOscilloscope",
  "nodeSceneToggleTitle",
  "nodeSceneToggleButtons",
  "nodeSceneToggleInterfaceControls",
  "nodeSceneToggleIo",
  "nodeSceneToggleSliders",
  "nodeSceneImageControls",
  "nodeSceneCanvasControls",
  "nodeSceneLedControls",
  "nodeSceneBugButtonControls",
  "nodeSceneTextBoxControls",
  "nodeSceneTextBoxHorizontalAlignControls",
  "nodeSceneTextBoxVerticalAlignControls",
  "nodeSceneToggleModuleEnabled",
  "nodeSceneCodeGroup",
  "nodeSceneDeleteModule",
];

function ensureNodeGraphModuleActionsWindowBody() {
  const body = document.getElementById("nodeModuleActionsWindowBody");
  if (!body) {
    return;
  }
  for (const id of nodeGraphModuleActionControlIds) {
    const element = document.getElementById(id);
    if (element && element.parentElement !== body) {
      body.append(element);
    }
  }
}

function setNodeGraphModuleActionControlsHidden(hidden = true) {
  for (const id of nodeGraphModuleActionControlIds) {
    const element = document.getElementById(id);
    if (element) {
      element.hidden = hidden;
    }
  }
}

function showNodeModuleActionsWindow(anchorRect = null) {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu) {
    return;
  }
  if (!menu.hidden) {
    pulseNodeGraphFloatingWindowAttention(menu);
    return;
  }
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return;
  }
  const displayRect = typeof prepareNodeGraphTraceDisplaySettingsForInspectorReplacement === "function"
    ? prepareNodeGraphTraceDisplaySettingsForInspectorReplacement()
    : null;
  if (displayRect === false) {
    return;
  }
  const replacementRect = metadataRect || displayRect;
  const rect = anchorRect || {
    right: window.innerWidth * 0.5,
    top: window.innerHeight * 0.25,
    bottom: window.innerHeight * 0.25,
  };
  nodeGraphMvp.sharedInspectorActive = "moduleActions";
  positionNodeModuleActionsWindowAtSavedOr(
    menu,
    Number.isFinite(Number(replacementRect?.left))
      ? replacementRect.left
      : Number.isFinite(Number(rect.right))
      ? rect.right + 8
      : window.innerWidth * 0.5,
    Number.isFinite(Number(replacementRect?.top))
      ? replacementRect.top
      : Number.isFinite(Number(rect.top))
      ? rect.top
      : Number(rect.bottom) || window.innerHeight * 0.25,
  );
  menu.hidden = false;
  syncNodeModuleActionsWindowHeightLimit();
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("moduleActions", menu, { open: true }, { status: false });
  }
}

function openNodeGraphModuleActionsFromContextWindow() {
  ensureNodeGraphModuleActionsWindowBody();
  const targetNodeId = nodeGraphModuleActionTargetNodeId();
  nodeGraphMvp.sceneContextTargetNode = targetNodeId || null;
  nodeGraphMvp.sceneContextTargetWire = null;
  configureNodeSceneContextMenu("module");
  const anchor = document.getElementById("nodeSceneOpenModuleActions");
  showNodeModuleActionsWindow(anchor?.getBoundingClientRect?.());
}

function openNodeGraphMetaparametersFromContextWindow() {
  const readout = nodeGraphContextTargetSliderReadout();
  const anchor = document.getElementById("nodeSceneOpenMetaparameters") || readout;
  const rect = anchor?.getBoundingClientRect?.() || {
    right: window.innerWidth * 0.5,
    top: window.innerHeight * 0.25,
  };
  if (!readout) {
    openBlankNodeMetadataPopover({
      clientX: rect.right + 8,
      clientY: rect.top,
      preventDefault() {},
      stopPropagation() {},
    });
    return;
  }
  openNodeMetadataPopover({
    clientX: rect.right + 8,
    clientY: rect.top,
    preventDefault() {},
    stopPropagation() {},
  }, readout);
}

function setNodeSceneContextHeader(label, detail = "") {
  const title = document.querySelector("#nodeSceneContextMenu .scene-context-title");
  if (!title) {
    return;
  }
  let labelElement = title.querySelector("span");
  let detailElement = title.querySelector("small");
  if (!labelElement) {
    labelElement = document.createElement("span");
    title.prepend(labelElement);
  }
  if (!detailElement) {
    detailElement = document.createElement("small");
    title.append(detailElement);
  }
  labelElement.textContent = label;
  detailElement.textContent = detail;
}

function setNodeModuleActionsWindowHeader(label, detail = "") {
  const title = document.querySelector("#nodeModuleActionsWindow .scene-context-title");
  if (!title) {
    return;
  }
  let labelElement = title.querySelector("span");
  let detailElement = title.querySelector("small");
  if (!labelElement) {
    labelElement = document.createElement("span");
    title.prepend(labelElement);
  }
  if (!detailElement) {
    detailElement = document.createElement("small");
    title.append(detailElement);
  }
  labelElement.textContent = label;
  detailElement.textContent = detail;
}

function setNodeModuleSettingsWindowHeader(detail = "") {
  setNodeModuleActionsWindowHeader("MODULE", detail || "Settings");
}

function configureNodeGraphModuleSettingsSizeRow({
  controls,
  decreaseButton,
  increaseButton,
  valueElement,
  hidden,
  value,
  decreaseDisabled,
  increaseDisabled,
  decreaseTitle,
  increaseTitle,
}) {
  if (controls) {
    controls.hidden = Boolean(hidden);
  }
  if (valueElement) {
    valueElement.textContent = hidden ? "" : String(value ?? "");
  }
  if (decreaseButton) {
    decreaseButton.disabled = Boolean(hidden || decreaseDisabled);
    if (decreaseTitle) {
      decreaseButton.title = decreaseTitle;
    }
  }
  if (increaseButton) {
    increaseButton.disabled = Boolean(hidden || increaseDisabled);
    if (increaseTitle) {
      increaseButton.title = increaseTitle;
    }
  }
}

function resetNodeGraphModuleSettingsSizeRow(controls, decreaseButton, increaseButton, valueElement) {
  configureNodeGraphModuleSettingsSizeRow({
    controls,
    decreaseButton,
    increaseButton,
    valueElement,
    hidden: true,
  });
}

function configureNodeSceneContextMenu(mode) {
  ensureNodeGraphModuleActionsWindowBody();
  const actionMode = mode === "module" || mode === "wire";
  const menu = document.getElementById(actionMode ? "nodeModuleActionsWindow" : "nodeSceneContextMenu");
  const sceneMenu = document.getElementById("nodeSceneContextMenu");
  const moduleActionsWindow = document.getElementById("nodeModuleActionsWindow");
  const copyButton = document.getElementById("nodeSceneCopyModule");
  const moduleSettingsActionGroup = document.getElementById("nodeSceneModuleSettingsActionGroup");
  const copySettingsButton = document.getElementById("nodeSceneCopyModuleSettings");
  const pasteSettingsButton = document.getElementById("nodeScenePasteModuleSettings");
  const setDefaultButton = document.getElementById("nodeSceneSetModuleSettingsAsDefault");
  const moduleActionsWindowButton = document.getElementById("nodeSceneOpenModuleActions");
  const metaparametersWindowButton = document.getElementById("nodeSceneOpenMetaparameters");
  const deleteButton = document.getElementById("nodeSceneDeleteModule");
  const closeButton = document.getElementById(actionMode ? "nodeModuleActionsClose" : "nodeSceneCloseMenu");
  const selectedModule = document.getElementById("nodeSceneSelectedModule");
  const wireTypeControl = document.getElementById("nodeSceneWireTypeControl");
  const wireTypeButtons = [...wireTypeControl.querySelectorAll("[data-wire-type]")];
  const aliasControl = document.getElementById("nodeSceneAliasControl");
  const aliasInput = document.getElementById("nodeSceneAliasInput");
  const widthControls = document.getElementById("nodeSceneWidthControls");
  const widthDecrease = document.getElementById("nodeSceneWidthDecrease");
  const widthIncrease = document.getElementById("nodeSceneWidthIncrease");
  const widthValue = document.getElementById("nodeSceneWidthValue");
  const displayHeightControls = document.getElementById("nodeSceneDisplayHeightControls");
  const displayHeightDecrease = document.getElementById("nodeSceneDisplayHeightDecrease");
  const displayHeightIncrease = document.getElementById("nodeSceneDisplayHeightIncrease");
  const displayHeightValue = document.getElementById("nodeSceneDisplayHeightValue");
  const textBoxTextSizeControls = document.getElementById("nodeSceneTextBoxTextSizeControls");
  const textBoxTextSizeDecrease = document.getElementById("nodeSceneTextBoxTextSizeDecrease");
  const textBoxTextSizeIncrease = document.getElementById("nodeSceneTextBoxTextSizeIncrease");
  const textBoxTextSizeValue = document.getElementById("nodeSceneTextBoxTextSizeValue");
  const textBoxHeightControls = document.getElementById("nodeSceneTextBoxHeightControls");
  const textBoxHeightDecrease = document.getElementById("nodeSceneTextBoxHeightDecrease");
  const textBoxHeightIncrease = document.getElementById("nodeSceneTextBoxHeightIncrease");
  const textBoxHeightValue = document.getElementById("nodeSceneTextBoxHeightValue");
  const textBoxTextControls = document.getElementById("nodeSceneTextBoxTextControls");
  const textBoxTextInput = document.getElementById("nodeSceneTextBoxTextInput");
  const codeblockControls = document.getElementById("nodeSceneCodeblockControls");
  const codeblockInputs = document.getElementById("nodeSceneCodeblockInputs");
  const codeblockOutputs = document.getElementById("nodeSceneCodeblockOutputs");
  const codeblockSource = document.getElementById("nodeSceneCodeblockSource");
  const codeblockStatus = document.getElementById("nodeSceneCodeblockStatus");
  const textBoxPortScriptControls = document.getElementById("nodeSceneTextBoxPortScriptControls");
  const textBoxTitleScript = document.getElementById("nodeSceneTextBoxTitleScript");
  const textBoxTitleScriptStatus = document.getElementById("nodeSceneTextBoxTitleScriptStatus");
  const textBoxTextScript = document.getElementById("nodeSceneTextBoxTextScript");
  const textBoxTextScriptStatus = document.getElementById("nodeSceneTextBoxTextScriptStatus");
  const graphControls = document.getElementById("nodeSceneGraphControls");
  const graphCursorX = document.getElementById("nodeSceneGraphCursorX");
  const graphNodeIndex = document.getElementById("nodeSceneGraphNodeIndex");
  const graphPreviousNode = document.getElementById("nodeSceneGraphPreviousNode");
  const graphNextNode = document.getElementById("nodeSceneGraphNextNode");
  const graphNodeX = document.getElementById("nodeSceneGraphNodeX");
  const graphNodeY = document.getElementById("nodeSceneGraphNodeY");
  const graphNodeContour = document.getElementById("nodeSceneGraphNodeContour");
  const graphNodeShape = document.getElementById("nodeSceneGraphNodeShape");
  const graphNodeList = document.getElementById("nodeSceneGraphNodeList");
  const graphRemoveNode = document.getElementById("nodeSceneGraphRemoveNode");
  const toggleButtonsButton = document.getElementById("nodeSceneToggleButtons");
  const toggleModuleEnabledButton = document.getElementById("nodeSceneToggleModuleEnabled");
  const nativeCodeGroup = document.getElementById("nodeSceneCodeGroup");
  const nativeCodeButton = document.getElementById("nodeSceneOpenNativeCode");
  const nativeLibButton = document.getElementById("nodeSceneOpenNativeLib");
  const toggleOscilloscopeButton = document.getElementById("nodeSceneToggleOscilloscope");
  const toggleInterfaceControlsButton = document.getElementById("nodeSceneToggleInterfaceControls");
  const toggleSlidersButton = document.getElementById("nodeSceneToggleSliders");
  const toggleIoButton = document.getElementById("nodeSceneToggleIo");
  const toggleTitleButton = document.getElementById("nodeSceneToggleTitle");
  const imageControls = document.getElementById("nodeSceneImageControls");
  const imageSave = document.getElementById("nodeSceneImageSave");
  const imageRefresh = document.getElementById("nodeSceneImageRefresh");
  const canvasControls = document.getElementById("nodeSceneCanvasControls");
  const canvasScript = document.getElementById("nodeSceneCanvasScript");
  const ledControls = document.getElementById("nodeSceneLedControls");
  const ledColor = document.getElementById("nodeSceneLedColor");
  const bugButtonControls = document.getElementById("nodeSceneBugButtonControls");
  const bugButtonGlyph = document.getElementById("nodeSceneBugButtonGlyph");
  const textBoxControls = document.getElementById("nodeSceneTextBoxControls");
  const textBoxSingleLine = document.getElementById("nodeSceneTextBoxSingleLine");
  const textBoxMultiline = document.getElementById("nodeSceneTextBoxMultiline");
  const textBoxHorizontalAlignControls = document.getElementById("nodeSceneTextBoxHorizontalAlignControls");
  const textBoxAlignLeft = document.getElementById("nodeSceneTextBoxAlignLeft");
  const textBoxAlignCenter = document.getElementById("nodeSceneTextBoxAlignCenter");
  const textBoxAlignRight = document.getElementById("nodeSceneTextBoxAlignRight");
  const textBoxVerticalAlignControls = document.getElementById("nodeSceneTextBoxVerticalAlignControls");
  const textBoxVerticalAlign = document.getElementById("nodeSceneTextBoxVerticalAlign");
  const textBoxVerticalAlignValue = document.getElementById("nodeSceneTextBoxVerticalAlignValue");
  const homeModules = document.getElementById("nodeSceneHomeModules");
  const homeModuleList = document.getElementById("nodeSceneHomeModuleList");
  const moduleMode = mode === "module";
  const wireMode = mode === "wire";
  const homeMode = mode === "home";
  menu.dataset.mode = mode;
  if (sceneMenu && sceneMenu !== menu) {
    sceneMenu.dataset.mode = "home";
  }
  if (moduleActionsWindow && moduleActionsWindow !== menu) {
    moduleActionsWindow.dataset.mode = "";
  }
  const selectedNodeIds = nodeGraphSelectedNodeIds();
  const multiModuleMode = moduleMode && selectedNodeIds.size > 1;
  const selectedNodes = [...selectedNodeIds]
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  const targetNodeId = moduleMode && !multiModuleMode ? nodeGraphModuleActionTargetNodeId() : null;
  if (targetNodeId) {
    nodeGraphMvp.sceneContextTargetNode = targetNodeId;
    nodeGraphMvp.lastModuleActionTargetNode = targetNodeId;
  }
  const targetNode = targetNodeId ? nodeGraphPatchNode(targetNodeId) : null;
  const nativeCodeEntry =
    targetNode && typeof nodeGraphCodeEntryForType === "function"
      ? nodeGraphCodeEntryForType(targetNode.type)
      : null;
  const nativeLibEntry =
    targetNode && typeof nodeGraphLibEntryForType === "function"
      ? nodeGraphLibEntryForType(targetNode.type)
      : null;
  const selectedWire = wireMode ? nodeGraphWireFromSelection(nodeGraphMvp.selected) : null;
  const hasModuleActionTarget = Boolean(targetNode) || multiModuleMode;
  const canDelete = wireMode
    ? Boolean(selectedWire)
    : moduleMode && (
      targetNode
        ? nodeGraphNodeCanBeDeleted(targetNode)
        : [...selectedNodeIds].some((id) => {
          const node = nodeGraphPatchNode(id);
          return nodeGraphMvp.activeNodes.has(id) && nodeGraphNodeCanBeDeleted(node);
        })
    );
  const canCopy = moduleMode && targetNode?.type !== "output";
  const widthGu = targetNode ? nodeGraphPatchNodeGridWidthUnits(targetNode) : 0;
  const widthLimits = targetNode
    ? nodeGraphModuleWidthLimitsForType(targetNode.type)
    : nodeGraphModuleWidthLimits;
  const targetNodeUi = normalizeNodeGraphPatchNodeUi(targetNode?.ui, targetNode?.type);
  const effectiveTargetNodeUi = nodeGraphEffectivePatchNodeUi(targetNode?.ui);
  const targetSizingCapabilities = targetNode
    ? nodeGraphModuleSizingCapabilities(targetNode.type)
    : nodeGraphModuleSizingCapabilities("");
  const targetSupportsWidth = targetSizingCapabilities.width;
  const targetSupportsTextBoxHeight = targetSizingCapabilities.moduleHeight === "textBox";
  const targetSupportsDisplayHeight = targetSizingCapabilities.displayHeight;
  const targetNodeDisabled = targetNode
    ? targetNode.id === "output"
      ? !Boolean(nodeGraphMvp.live.outputEnabled)
      : nodeGraphNodeDisplaysBypassed(targetNode.id)
    : false;
  const buttonsHidden = effectiveTargetNodeUi.buttonsHidden;
  const oscilloscopeHidden = effectiveTargetNodeUi.oscilloscopeHidden;
  const interfaceControlsHidden = effectiveTargetNodeUi.interfaceControlsHidden;
  const displayHeightGu = targetNode ? nodeGraphModuleConfiguredDisplayHeightUnits(targetNode.type, targetNode.ui) : 0;
  const targetNodeLayout = nodeGraphPatchNodeLayout(targetNode);
  const visualFaceLabel = "display";
  const slidersHidden = effectiveTargetNodeUi.slidersHidden;
  const ioHidden = targetNodeUi.ioHidden;
  const titleHidden = targetNodeUi.titleHidden;
  const textBoxLayout = normalizeNodeGraphTextBoxLayout(targetNode?.layout);
  const textBoxMode = textBoxLayout.textMode;
  if (actionMode) {
    if (moduleMode) {
      setNodeModuleSettingsWindowHeader("Settings");
    } else {
      setNodeModuleActionsWindowHeader("WIRE ACTIONS", wireMode ? "selected wire" : "no wire selected");
    }
    menu.setAttribute("aria-label", moduleMode ? "Module settings" : "Wire actions");
  } else {
    setNodeSceneContextHeader("Command", "Center");
    menu.setAttribute("aria-label", "Command Center");
  }
  const hasActionSelection = !actionMode || (moduleMode ? hasModuleActionTarget : Boolean(selectedWire));
  if (moduleActionsWindowButton) {
    moduleActionsWindowButton.disabled = false;
    moduleActionsWindowButton.title = targetNode
      ? "Open module actions for the current target module."
      : "Open module actions with no module selected.";
  }
  if (metaparametersWindowButton) {
    metaparametersWindowButton.disabled = false;
    metaparametersWindowButton.title = nodeGraphContextTargetSliderReadout(targetNode?.id)
      ? "Open the metaparameter editor for the first parameter on this module."
      : "Open blank parameter settings.";
  }
  if (actionMode && !hasActionSelection) {
    setNodeGraphModuleActionControlsHidden(true);
    if (homeModules) {
      homeModules.hidden = true;
    }
    closeButton.hidden = false;
    syncNodeModuleActionsWindowHeightLimit();
    return;
  }
  if (actionMode) {
    setNodeGraphModuleActionControlsHidden(false);
  }
  copyButton.hidden = !moduleMode;
  if (moduleSettingsActionGroup) {
    moduleSettingsActionGroup.hidden = !moduleMode || multiModuleMode;
  }
  if (copySettingsButton) {
    copySettingsButton.hidden = !moduleMode || multiModuleMode;
  }
  if (pasteSettingsButton) {
    pasteSettingsButton.hidden = !moduleMode || multiModuleMode;
  }
  if (setDefaultButton) {
    setDefaultButton.hidden = !moduleMode || multiModuleMode;
  }
  const targetIsGraphType = nodeGraphModuleIsGraphType(targetNode?.type);
  deleteButton.hidden = !(moduleMode || wireMode);
  selectedModule.hidden = !(moduleMode || wireMode);
  if (homeModules) {
    if (homeMode) {
      homeModuleList?.replaceChildren();
    }
    homeModules.hidden = !homeMode || !nodeSceneContextHomeModulesHasContent(homeModules);
  }
  wireTypeControl.hidden = !wireMode;
  aliasControl.hidden = !moduleMode;
  textBoxTextControls.hidden = !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight);
  codeblockControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "codeblock");
  textBoxPortScriptControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "animatedTextBox");
  graphControls.hidden = !(moduleMode && !multiModuleMode && targetIsGraphType);
  toggleModuleEnabledButton.hidden = !moduleMode || multiModuleMode;
  if (nativeCodeGroup) {
    nativeCodeGroup.hidden = !moduleMode || multiModuleMode || !nativeCodeEntry;
  }
  if (nativeLibButton) {
    nativeLibButton.hidden = !nativeLibEntry;
  }
  toggleButtonsButton.hidden = !moduleMode || multiModuleMode;
  toggleOscilloscopeButton.hidden = !(moduleMode && !multiModuleMode && targetSupportsDisplayHeight);
  toggleInterfaceControlsButton.hidden = !(moduleMode && !multiModuleMode && nodeGraphModuleTypeHasInterfaceControls(targetNode?.type));
  toggleSlidersButton.hidden = !(moduleMode && !multiModuleMode && nodeGraphModuleTypeHasHideableSliders(targetNode?.type));
  toggleIoButton.hidden = !moduleMode || multiModuleMode;
  toggleTitleButton.hidden = !moduleMode || multiModuleMode;
  imageControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "image");
  canvasControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "canvas");
  ledControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "led");
  bugButtonControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "bugButton");
  textBoxControls.hidden = !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight);
  textBoxHorizontalAlignControls.hidden = !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight);
  textBoxVerticalAlignControls.hidden = !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight);
  closeButton.hidden = false;
  if (!moduleMode) {
    resetNodeGraphModuleSettingsSizeRow(widthControls, widthDecrease, widthIncrease, widthValue);
    resetNodeGraphModuleSettingsSizeRow(displayHeightControls, displayHeightDecrease, displayHeightIncrease, displayHeightValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxTextSizeControls, textBoxTextSizeDecrease, textBoxTextSizeIncrease, textBoxTextSizeValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxHeightControls, textBoxHeightDecrease, textBoxHeightIncrease, textBoxHeightValue);
  }
  if (moduleMode) {
    selectedModule.hidden = false;
    selectedModule.querySelector("span").textContent = "module";
    selectedModule.querySelector("strong").textContent = multiModuleMode
      ? `${selectedNodeIds.size} modules`
      : targetNode
        ? nodeGraphNodeDisplayName(targetNode.id)
        : "none";
    aliasControl.hidden = multiModuleMode;
    aliasInput.disabled = !targetNode || multiModuleMode;
    if (document.activeElement !== aliasInput) {
      aliasInput.value = targetNode && !multiModuleMode
        ? normalizeNodeGraphPatchNodeAlias(targetNode.alias) || nodeGraphDefaultNodeTitle(targetNode.type, targetNode.id)
        : "";
    }
    aliasInput.placeholder = targetNode && !multiModuleMode ? nodeGraphDefaultNodeTitle(targetNode.type, targetNode.id) : "module title alias";
    aliasInput.title = nodeGraphTooltipText("actions.moduleAlias");
    copyButton.disabled = !canCopy || multiModuleMode;
    copyButton.title = canCopy
      ? nodeGraphTooltipText("actions.copyModule")
      : targetNode
        ? nodeGraphTooltipText("actions.copyUnavailableOutput")
        : nodeGraphTooltipText("actions.copyUnavailableOneModule");
    const settingsClipboard = nodeGraphMvp.moduleSettingsClipboard;
    if (copySettingsButton) {
      copySettingsButton.disabled = !targetNode;
      copySettingsButton.title = targetNode
        ? "Copy this module's settings to paste onto another module of the same type."
        : "Select a module to copy its settings.";
    }
    if (pasteSettingsButton) {
      const settingsMismatch = Boolean(targetNode) && Boolean(settingsClipboard) && settingsClipboard.type !== targetNode.type;
      pasteSettingsButton.disabled = !targetNode || !settingsClipboard;
      pasteSettingsButton.classList.toggle("settings-paste-mismatch", settingsMismatch);
      pasteSettingsButton.title = !targetNode
        ? "Select a module to paste settings onto."
        : !settingsClipboard
          ? "Copy a module's settings first."
          : settingsMismatch
            ? `Clipboard holds ${settingsClipboard.type} settings, not ${targetNode.type}.`
            : "Paste the copied settings onto this module.";
    }
    if (setDefaultButton) {
      setDefaultButton.disabled = !targetNode;
      setDefaultButton.title = targetNode
        ? `Save these settings as the default for new ${targetNode.type} modules.`
        : "Select a module to set its default settings.";
    }
    deleteButton.disabled = !canDelete;
    deleteButton.title = canDelete
      ? nodeGraphTooltipText("actions.deleteModule")
      : targetNode
        ? nodeGraphTooltipText("actions.deleteUnavailableOutput")
        : nodeGraphTooltipText("actions.deleteUnavailableOneModule");
    configureNodeGraphModuleSettingsSizeRow({
      controls: widthControls,
      decreaseButton: widthDecrease,
      increaseButton: widthIncrease,
      valueElement: widthValue,
      hidden: !moduleMode,
      value: multiModuleMode ? `${selectedNodeIds.size} modules` : `${widthGu} gu`,
      decreaseDisabled: multiModuleMode ? !selectedNodes.length : !targetNode || !targetSupportsWidth || widthGu <= widthLimits.minGu,
      increaseDisabled: multiModuleMode ? !selectedNodes.length : !targetNode || !targetSupportsWidth || widthGu >= widthLimits.maxGu,
      decreaseTitle: nodeGraphTooltipText("actions.widthDecrease"),
      increaseTitle: nodeGraphTooltipText("actions.widthIncrease"),
    });
    configureNodeGraphModuleSettingsSizeRow({
      controls: displayHeightControls,
      decreaseButton: displayHeightDecrease,
      increaseButton: displayHeightIncrease,
      valueElement: displayHeightValue,
      hidden: !(moduleMode && !multiModuleMode && targetSupportsDisplayHeight),
      value: `${displayHeightGu} gu`,
      decreaseDisabled: !targetNode || !targetSupportsDisplayHeight || displayHeightGu <= nodeGraphModuleDisplayHeightLimits.minGu,
      increaseDisabled: !targetNode || !targetSupportsDisplayHeight || displayHeightGu >= nodeGraphModuleDisplayHeightLimits.maxGu,
      decreaseTitle: "Decrease this module's display height.",
      increaseTitle: "Increase this module's display height.",
    });
    configureNodeGraphModuleSettingsSizeRow({
      controls: textBoxTextSizeControls,
      decreaseButton: textBoxTextSizeDecrease,
      increaseButton: textBoxTextSizeIncrease,
      valueElement: textBoxTextSizeValue,
      hidden: !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight),
      value: `${textBoxLayout.textSizePercent}%`,
      decreaseDisabled: !targetNode || !targetSupportsTextBoxHeight || textBoxLayout.textSizePercent <= nodeGraphTextBoxTextSizeLimits.minPercent,
      increaseDisabled: !targetNode || !targetSupportsTextBoxHeight || textBoxLayout.textSizePercent >= nodeGraphTextBoxTextSizeLimits.maxPercent,
      decreaseTitle: nodeGraphTooltipText("actions.textBoxTextSizeDecrease"),
      increaseTitle: nodeGraphTooltipText("actions.textBoxTextSizeIncrease"),
    });
    const textBoxHeightGu = targetSupportsTextBoxHeight ? nodeGraphPatchNodeGridHeightUnits(targetNode) : 0;
    configureNodeGraphModuleSettingsSizeRow({
      controls: textBoxHeightControls,
      decreaseButton: textBoxHeightDecrease,
      increaseButton: textBoxHeightIncrease,
      valueElement: textBoxHeightValue,
      hidden: !(moduleMode && !multiModuleMode && targetSupportsTextBoxHeight),
      value: `${textBoxHeightGu} gu`,
      decreaseDisabled: !targetNode || !targetSupportsTextBoxHeight || textBoxHeightGu <= nodeGraphTextBoxHeightLimits.minGu,
      increaseDisabled: !targetNode || !targetSupportsTextBoxHeight || textBoxHeightGu >= nodeGraphTextBoxHeightLimits.maxGu,
      decreaseTitle: nodeGraphTooltipText("actions.textBoxHeightDecrease"),
      increaseTitle: nodeGraphTooltipText("actions.textBoxHeightIncrease"),
    });
    toggleModuleEnabledButton.disabled = !targetNode;
    toggleModuleEnabledButton.querySelector("span").textContent = targetNodeDisabled ? "Enable module" : "Disable module";
    toggleModuleEnabledButton.setAttribute("aria-pressed", targetNodeDisabled ? "true" : "false");
    toggleModuleEnabledButton.title = targetNodeDisabled
      ? "Enable this module."
      : "Disable this module.";
    if (nativeCodeButton) {
      nativeCodeButton.disabled = !nativeCodeEntry;
      nativeCodeButton.querySelector("span").textContent = "Code";
      nativeCodeButton.title = nativeCodeEntry
        ? `Open ${nativeCodeEntry.source || "source"}.`
        : "Source unavailable.";
    }
    if (nativeLibButton) {
      nativeLibButton.disabled = !nativeLibEntry;
      nativeLibButton.querySelector("span").textContent = "LIB";
      nativeLibButton.title = nativeLibEntry
        ? `Open the reference library this module is based on (${nativeLibEntry.libUrl}).`
        : "No third-party reference library for this module.";
    }
    toggleButtonsButton.disabled = !targetNode;
    toggleButtonsButton.querySelector("span").textContent = buttonsHidden ? "Show buttons" : "Hide buttons";
    toggleButtonsButton.setAttribute("aria-pressed", buttonsHidden ? "true" : "false");
    toggleButtonsButton.title = nodeGraphTooltipText(buttonsHidden ? "actions.showModuleButtons" : "actions.hideModuleButtons");
    toggleOscilloscopeButton.disabled = !targetNode || !targetSupportsDisplayHeight;
    toggleOscilloscopeButton.querySelector("span").textContent = oscilloscopeHidden
      ? `Show ${visualFaceLabel}`
      : `Hide ${visualFaceLabel}`;
    toggleOscilloscopeButton.setAttribute("aria-pressed", oscilloscopeHidden ? "true" : "false");
    toggleOscilloscopeButton.title = oscilloscopeHidden
      ? `Show this module's built-in ${visualFaceLabel}.`
      : `Hide this module's built-in ${visualFaceLabel}.`;
    toggleInterfaceControlsButton.disabled = !targetNode || !nodeGraphModuleTypeHasInterfaceControls(targetNode.type);
    toggleInterfaceControlsButton.querySelector("span").textContent = interfaceControlsHidden
      ? "Show control surface"
      : "Hide control surface";
    toggleInterfaceControlsButton.setAttribute("aria-pressed", interfaceControlsHidden ? "true" : "false");
    toggleInterfaceControlsButton.title = interfaceControlsHidden
      ? "Show this module's control surface."
      : "Hide this module's control surface.";
    toggleSlidersButton.disabled = !targetNode || !nodeGraphModuleTypeHasHideableSliders(targetNode.type);
    toggleSlidersButton.querySelector("span").textContent = slidersHidden ? "Show sliders" : "Hide sliders";
    toggleSlidersButton.setAttribute("aria-pressed", slidersHidden ? "true" : "false");
    toggleSlidersButton.title = slidersHidden
      ? "Show this module's parameter sliders."
      : "Hide this module's parameter sliders.";
    toggleIoButton.disabled = !targetNode;
    toggleIoButton.querySelector("span").textContent = ioHidden ? "Show in/out" : "Hide in/out";
    toggleIoButton.setAttribute("aria-pressed", ioHidden ? "true" : "false");
    toggleIoButton.title = ioHidden
      ? "Show this module's input and output ports."
      : "Hide this module's input and output ports.";
    toggleTitleButton.disabled = !targetNode;
    toggleTitleButton.querySelector("span").textContent = titleHidden ? "Show title" : "Hide title";
    toggleTitleButton.setAttribute("aria-pressed", titleHidden ? "true" : "false");
    toggleTitleButton.title = nodeGraphTooltipText(titleHidden ? "actions.showModuleTitle" : "actions.hideModuleTitle");
    if (targetNode?.type === "image") {
      const imageLayout = normalizeNodeGraphImageLayout(targetNode.layout);
      imageSave.disabled = !imageLayout.dataUrl;
      imageRefresh.disabled = false;
      imageSave.title = imageLayout.dataUrl ? "Save this image node's current image." : "Load an image before saving.";
      imageRefresh.title = "Refresh image preview and trace texture.";
    }
    if (targetNode?.type === "canvas") {
      canvasScript.disabled = false;
      canvasScript.title = "Open this canvas module's layer and compositor script.";
    }
    if (targetNode?.type === "led") {
      const led = normalizeNodeGraphLedLayout(targetNode.led);
      ledColor.disabled = false;
      ledColor.value = led.color;
      ledColor.title = "Set this LED's outer rim color. The center uses the bright white dot layer.";
    } else {
      ledColor.disabled = true;
      ledColor.value = nodeGraphLedDefaultColor;
    }
    if (targetNode?.type === "bugButton") {
      bugButtonGlyph.disabled = false;
      if (document.activeElement !== bugButtonGlyph) {
        bugButtonGlyph.value = normalizeNodeGraphBugButtonGlyph(targetNode.bugButton?.glyph);
      }
    } else {
      bugButtonGlyph.disabled = true;
      bugButtonGlyph.value = "";
    }
    textBoxSingleLine.setAttribute("aria-pressed", textBoxMode === "singleLine" ? "true" : "false");
    textBoxMultiline.setAttribute("aria-pressed", textBoxMode === "multiline" ? "true" : "false");
    textBoxSingleLine.title = nodeGraphTooltipText("actions.textBoxSingleLine");
    textBoxMultiline.title = nodeGraphTooltipText("actions.textBoxMultiline");
    textBoxTextInput.disabled = !targetNode || !targetSupportsTextBoxHeight;
    textBoxTextInput.value = targetSupportsTextBoxHeight ? textBoxLayout.text : "";
    textBoxTextInput.title = nodeGraphTooltipText("actions.textBoxContent");
    if (targetNode?.type === "codeblock") {
      const codeblock = normalizeNodeGraphCodeblock(targetNode.codeblock);
      codeblockInputs.value = codeblock.inputs.join(", ");
      codeblockOutputs.value = codeblock.outputs.join(", ");
      codeblockSource.value = codeblock.code;
      const status = nodeGraphCodeblockCompileStatus(codeblock);
      codeblockStatus.textContent = status.ok ? "code ok" : `compile error: ${status.message}`;
    } else {
      codeblockInputs.value = "";
      codeblockOutputs.value = "";
      codeblockSource.value = "";
      codeblockStatus.textContent = "";
    }
    if (targetNode?.type === "animatedTextBox") {
      const titleScript = targetNode.portScripts?.Title || "";
      const textScript = targetNode.portScripts?.Text || "";
      textBoxTitleScript.value = titleScript;
      textBoxTextScript.value = textScript;
      textBoxTitleScriptStatus.textContent = titleScript.trim()
        ? (compileNodeGraphPortScript(titleScript) ? "code ok" : "compile error")
        : "";
      textBoxTextScriptStatus.textContent = textScript.trim()
        ? (compileNodeGraphPortScript(textScript) ? "code ok" : "compile error")
        : "";
    } else {
      textBoxTitleScript.value = "";
      textBoxTextScript.value = "";
      textBoxTitleScriptStatus.textContent = "";
      textBoxTextScriptStatus.textContent = "";
    }
    if (targetIsGraphType) {
      syncNodeGraphGraphControls(nodeGraphGraphForNode(targetNode));
      graphCursorX.disabled = false;
      graphNodeIndex.disabled = false;
      graphPreviousNode.disabled = false;
      graphNextNode.disabled = false;
      graphNodeX.disabled = false;
      graphNodeY.disabled = false;
      // Per-point curve shape/contour editing belonged to the retired "graph"
      // type; graph2 (the only graph type left) always uses one global
      // smoothing mode, so these controls stay permanently disabled/hidden.
      graphNodeContour.disabled = true;
      graphNodeShape.disabled = true;
      graphCursorX.title = "Move the vertical graph cursor.";
      graphNodeIndex.title = "Choose the graph node to edit.";
      graphPreviousNode.title = "Select the previous graph node.";
      graphNextNode.title = "Select the next graph node.";
      graphNodeX.title = "Set the selected node's x position.";
      graphNodeY.title = "Set the selected node's y value.";
      graphNodeContour.title = "Bend the selected node's outgoing segment.";
      graphNodeShape.title = "Choose the selected node's outgoing curve shape.";
    } else {
      graphCursorX.value = "";
      graphNodeIndex.replaceChildren();
      graphNodeList.replaceChildren();
      graphNodeX.value = "";
      graphNodeY.value = "";
      graphNodeContour.value = "";
      graphNodeShape.value = "rational";
      graphCursorX.disabled = true;
      graphNodeIndex.disabled = true;
      graphPreviousNode.disabled = true;
      graphNextNode.disabled = true;
      graphNodeX.disabled = true;
      graphNodeY.disabled = true;
      graphNodeContour.disabled = true;
      graphNodeShape.disabled = true;
      graphRemoveNode.disabled = true;
    }
    textBoxAlignLeft.setAttribute("aria-pressed", textBoxLayout.horizontalAlign === "left" ? "true" : "false");
    textBoxAlignCenter.setAttribute("aria-pressed", textBoxLayout.horizontalAlign === "center" ? "true" : "false");
    textBoxAlignRight.setAttribute("aria-pressed", textBoxLayout.horizontalAlign === "right" ? "true" : "false");
    textBoxVerticalAlign.disabled = !targetNode || !targetSupportsTextBoxHeight;
    textBoxVerticalAlign.value = String(textBoxLayout.verticalAlignPercent);
    textBoxVerticalAlignValue.textContent = `${textBoxLayout.verticalAlignPercent}%`;
    textBoxVerticalAlign.title = nodeGraphTooltipText("actions.textBoxVerticalPosition");
    textBoxAlignLeft.title = nodeGraphTooltipText("actions.textBoxAlignLeft");
    textBoxAlignCenter.title = nodeGraphTooltipText("actions.textBoxAlignCenter");
    textBoxAlignRight.title = nodeGraphTooltipText("actions.textBoxAlignRight");
  } else if (wireMode) {
    selectedModule.querySelector("span").textContent = selectedWire?.kind === "modulation"
      ? "selected modulation"
      : "selected wire";
    selectedModule.querySelector("strong").textContent = nodeGraphWireSelectionLabel(nodeGraphMvp.selected);
    const selectedWireType = normalizeNodeGraphWireType(selectedWire?.wire?.wireType);
    for (const button of wireTypeButtons) {
      button.disabled = !selectedWire;
      button.setAttribute("aria-pressed", button.dataset.wireType === selectedWireType ? "true" : "false");
      button.title = nodeGraphTooltipText(`actions.wireType.${button.dataset.wireType}`);
    }
    deleteButton.disabled = !canDelete;
    deleteButton.title = canDelete
      ? nodeGraphTooltipText("actions.deleteWire")
      : nodeGraphTooltipText("actions.deleteWireMissing");
    copyButton.disabled = true;
    copyButton.title = nodeGraphTooltipText("actions.copyUnavailableWire");
    resetNodeGraphModuleSettingsSizeRow(widthControls, widthDecrease, widthIncrease, widthValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxTextSizeControls, textBoxTextSizeDecrease, textBoxTextSizeIncrease, textBoxTextSizeValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxHeightControls, textBoxHeightDecrease, textBoxHeightIncrease, textBoxHeightValue);
    textBoxTextInput.value = "";
    textBoxTextInput.disabled = true;
    codeblockInputs.value = "";
    codeblockOutputs.value = "";
    codeblockSource.value = "";
    codeblockStatus.textContent = "";
    textBoxTitleScript.value = "";
    textBoxTextScript.value = "";
    textBoxTitleScriptStatus.textContent = "";
    textBoxTextScriptStatus.textContent = "";
    graphCursorX.value = "";
    graphNodeIndex.replaceChildren();
    graphNodeList.replaceChildren();
    graphNodeX.value = "";
    graphNodeY.value = "";
    graphNodeContour.value = "";
    graphNodeShape.value = "rational";
    graphCursorX.disabled = true;
    graphNodeIndex.disabled = true;
    graphNodeX.disabled = true;
    graphNodeY.disabled = true;
    graphNodeContour.disabled = true;
    graphNodeShape.disabled = true;
    graphRemoveNode.disabled = true;
    textBoxVerticalAlign.value = "50";
    textBoxVerticalAlignValue.textContent = "";
    textBoxVerticalAlign.disabled = true;
    toggleButtonsButton.disabled = true;
    toggleOscilloscopeButton.disabled = true;
    toggleTitleButton.disabled = true;
    imageSave.disabled = true;
    imageRefresh.disabled = true;
    canvasScript.disabled = true;
    ledColor.disabled = true;
    ledColor.value = nodeGraphLedDefaultColor;
    bugButtonGlyph.disabled = true;
    bugButtonGlyph.value = "";
  } else {
    selectedModule.querySelector("span").textContent = "selected";
    selectedModule.querySelector("strong").textContent = "none";
    for (const button of wireTypeButtons) {
      button.disabled = true;
      button.setAttribute("aria-pressed", "false");
    }
    copyButton.disabled = true;
    copyButton.title = nodeGraphTooltipText("actions.copyUnavailableModule");
    deleteButton.disabled = true;
    deleteButton.title = nodeGraphTooltipText("actions.deleteTitle");
    resetNodeGraphModuleSettingsSizeRow(widthControls, widthDecrease, widthIncrease, widthValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxTextSizeControls, textBoxTextSizeDecrease, textBoxTextSizeIncrease, textBoxTextSizeValue);
    resetNodeGraphModuleSettingsSizeRow(textBoxHeightControls, textBoxHeightDecrease, textBoxHeightIncrease, textBoxHeightValue);
    textBoxTextInput.value = "";
    textBoxTextInput.disabled = true;
    codeblockInputs.value = "";
    codeblockOutputs.value = "";
    codeblockSource.value = "";
    codeblockStatus.textContent = "";
    textBoxTitleScript.value = "";
    textBoxTextScript.value = "";
    textBoxTitleScriptStatus.textContent = "";
    textBoxTextScriptStatus.textContent = "";
    graphCursorX.value = "";
    graphNodeIndex.replaceChildren();
    graphNodeList.replaceChildren();
    graphNodeX.value = "";
    graphNodeY.value = "";
    graphNodeContour.value = "";
    graphNodeShape.value = "rational";
    graphCursorX.disabled = true;
    graphNodeIndex.disabled = true;
    graphNodeX.disabled = true;
    graphNodeY.disabled = true;
    graphNodeContour.disabled = true;
    graphNodeShape.disabled = true;
    graphRemoveNode.disabled = true;
    textBoxVerticalAlign.value = "50";
    textBoxVerticalAlignValue.textContent = "";
    textBoxVerticalAlign.disabled = true;
    toggleButtonsButton.disabled = true;
    toggleOscilloscopeButton.disabled = true;
    toggleTitleButton.disabled = true;
    imageSave.disabled = true;
    imageRefresh.disabled = true;
    canvasScript.disabled = true;
    ledColor.disabled = true;
    ledColor.value = nodeGraphLedDefaultColor;
    bugButtonGlyph.disabled = true;
    bugButtonGlyph.value = "";
  }
  if (actionMode) {
    syncNodeModuleActionsWindowHeightLimit();
  }
}

function openNodeModuleActionMenu(event) {
  ensureNodeGraphModuleActionsWindowBody();
  const button = event.currentTarget;
  const node = button.closest(".dsp-node");
  if (!node) {
    return;
  }

  nodeGraphMvp.sceneContextPoint = null;
  closeNodeScopeContextMenu();
  nodeGraphMvp.sceneContextTargetNode = node.dataset.node;
  nodeGraphMvp.lastModuleActionTargetNode = node.dataset.node;
  nodeGraphMvp.sceneContextTargetWire = null;
  configureNodeSceneContextMenu("module");
  showNodeModuleActionsWindow(button.getBoundingClientRect());
  event.preventDefault();
  event.stopPropagation();
}

function openNodeScopeContextMenu(event) {
  const contextScope = event.target.closest?.(".node-module-scope-window, .node-led-face");
  const nodeId = contextScope?.dataset?.node || "";
  if (!nodeId || !nodeGraphPatchNode(nodeId)) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  closeNodeSceneContextMenu();
  nodeGraphMvp.sceneContextPoint = null;
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  nodeGraphMvp.scopeContextTargetNode = nodeId;
  if (typeof openNodeGraphTraceDisplaySettings === "function" && openNodeGraphTraceDisplaySettings(nodeId, event)) {
    return true;
  }
  if (typeof openNodeGraphScopeShaderScript === "function" && openNodeGraphScopeShaderScript(nodeId)) {
    return true;
  }
  return true;
}

// Right-click on the Music Player's waveform display -- deliberately does
// NOT call closeNodeSceneContextMenu() or touch any other floating window.
// The waveform settings window is fully independent, not part of the
// shared-inspector displacement dance (metadata/module-actions/trace
// settings auto-closing each other) -- opening it must never make another
// window disappear.
function openNodePhosphorWaveformContextMenu(event) {
  const display = event.target.closest?.(".node-phosphor-waveform-display");
  const nodeId = display?.dataset?.node || "";
  if (!nodeId || !nodeGraphPatchNode(nodeId)) {
    return false;
  }
  if (typeof openNodeGraphPhosphorWaveformSettings !== "function") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  openNodeGraphPhosphorWaveformSettings(nodeId, event);
  return true;
}

const nodeGraphWorkspaceInteractiveDialogSelector =
  "input, textarea, select, option, [contenteditable='true'], " +
  "#nodeSceneContextMenu, #nodeParameterMetadataPopover, #nodeGlobalScopeMenu, " +
  "#nodeModuleActionsWindow, #nodeCodeBoxWindow, #nodeShaderScriptDialog, #nodeCanvasScriptDialog, #nodeSavedPatchesWindow, " +
  "#nodePhosphorWaveformSettingsWindow";
const nodeGraphWorkspaceOccupiedElementSelector =
  ".node-wire-hit-path, .node-wire-path, .dsp-node, .node-port, .node-param-port, .node-slider-readout";

// Shared by the right-click scene menu and double-click-to-spawn: true only when
// the event lands on truly empty canvas, not the toolbar, a dialog/input, a wire,
// a node, or a port/readout.
function nodeGraphEventTargetIsEmptyWorkspaceArea(event) {
  if (event.target.closest?.(".node-view-toolbar")) {
    return false;
  }
  if (event.target.closest?.(nodeGraphWorkspaceInteractiveDialogSelector)) {
    return false;
  }
  if (event.target.closest?.(nodeGraphWorkspaceOccupiedElementSelector)) {
    return false;
  }
  return true;
}

function openNodeSceneContextMenu(event) {
  if (event.target.closest?.(".node-view-toolbar")) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.target.closest?.(nodeGraphWorkspaceInteractiveDialogSelector)) {
    return;
  }
  if (openNodeScopeContextMenu(event)) {
    return;
  }
  if (openNodePhosphorWaveformContextMenu(event)) {
    return;
  }
  const contextMenuClientPoint = rememberNodeGraphContextMenuClientPoint(event);

  closeNodeScopeContextMenu();
  const contextWire = event.target.closest?.(".node-wire-hit-path, .node-wire-path");
  if (contextWire) {
    const index = Number(contextWire.dataset.connectionIndex);
    const kind = contextWire.dataset.connectionKind || "signal";
    if (Number.isFinite(index)) {
      event.preventDefault();
      event.stopPropagation();
      setNodeGraphSelection({ type: "wire", kind, index });
      nodeGraphMvp.sceneContextPoint = null;
      nodeGraphMvp.sceneContextTargetNode = null;
      nodeGraphMvp.sceneContextTargetWire = { index, kind };
      configureNodeSceneContextMenu("wire");
      nodeGraphMvp.sharedInspectorActive = "moduleActions";
      positionNodeModuleActionsWindowAtSavedOr(
        document.getElementById("nodeModuleActionsWindow"),
        event.clientX,
        event.clientY,
      );
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "moduleActions",
          document.getElementById("nodeModuleActionsWindow"),
          { open: true },
          { status: false },
        );
      }
    }
    return;
  }

  const contextNode = event.target.closest(".dsp-node");
  if (contextNode) {
    event.preventDefault();
    event.stopPropagation();
    nodeGraphMvp.sceneContextPoint = null;
    nodeGraphMvp.sceneContextTargetNode = contextNode.dataset.node;
    nodeGraphMvp.lastModuleActionTargetNode = contextNode.dataset.node;
    nodeGraphMvp.sceneContextTargetWire = null;
    configureNodeSceneContextMenu("module");
    nodeGraphMvp.sharedInspectorActive = "moduleActions";
    positionNodeModuleActionsWindowAtSavedOr(
      document.getElementById("nodeModuleActionsWindow"),
      event.clientX,
      event.clientY,
    );
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "moduleActions",
        document.getElementById("nodeModuleActionsWindow"),
        { open: true },
        { status: false },
      );
    }
    return;
  }
  if (event.target.closest(".node-port, .node-param-port, .node-slider-readout")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  nodeGraphMvp.sceneContextPoint = nodeGraphClientPoint(event);
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  clearNodeGraphSelection();
  // Right-click on empty canvas always opens/repositions Command Center --
  // it used to divert to opening the Module Browser instead when Command
  // Center was already open, which was surprising (a second right-click
  // should reposition the menu you already have, not switch to a
  // different window). That change dropped the attention-pulse glow that
  // used to accompany right-click along with it -- restored here so every
  // right-click (open or reposition) glows the window, not just a
  // conditional "already open" case.
  const commandCenter = document.getElementById("nodeSceneContextMenu");
  configureNodeSceneContextMenu("home");
  positionNodeSceneContextMenuAtCurrentSavedOrInitial(commandCenter, event.clientX, event.clientY);
  pulseNodeGraphFloatingWindowAttention(commandCenter);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "commandCenter",
      null,
      { open: true },
      { capturePosition: false, status: false },
    );
  }
}
