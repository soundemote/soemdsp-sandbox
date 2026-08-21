const nodeUiDevDefaultSettingsUrl = "./public/presets/useruisettings.json";
const nodeUiDevDefaultSettingsStorageKey = "soemdsp-sandbox.userUiSettings.startup.v13";
const nodeGraphUserSessionStorageKey = "soemdsp-sandbox.userSession.startup.v1";
const nodeGraphUserSessionFormatKind = "soemdsp-sandbox-user-session";
const nodeGraphUserSessionFormatVersion = 1;
// Until the first load/apply finishes, serialize() only sees HTML defaults.
// Any persist in that window (window-seat remember, unload flush) would
// overwrite the last good localStorage blob. Refuse those writes.
let nodeUiDevSettingsHydrated = false;

const nodeGraphWorkspaceWindowStateKeys = Object.freeze([
  "commandCenter",
  "codeBox",
  "moduleActions",
  "metaparameters",
  "oscilloscopeSettings",
  "moduleBrowser",
  "visibilityMenu",
  "uiSettings",
  "uiDev",
  "traceDisplaySettings",
  "standaloneMidiKeyboard",
  "tooltipWindow",
  "phosphorWaveformSettings",
  "emoji",
]);

const nodeGraphWorkspaceWindowElements = Object.freeze({
  commandCenter: "nodeSceneContextMenu",
  codeBox: "nodeCodeBoxWindow",
  moduleActions: "nodeModuleActionsWindow",
  metaparameters: "nodeParameterMetadataPopover",
  oscilloscopeSettings: "nodeGlobalScopeMenu",
  moduleBrowser: "nodeModuleShopView",
  visibilityMenu: "nodeVisibilityMenu",
  uiSettings: "nodeUserUiSettingsPanel",
  patchDefaults: "nodePatchDefaultsPanel",
  uiDev: "nodeUiDevHelper",
  traceDisplaySettings: "nodeTraceDisplaySettingsPopover",
  standaloneMidiKeyboard: "nodeStandaloneMidiKeyboardDock",
  tooltipWindow: "nodeTooltipWindow",
  phosphorWaveformSettings: "nodePhosphorWaveformSettingsWindow",
  emoji: "nodeEmojiPage",
});

const nodeGraphSharedInspectorWindowKeys = Object.freeze([
  "moduleActions",
  "metaparameters",
  "traceDisplaySettings",
]);

function normalizeNodeGraphSharedInspectorActive(value = "") {
  return nodeGraphSharedInspectorWindowKeys.includes(value) ? value : "";
}

function normalizeNodeGraphWorkspaceWindowPosition(position = {}) {
  const source = position && typeof position === "object" ? position : {};
  if (
    !Number.isFinite(Number(source.left)) ||
    !Number.isFinite(Number(source.top))
  ) {
    return null;
  }
  const normalized = typeof normalizeNodeGraphWindowPosition === "function"
    ? normalizeNodeGraphWindowPosition(source)
    : {
      left: Math.round(Number(source.left)),
      top: Math.round(Number(source.top)),
    };
  if (
    !Number.isFinite(Number(normalized?.left)) ||
    !Number.isFinite(Number(normalized?.top))
  ) {
    return null;
  }
  return {
    left: Math.round(Number(normalized.left)),
    top: Math.round(Number(normalized.top)),
  };
}

/**
 * True when a saved floating-window position is safe to restore.
 * Rejects null/NaN and the common false memory of {0,0} (CSS default for an
 * unpositioned fixed window captured before first real placement) — that is
 * what made Module Settings / Display Settings jump to the upper-left on
 * right-click after a bad remember.
 */
function nodeGraphFloatingWindowSavedPositionIsUsable(position = null) {
  const left = Number(position?.left);
  const top = Number(position?.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return false;
  }
  if (left === 0 && top === 0) {
    return false;
  }
  return true;
}

function nodeGraphSharedInspectorGeometryFromStates(states = {}) {
  let position = null;
  let size = null;
  for (const key of nodeGraphSharedInspectorWindowKeys) {
    if (!position && states?.[key]?.position) {
      const candidate = normalizeNodeGraphWorkspaceWindowPosition(states[key].position);
      if (nodeGraphFloatingWindowSavedPositionIsUsable(candidate)) {
        position = candidate;
      }
    }
    if (!size && states?.[key]?.size) {
      const width = Number(states[key].size.width);
      const height = Number(states[key].size.height);
      size = {
        ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}),
        ...(Number.isFinite(height) && height > 0 ? { height: Math.round(height) } : {}),
      };
      if (!size.width && !size.height) {
        size = null;
      }
    }
    if (position && size) {
      break;
    }
  }
  return { position, size };
}

function normalizeNodeGraphSharedInspectorWindowState(state = {}, fallbackStates = {}) {
  const source = state && typeof state === "object" ? state : {};
  const fallback = nodeGraphSharedInspectorGeometryFromStates(fallbackStates);
  let position = normalizeNodeGraphWorkspaceWindowPosition(source.position) || fallback.position;
  // Drop false 0,0 memory so inspectors re-spawn at the pointer.
  if (position && typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    && !nodeGraphFloatingWindowSavedPositionIsUsable(position)) {
    position = null;
  }
  const rawSize = source.size && typeof source.size === "object" ? source.size : fallback.size;
  const size = rawSize && typeof rawSize === "object"
    ? {
      ...(Number.isFinite(Number(rawSize.width)) ? { width: Math.round(Number(rawSize.width)) } : {}),
      ...(Number.isFinite(Number(rawSize.height)) ? { height: Math.round(Number(rawSize.height)) } : {}),
    }
    : null;
  return {
    ...(position ? { position } : {}),
    ...(size && (size.width || size.height) ? { size } : {}),
    ...(source.locked ? { locked: true } : {}),
  };
}

function nodeGraphWorkspaceStatesWithSharedInspectorGeometry(states = {}) {
  const { position, size } = normalizeNodeGraphSharedInspectorWindowState(
    nodeGraphMvp?.sharedInspectorWindowState,
    states,
  );
  if (!position && !size) {
    return states;
  }
  nodeGraphMvp.sharedInspectorWindowState = {
    ...(position ? { position } : {}),
    ...(size ? { size } : {}),
    ...(nodeGraphMvp?.sharedInspectorWindowState?.locked ? { locked: true } : {}),
  };
  return states;
}

function nodeGraphWorkspaceKeyIsControllerDock(key) {
  return key === "standaloneMidiKeyboard";
}

function normalizeNodeGraphWorkspaceWindowStateEntry(entry = {}, key = "") {
  const source = entry && typeof entry === "object" ? entry : {};
  if (key === "visibilityMenu" || nodeGraphWorkspaceKeyIsControllerDock(key)) {
    return { open: Boolean(source.open) };
  }
  const isSharedInspector = nodeGraphSharedInspectorWindowKeys.includes(key);
  const position = isSharedInspector
    ? null
    : normalizeNodeGraphWorkspaceWindowPosition(source.position || source);
  const size = source.size && typeof source.size === "object"
    ? {
      ...(Number.isFinite(Number(source.size.width)) ? { width: Math.round(Number(source.size.width)) } : {}),
      ...(Number.isFinite(Number(source.size.height)) ? { height: Math.round(Number(source.size.height)) } : {}),
    }
    : null;
  return {
    open: Boolean(source.open),
    ...(position ? { position } : {}),
    ...(!isSharedInspector && size && (size.width || size.height) ? { size } : {}),
    ...(source.locked ? { locked: true } : {}),
    ...(source.targetNode ? { targetNode: String(source.targetNode) } : {}),
  };
}

function normalizeNodeGraphWorkspaceWindowStates(states = {}) {
  const source = states && typeof states === "object" ? states : {};
  return Object.fromEntries(
    nodeGraphWorkspaceWindowStateKeys.map((key) => [
      key,
      normalizeNodeGraphWorkspaceWindowStateEntry(source[key], key),
    ]),
  );
}

function syncNodeGraphSharedInspectorGeometry(states, key) {
  if (!nodeGraphSharedInspectorWindowKeys.includes(key)) {
    return states;
  }
  return states;
}

function nodeGraphWorkspaceWindowStatesAllOpen(states = {}) {
  const normalized = normalizeNodeGraphWorkspaceWindowStates(states);
  return nodeGraphWorkspaceWindowStateKeys.every((key) => normalized[key]?.open === true);
}

function closeNodeGraphWorkspaceWindowStates(states = {}) {
  const normalized = normalizeNodeGraphWorkspaceWindowStates(states);
  return Object.fromEntries(
    nodeGraphWorkspaceWindowStateKeys.map((key) => [
      key,
      {
        ...normalized[key],
        open: false,
      },
    ]),
  );
}

function nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(states = {}, active = "") {
  const normalized = normalizeNodeGraphSharedInspectorActive(active);
  if (!normalized) {
    return states;
  }
  for (const key of nodeGraphSharedInspectorWindowKeys) {
    states[key] = {
      ...(states[key] || { open: false }),
      open: key === normalized ? Boolean(states[key]?.open) : false,
    };
  }
  return states;
}

function normalizeNodeGraphWorkspaceViewState(view = {}) {
  const source = view && typeof view === "object" ? view : {};
  const panSource = source.pan && typeof source.pan === "object" ? source.pan : source;
  const x = Number(panSource.x);
  const y = Number(panSource.y);
  const rawZoom = Number(source.zoom);
  const zoom = typeof clampNodeGraphZoom === "function"
    ? clampNodeGraphZoom(rawZoom)
    : (Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1);
  return {
    pan: {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    },
    zoom,
  };
}

function normalizeNodeGraphModuleStoreDepartmentState(value = "") {
  const department = String(value || "").trim();
  if (!department) {
    return "";
  }
  // Prefer shared resolver (canonical ids + aliases: music→sample, etc.).
  if (typeof normalizeNodeGraphModuleStoreDepartment === "function") {
    return normalizeNodeGraphModuleStoreDepartment(department);
  }
  if (
    typeof nodeGraphModuleStoreDepartmentIds !== "undefined" &&
    nodeGraphModuleStoreDepartmentIds.has(department)
  ) {
    return department;
  }
  if (
    typeof nodeGraphModuleStoreDepartmentAliasToId !== "undefined" &&
    nodeGraphModuleStoreDepartmentAliasToId[department]
  ) {
    return nodeGraphModuleStoreDepartmentAliasToId[department];
  }
  return "";
}

function nodeGraphWorkspaceWindowPositionFromElement(element) {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect?.();
  const styleLeft = Number.parseFloat(element.style.left);
  const styleTop = Number.parseFloat(element.style.top);
  let position = null;
  if (
    Number.isFinite(styleLeft) &&
    Number.isFinite(styleTop) &&
    typeof nodeGraphFloatingWindowViewportPositionFromCss === "function"
  ) {
    position = normalizeNodeGraphWorkspaceWindowPosition(
      nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop),
    );
  } else {
    position = normalizeNodeGraphWorkspaceWindowPosition({
      left: Number.isFinite(styleLeft) ? styleLeft : rect?.left,
      top: Number.isFinite(styleTop) ? styleTop : rect?.top,
    });
  }
  // Do not persist a false 0,0 memory (unpositioned fixed window).
  if (typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? !nodeGraphFloatingWindowSavedPositionIsUsable(position)
    : !position) {
    return null;
  }
  return position;
}

function rememberNodeGraphWorkspaceWindowState(key, element, patch = {}, options = {}) {
  if (!nodeGraphWorkspaceWindowStateKeys.includes(key)) {
    return null;
  }
  const states = normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates);
  // Unified pages share one seat (unifiedWindowPosition). An independent
  // per-page seat is what yanked Command Center when switching pages.
  if (typeof nodeGraphWorkspaceKeyIsUnifiedPage === "function"
    ? nodeGraphWorkspaceKeyIsUnifiedPage(key)
    : key === "visibilityMenu") {
    states[key] = normalizeNodeGraphWorkspaceWindowStateEntry({
      ...states[key],
      open: patch.open ?? (element ? !element.hidden : states[key]?.open),
      position: null,
      size: key === "visibilityMenu" ? null : states[key]?.size,
    }, key);
    nodeGraphMvp.workspaceWindowStates = states;
    return states[key];
  }
  if (nodeGraphWorkspaceKeyIsControllerDock(key)) {
    states[key] = { open: Boolean(patch.open ?? (element ? !element.hidden : states[key]?.open)) };
    nodeGraphMvp.workspaceWindowStates = states;
    if (options.persist !== false) {
      saveNodeGraphWorkspaceWindowStatesToUserSettings(options);
    }
    return states[key];
  }
  const shouldCapturePosition = options.capturePosition !== false;
  const position = patch.position || (shouldCapturePosition ? nodeGraphWorkspaceWindowPositionFromElement(element) : null);
  if (nodeGraphSharedInspectorWindowKeys.includes(key)) {
    nodeGraphMvp.sharedInspectorWindowState = normalizeNodeGraphSharedInspectorWindowState(
      {
        ...nodeGraphMvp.sharedInspectorWindowState,
        ...(position ? { position } : {}),
        ...(patch.size ? { size: patch.size } : {}),
        ...(patch.locked !== undefined ? { locked: Boolean(patch.locked) } : {}),
      },
      states,
    );
  }
  states[key] = normalizeNodeGraphWorkspaceWindowStateEntry({
    ...states[key],
    ...patch,
    open: patch.open ?? (element ? !element.hidden : states[key]?.open),
    ...(nodeGraphSharedInspectorWindowKeys.includes(key) ? {} : (position ? { position } : {})),
  }, key);
  syncNodeGraphSharedInspectorGeometry(states, key);
  if (nodeGraphSharedInspectorWindowKeys.includes(key) && states[key]?.open) {
    nodeGraphMvp.sharedInspectorActive = key;
    nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(states, key);
  }
  nodeGraphMvp.workspaceWindowStates = states;
  if (options.persist !== false) {
    saveNodeGraphWorkspaceWindowStatesToUserSettings(options);
  }
  return states[key];
}

