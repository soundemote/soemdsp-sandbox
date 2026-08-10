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
  // Content-height cold open (no fixed tall box full of empty chrome).
  // User resize / unified seat still pin an explicit height when set.
  // height omitted → CSS height:auto from content.
  minWidth: 24,
  // Match module-browser max so the unified floating window can keep one size
  // when switching Command Center ↔ Modules without clamping narrower.
  maxWidth: 980,
  minHeight: 120,
  // Height max is available view space from the window top (no fixed ceiling).
});

const nodeModuleActionsWindowDefaultSize = Object.freeze({
  width: 185,
  height: 620,
  minWidth: 24,
  maxWidth: 980,
  minHeight: 120,
});

// pulseNodeGraphFloatingWindowAttention moved to node-graph-floating-windows.js
// -- it is used by six different windows, so it belongs with the rest of the
// shared floating-window subsystem rather than in the context menu.

function normalizeNodeSceneContextWindowSize(size = {}, element = null) {
  return normalizeNodeGraphFloatingWindowSize(
    size,
    nodeSceneContextWindowDefaultSize,
    element ? { element } : {},
  );
}

function normalizeNodeModuleActionsWindowSize(size = {}, element = null) {
  return normalizeNodeGraphFloatingWindowSize(
    size,
    nodeModuleActionsWindowDefaultSize,
    element ? { element } : {},
  );
}

function syncNodeModuleActionsWindowHeightLimit() {
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu) {
    return null;
  }
  const normalized = normalizeNodeModuleActionsWindowSize(
    nodeGraphMvp.moduleActionWindowSize || nodeModuleActionsWindowDefaultSize,
    menu,
  );
  const height = Number(normalized.height) || nodeModuleActionsWindowDefaultSize.height;
  menu.style.setProperty("--node-module-actions-height", `${Math.round(height)}px`);
  return height;
}

/**
 * Keep floating panel box size on the element so corner-resize always sticks.
 * CSS vars alone can lose height when a partial size update clears --*-height
 * (normalize used to drop missing height → auto → content-sized, can't grow).
 * Inline width/height + max none wins over per-page max-height caps.
 */
function syncNodeGraphFloatingWindowInlineBox(element, size = {}) {
  if (!element) {
    return;
  }
  const width = Math.round(Number(size.width));
  const height = Math.round(Number(size.height));
  if (width > 40) {
    element.style.width = `${width}px`;
  }
  if (height > 40) {
    element.style.height = `${height}px`;
  }
  if (width > 40 || height > 40) {
    element.style.boxSizing = "border-box";
    // Clear CSS max-* so authored maxHeight vars cannot block stretch once
    // the user has an explicit box (still clamped in normalize to viewport).
    element.style.maxWidth = "none";
    element.style.maxHeight = "none";
  }
  if (width > 40 && height > 40 && nodeGraphMvp) {
    nodeGraphMvp.unifiedWindowSize = { width, height };
  }
}

function mergeNodeGraphFloatingWindowSize(current, next, defaults) {
  const base = (current && typeof current === "object")
    ? current
    : (defaults && typeof defaults === "object" ? defaults : {});
  const patch = (next && typeof next === "object") ? next : {};
  return {
    ...base,
    ...patch,
  };
}

function applyNodeSceneContextWindowSize(size = nodeGraphMvp.sceneContextWindowSize, element = null) {
  const menu = element || document.getElementById("nodeSceneContextMenu");
  const merged = mergeNodeGraphFloatingWindowSize(
    nodeGraphMvp.sceneContextWindowSize,
    size,
    nodeSceneContextWindowDefaultSize,
  );
  const normalized = normalizeNodeSceneContextWindowSize(merged, menu);
  // Strip internal cap fields before persist.
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  nodeGraphMvp.sceneContextWindowSize = stored;
  if (!menu) {
    return stored;
  }
  applyNodeGraphFloatingWindowSizeVars(menu, "node-scene-context", nodeSceneContextWindowDefaultSize, stored);
  syncNodeGraphFloatingWindowInlineBox(menu, stored);
  // Live max from view space so CSS does not leave a fixed-pixel gap at bottom.
  if (Number.isFinite(normalized._maxHeight)) {
    menu.style.setProperty("--node-scene-context-max-height", `${normalized._maxHeight}px`);
  }
  if (Number.isFinite(normalized._maxWidth)) {
    menu.style.setProperty("--node-scene-context-max-width", `${normalized._maxWidth}px`);
  }
  return stored;
}

function applyNodeModuleActionsWindowSize(size = nodeGraphMvp.moduleActionWindowSize, element = null) {
  const menu = element || document.getElementById("nodeModuleActionsWindow");
  const merged = mergeNodeGraphFloatingWindowSize(
    nodeGraphMvp.moduleActionWindowSize,
    size,
    nodeModuleActionsWindowDefaultSize,
  );
  const normalized = normalizeNodeModuleActionsWindowSize(merged, menu);
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  nodeGraphMvp.moduleActionWindowSize = stored;
  if (!menu) {
    return stored;
  }
  applyNodeGraphFloatingWindowSizeVars(menu, "node-module-actions", nodeModuleActionsWindowDefaultSize, stored);
  syncNodeModuleActionsWindowHeightLimit();
  syncNodeGraphFloatingWindowInlineBox(menu, stored);
  if (Number.isFinite(normalized._maxHeight)) {
    menu.style.setProperty("--node-module-actions-max-height", `${normalized._maxHeight}px`);
  }
  if (Number.isFinite(normalized._maxWidth)) {
    menu.style.setProperty("--node-module-actions-max-width", `${normalized._maxWidth}px`);
  }
  return stored;
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
  const usableSaved = typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? nodeGraphFloatingWindowSavedPositionIsUsable(savedPosition)
    : (Number.isFinite(Number(savedPosition?.left))
      && Number.isFinite(Number(savedPosition?.top))
      && !(Number(savedPosition.left) === 0 && Number(savedPosition.top) === 0));
  const usableCurrent = typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? nodeGraphFloatingWindowSavedPositionIsUsable(currentPosition)
    : (Number.isFinite(Number(currentPosition?.left))
      && Number.isFinite(Number(currentPosition?.top))
      && !(Number(currentPosition?.left) === 0 && Number(currentPosition?.top) === 0));
  const chosenPosition = usableSaved ? savedPosition : (usableCurrent ? currentPosition : null);
  if (chosenPosition) {
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
  const hasSavedPosition = typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? nodeGraphFloatingWindowSavedPositionIsUsable(savedPosition)
    : (Number.isFinite(Number(savedPosition?.left))
      && Number.isFinite(Number(savedPosition?.top))
      && !(Number(savedPosition.left) === 0 && Number(savedPosition.top) === 0));
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    !hasSavedPosition,
  );
}

