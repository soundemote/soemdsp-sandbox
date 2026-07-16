const nodeUiDevDefaultSettingsUrl = "./public/presets/useruisettings.json";
const nodeUiDevDefaultSettingsStorageKey = "soemdsp-sandbox.userUiSettings.startup.v12";

const nodeGraphWorkspaceWindowStateKeys = Object.freeze([
  "commandCenter",
  "moduleActions",
  "metaparameters",
  "oscilloscopeSettings",
  "patchExplorer",
  "moduleBrowser",
  "visibilityMenu",
  "uiSettings",
  "uiDev",
  "traceDisplaySettings",
]);

const nodeGraphWorkspaceWindowElements = Object.freeze({
  commandCenter: "nodeSceneContextMenu",
  moduleActions: "nodeModuleActionsWindow",
  metaparameters: "nodeParameterMetadataPopover",
  oscilloscopeSettings: "nodeGlobalScopeMenu",
  patchExplorer: "nodeSavedPatchesWindow",
  moduleBrowser: "nodeModuleShopView",
  visibilityMenu: "nodeVisibilityMenu",
  uiSettings: "nodeUserUiSettingsPanel",
  uiDev: "nodeUiDevHelper",
  traceDisplaySettings: "nodeTraceDisplaySettingsPopover",
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

function nodeGraphSharedInspectorGeometryFromStates(states = {}) {
  let position = null;
  let size = null;
  for (const key of nodeGraphSharedInspectorWindowKeys) {
    if (!position && states?.[key]?.position) {
      position = normalizeNodeGraphWorkspaceWindowPosition(states[key].position);
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
  const position = normalizeNodeGraphWorkspaceWindowPosition(source.position) || fallback.position;
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

function normalizeNodeGraphWorkspaceWindowStateEntry(entry = {}, key = "") {
  const source = entry && typeof entry === "object" ? entry : {};
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
  if (
    Array.isArray(window.nodeGraphModuleStoreDepartments) &&
    window.nodeGraphModuleStoreDepartments.includes(department)
  ) {
    return department;
  }
  if (
    typeof nodeGraphModuleStoreDepartments !== "undefined" &&
    nodeGraphModuleStoreDepartments.includes?.(department)
  ) {
    return department;
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
  if (
    Number.isFinite(styleLeft) &&
    Number.isFinite(styleTop) &&
    typeof nodeGraphFloatingWindowViewportPositionFromCss === "function"
  ) {
    return normalizeNodeGraphWorkspaceWindowPosition(
      nodeGraphFloatingWindowViewportPositionFromCss(styleLeft, styleTop),
    );
  }
  return normalizeNodeGraphWorkspaceWindowPosition({
    left: Number.isFinite(styleLeft) ? styleLeft : rect?.left,
    top: Number.isFinite(styleTop) ? styleTop : rect?.top,
  });
}

function rememberNodeGraphWorkspaceWindowState(key, element, patch = {}, options = {}) {
  if (!nodeGraphWorkspaceWindowStateKeys.includes(key)) {
    return null;
  }
  const states = normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates);
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
  if (
    typeof serializeNodeUiDevSettings !== "function" ||
    typeof saveNodeUiDevLocalDefaultSettings !== "function"
  ) {
    return;
  }
  saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  if (options.status !== false && typeof setNodeUiDevSettingsStatus === "function") {
    setNodeUiDevSettingsStatus("workspace ui settings saved", true);
  }
}

function positionNodeGraphWorkspaceWindowFromState(key, element) {
  const state = normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates)[key];
  const sharedInspectorState = normalizeNodeGraphSharedInspectorWindowState(
    nodeGraphMvp.sharedInspectorWindowState,
    nodeGraphMvp.workspaceWindowStates,
  );
  const position = nodeGraphSharedInspectorWindowKeys.includes(key)
    ? sharedInspectorState.position
    : state?.position;
  if (!element || !position) {
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
  if (key === "oscilloscopeSettings") {
    element.hidden = true;
    return;
  }
  element.hidden = !state.open;
  if (key === "moduleActions" && typeof applyNodeModuleActionsWindowSize === "function") {
    applyNodeModuleActionsWindowSize(nodeGraphMvp.sharedInspectorWindowState?.size);
  }
  if (key === "patchExplorer" && typeof applyNodeGraphSavedPatchesWindowSize === "function") {
    applyNodeGraphSavedPatchesWindowSize(state.size);
  }
  if (key === "moduleBrowser" && typeof applyNodeGraphModuleShopWindowSize === "function") {
    applyNodeGraphModuleShopWindowSize(state.size);
  }
  if (key === "visibilityMenu" && typeof applyNodeGraphVisibilityMenuSize === "function") {
    applyNodeGraphVisibilityMenuSize(state.size);
  }
  if (key === "metaparameters" && typeof applyNodeMetadataPopoverSize === "function") {
    applyNodeMetadataPopoverSize(nodeGraphMvp.sharedInspectorWindowState?.size);
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
  document
    .getElementById("nodeUserUiSettingsButton")
    ?.classList.toggle("active", !document.getElementById("nodeUserUiSettingsPanel")?.hidden);
  document
    .getElementById("nodeUiDevButton")
    ?.classList.toggle("active", !document.getElementById("nodeUiDevHelper")?.hidden);
  document
    .getElementById("nodeSavedPatchesWindowButton")
    ?.classList.toggle("active", !document.getElementById("nodeSavedPatchesWindow")?.hidden);
  if (!document.getElementById("nodeSavedPatchesWindow")?.hidden) {
    if (typeof syncNodeGraphSavedPatchGridColumns === "function") {
      syncNodeGraphSavedPatchGridColumns();
    }
    if (typeof renderNodeGraphDemoPatchList === "function") {
      renderNodeGraphDemoPatchList();
    }
  }
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
    ? settings.controls
    : {};
  const exposedControls = settings.exposedControls && typeof settings.exposedControls === "object"
    ? settings.exposedControls
    : {};
  const nodeColors = settings.nodeColors && typeof settings.nodeColors === "object"
    ? settings.nodeColors
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
  const gridVisible = view.gridVisible ?? controls.gridVisible ?? controls.showGrid ?? nodeGraphMvp.gridVisible;
  const moduleButtonsVisible = Boolean(view.moduleButtonsVisible ?? nodeGraphMvp.moduleButtonsVisible);
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
  const traceSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
    ? normalizeNodeGraphTraceDisplaySettings(view.traceSettings ?? nodeGraphMvp.traceSettings)
    : (view.traceSettings ?? nodeGraphMvp.traceSettings ?? {});
  const sliderLayout = normalizeNodeGraphSliderLayout(view.sliderLayout ?? nodeGraphMvp.sliderLayout);
  const sliderAmountVisible = Boolean(view.sliderAmountVisible ?? nodeGraphMvp.sliderAmountVisible);
  const sliderPositionVisible = Boolean(
    view.sliderPositionVisible ??
    nodeGraphMvp.sliderPositionVisible
  );
  const hideMouseWhileDragging = Boolean(
    view.hideMouseWhileDragging ??
    nodeGraphMvp.hideMouseWhileDragging ??
    true
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
  let workingPatch = null;
  if (view.workingPatch && typeof view.workingPatch === "object") {
    try {
      workingPatch = cloneNodeGraphPatch(validateNodeGraphPatch(view.workingPatch));
      workingPatch = sanitizeNodeUiDevWorkingPatchForStartup(workingPatch);
    } catch {
      workingPatch = null;
    }
  }
  const currentSavedPatchFilename = String(view.currentSavedPatchFilename || "").trim();
  const patchDirtyState = ["saved", "edited", "untouched"].includes(view.patchDirtyState)
    ? view.patchDirtyState
    : workingPatch
      ? "edited"
      : "untouched";
  const savedPatchBankIndex = typeof normalizeNodeGraphSavedPatchBankIndex === "function"
    ? normalizeNodeGraphSavedPatchBankIndex(view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex)
    : Math.max(0, Math.min(127, Math.round(Number(view.savedPatchBankIndex ?? nodeGraphMvp.savedPatchBankIndex) || 0)));
  const savedPatchGridColumns = typeof normalizeNodeGraphSavedPatchGridColumns === "function"
    ? normalizeNodeGraphSavedPatchGridColumns(view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns)
    : Math.max(1, Math.min(16, Math.round(Number(view.savedPatchGridColumns ?? nodeGraphMvp.savedPatchGridColumns) || 3)));
  const savedPatchBankName = typeof nodeGraphOneLineText === "function"
    ? nodeGraphOneLineText(view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "")
    : String(view.savedPatchBankName ?? nodeGraphMvp.savedPatchBankName ?? "").trim();
  const savedPatchExplorerView = view.savedPatchExplorerView === "patches" ? "patches" : "banks";
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
    view: {
      gridVisible: Boolean(gridVisible),
      moduleButtonsVisible,
      moduleInterfaceControlsVisible,
      moduleOscilloscopesVisible,
      moduleSlidersVisible,
      moduleScopeBackgroundColor,
      globalSmoothingSeconds,
      globalSmoothingManual,
      moduleScopeDotCore1Enabled,
      moduleScopeDotCore1Size,
      moduleScopeDotCore1Brightness,
      moduleScopeDotCore1Color,
      moduleScopeFramesPerSecond,
      moduleScopePointBudget,
      moduleScopeLineThickness,
      moduleScopeDiscontinuitySkipSamples,
      traceSettings,
      sliderLayout,
      sliderAmountVisible,
      sliderPositionVisible,
      hideMouseWhileDragging,
      moduleCatalogVisibility,
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
      savedPatchGridColumns,
      savedPatchExplorerView,
      workingPatch,
      currentSavedPatchFilename,
      patchDirtyState,
    },
  };
}

function readNodeUiDevSettingsFromControls(options = {}) {
  const includeWorkingPatch = options.includeWorkingPatch !== false;
  const workingPatchForSettings = includeWorkingPatch && nodeGraphMvp.workingPatch
    ? cloneNodeGraphPatch(nodeGraphMvp.workingPatch)
    : null;
  if (workingPatchForSettings && typeof normalizeNodeGraphPatchView === "function") {
    workingPatchForSettings.view = {
      ...normalizeNodeGraphPatchView(workingPatchForSettings.view),
      zoom: typeof nodeGraphZoom === "function" ? nodeGraphZoom() : nodeGraphMvp.zoom,
    };
  }
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
    view: {
      gridVisible: Boolean(nodeGraphMvp.gridVisible),
      moduleButtonsVisible: Boolean(nodeGraphMvp.moduleButtonsVisible),
      moduleInterfaceControlsVisible: Boolean(nodeGraphMvp.moduleInterfaceControlsVisible),
      moduleOscilloscopesVisible: Boolean(nodeGraphMvp.moduleOscilloscopesVisible),
      moduleSlidersVisible: Boolean(nodeGraphMvp.moduleSlidersVisible),
      moduleScopeBackgroundColor: normalizeNodeGraphModuleScopeBackgroundColor(nodeGraphMvp.moduleScopeBackgroundColor ?? "#000000"),
      globalSmoothingSeconds: clampNodeGraphAutoSmoothingSeconds(
        nodeGraphMvp?.live?.autoSmoothingSeconds ?? nodeGraphAutoSmoothingDefaultSeconds,
      ),
      globalSmoothingManual: Boolean(nodeGraphMvp?.live?.autoSmoothingManual),
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
      traceSettings: typeof normalizeNodeGraphTraceDisplaySettings === "function"
        ? normalizeNodeGraphTraceDisplaySettings(nodeGraphMvp.traceSettings)
        : nodeGraphMvp.traceSettings,
      sliderLayout: normalizeNodeGraphSliderLayout(nodeGraphMvp.sliderLayout),
      sliderAmountVisible: Boolean(nodeGraphMvp.sliderAmountVisible),
      sliderPositionVisible: Boolean(nodeGraphMvp.sliderPositionVisible),
      hideMouseWhileDragging: Boolean(nodeGraphMvp.hideMouseWhileDragging),
      moduleCatalogVisibility: nodeGraphModuleCatalogVisibility(),
      sceneContextWindowSize: typeof normalizeNodeSceneContextWindowSize === "function"
        ? normalizeNodeSceneContextWindowSize(nodeGraphMvp.sceneContextWindowSize)
        : nodeGraphMvp.sceneContextWindowSize,
      moduleActionWindowSize: typeof normalizeNodeModuleActionsWindowSize === "function"
        ? normalizeNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize)
        : nodeGraphMvp.moduleActionWindowSize,
      workspaceWindowStates: normalizeNodeGraphWorkspaceWindowStates(nodeGraphMvp.workspaceWindowStates),
      sharedInspectorActive: normalizeNodeGraphSharedInspectorActive(nodeGraphMvp.sharedInspectorActive),
      sharedInspectorWindowState: normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState),
      workspaceView: normalizeNodeGraphWorkspaceViewState({
        pan: nodeGraphMvp.pan,
        zoom: typeof nodeGraphZoom === "function" ? nodeGraphZoom() : nodeGraphMvp.zoom,
      }),
      moduleStoreDepartment: normalizeNodeGraphModuleStoreDepartmentState(nodeGraphMvp.moduleStoreDepartment),
      savedPatchExplorerView: nodeGraphMvp.savedPatchExplorerView === "patches" ? "patches" : "banks",
      workingPatch: workingPatchForSettings,
      currentSavedPatchFilename: includeWorkingPatch ? (nodeGraphMvp.currentSavedPatchFilename || "") : "",
      patchDirtyState: !includeWorkingPatch
        ? "untouched"
        : (
          ["saved", "edited", "untouched"].includes(nodeGraphMvp.patchDirtyState)
            ? nodeGraphMvp.patchDirtyState
            : nodeGraphMvp.workingPatch
              ? "edited"
              : "untouched"
        ),
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
  nodeGraphMvp.gridVisible = Boolean(normalized.view.gridVisible);
  nodeGraphMvp.moduleButtonsVisible = Boolean(normalized.view.moduleButtonsVisible);
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
  nodeGraphMvp.traceSettings = typeof normalizeNodeGraphTraceDisplaySettings === "function"
    ? normalizeNodeGraphTraceDisplaySettings(normalized.view.traceSettings)
    : normalized.view.traceSettings;
  nodeGraphMvp.sliderLayout = normalizeNodeGraphSliderLayout(normalized.view.sliderLayout);
  nodeGraphMvp.sliderAmountVisible = Boolean(normalized.view.sliderAmountVisible);
  nodeGraphMvp.sliderPositionVisible = Boolean(normalized.view.sliderPositionVisible);
  nodeGraphMvp.hideMouseWhileDragging = Boolean(normalized.view.hideMouseWhileDragging);
  nodeGraphMvp.sceneContextWindowSize = normalized.view.sceneContextWindowSize;
  if (typeof applyNodeSceneContextWindowSize === "function") {
    applyNodeSceneContextWindowSize(nodeGraphMvp.sceneContextWindowSize);
  }
  nodeGraphMvp.moduleActionWindowSize = normalized.view.moduleActionWindowSize;
  if (typeof applyNodeModuleActionsWindowSize === "function") {
    applyNodeModuleActionsWindowSize(nodeGraphMvp.moduleActionWindowSize);
  }
  nodeGraphMvp.workspaceWindowStates = normalizeNodeGraphWorkspaceWindowStates(
    normalized.view.workspaceWindowStates,
  );
  nodeGraphMvp.sharedInspectorActive = normalizeNodeGraphSharedInspectorActive(normalized.view.sharedInspectorActive);
  nodeGraphMvp.sharedInspectorWindowState = normalizeNodeGraphSharedInspectorWindowState(
    normalized.view.sharedInspectorWindowState,
    normalized.view.workspaceWindowStates,
  );
  nodeGraphWorkspaceWindowStatesWithActiveSharedInspector(
    nodeGraphMvp.workspaceWindowStates,
    nodeGraphMvp.sharedInspectorActive,
  );
  const workspaceView = normalizeNodeGraphWorkspaceViewState(normalized.view.workspaceView);
  nodeGraphMvp.pan = { ...workspaceView.pan };
  nodeGraphMvp.zoom = workspaceView.zoom;
  nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartmentState(
    normalized.view.moduleStoreDepartment,
  );
  nodeGraphMvp.savedPatchBankIndex = typeof normalizeNodeGraphSavedPatchBankIndex === "function"
    ? normalizeNodeGraphSavedPatchBankIndex(normalized.view.savedPatchBankIndex)
    : Math.max(0, Math.min(127, Math.round(Number(normalized.view.savedPatchBankIndex) || 0)));
  nodeGraphMvp.savedPatchBankName = typeof nodeGraphOneLineText === "function"
    ? nodeGraphOneLineText(normalized.view.savedPatchBankName)
    : String(normalized.view.savedPatchBankName || "").trim();
  nodeGraphMvp.savedPatchGridColumns = typeof normalizeNodeGraphSavedPatchGridColumns === "function"
    ? normalizeNodeGraphSavedPatchGridColumns(normalized.view.savedPatchGridColumns)
    : Math.max(1, Math.min(16, Math.round(Number(normalized.view.savedPatchGridColumns) || 3)));
  nodeGraphMvp.savedPatchExplorerView = normalized.view.savedPatchExplorerView === "patches" ? "patches" : "banks";
  nodeGraphMvp.workingPatch = normalized.view.workingPatch
    ? cloneNodeGraphPatch(normalized.view.workingPatch)
    : null;
  nodeGraphMvp.currentSavedPatchFilename = String(normalized.view.currentSavedPatchFilename || "");
  nodeGraphMvp.patchDirtyState = ["saved", "edited", "untouched"].includes(normalized.view.patchDirtyState)
    ? normalized.view.patchDirtyState
    : nodeGraphMvp.workingPatch
      ? "edited"
      : "untouched";
  applyNodeGraphWorkspaceWindowStates();
  if (typeof syncNodeSliderHiddenMouseClass === "function") {
    syncNodeSliderHiddenMouseClass();
  }
  applyNodeGraphModuleCatalogVisibility(normalized.view.moduleCatalogVisibility);
  if (typeof applyNodeGraphZoom === "function") {
    applyNodeGraphZoom();
  }
  if (typeof applyNodeGraphPan === "function") {
    applyNodeGraphPan();
  }
  renderNodeGraphGridToggle();
  renderNodeGraphModuleVisibilityToggles();
  renderNodeGraphModuleScopeBrightnessControl();
  renderNodeGraphSliderVisibilityToggles();
  renderNodeGraphSliderLayout();
  syncNodeUiDevSettingsHeaderControls();
  if (!document.activeElement?.dataset?.nodeUiDevMirror) {
    renderNodeUserUiSettingsControls();
  }
  setNodeUiDevSettingsStatus("ui settings applied", true);
}

function setNodeUiDevSettingsStatus(message, ok = true) {
  for (const status of [
    document.getElementById("nodeUiDevSettingsStatus"),
    document.getElementById("nodeUserUiSettingsStatus"),
  ]) {
    if (!status) {
      continue;
    }
    status.textContent = message;
    status.className = `pill ${ok ? "good" : "warn"}`;
  }
}

function loadNodeUiDevLocalDefaultSettings() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeUiDevDefaultSettingsStorageKey);
    return text ? loadNodeUiDevSettingsFromScript(text) : null;
  } catch {
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
  if (
    typeof nodeGraphMissingSampleAssets === "function" &&
    typeof cloneNodeGraphPatch === "function" &&
    nodeGraphMissingSampleAssets(patch).length
  ) {
    return cloneNodeGraphPatch(nodeGraphDefaultPatch);
  }
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

function saveNodeUiDevLocalDefaultSettings(text) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(nodeUiDevDefaultSettingsStorageKey, text);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(nodeUiDevDefaultSettingsStorageKey);
    } catch {
      // If storage is blocked entirely, the server-side settings file remains the fallback.
    }
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
    "nodeGraphClapHostBaseUrl",
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

function clearNodeUserStartupRuntimeState() {
  if (typeof cloneNodeGraphPatch === "function" && typeof nodeGraphDefaultPatch !== "undefined") {
    nodeGraphMvp.patch = cloneNodeGraphPatch(nodeGraphDefaultPatch);
  }
  nodeGraphMvp.workingPatch = null;
  nodeGraphMvp.currentSavedPatchFilename = "";
  nodeGraphMvp.patchDirtyState = "untouched";
  nodeGraphMvp.workspaceWindowStates = closeNodeGraphWorkspaceWindowStates({});
  nodeGraphMvp.sharedInspectorActive = "";
  nodeGraphMvp.sharedInspectorWindowState = {};
  nodeGraphMvp.pan = { x: 0, y: 0 };
  nodeGraphMvp.zoom = 1;
  nodeGraphMvp.moduleStoreDepartment = "";
  nodeGraphMvp.moduleScopeSettings = {};
  nodeGraphMvp.savedPatchExplorerView = "banks";
  if (typeof applyNodeGraphWorkspaceWindowStates === "function") {
    applyNodeGraphWorkspaceWindowStates();
  }
}

function clearNodeUserStartupState() {
  const removed = clearNodeUserStartupLocalStorage();
  clearNodeUserStartupRuntimeState();
  const text = typeof serializeNodeUiDevSettings === "function"
    ? serializeNodeUiDevSettings({ includeWorkingPatch: false })
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
  setNodeUiDevSettingsStatus(`startup cleared (${removed} local keys)`, true);
  window.setTimeout(() => {
    window.location.reload();
  }, 120);
}

let nodeGraphWorkspaceViewAutosaveTimer = 0;

function saveNodeGraphWorkspaceViewToUserSettings(options = {}) {
  if (
    typeof serializeNodeUiDevSettings !== "function" ||
    typeof saveNodeUiDevLocalDefaultSettings !== "function"
  ) {
    return false;
  }
  const text = serializeNodeUiDevSettings();
  const saved = saveNodeUiDevLocalDefaultSettings(text);
  // Ambient autosave (pan/zoom/smoothing-drag/etc.) only persists to this
  // browser's localStorage so a refresh doesn't lose progress. It must never
  // silently overwrite the shipped default preset on the server -- that only
  // happens when the user explicitly clicks Save/Update Default UI Settings.
  if (options.file === true && typeof postNodeUiDevSettingsPreset === "function") {
    if (nodeGraphWorkspaceViewAutosaveTimer) {
      window.clearTimeout(nodeGraphWorkspaceViewAutosaveTimer);
    }
    nodeGraphWorkspaceViewAutosaveTimer = window.setTimeout(() => {
      nodeGraphWorkspaceViewAutosaveTimer = 0;
      postNodeUiDevSettingsPreset(serializeNodeUiDevSettings()).catch(() => {});
    }, 350);
  }
  return saved;
}

async function loadNodeUiDevDefaultSettings() {
  const storedSettings = loadNodeUiDevLocalDefaultSettings();
  if (storedSettings) {
    applyNodeUiDevSettings(storedSettings);
    const storedCatalogVisibility = loadNodeGraphModuleCatalogVisibilityLocal();
    if (storedCatalogVisibility) {
      applyNodeGraphModuleCatalogVisibility(storedCatalogVisibility);
    }
    loadNodeGraphModuleStoreStateLocal();
    loadNodeGraphModuleScopeSettingsLocal();
    document.documentElement.dataset.nodeUiDevSettingsSource = "local";
    return;
  }
  if (typeof fetch === "function") {
    try {
      const response = await fetch(nodeUiDevDefaultSettingsUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      applyNodeUiDevSettings(loadNodeUiDevSettingsFromScript(await response.text()));
      const storedCatalogVisibility = loadNodeGraphModuleCatalogVisibilityLocal();
      if (storedCatalogVisibility) {
        applyNodeGraphModuleCatalogVisibility(storedCatalogVisibility);
      }
      loadNodeGraphModuleStoreStateLocal();
      loadNodeGraphModuleScopeSettingsLocal();
      document.documentElement.dataset.nodeUiDevSettingsSource = "fetch";
      return;
    } catch {
      // Fall through to the bundled preset for browser surfaces without request APIs.
    }
  }
  const bundledSettings = loadNodeUiDevBundledDefaultSettings();
  document.documentElement.dataset.nodeUiDevSettingsSource = bundledSettings ? "bundled" : "controls";
  applyNodeUiDevSettings(bundledSettings || readNodeUiDevSettingsFromControls());
  const storedCatalogVisibility = loadNodeGraphModuleCatalogVisibilityLocal();
  if (storedCatalogVisibility) {
    applyNodeGraphModuleCatalogVisibility(storedCatalogVisibility);
  }
  loadNodeGraphModuleStoreStateLocal();
  loadNodeGraphModuleScopeSettingsLocal();
}

async function copyNodeUiDevSettingsToClipboard() {
  try {
    await copyTextToClipboard(serializeNodeUiDevSettings());
    setNodeUiDevSettingsStatus("ui settings copied", true);
  } catch (error) {
    setNodeUiDevSettingsStatus(`copy failed: ${error.message}`, false);
  }
}

function saveNodeUiDevSettingsFile() {
  const blob = new Blob([`${serializeNodeUiDevSettings()}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "useruisettings.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setNodeUiDevSettingsStatus("ui settings saved", true);
}

function loadNodeUiDevSettingsFile() {
  document.getElementById("nodeUiDevSettingsFileInput")?.click();
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
      setNodeUiDevSettingsStatus("ui settings loaded", true);
    } catch (error) {
      setNodeUiDevSettingsStatus(error.message, false);
    } finally {
      event.currentTarget.value = "";
    }
  });
  reader.addEventListener("error", () => {
    setNodeUiDevSettingsStatus("ui settings file read failed", false);
    event.currentTarget.value = "";
  });
  reader.readAsText(file);
}

async function updateDefaultNodeUiDevSettingsPreset() {
  const text = serializeNodeUiDevSettings();
  try {
    await postNodeUiDevSettingsPreset(text);
    saveNodeUiDevLocalDefaultSettings(text);
    setNodeUiDevSettingsStatus("default ui settings updated", true);
    return true;
  } catch (error) {
    if (saveNodeUiDevLocalDefaultSettings(text)) {
      setNodeUiDevSettingsStatus("local ui settings updated", true);
      return true;
    }
    setNodeUiDevSettingsStatus(`default update failed: ${error.message}`, false);
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
    setNodeUiDevSettingsStatus("ui settings saved", true);
    postNodeUiDevSettingsPreset(text)
      .then(() => {
        saveNodeUiDevLocalDefaultSettings(text);
        setNodeUiDevSettingsStatus("default ui settings updated", true);
      })
      .catch(() => {
        setNodeUiDevSettingsStatus("ui settings saved", true);
      });
    return true;
  }
  try {
    await postNodeUiDevSettingsPreset(text);
    saveNodeUiDevLocalDefaultSettings(text);
    setNodeUiDevSettingsStatus("default ui settings updated", true);
    return true;
  } catch (error) {
    if (localSaved) {
      return true;
    }
    setNodeUiDevSettingsStatus(`ui settings save failed: ${error.message}`, false);
    return false;
  }
}

async function handleUpdateDefaultNodeUiDevSettingsPresetClick(event) {
  if (!confirmNodeGraphDefaultButtonClick(event.currentTarget, () => {
    setNodeUiDevSettingsStatus("click Confirm Default to update default ui settings", true);
  })) {
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
  if (!confirmNodeGraphDefaultButtonClick(
    event.currentTarget,
    () => setNodeUiDevSettingsStatus("click Confirm Clear Startup for new-user startup", true),
  )) {
    return;
  }
  clearNodeUserStartupState();
}