function saveNodeGraphWorkspaceWindowStatesToUserSettings(options = {}) {
  persistSession({ ...options, reason: "session" });
}

// App-wide floating-window open policy, in one place.
//
// Activation is NOT a move. Order of placement:
//   1) remembered workspace seat (user-dragged / saved)
//   2) existing fixed left/top style already on the element
//   3) current on-screen layout box (e.g. CSS top/right defaults) — lock it
//   4) only then spawnAtPointer (true first placement with no seat at all)
//
// Requires `key` to be present in nodeGraphWorkspaceWindowElements -- a
// window that is not registered there has nowhere to remember a position, and
// will silently spawn at the pointer forever.
function openNodeGraphFloatingWindowAtPosition(key, element, spawnAtPointer) {
  if (!element) {
    return false;
  }
  if (typeof markNodeGraphFloatingWindowSurface === "function") {
    markNodeGraphFloatingWindowSurface(element);
  }
  // The glow decision lives in positionNodeGraphFloatingWindowWithAttention:
  // it measures the element before and after, so "did not move" is detected
  // the same way here as in every other open path.
  // Whether the remembered position was applied (vs. a first-time spawn at
  // the pointer) is what this function reports back, so it has to be captured
  // from inside the callback -- the callback runs synchronously.
  let restored = false;
  positionNodeGraphFloatingWindowWithAttention(element, () => {
    if (typeof nodeGraphWorkspaceKeyIsUnifiedPage === "function"
      && nodeGraphWorkspaceKeyIsUnifiedPage(key)
      && typeof applyNodeGraphUnifiedSeatToElement === "function") {
      restored = applyNodeGraphUnifiedSeatToElement(element);
    }
    if (!restored) {
      restored = positionNodeGraphWorkspaceWindowFromState(key, element);
    }
    if (!restored) {
      // Keep an existing seat — never re-home just because the user activated.
      restored = lockNodeGraphFloatingWindowExistingSeat(element);
    }
    if (!restored && typeof spawnAtPointer === "function") {
      spawnAtPointer(element);
    }
  });
  // Newest opened popup is always frontmost among floating windows.
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(element);
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(key, element, { open: true }, { status: false });
  }
  return restored;
}

/**
 * If the element already has a fixed seat (inline left/top, or a real on-screen
 * layout from CSS like top/right), convert/lock it to left/top and return true.
 * Used so activation never jumps a window that already has a place.
 */
function lockNodeGraphFloatingWindowExistingSeat(element) {
  if (!element) {
    return false;
  }
  const styleLeft = Number.parseFloat(element.style.left);
  const styleTop = Number.parseFloat(element.style.top);
  let left = null;
  let top = null;
  if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
    if (typeof nodeGraphFloatingWindowViewportPositionFromCss === "function") {
      const fromCss = nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop);
      left = fromCss.left;
      top = fromCss.top;
    } else {
      left = styleLeft;
      top = styleTop;
    }
  } else {
    // CSS-only placement (e.g. Visibility: top/right without inline left).
    const rect = element.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      left = rect.left;
      top = rect.top;
    }
  }
  if (
    typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
      ? !nodeGraphFloatingWindowSavedPositionIsUsable({ left, top })
      : !(Number.isFinite(left) && Number.isFinite(top))
  ) {
    return false;
  }
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(element, left, top);
  } else {
    element.style.position = "fixed";
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.right = "auto";
  }
  return true;
}

function positionNodeGraphWorkspaceWindowFromState(key, element) {
  if (typeof nodeGraphWorkspaceKeyIsUnifiedPage === "function"
    && nodeGraphWorkspaceKeyIsUnifiedPage(key)) {
    return typeof applyNodeGraphUnifiedSeatToElement === "function"
      ? applyNodeGraphUnifiedSeatToElement(element)
      : false;
  }
  const state = normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates)[key];
  const sharedInspectorState = normalizeNodeGraphSharedInspectorWindowState(
    nodeGraphMvp.sharedInspectorWindowState,
    nodeGraphMvp.workspaceWindowStates,
  );
  const position = nodeGraphSharedInspectorWindowKeys.includes(key)
    ? sharedInspectorState.position
    : state?.position;
  if (
    !element
    || !(typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
      ? nodeGraphFloatingWindowSavedPositionIsUsable(position)
      : position)
  ) {
    return false;
  }
  const wasHidden = element.hidden;
  let left = Math.round(Number(position.left));
  let top = Math.round(Number(position.top));
  element.style.position = "fixed";
  if (typeof nodeGraphFloatingWindowPosition === "function") {
    const clamped = nodeGraphFloatingWindowPosition(element, left, top);
    left = clamped.left;
    top = clamped.top;
  }
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(element, left, top);
  } else {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.right = "auto";
  }
  element.hidden = wasHidden;
  return true;
}

function applyNodeGraphWorkspaceWindowStateToElement(key) {
  const state = normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates)[key];
  if (
    key === "traceDisplaySettings" &&
    state.open &&
    !document.getElementById(nodeGraphWorkspaceWindowElements[key]) &&
    typeof nodeGraphTraceDisplaySettingsElement === "function"
  ) {
    nodeGraphTraceDisplaySettingsElement();
  }
  const element = document.getElementById(nodeGraphWorkspaceWindowElements[key]);
  if (!element) {
    return;
  }
  if (key !== "standaloneMidiKeyboard" && typeof markNodeGraphFloatingWindowSurface === "function") {
    markNodeGraphFloatingWindowSurface(element);
  }
  if (key === "oscilloscopeSettings") {
    element.hidden = true;
    return;
  }
  if (key === "uiDev") {
    // UIDEV is a page inside UI Settings, not its own window.
    if (state.open && nodeGraphMvp) {
      nodeGraphMvp.uiSettingsPage = "uidev";
    }
    if (typeof mountNodeUiDevHelperAsUiSettingsPage === "function") {
      mountNodeUiDevHelperAsUiSettingsPage();
    }
    if (typeof syncNodeUserUiSettingsPageChrome === "function") {
      syncNodeUserUiSettingsPageChrome();
    }
    return;
  }
  if (typeof nodeGraphWorkspaceKeyIsUnifiedPage === "function"
    ? nodeGraphWorkspaceKeyIsUnifiedPage(key)
    : key === "visibilityMenu") {
    // Unified pages are one window. Restore that window after all keys,
    // never independently unhide/re-home each page from its old seat.
    element.hidden = true;
    return;
  }
  if (key === "standaloneMidiKeyboard") {
    if (state.open && typeof initNodeGraphStandaloneMidiKeyboard === "function") {
      initNodeGraphStandaloneMidiKeyboard();
    }
    element.hidden = !state.open;
    if (typeof applyNodeGraphControllerDockHeight === "function") {
      applyNodeGraphControllerDockHeight(nodeGraphMvp?.controllerDockHeight, { layout: false });
    }
    if (state.open && typeof syncNodeGraphControllerDockShown === "function") {
      syncNodeGraphControllerDockShown();
    }
    if (typeof renderNodeGraphStandaloneMidiKeyboardToggle === "function") {
      renderNodeGraphStandaloneMidiKeyboardToggle();
    }
    return;
  }
  element.hidden = !state.open;
  if (state.open && typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(element);
  }
  if (key === "uiSettings" && typeof applyNodeUserUiSettingsWindowSize === "function") {
    applyNodeUserUiSettingsWindowSize(state.size);
  }
  if (key === "uiDev" && typeof applyNodeUiDevHelperWindowSize === "function") {
    applyNodeUiDevHelperWindowSize(state.size);
  }
  if (key === "moduleActions" && typeof applyNodeModuleActionsWindowSize === "function") {
    applyNodeModuleActionsWindowSize(nodeGraphMvp.sharedInspectorWindowState?.size);
  }
  if (key === "codeBox" && typeof applyNodeGraphCodeBoxWindowSize === "function") {
    applyNodeGraphCodeBoxWindowSize(state.size);
  }
  if (key === "moduleBrowser" && typeof applyNodeGraphModuleShopWindowSize === "function") {
    applyNodeGraphModuleShopWindowSize(state.size);
  }
  if (key === "metaparameters" && typeof applyNodeMetadataPopoverSize === "function") {
    applyNodeMetadataPopoverSize(nodeGraphMvp.unifiedWindowSize || nodeGraphMvp.sharedInspectorWindowState?.size);
  }
  if (key === "traceDisplaySettings" && typeof applyNodeGraphTraceDisplaySettingsWindowSize === "function") {
    applyNodeGraphTraceDisplaySettingsWindowSize(nodeGraphMvp.sharedInspectorWindowState?.size);
  }
  if (typeof applyNodeGraphFloatingWindowLockedState === "function") {
    const locked = nodeGraphSharedInspectorWindowKeys.includes(key)
      ? Boolean(nodeGraphMvp.sharedInspectorWindowState?.locked)
      : Boolean(state.locked);
    applyNodeGraphFloatingWindowLockedState(element, locked);
  }
  const hasPosition = nodeGraphSharedInspectorWindowKeys.includes(key)
    ? nodeGraphMvp.sharedInspectorWindowState?.position
    : state.position;
  if (state.open && hasPosition) {
    positionNodeGraphWorkspaceWindowFromState(key, element);
  }
  if (
    key === "traceDisplaySettings" &&
    state.open &&
    typeof restoreNodeGraphTraceDisplaySettingsWindowFromState === "function"
  ) {
    restoreNodeGraphTraceDisplaySettingsWindowFromState(state);
  }
  if (key === "moduleActions" && state.open && typeof configureNodeSceneContextMenu === "function") {
    const mode = nodeGraphMvp.selected?.type === "wire" ? "wire" : "module";
    configureNodeSceneContextMenu(mode);
  }
  if (key === "codeBox" && state.open && typeof syncNodeGraphCodeBoxWindow === "function") {
    syncNodeGraphCodeBoxWindow();
  }
}

function enforceNodeGraphWorkspaceClosedWindowStates(states = nodeGraphMvp.workspaceWindowStates) {
  const normalized = normalizeNodeGraphWorkspaceWindowStates(states);
  for (const key of nodeGraphWorkspaceWindowStateKeys) {
    const element = document.getElementById(nodeGraphWorkspaceWindowElements[key]);
    if (!element || normalized[key]?.open) {
      continue;
    }
    element.hidden = true;
  }
}

function applyNodeGraphWorkspaceWindowStates() {
  if (typeof syncNodeGraphRegisteredFloatingWindowSurfaces === "function") {
    syncNodeGraphRegisteredFloatingWindowSurfaces();
  }
  nodeGraphMvp.workspaceWindowStates = normalizeNodeGraphWorkspaceWindowStates(
    nodeGraphMvp.workspaceWindowStates,
  );
  nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(
    nodeGraphMvp.workspaceWindowStates,
    nodeGraphMvp.sharedInspectorActive,
  );
  for (const key of nodeGraphWorkspaceWindowStateKeys) {
    applyNodeGraphWorkspaceWindowStateToElement(key);
  }
  enforceNodeGraphWorkspaceClosedWindowStates(nodeGraphMvp.workspaceWindowStates);
  if (typeof restoreNodeGraphUnifiedWindowAfterWorkspaceStates === "function") {
    restoreNodeGraphUnifiedWindowAfterWorkspaceStates();
  }
  document
    .getElementById("nodeUserUiSettingsButton")
    ?.classList.toggle("active", !document.getElementById("nodeUserUiSettingsPanel")?.hidden);
  document
    .getElementById("nodeUiDevButton")
    ?.classList.toggle("active", !document.getElementById("nodeUiDevHelper")?.hidden);
  if (!document.getElementById("nodeModuleShopView")?.hidden) {
    if (typeof renderNodeGraphModuleStoreCatalog === "function") {
      renderNodeGraphModuleStoreCatalog();
    }
  }
  if (!document.getElementById("nodeGlobalScopeMenu")?.hidden) {
    if (typeof renderNodeGraphSceneScopeControls === "function") {
      renderNodeGraphSceneScopeControls();
    }
    if (typeof renderNodeGraphModuleScopeBrightnessControl === "function") {
      renderNodeGraphModuleScopeBrightnessControl();
    }
  }
  if (!document.getElementById("nodeUserUiSettingsPanel")?.hidden) {
    if (typeof renderNodeUserUiSettingsControls === "function") {
      renderNodeUserUiSettingsControls();
    }
  }
}

