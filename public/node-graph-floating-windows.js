function normalizeNodeGraphFloatingWindowSize(size = {}, defaults = {}) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 720;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 760;
  // Small default margin so most floating windows don't sit flush against
  // the physical screen edge (hard to grab an edge-aligned resize handle,
  // etc.) -- but some windows (the standalone keyboard dock) explicitly
  // want to be draggable all the way to the true viewport edge, so this
  // is a per-window override via defaults.viewportMargin, not hardcoded.
  const viewportMargin = Number.isFinite(Number(defaults.viewportMargin)) ? Number(defaults.viewportMargin) : 28;
  const minWidth = Math.max(1, Number(defaults.minWidth) || 160);
  const configuredMaxWidth = Number(defaults.maxWidth);
  const maxWidth = Math.max(
    minWidth,
    Math.min(
      Number.isFinite(configuredMaxWidth) ? configuredMaxWidth : 720,
      viewportWidth - viewportMargin,
    ),
  );
  const minHeight = Math.max(1, Number(defaults.minHeight) || 120);
  const configuredMaxHeight = Number(defaults.maxHeight);
  const maxHeight = Math.max(
    minHeight,
    Math.min(
      Number.isFinite(configuredMaxHeight) ? configuredMaxHeight : 760,
      viewportHeight - viewportMargin,
    ),
  );
  const source = size && typeof size === "object" ? size : {};
  const width = Math.max(
    minWidth,
    Math.min(maxWidth, Number(source.width) || Number(defaults.width) || minWidth),
  );
  const height = Number.isFinite(Number(source.height))
    ? Math.max(minHeight, Math.min(maxHeight, Number(source.height)))
    : null;
  return {
    width: Math.round(width),
    ...(height ? { height: Math.round(height) } : {}),
  };
}

function applyNodeGraphFloatingWindowSizeVars(element, cssPrefix, defaults = {}, normalized = {}) {
  if (!element || !cssPrefix) {
    return;
  }
  const pairs = [
    ["min-width", defaults.minWidth],
    ["max-width", defaults.maxWidth],
    ["min-height", defaults.minHeight],
    ["max-height", defaults.maxHeight],
    ["width", normalized.width],
    ["height", normalized.height],
  ];
  for (const [name, value] of pairs) {
    const propertyName = `--${cssPrefix}-${name}`;
    if (Number.isFinite(Number(value))) {
      element.style.setProperty(propertyName, `${Math.round(Number(value))}px`);
    } else if (name === "height") {
      element.style.removeProperty(propertyName);
    }
  }
}

const nodeGraphFloatingWindowSurfaceClass = "node-floating-window-surface";

// Floating windows start with various CSS z-index values. Interaction raises
// them onto a shared monotonic stack so the latest-used popup paints on top.
const nodeGraphFloatingWindowStackBase = 10000;
let nodeGraphFloatingWindowStackTop = nodeGraphFloatingWindowStackBase;

function markNodeGraphFloatingWindowSurface(element) {
  if (!element) {
    return null;
  }
  element.classList.add(nodeGraphFloatingWindowSurfaceClass);
  return element;
}

/**
 * Bring a floating popup to the front of all other popups.
 * Newest interacted (or newly opened) window wins.
 */
function raiseNodeGraphFloatingWindow(element) {
  if (!element || element.hidden) {
    return false;
  }
  markNodeGraphFloatingWindowSurface(element);
  const current = Number.parseInt(String(element.style.zIndex || ""), 10);
  if (Number.isFinite(current) && current >= nodeGraphFloatingWindowStackTop) {
    return true;
  }
  nodeGraphFloatingWindowStackTop += 1;
  element.style.zIndex = String(nodeGraphFloatingWindowStackTop);
  element.dataset.floatingWindowStack = String(nodeGraphFloatingWindowStackTop);
  return true;
}

/** Resolve the floating window surface under an event target (if any). */
function nodeGraphFloatingWindowSurfaceFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  const direct = target.closest(`.${nodeGraphFloatingWindowSurfaceClass}`);
  if (direct && !direct.hidden) {
    return direct;
  }
  // Registered workspace windows may not be marked yet (first open).
  if (typeof nodeGraphWorkspaceWindowElements !== "undefined") {
    for (const elementId of Object.values(nodeGraphWorkspaceWindowElements)) {
      const element = document.getElementById(elementId);
      if (element && !element.hidden && element.contains(target)) {
        return markNodeGraphFloatingWindowSurface(element);
      }
    }
  }
  return null;
}

