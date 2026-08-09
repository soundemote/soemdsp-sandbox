// Display Settings window chrome: open/close, size, drag/resize, bind, blank state.
// Peeled from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after settings-apply.js (open paths call apply/write).

function nodeGraphTraceDisplaySettingsElement() {
  let popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    return popover;
  }
  popover = document.createElement("div");
  popover.id = "nodeTraceDisplaySettingsPopover";
  popover.className = "node-parameter-metadata-popover node-trace-display-settings-popover";
  popover.hidden = true;
  popover.setAttribute("aria-label", "Trace Display drawing settings");
  // Shell only: schema body is mounted per open (schema-exclusive controls).
  popover.innerHTML = `
    <div class="scene-context-heading">
      <button
        id="nodeTraceDisplaySettingsDragHandle"
        class="scene-context-drag-handle node-drag-handle"
        type="button"
        aria-label="Move Trace Display drawing settings">&#x2725;</button>
      <div class="scene-context-title">
        <span id="nodeTraceDisplaySettingsTitle">DISPLAY</span>
        <small id="nodeTraceDisplaySettingsSubtitle">Settings</small>
      </div>
      <button
        id="nodeTraceDisplaySettingsClose"
        class="panel-close-button"
        type="button"
        aria-label="Close Trace Display drawing settings">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="metadata-popover-grid node-trace-display-settings-grid">
      <div id="nodeTraceDisplaySettingsTarget" class="node-trace-display-settings-target">No module</div>
      <div class="metadata-field-actions" aria-label="Trace Display drawing actions">
        <button id="nodeTraceDisplaySettingsDefaults" type="button">Defaults</button>
      </div>
      <div data-display-settings-body class="node-trace-display-settings-body"></div>
    </div>
    <div
      id="nodeTraceDisplaySettingsCornerDrag"
      class="scene-context-resize-handle"
      aria-label="Resize Trace Display drawing settings"
      role="button"
      tabindex="0"></div>`;
  (document.querySelector(".node-wiring-panel") || document.body).append(popover);
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  bindNodeGraphSettingsTextInputProtection(popover);
  applyNodeGraphTraceDisplaySettingsTooltips(popover);
  return popover;
}

function applyNodeGraphTraceDisplaySettingsTooltips(popover) {
  if (!popover) {
    return;
  }
  const fieldKeys = {
    dot1Brightness: "traceDisplaySettings.brightness",
    dot1Size: "traceDisplaySettings.dot1Size",
    puckSize: "traceDisplaySettings.puckSize",
    secondaryBrightness: "traceDisplaySettings.secondaryBrightness",
    secondarySize: "traceDisplaySettings.secondarySize",
    secondaryLineThickness: "traceDisplaySettings.secondaryLineThickness",
    trail: "traceDisplaySettings.trail",
    ghost: "traceDisplaySettings.ghost",
    pixelDensity: "traceDisplaySettings.pixelDensity",
    dotBudget: "traceDisplaySettings.dotBudget",
    zoomSeconds: "traceDisplaySettings.zoomSeconds",
    sweepSeconds: "traceDisplaySettings.sweepSeconds",
    sweepHz: "traceDisplaySettings.sweepHz",
    skipDiscontinuities: "traceDisplaySettings.skipDiscontinuities",
    padding: "traceDisplaySettings.padding",
    lineThickness: "traceDisplaySettings.lineThickness",
    lineLength: "traceDisplaySettings.lineLength",
    capSize: "traceDisplaySettings.capSize",
    capLength: "traceDisplaySettings.capLength",
  };
  for (const [field, key] of Object.entries(fieldKeys)) {
    for (const element of popover.querySelectorAll(`[data-trace-display-field="${field}"], [data-trace-display-step-target="${field}"]`)) {
      element.dataset.tooltipKey = key;
    }
  }
  const colorKeys = {
    dot1Color: "traceDisplaySettings.color",
    secondaryColor: "traceDisplaySettings.secondaryColor",
    backgroundColor: "traceDisplaySettings.background",
    ghostColor: "traceDisplaySettings.ghostColor",
  };
  for (const [field, key] of Object.entries(colorKeys)) {
    popover.querySelector(`[data-trace-display-color="${field}"]`)?.setAttribute("data-tooltip-key", key);
    popover.querySelector(`[data-trace-display-color-widget="${field}"]`)?.setAttribute("data-tooltip-key", key);
  }
  const toggleKeys = {
    bipolarBrightness: "traceDisplaySettings.bipolarBrightness",
    secondaryEnabled: "traceDisplaySettings.secondaryEnabled",
    capEnabled: "traceDisplaySettings.capEnabled",
    sourceSync: "traceDisplaySettings.sourceSync",
    syncChannel: "traceDisplaySettings.syncChannel",
    fullDotEconomy: "traceDisplaySettings.fullDotEconomy",
    dotsOnly: "traceDisplaySettings.dotsOnly",
  };
  for (const [field, key] of Object.entries(toggleKeys)) {
    popover.querySelector(`[data-trace-display-toggle="${field}"]`)?.setAttribute("data-tooltip-key", key);
  }
  popover.querySelector('[data-trace-display-choice="stereoBlend"]')
    ?.setAttribute("data-tooltip-key", "traceDisplaySettings.stereoBlend");
  const keyedControls = {
    nodeTraceDisplaySettingsDefaults: "traceDisplaySettings.defaults",
  };
  for (const [id, key] of Object.entries(keyedControls)) {
    popover.querySelector(`#${id}`)?.setAttribute("data-tooltip-key", key);
  }
  if (typeof applyNodeGraphStaticTooltips === "function") {
    applyNodeGraphStaticTooltips(popover);
  }
}