function positionNodeModuleActionsWindowAtSavedOr(menu, x, y) {
  // Glow when re-opening changes nothing on screen -- shared behaviour, see
  // positionNodeGraphFloatingWindowWithAttention.
  if (typeof positionNodeGraphFloatingWindowWithAttention === "function") {
    positionNodeGraphFloatingWindowWithAttention(menu, () => {
      applyNodeModuleActionsWindowSavedOrPosition(menu, x, y);
    });
    return;
  }
  applyNodeModuleActionsWindowSavedOrPosition(menu, x, y);
}

function applyNodeModuleActionsWindowSavedOrPosition(menu, x, y) {
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  const savedPosition = sharedInspectorState.position || nodeGraphMvp.moduleActionWindowPosition;
  const hasSavedPosition = typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? nodeGraphFloatingWindowSavedPositionIsUsable(savedPosition)
    : (Number.isFinite(Number(savedPosition?.left)) && Number.isFinite(Number(savedPosition?.top))
      && !(Number(savedPosition.left) === 0 && Number(savedPosition.top) === 0));
  applyNodeModuleActionsWindowSize(sharedInspectorState.size);
  positionNodeSceneContextMenu(
    menu,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
    true,
  );
}

function positionNodeScopeContextMenuAtSavedOr(menu, x, y) {
  if (typeof positionNodeGraphFloatingWindowWithAttention === "function") {
    positionNodeGraphFloatingWindowWithAttention(menu, () => {
      applyNodeScopeContextMenuSavedOrPosition(menu, x, y);
    });
    return;
  }
  applyNodeScopeContextMenuSavedOrPosition(menu, x, y);
}

function applyNodeScopeContextMenuSavedOrPosition(menu, x, y) {
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
  if (typeof positionNodeGraphFloatingWindowWithAttention === "function") {
    positionNodeGraphFloatingWindowWithAttention(menu, () => {
      applyNodeGlobalScopeMenuSavedOrPosition(menu, x, y);
    });
    return;
  }
  applyNodeGlobalScopeMenuSavedOrPosition(menu, x, y);
}

function applyNodeGlobalScopeMenuSavedOrPosition(menu, x, y) {
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
  dragNodeGraphFloatingWindowResize(event, "sceneContextResizing", applyNodeSceneContextWindowSize, { height: true });
}

function endNodeSceneContextWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "sceneContextResizing", () => {
    saveNodeSceneContextWindowSizeToUserSettings();
    if (typeof rememberNodeGraphUnifiedWindowSizeFromElement === "function") {
      rememberNodeGraphUnifiedWindowSizeFromElement(document.getElementById("nodeSceneContextMenu"));
    }
  });
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

/**
 * Two-line label for compact Module Settings action buttons
 * (shared — not per-module). Example: ("Copy", "Module") → stacked lines.
 */
function setNodeGraphSceneContextButtonLines(button, line1, line2 = "") {
  if (!button) {
    return;
  }
  let host = button.querySelector(":scope > .scene-context-button-lines");
  if (!host) {
    host = document.createElement("span");
    host.className = "scene-context-button-lines";
    host.append(document.createElement("span"), document.createElement("span"));
    button.replaceChildren(host);
  }
  const parts = host.querySelectorAll(":scope > span");
  if (parts[0]) {
    parts[0].textContent = String(line1 || "");
  }
  if (parts[1]) {
    const second = String(line2 || "");
    parts[1].textContent = second;
    parts[1].hidden = !second;
  }
  const full = [line1, line2].filter(Boolean).join(" ");
  if (full) {
    button.setAttribute("aria-label", full);
  }
}