function normalizeNodeUiDevSettings(settings = {}) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error("UI settings must be a JSON object");
  }
  const controls = settings.controls && typeof settings.controls === "object"
    ? { ...settings.controls }
    : {};
  if (!Object.hasOwn(controls, "jackAnalog")) {
    if (controls.jackAnalogOut) {
      controls.jackAnalog = controls.jackAnalogOut;
    } else if (controls.jackAnalogIn) {
      controls.jackAnalog = controls.jackAnalogIn;
    }
  }
  if (controls.sliderHandleHue == null && controls.sliderPositionFillHue != null) {
    controls.sliderHandleHue = controls.sliderPositionFillHue;
  }
  if (controls.sliderHandleBrightness == null) {
    if (controls.sliderPositionFillBrightness != null) {
      controls.sliderHandleBrightness = controls.sliderPositionFillBrightness;
    } else if (controls.sliderPositionFillLightness != null) {
      controls.sliderHandleBrightness = controls.sliderPositionFillLightness;
    }
  }
  if (controls.sliderHandleAlpha == null && controls.sliderPositionFillAlpha != null) {
    controls.sliderHandleAlpha = controls.sliderPositionFillAlpha;
  }
  const exposedControls = settings.exposedControls && typeof settings.exposedControls === "object"
    ? { ...settings.exposedControls }
    : {};
  if (exposedControls.sliderHandleHue == null && exposedControls.sliderPositionFillHue != null) {
    exposedControls.sliderHandleHue = exposedControls.sliderPositionFillHue;
  }
  if (exposedControls.sliderHandleBrightness == null) {
    if (exposedControls.sliderPositionFillBrightness != null) {
      exposedControls.sliderHandleBrightness = exposedControls.sliderPositionFillBrightness;
    } else if (exposedControls.sliderPositionFillLightness != null) {
      exposedControls.sliderHandleBrightness = exposedControls.sliderPositionFillLightness;
    }
  }
  if (exposedControls.sliderHandleAlpha == null && exposedControls.sliderPositionFillAlpha != null) {
    exposedControls.sliderHandleAlpha = exposedControls.sliderPositionFillAlpha;
  }
  const nodeColors = settings.nodeColors && typeof settings.nodeColors === "object"
    ? settings.nodeColors
    : {};
  const moduleDefaultOverrides = settings.moduleDefaultOverrides && typeof settings.moduleDefaultOverrides === "object"
    ? settings.moduleDefaultOverrides
    : {};
  const view = settings.view && typeof settings.view === "object"
    ? settings.view
    : {};
  const normalizedColors = {};
  for (const [property, value] of Object.entries(nodeColors)) {
    if (property.startsWith("--")) {
      normalizedColors[property] = normalizeNodeUiDevColor(value);
    }
  }
  const normalizedModuleDefaultOverrides = {};
  for (const [type, override] of Object.entries(moduleDefaultOverrides)) {
    if (!Object.hasOwn(nodeGraphModuleDefinitions, type) || !override || typeof override !== "object") {
      continue;
    }
    const snapshot = {};
    for (const field of nodeGraphModuleSettingsFields) {
      if (Object.hasOwn(override, field)) {
        snapshot[field] = override[field];
      }
    }
    normalizedModuleDefaultOverrides[type] = snapshot;
  }
  const gridVisible = view.gridVisible ?? controls.gridVisible ?? controls.showGrid ?? nodeGraphMvp.gridVisible;
  const gridLightVisible = view.gridLightVisible !== undefined
    ? Boolean(view.gridLightVisible)
    : (nodeGraphMvp.gridLightVisible !== false);
  const wireLengthsVisible = view.wireLengthsVisible !== undefined
    ? Boolean(view.wireLengthsVisible)
    : (nodeGraphMvp.wireLengthsVisible !== false);
  const wireCurve = typeof normalizeNodeGraphWireCurve === "function"
    ? normalizeNodeGraphWireCurve(view.wireCurve ?? nodeGraphMvp.wireCurve)
    : (() => {
      const n = Number(view.wireCurve ?? nodeGraphMvp.wireCurve ?? 1);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    })();
  const wiresAboveModules = Boolean(view.wiresAboveModules ?? nodeGraphMvp.wiresAboveModules);
  // Debug chrome is session-only — never default on, never restore from UI settings.
  const keyboardDebugInfoVisible = false;
  const tooltipEmbedded = view.tooltipEmbedded !== undefined
    ? Boolean(view.tooltipEmbedded)
    : (nodeGraphMvp.tooltipEmbedded !== false);
  const tooltipEmbedHeight = typeof normalizeNodeGraphTooltipEmbedHeight === "function"
    ? normalizeNodeGraphTooltipEmbedHeight(view.tooltipEmbedHeight ?? nodeGraphMvp.tooltipEmbedHeight ?? 46)
    : Math.max(32, Math.min(320, Math.round(Number(view.tooltipEmbedHeight ?? nodeGraphMvp.tooltipEmbedHeight) || 46)));
  const controllerDockHeight = typeof normalizeNodeGraphControllerDockHeight === "function"
    ? normalizeNodeGraphControllerDockHeight(view.controllerDockHeight ?? nodeGraphMvp.controllerDockHeight ?? 0)
    : Math.max(0, Math.min(620, Math.round(Number(view.controllerDockHeight ?? nodeGraphMvp.controllerDockHeight) || 0)));
  const moduleButtonsVisible = Boolean(view.moduleButtonsVisible ?? nodeGraphMvp.moduleButtonsVisible);
  const appChromeBarsVisible = view.appChromeBarsVisible === undefined
    ? (nodeGraphMvp.appChromeBarsVisible !== false)
    : Boolean(view.appChromeBarsVisible);
  const transportChromeStuck = Boolean(view.transportChromeStuck ?? nodeGraphMvp.transportChromeStuck);
  const moduleInterfaceControlsVisible = Boolean(view.moduleInterfaceControlsVisible ?? nodeGraphMvp.moduleInterfaceControlsVisible);
  const moduleOscilloscopesVisible = Boolean(view.moduleOscilloscopesVisible ?? nodeGraphMvp.moduleOscilloscopesVisible);
  const moduleSlidersVisible = Boolean(view.moduleSlidersVisible ?? nodeGraphMvp.moduleSlidersVisible);
  const moduleScopeBackgroundColor = normalizeNodeGraphModuleScopeBackgroundColor(
    view.moduleScopeBackgroundColor ?? nodeGraphMvp.moduleScopeBackgroundColor ?? "#000000",
  );
  const globalSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(
    view.globalSmoothingSeconds !== undefined
      ? view.globalSmoothingSeconds
      : view.globalSmoothingSamples !== undefined
        ? nodeGraphSmoothingSecondsFromSamples(view.globalSmoothingSamples)
        : nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
  );
  const globalSmoothingManual = Boolean(
    view.globalSmoothingManual ?? nodeGraphMvp?.live?.autoSmoothingManual ?? false,
  );
  const snakeMouseSmooth = typeof clampNodeGraphSnakeMouseSmooth === "function"
    ? clampNodeGraphSnakeMouseSmooth(view.snakeMouseSmooth ?? nodeGraphMvp?.snakeMouseSmooth ?? 0)
    : (() => {
      const n = Number(view.snakeMouseSmooth ?? nodeGraphMvp?.snakeMouseSmooth ?? 0);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    })();
  const moduleScopeDotCore1Enabled = normalizeNodeGraphModuleScopeDotCoreEnabled(
    view.moduleScopeDotCore1Enabled ?? nodeGraphMvp.moduleScopeDotCore1Enabled ?? false,
  );
  const moduleScopeDotCore1Size = normalizeNodeGraphModuleScopeDotCoreSize(
    view.moduleScopeDotCore1Size ?? view.moduleScopeDotCore ?? nodeGraphMvp.moduleScopeDotCore1Size ?? 2,
    2,
  );
  const moduleScopeDotCore1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(
    view.moduleScopeDotCore1Brightness ?? nodeGraphMvp.moduleScopeDotCore1Brightness ?? 0.23,
    0.23,
  );
  const moduleScopeDotCore1Color = normalizeNodeGraphModuleScopeDotCoreColor(
    view.moduleScopeDotCore1Color ?? nodeGraphMvp.moduleScopeDotCore1Color ?? "#ffffff",
    "#ffffff",
  );
  const moduleScopeFramesPerSecond = normalizeNodeGraphModuleScopeFramesPerSecond(
    view.moduleScopeFramesPerSecond ?? nodeGraphMvp.moduleScopeFramesPerSecond ?? 60,
  );
  const moduleScopePointBudget = normalizeNodeGraphModuleScopePointBudget(
    view.moduleScopePointBudget ?? nodeGraphMvp.moduleScopePointBudget ?? 4096,
  );
  const moduleScopeLineThickness = normalizeNodeGraphModuleScopeLineThickness(
    view.moduleScopeLineThickness ?? nodeGraphMvp.moduleScopeLineThickness ?? 1,
  );
  const moduleScopeDiscontinuitySkipSamples = normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(
    view.moduleScopeDiscontinuitySkipSamples ?? nodeGraphMvp.moduleScopeDiscontinuitySkipSamples ?? 1,
  );
  const macroControlsFaceRaw = {
    ...((view.macroControlsFace && typeof view.macroControlsFace === "object")
      ? view.macroControlsFace
      : (nodeGraphMvp.macroControlsFace && typeof nodeGraphMvp.macroControlsFace === "object"
        ? nodeGraphMvp.macroControlsFace
        : {})),
  };
  // Legacy UIDEV view keys fold into the face SSOT.
  if (macroControlsFaceRaw.arcThickness == null) {
    macroControlsFaceRaw.arcThickness = view.macroKnobArcThickness ?? nodeGraphMvp.macroKnobArcThickness;
  }
  if (macroControlsFaceRaw.arcGapBrightness == null) {
    macroControlsFaceRaw.arcGapBrightness = view.macroKnobArcGapBrightness ?? nodeGraphMvp.macroKnobArcGapBrightness;
  }
  if (macroControlsFaceRaw.sizeScale == null) {
    macroControlsFaceRaw.sizeScale = view.macroKnobSizeScale ?? nodeGraphMvp.macroKnobSizeScale;
  }
  if (macroControlsFaceRaw.labelPosition == null) {
    macroControlsFaceRaw.labelPosition = view.macroKnobLabelPosition ?? nodeGraphMvp.macroKnobLabelPosition;
  }
  if (macroControlsFaceRaw.valuePosition == null) {
    macroControlsFaceRaw.valuePosition = view.macroKnobValuePosition ?? nodeGraphMvp.macroKnobValuePosition;
  }
  const macroControlsFace = typeof normalizeNodeGraphMacroControlsFaceSettings === "function"
    ? normalizeNodeGraphMacroControlsFaceSettings(macroControlsFaceRaw)
    : macroControlsFaceRaw;
  const traceSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
    ? normalizeNodeGraphTraceDisplaySettings(
      typeof migrateNodeGraphLegacyDot2Settings === "function"
        ? migrateNodeGraphLegacyDot2Settings(view.traceSettings ?? nodeGraphMvp.traceSettings, false)
        : (view.traceSettings ?? nodeGraphMvp.traceSettings),
    )
    : (view.traceSettings ?? nodeGraphMvp.traceSettings ?? {});
  const sliderLayout = normalizeNodeGraphSliderLayout(view.sliderLayout ?? nodeGraphMvp.sliderLayout);
  const sliderAmountVisible = Boolean(view.sliderAmountVisible ?? nodeGraphMvp.sliderAmountVisible);
  const sliderPositionVisible = Boolean(
    view.sliderPositionVisible ??
    nodeGraphMvp.sliderPositionVisible
  );
  const moduleCatalogVisibility = normalizeNodeGraphModuleCatalogVisibility(
    view.moduleCatalogVisibility ?? settings.moduleCatalogVisibility ?? nodeGraphMvp.moduleCatalogVisibility,
  );
  const sceneContextWindowSize = typeof normalizeNodeSceneContextWindowSize === "function"
    ? normalizeNodeSceneContextWindowSize(
      view.sceneContextWindowSize ?? nodeGraphMvp.sceneContextWindowSize ?? undefined,
    )
    : (view.sceneContextWindowSize ?? nodeGraphMvp.sceneContextWindowSize ?? null);
  const moduleActionWindowSize = typeof normalizeNodeModuleActionsWindowSize === "function"
    ? normalizeNodeModuleActionsWindowSize(
      view.moduleActionWindowSize ?? nodeGraphMvp.moduleActionWindowSize ?? undefined,
    )
    : (view.moduleActionWindowSize ?? nodeGraphMvp.moduleActionWindowSize ?? null);
  const rawWorkspaceWindowStates = view.workspaceWindowStates ?? view.windowStates ?? null;
  const loadedWorkspaceWindowStates = rawWorkspaceWindowStates ?? nodeGraphMvp.workspaceWindowStates;
  const invalidAllOpenWorkspaceState =
    rawWorkspaceWindowStates &&
    nodeGraphWorkspaceWindowStatesAllOpen(rawWorkspaceWindowStates);
  const workspaceWindowStates = invalidAllOpenWorkspaceState
    ? closeNodeGraphWorkspaceWindowStates(rawWorkspaceWindowStates)
    : normalizeNodeGraphWorkspaceWindowStates(loadedWorkspaceWindowStates);
  const sharedInspectorWindowState = normalizeNodeGraphSharedInspectorWindowState(
    view.sharedInspectorWindowState,
    loadedWorkspaceWindowStates,
  );
  const sharedInspectorActive = normalizeNodeGraphSharedInspectorActive(
    view.sharedInspectorActive ?? nodeGraphMvp.sharedInspectorActive,
  );
  nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(workspaceWindowStates, sharedInspectorActive);
  const workspaceView = normalizeNodeGraphWorkspaceViewState(
    view.workspaceView ?? {
      pan: view.workspacePan ?? nodeGraphMvp.pan,
      zoom: view.workspaceZoom ?? nodeGraphMvp.zoom,
    },
  );
  const moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartmentState(
    view.moduleStoreDepartment ?? nodeGraphMvp.moduleStoreDepartment,
  );
  const savedPatchBankIndex = typeof normalizeNodeGraphSavedPatchBankIndex === "function"
    ? normalizeNodeGraphSavedPatchBankIndex(view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex)
    : Math.max(0, Math.min(127, Math.round(Number(view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex) || 0)));
  const savedPatchGridColumns = typeof normalizeNodeGraphSavedPatchGridColumns === "function"
    ? normalizeNodeGraphSavedPatchGridColumns(view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns)
    : Math.max(1, Math.min(16, Math.round(Number(view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns) || 3)));
  const savedPatchBankName = typeof nodeGraphOneLineText === "function"
    ? nodeGraphOneLineText(view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "")
    : String(view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "").trim();
  const savedPatchFactoryPath = String(
    view.savedPatchFactoryPath ?? nodeGraphMvp.savedPatchFactoryPath ?? "",
  ).trim();
  const savedPatchUserPath = String(
    view.savedPatchUserPath ?? nodeGraphMvp.savedPatchUserPath ?? "",
  ).trim();
  return {
    format: {
      kind: "soemdsp-sandbox-user-ui-settings",
      version: 3,
    },
    controls: Object.fromEntries(
      nodeUiDevSettingControls.map((definition) => [
        definition.key,
        normalizeNodeUiDevControlValue(definition, controls[definition.key]),
      ]),
    ),
    exposedControls: Object.fromEntries(
      nodeUiDevSettingControls.map((definition) => [
        definition.key,
        Boolean(exposedControls[definition.key] ?? definition.exposeDefault),
      ]),
    ),
    nodeColors: normalizedColors,
    moduleDefaultOverrides: normalizedModuleDefaultOverrides,
    view: {
      gridVisible: Boolean(gridVisible),
      gridLightVisible: Boolean(gridLightVisible),
      wireLengthsVisible: Boolean(wireLengthsVisible),
      wireCurve,
      wiresAboveModules,
      keyboardDebugInfoVisible,
      tooltipEmbedded,
      tooltipEmbedHeight,
      moduleButtonsVisible,
      appChromeBarsVisible,
      transportChromeStuck,
      moduleInterfaceControlsVisible,
      moduleOscilloscopesVisible,
      moduleSlidersVisible,
      moduleScopeBackgroundColor,
      globalSmoothingSeconds,
      globalSmoothingManual,
      snakeMouseSmooth,
      moduleScopeDotCore1Enabled,
      moduleScopeDotCore1Size,
      moduleScopeDotCore1Brightness,
      moduleScopeDotCore1Color,
      moduleScopeFramesPerSecond,
      moduleScopePointBudget,
      moduleScopeLineThickness,
      moduleScopeDiscontinuitySkipSamples,
      macroControlsFace,
      traceSettings,
      sliderLayout,
      sliderAmountVisible,
      sliderPositionVisible,
      moduleCatalogVisibility,
    },
  };
}