function setNodeGraphTraceDisplaySettingsHeader(title = "DISPLAY", subtitle = "Settings", target = "") {
  const titleElement = document.getElementById("nodeTraceDisplaySettingsTitle");
  const subtitleElement = document.getElementById("nodeTraceDisplaySettingsSubtitle");
  const targetElement = document.getElementById("nodeTraceDisplaySettingsTarget");
  if (titleElement) {
    titleElement.textContent = title;
  }
  if (subtitleElement) {
    subtitleElement.textContent = subtitle;
  }
  if (targetElement) {
    targetElement.textContent = target || "";
    targetElement.hidden = !target;
  }
}

/** Show/hide the display form vs the “right-click a display” empty state. */
function setNodeGraphTraceDisplaySettingsBlankState(blank = true, message = "Right-click on a display") {
  const popover = nodeGraphTraceDisplaySettingsElement();
  if (!popover) {
    return;
  }
  const grid = popover.querySelector(".node-trace-display-settings-grid, .metadata-popover-grid");
  let empty = popover.querySelector(":scope > .node-unified-inspector-empty");
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "node-unified-inspector-empty";
    empty.setAttribute("role", "status");
  }
  empty.textContent = message;
  // Prefer shared placer from metadata editor when available.
  if (typeof placeNodeGraphUnifiedInspectorEmpty === "function") {
    placeNodeGraphUnifiedInspectorEmpty(popover, empty);
  } else {
    const nav = popover.querySelector(":scope > .node-unified-window-nav-host");
    if (nav) {
      nav.after(empty);
    } else if (grid) {
      popover.insertBefore(empty, grid);
    } else {
      popover.append(empty);
    }
  }
  empty.hidden = !blank;
  if (grid) {
    grid.hidden = Boolean(blank);
  }
  popover.dataset.inspectorBlank = blank ? "true" : "false";
}

/** Content-only blank fill for Display Settings (nav / deselection). */
function showBlankNodeGraphTraceDisplaySettingsContent() {
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  commitOpenNodeGraphTraceDisplaySettings();
  nodeGraphMvp.traceDisplaySettingsTargetNode = null;
  setNodeGraphTraceDisplaySettingsMultiTargets(null);
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "");
  // Clear body so we don't keep editing a previous module under the empty state.
  const body = popover.querySelector("[data-display-settings-body]");
  if (body) {
    body.replaceChildren();
  }
  popover.dataset.displaySettingsBodyType = "";
  popover.dataset.displaySettingsTargetNode = "";
  popover.dataset.displaySettingsType = "";
  destroyNodeGraphTraceDisplayColorWidgets();
  setNodeGraphTraceDisplaySettingsBlankState(true, "Right-click on a display");
}