function bindNodeGraphFloatingWindowStacking() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.documentElement.dataset.floatingWindowStackBound === "true") {
    return;
  }
  document.documentElement.dataset.floatingWindowStackBound = "true";
  const raiseFromEvent = (event) => {
    const surface = nodeGraphFloatingWindowSurfaceFromTarget(event.target);
    if (surface) {
      raiseNodeGraphFloatingWindow(surface);
    }
  };
  // Capture phase so we raise before drag handlers stop propagation.
  document.addEventListener("pointerdown", raiseFromEvent, true);
  document.addEventListener("focusin", raiseFromEvent, true);
}

function syncNodeGraphRegisteredFloatingWindowSurfaces() {
  if (typeof nodeGraphWorkspaceWindowElements === "undefined") {
    return 0;
  }
  let count = 0;
  for (const elementId of Object.values(nodeGraphWorkspaceWindowElements)) {
    if (markNodeGraphFloatingWindowSurface(document.getElementById(elementId))) {
      count += 1;
    }
  }
  bindNodeGraphFloatingWindowStacking();
  return count;
}

function nodeGraphFloatingWindowElementPosition(element) {
  if (!element) {
    return { left: 0, top: 0 };
  }
  const rect = element.getBoundingClientRect();
  const styleLeft = Number.parseFloat(element.style.left);
  const styleTop = Number.parseFloat(element.style.top);
  if (
    Number.isFinite(styleLeft) &&
    Number.isFinite(styleTop) &&
    typeof nodeGraphFloatingWindowViewportPositionFromCss === "function"
  ) {
    return nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop);
  }
  return { left: rect.left, top: rect.top };
}

const nodeGraphFloatingWindowUnlockedIcon = "\u2725";
const nodeGraphFloatingWindowLockedIcon = "\uD83D\uDD12";
const nodeGraphFloatingWindowLockHandleSelector = [
  ".scene-context-drag-handle",
  ".metadata-popover-drag-handle",
  ".node-saved-patches-drag-handle",
  ".node-module-shop-drag-handle",
  ".node-ui-dev-drag-handle",
  ".node-user-ui-settings-drag-handle",
  "#nodeCodeBoxDragHandle",
].join(",");

function nodeGraphFloatingWindowLocked(element) {
  return element?.dataset?.floatingWindowLocked === "true";
}

function nodeGraphFloatingWindowTargetForElement(element) {
  if (!element) {
    return null;
  }
  const keyboardTarget = nodeGraphFloatingWindowKeyboardTargets().find((target) => {
    const targetElement = document.getElementById(target.elementId);
    return targetElement === element;
  });
  if (keyboardTarget) {
    return keyboardTarget;
  }
  if (typeof nodeGraphWorkspaceWindowElements !== "undefined") {
    for (const [workspaceKey, elementId] of Object.entries(nodeGraphWorkspaceWindowElements)) {
      if (document.getElementById(elementId) === element) {
        return { workspaceKey, elementId };
      }
    }
  }
  return null;
}

function nodeGraphFloatingWindowTargetForHandle(handle) {
  if (!handle) {
    return null;
  }
  const keyboardTarget = nodeGraphFloatingWindowKeyboardTargets().find((target) => {
    const element = document.getElementById(target.elementId);
    return element && element.contains(handle);
  });
  if (keyboardTarget) {
    return keyboardTarget;
  }
  if (typeof nodeGraphWorkspaceWindowElements !== "undefined") {
    for (const [workspaceKey, elementId] of Object.entries(nodeGraphWorkspaceWindowElements)) {
      const element = document.getElementById(elementId);
      if (element?.contains(handle)) {
        return { workspaceKey, elementId };
      }
    }
  }
  return null;
}