function readNodeUiDevSettingsFromControls(options = {}) {
  void options;
  const controls = {};
  for (const definition of nodeUiDevSettingControls) {
    const input = document.getElementById(definition.id);
    if (!input) {
      controls[definition.key] = definition.defaultValue;
    } else if (definition.locked) {
      controls[definition.key] = definition.defaultValue;
    } else if (definition.type === "boolean") {
      controls[definition.key] = input.checked;
    } else {
      controls[definition.key] = input.value;
    }
  }
  const exposedControls = Object.fromEntries(
    nodeUiDevSettingControls.map((definition) => [
      definition.key,
      nodeUiDevControlIsExposed(definition.key),
    ]),
  );
  const nodeColors = {};
  for (const input of document.querySelectorAll("[data-node-color-var]")) {
    nodeColors[input.dataset.nodeColorVar] = input.value;
  }
  return normalizeNodeUiDevSettings({
    controls,
    exposedControls,
    nodeColors,
    moduleDefaultOverrides: nodeGraphMvp.moduleDefaultOverrides,
    view: {
      gridVisible: Boolean(nodeGraphMvp.gridVisible),
      gridLightVisible: nodeGraphMvp.gridLightVisible !== false,
      wireLengthsVisible: nodeGraphMvp.wireLengthsVisible !== false,
      wireCurve: typeof normalizeNodeGraphWireCurve === "function"
        ? normalizeNodeGraphWireCurve(nodeGraphMvp.wireCurve)
        : Number(nodeGraphMvp.wireCurve ?? 1),
      wiresAboveModules: Boolean(nodeGraphMvp.wiresAboveModules),
      // Never persist "show debug" — refresh / defaults always hide diagnostics.
      keyboardDebugInfoVisible: false,
      tooltipEmbedded: Boolean(nodeGraphMvp.tooltipEmbedded),
      tooltipEmbedHeight: typeof normalizeNodeGraphTooltipEmbedHeight === "function"
        ? normalizeNodeGraphTooltipEmbedHeight(nodeGraphMvp.tooltipEmbedHeight ?? 46)
        : Math.max(32, Math.min(320, Math.round(Number(nodeGraphMvp.tooltipEmbedHeight) || 46))),
      moduleButtonsVisible: Boolean(nodeGraphMvp.moduleButtonsVisible),
      appChromeBarsVisible: nodeGraphMvp.appChromeBarsVisible !== false,
      transportChromeStuck: Boolean(nodeGraphMvp.transportChromeStuck),
      moduleInterfaceControlsVisible: Boolean(nodeGraphMvp.moduleInterfaceControlsVisible),
      moduleOscilloscopesVisible: Boolean(nodeGraphMvp.moduleOscilloscopesVisible),
      moduleSlidersVisible: Boolean(nodeGraphMvp.moduleSlidersVisible),
      moduleScopeBackgroundColor: normalizeNodeGraphModuleScopeBackgroundColor(nodeGraphMvp.moduleScopeBackgroundColor ?? "#000000"),
      globalSmoothingSeconds: clampNodeGraphAutoSmoothingSeconds(
        nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
      ),
      globalSmoothingManual: Boolean(nodeGraphMvp?.live?.autoSmoothingManual),
      snakeMouseSmooth: typeof clampNodeGraphSnakeMouseSmooth === "function"
        ? clampNodeGraphSnakeMouseSmooth(nodeGraphMvp?.snakeMouseSmooth ?? 0)
        : Math.max(0, Math.min(1, Number(nodeGraphMvp?.snakeMouseSmooth) || 0)),
      moduleScopeDotCore1Enabled: normalizeNodeGraphModuleScopeDotCoreEnabled(nodeGraphMvp.moduleScopeDotCore1Enabled ?? false),
      moduleScopeDotCore1Size: normalizeNodeGraphModuleScopeDotCoreSize(nodeGraphMvp.moduleScopeDotCore1Size ?? 2, 2),
      moduleScopeDotCore1Brightness: normalizeNodeGraphModuleScopeDotCoreBrightness(nodeGraphMvp.moduleScopeDotCore1Brightness ?? 0.23, 0.23),
      moduleScopeDotCore1Color: normalizeNodeGraphModuleScopeDotCoreColor(nodeGraphMvp.moduleScopeDotCore1Color ?? "#ffffff", "#ffffff"),
      moduleScopeFramesPerSecond: normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60),
      moduleScopePointBudget: normalizeNodeGraphModuleScopePointBudget(nodeGraphMvp.moduleScopePointBudget ?? 4096),
      moduleScopeLineThickness: normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness ?? 1),
      moduleScopeDiscontinuitySkipSamples: normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(
        nodeGraphMvp.moduleScopeDiscontinuitySkipSamples ?? 1,
      ),
      macroControlsFace: typeof normalizeNodeGraphMacroControlsFaceSettings === "function"
        ? normalizeNodeGraphMacroControlsFaceSettings(nodeGraphMvp.macroControlsFace)
        : nodeGraphMvp.macroControlsFace,
      sliderLayout: normalizeNodeGraphSliderLayout(nodeGraphMvp.sliderLayout),
      sliderAmountVisible: Boolean(nodeGraphMvp.sliderAmountVisible),
      sliderPositionVisible: Boolean(nodeGraphMvp.sliderPositionVisible),
      moduleCatalogVisibility: nodeGraphModuleCatalogVisibility(),
    },
  });
}

function serializeNodeUiDevSettings(options = {}) {
  return JSON.stringify(readNodeUiDevSettingsFromControls(options), null, 2);
}

function loadNodeUiDevSettingsFromScript(text) {
  const payload = JSON.parse(text);
  const format = payload?.format;
  if (!format || typeof format !== "object") {
    throw new Error("UI settings missing format object");
  }
  if (format.kind !== "soemdsp-sandbox-user-ui-settings") {
    throw new Error("UI settings format kind mismatch");
  }
  if (format.version !== 3) {
    throw new Error("UI settings format version mismatch");
  }
  return normalizeNodeUiDevSettings(payload);
}

function normalizeNodeGraphPersistedViewMode(value = "") {
  const mode = String(value || "").trim();
  if (mode === "script") {
    return "settings";
  }
  if (
    mode === "modular"
    || mode === "modular-windowed"
    || mode === "settings"
    || mode === "code"
    || mode === "mapping"
  ) {
    return mode;
  }
  return "modular";
}

function nodeGraphUserSessionFormat() {
  return {
    kind: nodeGraphUserSessionFormatKind,
    version: nodeGraphUserSessionFormatVersion,
  };
}

function readNodeGraphSessionSelectionFromState() {
  const ids = typeof nodeGraphSelectedNodeIdsInOrder === "function"
    ? nodeGraphSelectedNodeIdsInOrder()
    : (typeof nodeGraphSelectedNodeIds === "function"
      ? [...nodeGraphSelectedNodeIds()]
      : []);
  const live = {
    selectedNodeIds: ids.map((id) => String(id || "").trim()).filter(Boolean),
    lastModuleActionTargetNode: String(nodeGraphMvp?.lastModuleActionTargetNode || "").trim(),
  };
  const pending = nodeGraphMvp?.sessionSelection;
  const liveNodeCount = Array.isArray(nodeGraphMvp?.patch?.nodes) ? nodeGraphMvp.patch.nodes.length : 0;
  // Pending bag is only for hydrate-before-commit. After nodes exist, persist live
  // (including empty selection).
  if (
    liveNodeCount === 0
    && !live.selectedNodeIds.length
    && Array.isArray(pending?.selectedNodeIds)
    && pending.selectedNodeIds.length
  ) {
    return {
      selectedNodeIds: pending.selectedNodeIds.map((id) => String(id || "").trim()).filter(Boolean),
      lastModuleActionTargetNode: String(
        pending.lastModuleActionTargetNode || live.lastModuleActionTargetNode,
      ).trim(),
    };
  }
  return live;
}

function normalizeNodeGraphSessionSelection(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const list = Array.isArray(raw.selectedNodeIds)
    ? raw.selectedNodeIds
    : (raw.selected?.type === "node" && raw.selected.id
      ? [raw.selected.id]
      : (Array.isArray(raw.selected?.ids) ? raw.selected.ids : []));
  const selectedNodeIds = [];
  const seen = new Set();
  for (const id of list) {
    const next = String(id || "").trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    selectedNodeIds.push(next);
  }
  return {
    selectedNodeIds,
    lastModuleActionTargetNode: String(raw.lastModuleActionTargetNode || "").trim(),
  };
}

function applyNodeGraphSessionSelection(snapshot = nodeGraphMvp?.sessionSelection) {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }
  const wanted = snapshot.selectedNodeIds || [];
  const ids = wanted.filter((id) => (
    typeof nodeGraphPatchNode === "function" ? Boolean(nodeGraphPatchNode(id)) : true
  ));
  // Saved IDs exist, but not on this live graph yet (default patch at hydrate).
  // Keep the bag for bootstrap after working-patch commit.
  if (wanted.length && !ids.length) {
    return false;
  }
  nodeGraphMvp._applyingSessionSelection = true;
  try {
    const last = String(snapshot.lastModuleActionTargetNode || "").trim();
    if (last && typeof nodeGraphPatchNode === "function" && nodeGraphPatchNode(last)) {
      nodeGraphMvp.lastModuleActionTargetNode = last;
    }
    if (typeof setNodeGraphNodeSelection === "function") {
      setNodeGraphNodeSelection(ids);
    }
    nodeGraphMvp.sessionSelection = null;
    return ids.length > 0;
  } finally {
    nodeGraphMvp._applyingSessionSelection = false;
  }
}

function nodeGraphPatchSourceForUserSession() {
  const live = nodeGraphMvp?.patch;
  const working = nodeGraphMvp?.workingPatch;
  const liveCount = Array.isArray(live?.nodes) ? live.nodes.length : 0;
  const workingCount = Array.isArray(working?.nodes) ? working.nodes.length : 0;
  // Display Settings (and every other live node bag) live on the graph.
  // Window/pan persist used to serialize a stale workingPatch snapshot, so
  // knobs shown in Display Settings vanished on refresh. Prefer live when it
  // has modules; never serialize an empty live graph over a non-empty autosave.
  if (liveCount === 0 && workingCount > 0) {
    return working;
  }
  return liveCount > 0 ? live : working;
}

function cloneNodeGraphWorkingPatchForSession(patch) {
  const source = nodeGraphPatchSourceForUserSession() || patch;
  if (!source || typeof source !== "object") {
    return null;
  }
  const workingPatchForSession = cloneNodeGraphPatch(source);
  if (typeof nodeGraphPatchSamplesWithoutEmbeddedAudio === "function") {
    workingPatchForSession.samples = nodeGraphPatchSamplesWithoutEmbeddedAudio(
      workingPatchForSession.samples,
    );
  }
  if (typeof normalizeNodeGraphPatchView === "function") {
    workingPatchForSession.view = {
      ...normalizeNodeGraphPatchView(workingPatchForSession.view),
      zoom: typeof nodeGraphZoom === "function" ? nodeGraphZoom() : nodeGraphMvp.zoom,
    };
  }
  return typeof sanitizeNodeUiDevWorkingPatchForStartup === "function"
    ? sanitizeNodeUiDevWorkingPatchForStartup(workingPatchForSession)
    : workingPatchForSession;
}

function loadNodeGraphWorkingPatchFromSessionView(view = {}) {
  if (!view.workingPatch || typeof view.workingPatch !== "object") {
    return null;
  }
  const loaded = typeof loadNodeGraphPatchFromObject === "function"
    ? loadNodeGraphPatchFromObject(view.workingPatch)
    : validateNodeGraphPatch(view.workingPatch);
  const workingPatch = cloneNodeGraphPatch(loaded);
  return typeof sanitizeNodeUiDevWorkingPatchForStartup === "function"
    ? sanitizeNodeUiDevWorkingPatchForStartup(workingPatch)
    : workingPatch;
}