function nodeGraphTraceDisplaySettingsTargetLabel(node) {
  if (!node) {
    return "";
  }
  return typeof nodeGraphPatchNodeTitle === "function"
    ? nodeGraphPatchNodeTitle(node)
    : (nodeGraphNodeLabels?.[node.type] || "Module");
}

/**
 * When multi-select includes `primaryNodeId` and every selected module shares
 * the same display-settings schema (and can open Display Settings), return all
 * selected ids (primary first). Otherwise just [primary].
 */
function nodeGraphTraceDisplaySettingsResolveMultiTargetIds(primaryNodeId = "") {
  const primaryId = String(primaryNodeId || "").trim();
  const primary = primaryId ? nodeGraphPatchNode(primaryId) : null;
  if (!primary || typeof nodeGraphNodeCanOpenDisplaySettings !== "function") {
    return primaryId ? [primaryId] : [];
  }
  if (!nodeGraphNodeCanOpenDisplaySettings(primary)) {
    return [];
  }
  const schema = typeof nodeGraphModuleDisplaySettingsSchemaForNode === "function"
    ? nodeGraphModuleDisplaySettingsSchemaForNode(primary)
    : "";
  if (!schema) {
    return [primaryId];
  }
  const selectedIds = typeof nodeGraphSelectedNodeIds === "function"
    ? [...nodeGraphSelectedNodeIds()]
    : [];
  if (selectedIds.length < 2 || !selectedIds.includes(primaryId)) {
    return [primaryId];
  }
  const selectedNodes = selectedIds
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!selectedNodes.length || selectedNodes.length !== selectedIds.length) {
    return [primaryId];
  }
  // All selected must open display settings and share this schema.
  for (const node of selectedNodes) {
    if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
      return [primaryId];
    }
    const nodeSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
    if (nodeSchema !== schema) {
      return [primaryId];
    }
  }
  // Primary first (form seeds from its current settings).
  return [primaryId, ...selectedIds.filter((id) => id !== primaryId)];
}

function nodeGraphTraceDisplaySettingsActiveTargetIds() {
  const multi = nodeGraphMvp?.traceDisplaySettingsTargetNodes;
  if (Array.isArray(multi) && multi.length) {
    return multi.map((id) => String(id || "").trim()).filter(Boolean);
  }
  const one = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim();
  return one ? [one] : [];
}

function nodeGraphTraceDisplaySettingsMultiTargetLabel(nodeIds = []) {
  const nodes = (Array.isArray(nodeIds) ? nodeIds : [])
    .map((id) => nodeGraphPatchNode(id))
    .filter(Boolean);
  if (!nodes.length) {
    return "";
  }
  if (nodes.length === 1) {
    return nodeGraphTraceDisplaySettingsTargetLabel(nodes[0]);
  }
  const sameType = nodes.every((n) => n.type === nodes[0].type);
  if (sameType) {
    const typeLabel = typeof nodeGraphNodeLabels !== "undefined" && nodeGraphNodeLabels?.[nodes[0].type]
      ? nodeGraphNodeLabels[nodes[0].type]
      : (nodes[0].type || "Module");
    return `${typeLabel} × ${nodes.length}`;
  }
  return `${nodes.length} modules`;
}

function setNodeGraphTraceDisplaySettingsMultiTargets(nodeIds = []) {
  const ids = (Array.isArray(nodeIds) ? nodeIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  nodeGraphMvp.traceDisplaySettingsTargetNodes = ids.length ? ids : null;
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    popover.dataset.displaySettingsTargetNodes = ids.join(",");
  }
}