function syncNodeGraphFloatingWindowLockHandles(element) {
  if (!element?.querySelectorAll) {
    return;
  }
  const locked = nodeGraphFloatingWindowLocked(element);
  for (const handle of element.querySelectorAll(nodeGraphFloatingWindowLockHandleSelector)) {
    if (!handle.dataset.floatingWindowUnlockedIcon) {
      handle.dataset.floatingWindowUnlockedIcon = handle.textContent?.trim() || nodeGraphFloatingWindowUnlockedIcon;
    }
    handle.textContent = locked
      ? nodeGraphFloatingWindowLockedIcon
      : handle.dataset.floatingWindowUnlockedIcon;
    handle.classList.toggle("floating-window-locked", locked);
    handle.setAttribute("aria-pressed", locked ? "true" : "false");
    handle.title = locked
      ? "Double-click to unlock this window"
      : "Double-click to lock this window";
  }
}

function setNodeGraphFloatingWindowLocked(element, locked, options = {}) {
  if (!element) {
    return false;
  }
  const nextLocked = Boolean(locked);
  element.dataset.floatingWindowLocked = nextLocked ? "true" : "false";
  element.classList.toggle("floating-window-locked", nextLocked);
  syncNodeGraphFloatingWindowLockHandles(element);
  if (options.persist !== false && typeof rememberNodeGraphWorkspaceWindowState === "function") {
    const target = nodeGraphFloatingWindowTargetForElement(element);
    if (target?.workspaceKey) {
      rememberNodeGraphWorkspaceWindowState(
        target.workspaceKey,
        element,
        { open: true, locked: nextLocked },
        { capturePosition: false, status: false },
      );
    }
  }
  return nextLocked;
}

function toggleNodeGraphFloatingWindowLock(event) {
  const target = nodeGraphFloatingWindowTargetForHandle(event.currentTarget);
  const element = target ? document.getElementById(target.elementId) : null;
  if (!element) {
    return false;
  }
  setNodeGraphFloatingWindowLocked(element, !nodeGraphFloatingWindowLocked(element));
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function bindNodeGraphFloatingWindowLockHandle(handle) {
  if (!handle || handle.dataset.floatingWindowLockBound === "true") {
    return;
  }
  handle.dataset.floatingWindowLockBound = "true";
  handle.addEventListener("dblclick", toggleNodeGraphFloatingWindowLock);
  const target = nodeGraphFloatingWindowTargetForHandle(handle);
  if (target) {
    syncNodeGraphFloatingWindowLockHandles(document.getElementById(target.elementId));
  }
}

function bindNodeGraphFloatingWindowLockHandles(root = document) {
  if (!root?.querySelectorAll) {
    return;
  }
  for (const handle of root.querySelectorAll(nodeGraphFloatingWindowLockHandleSelector)) {
    bindNodeGraphFloatingWindowLockHandle(handle);
  }
}

function applyNodeGraphFloatingWindowLockedState(element, locked) {
  setNodeGraphFloatingWindowLocked(element, locked, { persist: false });
}

// The "I'm over here" glow. Used whenever a window is asked to open but does
// not move to meet the pointer -- either because it was already open, or
// because it restored to its remembered position (see
// openNodeGraphFloatingWindowAtPosition). Without it, re-opening a window
// that is parked off in a corner looks like nothing happened at all.
function pulseNodeGraphFloatingWindowAttention(element) {
  if (!element) {
    return false;
  }
  raiseNodeGraphFloatingWindow(element);
  if (typeof triggerNodeGraphWindowReopenEvent === "function") {
    triggerNodeGraphWindowReopenEvent(element.id || element.dataset?.windowKey || "floating-window");
  }
  element.classList.remove("node-floating-window-attention");
  // Force a reflow so re-adding the class restarts the animation instead of
  // being coalesced into a no-op.
  void element.offsetWidth;
  element.classList.add("node-floating-window-attention");
  window.setTimeout(() => {
    element.classList.remove("node-floating-window-attention");
  }, 1050);
  return true;
}

// The one place that decides whether re-opening a window needs the glow.
//
// Re-triggering a window that is already open and already parked where it
// wants to be produces no visible change at all, so it reads as a dead click.
// Wrap the positioning work in this and it compares where the window was to
// where it ended up, pulsing only when it did NOT move. A window that was
// closed is skipped on purpose -- appearing is its own feedback.
//
// Deliberately measures the element rather than trusting the caller's notion
// of "restored vs spawned": every window computes its position differently
// (saved state, near a button, at the pointer, shared-inspector geometry),
// but they all end up moving the same element, so this works for all of them.
function positionNodeGraphFloatingWindowWithAttention(element, applyPosition) {
  if (!element || typeof applyPosition !== "function") {
    return false;
  }
  const wasOpen = !element.hidden;
  const before = wasOpen ? nodeGraphFloatingWindowElementPosition(element) : null;
  applyPosition(element);
  // Opening or repositioning always claims the front of the stack.
  raiseNodeGraphFloatingWindow(element);
  if (!before) {
    return false;
  }
  const after = nodeGraphFloatingWindowElementPosition(element);
  // 1px of slack: sub-pixel rounding between CSS and getBoundingClientRect
  // should not count as movement.
  const stayedPut = Math.abs(after.left - before.left) <= 1 && Math.abs(after.top - before.top) <= 1;
  if (stayedPut) {
    pulseNodeGraphFloatingWindowAttention(element);
  }
  return stayedPut;
}

function moveNodeGraphFloatingWindowElement(element, left, top) {
  if (!element) {
    return { left: 0, top: 0 };
  }
  const next = nodeGraphFloatingWindowPosition(element, left, top);
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(element, next.left, next.top);
  } else {
    element.style.left = `${next.left}px`;
    element.style.top = `${next.top}px`;
    element.style.right = "auto";
  }
  return next;
}

