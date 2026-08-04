// Trace display settings UI chrome extracted from node-graph-module-scopes.js
// (Phase D follow-up). Load after scope-settings-form.js, before scopes.js.
// Extract-only: same function bodies / globals.

/**
 * Schema-exclusive body: only controls for this formType exist in the DOM.
 * Replaces the old mega-form + hide loop so spectrogram never shares markup with Output.
 */
// buildNodeGraphDisplaySettingsBodyHtml → node-graph-module-scope-settings-form.js
function mountNodeGraphDisplaySettingsBody(popover, formType, node = null) {
  if (!popover) {
    return;
  }
  const host = popover.querySelector("[data-display-settings-body]");
  if (!host) {
    return;
  }
  const type = formType || "trace";
  // Tear down widgets bound to the previous schema body before replacing DOM.
  if (typeof destroyNodeGraphTraceDisplayColorWidgets === "function") {
    destroyNodeGraphTraceDisplayColorWidgets();
  }
  if (typeof NodeGraphGradientSelector !== "undefined"
    && typeof NodeGraphGradientSelector.clearActive === "function") {
    NodeGraphGradientSelector.clearActive();
  } else if (nodeGraphMvp?.spectrogramGradientEditor?.destroy) {
    nodeGraphMvp.spectrogramGradientEditor.destroy();
    nodeGraphMvp.spectrogramGradientEditor = null;
    nodeGraphMvp.sharedGradientEditor = null;
    nodeGraphMvp.gradientSelector = null;
  }
  host.innerHTML = buildNodeGraphDisplaySettingsBodyHtml(type, node);
  // LED: bind range-slider panel (same control scheme as the old LED window).
  if (type === "ledLamp") {
    if (node?.id) {
      nodeGraphMvp.ledSettingsTargetNode = String(node.id);
    }
    if (typeof bindNodeGraphLedDisplaySettingsBody === "function") {
      bindNodeGraphLedDisplaySettingsBody(host);
    }
    if (typeof renderNodeGraphLedSettingsWindow === "function") {
      renderNodeGraphLedSettingsWindow();
    }
  }
  // Matrix Waterfall / Matrix Display settings panels.
  if (type === "matrixFace" || type === "matrixWaterfallFace" || type === "matrixDisplayFace") {
    if (typeof bindNodeGraphMatrixFaceDisplaySettingsBody === "function") {
      bindNodeGraphMatrixFaceDisplaySettingsBody(host);
    }
  }
  if (type === "macroControlsFace") {
    if (typeof bindNodeGraphMacroControlsFaceDisplaySettingsBody === "function") {
      bindNodeGraphMacroControlsFaceDisplaySettingsBody(host);
    }
  }
  // RGB Picture: load / clear image.
  if (type === "rgbPictureFace") {
    if (typeof bindNodeGraphRgbPictureDisplaySettingsEvents === "function") {
      bindNodeGraphRgbPictureDisplaySettingsEvents(host);
    }
    if (typeof syncNodeGraphRgbPictureDisplaySettingsControls === "function") {
      syncNodeGraphRgbPictureDisplaySettingsControls(host);
    }
  }
  // XY Pad: action row for clearing the phosphor residual buffer.
  if (type === "xyPad") {
    host.insertAdjacentHTML(
      "beforeend",
      `<div class="metadata-field-section node-trace-display-xy-pad-actions">
        <button type="button" data-xy-pad-reset-canvas class="node-xy-pad-reset-canvas-button">
          Reset canvas
        </button>
      </div>`,
    );
    const resetButton = host.querySelector("[data-xy-pad-reset-canvas]");
    if (resetButton && !resetButton.dataset.bound) {
      resetButton.dataset.bound = "true";
      resetButton.addEventListener("click", (event) => {
        event.preventDefault();
        const nodeId = popover.dataset.displaySettingsTargetNode
          || nodeGraphMvp?.traceDisplaySettingsTargetNode
          || node?.id
          || "";
        if (typeof nodeGraphXyPadResetCanvas === "function") {
          nodeGraphXyPadResetCanvas(nodeId);
        }
      });
    }
  }
  popover.dataset.displaySettingsType = type;
  popover.dataset.displaySettingsTargetNode = node?.id ? String(node.id) : "";
  popover.dataset.displaySettingsBodyType = type;
  // Stereo Trace Left/Right aria on color hosts (Output, SoEmReverb, …).
  const isStereoTraceNode = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
    ? nodeGraphModuleUsesStereoTraceDisplay(node?.type)
    : node?.type === "output";
  if (isStereoTraceNode && type === "trace") {
    const leftColorHost = host.querySelector(`[data-trace-display-color-widget="dot1Color"]`);
    if (leftColorHost) {
      leftColorHost.setAttribute("aria-label", "Left color");
    }
    const rightColorHost = host.querySelector(`[data-trace-display-color-widget="secondaryColor"]`);
    if (rightColorHost) {
      rightColorHost.setAttribute("aria-label", "Right color");
    }
  }
  if (nodeGraphDisplaySettingsFormTypeUsesGradient(type)) {
    syncNodeGraphSharedGradientEditor(popover, true);
  }
  applyNodeGraphTraceDisplaySettingsTooltips(popover);
  syncNodeGraphTraceDisplayColorWidgets(popover);
}

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
      <div class="metadata-section-title node-trace-display-mode-title">Mode</div>
      <div class="metadata-field-section node-trace-display-mode-section">
        <label>
          <span>Mode</span>
          <select id="nodeTraceDisplayModeSelect" data-trace-display-mode-select></select>
        </label>
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
  setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
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

function setNodeGraphTraceDisplayModeSelectorVisible(popover, visible) {
  if (!popover) {
    return;
  }
  for (const element of popover.querySelectorAll(".node-trace-display-mode-title, .node-trace-display-mode-section")) {
    element.hidden = !visible;
  }
}