function normalizeNodeGraphUserSession(payload = {}) {
  const view = payload?.view && typeof payload.view === "object"
    ? payload.view
    : (payload && typeof payload === "object" ? payload : {});
  const workingPatch = Object.prototype.hasOwnProperty.call(payload, "workingPatch")
    ? (payload.workingPatch && typeof payload.workingPatch === "object"
      ? loadNodeGraphWorkingPatchFromSessionView({ workingPatch: payload.workingPatch })
      : null)
    : loadNodeGraphWorkingPatchFromSessionView(view);
  const currentSavedPatchFilename = String(
    payload.currentSavedPatchFilename ?? view.currentSavedPatchFilename ?? "",
  ).trim();
  const patchDirtyState = ["saved", "edited", "untouched"].includes(payload.patchDirtyState)
    ? payload.patchDirtyState
    : ["saved", "edited", "untouched"].includes(view.patchDirtyState)
      ? view.patchDirtyState
      : workingPatch
        ? "edited"
        : "untouched";
  const controllerDockHeight = typeof normalizeNodeGraphControllerDockHeight === "function"
    ? normalizeNodeGraphControllerDockHeight(payload.controllerDockHeight ?? view.controllerDockHeight ?? nodeGraphMvp.controllerDockHeight ?? 0)
    : Math.max(0, Math.min(620, Math.round(Number(payload.controllerDockHeight ?? view.controllerDockHeight ?? nodeGraphMvp.controllerDockHeight) || 0)));
  const sceneContextWindowSize = typeof normalizeNodeSceneContextWindowSize === "function"
    ? normalizeNodeSceneContextWindowSize(
      payload.sceneContextWindowSize ?? view.sceneContextWindowSize ?? nodeGraphMvp.sceneContextWindowSize ?? undefined,
    )
    : (payload.sceneContextWindowSize ?? view.sceneContextWindowSize ?? nodeGraphMvp.sceneContextWindowSize ?? null);
  const moduleActionWindowSize = typeof normalizeNodeModuleActionsWindowSize === "function"
    ? normalizeNodeModuleActionsWindowSize(
      payload.moduleActionWindowSize ?? view.moduleActionWindowSize ?? nodeGraphMvp.moduleActionWindowSize ?? undefined,
    )
    : (payload.moduleActionWindowSize ?? view.moduleActionWindowSize ?? nodeGraphMvp.moduleActionWindowSize ?? null);
  const rawWorkspaceWindowStates = payload.workspaceWindowStates
    ?? view.workspaceWindowStates
    ?? view.windowStates
    ?? null;
  const loadedWorkspaceWindowStates = rawWorkspaceWindowStates ?? nodeGraphMvp.workspaceWindowStates;
  const invalidAllOpenWorkspaceState =
    rawWorkspaceWindowStates &&
    nodeGraphWorkspaceWindowStatesAllOpen(rawWorkspaceWindowStates);
  const workspaceWindowStates = invalidAllOpenWorkspaceState
    ? closeNodeGraphWorkspaceWindowStates(rawWorkspaceWindowStates)
    : normalizeNodeGraphWorkspaceWindowStates(loadedWorkspaceWindowStates);
  const sharedInspectorWindowState = normalizeNodeGraphSharedInspectorWindowState(
    payload.sharedInspectorWindowState ?? view.sharedInspectorWindowState,
    loadedWorkspaceWindowStates,
  );
  const sharedInspectorActive = normalizeNodeGraphSharedInspectorActive(
    payload.sharedInspectorActive ?? view.sharedInspectorActive ?? nodeGraphMvp.sharedInspectorActive,
  );
  nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(workspaceWindowStates, sharedInspectorActive);
  const workspaceView = normalizeNodeGraphWorkspaceViewState(
    payload.workspaceView ?? view.workspaceView ?? {
      pan: view.workspacePan ?? nodeGraphMvp.pan,
      zoom: view.workspaceZoom ?? nodeGraphMvp.zoom,
    },
  );
  const moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartmentState(
    payload.moduleStoreDepartment ?? view.moduleStoreDepartment ?? nodeGraphMvp.moduleStoreDepartment,
  );
  const savedPatchBankIndex = typeof normalizeNodeGraphSavedPatchBankIndex === "function"
    ? normalizeNodeGraphSavedPatchBankIndex(payload.savedPatchBankIndex ?? view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex)
    : Math.max(0, Math.min(127, Math.round(Number(payload.savedPatchBankIndex ?? view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex) || 0)));
  const savedPatchGridColumns = typeof normalizeNodeGraphSavedPatchGridColumns === "function"
    ? normalizeNodeGraphSavedPatchGridColumns(payload.savedPatchGridColumns ?? view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns)
    : Math.max(1, Math.min(16, Math.round(Number(payload.savedPatchGridColumns ?? view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns) || 3)));
  const savedPatchBankName = typeof nodeGraphOneLineText === "function"
    ? nodeGraphOneLineText(payload.savedPatchBankName ?? view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "")
    : String(payload.savedPatchBankName ?? view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "").trim();
  const savedPatchFactoryPath = String(
    payload.savedPatchFactoryPath ?? view.savedPatchFactoryPath ?? nodeGraphMvp.savedPatchFactoryPath ?? "",
  ).trim();
  const savedPatchUserPath = String(
    payload.savedPatchUserPath ?? view.savedPatchUserPath ?? nodeGraphMvp.savedPatchUserPath ?? "",
  ).trim();
  return {
    format: nodeGraphUserSessionFormat(),
    workingPatch,
    currentSavedPatchFilename,
    patchDirtyState,
    controllerDockHeight,
    sceneContextWindowSize,
    moduleActionWindowSize,
    workspaceWindowStatesVersion: 1,
    workspaceWindowStates,
    sharedInspectorActive,
    sharedInspectorWindowState,
    workspaceView,
    moduleStoreDepartment,
    savedPatchBankIndex,
    savedPatchBankName,
    savedPatchFactoryPath,
    savedPatchUserPath,
    savedPatchGridColumns,
    filePicker: typeof normalizeNodeGraphFilePickerState === "function"
      ? normalizeNodeGraphFilePickerState(payload.filePicker ?? view.filePicker ?? nodeGraphMvp?.filePicker)
      : (payload.filePicker ?? view.filePicker ?? nodeGraphMvp?.filePicker ?? { startIn: "desktop" }),
    viewMode: normalizeNodeGraphPersistedViewMode(
      payload.viewMode ?? view.viewMode ?? nodeGraphMvp?.viewMode,
    ),
    bookScriptPage: payload.bookScriptPage === "ui-settings" || view.bookScriptPage === "ui-settings"
      ? "ui-settings"
      : "patch",
    uiSettingsPage: (payload.uiSettingsPage ?? view.uiSettingsPage) === "uidev"
      ? "uidev"
      : "settings",
    unifiedWindowPage: typeof nodeGraphUnifiedWindowPageConfig === "function"
      && nodeGraphUnifiedWindowPageConfig(payload.unifiedWindowPage ?? view.unifiedWindowPage)
      ? String(payload.unifiedWindowPage ?? view.unifiedWindowPage)
      : "",
    unifiedWindowPresentation: ["open", "embedLeft", "embedRight", "float", "closed"].includes(
      payload.unifiedWindowPresentation ?? view.unifiedWindowPresentation,
    )
      ? String(payload.unifiedWindowPresentation ?? view.unifiedWindowPresentation)
      : "closed",
    unifiedWindowPosition: (() => {
      const raw = payload.unifiedWindowPosition ?? view.unifiedWindowPosition;
      const left = Math.round(Number(raw?.left));
      const top = Math.round(Number(raw?.top));
      return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
    })(),
    unifiedWindowSize: (() => {
      const raw = payload.unifiedWindowSize ?? view.unifiedWindowSize;
      const width = Math.round(Number(raw?.width));
      const height = Math.round(Number(raw?.height));
      return width >= 24 && height >= 120 ? { width, height } : null;
    })(),
    moduleScopeFramesPerSecond: typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
      ? normalizeNodeGraphModuleScopeFramesPerSecond(
        payload.moduleScopeFramesPerSecond
          ?? view.moduleScopeFramesPerSecond
          ?? nodeGraphMvp.moduleScopeFramesPerSecond
          ?? 60,
      )
      : Math.max(0, Math.min(240, Math.round(Number(
        payload.moduleScopeFramesPerSecond
          ?? view.moduleScopeFramesPerSecond
          ?? nodeGraphMvp.moduleScopeFramesPerSecond
          ?? 60,
      ) || 60))),
    traceSettings: typeof normalizeNodeGraphTraceDisplaySettings === "function"
      ? normalizeNodeGraphTraceDisplaySettings(
        payload.traceSettings ?? view.traceSettings ?? nodeGraphMvp.traceSettings,
      )
      : (payload.traceSettings ?? view.traceSettings ?? nodeGraphMvp.traceSettings ?? null),
    ...normalizeNodeGraphSessionSelection({
      selectedNodeIds: payload.selectedNodeIds ?? view.selectedNodeIds,
      lastModuleActionTargetNode: payload.lastModuleActionTargetNode ?? view.lastModuleActionTargetNode,
      selected: payload.selected ?? view.selected,
    }),
  };
}

function nodeGraphUserSessionFromLegacySettings(settings = {}) {
  const view = settings?.view && typeof settings.view === "object" ? settings.view : {};
  return normalizeNodeGraphUserSession({
    format: nodeGraphUserSessionFormat(),
    workingPatch: view.workingPatch ?? null,
    currentSavedPatchFilename: view.currentSavedPatchFilename,
    patchDirtyState: view.patchDirtyState,
    ...view,
    view,
  });
}

function readNodeGraphUserSessionFromState() {
  const workingPatchForSession = cloneNodeGraphWorkingPatchForSession(nodeGraphPatchSourceForUserSession());
  return {
    format: nodeGraphUserSessionFormat(),
    workingPatch: workingPatchForSession,
    currentSavedPatchFilename: nodeGraphMvp.currentSavedPatchFilename || "",
    patchDirtyState: ["saved", "edited", "untouched"].includes(nodeGraphMvp.patchDirtyState)
      ? nodeGraphMvp.patchDirtyState
      : nodeGraphMvp.workingPatch
        ? "edited"
        : "untouched",
    controllerDockHeight: typeof normalizeNodeGraphControllerDockHeight === "function"
      ? normalizeNodeGraphControllerDockHeight(nodeGraphMvp.controllerDockHeight ?? 0)
      : Math.max(0, Math.min(620, Math.round(Number(nodeGraphMvp.controllerDockHeight) || 0))),
    sceneContextWindowSize: typeof normalizeNodeSceneContextWindowSize === "function"
      ? normalizeNodeSceneContextWindowSize(nodeGraphMvp.sceneContextWindowSize)
      : nodeGraphMvp.sceneContextWindowSize,
    moduleActionWindowSize: typeof normalizeNodeModuleActionsWindowSize === "function"
      ? normalizeNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize)
      : nodeGraphMvp.moduleActionWindowSize,
    workspaceWindowStatesVersion: 1,
    workspaceWindowStates: normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates),
    sharedInspectorActive: normalizeNodeGraphSharedInspectorActive(nodeGraphMvp.sharedInspectorActive),
    sharedInspectorWindowState: normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState),
    workspaceView: normalizeNodeGraphWorkspaceViewState({
      pan: nodeGraphMvp.pan,
      zoom: typeof nodeGraphZoom === "function" ? nodeGraphZoom() : nodeGraphMvp.zoom,
    }),
    moduleStoreDepartment: normalizeNodeGraphModuleStoreDepartmentState(nodeGraphMvp.moduleStoreDepartment),
    savedPatchBankIndex: typeof normalizeNodeGraphSavedPatchBankIndex === "function"
      ? normalizeNodeGraphSavedPatchBankIndex(nodeGraphMvp.savedPatchBankIndex)
      : Math.max(0, Math.min(127, Math.round(Number(nodeGraphMvp.savedPatchBankIndex) || 0))),
    savedPatchBankName: typeof nodeGraphOneLineText === "function"
      ? nodeGraphOneLineText(nodeGraphMvp.savedPatchBankName)
      : String(nodeGraphMvp.savedPatchBankName || "").trim(),
    savedPatchFactoryPath: String(nodeGraphMvp.savedPatchFactoryPath || "").trim(),
    savedPatchUserPath: String(nodeGraphMvp.savedPatchUserPath || "").trim(),
    savedPatchGridColumns: typeof normalizeNodeGraphSavedPatchGridColumns === "function"
      ? normalizeNodeGraphSavedPatchGridColumns(nodeGraphMvp.savedPatchGridColumns)
      : Math.max(1, Math.min(16, Math.round(Number(nodeGraphMvp.savedPatchGridColumns) || 3))),
    filePicker: typeof normalizeNodeGraphFilePickerState === "function"
      ? normalizeNodeGraphFilePickerState(nodeGraphMvp.filePicker)
      : nodeGraphMvp.filePicker,
    viewMode: normalizeNodeGraphPersistedViewMode(nodeGraphMvp.viewMode),
    bookScriptPage: nodeGraphMvp.bookScriptPage === "ui-settings" ? "ui-settings" : "patch",
    uiSettingsPage: nodeGraphMvp.uiSettingsPage === "uidev" ? "uidev" : "settings",
    unifiedWindowPage: String(nodeGraphMvp.unifiedWindowPage || ""),
    unifiedWindowPresentation: String(nodeGraphMvp.unifiedWindowPresentation || "closed"),
    unifiedWindowPosition: nodeGraphMvp.unifiedWindowPosition
      && Number.isFinite(Number(nodeGraphMvp.unifiedWindowPosition.left))
      ? {
        left: Math.round(Number(nodeGraphMvp.unifiedWindowPosition.left)),
        top: Math.round(Number(nodeGraphMvp.unifiedWindowPosition.top)),
      }
      : null,
    unifiedWindowSize: nodeGraphMvp.unifiedWindowSize?.width >= 24
      && nodeGraphMvp.unifiedWindowSize?.height >= 120
      ? {
        width: Math.round(Number(nodeGraphMvp.unifiedWindowSize.width)),
        height: Math.round(Number(nodeGraphMvp.unifiedWindowSize.height)),
      }
      : null,
    moduleScopeFramesPerSecond: typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
      ? normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60)
      : Math.max(0, Math.min(240, Math.round(Number(nodeGraphMvp.moduleScopeFramesPerSecond) || 60))),
    traceSettings: typeof normalizeNodeGraphTraceDisplaySettings === "function"
      ? normalizeNodeGraphTraceDisplaySettings(nodeGraphMvp.traceSettings)
      : nodeGraphMvp.traceSettings,
    ...readNodeGraphSessionSelectionFromState(),
  };
}