function beginNodeGraphFloatingWindowDrag(event, element, stateKey) {
  if (
    event.button > 0 ||
    !element ||
    element.hidden ||
    !stateKey ||
    (typeof nodeGraphDialogDragTargetIsInteractive === "function" &&
      nodeGraphDialogDragTargetIsInteractive(event))
  ) {
    return null;
  }
  raiseNodeGraphFloatingWindow(element);
  bindNodeGraphFloatingWindowLockHandle(event.currentTarget);
  const current = nodeGraphFloatingWindowElementPosition(element);
  const drag = {
    handle: event.currentTarget,
    pointerId: event.pointerId ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    startLeft: current.left,
    startTop: current.top,
    currentLeft: current.left,
    currentTop: current.top,
    locked: nodeGraphFloatingWindowLocked(element),
  };
  nodeGraphMvp[stateKey] = drag;
  event.currentTarget.classList.add("dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  return drag;
}

function dragNodeGraphFloatingWindow(event, stateKey, element, onMove = null) {
  const drag = nodeGraphMvp[stateKey];
  if (
    !drag ||
    !element ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return false;
  }
  drag.lastClientX = event.clientX;
  drag.lastClientY = event.clientY;
  if (nodeGraphFloatingWindowLocked(element)) {
    event.preventDefault();
    return true;
  }
  const next = moveNodeGraphFloatingWindowElement(
    element,
    drag.startLeft + event.clientX - drag.startClientX,
    drag.startTop + event.clientY - drag.startClientY,
  );
  drag.currentLeft = next.left;
  drag.currentTop = next.top;
  if (typeof onMove === "function") {
    onMove(next, element, drag);
  }
  event.preventDefault();
  return true;
}

function endNodeGraphFloatingWindowDrag(event, stateKey, onEnd = null) {
  const drag = nodeGraphMvp[stateKey];
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return false;
  }
  drag.handle?.classList.remove("dragging");
  if (event.pointerId !== undefined && drag.handle?.hasPointerCapture?.(event.pointerId)) {
    drag.handle.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp[stateKey] = null;
  if (typeof onEnd === "function") {
    onEnd();
  }
  return true;
}

function beginNodeGraphFloatingWindowResize(event, element, stateKey) {
  if (event.button > 0 || !element || element.hidden || !stateKey) {
    return null;
  }
  raiseNodeGraphFloatingWindow(element);
  const rect = element.getBoundingClientRect();
  const drag = {
    handle: event.currentTarget,
    pointerId: event.pointerId ?? null,
    startClientX: event.clientX,
    startClientY: event.clientY,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
  };
  nodeGraphMvp[stateKey] = drag;
  event.currentTarget.classList.add("dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
  return drag;
}

function dragNodeGraphFloatingWindowResize(event, stateKey, applySize, axes = {}) {
  const drag = nodeGraphMvp[stateKey];
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId) ||
    typeof applySize !== "function"
  ) {
    return false;
  }
  const nextSize = {};
  if (axes.width !== false) {
    nextSize.width = drag.startWidth + event.clientX - drag.startClientX;
  }
  if (axes.height !== false) {
    nextSize.height = drag.startHeight + event.clientY - drag.startClientY;
  }
  drag.lastClientX = event.clientX;
  drag.lastClientY = event.clientY;
  applySize(nextSize);
  event.preventDefault();
  return true;
}