function syncNodeGraphTraceDisplayModeSelector(node = null) {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  const select = document.getElementById("nodeTraceDisplayModeSelect");
  if (!popover || !select || !node?.type || nodeGraphTraceDisplaySettingsEditingGlobal()) {
    setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
    return;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  // One mode (e.g. Lorenz phosphor-only) → no Mode control.
  if (modes.length <= 1) {
    setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
    return;
  }
  const selectedMode = nodeGraphModuleSelectedDisplayMode(node);
  const selectedKey = selectedMode?.key || nodeGraphModuleDefaultDisplayModeKeyForType(node.type);
  select.innerHTML = modes
    .map((mode) => `<option value="${String(mode.key).replace(/"/g, "&quot;")}">${String(mode.label || mode.key)}</option>`)
    .join("");
  select.value = selectedKey;
  select.dataset.displayModeTargetNode = String(node.id || "");
  setNodeGraphTraceDisplayModeSelectorVisible(popover, true);
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
  syncNodeGraphTraceDisplayModeSelector(node);
  // Schema-exclusive body: rebuild so only this form type's controls exist.
  // Avoid remount when already mounted for same type+node (mode selector
  // re-entry / write cycles would thrash color widgets).
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

function nodeGraphDisplaySettingsDefaultsForFormType(type = nodeGraphTraceDisplaySettingsFormType()) {
  // When editing a specific module, apply per-type scope2d overrides (e.g. Lorenz size).
  const targetNode = !nodeGraphTraceDisplaySettingsEditingTraceDefaults()
    && !nodeGraphTraceDisplaySettingsEditingGlobal()
    ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())
    : null;
  const scope2dDefaults = typeof nodeGraphScope2dSettingsDefaultsForModuleType === "function"
    ? nodeGraphScope2dSettingsDefaultsForModuleType(targetNode?.type)
    : nodeGraphScope2dSettingsDefaults;
  if (type === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(nodeGraphZeroDBurnSettingsDefaults);
  }
  if (type === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(nodeGraphValueOscilloscopeSettingsDefaults);
  }
  if (type === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(nodeGraphLineBurnSettingsDefaults);
  }
  if (type === "scope2d") {
    return normalizeNodeGraphScope2dSettings(scope2dDefaults, scope2dDefaults);
  }
  if (type === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(nodeGraphScope2dTraceSettingsDefaults);
  }
  if (type === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(nodeGraphNumberReadoutSettingsDefaults);
  }
  if (type === "knobFace") {
    return normalizeNodeGraphKnobFaceDisplaySettings(
      nodeGraphKnobFaceDisplaySettingsDefaults,
    );
  }
  if (type === "xyPad") {
    return normalizeNodeGraphXyPadDisplaySettings(nodeGraphXyPadDisplaySettingsDefaults);
  }
  // phosphorLight form type is an alias of scope2d (legacy module).
  if (type === "phosphorLight") {
    return normalizeNodeGraphScope2dSettings(scope2dDefaults, scope2dDefaults);
  }
  if (
    type === "videoscopeBurn"
    || type === "oscilloscopeBankBurn"
    || type === "hypersawBurn"
  ) {
    return normalizeNodeGraphScope2dSettings(nodeGraphScope2dSettingsDefaults);
  }
  if (type === "spectrogramBurn") {
    return normalizeNodeGraphSpectrogramSettings(nodeGraphSpectrogramSettingsDefaults);
  }
  if (type === "ledLamp") {
    return typeof normalizeNodeGraphLedLayout === "function"
      ? normalizeNodeGraphLedLayout()
      : { hue: 0, brightness: 1, blur: 0, rounding: 100, cornerShape: "squircle" };
  }
  if (type === "rgbShapeFace") {
    return typeof normalizeNodeGraphRgbShapeSettings === "function"
      ? normalizeNodeGraphRgbShapeSettings()
      : { background: "#000000", gradientStops: [] };
  }
  if (type === "rgbPictureFace") {
    return typeof normalizeNodeGraphRgbPictureSettings === "function"
      ? normalizeNodeGraphRgbPictureSettings()
      : { background: "#000000", dataUrl: "", fileName: "" };
  }
  if (type === "rgbFractalFace") {
    return typeof normalizeNodeGraphRgbFractalSettings === "function"
      ? normalizeNodeGraphRgbFractalSettings()
      : { background: "#05060a", gradientStops: [] };
  }
  if (type === "fbmFieldFace") {
    return typeof normalizeNodeGraphFbmFieldSettings === "function"
      ? normalizeNodeGraphFbmFieldSettings()
      : { background: "#05060a", gradientStops: [] };
  }
  if (type === "matrixFace" || type === "matrixWaterfallFace" || type === "matrixDisplayFace") {
    return typeof normalizeNodeGraphMatrixFaceSettings === "function"
      ? normalizeNodeGraphMatrixFaceSettings(null, type)
      : (typeof normalizeNodeGraphAsciiscope === "function"
        ? normalizeNodeGraphAsciiscope(null)
        : { glyphTable: ".", message: "READY" });
  }
  return normalizeNodeGraphTraceDisplaySettings(nodeGraphTraceDisplaySettingsDefaults);
}

function nodeGraphDisplaySettingsDefaultValue(key) {
  return Number(nodeGraphDisplaySettingsFormValue(nodeGraphDisplaySettingsDefaultsForFormType(), key)) || 0;
}

function normalizeNodeGraphDisplaySettingsForFormType(settings, type = nodeGraphTraceDisplaySettingsFormType()) {
  if (type === "spectrogramBurn") {
    const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
    return normalizeNodeGraphSpectrogramSettings(settings, node);
  }
  if (type === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(settings);
  }
  if (type === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(settings);
  }
  if (type === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(settings);
  }
  if (type === "scope2d") {
    return normalizeNodeGraphScope2dSettings(settings);
  }
  if (type === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(settings);
  }
  if (type === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(settings);
  }
  if (type === "knobFace") {
    return normalizeNodeGraphKnobFaceDisplaySettings(settings);
  }
  if (type === "xyPad") {
    return normalizeNodeGraphXyPadDisplaySettings(settings);
  }
  if (type === "phosphorLight") {
    return normalizeNodeGraphScope2dSettings(settings);
  }
  // Videoscope / bank / hypersaw: energy phosphor (scope2d settings model).
  if (
    type === "videoscopeBurn"
    || type === "oscilloscopeBankBurn"
    || type === "hypersawBurn"
  ) {
    return normalizeNodeGraphScope2dSettings(settings);
  }
  if (type === "ledLamp") {
    // Map shared form field names → LED model keys (incl. gradientStops).
    const raw = settings && typeof settings === "object" ? settings : {};
    return typeof normalizeNodeGraphLedLayout === "function"
      ? normalizeNodeGraphLedLayout({
        ...raw,
        brightness: raw.brightness ?? raw.dot1Brightness,
        blur: raw.blur ?? raw.lineThickness,
        gradientStops: raw.gradientStops ?? raw.gradient,
        hue: raw.hue,
        rounding: raw.rounding,
        cornerShape: raw.cornerShape,
      })
      : raw;
  }
  if (type === "rgbShapeFace") {
    return typeof normalizeNodeGraphRgbShapeSettings === "function"
      ? normalizeNodeGraphRgbShapeSettings(settings)
      : (settings || {});
  }
  if (type === "rgbPictureFace") {
    return typeof normalizeNodeGraphRgbPictureSettings === "function"
      ? normalizeNodeGraphRgbPictureSettings(settings)
      : (settings || {});
  }
  if (type === "rgbFractalFace") {
    return typeof normalizeNodeGraphRgbFractalSettings === "function"
      ? normalizeNodeGraphRgbFractalSettings(settings)
      : (settings || {});
  }
  if (type === "fbmFieldFace") {
    return typeof normalizeNodeGraphFbmFieldSettings === "function"
      ? normalizeNodeGraphFbmFieldSettings(settings)
      : (settings || {});
  }
  if (type === "matrixFace" || type === "matrixWaterfallFace" || type === "matrixDisplayFace") {
    return typeof normalizeNodeGraphMatrixFaceSettings === "function"
      ? normalizeNodeGraphMatrixFaceSettings(settings, type)
      : (typeof normalizeNodeGraphAsciiscope === "function"
        ? normalizeNodeGraphAsciiscope(settings)
        : settings || {});
  }
  return normalizeNodeGraphTraceDisplaySettings(settings);
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

function nodeGraphTraceDisplayCurrentSettingsForFormType(formType = nodeGraphTraceDisplaySettingsFormType()) {
  if (nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    return nodeGraphGlobalTraceSettings();
  }
  const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return nodeGraphDisplaySettingsDefaultsForFormType(formType);
  }
  const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
  if (settingsSchema === "dot") {
    return normalizeNodeGraphZeroDBurnSettings(node.zeroDBurnSettings);
  }
  if (settingsSchema === "lineBurn") {
    return normalizeNodeGraphLineBurnSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "value") {
    return normalizeNodeGraphValueOscilloscopeSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "scope2d") {
    const typeDefaults = typeof nodeGraphScope2dSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dSettingsDefaultsForModuleType(node?.type)
      : null;
    return normalizeNodeGraphScope2dSettings(node.traceDisplaySettings, typeDefaults);
  }
  if (settingsSchema === "scope2dTrace") {
    return normalizeNodeGraphScope2dTraceSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "phosphorLight") {
    const normalize = typeof normalizeNodeGraphPhosphorLightSettings === "function"
      ? normalizeNodeGraphPhosphorLightSettings
      : (value) => value || {};
    return normalize(node.traceDisplaySettings);
  }
  if (settingsSchema === "numberReadout") {
    return normalizeNodeGraphNumberReadoutSettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "knobFace") {
    return nodeGraphKnobFaceDisplaySettingsForNode(node);
  }
  if (settingsSchema === "xyPad") {
    return normalizeNodeGraphXyPadDisplaySettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "ledLamp") {
    return typeof normalizeNodeGraphLedLayout === "function"
      ? normalizeNodeGraphLedLayout(node.led)
      : (node.led || {});
  }
  if (settingsSchema === "rgbShapeFace") {
    return typeof nodeGraphRgbShapeSettingsForNode === "function"
      ? nodeGraphRgbShapeSettingsForNode(node)
      : normalizeNodeGraphRgbShapeSettings?.(node?.traceDisplaySettings);
  }
  if (settingsSchema === "rgbPictureFace") {
    return typeof nodeGraphRgbPictureSettingsForNode === "function"
      ? nodeGraphRgbPictureSettingsForNode(node)
      : normalizeNodeGraphRgbPictureSettings?.(node?.rgbPicture || node?.traceDisplaySettings);
  }
  if (settingsSchema === "rgbFractalFace") {
    return typeof nodeGraphRgbFractalSettingsForNode === "function"
      ? nodeGraphRgbFractalSettingsForNode(node)
      : normalizeNodeGraphRgbFractalSettings?.(node?.traceDisplaySettings);
  }
  if (settingsSchema === "fbmFieldFace") {
    return typeof nodeGraphFbmFieldSettingsForNode === "function"
      ? nodeGraphFbmFieldSettingsForNode(node)
      : normalizeNodeGraphFbmFieldSettings?.(node?.traceDisplaySettings);
  }
  if (
    settingsSchema === "matrixFace"
    || settingsSchema === "matrixWaterfallFace"
    || settingsSchema === "matrixDisplayFace"
  ) {
    if (typeof nodeGraphMatrixStoreFromNode === "function") {
      return nodeGraphMatrixStoreFromNode(node);
    }
    if (typeof nodeGraphMatrixFaceStoreFromNode === "function") {
      return nodeGraphMatrixFaceStoreFromNode(node);
    }
    return typeof normalizeNodeGraphAsciiscope === "function"
      ? normalizeNodeGraphAsciiscope(node?.matrixDisplay || node?.matrixWaterfall)
      : { glyphTable: ".", message: "READY" };
  }
  if (settingsSchema === "spectrogramBurn") {
    const merged = { ...(node.traceDisplaySettings || {}) };
    if (merged.fftSize == null && node.params?.fftSize != null) {
      merged.fftSize = node.params.fftSize;
    }
    return normalizeNodeGraphSpectrogramSettings(merged, node);
  }
  if (
    settingsSchema === "videoscopeBurn"
    || settingsSchema === "oscilloscopeBankBurn"
    || settingsSchema === "hypersawBurn"
  ) {
    return normalizeNodeGraphScope2dSettings(node.traceDisplaySettings);
  }
  // Per-node Trace schema: Output stereo + multi-mode Display (monoTrace).
  // Plain Trace modules use the shared global bucket (editingTraceDefaults).
  if (
    settingsSchema === "trace" &&
    (node?.type === "output" || node?.type === "visualOscilloscope")
  ) {
    return nodeGraphTraceDisplaySettingsForNode(node);
  }
  return nodeGraphGlobalTraceSettings();
}

function readNodeGraphTraceDisplaySettingsForm() {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const root = nodeGraphTraceDisplaySettingsRoot();
  const current = normalizeNodeGraphDisplaySettingsForFormType(
    nodeGraphTraceDisplayCurrentSettingsForFormType(formType),
    formType,
  );
  // LED uses its own range / corner controls (data-led-*), not the stepper form.
  if (formType === "ledLamp") {
    const panel = root?.querySelector?.("[data-led-display-settings-panel]") || root;
    const next = { ...current };
    for (const key of ["brightness", "blur", "rounding", "fillPercent"]) {
      const input = panel?.querySelector?.(`[data-led-field="${key}"]`);
      if (input) {
        next[key] = Number(input.value);
      }
    }
    const activeCorner = panel?.querySelector?.("[data-led-corner].active, [data-led-corner][aria-pressed='true']");
    if (activeCorner) {
      next.cornerShape = activeCorner.getAttribute("data-led-corner") === "square"
        ? "square"
        : "squircle";
    }
    // Gradient editor writes via applyNodeGraphTraceDisplaySettingsForm — must
    // not early-return before pulling stops (was the bright→dim failure mode).
    if (nodeGraphDisplaySettingsFormTypeUsesGradient(formType)) {
      const editor = typeof NodeGraphGradientSelector !== "undefined"
        ? NodeGraphGradientSelector.getActive?.()
        : (nodeGraphMvp?.gradientSelector
          || nodeGraphMvp?.spectrogramGradientEditor
          || nodeGraphMvp?.sharedGradientEditor);
      if (editor && typeof editor.getStops === "function") {
        next.gradientStops = editor.getStops();
      }
    }
    return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
  }
  // Matrix Waterfall / Matrix Display custom form bodies.
  if (
    formType === "matrixFace"
    || formType === "matrixWaterfallFace"
    || formType === "matrixDisplayFace"
  ) {
    if (typeof readNodeGraphMatrixFaceDisplaySettingsForm === "function") {
      return readNodeGraphMatrixFaceDisplaySettingsForm(root, current);
    }
    return normalizeNodeGraphDisplaySettingsForFormType(current, formType);
  }
  const next = { ...current };
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", formType);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", formType);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", formType);
  for (const key of activeFields) {
    const input = root?.querySelector?.(`[data-trace-display-field="${key}"]`);
    if (input) {
      const sanitizedValue = typeof sanitizeNodeGraphNumericText === "function"
        ? sanitizeNodeGraphNumericText(input.value)
        : String(input.value ?? "").trim();
      if (sanitizedValue && sanitizedValue !== input.value) {
        input.value = sanitizedValue;
      }
      next[key] = sanitizedValue;
      if (key === "dot1Brightness") {
        next.brightness = sanitizedValue;
      }
    }
  }
  for (const key of activeColors) {
    const input = root?.querySelector?.(`[data-trace-display-color="${key}"]`);
    if (input) {
      next[key] = input.value;
      if (key === "dot1Color") {
        next.color = input.value;
      }
      if (key === "backgroundColor") {
        next.background = input.value;
      }
      if (key === "ghostColor") {
        next.ghostColor = input.value;
      }
    }
  }
  // Meet always derived from Left/Right (no manual override / Auto checkbox).
  next.meetColor = "auto";
  for (const key of activeToggles) {
    const input = root?.querySelector?.(`[data-trace-display-toggle="${key}"]`);
    if (input) {
      next[key] = input.checked;
    }
  }
  for (const key of activeChoices) {
    const input = root?.querySelector?.(`[data-trace-display-choice="${key}"]`);
    if (input) {
      next[key] = input.value;
    }
  }
  // Shared gradient stops — always from the single active selector instance.
  if (nodeGraphDisplaySettingsFormTypeUsesGradient(formType)) {
    const editor = typeof NodeGraphGradientSelector !== "undefined"
      ? NodeGraphGradientSelector.getActive?.()
      : (nodeGraphMvp?.gradientSelector
        || nodeGraphMvp?.spectrogramGradientEditor
        || nodeGraphMvp?.sharedGradientEditor);
    if (editor && typeof editor.getStops === "function") {
      next.gradientStops = editor.getStops();
    }
  }
  // Output: choice is source of truth. Non-output: checkbox maps to off/mono.
  if (next.syncChannel) {
    next.sourceSync = next.syncChannel !== "off";
  } else if (next.sourceSync === true) {
    next.syncChannel = "mono";
  } else if (next.sourceSync === false) {
    next.syncChannel = "off";
  }
  return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
}