/** @deprecated Mode dropdown removed — one face per module. Kept as no-op for callers. */
function setNodeGraphTraceDisplayModeSelectorVisible(_popover, _visible) {
  // no-op
}

/** @deprecated Mode dropdown removed — one face per module. Kept as no-op for callers. */
function syncNodeGraphTraceDisplayModeSelector(_node = null) {
  // no-op
}

function setNodeGraphTraceDisplaySettingsFormType(node = null) {
  const popover = nodeGraphTraceDisplaySettingsRoot();
  if (!popover) {
    return;
  }
  const settingsSchema = node
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : "";
  // Global defaults editor uses plain Trace schema when node is null.
  const formType = settingsSchema || "trace";
  // Schema-exclusive body: rebuild so only this form type's controls exist.
  // Avoid remount when already mounted for same type+node (write cycles would thrash color widgets).
  const nodeId = node?.id ? String(node.id) : "";
  const alreadyMounted =
    popover.dataset.displaySettingsBodyType === formType &&
    popover.dataset.displaySettingsTargetNode === nodeId &&
    popover.querySelector("[data-display-settings-body]")?.childElementCount > 0;
  if (!alreadyMounted) {
    mountNodeGraphDisplaySettingsBody(popover, formType, node);
  } else {
    popover.dataset.displaySettingsType = formType;
    popover.dataset.displaySettingsTargetNode = nodeId;
  }
}

function nodeGraphTraceDisplaySettingsFormType() {
  return document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsType || "";
}

function nodeGraphTraceDisplaySettingsTargetNodeId() {
  return String(
    nodeGraphMvp.traceDisplaySettingsTargetNode ||
    document.getElementById("nodeTraceDisplaySettingsPopover")?.dataset.displaySettingsTargetNode ||
    "",
  );
}

function applyNodeGraphTraceDisplaySettingsWindowSize(size = {}) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover) {
    return null;
  }
  const normalized = normalizeNodeGraphFloatingWindowSize(size, nodeGraphTraceDisplaySettingsWindowSize);
  applyNodeGraphFloatingWindowSizeVars(
    popover,
    "metadata-popover",
    nodeGraphTraceDisplaySettingsWindowSize,
    normalized,
  );
  return normalized;
}

function nodeGraphTraceDisplaySettingsWindowSizeFromElement(popover = document.getElementById("nodeTraceDisplaySettingsPopover")) {
  const rect = popover?.getBoundingClientRect?.();
  return normalizeNodeGraphFloatingWindowSize(
    {
      width: rect?.width,
      height: rect?.height,
    },
    nodeGraphTraceDisplaySettingsWindowSize,
  );
}

function rememberNodeGraphTraceDisplaySettingsWindowState(patch = {}, options = {}) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (typeof rememberNodeGraphWorkspaceWindowState !== "function") {
    return null;
  }
  return rememberNodeGraphWorkspaceWindowState(
    "traceDisplaySettings",
    popover,
    patch,
    { status: false, ...options },
  );
}

function closeNodeGraphTraceDisplaySettings() {
  finishCloseNodeGraphTraceDisplaySettings();
}

function finishCloseNodeGraphTraceDisplaySettings() {
  commitOpenNodeGraphTraceDisplaySettings();
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    popover.hidden = true;
  }
  destroyNodeGraphTraceDisplayColorWidgets();
  rememberNodeGraphTraceDisplaySettingsWindowState({ open: false }, { status: false });
  nodeGraphMvp.traceDisplaySettingsTargetNode = null;
  setNodeGraphTraceDisplaySettingsMultiTargets(null);
  scheduleNodeGraphModuleScopeDraw();
}

function hideNodeGraphTraceDisplaySettingsForInspectorReplacement() {
  commitOpenNodeGraphTraceDisplaySettings();
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (popover) {
    popover.hidden = true;
  }
  rememberNodeGraphTraceDisplaySettingsWindowState({ open: false }, { status: false });
  nodeGraphMvp.traceDisplaySettingsTargetNode = null;
  setNodeGraphTraceDisplaySettingsMultiTargets(null);
}