function endNodeGraphFloatingWindowResize(event, stateKey, onEnd = null) {
  const drag = nodeGraphMvp[stateKey];
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return false;
  }
  drag.handle.classList.remove("dragging");
  if (event.pointerId !== undefined && drag.handle.hasPointerCapture?.(event.pointerId)) {
    drag.handle.releasePointerCapture(event.pointerId);
  }
  nodeGraphMvp[stateKey] = null;
  if (typeof onEnd === "function") {
    onEnd();
  }
  return true;
}

function nodeGraphFloatingWindowKeyboardTargets() {
  return [
    {
      draggingKey: "sceneContextDragging",
      resizingKey: "sceneContextResizing",
      elementId: "nodeSceneContextMenu",
      workspaceKey: "commandCenter",
      applySize: typeof applyNodeSceneContextWindowSize === "function" ? applyNodeSceneContextWindowSize : null,
      sizeAxes: { width: true, height: false },
    },
    {
      draggingKey: "moduleActionDragging",
      resizingKey: "moduleActionResizing",
      elementId: "nodeModuleActionsWindow",
      workspaceKey: "moduleActions",
      applySize: typeof applyNodeModuleActionsWindowSize === "function" ? applyNodeModuleActionsWindowSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "moduleShopDragging",
      resizingKey: "moduleShopResizing",
      elementId: "nodeModuleShopView",
      workspaceKey: "moduleBrowser",
      applySize: typeof applyNodeGraphModuleShopWindowSize === "function" ? applyNodeGraphModuleShopWindowSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "savedPatchesWindowDragging",
      resizingKey: "savedPatchesWindowResizing",
      elementId: "nodeSavedPatchesWindow",
      workspaceKey: "patchExplorer",
      applySize: typeof applyNodeGraphSavedPatchesWindowSize === "function" ? applyNodeGraphSavedPatchesWindowSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "visibilityMenuDragging",
      resizingKey: "visibilityMenuResizing",
      elementId: "nodeVisibilityMenu",
      workspaceKey: "visibilityMenu",
      applySize: typeof applyNodeGraphVisibilityMenuSize === "function" ? applyNodeGraphVisibilityMenuSize : null,
      sizeAxes: { width: true, height: false },
    },
    {
      draggingKey: "metadataDragging",
      resizingKey: "metadataResizing",
      elementId: "nodeParameterMetadataPopover",
      workspaceKey: "metaparameters",
      applySize: typeof applyNodeMetadataPopoverSize === "function" ? applyNodeMetadataPopoverSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "traceDisplaySettingsDragging",
      resizingKey: "traceDisplaySettingsResizing",
      elementId: "nodeTraceDisplaySettingsPopover",
      workspaceKey: "traceDisplaySettings",
      applySize: typeof applyNodeGraphTraceDisplaySettingsWindowSize === "function" ? applyNodeGraphTraceDisplaySettingsWindowSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "standaloneMidiKeyboardDragging",
      resizingKey: "standaloneMidiKeyboardResizing",
      elementId: "nodeStandaloneMidiKeyboardDock",
      workspaceKey: "standaloneMidiKeyboard",
      applySize: typeof applyNodeGraphStandaloneMidiKeyboardDockSize === "function" ? applyNodeGraphStandaloneMidiKeyboardDockSize : null,
      sizeAxes: { width: true, height: true },
    },
    {
      draggingKey: "tooltipWindowDragging",
      resizingKey: "tooltipWindowResizing",
      elementId: "nodeTooltipWindow",
      workspaceKey: "tooltipWindow",
      applySize: typeof applyNodeGraphTooltipWindowSize === "function" ? applyNodeGraphTooltipWindowSize : null,
      sizeAxes: { width: true, height: true },
    },
  ];
}