// Order in the Module Settings body: module title first (under nav), then
// Copy Module / Settings / Paste / Default, then Show/Hide section, then rest.
const nodeGraphModuleActionControlIds = [
  "nodeSceneSelectedModule",
  // Copy Module lives inside this group (left of Copy Settings).
  "nodeSceneModuleSettingsActionGroup",
  // Show/Hide chrome toggles — immediately under copy/settings row.
  "nodeSceneModuleVisibilitySection",
  "nodeSceneAliasControl",
  "nodeSceneAddToUi",
  "nodeSceneWireTypeControl",
  "nodeSceneAddToGroup",
  // Width + Height (display gu) stay paired — app-wide policy for every module.
  "nodeSceneWidthControls",
  "nodeSceneDisplayHeightControls",
  "nodeSceneTextBoxTextSizeControls",
  "nodeSceneTextBoxHeightControls",
  "nodeSceneTextBoxTextControls",
  "nodeSceneCodeblockControls",
  "nodeSceneGraphControls",
  "nodeSceneImageControls",
  "nodeSceneKnobFaceControls",
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
    if (!element) {
      continue;
    }
    // Keep Copy Module inside the shared settings action group when present.
    if (id === "nodeSceneCopyModule") {
      const group = document.getElementById("nodeSceneModuleSettingsActionGroup");
      if (group && element.parentElement !== group) {
        group.prepend(element);
      }
      continue;
    }
    if (element.parentElement !== body) {
      body.append(element);
    }
  }
  // DOM order matches control id list (title first under nav).
  for (const id of nodeGraphModuleActionControlIds) {
    if (id === "nodeSceneCopyModule") {
      continue;
    }
    const element = document.getElementById(id);
    if (element && element.parentElement === body) {
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
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("moduleActions", menu);
    }
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
  const pending = nodeGraphMvp._unifiedWindowPendingPosition;
  const rect = anchorRect || {
    right: window.innerWidth * 0.5,
    top: window.innerHeight * 0.25,
    bottom: window.innerHeight * 0.25,
  };
  nodeGraphMvp.sharedInspectorActive = "moduleActions";
  positionNodeModuleActionsWindowAtSavedOr(
    menu,
    Number.isFinite(Number(pending?.left))
      ? pending.left
      : Number.isFinite(Number(replacementRect?.left))
      ? replacementRect.left
      : Number.isFinite(Number(rect.right))
      ? rect.right + 8
      : window.innerWidth * 0.5,
    Number.isFinite(Number(pending?.top))
      ? pending.top
      : Number.isFinite(Number(replacementRect?.top))
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
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("moduleActions", menu);
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

// Nav / Command Center entry for Parameter Settings: always blank.
// Filling the form is only via right-click on a slider readout.
function openNodeGraphMetaparametersFromContextWindow() {
  const anchor = document.getElementById("nodeSceneOpenMetaparameters");
  const rect = anchor?.getBoundingClientRect?.() || {
    right: window.innerWidth * 0.5,
    top: window.innerHeight * 0.25,
  };
  openBlankNodeMetadataPopover({
    clientX: rect.right + 8,
    clientY: rect.top,
    preventDefault() {},
    stopPropagation() {},
  });
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
  // Chrome title is just SETTINGS — module name lives under the nav bar
  // (nodeSceneSelectedModule), matching Display Settings target placement.
  setNodeModuleActionsWindowHeader("SETTINGS", detail || "");
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
  const moduleVisibilitySection = document.getElementById("nodeSceneModuleVisibilitySection");
  const moduleVisibilityActionGroup = document.getElementById("nodeSceneModuleVisibilityActionGroup");
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
  const wirePixelToggle = document.getElementById("nodeSceneWirePixelToggle");
  const aliasControl = document.getElementById("nodeSceneAliasControl");
  const aliasInput = document.getElementById("nodeSceneAliasInput");
  const addToGroupButton = document.getElementById("nodeSceneAddToGroup");
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
  const graphNodeList = document.getElementById("nodeSceneGraphNodeList");
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
  const knobFaceControls = document.getElementById("nodeSceneKnobFaceControls");
  const canvasControls = document.getElementById("nodeSceneCanvasControls");
  const canvasScript = document.getElementById("nodeSceneCanvasScript");
  const ledControls = document.getElementById("nodeSceneLedControls");
  const ledColor = document.getElementById("nodeSceneLedColor");
  const bugButtonControls = document.getElementById("nodeSceneBugButtonControls");
  const bugButtonGlyph = document.getElementById("nodeSceneBugButtonGlyph");
  const textBoxControls = document.getElementById("nodeSceneTextBoxControls");
  const textBoxSingleLine = document.getElementById("nodeSceneTextBoxSingleLine");
  const textBoxMultiline = document.getElementById("nodeSceneTextBoxMultiline");
  const textBoxFill = document.getElementById("nodeSceneTextBoxFill");
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
  const effectiveTargetNodeUi = nodeGraphEffectivePatchNodeUi(targetNode?.ui, targetNode?.type);
  const targetSizingCapabilities = targetNode
    ? nodeGraphModuleSizingCapabilities(targetNode.type)
    : nodeGraphModuleSizingCapabilities("");
  const targetSupportsWidth = targetSizingCapabilities.width;
  const targetSupportsTextBoxHeight = targetSizingCapabilities.moduleHeight === "textBox";
  const targetSupportsModuleHeight = ["custom", "textBox"].includes(targetSizingCapabilities.moduleHeight);
  const targetSupportsDisplayHeight = targetSizingCapabilities.displayHeight;
  const targetNodeDisabled = targetNode
    ? targetNode.id === "output"
      ? !Boolean(nodeGraphMvp.live.outputEnabled)
      : nodeGraphNodeDisplaysBypassed(targetNode.id)
    : false;
  const buttonsHidden = effectiveTargetNodeUi.buttonsHidden;
  const oscilloscopeHidden = effectiveTargetNodeUi.oscilloscopeHidden;
  const interfaceControlsHidden = effectiveTargetNodeUi.interfaceControlsHidden;
  // Height readout = OUTER module grid height (not face-only). Face min is 1gu.
  const outerHeightGu = targetNode && typeof nodeGraphPatchNodeGridHeightUnits === "function"
    ? nodeGraphPatchNodeGridHeightUnits(targetNode)
    : 0;
  const faceHeightGu = targetNode && typeof nodeGraphModuleConfiguredDisplayHeightUnits === "function"
    ? nodeGraphModuleConfiguredDisplayHeightUnits(targetNode.type, targetNode.ui)
    : 0;
  const displayHeightGu = outerHeightGu;
  const targetNodeLayout = nodeGraphPatchNodeLayout(targetNode);
  const visualFaceLabel = "display";
  const slidersHidden = effectiveTargetNodeUi.slidersHidden;
  const ioHidden = targetNodeUi.ioHidden;
  const titleHidden = targetNodeUi.titleHidden;
  const textBoxLayout = normalizeNodeGraphTextBoxLayout(targetNode?.layout);
  const textBoxMode = textBoxLayout.textMode;
  if (actionMode) {
    if (moduleMode) {
      setNodeModuleSettingsWindowHeader("");
    } else {
      setNodeModuleActionsWindowHeader("WIRE ACTIONS", wireMode ? "selected wire" : "no wire selected");
    }
    menu.setAttribute("aria-label", moduleMode ? "Module settings" : "Wire actions");
  } else {
    setNodeSceneContextHeader("Command", "Center");
    menu.setAttribute("aria-label", "Command Center");
    if (typeof renderNodeGraphCommandCenterModuleSearch === "function") {
      renderNodeGraphCommandCenterModuleSearch();
    }
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
  if (copyButton) {
    // Visible only in module mode (lives in the settings action group row).
    copyButton.hidden = !moduleMode || multiModuleMode;
  }
  if (addToGroupButton) {
    // Grouping selected modules isn't built yet (see
    // saveNodeGraphSelectionAsModuleGroup's early return in
    // node-graph-module-actions.js) -- the button is shown alongside the
    // other Module Settings actions, matching where it'll live once the
    // feature ships, but stays permanently disabled with an explanatory
    // tooltip rather than being hidden entirely.
    addToGroupButton.hidden = !moduleMode;
    addToGroupButton.disabled = true;
    addToGroupButton.title = "Add to group under construction. Module grouping is under construction.";
  }
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
  // Multi-select: visibility + enable + size (not copy/paste/default settings).
  const multiCanButtons = multiModuleMode && selectedNodes.length > 0;
  const multiCanDisplay = multiModuleMode && selectedNodes.some((node) =>
    typeof nodeGraphPatchNodeHasHideableOscilloscope === "function"
      ? nodeGraphPatchNodeHasHideableOscilloscope(node)
      : false,
  );
  const multiCanDisplayHeight = multiModuleMode && selectedNodes.some((node) =>
    typeof nodeGraphPatchNodeHasResizableDisplayArea === "function"
      ? nodeGraphPatchNodeHasResizableDisplayArea(node)
      : false,
  );
  const multiCanInterface = multiModuleMode && selectedNodes.some((node) =>
    typeof nodeGraphModuleTypeHasInterfaceControls === "function"
      && nodeGraphModuleTypeHasInterfaceControls(node.type),
  );
  const multiCanSliders = multiModuleMode && selectedNodes.some((node) =>
    typeof nodeGraphModuleTypeHasHideableSliders === "function"
      && nodeGraphModuleTypeHasHideableSliders(node.type),
  );
  const multiCanModuleHeight = multiModuleMode && selectedNodes.some((node) =>
    ["custom", "textBox"].includes(nodeGraphModuleSizingCapabilities(node.type).moduleHeight),
  );
  const multiCanWidth = multiModuleMode && selectedNodes.some((node) =>
    nodeGraphModuleSizingCapabilities(node.type).width,
  );
  if (moduleVisibilitySection) {
    moduleVisibilitySection.hidden = !moduleMode;
  }
  if (moduleVisibilityActionGroup) {
    // Stack stays visible with the section; individual buttons still gate per capability.
    moduleVisibilityActionGroup.hidden = false;
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
  toggleModuleEnabledButton.hidden = !moduleMode;
  if (nativeCodeGroup) {
    nativeCodeGroup.hidden = !moduleMode || multiModuleMode || !nativeCodeEntry;
  }
  if (nativeLibButton) {
    nativeLibButton.hidden = !nativeLibEntry;
  }
  toggleButtonsButton.hidden = !moduleMode || (multiModuleMode && !multiCanButtons);
  toggleOscilloscopeButton.hidden = !(
    moduleMode && (
      multiModuleMode
        ? multiCanDisplay
        : targetSupportsDisplayHeight
    )
  );
  toggleInterfaceControlsButton.hidden = !(
    moduleMode && (
      multiModuleMode
        ? multiCanInterface
        : nodeGraphModuleTypeHasInterfaceControls(targetNode?.type)
    )
  );
  toggleSlidersButton.hidden = !(
    moduleMode && (
      multiModuleMode
        ? multiCanSliders
        : nodeGraphModuleTypeHasHideableSliders(targetNode?.type)
    )
  );
  toggleIoButton.hidden = !moduleMode || (multiModuleMode && !multiCanButtons);
  toggleTitleButton.hidden = !moduleMode || (multiModuleMode && !multiCanButtons);
  imageControls.hidden = !(moduleMode && !multiModuleMode && targetNode?.type === "image");
  // Image layers / span / offset / readout live in Display Settings, not Module Settings.
  if (knobFaceControls) {
    knobFaceControls.hidden = true;
  }
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
    // Module title under the nav (no redundant "Module" label).
    const selectedLabel = selectedModule.querySelector("span");
    if (selectedLabel) {
      selectedLabel.textContent = "";
      selectedLabel.hidden = true;
    }
    // Selected module title under Command Center (alias when set, else type name).
    selectedModule.querySelector("strong").textContent = multiModuleMode
      ? `${selectedNodeIds.size} modules`
      : targetNode
        ? (typeof nodeGraphPatchNodeTitle === "function"
          ? nodeGraphPatchNodeTitle(targetNode)
          : (typeof nodeGraphModuleChromeTitle === "function"
            ? nodeGraphModuleChromeTitle(targetNode)
            : (nodeGraphNodeLabels?.[targetNode.type] || targetNode.type)))
        : "none";
    aliasControl.hidden = multiModuleMode;
    aliasInput.disabled = !targetNode || multiModuleMode;
    if (document.activeElement !== aliasInput) {
      aliasInput.value = targetNode && !multiModuleMode
        ? normalizeNodeGraphPatchNodeAlias(targetNode.alias) || nodeGraphDefaultNodeTitle(targetNode.type, targetNode.id)
        : "";
    }
    aliasInput.placeholder = targetNode && !multiModuleMode
      ? nodeGraphDefaultNodeTitle(targetNode.type, targetNode.id)
      : "display alias";
    aliasInput.title = nodeGraphTooltipText("actions.moduleAlias");
    if (copyButton) {
      setNodeGraphSceneContextButtonLines(copyButton, "Copy", "Module");
      copyButton.hidden = multiModuleMode;
      copyButton.disabled = !canCopy || multiModuleMode;
      copyButton.title = canCopy
        ? nodeGraphTooltipText("actions.copyModule")
        : targetNode
          ? nodeGraphTooltipText("actions.copyUnavailableOutput")
          : nodeGraphTooltipText("actions.copyUnavailableOneModule");
    }
    const settingsClipboard = nodeGraphMvp.moduleSettingsClipboard;
    if (copySettingsButton) {
      setNodeGraphSceneContextButtonLines(copySettingsButton, "Copy", "Settings");
      copySettingsButton.disabled = !targetNode;
      copySettingsButton.title = targetNode
        ? "Copy this module's settings to paste onto another module of the same type."
        : "Select a module to copy its settings.";
    }
    if (pasteSettingsButton) {
      setNodeGraphSceneContextButtonLines(pasteSettingsButton, "Paste", "Settings");
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
      setNodeGraphSceneContextButtonLines(setDefaultButton, "Save to", "Default");
      setDefaultButton.disabled = !targetNode;
      setDefaultButton.title = targetNode
        ? `Save these settings as the default for new ${targetNode.type} modules.`
        : "Select a module to save its default settings.";
    }
    deleteButton.disabled = !canDelete;
    deleteButton.title = canDelete
      ? (multiModuleMode
        ? `Delete ${selectedNodeIds.size} selected modules.`
        : nodeGraphTooltipText("actions.deleteModule"))
      : targetNode
        ? nodeGraphTooltipText("actions.deleteUnavailableOutput")
        : nodeGraphTooltipText("actions.deleteUnavailableOneModule");
    const multiWidthValues = multiModuleMode
      ? selectedNodes
        .filter((node) => nodeGraphModuleSizingCapabilities(node.type).width)
        .map((node) => nodeGraphPatchNodeGridWidthUnits(node))
      : [];
    const multiWidthUniform = multiWidthValues.length > 0
      && multiWidthValues.every((value) => value === multiWidthValues[0]);
    const multiWidthCanDecrease = multiModuleMode && selectedNodes.some((node) => {
      if (!nodeGraphModuleSizingCapabilities(node.type).width) {
        return false;
      }
      const current = nodeGraphPatchNodeGridWidthUnits(node);
      const limits = nodeGraphModuleWidthLimitsForType(node.type);
      return current > limits.minGu;
    });
    const multiWidthCanIncrease = multiModuleMode && selectedNodes.some((node) => {
      if (!nodeGraphModuleSizingCapabilities(node.type).width) {
        return false;
      }
      const current = nodeGraphPatchNodeGridWidthUnits(node);
      const limits = nodeGraphModuleWidthLimitsForType(node.type);
      return current < limits.maxGu;
    });
    configureNodeGraphModuleSettingsSizeRow({
      controls: widthControls,
      decreaseButton: widthDecrease,
      increaseButton: widthIncrease,
      valueElement: widthValue,
      hidden: !moduleMode || (multiModuleMode && !multiCanWidth),
      value: multiModuleMode
        ? (multiWidthUniform ? `${multiWidthValues[0]} gu` : "mixed")
        : `${widthGu} gu`,
      decreaseDisabled: multiModuleMode
        ? !multiWidthCanDecrease
        : !targetNode || !targetSupportsWidth || widthGu <= widthLimits.minGu,
      increaseDisabled: multiModuleMode
        ? !multiWidthCanIncrease
        : !targetNode || !targetSupportsWidth || widthGu >= widthLimits.maxGu,
      decreaseTitle: multiModuleMode
        ? "Decrease width of selected modules."
        : nodeGraphTooltipText("actions.widthDecrease"),
      increaseTitle: multiModuleMode
        ? "Increase width of selected modules."
        : nodeGraphTooltipText("actions.widthIncrease"),
    });
    // Height = OUTER module gu. Face modules shrink until face is 1gu (min outer).
    const multiDisplayHeights = multiModuleMode
      ? selectedNodes
        .filter((node) => nodeGraphPatchNodeHasResizableDisplayArea(node))
        .map((node) => nodeGraphPatchNodeGridHeightUnits(node))
      : [];
    const multiDisplayHeightUniform = multiDisplayHeights.length > 0
      && multiDisplayHeights.every((value) => value === multiDisplayHeights[0]);
    const multiDisplayCanDecrease = multiModuleMode && selectedNodes.some((node) => {
      if (!nodeGraphPatchNodeHasResizableDisplayArea(node)) {
        return false;
      }
      const face = nodeGraphModuleConfiguredDisplayHeightUnits(node.type, node.ui);
      const minFace = nodeGraphModuleDisplayHeightLimits.minGu;
      return face > minFace;
    });
    const multiDisplayCanIncrease = multiModuleMode && selectedNodes.some((node) => {
      if (!nodeGraphPatchNodeHasResizableDisplayArea(node)) {
        return false;
      }
      const face = nodeGraphModuleConfiguredDisplayHeightUnits(node.type, node.ui);
      return face < nodeGraphModuleDisplayHeightLimits.maxGu;
    });
    const faceMin = nodeGraphModuleDisplayHeightLimits.minGu;
    const faceMax = nodeGraphModuleDisplayHeightLimits.maxGu;
    configureNodeGraphModuleSettingsSizeRow({
      controls: displayHeightControls,
      decreaseButton: displayHeightDecrease,
      increaseButton: displayHeightIncrease,
      valueElement: displayHeightValue,
      hidden: !(moduleMode && (
        multiModuleMode ? multiCanDisplayHeight : targetSupportsDisplayHeight
      )),
      value: multiModuleMode
        ? (multiDisplayHeightUniform ? `${multiDisplayHeights[0]} gu` : "mixed")
        : `${outerHeightGu} gu`,
      decreaseDisabled: multiModuleMode
        ? !multiDisplayCanDecrease
        : !targetNode || !targetSupportsDisplayHeight || faceHeightGu <= faceMin,
      increaseDisabled: multiModuleMode
        ? !multiDisplayCanIncrease
        : !targetNode || !targetSupportsDisplayHeight || faceHeightGu >= faceMax,
      decreaseTitle: multiModuleMode
        ? "Decrease module height (shrinks face; min when face is 1gu)."
        : "Decrease module height (grid cells). Face floor is 1gu.",
      increaseTitle: multiModuleMode
        ? "Increase module height (grows face; max face 60gu)."
        : "Increase module height (grid cells). Face max is 60gu.",
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
    const moduleHeightGu = targetSupportsModuleHeight ? nodeGraphPatchNodeGridHeightUnits(targetNode) : 0;
    const moduleHeightLimits = targetSupportsTextBoxHeight
      ? nodeGraphTextBoxHeightLimits
      : nodeGraphModuleHeightLimitsForType(targetNode?.type);
    const multiModuleHeights = multiModuleMode
      ? selectedNodes
        .filter((node) => ["custom", "textBox"].includes(nodeGraphModuleSizingCapabilities(node.type).moduleHeight))
        .map((node) => nodeGraphPatchNodeGridHeightUnits(node))
      : [];
    const multiModuleHeightUniform = multiModuleHeights.length > 0
      && multiModuleHeights.every((value) => value === multiModuleHeights[0]);
    const multiModuleHeightCanDecrease = multiModuleMode && selectedNodes.some((node) => {
      const capability = nodeGraphModuleSizingCapabilities(node.type).moduleHeight;
      if (!["custom", "textBox"].includes(capability)) {
        return false;
      }
      const current = nodeGraphPatchNodeGridHeightUnits(node);
      const limits = capability === "textBox"
        ? nodeGraphTextBoxHeightLimits
        : nodeGraphModuleHeightLimitsForType(node.type);
      return current > limits.minGu;
    });
    const multiModuleHeightCanIncrease = multiModuleMode && selectedNodes.some((node) => {
      const capability = nodeGraphModuleSizingCapabilities(node.type).moduleHeight;
      if (!["custom", "textBox"].includes(capability)) {
        return false;
      }
      const current = nodeGraphPatchNodeGridHeightUnits(node);
      const limits = capability === "textBox"
        ? nodeGraphTextBoxHeightLimits
        : nodeGraphModuleHeightLimitsForType(node.type);
      return current < limits.maxGu;
    });
    configureNodeGraphModuleSettingsSizeRow({
      controls: textBoxHeightControls,
      decreaseButton: textBoxHeightDecrease,
      increaseButton: textBoxHeightIncrease,
      valueElement: textBoxHeightValue,
      hidden: !(moduleMode && (
        multiModuleMode ? multiCanModuleHeight : targetSupportsModuleHeight
      )),
      value: multiModuleMode
        ? (multiModuleHeightUniform ? `${multiModuleHeights[0]} gu` : "mixed")
        : `${moduleHeightGu} gu`,
      decreaseDisabled: multiModuleMode
        ? !multiModuleHeightCanDecrease
        : !targetNode || !targetSupportsModuleHeight || moduleHeightGu <= moduleHeightLimits.minGu,
      increaseDisabled: multiModuleMode
        ? !multiModuleHeightCanIncrease
        : !targetNode || !targetSupportsModuleHeight || moduleHeightGu >= moduleHeightLimits.maxGu,
      decreaseTitle: multiModuleMode
        ? "Decrease height of selected modules."
        : "Decrease this module's height.",
      increaseTitle: multiModuleMode
        ? "Increase height of selected modules."
        : "Increase this module's height.",
    });
    const multiAnyEnabled = multiModuleMode && selectedNodes.some((node) => {
      if (node.id === "output") {
        return Boolean(nodeGraphMvp.live.outputEnabled);
      }
      return !nodeGraphNodeDisplaysBypassed(node.id);
    });
    const multiAllDisabled = multiModuleMode && selectedNodes.length > 0 && !multiAnyEnabled;
    toggleModuleEnabledButton.disabled = multiModuleMode ? !selectedNodes.length : !targetNode;
    toggleModuleEnabledButton.querySelector("span").textContent = multiModuleMode
      ? (multiAllDisabled ? "Enable modules" : "Disable modules")
      : (targetNodeDisabled ? "Enable module" : "Disable module");
    toggleModuleEnabledButton.setAttribute(
      "aria-pressed",
      multiModuleMode
        ? (multiAllDisabled ? "true" : "false")
        : (targetNodeDisabled ? "true" : "false"),
    );
    toggleModuleEnabledButton.title = multiModuleMode
      ? (multiAllDisabled
        ? `Enable ${selectedNodeIds.size} selected modules.`
        : `Disable ${selectedNodeIds.size} selected modules.`)
      : (targetNodeDisabled
        ? "Enable this module."
        : "Disable this module.");
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
    // Visibility marks: ⬜ = visible/on, ⬛ = hidden/off (no Show/Hide words).
    // Multi-select: button reflects “all hidden” vs “any visible”; click hides all if any
    // visible, otherwise shows all (eligible modules only).
    const visOn = typeof nodeGraphVisibilityMarkOn === "string" ? nodeGraphVisibilityMarkOn : "⬜";
    const visOff = typeof nodeGraphVisibilityMarkOff === "string" ? nodeGraphVisibilityMarkOff : "⬛";
    const setVisLines = (button, hidden, name) => {
      if (!button) {
        return;
      }
      setNodeGraphSceneContextButtonLines(button, hidden ? visOff : visOn, name);
      button.setAttribute("aria-pressed", hidden ? "true" : "false");
      button.setAttribute("aria-label", `${name}, ${hidden ? "hidden" : "visible"}`);
    };
    const multiSectionAllHidden = (eligible, isHidden) => {
      const nodes = selectedNodes.filter(eligible);
      return nodes.length > 0 && nodes.every(isHidden);
    };
    const multiButtonsHidden = multiModuleMode
      ? multiSectionAllHidden(
        () => true,
        (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).buttonsHidden,
      )
      : buttonsHidden;
    const multiOscilloscopeHidden = multiModuleMode
      ? multiSectionAllHidden(
        (node) => nodeGraphPatchNodeHasHideableOscilloscope(node),
        (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).oscilloscopeHidden,
      )
      : oscilloscopeHidden;
    const multiInterfaceHidden = multiModuleMode
      ? multiSectionAllHidden(
        (node) => nodeGraphModuleTypeHasInterfaceControls(node.type),
        (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).interfaceControlsHidden,
      )
      : interfaceControlsHidden;
    const multiSlidersHidden = multiModuleMode
      ? multiSectionAllHidden(
        (node) => nodeGraphModuleTypeHasHideableSliders(node.type),
        (node) => nodeGraphEffectivePatchNodeUi(node.ui, node.type).slidersHidden,
      )
      : slidersHidden;
    const multiIoHidden = multiModuleMode
      ? multiSectionAllHidden(
        () => true,
        (node) => Boolean(normalizeNodeGraphPatchNodeUi(node.ui, node.type).ioHidden),
      )
      : ioHidden;
    const multiTitleHidden = multiModuleMode
      ? multiSectionAllHidden(
        () => true,
        (node) => Boolean(normalizeNodeGraphPatchNodeUi(node.ui, node.type).titleHidden),
      )
      : titleHidden;
    toggleButtonsButton.disabled = multiModuleMode ? !selectedNodes.length : !targetNode;
    setVisLines(toggleButtonsButton, multiButtonsHidden, "Buttons");
    toggleButtonsButton.title = multiModuleMode
      ? (multiButtonsHidden ? "Show buttons on selected modules." : "Hide buttons on selected modules.")
      : nodeGraphTooltipText(buttonsHidden ? "actions.showModuleButtons" : "actions.hideModuleButtons");
    toggleOscilloscopeButton.disabled = multiModuleMode
      ? !multiCanDisplay
      : !targetNode || !targetSupportsDisplayHeight;
    setVisLines(toggleOscilloscopeButton, multiOscilloscopeHidden, visualFaceLabel || "Display");
    toggleOscilloscopeButton.title = multiModuleMode
      ? (multiOscilloscopeHidden
        ? "Show displays on selected modules."
        : "Hide displays on selected modules.")
      : (oscilloscopeHidden
        ? `Show this module's built-in ${visualFaceLabel}.`
        : `Hide this module's built-in ${visualFaceLabel}.`);
    toggleInterfaceControlsButton.disabled = multiModuleMode
      ? !multiCanInterface
      : !targetNode || !nodeGraphModuleTypeHasInterfaceControls(targetNode.type);
    setVisLines(toggleInterfaceControlsButton, multiInterfaceHidden, "Control surface");
    toggleInterfaceControlsButton.title = multiModuleMode
      ? (multiInterfaceHidden
        ? "Show control surfaces on selected modules."
        : "Hide control surfaces on selected modules.")
      : (interfaceControlsHidden
        ? "Show this module's control surface."
        : "Hide this module's control surface.");
    toggleSlidersButton.disabled = multiModuleMode
      ? !multiCanSliders
      : !targetNode || !nodeGraphModuleTypeHasHideableSliders(targetNode.type);
    setVisLines(toggleSlidersButton, multiSlidersHidden, "Sliders");
    toggleSlidersButton.title = multiModuleMode
      ? (multiSlidersHidden
        ? "Show sliders on selected modules."
        : "Hide sliders on selected modules.")
      : (slidersHidden
        ? "Show this module's parameter sliders."
        : "Hide this module's parameter sliders.");
    toggleIoButton.disabled = multiModuleMode ? !selectedNodes.length : !targetNode;
    setVisLines(toggleIoButton, multiIoHidden, "In/Out");
    toggleIoButton.title = multiModuleMode
      ? (multiIoHidden
        ? "Show In/Out on selected modules."
        : "Hide In/Out on selected modules.")
      : (ioHidden
        ? "Show this module's input and output ports."
        : "Hide this module's input and output ports.");
    toggleTitleButton.disabled = multiModuleMode ? !selectedNodes.length : !targetNode;
    setVisLines(toggleTitleButton, multiTitleHidden, "Title");
    toggleTitleButton.title = multiModuleMode
      ? (multiTitleHidden
        ? "Show titles on selected modules."
        : "Hide titles on selected modules.")
      : nodeGraphTooltipText(titleHidden ? "actions.showModuleTitle" : "actions.hideModuleTitle");
    if (targetNode?.type === "image") {
      const imageLayout = normalizeNodeGraphImageLayout(targetNode.layout);
      imageSave.disabled = !imageLayout.dataUrl;
      imageRefresh.disabled = false;
      imageSave.title = imageLayout.dataUrl ? "Save this image node's current image." : "Load an image before saving.";
      imageRefresh.title = "Refresh image preview and trace texture.";
    }
    if (targetNode?.type === "knob" && typeof syncNodeGraphKnobFaceControls === "function") {
      syncNodeGraphKnobFaceControls(targetNode);
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
    textBoxSingleLine?.setAttribute("aria-pressed", textBoxMode === "singleLine" ? "true" : "false");
    textBoxMultiline?.setAttribute("aria-pressed", textBoxMode === "multiline" ? "true" : "false");
    textBoxFill?.setAttribute("aria-pressed", textBoxMode === "fill" ? "true" : "false");
    if (textBoxSingleLine) textBoxSingleLine.title = nodeGraphTooltipText("actions.textBoxSingleLine") || "Single line";
    if (textBoxMultiline) textBoxMultiline.title = nodeGraphTooltipText("actions.textBoxMultiline") || "Multiline (fixed size; shrink if too wide)";
    if (textBoxFill) {
      textBoxFill.title = nodeGraphTooltipText("actions.textBoxFill")
        || "Fill — multiline text grows or shrinks to use the available face";
    }
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
      if (graphCursorX) {
        graphCursorX.disabled = false;
        graphCursorX.title = "Move the vertical graph cursor.";
      }
    } else {
      if (graphCursorX) {
        graphCursorX.value = "";
        graphCursorX.disabled = true;
      }
      graphNodeList?.replaceChildren();
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
    const wireLabel = selectedModule.querySelector("span");
    if (wireLabel) {
      wireLabel.hidden = false;
      wireLabel.textContent = selectedWire?.kind === "modulation"
        ? "selected modulation"
        : "selected wire";
    }
    selectedModule.querySelector("strong").textContent = nodeGraphWireSelectionLabel(nodeGraphMvp.selected);
    const selectedWireType = normalizeNodeGraphWireType(selectedWire?.wire?.wireType);
    for (const button of wireTypeButtons) {
      button.disabled = !selectedWire;
      button.setAttribute("aria-pressed", button.dataset.wireType === selectedWireType ? "true" : "false");
      button.title = nodeGraphTooltipText(`actions.wireType.${button.dataset.wireType}`);
    }
    if (wirePixelToggle) {
      const pixelOn = typeof normalizeNodeGraphWirePixel === "function"
        ? normalizeNodeGraphWirePixel(selectedWire?.wire?.pixelWire)
        : Boolean(selectedWire?.wire?.pixelWire);
      wirePixelToggle.disabled = !selectedWire;
      wirePixelToggle.setAttribute("aria-pressed", pixelOn ? "true" : "false");
      wirePixelToggle.title = nodeGraphTooltipText("actions.wirePixel")
        || "Pixel wire (manual). Raster beam renderer later; flag is saved on the wire.";
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
    if (graphCursorX) {
      graphCursorX.value = "";
      graphCursorX.disabled = true;
    }
    graphNodeList?.replaceChildren();
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
    if (wirePixelToggle) {
      wirePixelToggle.disabled = true;
      wirePixelToggle.setAttribute("aria-pressed", "false");
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
    if (graphCursorX) {
      graphCursorX.value = "";
      graphCursorX.disabled = true;
    }
    graphNodeList?.replaceChildren();
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

/**
 * Shared: open Module Settings for a .dsp-node from any right-click/dblclick
 * on that module (header, body, ports, parameter inputs, …).
 * Never opens the Module Browser.
 * @returns {boolean} true if handled
 */
function openNodeGraphModuleSettingsFromContextEvent(event, nodeElement = null) {
  ensureNodeGraphModuleActionsWindowBody();
  const node = nodeElement
    || event?.currentTarget?.closest?.(".dsp-node")
    || event?.target?.closest?.(".dsp-node");
  const nodeId = String(node?.dataset?.node || "").trim();
  if (!node || !nodeId || !nodeGraphPatchNode(nodeId)) {
    return false;
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  // Make this module the sole selection so Module Settings has a clear target
  // even if a multi-selection was active under the pointer.
  if (typeof setNodeGraphSelection === "function") {
    setNodeGraphSelection({ type: "node", id: nodeId });
  }
  nodeGraphMvp.sceneContextPoint = null;
  if (typeof closeNodeScopeContextMenu === "function") {
    closeNodeScopeContextMenu();
  }
  nodeGraphMvp.sceneContextTargetNode = nodeId;
  nodeGraphMvp.lastModuleActionTargetNode = nodeId;
  nodeGraphMvp.sceneContextTargetWire = null;
  configureNodeSceneContextMenu("module");
  nodeGraphMvp.sharedInspectorActive = "moduleActions";
  const menu = document.getElementById("nodeModuleActionsWindow");
  if (!menu) {
    return false;
  }
  const clientX = Number(event?.clientX);
  const clientY = Number(event?.clientY);
  const x = Number.isFinite(clientX)
    ? clientX
    : (node.getBoundingClientRect?.().right ?? window.innerWidth * 0.5);
  const y = Number.isFinite(clientY)
    ? clientY
    : (node.getBoundingClientRect?.().top ?? window.innerHeight * 0.25);
  // Always re-position and force-unhide (do not early-return if already open —
  // that left solid modules like XY Pad looking like right-click did nothing).
  if (typeof positionNodeModuleActionsWindowAtSavedOr === "function") {
    positionNodeModuleActionsWindowAtSavedOr(menu, x, y);
  } else if (typeof positionNodeSceneContextMenu === "function") {
    positionNodeSceneContextMenu(menu, x, y, true);
  }
  menu.hidden = false;
  if (typeof syncNodeModuleActionsWindowHeightLimit === "function") {
    syncNodeModuleActionsWindowHeightLimit();
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleActions",
      menu,
      { open: true },
      { status: false },
    );
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("moduleActions", menu);
  }
  return true;
}

function openNodeModuleActionMenu(event) {
  // Module shell binds contextmenu on the whole .dsp-node, which runs before
  // the document-level scene menu. Specialized display faces must claim the
  // event here (and stopPropagation) or Module Settings always wins.
  if (typeof openNodePhosphorWaveformContextMenu === "function" && openNodePhosphorWaveformContextMenu(event)) {
    return;
  }
  if (typeof openNodeXyPadContextMenu === "function" && openNodeXyPadContextMenu(event)) {
    return;
  }
  if (typeof openNodeKnobFaceContextMenu === "function" && openNodeKnobFaceContextMenu(event)) {
    return;
  }
  if (typeof openNodeScopeContextMenu === "function" && openNodeScopeContextMenu(event)) {
    return;
  }
  // Parameter rows / readouts → Parameter Settings in the unified window.
  if (typeof openNodeGraphParameterSettingsFromContextEvent === "function"
    && openNodeGraphParameterSettingsFromContextEvent(event)) {
    return;
  }
  openNodeGraphModuleSettingsFromContextEvent(event);
}

/**
 * XY Pad solid face: right-click opens Module Settings (no header display gear).
 * Matches LED / number-readout face behaviour: the phosphor plate is the settings hit target.
 */
function openNodeXyPadContextMenu(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  // Only claim when the hit is on the pad face (not parameter rows under the shell).
  const face = target.closest?.(".node-xy-pad, .node-xy-pad-canvas");
  if (!face) {
    // Solid custom-ui wrapper (padding around the canvas) still counts.
    const solidFace = target.closest?.(".node-solid-module-custom-ui");
    const solidNode = solidFace?.closest?.(".dsp-node");
    if (!solidFace || solidNode?.dataset?.nodeType !== "xyPad") {
      return false;
    }
  }
  const nodeEl = (face || target).closest?.(".dsp-node");
  const nodeId = String(nodeEl?.dataset?.node || face?.dataset?.node || "").trim();
  const patchNode = nodeId ? nodeGraphPatchNode(nodeId) : null;
  if (!patchNode || patchNode.type !== "xyPad") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  // Prefer phosphor Display Settings (color / background / reset canvas).
  if (typeof openNodeGraphTraceDisplaySettings === "function") {
    // Keep multi-select when the face is already part of the selection so
    // same-display multi-adjust can apply. Collapse only when not selected.
    const alreadySelected = typeof nodeGraphSelectedNodeIds === "function"
      && nodeGraphSelectedNodeIds().has(nodeId);
    if (!alreadySelected && typeof setNodeGraphSelection === "function") {
      setNodeGraphSelection({ type: "node", id: nodeId });
    }
    nodeGraphMvp.sceneContextTargetNode = nodeId;
    nodeGraphMvp.lastModuleActionTargetNode = nodeId;
    if (openNodeGraphTraceDisplaySettings(nodeId, event)) {
      return true;
    }
  }
  return openNodeGraphModuleSettingsFromContextEvent(event, nodeEl);
}

function openNodeScopeContextMenu(event) {
  const contextScope = event.target.closest?.(
    ".node-module-scope-window, .node-led-face, .node-number-readout-face, .node-ray-bouncer-face, .node-asciiscope-face, .node-matrix-face",
  );
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
  // LED and other faces share the display settings popover (ledLamp schema).
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

// Floating app chrome (not module body). Bare input/textarea are NOT listed
// here — those appear on modules, and right-click on a module must open
// Module Settings, never the Module Browser.
const nodeGraphWorkspaceFloatingUiSelector =
  "#nodeSceneContextMenu, #nodeParameterMetadataPopover, #nodeGlobalScopeMenu, " +
  "#nodeModuleActionsWindow, #nodeCodeBoxWindow, #nodeCanvasScriptDialog, #nodeSavedPatchesWindow, " +
  "#nodePhosphorWaveformSettingsWindow, #nodeModuleShopView, " +
  "#nodeTraceDisplaySettingsPopover";
// Legacy alias: includes form fields for empty-canvas / marquee checks only.
const nodeGraphWorkspaceInteractiveDialogSelector =
  "input, textarea, select, option, [contenteditable='true'], " +
  nodeGraphWorkspaceFloatingUiSelector;
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
  // Floating UI outside modules: leave alone (native / their own handlers).
  // Module-owned inputs/selects must NOT bail here — they open Module Settings.
  const onModule = event.target.closest?.(".dsp-node");
  if (!onModule && event.target.closest?.(nodeGraphWorkspaceFloatingUiSelector)) {
    return;
  }
  if (!onModule && event.target.closest?.("input, textarea, select, option, [contenteditable='true']")) {
    // Editable chrome outside modules (rare) — don't hijack.
    return;
  }

  // Specialized faces first (display settings, LED, phosphor waveform, XY pad, …).
  if (openNodeScopeContextMenu(event)) {
    return;
  }
  if (openNodePhosphorWaveformContextMenu(event)) {
    return;
  }
  if (typeof openNodeXyPadContextMenu === "function" && openNodeXyPadContextMenu(event)) {
    return;
  }
  // Parameter rows / readouts → Parameter Settings (unified window page).
  if (typeof openNodeGraphParameterSettingsFromContextEvent === "function"
    && openNodeGraphParameterSettingsFromContextEvent(event, onModule)) {
    return;
  }
  rememberNodeGraphContextMenuClientPoint(event);

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
      const wireMenu = document.getElementById("nodeModuleActionsWindow");
      if (wireMenu) {
        wireMenu.hidden = false;
      }
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "moduleActions",
          wireMenu,
          { open: true },
          { status: false },
        );
      }
      if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
        noteNodeGraphUnifiedWindowOpened("moduleActions", wireMenu);
      }
    }
    return;
  }

  // Anywhere on a module (ports, inputs, body, header) → Module Settings.
  // Never Module Browser. Shared with title dblclick / gear action button.
  if (openNodeGraphModuleSettingsFromContextEvent(event, onModule)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  nodeGraphMvp.sceneContextPoint = nodeGraphClientPoint(event);
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  clearNodeGraphSelection();
  // Right-click empty canvas opens (or refocuses) the Module Browser at the
  // pointer so new modules spawn where you clicked. Contextual right-clicks
  // (module / parameter / display) switch the unified window to that page.
  if (typeof openNodeGraphUnifiedWindowPage === "function") {
    openNodeGraphUnifiedWindowPage("moduleBrowser", {
      point: nodeGraphMvp.sceneContextPoint,
      windowPoint: { x: event.clientX, y: event.clientY },
    });
    return;
  }
  openNodeGraphModuleShop(nodeGraphMvp.sceneContextPoint, { x: event.clientX, y: event.clientY });
}

// Command Center open path (toolbar rocket / "C" hotkey / unified switcher).
// When the unified switcher is driving (_unifiedWindowSwitching), we only
// prepare content and unhide — seat is applied once by openNodeGraphUnifiedWindowPage.
// Independent opens restore the saved seat or spawn at the given anchor.
function openNodeGraphCommandCenter(x, y) {
  const commandCenter = document.getElementById("nodeSceneContextMenu");
  if (!commandCenter) {
    return;
  }
  const anchorX = Number.isFinite(Number(x)) ? Number(x) : window.innerWidth / 2;
  const anchorY = Number.isFinite(Number(y)) ? Number(y) : window.innerHeight / 2;
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  configureNodeSceneContextMenu("home");

  const pending = nodeGraphMvp._unifiedWindowPendingPosition;
  const hasPending = pending
    && Number.isFinite(Number(pending.left))
    && Number.isFinite(Number(pending.top));
  const unifiedDriving = Boolean(nodeGraphMvp._unifiedWindowSwitching);

  if (unifiedDriving && hasPending) {
    // Shared seat will be applied once by openNodeGraphUnifiedWindowPage.
    commandCenter.hidden = false;
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(commandCenter);
    }
  } else if (hasPending) {
    // Direct pending handoff without clamp (viewport coords as-is).
    commandCenter.hidden = false;
    if (typeof applyNodeSceneContextWindowSize === "function") {
      applyNodeSceneContextWindowSize(
        nodeGraphMvp.unifiedWindowSize || nodeGraphMvp.sceneContextWindowSize,
      );
    }
    if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
      setNodeGraphFloatingWindowViewportPosition(commandCenter, pending.left, pending.top);
    } else {
      commandCenter.style.left = `${Math.round(pending.left)}px`;
      commandCenter.style.top = `${Math.round(pending.top)}px`;
    }
    if (!unifiedDriving) {
      pulseNodeGraphFloatingWindowAttention(commandCenter);
    }
  } else {
    // Cold open: restore saved seat or spawn at the anchor.
    positionNodeSceneContextMenuAtCurrentSavedOrInitial(commandCenter, anchorX, anchorY);
    if (!unifiedDriving) {
      pulseNodeGraphFloatingWindowAttention(commandCenter);
    }
  }

  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "commandCenter",
      null,
      { open: true },
      { capturePosition: false, status: false },
    );
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("commandCenter", commandCenter);
  }
  if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
    syncNodeGraphUnifiedWindowNavBars();
  }
  if (typeof renderNodeGraphCommandCenterModuleSearch === "function") {
    renderNodeGraphCommandCenterModuleSearch();
  }
}