function nodeGraphDisplaySettingsFormValue(settings, key) {
  if (key === "dot1Brightness") {
    return settings.dot1Brightness ?? settings.brightness;
  }
  // LED blur reuses the Blur field key.
  if (key === "lineThickness" && nodeGraphTraceDisplaySettingsFormType() === "ledLamp") {
    return settings.blur ?? settings.lineThickness;
  }
  if (key === "dot1Color") {
    return settings.dot1Color ?? settings.color;
  }
  if (key === "backgroundColor") {
    return settings.backgroundColor ?? settings.background;
  }
  if (key === "ghostColor") {
    return settings.ghostColor;
  }
  if (key === "syncChannel") {
    return nodeGraphTraceDisplaySyncChannel(settings);
  }
  return settings[key];
}

function writeNodeGraphTraceDisplaySettingsForm(settings) {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const root = nodeGraphTraceDisplaySettingsRoot();
  const normalized = normalizeNodeGraphDisplaySettingsForFormType(settings, formType);
  // LED uses dedicated range controls — not the generic stepper writers.
  if (formType === "ledLamp") {
    if (typeof syncNodeGraphLedDisplaySettingsControls === "function") {
      const panel = root?.querySelector?.("[data-led-display-settings-panel]") || root;
      syncNodeGraphLedDisplaySettingsControls(panel, normalized);
    }
    if (nodeGraphDisplaySettingsFormTypeUsesGradient(formType)) {
      const editor = typeof NodeGraphGradientSelector !== "undefined"
        ? NodeGraphGradientSelector.getActive?.()
        : (nodeGraphMvp?.gradientSelector
          || nodeGraphMvp?.spectrogramGradientEditor
          || nodeGraphMvp?.sharedGradientEditor);
      if (editor && typeof editor.setStops === "function" && normalized.gradientStops) {
        editor.setStops(normalized.gradientStops);
      }
    }
    return;
  }
  if (formType === "rgbPictureFace") {
    if (typeof syncNodeGraphRgbPictureDisplaySettingsControls === "function") {
      syncNodeGraphRgbPictureDisplaySettingsControls(root);
    }
    return;
  }
  if (
    formType === "matrixFace"
    || formType === "matrixWaterfallFace"
    || formType === "matrixDisplayFace"
  ) {
    if (typeof syncNodeGraphMatrixFaceDisplaySettingsControls === "function") {
      const panel = root?.querySelector?.("[data-matrix-face-settings-panel]") || root;
      syncNodeGraphMatrixFaceDisplaySettingsControls(panel, normalized);
    }
    if (nodeGraphDisplaySettingsFormTypeUsesGradient(formType)) {
      const editor = typeof NodeGraphGradientSelector !== "undefined"
        ? NodeGraphGradientSelector.getActive?.()
        : (nodeGraphMvp?.gradientSelector
          || nodeGraphMvp?.spectrogramGradientEditor
          || nodeGraphMvp?.sharedGradientEditor);
      if (editor && typeof editor.setStops === "function" && normalized.gradientStops) {
        editor.setStops(normalized.gradientStops);
      }
    }
    return;
  }
  const activeFields = nodeGraphTraceDisplayActiveControlSet("fields", formType);
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  const activeToggles = nodeGraphTraceDisplayActiveControlSet("toggles", formType);
  const activeChoices = nodeGraphTraceDisplayActiveControlSet("choices", formType);
  for (const key of activeFields) {
    const input = root?.querySelector?.(`[data-trace-display-field="${key}"]`);
    if (input) {
      input.value = formatNodeGraphTraceDisplaySetting(nodeGraphDisplaySettingsFormValue(normalized, key));
      input.readOnly = true;
      input.classList.toggle("trace-display-field-editing", false);
    }
  }
  for (const key of activeColors) {
    const input = root?.querySelector?.(`[data-trace-display-color="${key}"]`);
    if (input) {
      input.value = nodeGraphDisplaySettingsFormValue(normalized, key);
    }
  }
  for (const key of activeToggles) {
    const input = root?.querySelector?.(`[data-trace-display-toggle="${key}"]`);
    if (input) {
      input.checked = Boolean(normalized[key]);
    }
  }
  for (const key of activeChoices) {
    const input = root?.querySelector?.(`[data-trace-display-choice="${key}"]`);
    if (input) {
      input.value = String(nodeGraphDisplaySettingsFormValue(normalized, key) ?? "");
    }
  }
  if (nodeGraphDisplaySettingsFormTypeUsesGradient(formType)) {
    const editor = typeof NodeGraphGradientSelector !== "undefined"
      ? NodeGraphGradientSelector.getActive?.()
      : (nodeGraphMvp?.gradientSelector
        || nodeGraphMvp?.spectrogramGradientEditor
        || nodeGraphMvp?.sharedGradientEditor);
    if (editor && typeof editor.setStops === "function" && normalized.gradientStops) {
      editor.setStops(normalized.gradientStops);
    }
  }
  syncNodeGraphTraceDisplayColorWidgets(
    document.getElementById("nodeTraceDisplaySettingsPopover"),
  );
}