function nodeGraphActiveFloatingWindowKeyboardTarget() {
  for (const config of nodeGraphFloatingWindowKeyboardTargets()) {
    const resizeDrag = config.resizingKey ? nodeGraphMvp[config.resizingKey] : null;
    const drag = nodeGraphMvp[config.draggingKey];
    const element = document.getElementById(config.elementId);
    if (resizeDrag && element && !element.hidden) {
      return { ...config, drag: resizeDrag, element, keyboardMode: "resize" };
    }
    if (drag && element && !element.hidden) {
      return { ...config, drag, element, keyboardMode: "move" };
    }
  }
  return null;
}

function rebaseNodeGraphFloatingWindowDrag(target, next) {
  if (!target?.drag || !next) {
    return;
  }
  const pointerX = Number(target.drag.lastClientX);
  const pointerY = Number(target.drag.lastClientY);
  target.drag.startLeft = next.left;
  target.drag.startTop = next.top;
  target.drag.currentLeft = next.left;
  target.drag.currentTop = next.top;
  if (Number.isFinite(pointerX)) {
    target.drag.startClientX = pointerX;
  }
  if (Number.isFinite(pointerY)) {
    target.drag.startClientY = pointerY;
  }
}

function nudgeNodeGraphFloatingWindowByKeyboard(target, dx, dy) {
  if (nodeGraphFloatingWindowLocked(target.element)) {
    return false;
  }
  const current = nodeGraphFloatingWindowElementPosition(target.element);
  const next = moveNodeGraphFloatingWindowElement(
    target.element,
    current.left + dx,
    current.top + dy,
  );
  rebaseNodeGraphFloatingWindowDrag(target, next);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      target.workspaceKey,
      target.element,
      { open: true, position: next },
      { persist: false },
    );
  }
  return true;
}

function resizeNodeGraphFloatingWindowByKeyboard(target, dw, dh) {
  if (typeof target.applySize !== "function") {
    return false;
  }
  const rect = target.element.getBoundingClientRect();
  const nextSize = {
    width: rect.width + (target.sizeAxes.width === false ? 0 : dw),
    height: rect.height + (target.sizeAxes.height === false ? 0 : dh),
  };
  if (target.sizeAxes.width === false) {
    delete nextSize.width;
  }
  if (target.sizeAxes.height === false) {
    delete nextSize.height;
  }
  if (!Object.keys(nextSize).length) {
    return false;
  }
  const normalized = target.applySize(nextSize);
  if (normalized && target.drag) {
    const pointerX = Number(target.drag.lastClientX);
    const pointerY = Number(target.drag.lastClientY);
    if (Number.isFinite(Number(normalized.width))) {
      target.drag.startWidth = Number(normalized.width);
    }
    if (Number.isFinite(Number(normalized.height))) {
      target.drag.startHeight = Number(normalized.height);
    }
    if (Number.isFinite(pointerX)) {
      target.drag.startClientX = pointerX;
    }
    if (Number.isFinite(pointerY)) {
      target.drag.startClientY = pointerY;
    }
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      target.workspaceKey,
      target.element,
      { open: true, size: normalized },
      { status: false },
    );
  }
  return true;
}

const nodeGraphFloatingWindowArrowDeltas = Object.freeze({
  ArrowDown: { dx: 0, dy: 1, dw: 0, dh: 1 },
  ArrowLeft: { dx: -1, dy: 0, dw: -1, dh: 0 },
  ArrowRight: { dx: 1, dy: 0, dw: 1, dh: 0 },
  ArrowUp: { dx: 0, dy: -1, dw: 0, dh: -1 },
});

const nodeGraphFloatingWindowHeldArrowKeys = new Set();
const nodeGraphFloatingWindowKeyboardStepMs = 135;
const nodeGraphFloatingWindowKeyboardState = {
  animationFrame: 0,
  lastStepMs: 0,
  shiftKey: false,
};

function nodeGraphFloatingWindowHeldArrowDelta() {
  const delta = { dx: 0, dy: 0, dw: 0, dh: 0 };
  for (const key of nodeGraphFloatingWindowHeldArrowKeys) {
    const arrow = nodeGraphFloatingWindowArrowDeltas[key];
    if (!arrow) {
      continue;
    }
    delta.dx += arrow.dx;
    delta.dy += arrow.dy;
    delta.dw += arrow.dw;
    delta.dh += arrow.dh;
  }
  return delta;
}