function nodeGraphTraceDisplaySettingsVisibleRect() {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover || popover.hidden) {
    return null;
  }
  const rect = popover.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function prepareNodeGraphTraceDisplaySettingsForInspectorReplacement() {
  const rect = nodeGraphTraceDisplaySettingsVisibleRect();
  if (!rect) {
    return null;
  }
  hideNodeGraphTraceDisplaySettingsForInspectorReplacement();
  return rect;
}

function nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState = {}, replacementRect = null, event = {}) {
  const savedPosition = sharedInspectorState?.position;
  // Reject 0,0 false memory (same helper as Module Settings) so right-click
  // Display Settings spawns at the pointer instead of the upper-left corner.
  const hasSavedPosition = typeof nodeGraphFloatingWindowSavedPositionIsUsable === "function"
    ? nodeGraphFloatingWindowSavedPositionIsUsable(savedPosition)
    : (Number.isFinite(Number(savedPosition?.left))
      && Number.isFinite(Number(savedPosition?.top))
      && !(Number(savedPosition.left) === 0 && Number(savedPosition.top) === 0));
  const rect = popover?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const replacementLeft = Number(replacementRect?.left);
  const replacementTop = Number(replacementRect?.top);
  const replacementWidth = Number(replacementRect?.width);
  const eventX = Number(event.clientX);
  const eventY = Number(event.clientY);
  const x = hasSavedPosition
    ? savedPosition.left
    : Number.isFinite(replacementLeft)
    ? replacementLeft + (Number.isFinite(replacementWidth) ? replacementWidth * 0.5 : 0) - rect.width * 0.5
    : Number.isFinite(eventX)
    ? eventX
    : window.innerWidth * 0.5 - rect.width * 0.5;
  const y = hasSavedPosition
    ? savedPosition.top
    : Number.isFinite(replacementTop)
    ? replacementTop
    : Number.isFinite(eventY)
    ? eventY
    : window.innerHeight * 0.25;
  return typeof nodeGraphFloatingWindowPosition === "function"
    ? nodeGraphFloatingWindowPosition(popover, x, y, {
      height: rect.height,
      visibleHeight: 48,
      visibleWidth: Math.min(Math.max(80, rect.width * 0.5), rect.width || 80),
      width: rect.width,
    })
    : { left: Math.round(Number(x) || 0), top: Math.round(Number(y) || 0) };
}

function restoreNodeGraphTraceDisplaySettingsWindowFromState(state = {}) {
  const nodeId = String(state.targetNode || nodeGraphMvp.traceDisplaySettingsTargetNode || "");
  const node = nodeGraphPatchNode(nodeId);
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  if (nodeId === "__globalTraceSettings") {
    nodeGraphMvp.traceDisplaySettingsTargetNode = "__globalTraceSettings";
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Global");
    setNodeGraphTraceDisplaySettingsFormType(null);
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphGlobalTraceSettings());
    setNodeGraphTraceDisplaySettingsBlankState(false);
    return;
  }
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    showBlankNodeGraphTraceDisplaySettingsContent();
    return;
  }
  nodeGraphMvp.traceDisplaySettingsTargetNode = node.id;
  setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", nodeGraphTraceDisplaySettingsTargetLabel(node));
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
  setNodeGraphTraceDisplaySettingsBlankState(false);
}

function syncOpenNodeGraphTraceDisplaySettingsToNode(nodeId) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    !popover ||
    popover.hidden ||
    nodeGraphMvp.sharedInspectorActive !== "traceDisplaySettings" ||
    nodeGraphMvp.traceDisplaySettingsTargetNode === "__globalTraceSettings"
  ) {
    return false;
  }
  const node = nodeGraphPatchNode(nodeId);
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    // No module / no display face: empty page stays open.
    showBlankNodeGraphTraceDisplaySettingsContent();
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, targetNode: "" },
      { capturePosition: false, status: false },
    );
    return true;
  }
  if (
    nodeGraphMvp.traceDisplaySettingsTargetNode === node.id
    && popover.dataset.inspectorBlank !== "true"
  ) {
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  restoreNodeGraphTraceDisplaySettingsWindowFromState({ targetNode: node.id });
  rememberNodeGraphTraceDisplaySettingsWindowState(
    { open: true, targetNode: node.id },
    { status: false },
  );
  return true;
}