/**
 * Mount / hide the gradient selector in display settings.
 * Implementation lives entirely in NodeGraphGradientSelector (single truth).
 */
function syncNodeGraphSharedGradientEditor(popover, visible) {
  if (typeof NodeGraphGradientSelector !== "undefined"
    && typeof NodeGraphGradientSelector.syncDisplaySettings === "function") {
    return NodeGraphGradientSelector.syncDisplaySettings(popover, visible);
  }
  // Selector script missing — no second UI implementation here.
  const host = popover?.querySelector?.("[data-gradient-selector-host]");
  if (host && !visible) {
    host.replaceChildren();
  }
  return null;
}

/** @deprecated alias — use syncNodeGraphSharedGradientEditor / NodeGraphGradientSelector */
function syncNodeGraphSpectrogramGradientEditor(popover, visible) {
  return syncNodeGraphSharedGradientEditor(popover, visible);
}

function nodeGraphTraceDisplayStepperQuantum(input) {
  if (!input) {
    return 0.1;
  }
  if (["cycles", "decimals"].includes(input.dataset?.traceDisplayField)) {
    return 1;
  }
  if (input.dataset?.traceDisplayField === "dotBudget") {
    return 64;
  }
  if (input.dataset?.traceDisplayField === "bins") {
    return 8;
  }
  if (input.dataset?.traceDisplayField === "fftSize") {
    return 1; // stepped via table in stepNodeGraphTraceDisplaySetting
  }
  // History (s): control-space step (exp map) — fine near short windows.
  if (
    input.dataset?.traceDisplayField === "historySeconds"
    || input.dataset?.traceDisplayField === "zoomSeconds"
  ) {
    return 0.025;
  }
  if (input.dataset?.traceDisplayField === "pixelDensity") {
    return 0.05;
  }
  if (input.dataset?.traceDisplayField === "sweepSeconds") {
    return 0.05;
  }
  if (input.dataset?.traceDisplayField === "sweepHz") {
    return 0.05;
  }
  return 0.1;
}

function nodeGraphTraceDisplaySizeControlField(key) {
  return ["dot1Size", "secondarySize", "capSize"].includes(key);
}

/** History window fields (seconds) — use exponential control mapping. */
function nodeGraphTraceDisplayHistoryControlField(key) {
  return key === "historySeconds" || key === "zoomSeconds";
}

function nodeGraphTraceDisplaySensitiveControlField(key) {
  return nodeGraphTraceDisplaySizeControlField(key) ||
    nodeGraphTraceDisplayHistoryControlField(key) ||
    key === "pixelDensity" ||
    ["dot1Brightness", "secondaryBrightness"].includes(key);
}

const nodeGraphTraceDisplaySensitiveControlExponent = 3;
/** History: stronger exp so most useful short windows sit near control 0. */
const nodeGraphTraceDisplayHistoryControlExponent = 3.5;

function nodeGraphTraceDisplaySensitiveControlMax(key) {
  if (key === "pixelDensity") {
    return 4;
  }
  // Bright is 0…1 energy app-wide (1 = full tip / full deposit).
  return 1;
}

/** Seconds range for History (s) by form type. */
function nodeGraphTraceDisplayHistoryControlRange(key) {
  const formType = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  if (key === "historySeconds" && formType === "spectrogramBurn") {
    return { min: 0.1, max: 30 };
  }
  const maxZ = Number(typeof nodeGraphTraceDisplayMaxZoomSeconds !== "undefined"
    ? nodeGraphTraceDisplayMaxZoomSeconds
    : 10);
  return { min: 0, max: Number.isFinite(maxZ) && maxZ > 0 ? maxZ : 10 };
}

/**
 * Map stored seconds → 0…1 control. Exponential so short windows have fine drag.
 * min≤0: t = (s/max)^(1/exp); min>0: t = log(s/min)/log(max/min).
 */
function nodeGraphTraceDisplaySecondsToControlValue(seconds, min, max) {
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo + 1e-9, Number(max) || 10);
  const s = clampNodeSliderValue(Number(seconds) || 0, lo, hi);
  const exp = nodeGraphTraceDisplayHistoryControlExponent;
  if (lo <= 0) {
    if (s <= 0) {
      return 0;
    }
    return Math.pow(s / hi, 1 / exp);
  }
  return Math.log(Math.max(lo, s) / lo) / Math.log(hi / lo);
}

/** Map 0…1 control → stored seconds (inverse of SecondsToControl). */
function nodeGraphTraceDisplayControlToSecondsValue(control, min, max) {
  const t = clampNodeSliderValue(Number(control) || 0, 0, 1);
  const lo = Math.max(0, Number(min) || 0);
  const hi = Math.max(lo + 1e-9, Number(max) || 10);
  const exp = nodeGraphTraceDisplayHistoryControlExponent;
  if (lo <= 0) {
    return Math.pow(t, exp) * hi;
  }
  return lo * Math.pow(hi / lo, t);
}

function nodeGraphTraceDisplaySizeToControlValue(value, max = 1) {
  return Math.pow(
    clampNodeSliderValue(Number(value) || 0, 0, max) / max,
    1 / nodeGraphTraceDisplaySensitiveControlExponent,
  );
}

function nodeGraphTraceDisplayControlToSizeValue(value, max = 1) {
  const control = clampNodeSliderValue(Number(value) || 0, 0, 1);
  return Math.pow(control, nodeGraphTraceDisplaySensitiveControlExponent) * max;
}

function adjustNodeGraphTraceDisplaySettingByControlDelta(key, startValue, delta) {
  // History (s): exp control-space so most useful short windows sit near 0.
  if (nodeGraphTraceDisplayHistoryControlField(key)) {
    const { min, max } = nodeGraphTraceDisplayHistoryControlRange(key);
    return nodeGraphTraceDisplayControlToSecondsValue(
      nodeGraphTraceDisplaySecondsToControlValue(startValue, min, max) + delta,
      min,
      max,
    );
  }
  if (!nodeGraphTraceDisplaySensitiveControlField(key)) {
    return startValue + delta;
  }
  const max = nodeGraphTraceDisplaySensitiveControlMax(key);
  return nodeGraphTraceDisplayControlToSizeValue(
    nodeGraphTraceDisplaySizeToControlValue(startValue, max) + delta,
    max,
  );
}

function nodeGraphTraceDisplayNumberDragMultiplier(event) {
  return typeof nodeGraphNumericDragMultiplier === "function"
    ? nodeGraphNumericDragMultiplier(event)
    : 1;
}

function setNodeGraphTraceDisplayZoomEditActive(active) {
  nodeGraphMvp.traceDisplayZoomEditActive = Boolean(active);
}

function nodeGraphTraceDisplayClampUnit(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphTraceDisplayClampNonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

/** History / zoom window: 0 … nodeGraphTraceDisplayMaxZoomSeconds (10 s). */
function nodeGraphTraceDisplayClampHistorySeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return clampNodeSliderValue(n, 0, nodeGraphTraceDisplayMaxZoomSeconds);
}

/** Display Bright 0…1 (1 = full energy / gradient tip). Legacy 0…2 values clamp to 1. */
function nodeGraphTraceDisplayClampBrightness(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphTraceDisplayClampPixelDensity(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 4);
}

// Stamp blur 0–1 (hard→soft). Migrates legacy signed -1..1 patch values.
function nodeGraphTraceDisplayClampStampBlur(value) {
  if (typeof PhosphorDrawer !== "undefined" && PhosphorDrawer?.normalizeBlur) {
    return PhosphorDrawer.normalizeBlur(value, 0.35);
  }
  let v = Number(value);
  if (!Number.isFinite(v)) return 0.35;
  if (v < 0) v = (Math.max(-1, v) + 1) * 0.5;
  return clampNodeSliderValue(v, 0, 1);
}

function nodeGraphTraceDisplayClampDotBudget(value) {
  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n)) {
    return 2048;
  }
  return Math.max(64, Math.min(8192, n));
}