function serializeNodeGraphUserSession() {
  return JSON.stringify(readNodeGraphUserSessionFromState());
}

function loadNodeGraphUserSessionFromScript(text) {
  const payload = JSON.parse(text);
  const format = payload?.format;
  if (!format || typeof format !== "object") {
    throw new Error("session missing format object");
  }
  if (format.kind === "soemdsp-sandbox-user-ui-settings") {
    return nodeGraphUserSessionFromLegacySettings(payload);
  }
  if (format.kind !== nodeGraphUserSessionFormatKind) {
    throw new Error("session format kind mismatch");
  }
  if (format.version !== nodeGraphUserSessionFormatVersion) {
    throw new Error("session format version mismatch");
  }
  return normalizeNodeGraphUserSession(payload);
}

function applyNodeGraphUserSession(session, options = {}) {
  const normalized = session?.format?.kind === nodeGraphUserSessionFormatKind
    ? normalizeNodeGraphUserSession(session)
    : normalizeNodeGraphUserSession(session || {});
  nodeGraphMvp.controllerDockHeight = normalized.controllerDockHeight;
  if (typeof applyNodeGraphControllerDockHeight === "function") {
    applyNodeGraphControllerDockHeight(nodeGraphMvp.controllerDockHeight);
  }
  nodeGraphMvp.sceneContextWindowSize = normalized.sceneContextWindowSize;
  if (typeof applyNodeSceneContextWindowSize === "function") {
    applyNodeSceneContextWindowSize(nodeGraphMvp.sceneContextWindowSize);
  }
  nodeGraphMvp.moduleActionWindowSize = normalized.moduleActionWindowSize;
  if (typeof applyNodeModuleActionsWindowSize === "function") {
    applyNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize);
  }
  nodeGraphMvp.workspaceWindowStates = normalizeNodeGraphWorkspaceWindowStates(
    normalized.workspaceWindowStates,
  );
  nodeGraphMvp.sharedInspectorActive = normalizeNodeGraphSharedInspectorActive(normalized.sharedInspectorActive);
  nodeGraphMvp.sharedInspectorWindowState = normalizeNodeGraphSharedInspectorWindowState(
    normalized.sharedInspectorWindowState,
    normalized.workspaceWindowStates,
  );
  nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(
    nodeGraphMvp.workspaceWindowStates,
    nodeGraphMvp.sharedInspectorActive,
  );
  const workspaceView = normalizeNodeGraphWorkspaceViewState(normalized.workspaceView);
  nodeGraphMvp.pan = { ...workspaceView.pan };
  nodeGraphMvp.zoom = workspaceView.zoom;
  nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartmentState(
    normalized.moduleStoreDepartment,
  );
  // The saved page IS the last clicked one (only clicks persist a page), so it
  // seeds the anchor the module browser returns to -- see
  // openNodeGraphModuleShop.
  nodeGraphMvp.moduleStoreDepartmentAnchor = nodeGraphMvp.moduleStoreDepartment;
  nodeGraphMvp.savedPatchBankIndex = typeof normalizeNodeGraphSavedPatchBankIndex === "function"
    ? normalizeNodeGraphSavedPatchBankIndex(normalized.savedPatchBankIndex)
    : Math.max(0, Math.min(127, Math.round(Number(normalized.savedPatchBankIndex) || 0)));
  nodeGraphMvp.savedPatchBankName = typeof nodeGraphOneLineText === "function"
    ? nodeGraphOneLineText(normalized.savedPatchBankName)
    : String(normalized.savedPatchBankName || "").trim();
  nodeGraphMvp.savedPatchFactoryPath = String(normalized.savedPatchFactoryPath || "").trim();
  nodeGraphMvp.savedPatchUserPath = String(normalized.savedPatchUserPath || "").trim();
  nodeGraphMvp.savedPatchGridColumns = typeof normalizeNodeGraphSavedPatchGridColumns === "function"
    ? normalizeNodeGraphSavedPatchGridColumns(normalized.savedPatchGridColumns)
    : Math.max(1, Math.min(16, Math.round(Number(normalized.savedPatchGridColumns) || 3)));
  if (normalized.workingPatch) {
    nodeGraphMvp.workingPatch = cloneNodeGraphPatch(normalized.workingPatch);
  } else if (options.replaceWorkingPatch) {
    nodeGraphMvp.workingPatch = null;
  }
  nodeGraphMvp.filePicker = typeof normalizeNodeGraphFilePickerState === "function"
    ? normalizeNodeGraphFilePickerState(normalized.filePicker)
    : (normalized.filePicker || { startIn: "desktop" });
  nodeGraphMvp.currentSavedPatchFilename = String(normalized.currentSavedPatchFilename || "");
  nodeGraphMvp.patchDirtyState = ["saved", "edited", "untouched"].includes(normalized.patchDirtyState)
    ? normalized.patchDirtyState
    : nodeGraphMvp.workingPatch
      ? "edited"
      : "untouched";
  nodeGraphMvp.viewMode = normalizeNodeGraphPersistedViewMode(normalized.viewMode);
  nodeGraphMvp.bookScriptPage = normalized.bookScriptPage === "ui-settings" ? "ui-settings" : "patch";
  nodeGraphMvp.uiSettingsPage = normalized.uiSettingsPage === "uidev" ? "uidev" : "settings";
  if (typeof syncNodeUserUiSettingsPageChrome === "function") {
    syncNodeUserUiSettingsPageChrome();
  }
  nodeGraphMvp.unifiedWindowPage = String(normalized.unifiedWindowPage || "");
  nodeGraphMvp.unifiedWindowPresentation = String(normalized.unifiedWindowPresentation || "closed");
  nodeGraphMvp.unifiedWindowPosition = normalized.unifiedWindowPosition || null;
  nodeGraphMvp.unifiedWindowSize = normalized.unifiedWindowSize || null;
  if (normalized.moduleScopeFramesPerSecond != null) {
    nodeGraphMvp.moduleScopeFramesPerSecond = typeof normalizeNodeGraphModuleScopeFramesPerSecond === "function"
      ? normalizeNodeGraphModuleScopeFramesPerSecond(normalized.moduleScopeFramesPerSecond)
      : Math.max(0, Math.min(240, Math.round(Number(normalized.moduleScopeFramesPerSecond) || 60)));
    if (typeof renderNodeGraphModuleScopeBrightnessControl === "function") {
      renderNodeGraphModuleScopeBrightnessControl();
    }
  }
  if (normalized.traceSettings != null) {
    nodeGraphMvp.traceSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
      ? normalizeNodeGraphTraceDisplaySettings(normalized.traceSettings)
      : normalized.traceSettings;
  }
  nodeGraphMvp.sessionSelection = {
    selectedNodeIds: Array.isArray(normalized.selectedNodeIds) ? normalized.selectedNodeIds : [],
    lastModuleActionTargetNode: String(normalized.lastModuleActionTargetNode || "").trim(),
  };
  // Do not apply here: live patch is still the default graph. Bootstrap
  // restores selection after workingPatch commit.
  // Window restore after patch commit (bootstrap). Applying here while
  // live patch is empty remembers Display Settings targetNode: "".
  const liveNodeCount = Array.isArray(nodeGraphMvp.patch?.nodes) ? nodeGraphMvp.patch.nodes.length : 0;
  if (liveNodeCount > 0 && typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
  if (typeof applyNodeGraphZoom === "function") {
    applyNodeGraphZoom();
  }
  if (typeof applyNodeGraphPan === "function") {
    applyNodeGraphPan();
  }
}

function saveNodeGraphUserSessionLocal(text) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  if (!nodeUiDevSettingsHydrated) {
    console.warn("[soemdsp] Refusing to persist session before UI settings have been loaded.");
    return false;
  }
  try {
    window.localStorage.setItem(nodeGraphUserSessionStorageKey, text);
    return true;
  } catch (error) {
    console.warn(
      "[soemdsp] Failed to write session to localStorage; keeping previous save.",
      error?.name || error,
      typeof text === "string" ? `(payload ~${Math.round(text.length / 1024)} KB)` : "",
    );
    return false;
  }
}

function persistNodeGraphUserSession() {
  return persistSession({ reason: "session" });
}

/**
 * One persist door. `reason` picks the blob so callers do not dual-write:
 *   session (default) — seats, selection, FPS, global traceSettings, workingPatch field
 *   workingPatch — clone live graph onto workingPatch, then session
 *   uiSettings — chrome look only (not global traceSettings)
 */
function persistSession(options = {}) {
  const reason = String(options.reason || "session");
  if (reason === "uiSettings") {
    if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
      scheduleNodeUiDevSettingsAutosave();
    }
    return true;
  }
  if (reason === "workingPatch") {
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      return saveNodeGraphWorkingPatchToUserSettings(options);
    }
    return false;
  }
  if (typeof serializeNodeGraphUserSession !== "function") {
    return false;
  }
  return saveNodeGraphUserSessionLocal(serializeNodeGraphUserSession());
}

function loadNodeGraphUserSessionLocal() {
  try {
    const sessionText = window.localStorage.getItem(nodeGraphUserSessionStorageKey);
    if (sessionText) {
      return loadNodeGraphUserSessionFromScript(sessionText);
    }
    const settingsText = window.localStorage.getItem(nodeUiDevDefaultSettingsStorageKey);
    if (!settingsText) {
      return null;
    }
    const parsed = JSON.parse(settingsText);
    if (parsed?.format?.kind !== "soemdsp-sandbox-user-ui-settings") {
      return null;
    }
    return nodeGraphUserSessionFromLegacySettings(parsed);
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.startsWith("failed to load patch at:")) {
      console.error(message);
      try {
        if (typeof window !== "undefined" && window.SE?.ERROR) {
          window.SE.ERROR(message, "patch-load");
        }
      } catch (_error) {
        // Debug console optional.
      }
      throw (error instanceof Error ? error : new Error(message));
    }
    console.error("[soemdsp] Failed to load local session:", message);
    return null;
  }
}