function openNodeGraphGlobalTraceSettings(event = {}) {
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover &&
    !existingPopover.hidden &&
    nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings" &&
    nodeGraphMvp.traceDisplaySettingsTargetNode === "__globalTraceSettings"
  ) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(existingPopover);
    }
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return true;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  const replacementRect = metadataRect || moduleActionsRect;
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.traceDisplaySettingsTargetNode = "__globalTraceSettings";
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Global");
  setNodeGraphTraceDisplaySettingsFormType(null);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphGlobalTraceSettings());
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  popover.hidden = false;
  // Widgets skip mount while popover is hidden — refresh after unhide.
  syncNodeGraphTraceDisplayColorWidgets(popover);
  const position = nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState, replacementRect, event);
  popover.style.position = "fixed";
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(popover, position.left, position.top);
  } else {
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    popover.style.right = "auto";
  }
  if (typeof markNodeGraphFloatingWindowSurface === "function") {
    markNodeGraphFloatingWindowSurface(popover);
  }
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(popover);
  }
  rememberNodeGraphTraceDisplaySettingsWindowState(
    { open: true, position, targetNode: "__globalTraceSettings" },
    { status: false },
  );
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

function beginNodeGraphTraceDisplaySettingsDrag(event) {
  beginNodeGraphFloatingWindowDrag(
    event,
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    "traceDisplaySettingsDragging",
  );
}

function dragNodeGraphTraceDisplaySettings(event) {
  dragNodeGraphFloatingWindow(
    event,
    "traceDisplaySettingsDragging",
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    (next) => {
      rememberNodeGraphTraceDisplaySettingsWindowState(
        { open: true, position: next },
        { persist: false },
      );
    },
  );
  dragNodeGraphFloatingWindowResize(
    event,
    "traceDisplaySettingsResizing",
    applyNodeGraphTraceDisplaySettingsWindowSize,
    { width: true, height: true },
  );
}

function endNodeGraphTraceDisplaySettingsDrag(event) {
  const drag = nodeGraphMvp.traceDisplaySettingsDragging;
  endNodeGraphFloatingWindowDrag(event, "traceDisplaySettingsDragging", () => {
    const position = Number.isFinite(Number(drag?.currentLeft)) && Number.isFinite(Number(drag?.currentTop))
      ? { left: drag.currentLeft, top: drag.currentTop }
      : undefined;
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, ...(position ? { position } : {}) },
      { capturePosition: false, status: false },
    );
  });
  endNodeGraphFloatingWindowResize(event, "traceDisplaySettingsResizing", () => {
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, size: nodeGraphTraceDisplaySettingsWindowSizeFromElement() },
      { status: false },
    );
  });
}

function beginNodeGraphTraceDisplaySettingsResize(event) {
  beginNodeGraphFloatingWindowResize(
    event,
    document.getElementById("nodeTraceDisplaySettingsPopover"),
    "traceDisplaySettingsResizing",
  );
}