// Clamp rules shared by every display-settings form type, keyed by field name.
// Each entry owns exactly one field's rule — adding/changing a rule for one
// display type cannot silently change behavior for another.
const nodeGraphTraceDisplaySharedValueClamps = Object.freeze({
  ghost: nodeGraphTraceDisplayClampUnit,
  capLength: nodeGraphTraceDisplayClampUnit,
  capSize: nodeGraphTraceDisplayClampUnit,
  cycles: (value) => Math.max(1, Math.min(64, Math.round(Number(value) || 0))),
  trail: nodeGraphTraceDisplayClampUnit,
  dotBudget: nodeGraphTraceDisplayClampDotBudget,
  decimals: (value) => Math.max(0, Math.min(8, Math.round(Number(value) || 0))),
  dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  dot1Size: nodeGraphTraceDisplayClampUnit,
  ghost: nodeGraphTraceDisplayClampUnit,
  historySeconds: nodeGraphTraceDisplayClampHistorySeconds,
  lineLength: nodeGraphTraceDisplayClampUnit,
  lineThickness: nodeGraphTraceDisplayClampNonNegative,
  pixelDensity: nodeGraphTraceDisplayClampPixelDensity,
  puckSize: (value) => clampNodeSliderValue(Number(value) || 0, 0.005, 0.25),
  scale: nodeGraphTraceDisplayClampNonNegative,
  secondaryBrightness: nodeGraphTraceDisplayClampBrightness,
  secondaryLineThickness: nodeGraphTraceDisplayClampNonNegative,
  secondarySize: nodeGraphTraceDisplayClampUnit,
  // 1D Burn Dot: seconds for one left→right pass.
  sweepSeconds: nodeGraphTraceDisplayClampSweepSeconds,
  // Legacy Hz field (migrated on load); keep clamp if old UI still posts it.
  sweepHz: (value) => clampNodeSliderValue(Number(value) || 0, 0.01, 100),
  fftSize: (value) => (typeof nodeGraphSpectrogramSnapFftSize === "function"
    ? nodeGraphSpectrogramSnapFftSize(value)
    : 1024),
  zoomSeconds: nodeGraphTraceDisplayClampHistorySeconds,
});

// Per-formType overrides, only for the (formType, field) pairs that diverge
// from the shared table above. Isolated per formType so a new override can't
// leak into unrelated display types.
const nodeGraphTraceDisplayFormTypeValueClampOverrides = Object.freeze({
  // Spectrogram: History (s) 0…30 (waterfall scroll rate; longer = slower).
  spectrogramBurn: Object.freeze({
    historySeconds: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 2;
      // 0 is not meaningful (was silently treated as ~0.05 s).
      if (n <= 0) return 0.1;
      return clampNodeSliderValue(n, 0.1, 30);
    },
  }),
  // LED lamp: hue degrees, blur 0–1, rounding %, brightness 0–1.
  ledLamp: Object.freeze({
    hue: (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return ((n % 360) + 360) % 360;
    },
    lineThickness: nodeGraphTraceDisplayClampUnit,
    rounding: (value) => clampNodeSliderValue(Number(value) || 0, 0, 100),
    dot1Brightness: nodeGraphTraceDisplayClampBrightness,
  }),
  // Phosphor Dot: same blur continuum as 2D Phosphor stamps.
  dot: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  // 1D Burn Dot: stamp blur + sweep rate.
  lineBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  // Soft phosphor stamps: blur 0 hard … 1 full soft.
  scope2d: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  phosphorLight: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  videoscopeBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  oscilloscopeBankBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  hypersawBurn: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  xyPad: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  scope2dTrace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
  // 1D Trace / Output: blur 0 hard … 1 soft skirt (instant, no persistence).
  trace: Object.freeze({
    lineThickness: nodeGraphTraceDisplayClampStampBlur,
    secondaryLineThickness: nodeGraphTraceDisplayClampStampBlur,
  }),
});

function normalizeNodeGraphTraceDisplaySettingValueForKey(key, value) {
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const clamp = nodeGraphTraceDisplayFormTypeValueClampOverrides[formType]?.[key] ||
    nodeGraphTraceDisplaySharedValueClamps[key];
  return clamp ? clamp(value) : value;
}

function nodeGraphTraceDisplayFieldFromTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest?.("[data-trace-display-field]") || null;
}

function setNodeGraphTraceDisplayFieldEditing(input, editing) {
  if (!input) {
    return;
  }
  input.readOnly = !editing;
  input.classList.toggle("trace-display-field-editing", Boolean(editing));
  if (editing) {
    input.focus();
    input.select?.();
  }
}

function nodeGraphTraceDisplayEditingField() {
  const root = nodeGraphTraceDisplaySettingsRoot();
  return root?.querySelector?.("[data-trace-display-field].trace-display-field-editing")
    || root?.querySelector?.("[data-trace-display-field]:not([readonly])")
    || null;
}

function beginNodeGraphTraceDisplayFieldEdit(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input) {
    return;
  }
  // Commit any other field still in edit mode.
  const prev = nodeGraphTraceDisplayEditingField();
  if (prev && prev !== input && !prev.readOnly) {
    commitNodeGraphTraceDisplayFieldEdit(prev);
  }
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  setNodeGraphTraceDisplayFieldEditing(input, true);
  event.preventDefault();
  event.stopPropagation();
}

/** Commit typed value and leave edit mode (Enter / focus leave / click outside). */
function commitNodeGraphTraceDisplayFieldEdit(input) {
  if (!input || input.readOnly) {
    return;
  }
  setNodeGraphTraceDisplayFieldEditing(input, false);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  if (input.dataset.traceDisplayField === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  input.value = formatNodeGraphTraceDisplaySetting(
    nodeGraphDisplaySettingsFormValue(
      normalizeNodeGraphDisplaySettingsForFormType(nodeGraphTraceDisplayCurrentSettingsForFormType()),
      input.dataset.traceDisplayField,
    ),
  );
}

function finishNodeGraphTraceDisplayFieldEdit(event) {
  // focusout bubbles (blur does not) — use event.target as the field that lost focus.
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || input.readOnly) {
    return;
  }
  // Still focused within the same field (e.g. internal) — skip.
  const next = event.relatedTarget;
  if (next instanceof Node && input.contains(next)) {
    return;
  }
  commitNodeGraphTraceDisplayFieldEdit(input);
}

function handleNodeGraphTraceDisplayFieldEditKeydown(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || input.readOnly) {
    return;
  }
  if (event.key === "Enter") {
    // Commit immediately — do not rely on blur (parent blur listeners never see it).
    event.preventDefault();
    event.stopPropagation();
    commitNodeGraphTraceDisplayFieldEdit(input);
    input.blur();
  } else if (event.key === "Escape") {
    if (input.dataset.traceDisplayField === "zoomSeconds") {
      setNodeGraphTraceDisplayZoomEditActive(false);
    }
    writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType());
    setNodeGraphTraceDisplayFieldEditing(input, false);
    input.blur();
    event.preventDefault();
    event.stopPropagation();
  } else {
    event.stopPropagation();
  }
}

/** Click / pointer outside an editing field commits it (including outside the window). */
function handleNodeGraphTraceDisplayFieldEditPointerDown(event) {
  const editing = nodeGraphTraceDisplayEditingField();
  if (!editing || editing.readOnly) {
    return;
  }
  const target = event.target;
  if (target instanceof Node && (editing === target || editing.contains(target))) {
    return;
  }
  // Allow steppers for this field without fighting the click.
  if (
    target instanceof Element
    && target.closest?.(`[data-trace-display-step-target="${editing.dataset.traceDisplayField}"]`)
  ) {
    commitNodeGraphTraceDisplayFieldEdit(editing);
    return;
  }
  commitNodeGraphTraceDisplayFieldEdit(editing);
  // Don't steal the click from other UI — just end text edit.
}

function preventNodeGraphTraceDisplayReadonlyFieldTextInteraction(event) {
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  if (event.type === "focusin") {
    input.blur();
    return;
  }
  event.preventDefault();
}

function beginNodeGraphTraceDisplayFieldDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  const input = nodeGraphTraceDisplayFieldFromTarget(event.target);
  if (!input || !input.readOnly) {
    return;
  }
  const key = input.dataset.traceDisplayField;
  if (typeof nodeGraphNumericModifierReserved === "function" && nodeGraphNumericModifierReserved(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(true);
  }
  nodeGraphMvp.traceDisplayFieldDragging = {
    input,
    key,
    pointerId: event.pointerId ?? null,
    startValue: Number(input.value),
    startX: event.clientX,
    startY: event.clientY,
    multiplier: nodeGraphTraceDisplayNumberDragMultiplier(event),
    quantum: nodeGraphTraceDisplayStepperQuantum(input),
  };
  input.classList.add("value-dragging");
  input.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphTraceDisplayField(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const axes = typeof nodeGraphPointerDragScreenDelta === "function"
    ? nodeGraphPointerDragScreenDelta(drag.startX, drag.startY, event.clientX, event.clientY)
    : { combined: (event.clientX - drag.startX) + (drag.startY - event.clientY) };
  const startValue = Number.isFinite(drag.startValue)
    ? drag.startValue
    : nodeGraphDisplaySettingsDefaultValue(drag.key);
  const controlDelta = (axes.combined / 8) * drag.quantum * drag.multiplier;
  const rawValue = adjustNodeGraphTraceDisplaySettingByControlDelta(drag.key, startValue, controlDelta);
  const nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(drag.key, rawValue);
  drag.input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "debounce", record: false });
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphTraceDisplayFieldDrag(event) {
  const drag = nodeGraphMvp.traceDisplayFieldDragging;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  drag.input.classList.remove("value-dragging");
  const root = nodeGraphSettingsTextRootFromTarget(drag.input);
  if (root) {
    root.dataset.settingsTextPointerActive = "false";
    root.dataset.settingsTextPointerId = "";
    root.dataset.settingsTextPointerMoved = "false";
    root.dataset.settingsTextSuppressClick = "true";
    window.setTimeout(() => {
      if (root.dataset.settingsTextSuppressClick === "true") {
        root.dataset.settingsTextSuppressClick = "false";
      }
    }, 180);
  }
  if (event.pointerId !== undefined && drag.input.hasPointerCapture?.(event.pointerId)) {
    drag.input.releasePointerCapture(event.pointerId);
  }
  if (drag.key === "zoomSeconds") {
    setNodeGraphTraceDisplayZoomEditActive(false);
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
  nodeGraphMvp.traceDisplayFieldDragging = null;
  event.preventDefault();
  event.stopPropagation();
}

function stepNodeGraphTraceDisplaySetting(event) {
  if (nodeGraphSettingsTextGestureShouldIgnoreClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-trace-display-step-target]");
  if (!button) {
    return;
  }
  const key = button.dataset.traceDisplayStepTarget;
  const root = nodeGraphTraceDisplaySettingsRoot();
  const input = root?.querySelector?.(`[data-trace-display-field="${key}"]`)
    || button.closest("label")?.querySelector?.(`[data-trace-display-field="${key}"]`);
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const direction = Number(button.dataset.traceDisplayStepDirection) < 0 ? -1 : 1;
  const current = Number(input.value);
  const baseValue = Number.isFinite(current) ? current : nodeGraphDisplaySettingsDefaultValue(key);
  let nextValue;
  // Spectrogram: FFT steps the size table.
  if (
    key === "fftSize" &&
    nodeGraphTraceDisplaySettingsFormType() === "spectrogramBurn" &&
    typeof nodeGraphSpectrogramStepFftSize === "function"
  ) {
    nextValue = nodeGraphSpectrogramStepFftSize(baseValue, direction);
  } else if (key === "historySeconds" || key === "zoomSeconds") {
    // Exponential control-space steps (fine near short history, coarser at long).
    const quantum = nodeGraphTraceDisplayStepperQuantum(input);
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
      key,
      adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
    );
  } else {
    const quantum = nodeGraphTraceDisplayStepperQuantum(input);
    nextValue = normalizeNodeGraphTraceDisplaySettingValueForKey(
      key,
      adjustNodeGraphTraceDisplaySettingByControlDelta(key, baseValue, direction * quantum),
    );
  }
  input.value = formatNodeGraphTraceDisplaySetting(nextValue);
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function toggleNodeGraphTraceDisplaySettingRow(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  input.checked = !input.checked;
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function suppressNodeGraphTraceDisplaySettingRowClick(event) {
  const toggleRow = event.target.closest("label, .metadata-section-title");
  const input = toggleRow?.querySelector?.("[data-trace-display-toggle]");
  if (!input || input.disabled) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings) {
  if (!node) {
    return null;
  }
  if (displayType === "dot") {
    node.zeroDBurnSettings = normalizeNodeGraphZeroDBurnSettings(settings);
    return node.zeroDBurnSettings;
  }
  if (displayType === "lineBurn") {
    node.traceDisplaySettings = normalizeNodeGraphLineBurnSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "value") {
    node.traceDisplaySettings = normalizeNodeGraphValueOscilloscopeSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "scope2d") {
    const typeDefaults = typeof nodeGraphScope2dSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dSettingsDefaultsForModuleType(node?.type)
      : null;
    node.traceDisplaySettings = normalizeNodeGraphScope2dSettings(settings, typeDefaults);
    return node.traceDisplaySettings;
  }
  if (displayType === "scope2dTrace") {
    node.traceDisplaySettings = normalizeNodeGraphScope2dTraceSettings(settings);
    return node.traceDisplaySettings;
  }
  // Must not fall through to Trace normalize: that drops decimals and expands
  // a full Trace schema onto the multimeter (can thrash draw/history/persist).
  if (displayType === "numberReadout") {
    node.traceDisplaySettings = normalizeNodeGraphNumberReadoutSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "knobFace") {
    node.traceDisplaySettings = normalizeNodeGraphKnobFaceDisplaySettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "ledLamp") {
    node.led = typeof normalizeNodeGraphLedLayout === "function"
      ? normalizeNodeGraphLedLayout({
        ...(settings || {}),
        brightness: settings?.brightness ?? settings?.dot1Brightness,
        blur: settings?.blur ?? settings?.lineThickness,
        gradientStops: settings?.gradientStops ?? settings?.gradient,
      })
      : (settings || {});
    return node.led;
  }
  if (displayType === "rgbShapeFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphRgbShapeSettings === "function"
      ? normalizeNodeGraphRgbShapeSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "rgbPictureFace") {
    const normalized = typeof normalizeNodeGraphRgbPictureSettings === "function"
      ? normalizeNodeGraphRgbPictureSettings(settings)
      : (settings || {});
    node.rgbPicture = typeof nodeGraphRgbPictureToPatch === "function"
      ? nodeGraphRgbPictureToPatch(normalized)
      : normalized;
    node.traceDisplaySettings = {
      ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
        ? node.traceDisplaySettings
        : {}),
      background: normalized.background,
      dataUrl: normalized.dataUrl,
      fileName: normalized.fileName,
    };
    return node.traceDisplaySettings;
  }
  if (displayType === "rgbFractalFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphRgbFractalSettings === "function"
      ? normalizeNodeGraphRgbFractalSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "fbmFieldFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphFbmFieldSettings === "function"
      ? normalizeNodeGraphFbmFieldSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (
    displayType === "matrixFace"
    || displayType === "matrixWaterfallFace"
    || displayType === "matrixDisplayFace"
  ) {
    const nodeType = node.type;
    if (nodeType === "matrixWaterfall" || displayType === "matrixWaterfallFace") {
      node.matrixWaterfall = typeof normalizeNodeGraphMatrixWaterfall === "function"
        ? normalizeNodeGraphMatrixWaterfall(settings)
        : (typeof normalizeNodeGraphMatrixFaceSettings === "function"
          ? normalizeNodeGraphMatrixFaceSettings(settings, "matrixWaterfallFace")
          : (settings || {}));
      return node.matrixWaterfall;
    }
    node.matrixDisplay = typeof normalizeNodeGraphMatrixPlate === "function"
      ? normalizeNodeGraphMatrixPlate(settings)
      : (typeof normalizeNodeGraphMatrixFaceSettings === "function"
        ? normalizeNodeGraphMatrixFaceSettings(settings, "matrixDisplayFace")
        : (settings || {}));
    return node.matrixDisplay;
  }
  if (displayType === "xyPad") {
    node.traceDisplaySettings = normalizeNodeGraphXyPadDisplaySettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "phosphorLight") {
    // Legacy alias — same schema as 2D Phosphor.
    node.traceDisplaySettings = normalizeNodeGraphScope2dSettings(settings);
    return node.traceDisplaySettings;
  }
  if (
    displayType === "videoscopeBurn"
    || displayType === "oscilloscopeBankBurn"
    || displayType === "hypersawBurn"
  ) {
    node.traceDisplaySettings = normalizeNodeGraphScope2dSettings(settings);
    return node.traceDisplaySettings;
  }
  if (displayType === "spectrogramBurn") {
    const merged = { ...(settings || {}) };
    if (merged.fftSize == null && node.params?.fftSize != null) {
      merged.fftSize = node.params.fftSize;
    }
    node.traceDisplaySettings = normalizeNodeGraphSpectrogramSettings(merged, node);
    syncNodeGraphSpectrogramDisplaySettingsToParams(node, node.traceDisplaySettings);
    return node.traceDisplaySettings;
  }
  node.traceDisplaySettings = normalizeNodeGraphTraceDisplaySettings(settings);
  return node.traceDisplaySettings;
}

function assignNodeGraphTypedDisplaySettingsEverywhere(node, displayType, settings) {
  if (!node?.id) {
    return null;
  }
  const normalized = assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings);
  const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === node.id);
  if (patchNode && patchNode !== node) {
    assignNodeGraphTypedDisplaySettingsToNode(patchNode, displayType, settings);
  }
  const workingNode = nodeGraphMvp.workingPatch?.nodes?.find((candidate) => candidate.id === node.id);
  if (workingNode && workingNode !== node && workingNode !== patchNode) {
    assignNodeGraphTypedDisplaySettingsToNode(workingNode, displayType, settings);
  }
  return normalized;
}