function applyNodeUiDevSettings(settings) {
  const normalized = normalizeNodeUiDevSettings(settings);
  for (const definition of nodeUiDevSettingControls) {
    const input = document.getElementById(definition.id);
    if (!input) {
      continue;
    }
    const value = normalized.controls[definition.key];
    if (definition.type === "boolean") {
      input.checked = Boolean(value);
    } else {
      input.value = String(value);
    }
    input.disabled = Boolean(definition.locked);
    const exposeInput = document.getElementById(nodeUiDevExposeCheckboxId(definition.key));
    if (exposeInput) {
      exposeInput.checked = Boolean(normalized.exposedControls[definition.key]);
    }
  }
  for (const input of document.querySelectorAll("[data-node-color-var]")) {
    const color = normalized.nodeColors[input.dataset.nodeColorVar];
    if (color) {
      input.value = color;
    }
  }
  nodeGraphMvp.moduleDefaultOverrides = normalized.moduleDefaultOverrides;
  nodeGraphMvp.gridVisible = Boolean(normalized.view.gridVisible);
  nodeGraphMvp.gridLightVisible = normalized.view.gridLightVisible !== false;
  nodeGraphMvp.wireLengthsVisible = normalized.view.wireLengthsVisible !== false;
  nodeGraphMvp.wireCurve = typeof normalizeNodeGraphWireCurve === "function"
    ? normalizeNodeGraphWireCurve(normalized.view.wireCurve)
    : Number(normalized.view.wireCurve ?? 1);
  if (typeof syncNodeGraphWireCurveControl === "function") {
    syncNodeGraphWireCurveControl();
  }
  nodeGraphMvp.wiresAboveModules = Boolean(normalized.view.wiresAboveModules);
  // Force-hide debug on every UI-settings apply / page load (not a saved
  // preference). Same for debug and release builds — Clear Startup / Save /
  // cold boot must never leave developer chrome visible by default.
  if (typeof hideNodeGraphDebugChrome === "function") {
    hideNodeGraphDebugChrome();
  } else {
    nodeGraphMvp.keyboardDebugInfoVisible = false;
  }
  nodeGraphMvp.tooltipEmbedded = normalized.view.tooltipEmbedded !== false;
  nodeGraphMvp.tooltipEmbedHeight = typeof normalizeNodeGraphTooltipEmbedHeight === "function"
    ? normalizeNodeGraphTooltipEmbedHeight(normalized.view.tooltipEmbedHeight ?? 46)
    : Math.max(32, Math.min(320, Math.round(Number(normalized.view.tooltipEmbedHeight) || 46)));
  if (typeof applyNodeGraphTooltipEmbed === "function") {
    applyNodeGraphTooltipEmbed({ shown: nodeGraphMvp.tooltipEmbedded, persist: false });
  } else if (typeof applyNodeGraphTooltipEmbedHeight === "function") {
    applyNodeGraphTooltipEmbedHeight(nodeGraphMvp.tooltipEmbedHeight);
  }
  nodeGraphMvp.moduleButtonsVisible = Boolean(normalized.view.moduleButtonsVisible);
  nodeGraphMvp.appChromeBarsVisible = normalized.view.appChromeBarsVisible === undefined
    ? true
    : Boolean(normalized.view.appChromeBarsVisible);
  if (typeof setNodeGraphAppChromeBarsVisible === "function") {
    setNodeGraphAppChromeBarsVisible(nodeGraphMvp.appChromeBarsVisible, { help: false });
  }
  nodeGraphMvp.transportChromeStuck = Boolean(normalized.view.transportChromeStuck);
  if (typeof setNodeGraphTransportChromeStuck === "function") {
    setNodeGraphTransportChromeStuck(nodeGraphMvp.transportChromeStuck, { help: false });
  }
  nodeGraphMvp.moduleInterfaceControlsVisible = Boolean(normalized.view.moduleInterfaceControlsVisible);
  nodeGraphMvp.moduleOscilloscopesVisible = Boolean(normalized.view.moduleOscilloscopesVisible);
  nodeGraphMvp.moduleSlidersVisible = Boolean(normalized.view.moduleSlidersVisible);
  nodeGraphMvp.moduleScopeBackgroundColor = normalizeNodeGraphModuleScopeBackgroundColor(normalized.view.moduleScopeBackgroundColor);
  nodeGraphMvp.live.autoSmoothingSeconds = clampNodeGraphAutoSmoothingSeconds(
    normalized.view.globalSmoothingSeconds !== undefined
      ? normalized.view.globalSmoothingSeconds
      : nodeGraphSmoothingSecondsFromSamples(normalized.view.globalSmoothingSamples),
  );
  nodeGraphMvp.live.autoSmoothingManual = Boolean(normalized.view.globalSmoothingManual);
  if (typeof syncNodeGraphGlobalSmoothingControl === "function") {
    syncNodeGraphGlobalSmoothingControl({ force: true });
  }
  nodeGraphMvp.snakeMouseSmooth = typeof clampNodeGraphSnakeMouseSmooth === "function"
    ? clampNodeGraphSnakeMouseSmooth(normalized.view.snakeMouseSmooth ?? 0)
    : Math.max(0, Math.min(1, Number(normalized.view.snakeMouseSmooth) || 0));
  if (typeof syncNodeGraphSnakeMouseSmoothControl === "function") {
    syncNodeGraphSnakeMouseSmoothControl();
  }
  nodeGraphMvp.moduleScopeDotCore1Enabled = normalizeNodeGraphModuleScopeDotCoreEnabled(normalized.view.moduleScopeDotCore1Enabled);
  nodeGraphMvp.moduleScopeDotCore1Size = normalizeNodeGraphModuleScopeDotCoreSize(normalized.view.moduleScopeDotCore1Size, 2);
  nodeGraphMvp.moduleScopeDotCore1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(normalized.view.moduleScopeDotCore1Brightness, 0.23);
  nodeGraphMvp.moduleScopeDotCore1Color = normalizeNodeGraphModuleScopeDotCoreColor(normalized.view.moduleScopeDotCore1Color, "#ffffff");
  nodeGraphMvp.moduleScopeFramesPerSecond = normalizeNodeGraphModuleScopeFramesPerSecond(normalized.view.moduleScopeFramesPerSecond);
  nodeGraphMvp.moduleScopePointBudget = normalizeNodeGraphModuleScopePointBudget(normalized.view.moduleScopePointBudget);
  nodeGraphMvp.moduleScopeLineThickness = normalizeNodeGraphModuleScopeLineThickness(normalized.view.moduleScopeLineThickness);
  nodeGraphMvp.moduleScopeDiscontinuitySkipSamples = normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(
    normalized.view.moduleScopeDiscontinuitySkipSamples,
  );
  if (typeof normalizeNodeGraphMacroControlsFaceSettings === "function") {
    nodeGraphMvp.macroControlsFace = normalizeNodeGraphMacroControlsFaceSettings(normalized.view.macroControlsFace);
    if (typeof applyNodeGraphMacroControlsFaceSettings === "function") {
      applyNodeGraphMacroControlsFaceSettings();
    }
  }
  nodeGraphMvp.traceSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
    ? normalizeNodeGraphTraceDisplaySettings(normalized.view.traceSettings)
    : normalized.view.traceSettings;
  nodeGraphMvp.sliderLayout = normalizeNodeGraphSliderLayout(normalized.view.sliderLayout);
  nodeGraphMvp.sliderAmountVisible = Boolean(normalized.view.sliderAmountVisible);
  nodeGraphMvp.sliderPositionVisible = Boolean(normalized.view.sliderPositionVisible);
  if (typeof syncNodeSliderHiddenMouseClass === "function") {
    syncNodeSliderHiddenMouseClass();
  }
  applyNodeGraphModuleCatalogVisibility(normalized.view.moduleCatalogVisibility);
  renderNodeGraphGridToggle();
  if (typeof renderNodeGraphGridLightToggle === "function") {
    renderNodeGraphGridLightToggle();
  }
  if (typeof renderNodeGraphWireLengthsToggle === "function") {
    renderNodeGraphWireLengthsToggle();
  }
  if (typeof renderNodeGraphWiresAboveModulesToggle === "function") {
    renderNodeGraphWiresAboveModulesToggle();
  }
  // Debug hide already applied above; re-render so body classes + buttons match.
  if (typeof hideNodeGraphDebugChrome === "function") {
    hideNodeGraphDebugChrome();
  } else if (typeof renderNodeGraphKeyboardDebugToggle === "function") {
    renderNodeGraphKeyboardDebugToggle();
  }
  renderNodeGraphModuleVisibilityToggles();
  renderNodeGraphModuleScopeBrightnessControl();
  renderNodeGraphSliderVisibilityToggles();
  renderNodeGraphSliderLayout();
  syncNodeUiDevSettingsHeaderControls();
  if (!document.activeElement?.dataset?.nodeUiDevMirror) {
    renderNodeUserUiSettingsControls();
  }
  if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
    scheduleNodeUiDevSettingsAutosave();
  }
  if (typeof syncNodeUiDevSettingsScriptView === "function") {
    syncNodeUiDevSettingsScriptView();
  }
}

function loadNodeUiDevLocalDefaultSettings() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeUiDevDefaultSettingsStorageKey);
    return text ? loadNodeUiDevSettingsFromScript(text) : null;
  } catch (error) {
    const message = String(error?.message || error || "");
    // Hard patch-load failures must not be swallowed into "no settings".
    if (message.startsWith("failed to load patch at:")) {
      console.error(message);
      try {
        if (typeof window !== "undefined" && window.SE?.ERROR) {
          window.SE.ERROR(message, "patch-load");
        }
      } catch (_error) {
        // Debug console optional.
      }
      throw (error instanceof Error ? error : new Error(message));
    }
    console.error("[soemdsp] Failed to load local UI settings:", message);
    return null;
  }
}

function sanitizeNodeUiDevWorkingPatchForStartup(patch) {
  if (!patch || typeof patch !== "object") {
    return null;
  }
  if (Array.isArray(patch.nodes)) {
    patch = {
      ...patch,
      nodes: patch.nodes.filter((node) => !(typeof nodeGraphRetiredNodeTypes !== "undefined" && nodeGraphRetiredNodeTypes.has(node?.type))),
    };
  }
  // Do NOT replace the entire working patch when samples are missing.
  // That used to run at settings-load time (often before the resource
  // catalog was ready) and wipe modules → default empty-ish patch.
  // Missing samples are handled later by the missing-sample dialog.
  return patch;
}

function loadNodeUiDevBundledDefaultSettings() {
  let bundled = window.nodeUiDevBundledDefaultSettings;
  if (!bundled) {
    try {
      bundled = JSON.parse(document.documentElement.dataset.nodeUiDevBundledDefaultSettings || "null");
    } catch {
      bundled = null;
    }
  }
  if (!bundled) {
    return null;
  }
  try {
    return loadNodeUiDevSettingsFromScript(JSON.stringify(bundled));
  } catch {
    return null;
  }
}

let nodeUiDevSettingsAutosaveTimer = 0;

function scheduleNodeUiDevSettingsAutosave() {
  if (!nodeUiDevSettingsHydrated) {
    return;
  }
  if (nodeUiDevSettingsAutosaveTimer) {
    window.clearTimeout(nodeUiDevSettingsAutosaveTimer);
  }
  nodeUiDevSettingsAutosaveTimer = window.setTimeout(() => {
    nodeUiDevSettingsAutosaveTimer = 0;
    if (typeof serializeNodeUiDevSettings === "function") {
      saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
    }
    if (typeof syncNodeUiDevSettingsScriptView === "function") {
      syncNodeUiDevSettingsScriptView();
    }
  }, 250);
}

function saveNodeUiDevLocalDefaultSettings(text) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  if (!nodeUiDevSettingsHydrated) {
    console.warn("[soemdsp] Refusing to persist UI settings before they have been loaded.");
    return false;
  }
  try {
    window.localStorage.setItem(nodeUiDevDefaultSettingsStorageKey, text);
    return true;
  } catch (error) {
    // NEVER remove the previous key on failure. QuotaExceeded used to delete
    // the last good startup blob, so the next refresh fell back to the bundled
    // default (empty workingPatch) — intermittent "I lost all my modules".
    console.warn(
      "[soemdsp] Failed to write startup settings to localStorage; keeping previous save.",
      error?.name || error,
      typeof text === "string" ? `(payload ~${Math.round(text.length / 1024)} KB)` : "",
    );
    return false;
  }
}

function clearNodeUserStartupLocalStorage() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return 0;
  }
  const prefixes = [
    "soemdsp-sandbox",
    "soemdsp-sandbox-",
    "soemdsp-sandbox.",
  ];
  const exactKeys = [
    "signalPlotSettings",
  ];
  let removed = 0;
  try {
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (
        key &&
        (prefixes.some((prefix) => key.startsWith(prefix)) || exactKeys.includes(key))
      ) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
      removed += 1;
    }
  } catch {
    // Storage can be blocked in some browser contexts. The bundled preset still
    // remains the startup fallback.
  }
  return removed;
}

// Clear Startup means "come back up as a brand new user", so every UI Dev
// control returns to the defaultValue declared in nodeUiDevSettingControls
// (and every expose checkbox to its exposeDefault). This is the general fix
// for the trap documented in clearNodeUserStartupRuntimeState below: because
// clearNodeUserStartupState re-serializes the LIVE DOM as the new startup
// preset, any control left holding a user-tweaked value would silently become
// the new default. Doing it definition-driven means new settings are covered
// automatically instead of needing another hand-written reset each time.
function resetNodeUiDevControlsToDeclaredDefaults() {
  if (typeof nodeUiDevSettingControls === "undefined") {
    return;
  }
  for (const definition of nodeUiDevSettingControls) {
    const input = document.getElementById(definition.id);
    if (input) {
      if (definition.type === "boolean") {
        input.checked = Boolean(definition.defaultValue);
      } else {
        input.value = String(definition.defaultValue);
      }
    }
    const exposeInput = typeof nodeUiDevExposeCheckboxId === "function"
      ? document.getElementById(nodeUiDevExposeCheckboxId(definition.key))
      : null;
    if (exposeInput) {
      exposeInput.checked = Boolean(definition.exposeDefault);
    }
  }
  // Push the restored values back out to the CSS custom properties they drive.
  if (typeof syncNodeUiDevSliderFillColorControls === "function") {
    syncNodeUiDevSliderFillColorControls();
  }
  if (typeof syncNodeUiDevSnakeSelectColor === "function") {
    syncNodeUiDevSnakeSelectColor();
  }
  if (typeof syncNodeUiDevModuleLightGridControls === "function") {
    syncNodeUiDevModuleLightGridControls();
  }
  if (typeof syncNodeUiDevModuleIdleStroke === "function") {
    syncNodeUiDevModuleIdleStroke();
  }
  if (typeof syncNodeUiDevModuleRoundness === "function") {
    syncNodeUiDevModuleRoundness();
  }
  if (typeof syncNodeUiDevPortSize === "function") {
    syncNodeUiDevPortSize();
  }
  if (typeof syncNodeUiDevIoSectionPadding === "function") {
    syncNodeUiDevIoSectionPadding();
  }
  if (typeof syncNodeUiDevPortBrightness === "function") {
    syncNodeUiDevPortBrightness();
  }
  if (typeof syncNodeUiDevGridDivisionMultiply === "function") {
    syncNodeUiDevGridDivisionMultiply();
  }
  if (typeof syncNodeUiDevSettingsHeaderControls === "function") {
    syncNodeUiDevSettingsHeaderControls();
  }
}