function bindNodeGraphTraceDisplaySettingsEvents(popover) {
  if (!popover || popover.dataset.traceDisplaySettingsBound === "true") {
    return;
  }
  popover.dataset.traceDisplaySettingsBound = "true";
  bindNodeGraphSettingsTextInputProtection(popover);
  popover.addEventListener("pointerdown", toggleNodeGraphTraceDisplaySettingRow, true);
  popover.addEventListener("click", suppressNodeGraphTraceDisplaySettingRowClick, true);
  popover.addEventListener("input", updateNodeGraphTraceDisplaySettingsLive);
  popover.addEventListener("change", commitNodeGraphTraceDisplaySettingsChange);
  popover.addEventListener("click", stepNodeGraphTraceDisplaySetting);
  popover.addEventListener("dblclick", beginNodeGraphTraceDisplayFieldEdit, true);
  // focusout bubbles; blur does not — parent never saw Enter→blur before.
  popover.addEventListener("focusout", finishNodeGraphTraceDisplayFieldEdit, true);
  popover.addEventListener("keydown", handleNodeGraphTraceDisplayFieldEditKeydown, true);
  popover.addEventListener("focusin", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  popover.addEventListener("selectstart", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  popover.addEventListener("dragstart", preventNodeGraphTraceDisplayReadonlyFieldTextInteraction, true);
  // Capture-phase drag: text-input protection stopPropagates before the <input>
  // itself sees pointerdown, so unit steppers + display fields must bind here.
  popover.addEventListener("pointerdown", beginNodeGraphTraceDisplayFieldDrag, true);
  document.getElementById("nodeTraceDisplaySettingsDefaults")?.addEventListener("click", setNodeGraphTraceDisplaySettingsDefaults);
  document.getElementById("nodeTraceDisplaySettingsClose")?.addEventListener("click", closeNodeGraphTraceDisplaySettings);
  document.getElementById("nodeTraceDisplaySettingsDragHandle")?.addEventListener("pointerdown", (event) => {
    if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
      beginNodeGraphRegisteredFloatingWindowDrag(event, "traceDisplaySettings");
      return;
    }
    beginNodeGraphTraceDisplaySettingsDrag(event);
  });
  document.querySelector("#nodeTraceDisplaySettingsPopover .scene-context-heading")?.addEventListener("pointerdown", (event) => {
    if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
      beginNodeGraphRegisteredFloatingWindowDrag(event, "traceDisplaySettings");
      return;
    }
    beginNodeGraphTraceDisplaySettingsDrag(event);
  });
  document.getElementById("nodeTraceDisplaySettingsCornerDrag")?.addEventListener("pointerdown", (event) => {
    if (typeof beginNodeGraphRegisteredFloatingWindowResize === "function") {
      beginNodeGraphRegisteredFloatingWindowResize(event, "traceDisplaySettings");
      return;
    }
    beginNodeGraphTraceDisplaySettingsResize(event);
  });
  document.addEventListener("pointermove", dragNodeGraphTraceDisplayField, true);
  document.addEventListener("pointermove", dragNodeGraphUnitStepper, true);
  document.addEventListener("pointerup", endNodeGraphTraceDisplayFieldDrag, true);
  document.addEventListener("pointerup", endNodeGraphUnitStepperDrag, true);
  document.addEventListener("pointercancel", endNodeGraphTraceDisplayFieldDrag, true);
  document.addEventListener("pointercancel", endNodeGraphUnitStepperDrag, true);
  // Window drag/resize: registry pointer bridge
  // Click outside the field (including outside the window) ends text edit.
  document.addEventListener("pointerdown", handleNodeGraphTraceDisplayFieldEditPointerDown, true);
}