function assignNodeGraphDisplayModeKeyToNode(node, modeKey) {
  if (!node) {
    return null;
  }
  const modes = nodeGraphModuleDisplayModesForType(node.type);
  const safeKey = String(modeKey || "").trim();
  const selectedMode = modes.find((mode) => mode.key === safeKey) || modes[0] || null;
  if (!selectedMode) {
    return null;
  }
  node.ui = {
    ...normalizeNodeGraphPatchNodeUi(node.ui, node.type),
    displayModeKey: selectedMode.key,
  };
  return selectedMode;
}

function assignNodeGraphDisplayModeKeyEverywhere(node, modeKey) {
  if (!node?.id) {
    return null;
  }
  const selectedMode = assignNodeGraphDisplayModeKeyToNode(node, modeKey);
  if (!selectedMode) {
    return null;
  }
  const patchNode = nodeGraphMvp.patch?.nodes?.find((candidate) => candidate.id === node.id);
  if (patchNode && patchNode !== node) {
    assignNodeGraphDisplayModeKeyToNode(patchNode, selectedMode.key);
  }
  const workingNode = nodeGraphMvp.workingPatch?.nodes?.find((candidate) => candidate.id === node.id);
  if (workingNode && workingNode !== node && workingNode !== patchNode) {
    assignNodeGraphDisplayModeKeyToNode(workingNode, selectedMode.key);
  }
  return selectedMode;
}

function changeNodeGraphTraceDisplayMode(event) {
  const select = event?.target?.closest?.("[data-trace-display-mode-select]");
  if (!select) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
  if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
    return true;
  }
  const selectedMode = assignNodeGraphDisplayModeKeyEverywhere(node, select.value);
  if (!selectedMode) {
    return true;
  }
  nodeGraphMvp.patchDirtyState = "edited";
  // Mode can switch settings schema (e.g. 2D Phosphor ↔ Trace) — force body remount.
  const popover = nodeGraphTraceDisplaySettingsRoot();
  if (popover) {
    popover.dataset.displaySettingsBodyType = "";
  }
  setNodeGraphTraceDisplaySettingsFormType(node);
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphTraceDisplayCurrentSettingsForFormType(selectedMode.settingsSchema));
  persistNodeGraphTraceDisplaySettingsSoon("immediate");
  if (typeof renderNodeGraphExecutionPlanDebug === "function") {
    renderNodeGraphExecutionPlanDebug();
  }
  if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    syncNodeGraphCurrentSavedPatchHeader();
  }
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  }
  scheduleNodeGraphModuleScopeDraw();
  return true;
}

let nodeGraphTraceDisplaySettingsPersistTimer = 0;

function persistNodeGraphTraceDisplaySettingsSoon(persistMode = "debounce") {
  if (persistMode === false || persistMode === "none") {
    return;
  }
  if (nodeGraphTraceDisplaySettingsPersistTimer) {
    window.clearTimeout(nodeGraphTraceDisplaySettingsPersistTimer);
    nodeGraphTraceDisplaySettingsPersistTimer = 0;
  }
  const persist = () => {
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings({ immediateFile: persistMode === "immediate" });
    } else if (
      typeof serializeNodeUiDevSettings === "function" &&
      typeof saveNodeUiDevLocalDefaultSettings === "function"
    ) {
      saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
    }
  };
  if (persistMode === "immediate") {
    persist();
    return;
  }
  nodeGraphTraceDisplaySettingsPersistTimer = window.setTimeout(() => {
    nodeGraphTraceDisplaySettingsPersistTimer = 0;
    persist();
  }, 350);
}

// --- Trace display color widgets (scan hue/sat/bright without native picker) ---
const nodeGraphTraceDisplayColorWidgetState = {
  load: null,
  widgets: new Map(), // field -> SoundColorWidget
  syncing: false,
};

/** Resolve color-widget.js next to this scopes script (never document-relative ./public/…). */
function nodeGraphTraceDisplayColorWidgetModuleUrl() {
  // Prefer global boot from index.html <script type="module"> if already ready.
  if (typeof window !== "undefined" && typeof window.mountColorWidget === "function") {
    return null;
  }
  const script = document.querySelector('script[src*="node-graph-module-scopes.js"]');
  if (script?.src) {
    return new URL("color-widget.js?v=plane-4corner-1", script.src).href;
  }
  // Fallbacks: site root /public/, then document-relative public/
  try {
    return new URL("/public/color-widget.js?v=plane-4corner-1", window.location.origin).href;
  } catch {
    return new URL("public/color-widget.js?v=plane-4corner-1", window.location.href).href;
  }
}

function loadNodeGraphTraceDisplayColorWidgetModule() {
  if (typeof window !== "undefined" && typeof window.mountColorWidget === "function") {
    return Promise.resolve({
      mountColorWidget: window.mountColorWidget,
      SoundColorWidget: window.SoundColorWidget,
      hslToHex: window.hslToHex,
    });
  }
  // Boot script may still be in flight — wait briefly for color-widget-ready.
  if (typeof window !== "undefined" && !nodeGraphTraceDisplayColorWidgetState.load) {
    const waitForBoot = new Promise((resolve, reject) => {
      if (typeof window.mountColorWidget === "function") {
        resolve({
          mountColorWidget: window.mountColorWidget,
          SoundColorWidget: window.SoundColorWidget,
          hslToHex: window.hslToHex,
        });
        return;
      }
      const onReady = () => {
        window.removeEventListener("color-widget-ready", onReady);
        if (typeof window.mountColorWidget === "function") {
          resolve({
            mountColorWidget: window.mountColorWidget,
            SoundColorWidget: window.SoundColorWidget,
            hslToHex: window.hslToHex,
          });
        } else {
          reject(new Error("color-widget-ready fired without mountColorWidget"));
        }
      };
      window.addEventListener("color-widget-ready", onReady, { once: true });
      // If boot never arrives, fall through to dynamic import after a short wait.
      window.setTimeout(() => {
        window.removeEventListener("color-widget-ready", onReady);
        if (typeof window.mountColorWidget === "function") {
          resolve({
            mountColorWidget: window.mountColorWidget,
            SoundColorWidget: window.SoundColorWidget,
            hslToHex: window.hslToHex,
          });
          return;
        }
        const url = nodeGraphTraceDisplayColorWidgetModuleUrl();
        if (!url) {
          reject(new Error("color-widget module URL unresolved"));
          return;
        }
        import(/* webpackIgnore: true */ url)
          .then((mod) => {
            if (mod.mountColorWidget) {
              window.mountColorWidget = mod.mountColorWidget;
            }
            if (mod.SoundColorWidget) {
              window.SoundColorWidget = mod.SoundColorWidget;
            }
            if (mod.hslToHex) {
              window.hslToHex = mod.hslToHex;
            }
            resolve(mod);
          })
          .catch((err) => {
            const detail = err?.stack || err?.message || String(err);
            console.warn("[trace-display] color-widget import failed", url, detail);
            reject(err);
          });
      }, 400);
    });
    nodeGraphTraceDisplayColorWidgetState.load = waitForBoot.catch((err) => {
      nodeGraphTraceDisplayColorWidgetState.load = null;
      throw err;
    });
  }
  return nodeGraphTraceDisplayColorWidgetState.load
    || Promise.reject(new Error("color-widget load unavailable"));
}

function nodeGraphTraceDisplayNormalizeHexColor(value, fallback = "#ffffff") {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [, r, g, b] = color.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function nodeGraphTraceDisplayHexToHsl(hexToken = "#ffffff") {
  const hex = nodeGraphTraceDisplayNormalizeHexColor(hexToken);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue /= 6;
  }
  return {
    a: 1,
    h: Math.round(hue * 359),
    l: Math.round(lightness * 100),
    s: Math.round(saturation * 100),
  };
}

function destroyNodeGraphTraceDisplayColorWidgets() {
  for (const widget of nodeGraphTraceDisplayColorWidgetState.widgets.values()) {
    try {
      widget?.destroy?.();
    } catch {
      // ignore
    }
  }
  nodeGraphTraceDisplayColorWidgetState.widgets.clear();
}

function nodeGraphTraceDisplayColorWidgetLabel(field) {
  // Only non-generic titles (Plate / Ghost / Left / Right). Never "Color".
  if (field === "secondaryColor") {
    return "Right";
  }
  if (field === "backgroundColor") {
    if (nodeGraphTraceDisplaySettingsFormType() === "numberReadout") {
      return "Plate";
    }
    return "Bg";
  }
  if (field === "ghostColor") {
    return "Ghost";
  }
  if (field === "dot1Color") {
    const nodeType = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type;
    const isStereo = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
      ? nodeGraphModuleUsesStereoTraceDisplay(nodeType)
      : nodeType === "output";
    return isStereo ? "Left" : "";
  }
  return "";
}