function stopNodeGraphFloatingWindowKeyboardLoop() {
  if (nodeGraphFloatingWindowKeyboardState.animationFrame) {
    window.cancelAnimationFrame(nodeGraphFloatingWindowKeyboardState.animationFrame);
  }
  nodeGraphFloatingWindowKeyboardState.animationFrame = 0;
}

function clearNodeGraphFloatingWindowKeyboardState() {
  nodeGraphFloatingWindowHeldArrowKeys.clear();
  nodeGraphFloatingWindowKeyboardState.lastStepMs = 0;
  nodeGraphFloatingWindowKeyboardState.shiftKey = false;
  stopNodeGraphFloatingWindowKeyboardLoop();
}

function stepNodeGraphFloatingWindowKeyboardLoop(nowMs = 0) {
  nodeGraphFloatingWindowKeyboardState.animationFrame = 0;
  const target = nodeGraphActiveFloatingWindowKeyboardTarget();
  if (!target || !nodeGraphFloatingWindowHeldArrowKeys.size) {
    clearNodeGraphFloatingWindowKeyboardState();
    return;
  }
  const delta = nodeGraphFloatingWindowHeldArrowDelta();
  const canStep = (
    !nodeGraphFloatingWindowKeyboardState.lastStepMs ||
    nowMs - nodeGraphFloatingWindowKeyboardState.lastStepMs >= nodeGraphFloatingWindowKeyboardStepMs
  );
  if (canStep && (delta.dx || delta.dy || delta.dw || delta.dh)) {
    nodeGraphFloatingWindowKeyboardState.lastStepMs = nowMs;
    if (target.keyboardMode === "resize" || nodeGraphFloatingWindowKeyboardState.shiftKey) {
      resizeNodeGraphFloatingWindowByKeyboard(target, delta.dw, delta.dh);
    } else {
      nudgeNodeGraphFloatingWindowByKeyboard(target, delta.dx, delta.dy);
    }
  }
  nodeGraphFloatingWindowKeyboardState.animationFrame = window.requestAnimationFrame(
    stepNodeGraphFloatingWindowKeyboardLoop,
  );
}

function startNodeGraphFloatingWindowKeyboardLoop() {
  if (nodeGraphFloatingWindowKeyboardState.animationFrame) {
    return;
  }
  nodeGraphFloatingWindowKeyboardState.lastStepMs = 0;
  nodeGraphFloatingWindowKeyboardState.animationFrame = window.requestAnimationFrame(
    stepNodeGraphFloatingWindowKeyboardLoop,
  );
}

function nodeGraphFloatingWindowKeyboardEventIsEditable(event) {
  const target = event?.target;
  const active = document.activeElement;
  return Boolean(
    target?.closest?.("input, textarea, select, [contenteditable='true']") ||
    active?.closest?.("input, textarea, select, [contenteditable='true']"),
  );
}

function handleNodeGraphFloatingWindowKeyboardNudge(event) {
  if (!nodeGraphFloatingWindowArrowDeltas[event.key] || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (nodeGraphFloatingWindowKeyboardEventIsEditable(event)) {
    clearNodeGraphFloatingWindowKeyboardState();
    return false;
  }
  const target = nodeGraphActiveFloatingWindowKeyboardTarget();
  if (!target) {
    clearNodeGraphFloatingWindowKeyboardState();
    return false;
  }
  nodeGraphFloatingWindowHeldArrowKeys.add(event.key);
  nodeGraphFloatingWindowKeyboardState.shiftKey = Boolean(event.shiftKey);
  startNodeGraphFloatingWindowKeyboardLoop();
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function handleNodeGraphFloatingWindowKeyboardRelease(event) {
  if (!nodeGraphFloatingWindowArrowDeltas[event.key]) {
    return false;
  }
  nodeGraphFloatingWindowHeldArrowKeys.delete(event.key);
  if (!nodeGraphActiveFloatingWindowKeyboardTarget()) {
    clearNodeGraphFloatingWindowKeyboardState();
  } else if (!nodeGraphFloatingWindowHeldArrowKeys.size) {
    stopNodeGraphFloatingWindowKeyboardLoop();
  }
  return false;
}

// Install popup stacking as soon as this module loads (and again after DOM
// is ready if the script ran early).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNodeGraphFloatingWindowStacking, { once: true });
  } else {
    bindNodeGraphFloatingWindowStacking();
  }
}