function clearNodeUserStartupRuntimeState() {
  resetNodeUiDevControlsToDeclaredDefaults();
  if (typeof cloneNodeGraphPatch === "function" && typeof nodeGraphDefaultPatch !== "undefined") {
    nodeGraphMvp.patch = cloneNodeGraphPatch(nodeGraphDefaultPatch);
  }
  nodeGraphMvp.workingPatch = null;
  nodeGraphMvp.currentSavedPatchFilename = "";
  nodeGraphMvp.patchDirtyState = "untouched";
  nodeGraphMvp.viewMode = "modular";
  nodeGraphMvp.bookScriptPage = "patch";
  nodeGraphMvp.workspaceWindowStates = closeNodeGraphWorkspaceWindowStates({});
  nodeGraphMvp.sharedInspectorActive = "";
  nodeGraphMvp.sharedInspectorWindowState = {};
  nodeGraphMvp.pan = { x: 0, y: 0 };
  nodeGraphMvp.zoom = 1;
  nodeGraphMvp.moduleStoreDepartment = "";
  nodeGraphMvp.moduleStoreDepartmentAnchor = "";
  nodeGraphMvp.moduleScopeSettings = {};
  // These view toggles are read straight from nodeGraphMvp when the cleared
  // state gets re-serialized just below in clearNodeUserStartupState --
  // without resetting them here, whatever the user had changed stayed put
  // and got baked right back into the "cleared" default, making Clear
  // Startup look like it did nothing for visibility. App policy: module
  // header buttons stay hidden by default; control surfaces, displays, and
  // sliders come back on.
  nodeGraphMvp.moduleButtonsVisible = false;
  nodeGraphMvp.appChromeBarsVisible = true;
  nodeGraphMvp.transportChromeStuck = false;
  if (typeof setNodeGraphTransportChromeStuck === "function") {
    setNodeGraphTransportChromeStuck(false, { help: false });
  }
  if (typeof setNodeGraphAppChromeBarsVisible === "function") {
    setNodeGraphAppChromeBarsVisible(true, { help: false });
  }
  nodeGraphMvp.moduleInterfaceControlsVisible = true;
  nodeGraphMvp.moduleOscilloscopesVisible = true;
  nodeGraphMvp.moduleSlidersVisible = true;
  // Grid and the slider amount fill are in the same "visible unless
  // explicitly hidden" family.
  nodeGraphMvp.gridVisible = true;
  nodeGraphMvp.gridLightVisible = true;
  nodeGraphMvp.wireLengthsVisible = true;
  nodeGraphMvp.wireCurve = 1;
  if (typeof syncNodeGraphWireCurveControl === "function") {
    syncNodeGraphWireCurveControl();
  }
  nodeGraphMvp.snakeMouseSmooth = 0;
  if (typeof syncNodeGraphSnakeMouseSmoothControl === "function") {
    syncNodeGraphSnakeMouseSmoothControl();
  }
  nodeGraphMvp.sliderAmountVisible = false;
  nodeGraphMvp.wiresAboveModules = false;
  // Clear Startup / reset view: never bake "Show Debug" into the next load.
  // Force off before re-serializing settings as the new startup default.
  if (typeof hideNodeGraphDebugChrome === "function") {
    hideNodeGraphDebugChrome();
  } else {
    nodeGraphMvp.keyboardDebugInfoVisible = false;
    if (typeof renderNodeGraphKeyboardDebugToggle === "function") {
      renderNodeGraphKeyboardDebugToggle();
    }
  }
  if (typeof renderNodeGraphGridToggle === "function") {
    renderNodeGraphGridToggle();
  }
  if (typeof renderNodeGraphGridLightToggle === "function") {
    renderNodeGraphGridLightToggle();
  }
  if (typeof renderNodeGraphWireLengthsToggle === "function") {
    renderNodeGraphWireLengthsToggle();
  }
  if (typeof renderNodeGraphWiresAboveModulesToggle === "function") {
    renderNodeGraphWiresAboveModulesToggle();
  }
  if (typeof renderNodeGraphSliderVisibilityToggles === "function") {
    renderNodeGraphSliderVisibilityToggles();
  }
  // Same trap as the visibility toggles above: the screen ("modular") shader
  // lives outside nodeGraphMvp, and clearNodeUserStartupState re-serializes
  // the live DOM controls as the new default right after this runs -- so if
  // the user had it on it got baked straight back into the cleared startup.
  // persist:false because the localStorage key was just deleted and we do not
  // want to immediately write it back.
  if (typeof setNodeGraphRoomDim === "function") {
    setNodeGraphRoomDim(0, { persist: false });
  }
  if (typeof renderNodeGraphModuleVisibilityToggles === "function") {
    renderNodeGraphModuleVisibilityToggles();
  }
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync();
  }
  if (typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
}

function clearNodeUserStartupState() {
  const removed = clearNodeUserStartupLocalStorage();
  clearNodeUserStartupRuntimeState();
  const text = typeof serializeNodeUiDevSettings === "function"
    ? serializeNodeUiDevSettings()
    : "";
  if (
    text &&
    typeof saveNodeUiDevLocalDefaultSettings === "function"
  ) {
    saveNodeUiDevLocalDefaultSettings(text);
  }
  if (text && typeof postNodeUiDevSettingsPreset === "function") {
    postNodeUiDevSettingsPreset(text).catch(() => {});
  }
  window.setTimeout(() => {
    window.location.reload();
  }, 120);
}

let nodeGraphWorkspaceViewAutosaveTimer = 0;

function saveNodeGraphWorkspaceViewToUserSettings(options = {}) {
  void options;
  // Ambient autosave (pan/zoom/smoothing-drag/etc.) only persists to this
  // browser's session blob so a refresh doesn't lose progress. It must never
  // silently overwrite the shipped default UI settings preset on the server.
  return persistSession({ reason: "session" });
}

function finishNodeUiDevSettingsHydration() {
  const storedCatalogVisibility = loadNodeGraphModuleCatalogVisibilityLocal();
  if (storedCatalogVisibility) {
    applyNodeGraphModuleCatalogVisibility(storedCatalogVisibility);
  }
  loadNodeGraphModuleStoreStateLocal();
  loadNodeGraphModuleScopeSettingsLocal();
  nodeUiDevSettingsHydrated = true;
}

function reportNodeGraphSessionLoadFault(error) {
  const message = String(error?.message || error || "failed to load patch");
  document.documentElement.dataset.nodeUiDevSettingsSource = "patch-load-failed";
  let script = String(error?.patchScript || "");
  if (!script) {
    try {
      script = window.localStorage?.getItem?.(nodeGraphUserSessionStorageKey)
        || window.localStorage?.getItem?.(nodeUiDevDefaultSettingsStorageKey)
        || "";
    } catch (_error) {
      script = "";
    }
  }
  if (typeof nodeGraphShowPatchLoadFault === "function") {
    nodeGraphShowPatchLoadFault({
      message,
      script,
      title: "Failed to load saved patch",
    });
  } else {
    if (typeof setNodeGraphScriptStatus === "function") {
      setNodeGraphScriptStatus(message, false);
    }
    console.error(message);
  }
}

function applyNodeGraphBootSession(session, options = {}) {
  if (!session) {
    return;
  }
  applyNodeGraphUserSession(session, options);
}

async function loadNodeUiDevDefaultSettings() {
  let storedSettings = null;
  try {
    storedSettings = loadNodeUiDevLocalDefaultSettings();
  } catch (error) {
    reportNodeGraphSessionLoadFault(error);
    const bundledSettings = loadNodeUiDevBundledDefaultSettings();
    if (bundledSettings) {
      try {
        applyNodeUiDevSettings(bundledSettings);
      } catch (_error) {
        // Controls-only fallback below.
      }
    }
    finishNodeUiDevSettingsHydration();
    return;
  }

  let storedSession = null;
  let sessionLoadFailed = false;
  try {
    storedSession = loadNodeGraphUserSessionLocal();
    if (storedSession) {
      try {
        if (!window.localStorage.getItem(nodeGraphUserSessionStorageKey)) {
          window.localStorage.setItem(
            nodeGraphUserSessionStorageKey,
            JSON.stringify(storedSession),
          );
        }
      } catch (_error) {
        // Quota: keep the legacy settings blob until a later session persist.
      }
    }
  } catch (error) {
    sessionLoadFailed = true;
    reportNodeGraphSessionLoadFault(error);
  }

  if (storedSettings) {
    applyNodeUiDevSettings(storedSettings);
    if (!sessionLoadFailed) {
      applyNodeGraphBootSession(storedSession);
    }
    document.documentElement.dataset.nodeUiDevSettingsSource = "local";
    finishNodeUiDevSettingsHydration();
    if (!sessionLoadFailed && storedSession) {
      persistSession({ reason: "session" });
    }
    return;
  }

  if (typeof fetch === "function") {
    try {
      const response = await fetch(nodeUiDevDefaultSettingsUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      applyNodeUiDevSettings(loadNodeUiDevSettingsFromScript(text));
      if (!sessionLoadFailed && storedSession) {
        applyNodeGraphBootSession(storedSession);
      } else if (!sessionLoadFailed) {
        applyNodeGraphBootSession(nodeGraphUserSessionFromLegacySettings(JSON.parse(text)));
      }
      document.documentElement.dataset.nodeUiDevSettingsSource = "fetch";
      finishNodeUiDevSettingsHydration();
      return;
    } catch {
      // Fall through to the bundled preset for browser surfaces without request APIs.
    }
  }
  const bundledSettings = loadNodeUiDevBundledDefaultSettings();
  document.documentElement.dataset.nodeUiDevSettingsSource = bundledSettings ? "bundled" : "controls";
  applyNodeUiDevSettings(bundledSettings || readNodeUiDevSettingsFromControls());
  if (!sessionLoadFailed && storedSession) {
    applyNodeGraphBootSession(storedSession);
  } else if (!sessionLoadFailed) {
    const bundledRaw = window.nodeUiDevBundledDefaultSettings;
    if (bundledRaw) {
      applyNodeGraphBootSession(nodeGraphUserSessionFromLegacySettings(bundledRaw));
    }
  }
  finishNodeUiDevSettingsHydration();
}

async function copyNodeUiDevSettingsToClipboard() {
  try {
    await copyTextToClipboard(serializeNodeUiDevSettings());
  } catch (_error) {
    // Clipboard errors stay silent; Copy already flashes on success.
  }
}

async function pasteNodeUiDevSettingsFromClipboard(event) {
  const button = event?.currentTarget;
  if (typeof confirmNodeGraphDefaultButtonClick === "function" && button) {
    if (!confirmNodeGraphDefaultButtonClick(
      button,
      null,
      { confirmText: "Confirm Paste" },
    )) {
      return;
    }
  }
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch (_error) {
    return;
  }
  try {
    applyNodeUiDevSettings(loadNodeUiDevSettingsFromScript(text));
    if (typeof flashNodeGraphDefaultButtonSaved === "function" && button) {
      flashNodeGraphDefaultButtonSaved(button, "Pasted");
    }
  } catch (_error) {
    // Invalid clipboard payload: leave current settings unchanged.
  }
}

async function saveNodeUiDevSettingsFile() {
  const text = `${serializeNodeUiDevSettings()}\n`;
  const suggested = typeof nodeGraphFilePickerState === "function"
    ? nodeGraphFilePickerState().lastSettingsName
    : "useruisettings.json";
  try {
    const result = typeof nodeGraphSaveTextFileWithNativeDialog === "function"
      ? await nodeGraphSaveTextFileWithNativeDialog({
        text,
        suggestedName: suggested || "useruisettings.json",
        description: "soemdsp UI settings JSON",
        accept: { "application/json": [".json"] },
      })
      : { ok: false };
    if (result.cancelled || !result.ok) {
      return;
    }
    if (typeof rememberNodeGraphFilePickerMeta === "function") {
      rememberNodeGraphFilePickerMeta({ lastSettingsName: result.name || suggested });
    }
  } catch (_error) {
    // File picker / write failures stay silent; the dialog already closed.
  }
}

async function loadNodeUiDevSettingsFile() {
  try {
    const result = typeof nodeGraphOpenTextFileWithNativeDialog === "function"
      ? await nodeGraphOpenTextFileWithNativeDialog({
        description: "soemdsp UI settings JSON",
        accept: { "application/json": [".json"] },
        fallbackInputId: "nodeUiDevSettingsFileInput",
      })
      : { ok: false };
    if (result.cancelled || !result.ok) {
      return;
    }
    applyNodeUiDevSettings(loadNodeUiDevSettingsFromScript(result.text));
    if (typeof rememberNodeGraphFilePickerMeta === "function") {
      rememberNodeGraphFilePickerMeta({ lastSettingsName: result.name });
    }
    if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
      scheduleNodeUiDevSettingsAutosave();
    }
  } catch (_error) {
    // Invalid file: leave current settings unchanged.
  }
}

function handleNodeUiDevSettingsFileLoad(event) {
  const [file] = event.currentTarget.files || [];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      applyNodeUiDevSettings(loadNodeUiDevSettingsFromScript(String(reader.result || "")));
    } catch (_error) {
      // Invalid file: leave current settings unchanged.
    } finally {
      event.currentTarget.value = "";
    }
  });
  reader.addEventListener("error", () => {
    event.currentTarget.value = "";
  });
  reader.readAsText(file);
}

async function updateDefaultNodeUiDevSettingsPreset() {
  const text = serializeNodeUiDevSettings();
  try {
    await postNodeUiDevSettingsPreset(text);
    saveNodeUiDevLocalDefaultSettings(text);
    return true;
  } catch (_error) {
    if (saveNodeUiDevLocalDefaultSettings(text)) {
      return true;
    }
    return false;
  }
}

async function postNodeUiDevSettingsPreset(text) {
  const response = await fetch("/api/presets/useruisettings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: text,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result;
}

async function saveNodeUserUiSettingsDefaultPreset() {
  const text = serializeNodeUiDevSettings();
  const localSaved = saveNodeUiDevLocalDefaultSettings(text);
  if (localSaved) {
    postNodeUiDevSettingsPreset(text)
      .then(() => {
        saveNodeUiDevLocalDefaultSettings(text);
      })
      .catch(() => {});
    return true;
  }
  try {
    await postNodeUiDevSettingsPreset(text);
    saveNodeUiDevLocalDefaultSettings(text);
    return true;
  } catch (_error) {
    return Boolean(localSaved);
  }
}

async function handleUpdateDefaultNodeUiDevSettingsPresetClick(event) {
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget)) {
    return;
  }
  flashNodeGraphDefaultButtonSaved(event.currentTarget);
  await updateDefaultNodeUiDevSettingsPreset();
}

async function handleSaveNodeUserUiSettingsDefaultClick(event) {
  flashNodeGraphDefaultButtonSaved(event.currentTarget);
  const saved = await saveNodeUserUiSettingsDefaultPreset();
  if (!saved) {
    event.currentTarget.textContent = "Save UI Settings";
  }
}

function handleClearNodeUserStartupStateClick(event) {
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget)) {
    return;
  }
  clearNodeUserStartupState();
}