function syncNodeGraphTraceDisplayColorWidgets(popover = document.getElementById("nodeTraceDisplaySettingsPopover")) {
  if (!popover || popover.hidden) {
    return;
  }
  const formType = nodeGraphTraceDisplaySettingsFormType();
  const activeColors = nodeGraphTraceDisplayActiveControlSet("colors", formType);
  // Drop widgets for inactive fields.
  for (const [field, widget] of [...nodeGraphTraceDisplayColorWidgetState.widgets.entries()]) {
    if (!activeColors.has(field)) {
      try {
        widget?.destroy?.();
      } catch {
        // ignore
      }
      nodeGraphTraceDisplayColorWidgetState.widgets.delete(field);
      const host = popover.querySelector(`[data-trace-display-color-widget="${field}"]`);
      if (host) {
        host.replaceChildren();
      }
    }
  }
  loadNodeGraphTraceDisplayColorWidgetModule().then((module) => {
    const livePopover = document.getElementById("nodeTraceDisplaySettingsPopover");
    if (!livePopover || livePopover.hidden) {
      return;
    }
    const mount = module?.mountColorWidget || window.mountColorWidget;
    if (typeof mount !== "function") {
      console.warn("[trace-display] color-widget module missing mountColorWidget");
      return;
    }
    const liveType = nodeGraphTraceDisplaySettingsFormType();
    const liveColors = nodeGraphTraceDisplayActiveControlSet("colors", liveType);
    for (const field of liveColors) {
      const host = livePopover.querySelector(`[data-trace-display-color-widget="${field}"]`);
      const input = livePopover.querySelector(`[data-trace-display-color="${field}"]`);
      if (!host || !input) {
        continue;
      }
      // Host row may still be hidden by section visibility.
      const row = host.closest("[data-trace-display-color-row], [data-trace-display-control-row], label");
      if (row?.hidden || host.closest("[hidden]")) {
        const existing = nodeGraphTraceDisplayColorWidgetState.widgets.get(field);
        if (existing) {
          try {
            existing.destroy?.();
          } catch {
            // ignore
          }
          nodeGraphTraceDisplayColorWidgetState.widgets.delete(field);
          host.replaceChildren();
        }
        continue;
      }
      const hex = nodeGraphTraceDisplayNormalizeHexColor(input.value, "#ffffff");
      const hsl = nodeGraphTraceDisplayHexToHsl(hex);
      const label = nodeGraphTraceDisplayColorWidgetLabel(field);
      let widget = nodeGraphTraceDisplayColorWidgetState.widgets.get(field);
      if (!widget) {
        try {
          host.replaceChildren();
          widget = mount(host, {
            label,
            ...hsl,
            onChange: (color) => {
              if (nodeGraphTraceDisplayColorWidgetState.syncing) {
                return;
              }
              const nextHex = nodeGraphTraceDisplayNormalizeHexColor(color?.hex, hex);
              const colorInput = nodeGraphTraceDisplaySettingsRoot()?.querySelector?.(
                `[data-trace-display-color="${field}"]`,
              );
              if (colorInput) {
                colorInput.value = nextHex;
              }
              // Live paint while dragging strips.
              applyNodeGraphTraceDisplaySettingsForm({ persist: "none", record: false });
            },
          });
          nodeGraphTraceDisplayColorWidgetState.widgets.set(field, widget);
          requestAnimationFrame(() => {
            try {
              widget?.fitFittedText?.();
              widget?.render?.();
            } catch {
              // ignore
            }
          });
        } catch (mountErr) {
          console.warn(
            "[trace-display] color-widget mount failed",
            field,
            mountErr?.message || String(mountErr),
          );
        }
      } else {
        nodeGraphTraceDisplayColorWidgetState.syncing = true;
        try {
          widget.label = label;
          widget.setColor(hsl, false);
        } finally {
          nodeGraphTraceDisplayColorWidgetState.syncing = false;
        }
      }
    }
  }).catch((err) => {
    console.warn(
      "[trace-display] color-widget failed to load",
      err?.message || String(err),
      err?.stack || "",
    );
  });
}

function applyNodeGraphTraceDisplaySettingsForm(options = {}) {
  const settings = readNodeGraphTraceDisplaySettingsForm();
  const commit = Boolean(options.record || options.commit);
  if (nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    nodeGraphMvp.traceSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  } else {
    const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
    if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
      return null;
    }
    const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
    assignNodeGraphTypedDisplaySettingsEverywhere(node, settingsSchema, settings);
    // Spectrogram bins ride params for the worklet — push a param sync.
    if (settingsSchema === "spectrogramBurn" && typeof scheduleNodeGraphLiveParameterSync === "function") {
      scheduleNodeGraphLiveParameterSync();
    }
  }
  nodeGraphMvp.patchDirtyState = "edited";
  persistNodeGraphTraceDisplaySettingsSoon(options.persist || "debounce");
  if (commit) {
    if (typeof renderNodeGraphExecutionPlanDebug === "function") {
      renderNodeGraphExecutionPlanDebug();
    }
    if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
      syncNodeGraphCurrentSavedPatchHeader();
    }
    if (options.record && typeof recordNodeGraphHistory === "function") {
      recordNodeGraphHistory();
    } else if (typeof renderNodeGraphHistoryControls === "function") {
      renderNodeGraphHistoryControls();
    }
  }
  scheduleNodeGraphModuleScopeDraw();
  // XY Pad face is not a scope slot — repaint pads when display settings change.
  if (typeof nodeGraphXyPadRedrawAll === "function") {
    nodeGraphXyPadRedrawAll();
  }
  // Knob face readout decimals live in Display Settings.
  if (typeof refreshNodeGraphKnobFaces === "function") {
    refreshNodeGraphKnobFaces();
  }
  // LED face applies CSS vars immediately (rounding / pill / squircle).
  // Cosmetic — works with the audio engine stopped.
  if (!nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    const ledNodeId = nodeGraphTraceDisplaySettingsTargetNodeId();
    const ledNode = ledNodeId ? nodeGraphPatchNode(ledNodeId) : null;
    if (ledNode?.type === "led") {
      if (typeof scheduleNodeGraphLedFaceRefresh === "function") {
        scheduleNodeGraphLedFaceRefresh(ledNodeId);
      } else if (typeof refreshNodeGraphLedFaceForNode === "function") {
        refreshNodeGraphLedFaceForNode(ledNodeId);
      }
    }
    if (ledNode?.type === "rgbShape" && typeof paintNodeGraphRgbShapeFaceForNode === "function") {
      paintNodeGraphRgbShapeFaceForNode(ledNodeId);
      requestAnimationFrame(() => paintNodeGraphRgbShapeFaceForNode(ledNodeId));
    }
    if (ledNode?.type === "rgbPicture" && typeof paintNodeGraphRgbPictureFaceForNode === "function") {
      paintNodeGraphRgbPictureFaceForNode(ledNodeId);
      requestAnimationFrame(() => paintNodeGraphRgbPictureFaceForNode(ledNodeId));
    }
    if (ledNode?.type === "rgbFractal" && typeof paintNodeGraphRgbFractalFaceForNode === "function") {
      paintNodeGraphRgbFractalFaceForNode(ledNodeId, { force: true, dt: 0 });
      requestAnimationFrame(() => paintNodeGraphRgbFractalFaceForNode(ledNodeId, { force: true, dt: 0 }));
    }
    if (ledNode?.type === "fbmField" && typeof paintNodeGraphFbmFieldFaceForNode === "function") {
      paintNodeGraphFbmFieldFaceForNode(ledNodeId, { force: true, dt: 0 });
      requestAnimationFrame(() => paintNodeGraphFbmFieldFaceForNode(ledNodeId, { force: true, dt: 0 }));
    }
  }
  return settings;
}

function commitOpenNodeGraphTraceDisplaySettings() {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover || popover.hidden || nodeGraphMvp.sharedInspectorActive !== "traceDisplaySettings") {
    return null;
  }
  return applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
}

function setNodeGraphTraceDisplaySettingsDefaults() {
  writeNodeGraphTraceDisplaySettingsForm(nodeGraphDisplaySettingsDefaultsForFormType());
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
}

function updateNodeGraphTraceDisplaySettingsLive() {
  applyNodeGraphTraceDisplaySettingsForm({ persist: "none", record: false });
}

function commitNodeGraphTraceDisplaySettingsChange(event) {
  if (changeNodeGraphTraceDisplayMode(event)) {
    return;
  }
  if (nodeGraphTraceDisplayFieldFromTarget(event?.target)) {
    return;
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
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
  document.addEventListener("pointerup", endNodeGraphTraceDisplayFieldDrag, true);
  document.addEventListener("pointercancel", endNodeGraphTraceDisplayFieldDrag, true);
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
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover &&
    !existingPopover.hidden &&
    nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings" &&
    nodeGraphMvp.traceDisplaySettingsTargetNode === node.id
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
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  setNodeGraphTraceDisplaySettingsHeader(
    "DISPLAY",
    "Settings",
    nodeGraphTraceDisplaySettingsTargetLabel(node),
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