function openNodeGraphTraceDisplaySettings(nodeId, event = {}) {
  // Macro Controls face is a global bank — open dedicated face settings.
  if (nodeId === "__macroControlsFace") {
    return typeof openNodeGraphMacroControlsDisplaySettings === "function"
      ? openNodeGraphMacroControlsDisplaySettings(event)
      : false;
  }
  const node = nodeGraphPatchNode(nodeId);
  if (!node) {
    return false;
  }
  if (node.type === "macroControls" && typeof openNodeGraphMacroControlsDisplaySettings === "function") {
    return openNodeGraphMacroControlsDisplaySettings(event);
  }
  // Music Player owns nodePhosphorWaveformSettingsWindow — do not fall through
  // into the shared Trace/schema form (display gear routes there first).
  if (typeof nodeGraphNodeUsesPhosphorWaveformDisplay === "function" && nodeGraphNodeUsesPhosphorWaveformDisplay(node)) {
    return false;
  }
  // LED uses the shared display inspector (formType ledLamp) — same popover
  // as Number Readout / XY Pad / scopes.
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return false;
  }
  // Multi-select: if every selected module shares this display schema, edit all.
  const multiTargetIds = nodeGraphTraceDisplaySettingsResolveMultiTargetIds(node.id);
  const multiKey = multiTargetIds.join(",");
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  const existingMulti = Array.isArray(nodeGraphMvp.traceDisplaySettingsTargetNodes)
    ? nodeGraphMvp.traceDisplaySettingsTargetNodes.join(",")
    : String(nodeGraphMvp.traceDisplaySettingsTargetNode || "");
  if (
    existingPopover &&
    !existingPopover.hidden &&
    nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings" &&
    existingMulti === multiKey
    && existingPopover.dataset.inspectorBlank !== "true"
  ) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(existingPopover);
    }
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("traceDisplaySettings", existingPopover);
    }
    return true;
  }
  commitOpenNodeGraphTraceDisplaySettings();
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return true;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  const replacementRect = metadataRect || moduleActionsRect;
  const popover = nodeGraphTraceDisplaySettingsElement();
  bindNodeGraphTraceDisplaySettingsEvents(popover);
  nodeGraphMvp.traceDisplaySettingsTargetNode = node.id;
  setNodeGraphTraceDisplaySettingsMultiTargets(multiTargetIds);
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader(
    "DISPLAY",
    multiTargetIds.length > 1 ? "Settings (multi)" : "Settings",
    nodeGraphTraceDisplaySettingsMultiTargetLabel(multiTargetIds),
  );
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
  setNodeGraphTraceDisplaySettingsBlankState(false);
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  popover.hidden = false;
  // Widgets skip mount while popover is hidden — refresh after unhide.
  syncNodeGraphTraceDisplayColorWidgets(popover);
  const unifiedDriving = Boolean(nodeGraphMvp._unifiedWindowSwitching);
  if (!unifiedDriving) {
    const position = nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState, replacementRect, event);
    popover.style.position = "fixed";
    if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
      setNodeGraphFloatingWindowViewportPosition(popover, position.left, position.top);
    } else {
      popover.style.left = `${position.left}px`;
      popover.style.top = `${position.top}px`;
      popover.style.right = "auto";
    }
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, position, targetNode: node.id },
      { status: false },
    );
  } else {
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(popover);
    }
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, targetNode: node.id },
      { capturePosition: false, status: false },
    );
  }
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(popover);
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("traceDisplaySettings", popover);
  }
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

/** Open Display Settings as an empty page (nav with no eligible selection). */
function openBlankNodeGraphTraceDisplaySettings(event = {}) {
  const metadataRect = typeof prepareNodeMetadataPopoverForInspectorReplacement === "function"
    ? prepareNodeMetadataPopoverForInspectorReplacement()
    : null;
  if (metadataRect === false) {
    return false;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  const replacementRect = metadataRect || moduleActionsRect;
  const popover = nodeGraphTraceDisplaySettingsElement();
  showBlankNodeGraphTraceDisplaySettingsContent();
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  popover.hidden = false;
  const unifiedDriving = Boolean(nodeGraphMvp._unifiedWindowSwitching);
  if (!unifiedDriving) {
    const position = nodeGraphTraceDisplaySettingsOpenPosition(popover, sharedInspectorState, replacementRect, event);
    popover.style.position = "fixed";
    if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
      setNodeGraphFloatingWindowViewportPosition(popover, position.left, position.top);
    } else {
      popover.style.left = `${position.left}px`;
      popover.style.top = `${position.top}px`;
      popover.style.right = "auto";
    }
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, position, targetNode: "" },
      { status: false },
    );
  } else {
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(popover);
    }
    rememberNodeGraphTraceDisplaySettingsWindowState(
      { open: true, targetNode: "" },
      { capturePosition: false, status: false },
    );
  }
  if (typeof raiseNodeGraphFloatingWindow === "function") {
    raiseNodeGraphFloatingWindow(popover);
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("traceDisplaySettings", popover);
  }
  return true;
}
