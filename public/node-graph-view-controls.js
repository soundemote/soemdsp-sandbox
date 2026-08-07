function renderNodeGraphHistoryControls() {
  const undoButtons = [
    document.getElementById("nodeUndoButton"),
    document.getElementById("nodeSceneUndoButton"),
  ].filter(Boolean);
  const redoButtons = [
    document.getElementById("nodeRedoButton"),
    document.getElementById("nodeSceneRedoButton"),
  ].filter(Boolean);
  if (!undoButtons.length || !redoButtons.length) {
    return;
  }
  const canUndo = nodeGraphMvp.historyIndex > 0;
  const canRedo = nodeGraphMvp.historyIndex < nodeGraphMvp.historySnapshots.length - 1;
  undoButtons.forEach((button) => {
    button.disabled = !canUndo;
    button.removeAttribute("title");
  });
  redoButtons.forEach((button) => {
    button.disabled = !canRedo;
    button.removeAttribute("title");
  });
}

function renderNodeGraphVisibilityMenuButton() {
  const button = document.getElementById("nodeVisibilityMenuButton");
  const menu = document.getElementById("nodeVisibilityMenu");
  if (!button) {
    return;
  }
  const hiddenCount = [
    nodeGraphMvp.gridVisible ? 0 : 1,
    nodeGraphMvp.moduleButtonsVisible === false ? 1 : 0,
    nodeGraphMvp.moduleInterfaceControlsVisible === false ? 1 : 0,
    nodeGraphMvp.moduleOscilloscopesVisible === false ? 1 : 0,
    nodeGraphMvp.moduleSlidersVisible === false ? 1 : 0,
    nodeGraphTooltipsShown() ? 0 : 1,
    nodeGraphMvp.sliderAmountVisible ? 0 : 1,
    nodeGraphMvp.sliderPositionVisible ? 0 : 1,
  ].reduce((total, value) => total + value, 0);
  button.replaceChildren();
  const label = document.createElement("span");
  label.textContent = "Visibility";
  button.append(label);
  if (hiddenCount) {
    const hidden = document.createElement("span");
    hidden.className = "node-toolbar-subline";
    hidden.textContent = `(${hiddenCount} hidden)`;
    button.append(hidden);
  }
  button.setAttribute("aria-pressed", String(Boolean(menu && !menu.hidden)));
  button.removeAttribute("title");
}

function renderNodeGraphGridToggle() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const button = document.getElementById("nodeGridToggleButton");
  const visible = Boolean(nodeGraphMvp.gridVisible);
  workspace?.classList.toggle("grid-visible", visible);
  if (button) {
    button.textContent = visible ? "Hide Grid" : "Show Grid";
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.removeAttribute("title");
  }
  renderNodeGraphVisibilityMenuButton();
  syncNodeUserUiSettingsViewControls();
}

/** Cable strokes under modules (default) or above faces (Visibility toggle). */
function renderNodeGraphWiresAboveModulesToggle() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const button = document.getElementById("nodeWiresAboveModulesToggleButton");
  const above = Boolean(nodeGraphMvp.wiresAboveModules);
  workspace?.classList.toggle("wires-above-modules", above);
  if (button) {
    button.textContent = above ? "Wires Under Modules" : "Wires Above Modules";
    button.setAttribute("aria-pressed", above ? "true" : "false");
    button.title = above
      ? "Cable strokes paint above module faces"
      : "Cable strokes paint under modules (contact plugs stay on top)";
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
  renderNodeGraphVisibilityMenuButton();
  if (typeof syncNodeUserUiSettingsViewControls === "function") {
    syncNodeUserUiSettingsViewControls();
  }
}

function toggleNodeGraphWiresAboveModules() {
  nodeGraphMvp.wiresAboveModules = !nodeGraphMvp.wiresAboveModules;
  renderNodeGraphWiresAboveModulesToggle();
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(
      nodeGraphMvp.wiresAboveModules
        ? "Wires drawn above modules."
        : "Wires drawn under modules.",
    );
  }
}

function renderNodeGraphSliderVisibilityToggles() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const amountButton = document.getElementById("nodeSliderAmountToggleButton");
  const positionButton = document.getElementById("nodeSliderPositionToggleButton");
  const amountVisible = Boolean(nodeGraphMvp.sliderAmountVisible);
  const positionVisible = Boolean(nodeGraphMvp.sliderPositionVisible);
  workspace?.classList.toggle("show-slider-amount", amountVisible);
  workspace?.classList.toggle("hide-slider-position", !positionVisible);
  if (amountButton) {
    amountButton.textContent = amountVisible ? "Hide Amount Slider" : "Show Amount Slider";
    amountButton.setAttribute("aria-pressed", amountVisible ? "true" : "false");
    amountButton.removeAttribute("title");
  }
  if (positionButton) {
    positionButton.textContent = positionVisible ? "Hide Position Slider" : "Show Position Slider";
    positionButton.setAttribute("aria-pressed", positionVisible ? "true" : "false");
    positionButton.removeAttribute("title");
  }
  renderNodeGraphVisibilityMenuButton();
  syncNodeUserUiSettingsViewControls();
}

function syncNodeGraphVisibleModuleGridHeights() {
  for (const element of document.querySelectorAll(".dsp-node[data-node]")) {
    const patchNode = nodeGraphPatchNode(element.dataset.node);
    if (!patchNode) {
      continue;
    }
    const heightGu = nodeGraphPatchNodeGridHeightUnits(patchNode);
    element.dataset.gridHeightGu = String(heightGu);
    element.style.setProperty("--node-grid-height-units", String(heightGu));
    if (typeof nodeGraphApplyModuleShellHeightCssVars === "function") {
      nodeGraphApplyModuleShellHeightCssVars(element, patchNode);
    } else {
      element.style.setProperty("--node-module-display-height-units", String(nodeGraphPatchNodeDisplayHeightUnits(patchNode)));
    }
    element.style.setProperty("--node-module-interface-controls-height-units", String(nodeGraphPatchNodeInterfaceControlsHeightUnits(patchNode)));
  }
}

function renderNodeGraphModuleVisibilityToggles() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  const buttonsButton = document.getElementById("nodeModuleButtonsToggleButton");
  const scopesButton = document.getElementById("nodeOscilloscopeToggleButton");
  const interfaceControlsButton = document.getElementById("nodeModuleInterfaceControlsToggleButton");
  const slidersButton = document.getElementById("nodeModuleSlidersToggleButton");
  const buttonsVisible = nodeGraphMvp.moduleButtonsVisible !== false;
  const scopesVisible = nodeGraphMvp.moduleOscilloscopesVisible !== false;
  const interfaceControlsVisible = nodeGraphMvp.moduleInterfaceControlsVisible !== false;
  const slidersVisible = nodeGraphMvp.moduleSlidersVisible !== false;
  workspace?.classList.toggle("module-buttons-hidden", !buttonsVisible);
  workspace?.classList.toggle("module-oscilloscopes-hidden", !scopesVisible);
  workspace?.classList.toggle("module-interface-controls-hidden", !interfaceControlsVisible);
  workspace?.classList.toggle("module-sliders-hidden", !slidersVisible);
  syncNodeGraphVisibleModuleGridHeights();
  // Refresh per-node visibility classes so unhiding works immediately
  // without needing a full patch commit.
  for (const element of document.querySelectorAll(".dsp-node[data-node]")) {
    const patchNode = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(element.dataset.node)
      : null;
    if (!patchNode) continue;
    const effectiveUi = typeof nodeGraphEffectivePatchNodeUi === "function"
      ? nodeGraphEffectivePatchNodeUi(patchNode.ui)
      : null;
    if (!effectiveUi) continue;
    element.classList.toggle("buttons-hidden", effectiveUi.buttonsHidden);
    element.classList.toggle("oscilloscope-hidden", effectiveUi.oscilloscopeHidden);
    element.classList.toggle("interface-controls-hidden", effectiveUi.interfaceControlsHidden);
    element.classList.toggle("sliders-hidden", effectiveUi.slidersHidden);
    if (typeof syncNodeGraphLayoutBNoParamsClass === "function") {
      syncNodeGraphLayoutBNoParamsClass(element, patchNode.type, effectiveUi);
    }
  }
  if (buttonsButton) {
    buttonsButton.textContent = buttonsVisible ? "Hide Module Buttons" : "Show Module Buttons";
    buttonsButton.setAttribute("aria-pressed", buttonsVisible ? "true" : "false");
    buttonsButton.removeAttribute("title");
  }
  if (scopesButton) {
    scopesButton.textContent = scopesVisible ? "Hide Displays" : "Show Displays";
    scopesButton.setAttribute("aria-pressed", scopesVisible ? "true" : "false");
    scopesButton.removeAttribute("title");
  }
  if (interfaceControlsButton) {
    interfaceControlsButton.textContent = interfaceControlsVisible ? "Hide Control Surfaces" : "Show Control Surfaces";
    interfaceControlsButton.setAttribute("aria-pressed", interfaceControlsVisible ? "true" : "false");
    interfaceControlsButton.removeAttribute("title");
  }
  if (slidersButton) {
    slidersButton.textContent = slidersVisible ? "Hide Sliders" : "Show Sliders";
    slidersButton.setAttribute("aria-pressed", slidersVisible ? "true" : "false");
    slidersButton.removeAttribute("title");
  }
  if (!scopesVisible && typeof closeNodeScopeContextMenu === "function") {
    closeNodeScopeContextMenu();
  }
  if (typeof drawNodeGraphWires === "function") {
    drawNodeGraphWires();
  }
  if (scopesVisible && typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  renderNodeGraphVisibilityMenuButton();
}

function normalizeNodeGraphModuleScopeLineThickness(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0.25, 10) : 1;
}

function normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(Math.round(number), 0, 2) : 1;
}

function normalizeNodeGraphModuleScopeFramesPerSecond(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(Math.round(number), 0, 240) : 60;
}

function normalizeNodeGraphModuleScopePointBudget(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(Math.round(number), 1, 65536) : 4096;
}

function normalizeNodeGraphModuleScopeBackgroundColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : "#000000";
}

function normalizeNodeGraphModuleScopeDotCoreColor(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function normalizeNodeGraphModuleScopeDotCoreEnabled(value) {
  return value !== false;
}

function normalizeNodeGraphModuleScopeDotCoreSize(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0.01, 10) : fallback;
}

function normalizeNodeGraphModuleScopeDotCoreBrightness(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0, 40) : fallback;
}

function renderNodeGraphModuleScopeDotPreview(
  core1Size,
  core1Brightness,
  core1Color,
  lineThickness = nodeGraphMvp?.moduleScopeLineThickness,
) {
  const canvas = document.getElementById("nodeMasterScopeDotCore1Preview");
  if (!canvas) {
    return;
  }
  const size = 64;
  if (canvas.width !== size) {
    canvas.width = size;
  }
  if (canvas.height !== size) {
    canvas.height = size;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const pixels = typeof nodeGraphModuleScopeGeneratedDotTextureData === "function"
    ? nodeGraphModuleScopeGeneratedDotTextureData({
      core1Brightness,
      core1Color,
      core1Size,
      lineThickness,
      size,
    })
    : new Uint8ClampedArray(size * size * 4);
  const imageData = new ImageData(
    pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
    size,
    size,
  );
  context.clearRect(0, 0, size, size);
  context.putImageData(imageData, 0, 0);
}

function renderNodeGraphModuleScopeBrightnessControl() {
  const backgroundColor = normalizeNodeGraphModuleScopeBackgroundColor(nodeGraphMvp.moduleScopeBackgroundColor);
  const dotCore1Enabled = normalizeNodeGraphModuleScopeDotCoreEnabled(nodeGraphMvp.moduleScopeDotCore1Enabled);
  const dotCore1Size = normalizeNodeGraphModuleScopeDotCoreSize(nodeGraphMvp.moduleScopeDotCore1Size ?? 2, 2);
  const dotCore1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(nodeGraphMvp.moduleScopeDotCore1Brightness ?? 0.23, 0.23);
  const dotCore1Color = normalizeNodeGraphModuleScopeDotCoreColor(nodeGraphMvp.moduleScopeDotCore1Color ?? "#ffffff", "#ffffff");
  const framesPerSecond = normalizeNodeGraphModuleScopeFramesPerSecond(nodeGraphMvp.moduleScopeFramesPerSecond ?? 60);
  const pointBudget = normalizeNodeGraphModuleScopePointBudget(nodeGraphMvp.moduleScopePointBudget ?? 4096);
  const lineThickness = normalizeNodeGraphModuleScopeLineThickness(nodeGraphMvp.moduleScopeLineThickness ?? 1);
  const discontinuitySkipSamples = normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(
    nodeGraphMvp.moduleScopeDiscontinuitySkipSamples ?? 1,
  );
  nodeGraphMvp.moduleScopeBackgroundColor = backgroundColor;
  nodeGraphMvp.moduleScopeDotCore1Enabled = dotCore1Enabled;
  nodeGraphMvp.moduleScopeDotCore1Size = dotCore1Size;
  nodeGraphMvp.moduleScopeDotCore1Brightness = dotCore1Brightness;
  nodeGraphMvp.moduleScopeDotCore1Color = dotCore1Color;
  nodeGraphMvp.moduleScopeFramesPerSecond = framesPerSecond;
  nodeGraphMvp.moduleScopePointBudget = pointBudget;
  nodeGraphMvp.moduleScopeLineThickness = lineThickness;
  nodeGraphMvp.moduleScopeDiscontinuitySkipSamples = discontinuitySkipSamples;
  const backgroundInput = document.getElementById("nodeMasterScopeBackgroundColor");
  const dotCore1EnabledInput = document.getElementById("nodeMasterScopeDotCore1Enabled");
  const dotCore1SizeInput = document.getElementById("nodeMasterScopeDotCore1Size");
  const dotCore1BrightnessInput = document.getElementById("nodeMasterScopeDotCore1Brightness");
  const dotCore1ColorInput = document.getElementById("nodeMasterScopeDotCore1Color");
  const fpsInput = document.getElementById("nodeMasterScopeFps");
  const pointBudgetInput = document.getElementById("nodeMasterScopePointBudget");
  const lineInput = document.getElementById("nodeMasterScopeLineThickness");
  const skipSamplesInput = document.getElementById("nodeMasterScopeDiscontinuitySkipSamples");
  if (backgroundInput && document.activeElement !== backgroundInput) {
    backgroundInput.value = backgroundColor;
  }
  if (dotCore1EnabledInput) {
    dotCore1EnabledInput.setAttribute("aria-pressed", String(dotCore1Enabled));
    dotCore1EnabledInput.closest(".node-master-scope-dot-core-row")
      ?.classList.toggle("dot-core-disabled", !dotCore1Enabled);
  }
  if (dotCore1SizeInput && document.activeElement !== dotCore1SizeInput) {
    dotCore1SizeInput.value = dotCore1Size.toFixed(2);
  }
  if (dotCore1BrightnessInput && document.activeElement !== dotCore1BrightnessInput) {
    dotCore1BrightnessInput.value = dotCore1Brightness.toFixed(2);
  }
  if (dotCore1ColorInput && document.activeElement !== dotCore1ColorInput) {
    dotCore1ColorInput.value = dotCore1Color;
  }
  renderNodeGraphModuleScopeDotPreview(
    dotCore1Size,
    dotCore1Enabled ? dotCore1Brightness : 0,
    dotCore1Color,
    lineThickness,
  );
  if (fpsInput && document.activeElement !== fpsInput) {
    fpsInput.value = String(framesPerSecond);
  }
  if (pointBudgetInput && document.activeElement !== pointBudgetInput) {
    pointBudgetInput.value = String(pointBudget);
  }
  if (lineInput && document.activeElement !== lineInput) {
    lineInput.value = lineThickness.toFixed(2);
  }
  if (skipSamplesInput && document.activeElement !== skipSamplesInput) {
    skipSamplesInput.value = String(discontinuitySkipSamples);
  }
  const globalScopeMenu = document.getElementById("nodeGlobalScopeMenu");
  document.getElementById("nodeGlobalScopeMenuButton")
    ?.setAttribute("aria-pressed", String(Boolean(globalScopeMenu && !globalScopeMenu.hidden)));
  document.getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-scope-background", backgroundColor);
  syncNodeUserUiSettingsViewControls();
}

function setNodeGraphModuleButtonsVisibility(visible, options = {}) {
  nodeGraphMvp.moduleButtonsVisible = Boolean(visible);
  if (nodeGraphMvp.moduleButtonsVisible && options.clearNodeOverrides !== false) {
    const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
    let changed = false;
    for (const node of patch.nodes) {
      const ui = normalizeNodeGraphPatchNodeUi(node.ui, node.type);
      if (!ui.buttonsHidden) {
        continue;
      }
      ui.buttonsHidden = false;
      if (ui.titleHidden) {
        node.ui = ui;
      } else {
        delete node.ui;
      }
      changed = true;
    }
    if (changed) {
      commitNodeGraphPatch(patch, {
        markPending: false,
        status: "module buttons shown",
      });
    }
  }
  renderNodeGraphModuleVisibilityToggles();
  if (options.help !== false) {
    setNodeInteractionHelp(nodeGraphMvp.moduleButtonsVisible ? "Module buttons shown." : "Module buttons hidden.");
  }
}

function setNodeGraphModularOnlyControlsVisible(visible) {
  nodeGraphMvp.modularOnlyControlsVisible = Boolean(visible);
  if (nodeGraphMvp.patch) {
    nodeGraphMvp.patch.modularOnlyControlsVisible = nodeGraphMvp.modularOnlyControlsVisible;
  }
  const hidden = nodeGraphMvp.modularOnlyControlsVisible === false;
  document.getElementById("nodeWiringPanel")?.classList.toggle("modular-only-controls-hidden", hidden);
  document.getElementById("nodeSceneToggleModularOnlyControls")?.classList.toggle("active", hidden);
  document.getElementById("nodeSceneToggleModularOnlyControls")?.setAttribute("aria-pressed", String(hidden));
  applyNodeGraphWorkspaceView();
  setNodeInteractionHelp(hidden ? "Modular view controls hidden." : "Modular view controls shown.");
}

function toggleNodeGraphModularOnlyControlsVisible() {
  setNodeGraphModularOnlyControlsVisible(nodeGraphMvp.modularOnlyControlsVisible === false);
}

// Named so both the Command Center button click and the "M" hotkey
// (node-graph-keyboard-shortcuts.js) can share the exact same behavior.
function toggleNodeGraphModularOnlyView() {
  const modularOnlyActive = document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view");
  setNodeGraphViewMode(modularOnlyActive ? "modular" : "modular-only");
}

// Named so both the Command Center button click and the "V" hotkey
// (node-graph-keyboard-shortcuts.js) can share the exact same behavior --
// "View Buttons" toggles module-button visibility, but if we're
// currently off in settings/script/UI/mapping view it also needs to
// bring us back to the modular workspace first -- otherwise there's
// nothing on screen for the toggle to visibly affect. Preserves
// modular-only mode if that's what we were already in.
function toggleNodeGraphViewButtonsVisibility() {
  if (document.getElementById("nodeGraphWorkspace")?.hidden) {
    const modularOnlyActive = document.getElementById("nodeWiringPanel")?.classList.contains("modular-only-view");
    setNodeGraphViewMode(modularOnlyActive ? "modular-only" : "modular");
  }
  toggleNodeGraphModularOnlyControlsVisible();
}

function setNodeGraphModuleScopeFramesPerSecond(value) {
  nodeGraphMvp.moduleScopeFramesPerSecond = normalizeNodeGraphModuleScopeFramesPerSecond(value);
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function setNodeGraphModuleScopePointBudget(value) {
  nodeGraphMvp.moduleScopePointBudget = normalizeNodeGraphModuleScopePointBudget(value);
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function handleNodeGraphModuleScopeFramesPerSecondInput(event) {
  setNodeGraphModuleScopeFramesPerSecond(event.currentTarget.value);
}

function setNodeGraphModuleScopeBackgroundColor(value) {
  nodeGraphMvp.moduleScopeBackgroundColor = normalizeNodeGraphModuleScopeBackgroundColor(value);
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function refreshNodeGraphModuleScopeGeneratedDot() {
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof invalidateNodeGraphModuleScopeTraceImageTexture === "function") {
    invalidateNodeGraphModuleScopeTraceImageTexture();
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function setNodeGraphModuleScopeDotCoreEnabled(dotName, enabled) {
  nodeGraphMvp.moduleScopeDotCore1Enabled = normalizeNodeGraphModuleScopeDotCoreEnabled(enabled);
  refreshNodeGraphModuleScopeGeneratedDot();
}

function toggleNodeGraphModuleScopeDotCore(dotName) {
  const current = normalizeNodeGraphModuleScopeDotCoreEnabled(nodeGraphMvp.moduleScopeDotCore1Enabled);
  setNodeGraphModuleScopeDotCoreEnabled(dotName, !current);
}

function handleNodeGraphModuleScopeDotCoreToggle(event) {
  toggleNodeGraphModuleScopeDotCore(event.currentTarget.dataset.globalScopeDotToggle);
}

function setNodeGraphModuleScopeDotCore1Size(value) {
  nodeGraphMvp.moduleScopeDotCore1Size = normalizeNodeGraphModuleScopeDotCoreSize(value, 2);
  refreshNodeGraphModuleScopeGeneratedDot();
}

function setNodeGraphModuleScopeDotCore1Brightness(value) {
  nodeGraphMvp.moduleScopeDotCore1Brightness = normalizeNodeGraphModuleScopeDotCoreBrightness(value, 0.23);
  refreshNodeGraphModuleScopeGeneratedDot();
}

function setNodeGraphModuleScopeDotCore1Color(value) {
  nodeGraphMvp.moduleScopeDotCore1Color = normalizeNodeGraphModuleScopeDotCoreColor(value, "#ffffff");
  refreshNodeGraphModuleScopeGeneratedDot();
}

function setNodeGraphModuleScopeLineThickness(value) {
  nodeGraphMvp.moduleScopeLineThickness = normalizeNodeGraphModuleScopeLineThickness(value);
  refreshNodeGraphModuleScopeGeneratedDot();
}

function handleNodeGraphModuleScopeLineThicknessInput(event) {
  setNodeGraphModuleScopeLineThickness(event.currentTarget.value);
}

function setNodeGraphModuleScopeDiscontinuitySkipSamples(value) {
  nodeGraphMvp.moduleScopeDiscontinuitySkipSamples = normalizeNodeGraphModuleScopeDiscontinuitySkipSamples(value);
  renderNodeGraphModuleScopeBrightnessControl();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
}

function handleNodeGraphModuleScopeDiscontinuitySkipSamplesInput(event) {
  setNodeGraphModuleScopeDiscontinuitySkipSamples(event.currentTarget.value);
}

const nodeGraphSliderLayouts = Object.freeze([
  { key: "text-inside", label: "Text Inside" },
  { key: "label-value-slider", label: "Label Knob" },
  { key: "value-unit-left", label: "Value And Unit Left" },
  { key: "value-unit-right", label: "Value And Unit Right" },
  { key: "label-outside", label: "Label Outside" },
  { key: "label-outside-no-unit", label: "Label Outside No Unit" },
  { key: "value-outside", label: "Value Outside" },
  { key: "unit-only", label: "Unit Only" },
  { key: "value-focus", label: "Value Focus" },
]);

function normalizeNodeGraphSliderLayout(value) {
  const aliases = {
    alternate: "label-outside",
    classic: "text-inside",
  };
  const key = aliases[value] || value;
  return nodeGraphSliderLayouts.some((layout) => layout.key === key) ? key : "text-inside";
}

function nodeGraphSliderLayoutLabel(value) {
  const normalized = normalizeNodeGraphSliderLayout(value);
  return nodeGraphSliderLayouts.find((layout) => layout.key === normalized)?.label || "Text Inside";
}

function nextNodeGraphSliderLayout(value) {
  const normalized = normalizeNodeGraphSliderLayout(value);
  const index = nodeGraphSliderLayouts.findIndex((layout) => layout.key === normalized);
  const next = nodeGraphSliderLayouts[(index + 1) % nodeGraphSliderLayouts.length];
  return next?.key || "text-inside";
}

function renderNodeGraphSliderLayout() {
  const layout = normalizeNodeGraphSliderLayout(nodeGraphMvp.sliderLayout);
  nodeGraphMvp.sliderLayout = layout;
  document.getElementById("nodeGraphWorkspace")?.setAttribute("data-slider-layout", layout);
  document.getElementById("nodeWiringPanel")?.setAttribute("data-slider-layout", layout);
  syncNodeUserUiSettingsViewControls();
}

function cycleNodeGraphSliderLayout() {
  nodeGraphMvp.sliderLayout = nextNodeGraphSliderLayout(nodeGraphMvp.sliderLayout);
  renderNodeGraphSliderLayout();
  setNodeInteractionHelp(`Slider layout: ${nodeGraphSliderLayoutLabel(nodeGraphMvp.sliderLayout)}.`);
}

function nodeGraphDialogDragTargetIsInteractive(event) {
  const target = event?.target;
  if (!target || target === event.currentTarget) {
    return false;
  }
  if (target.closest?.(".node-drag-handle, .scene-context-drag-handle")) {
    return false;
  }
  return Boolean(target.closest?.(
    "button, a, input, textarea, select, option, label, [role='button'], [data-context-module], [contenteditable='true']",
  ));
}

function nodeGraphFloatingWindowViewportOffset() {
  const innerWidth = Number(window.innerWidth) || 0;
  const clientWidth = Number(document.documentElement?.clientWidth) || innerWidth;
  return {
    left: Math.max(0, Math.round(innerWidth - clientWidth)),
    top: 0,
  };
}

function nodeGraphFloatingWindowCssPositionFromViewport(left, top) {
  const offset = nodeGraphFloatingWindowViewportOffset();
  return {
    left: Math.round((Number(left) || 0) - offset.left),
    top: Math.round((Number(top) || 0) - offset.top),
  };
}

function nodeGraphFloatingWindowViewportPositionFromCss(left, top) {
  const offset = nodeGraphFloatingWindowViewportOffset();
  return {
    left: Math.round((Number(left) || 0) + offset.left),
    top: Math.round((Number(top) || 0) + offset.top),
  };
}

function setNodeGraphFloatingWindowViewportPosition(element, left, top) {
  if (!element) {
    return { left: 0, top: 0 };
  }
  // Always pin to the viewport — never leave relative/static windows that
  // expand document flow (module browser regressed into the wiring panel).
  const style = element.style;
  if (style.position !== "fixed") {
    style.position = "fixed";
  }
  style.margin = style.margin || "0";
  const css = nodeGraphFloatingWindowCssPositionFromViewport(left, top);
  style.left = `${css.left}px`;
  style.top = `${css.top}px`;
  style.right = "auto";
  return {
    left: Math.round(Number(left) || 0),
    top: Math.round(Number(top) || 0),
  };
}


function nodeGraphFloatingWindowPosition(element, x, y, options = {}) {
  if (!element) {
    return { left: 0, top: 0 };
  }
  const wasHidden = element.hidden;
  element.hidden = false;
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Number(options.width) || rect.width || 1);
  const height = Math.max(1, Number(options.height) || rect.height || 1);
  const halfWidth = width * 0.5;
  const visibleWidth = Math.max(1, Math.min(width, Number(options.visibleWidth) || halfWidth));
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
  // Horizontal: 50% may go off either edge
  const minLeft = visibleWidth - width;
  const maxLeft = viewportWidth - visibleWidth;
  // Vertical: title bar (top) must stay fully on screen; bottom 50% may go off
  const minTop = 0;
  const maxTop = viewportHeight - height * 0.5;
  const left = Math.round(Math.max(minLeft, Math.min(maxLeft, Number(x) || 0)));
  const top = Math.round(Math.max(minTop, Math.min(maxTop, Number(y) || 0)));
  element.hidden = wasHidden;
  return { left, top };
}

/**
 * Master debug chrome: Visibility "Show Debug" (keyboard diagnostics,
 * constraint guide, evidence / .node-debug-only surfaces).
 *
 * Default is ALWAYS off — debug and release builds alike. Session-only via D
 * / Visibility; never restored from UI settings / Clear Startup / Save.
 * Hiding also re-collapses the evidence panels so a prior "Show Evidence"
 * cannot leave developer chrome visible after Hide Debug or a cold start.
 */
function renderNodeGraphKeyboardDebugToggle() {
  const button = document.getElementById("nodeKeyboardDebugToggleButton");
  const visible = nodeGraphMvp?.keyboardDebugInfoVisible === true;
  document.body.classList.toggle("keyboard-debug-hidden", !visible);
  // When debug is off, force evidence collapsed too (release-like UX).
  if (!visible) {
    document.body.classList.add("debug-collapsed");
    const evidence = document.getElementById("toggleDebugButton");
    if (evidence) {
      evidence.textContent = "Show Evidence";
      evidence.setAttribute("aria-pressed", "false");
    }
  }
  if (button) {
    const label = button.querySelector("span");
    if (label) {
      label.textContent = visible ? "Hide Debug" : "Show Debug";
    } else {
      button.textContent = visible ? "Hide Debug" : "Show Debug";
    }
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.removeAttribute("title");
  }
  renderNodeGraphVisibilityMenuButton();
}

/** Force diagnostics off (startup, Clear Startup, UI-settings apply). */
function hideNodeGraphDebugChrome() {
  if (typeof nodeGraphMvp === "object" && nodeGraphMvp) {
    nodeGraphMvp.keyboardDebugInfoVisible = false;
  }
  document.body.classList.add("keyboard-debug-hidden");
  document.body.classList.add("debug-collapsed");
  if (typeof renderNodeGraphKeyboardDebugToggle === "function") {
    renderNodeGraphKeyboardDebugToggle();
  } else {
    const evidence = document.getElementById("toggleDebugButton");
    if (evidence) {
      evidence.textContent = "Show Evidence";
      evidence.setAttribute("aria-pressed", "false");
    }
    const button = document.getElementById("nodeKeyboardDebugToggleButton");
    if (button) {
      const label = button.querySelector("span");
      if (label) {
        label.textContent = "Show Debug";
      } else {
        button.textContent = "Show Debug";
      }
      button.setAttribute("aria-pressed", "false");
    }
  }
}


function setNodeGraphVisibilityMenuOpen(open) {
  const menu = document.getElementById("nodeVisibilityMenu");
  if (menu) {
    if (open && !menu.hidden) {
      pulseNodeGraphFloatingWindowAttention(menu);
      if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
        noteNodeGraphUnifiedWindowOpened("visibilityMenu", menu);
      }
      renderNodeGraphVisibilityMenuButton();
      return;
    }
    menu.hidden = !open;
    if (open) {
      applyNodeGraphVisibilityMenuSize(nodeGraphMvp.workspaceWindowStates?.visibilityMenu?.size);
      const pending = nodeGraphMvp._unifiedWindowPendingPosition;
      if (pending && Number.isFinite(Number(pending.left)) && Number.isFinite(Number(pending.top))) {
        if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
          setNodeGraphFloatingWindowViewportPosition(menu, pending.left, pending.top);
        } else {
          menu.style.left = `${Math.round(pending.left)}px`;
          menu.style.top = `${Math.round(pending.top)}px`;
        }
        if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
          rememberNodeGraphWorkspaceWindowState("visibilityMenu", menu, { open: true }, { status: false });
        }
      } else {
        openNodeGraphFloatingWindowAtPosition("visibilityMenu", menu, () => {
          positionNodeGraphVisibilityMenuNearButton(menu);
        });
      }
      if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
        noteNodeGraphUnifiedWindowOpened("visibilityMenu", menu);
      }
    }
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("visibilityMenu", menu, { open: Boolean(open) }, { status: false });
  }
  renderNodeGraphVisibilityMenuButton();
}

function positionNodeGraphVisibilityMenuNearButton(menu = document.getElementById("nodeVisibilityMenu")) {
  const button = document.getElementById("nodeVisibilityMenuButton");
  if (!menu) {
    return;
  }
  if (!button) {
    const menuRect = menu.getBoundingClientRect();
    positionNodeGraphVisibilityMenu(
      menu,
      (window.innerWidth - menuRect.width) * 0.5,
      (window.innerHeight - menuRect.height) * 0.25,
    );
    return;
  }
  const rect = button.getBoundingClientRect();
  menu.hidden = false;
  const menuRect = menu.getBoundingClientRect();
  positionNodeGraphVisibilityMenu(menu, rect.right - menuRect.width, rect.bottom + 8);
}

function positionNodeGraphVisibilityMenu(menu, x, y) {
  if (!menu) {
    return;
  }
  menu.style.position = "fixed";
  const rect = menu.getBoundingClientRect();
  const { left, top } = nodeGraphFloatingWindowPosition(menu, x, y, {
    visibleWidth: rect.width,
    visibleHeight: rect.height,
  });
  setNodeGraphFloatingWindowViewportPosition(menu, left, top);
}

function nodeGraphVisibilityMenuMinimumSize(menu = document.getElementById("nodeVisibilityMenu")) {
  const readableWindowMinWidth = 180;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const sharedHeaderHeight = Number.parseFloat(
    rootStyle.getPropertyValue("--node-floating-window-header-height"),
  ) || 30;
  const sharedButtonHeight = Number.parseFloat(
    rootStyle.getPropertyValue("--node-floating-window-button-height"),
  ) || 30;
  const buttonCount = menu?.querySelectorAll?.(".node-visibility-menu-list button").length || 7;
  return {
    width: readableWindowMinWidth,
    height: Math.ceil(sharedHeaderHeight + (buttonCount * sharedButtonHeight)),
  };
}

function nodeGraphVisibilityMenuSizeFromElement(menu = document.getElementById("nodeVisibilityMenu")) {
  if (!menu) {
    return null;
  }
  const rect = menu.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
  };
}

function applyNodeGraphVisibilityMenuSize(size = {}) {
  const menu = document.getElementById("nodeVisibilityMenu");
  if (!menu) {
    return null;
  }
  const rect = menu.getBoundingClientRect();
  const minimum = nodeGraphVisibilityMenuMinimumSize(menu);
  const normalized = normalizeNodeGraphFloatingWindowSize(
    {
      width: Number(size.width) || rect.width,
    },
    {
      minWidth: minimum.width,
      maxWidth: 420,
      minHeight: minimum.height,
      maxHeight: 520,
      width: 185,
    },
  );
  menu.style.width = `${normalized.width}px`;
  menu.style.minHeight = `${minimum.height}px`;
  menu.style.removeProperty("height");
  return normalized;
}

function beginNodeGraphVisibilityMenuResize(event) {
  const menu = document.getElementById("nodeVisibilityMenu");
  const drag = beginNodeGraphFloatingWindowResize(
    event,
    menu,
    "visibilityMenuResizing",
  );
  if (drag && menu) {
    const current = nodeGraphFloatingWindowElementPosition(menu);
    drag.startLeft = current.left;
    drag.startTop = current.top;
  }
}

function dragNodeGraphVisibilityMenuResize(event) {
  const handled = dragNodeGraphFloatingWindowResize(
    event,
    "visibilityMenuResizing",
    applyNodeGraphVisibilityMenuSize,
    { height: false },
  );
  if (handled) {
    const drag = nodeGraphMvp.visibilityMenuResizing;
    const menu = document.getElementById("nodeVisibilityMenu");
    if (drag && menu) {
      setNodeGraphFloatingWindowViewportPosition(menu, drag.startLeft, drag.startTop);
    }
  }
}

function endNodeGraphVisibilityMenuResize(event) {
  endNodeGraphFloatingWindowResize(event, "visibilityMenuResizing", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "visibilityMenu",
        document.getElementById("nodeVisibilityMenu"),
        { size: nodeGraphVisibilityMenuSizeFromElement() },
        { status: false },
      );
    }
  });
}

function beginNodeGraphVisibilityMenuDrag(event) {
  const menu = document.getElementById("nodeVisibilityMenu");
  if (!menu || menu.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, menu, "visibilityMenuDragging");
}

function dragNodeGraphVisibilityMenu(event) {
  const menu = document.getElementById("nodeVisibilityMenu");
  dragNodeGraphFloatingWindow(event, "visibilityMenuDragging", menu, (next) => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("visibilityMenu", menu, { open: true, position: next }, { persist: false });
    }
  });
}

function endNodeGraphVisibilityMenuDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "visibilityMenuDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState("visibilityMenu", document.getElementById("nodeVisibilityMenu"), {}, { status: false });
    }
  });
}

function toggleNodeGraphVisibilityMenu() {
  const menu = document.getElementById("nodeVisibilityMenu");
  setNodeGraphVisibilityMenuOpen(!(menu && !menu.hidden));
}

function nodeGraphStartupViewModeFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const value = String(params.get("sandboxView") || params.get("view") || "").trim().toLowerCase();
  const truthy = (name) => {
    const raw = String(params.get(name) || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "only";
  };
  // `hideui` (full-screen no-chrome) and `modular` both force modular-only view.
  if (
    value === "modular-only" || value === "modularonly" || value === "modular-only-view" ||
    truthy("modular") || truthy("hideui")
  ) {
    return "modular-only";
  }
  return "modular";
}

function resetNodeGraphStartupView() {
  nodeGraphMvp.moduleStoreDepartment = "";
  nodeGraphMvp.moduleStoreDepartmentAnchor = "";
  nodeGraphMvp.sceneContextPoint = null;
  setNodeGraphViewMode(nodeGraphStartupViewModeFromUrl());
}

// Docked (not floating/draggable) performance surface, toggled on/off,
// sitting below the modular workspace -- second instances of the exact
// same keyboardController/pitchModWheel/macroControls module bodies, not
// a separate implementation. Every one of these already keeps its state
// in shared nodeGraphMvp fields (midiKeyboardSignal, performance wheel
// values, macroControls array) and re-renders every matching DOM surface
// in the whole document on change, so a second instance of each mirrors
// its node counterpart for free. Populated once at bootstrap; only
// visibility changes after that.
function initNodeGraphStandaloneMidiKeyboard() {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  const body = document.getElementById("nodeStandaloneMidiKeyboardBody");
  if (!dock || !body || dock.dataset.populated === "true") {
    return;
  }
  dock.dataset.populated = "true";
  const performanceRow = document.createElement("div");
  performanceRow.className = "node-standalone-performance-row";
  performanceRow.append(createNodeGraphPitchModWheelBody(), createNodeGraphKeyboardControllerBody());
  body.append(createNodeGraphMacroControlsBody(), performanceRow);
  renderNodeGraphKeyboardControllerModules();
  bindNodeGraphMacroControlModuleEvents();
}

// Free-floating window, same generic drag/resize/lock/keyboard-nudge
// subsystem as Command Center et al (node-graph-floating-windows.js) --
// not a workspace-docked panel synced to #nodeGraphWorkspace's width
// anymore. workspaceWindowStates.standaloneMidiKeyboard is the single
// source of truth for open/closed, matching every other floating window
// (no separate ad-hoc visibility flag).
const nodeStandaloneMidiKeyboardDockDefaultSize = Object.freeze({
  width: 860,
  minWidth: 420,
  // No real ceiling on drag-resize width -- normalizeNodeGraphFloatingWindowSize
  // falls back to 720 if maxWidth isn't finite, so this can't just be
  // omitted/Infinity; a large-but-finite number here means the resize is
  // bounded only by the actual screen (viewportWidth, via viewportMargin: 0
  // below -- this dock should be draggable all the way to the true edge,
  // unlike most floating windows which keep the default small margin).
  maxWidth: 8000,
  viewportMargin: 0,
  height: 260,
  minHeight: 160,
  maxHeight: 640,
});

function normalizeNodeGraphStandaloneMidiKeyboardDockSize(size = {}) {
  return normalizeNodeGraphFloatingWindowSize(size, nodeStandaloneMidiKeyboardDockDefaultSize);
}

function applyNodeGraphStandaloneMidiKeyboardDockSize(size = nodeGraphMvp.standaloneMidiKeyboardWindowSize) {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  const normalized = normalizeNodeGraphStandaloneMidiKeyboardDockSize(size || nodeStandaloneMidiKeyboardDockDefaultSize);
  nodeGraphMvp.standaloneMidiKeyboardWindowSize = normalized;
  if (!dock) {
    return normalized;
  }
  applyNodeGraphFloatingWindowSizeVars(dock, "node-standalone-keyboard", nodeStandaloneMidiKeyboardDockDefaultSize, normalized);
  return normalized;
}

function positionNodeGraphStandaloneMidiKeyboardDockAtSavedOr(x, y) {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  if (!dock) {
    return;
  }
  dock.hidden = false;
  applyNodeGraphStandaloneMidiKeyboardDockSize();
  const savedPosition = nodeGraphMvp.workspaceWindowStates?.standaloneMidiKeyboard?.position;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  const { left, top } = nodeGraphFloatingWindowPosition(
    dock,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
  );
  setNodeGraphFloatingWindowViewportPosition(dock, left, top);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "standaloneMidiKeyboard",
      dock,
      { open: true, position: { left, top } },
      { persist: false },
    );
  }
}

function beginNodeGraphStandaloneMidiKeyboardDrag(event) {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  if (!dock || dock.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, dock, "standaloneMidiKeyboardDragging");
}

function dragNodeGraphStandaloneMidiKeyboard(event) {
  dragNodeGraphFloatingWindow(
    event,
    "standaloneMidiKeyboardDragging",
    document.getElementById("nodeStandaloneMidiKeyboardDock"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "standaloneMidiKeyboard",
          document.getElementById("nodeStandaloneMidiKeyboardDock"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeGraphStandaloneMidiKeyboardDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "standaloneMidiKeyboardDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "standaloneMidiKeyboard",
        document.getElementById("nodeStandaloneMidiKeyboardDock"),
        { open: true },
        { status: false },
      );
    }
  });
}

function beginNodeGraphStandaloneMidiKeyboardResize(event) {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  beginNodeGraphFloatingWindowResize(event, dock, "standaloneMidiKeyboardResizing");
}

function dragNodeGraphStandaloneMidiKeyboardResize(event) {
  dragNodeGraphFloatingWindowResize(event, "standaloneMidiKeyboardResizing", applyNodeGraphStandaloneMidiKeyboardDockSize);
}

function endNodeGraphStandaloneMidiKeyboardResize(event) {
  endNodeGraphFloatingWindowResize(event, "standaloneMidiKeyboardResizing", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "standaloneMidiKeyboard",
        document.getElementById("nodeStandaloneMidiKeyboardDock"),
        { open: true, size: normalizeNodeGraphStandaloneMidiKeyboardDockSize(nodeGraphMvp.standaloneMidiKeyboardWindowSize) },
        { status: false },
      );
    }
  });
}

function renderNodeGraphStandaloneMidiKeyboardToggle() {
  const button = document.getElementById("nodeStandaloneMidiKeyboardButton");
  const sceneButton = document.getElementById("nodeSceneToggleStandaloneMidiKeyboard");
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  const visible = Boolean(dock && !dock.hidden);
  if (button) {
    button.setAttribute("aria-pressed", visible ? "true" : "false");
  }
  if (sceneButton) {
    sceneButton.setAttribute("aria-pressed", visible ? "true" : "false");
  }
}

function closeNodeGraphStandaloneMidiKeyboard() {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  if (dock) {
    dock.hidden = true;
  }
  if (nodeGraphMvp.standaloneMidiKeyboardDragging?.handle) {
    nodeGraphMvp.standaloneMidiKeyboardDragging.handle.classList.remove("dragging");
  }
  if (nodeGraphMvp.standaloneMidiKeyboardResizing?.handle) {
    nodeGraphMvp.standaloneMidiKeyboardResizing.handle.classList.remove("dragging");
  }
  nodeGraphMvp.standaloneMidiKeyboardDragging = null;
  nodeGraphMvp.standaloneMidiKeyboardResizing = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("standaloneMidiKeyboard", dock, { open: false }, { status: false });
  }
  renderNodeGraphStandaloneMidiKeyboardToggle();
  setNodeInteractionHelp("MIDI keyboard hidden.");
}

function toggleNodeGraphStandaloneMidiKeyboard() {
  const dock = document.getElementById("nodeStandaloneMidiKeyboardDock");
  const currentlyVisible = Boolean(dock && !dock.hidden);
  if (currentlyVisible) {
    closeNodeGraphStandaloneMidiKeyboard();
    return;
  }
  initNodeGraphStandaloneMidiKeyboard();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 900;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
  const defaultWidth = nodeStandaloneMidiKeyboardDockDefaultSize.width;
  const defaultHeight = nodeStandaloneMidiKeyboardDockDefaultSize.height;
  positionNodeGraphStandaloneMidiKeyboardDockAtSavedOr(
    Math.max(12, (viewportWidth - defaultWidth) / 2),
    Math.max(12, viewportHeight - defaultHeight - 24),
  );
  renderNodeGraphStandaloneMidiKeyboardToggle();
  setNodeInteractionHelp("MIDI keyboard shown.");
}

// Free-floating, draggable, resizable window hosting #nodeInteractionHelp,
// same generic drag/resize/lock/keyboard-nudge subsystem as Command
// Center et al (node-graph-floating-windows.js). Exists so tips stay
// reachable in modular-only view, where the old in-flow .node-help-stack
// row (and everything else outside a floating window) gets hidden.
const nodeTooltipWindowDefaultSize = Object.freeze({
  width: 420,
  minWidth: 260,
  maxWidth: 900,
  height: 90,
  minHeight: 90,
  maxHeight: 480,
});

function normalizeNodeGraphTooltipWindowSize(size = {}) {
  return normalizeNodeGraphFloatingWindowSize(size, nodeTooltipWindowDefaultSize);
}

function applyNodeGraphTooltipWindowSize(size = nodeGraphMvp.tooltipWindowSize) {
  const win = document.getElementById("nodeTooltipWindow");
  const normalized = normalizeNodeGraphTooltipWindowSize(size || nodeTooltipWindowDefaultSize);
  nodeGraphMvp.tooltipWindowSize = normalized;
  if (!win) {
    return normalized;
  }
  applyNodeGraphFloatingWindowSizeVars(win, "node-tooltip-window", nodeTooltipWindowDefaultSize, normalized);
  return normalized;
}

function positionNodeGraphTooltipWindowAtSavedOr(x, y) {
  const win = document.getElementById("nodeTooltipWindow");
  if (!win) {
    return;
  }
  win.hidden = false;
  applyNodeGraphTooltipWindowSize();
  const savedPosition = nodeGraphMvp.workspaceWindowStates?.tooltipWindow?.position;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  const { left, top } = nodeGraphFloatingWindowPosition(
    win,
    hasSavedPosition ? savedPosition.left : x,
    hasSavedPosition ? savedPosition.top : y,
  );
  setNodeGraphFloatingWindowViewportPosition(win, left, top);
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "tooltipWindow",
      win,
      { open: true, position: { left, top } },
      { persist: false },
    );
  }
}

function beginNodeGraphTooltipWindowDrag(event) {
  const win = document.getElementById("nodeTooltipWindow");
  if (!win || win.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, win, "tooltipWindowDragging");
}

function beginNodeGraphTooltipWindowResize(event) {
  const win = document.getElementById("nodeTooltipWindow");
  beginNodeGraphFloatingWindowResize(event, win, "tooltipWindowResizing");
}

function dragNodeGraphTooltipWindowResize(event) {
  dragNodeGraphFloatingWindowResize(event, "tooltipWindowResizing", applyNodeGraphTooltipWindowSize);
}

function endNodeGraphTooltipWindowResize(event) {
  endNodeGraphFloatingWindowResize(event, "tooltipWindowResizing", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "tooltipWindow",
        document.getElementById("nodeTooltipWindow"),
        { open: true, size: normalizeNodeGraphTooltipWindowSize(nodeGraphMvp.tooltipWindowSize) },
        { status: false },
      );
    }
  });
}

function dragNodeGraphTooltipWindow(event) {
  dragNodeGraphFloatingWindow(
    event,
    "tooltipWindowDragging",
    document.getElementById("nodeTooltipWindow"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "tooltipWindow",
          document.getElementById("nodeTooltipWindow"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeGraphTooltipWindowDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "tooltipWindowDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "tooltipWindow",
        document.getElementById("nodeTooltipWindow"),
        { open: true },
        { status: false },
      );
    }
  });
}

// ── Tips: SHOWN is one question, WHERE is another ─────────────────────────
// Two independent toggles sharing one row in the visibility menu.
//
//   Hide/Show Tooltips - are the tips displayed at all
//   Embed Tips         - floating window, or in-flow band beside the
//                        CPU/RAM/GPU guide
//
// Shown-ness has no state variable of its own; it is read off whichever host
// is currently in use, so there is nothing to keep in sync and no way for the
// button label to disagree with what is on screen.
function nodeGraphTooltipsShown() {
  if (nodeGraphMvp.tooltipEmbedded === true) {
    return document.getElementById("nodeInteractionHelpEmbedSlot")?.hidden === false;
  }
  return document.getElementById("nodeTooltipWindow")?.hidden === false;
}

function renderNodeGraphTooltipWindowToggle() {
  const button = document.getElementById("nodeTooltipToggleButton");
  const visible = nodeGraphTooltipsShown();
  if (button) {
    const label = button.querySelector(".scene-context-window-button-label");
    if (label) {
      label.textContent = visible ? "Hide Tooltips" : "Show Tooltips";
    }
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.removeAttribute("title");
  }
  const embedButton = document.getElementById("nodeTooltipEmbedToggleButton");
  if (embedButton) {
    const embedded = nodeGraphMvp.tooltipEmbedded === true;
    const label = embedButton.querySelector(".scene-context-window-button-label");
    if (label) {
      label.textContent = embedded ? "Float Tips" : "Embed Tips";
    }
    embedButton.setAttribute("aria-pressed", embedded ? "true" : "false");
    embedButton.removeAttribute("title");
  }
  renderNodeGraphVisibilityMenuButton();
}

// Embedded tips height (in-flow band above modular workspace). User-draggable;
// text is fitted to the box so hover tips do not reflow the graph.
const nodeTooltipEmbedHeightDefault = 46;
const nodeTooltipEmbedHeightMin = 32;
const nodeTooltipEmbedHeightMax = 320;

function normalizeNodeGraphTooltipEmbedHeight(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return nodeTooltipEmbedHeightDefault;
  }
  return Math.max(nodeTooltipEmbedHeightMin, Math.min(nodeTooltipEmbedHeightMax, n));
}

function applyNodeGraphTooltipEmbedHeight(height = nodeGraphMvp.tooltipEmbedHeight) {
  const px = normalizeNodeGraphTooltipEmbedHeight(
    height ?? nodeGraphMvp.tooltipEmbedHeight ?? nodeTooltipEmbedHeightDefault,
  );
  nodeGraphMvp.tooltipEmbedHeight = px;
  const panel = document.getElementById("nodeWiringPanel");
  const help = document.getElementById("nodeInteractionHelp");
  const css = `${px}px`;
  panel?.style?.setProperty("--node-tooltip-embed-height", css);
  if (help?.classList.contains("is-embedded")) {
    help.style.setProperty("--node-tooltip-embed-height", css);
  }
  return px;
}

function beginNodeGraphTooltipEmbedResize(event) {
  if (event.button != null && event.button !== 0) {
    return;
  }
  const handle = document.getElementById("nodeInteractionHelpEmbedResize");
  const help = document.getElementById("nodeInteractionHelp");
  if (!handle || !help?.classList.contains("is-embedded")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  handle.classList.add("dragging");
  nodeGraphMvp.tooltipEmbedResizing = {
    handle,
    startY: event.clientY,
    startHeight: normalizeNodeGraphTooltipEmbedHeight(
      nodeGraphMvp.tooltipEmbedHeight ?? nodeTooltipEmbedHeightDefault,
    ),
    pointerId: event.pointerId,
  };
  try {
    handle.setPointerCapture?.(event.pointerId);
  } catch {
    // ignore
  }
}

function dragNodeGraphTooltipEmbedResize(event) {
  const state = nodeGraphMvp.tooltipEmbedResizing;
  if (!state) {
    return;
  }
  // Drag down = taller tips (toward modular workspace); drag up = shorter.
  const delta = event.clientY - state.startY;
  const next = applyNodeGraphTooltipEmbedHeight(state.startHeight + delta);
  const help = document.getElementById("nodeInteractionHelp");
  if (typeof fitNodeInteractionHelpText === "function") {
    fitNodeInteractionHelpText(help);
  }
  return next;
}

function endNodeGraphTooltipEmbedResize(event) {
  const state = nodeGraphMvp.tooltipEmbedResizing;
  if (!state) {
    return;
  }
  if (event?.pointerId != null) {
    try {
      state.handle?.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  }
  state.handle?.classList.remove("dragging");
  nodeGraphMvp.tooltipEmbedResizing = null;
  applyNodeGraphTooltipEmbedHeight();
  const help = document.getElementById("nodeInteractionHelp");
  if (typeof fitNodeInteractionHelpText === "function") {
    fitNodeInteractionHelpText(help);
  }
  if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
    saveNodeGraphWorkingPatchToUserSettings({ immediateFile: false });
  }
}

// Physically relocates #nodeInteractionHelp between the floating window and
// the in-flow slot, carrying its shown-ness across so flipping the mode never
// silently hides the tips you were reading.
function applyNodeGraphTooltipEmbed({ shown } = {}) {
  const help = document.getElementById("nodeInteractionHelp");
  const slot = document.getElementById("nodeInteractionHelpEmbedSlot");
  const win = document.getElementById("nodeTooltipWindow");
  const resize = document.getElementById("nodeInteractionHelpEmbedResize");
  if (!help || !slot || !win) {
    return;
  }
  const embedded = nodeGraphMvp.tooltipEmbedded === true;
  const wantShown = shown === undefined ? nodeGraphTooltipsShown() : Boolean(shown);
  help.classList.toggle("is-embedded", embedded);
  if (embedded) {
    // Help first, then resize grip (stay under the tip, above modular view).
    if (help.parentElement !== slot) {
      if (resize && resize.parentElement === slot) {
        slot.insertBefore(help, resize);
      } else {
        slot.append(help);
      }
    }
    if (resize && resize.parentElement !== slot) {
      slot.append(resize);
    }
    // The window is empty in this mode - there is nothing left in it to show.
    win.hidden = true;
    slot.hidden = !wantShown;
    if (resize) {
      resize.hidden = !wantShown;
    }
    applyNodeGraphTooltipEmbedHeight();
  } else {
    if (help.parentElement !== win) {
      // Before the resize handle, so the handle stays the last child and keeps
      // its corner placement.
      win.insertBefore(help, document.getElementById("nodeTooltipWindowResizeHandle"));
    }
    slot.hidden = true;
    if (resize) {
      resize.hidden = true;
    }
    if (wantShown && win.hidden) {
      openNodeGraphTooltipWindow();
      return;
    }
    if (!wantShown) {
      win.hidden = true;
    }
  }
  // Switching between the floating window and the embedded band changes which
  // box the text has to fit, so re-fit whatever tip is already showing.
  if (typeof fitNodeInteractionHelpText === "function") {
    fitNodeInteractionHelpText(help);
  }
  renderNodeGraphTooltipWindowToggle();
}

function toggleNodeGraphTooltipEmbed() {
  const wasShown = nodeGraphTooltipsShown();
  nodeGraphMvp.tooltipEmbedded = !(nodeGraphMvp.tooltipEmbedded === true);
  applyNodeGraphTooltipEmbed({ shown: wasShown });
  setNodeInteractionHelp(
    nodeGraphMvp.tooltipEmbedded
      ? "Tips embedded beside the resource meters."
      : "Tips floating in their own window.",
  );
}

function closeNodeGraphTooltipWindow() {
  const win = document.getElementById("nodeTooltipWindow");
  if (win) {
    win.hidden = true;
  }
  if (nodeGraphMvp.tooltipWindowDragging?.handle) {
    nodeGraphMvp.tooltipWindowDragging.handle.classList.remove("dragging");
  }
  if (nodeGraphMvp.tooltipWindowResizing?.handle) {
    nodeGraphMvp.tooltipWindowResizing.handle.classList.remove("dragging");
  }
  nodeGraphMvp.tooltipWindowDragging = null;
  nodeGraphMvp.tooltipWindowResizing = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("tooltipWindow", win, { open: false }, { status: false });
  }
  renderNodeGraphTooltipWindowToggle();
}

function openNodeGraphTooltipWindow() {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 900;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
  positionNodeGraphTooltipWindowAtSavedOr(
    Math.max(12, (viewportWidth - 420) / 2),
    Math.max(12, viewportHeight - 220),
  );
  renderNodeGraphTooltipWindowToggle();
}

// Bound to both the menu button and the T key. In embedded mode there is no
// window to open, so this shows/hides the in-flow slot instead - same button,
// same meaning, different host.
function toggleNodeGraphTooltipWindow() {
  if (nodeGraphMvp.tooltipEmbedded === true) {
    const slot = document.getElementById("nodeInteractionHelpEmbedSlot");
    const resize = document.getElementById("nodeInteractionHelpEmbedResize");
    if (slot) {
      slot.hidden = !slot.hidden;
      if (resize) {
        resize.hidden = slot.hidden;
      }
      if (!slot.hidden && typeof applyNodeGraphTooltipEmbedHeight === "function") {
        applyNodeGraphTooltipEmbedHeight();
      }
    }
    renderNodeGraphTooltipWindowToggle();
    return;
  }
  if (document.getElementById("nodeTooltipWindow")?.hidden === false) {
    closeNodeGraphTooltipWindow();
    return;
  }
  openNodeGraphTooltipWindow();
}

function renderNodeGraphVideoViewToggle() {
  const button = document.getElementById("nodeVideoViewButton");
  const panel = document.getElementById("nodeVideoViewPanel");
  const workspace = document.getElementById("nodeGraphWorkspace");
  const wiringPanel = document.getElementById("nodeWiringPanel");
  const workspaceAvailable = Boolean(workspace && !workspace.hidden);
  const visible = Boolean(nodeGraphMvp.videoViewVisible) && workspaceAvailable;
  wiringPanel?.classList.toggle("camera-view-visible", visible);
  if (panel) {
    panel.hidden = !visible;
  }
  if (button) {
    button.innerHTML = "<span>Camera</span>";
    button.setAttribute("aria-label", "Camera");
    button.setAttribute("aria-pressed", visible ? "true" : "false");
    button.removeAttribute("title");
  }
  if (typeof renderNodeGraphCameraView === "function") {
    renderNodeGraphCameraView();
  }
}

function normalizeNodeGraphMacroValue(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

// No arbitrary numeric ceiling (the old 2-16px range was just a made-up
// cap) -- the real bounds are geometric. 1px is the hard floor a ring can
// be and still read as a ring at all. The knob dial itself is
// `width: min(42px, 80%)` (see .node-macro-knob i in styles.css), so its
// radius -- 21px -- is the true maximum: past that the "ring" has consumed
// its own hole and become a solid filled disc again, so there's nothing
// more "100% thick" than that.
const nodeGraphMacroKnobArcThicknessMinPx = 1;
const nodeGraphMacroKnobArcThicknessMaxPx = 21;

function normalizeNodeGraphMacroKnobArcThickness(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? clampNodeSliderValue(number, nodeGraphMacroKnobArcThicknessMinPx, nodeGraphMacroKnobArcThicknessMaxPx)
    : 7;
}

// The control itself is felt as a plain 0-100% slider (0% = the 1px floor,
// 100% = the full-radius ceiling) -- these two convert between that percent
// scale and the pixel value that's actually stored/applied, so the number
// readout can keep showing real pixels while the slider stays percent-based.
function nodeGraphMacroKnobArcThicknessPercentToPx(percent) {
  const ratio = clampNodeSliderValue(Number(percent) || 0, 0, 100) / 100;
  return nodeGraphMacroKnobArcThicknessMinPx +
    ratio * (nodeGraphMacroKnobArcThicknessMaxPx - nodeGraphMacroKnobArcThicknessMinPx);
}

function nodeGraphMacroKnobArcThicknessPxToPercent(px) {
  const clamped = normalizeNodeGraphMacroKnobArcThickness(px);
  return ((clamped - nodeGraphMacroKnobArcThicknessMinPx) /
    (nodeGraphMacroKnobArcThicknessMaxPx - nodeGraphMacroKnobArcThicknessMinPx)) * 100;
}

// The macro knob's ring is a mask cut into a circle (see .node-macro-knob i
// in styles.css) rather than a border, so its thickness has to travel in as
// a CSS custom property instead of a class toggle -- one global var read by
// every knob's mask-image, kept in sync with the user setting here.
//
// The mask itself is driven by --macro-knob-arc-thickness-percent (a 0..1
// fraction of the mask's own closest-side, i.e. THAT knob's real on-screen
// radius) rather than the raw pixel value -- knobs don't all render at the
// same size (compact module rows use a smaller `min(42px, 80%)` dial than
// the default panel, the standalone dock uses a bigger one), so a fixed
// pixel thickness that happened to equal one context's radius could exceed
// a smaller knob's actual radius elsewhere, pushing the mask's percentage
// stops negative and leaving it stuck looking hollow instead of closing
// into a full circle at 100%. The percent fraction is always correct
// relative to whatever radius a given knob actually has.
function applyNodeGraphMacroKnobArcThickness() {
  const thickness = normalizeNodeGraphMacroKnobArcThickness(nodeGraphMvp.macroKnobArcThickness);
  const percentOfRadius = thickness / nodeGraphMacroKnobArcThicknessMaxPx;
  document.documentElement?.style?.setProperty("--macro-knob-arc-thickness", `${thickness}px`);
  document.documentElement?.style?.setProperty("--macro-knob-arc-thickness-percent", String(percentOfRadius));
}

function setNodeGraphMacroKnobArcThickness(value) {
  nodeGraphMvp.macroKnobArcThickness = normalizeNodeGraphMacroKnobArcThickness(value);
  applyNodeGraphMacroKnobArcThickness();
}

// The dial's conic-gradient always carries a transparent notch for the
// knob's -132..+132deg mechanical travel limit -- that's what makes it read
// as an open arc instead of a closed loop. Tying its brightness to arc
// thickness (so it silently filled in as thickness rose) was wrong -- it
// turned the default arc into a closed loop even at everyday thickness
// values. This is its own independent setting instead: 0% keeps a true
// transparent gap (the normal arc look), turn it up only if a closed/pie
// look is actually wanted.
function normalizeNodeGraphMacroKnobArcGapBrightness(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clampNodeSliderValue(number, 0, 100) : 0;
}

function applyNodeGraphMacroKnobArcGapBrightness() {
  const brightness = normalizeNodeGraphMacroKnobArcGapBrightness(nodeGraphMvp.macroKnobArcGapBrightness);
  document.documentElement?.style?.setProperty("--macro-knob-arc-gap-brightness", String(brightness / 100));
}

function setNodeGraphMacroKnobArcGapBrightness(value) {
  nodeGraphMvp.macroKnobArcGapBrightness = normalizeNodeGraphMacroKnobArcGapBrightness(value);
  applyNodeGraphMacroKnobArcGapBrightness();
}

// A plain transform: scale() on the whole .node-macro-knob button (dial,
// label, and value readout together, scaled and re-centered as one unit --
// "zooming in" on the widget itself) rather than resizing any one part in
// isolation. Transform doesn't reflow layout, so this deliberately doesn't
// grow the knob's grid cell -- past ~100% it just overflows/clips against
// the panel's own overflow:hidden, which is the accepted tradeoff for
// letting this go arbitrarily large without fighting the grid.
const nodeGraphMacroKnobSizeScaleMin = 0.25;
const nodeGraphMacroKnobSizeScaleMax = 4;

function normalizeNodeGraphMacroKnobSizeScale(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? clampNodeSliderValue(number, nodeGraphMacroKnobSizeScaleMin, nodeGraphMacroKnobSizeScaleMax)
    : 1;
}

function applyNodeGraphMacroKnobSizeScale() {
  const scale = normalizeNodeGraphMacroKnobSizeScale(nodeGraphMvp.macroKnobSizeScale);
  document.documentElement?.style?.setProperty("--macro-knob-size-scale", String(scale));
}

function setNodeGraphMacroKnobSizeScale(value) {
  nodeGraphMvp.macroKnobSizeScale = normalizeNodeGraphMacroKnobSizeScale(value);
  applyNodeGraphMacroKnobSizeScale();
}

// The knob's actual interactive hit region is the whole rectangular
// button (.node-macro-knob), not just the visible circular dial inside
// it -- dragging/clicking works anywhere in that rectangle, including the
// corners well outside the arc. This just makes that real hit region
// visible with a one-pixel stroke so it stops being a surprise; it
// doesn't change the hit region itself.
function applyNodeGraphMacroKnobHitboxOutlineVisible() {
  // Toggled on body rather than #nodeGraphWorkspace -- macro knobs also
  // render inside the standalone MIDI keyboard dock, which isn't a
  // descendant of the workspace, so this needs to reach both.
  document.body.classList.toggle("macro-knob-hitbox-outline", Boolean(nodeGraphMvp.macroKnobHitboxOutlineVisible));
}

function setNodeGraphMacroKnobHitboxOutlineVisible(visible) {
  nodeGraphMvp.macroKnobHitboxOutlineVisible = Boolean(visible);
  applyNodeGraphMacroKnobHitboxOutlineVisible();
}

// Where the label and value readout sit (top/mid/bottom). These are
// absolutely positioned within the knob button, entirely independent of
// the dial's own layout -- an earlier version put label/value/dial in a
// shared CSS Grid row, which let the dial's track get squeezed down to
// ~1px whenever something else shared its row (a grid track-sizing
// interaction, not anything intentional). Absolute positioning can't
// affect a sibling's size at all, which is exactly the point: the dial
// stays centered and full size no matter where label/value are placed,
// and label/value can still freely overlap each other or the dial (no
// collision handling, same as before) since overlapping absolutely
// positioned elements is just normal stacking.
const nodeGraphMacroKnobPositionValues = Object.freeze(["top", "mid", "bottom"]);

function normalizeNodeGraphMacroKnobLabelPosition(value) {
  return nodeGraphMacroKnobPositionValues.includes(value) ? value : "top";
}

function applyNodeGraphMacroKnobLabelPosition() {
  const position = normalizeNodeGraphMacroKnobLabelPosition(nodeGraphMvp.macroKnobLabelPosition);
  document.body.dataset.macroKnobLabelPosition = position;
}

function setNodeGraphMacroKnobLabelPosition(value) {
  nodeGraphMvp.macroKnobLabelPosition = normalizeNodeGraphMacroKnobLabelPosition(value);
  applyNodeGraphMacroKnobLabelPosition();
}

function normalizeNodeGraphMacroKnobValuePosition(value) {
  return nodeGraphMacroKnobPositionValues.includes(value) ? value : "bottom";
}

function applyNodeGraphMacroKnobValuePosition() {
  const position = normalizeNodeGraphMacroKnobValuePosition(nodeGraphMvp.macroKnobValuePosition);
  document.body.dataset.macroKnobValuePosition = position;
}

function setNodeGraphMacroKnobValuePosition(value) {
  nodeGraphMvp.macroKnobValuePosition = normalizeNodeGraphMacroKnobValuePosition(value);
  applyNodeGraphMacroKnobValuePosition();
}

function ensureNodeGraphMacroControls() {
  if (!Array.isArray(nodeGraphMvp.macroControls) || nodeGraphMvp.macroControls.length !== 8) {
    nodeGraphMvp.macroControls = new Array(8).fill(0);
  }
  nodeGraphMvp.macroControls = nodeGraphMvp.macroControls.map(normalizeNodeGraphMacroValue);
}

function renderNodeGraphMacroControls() {
  ensureNodeGraphMacroControls();
  const face = typeof nodeGraphMacroControlsFaceSettings === "function"
    ? nodeGraphMacroControlsFaceSettings()
    : null;
  document.querySelectorAll("[data-macro-index]").forEach((knob) => {
    const index = Math.max(0, Math.min(7, Math.round(Number(knob.dataset.macroIndex) || 0)));
    const value = normalizeNodeGraphMacroValue(nodeGraphMvp.macroControls[index]);
    const angle = -132 + value * 264;
    knob.style.setProperty("--macro-value", String(value));
    knob.style.setProperty("--macro-angle", `${angle}deg`);
    knob.setAttribute("aria-valuenow", value.toFixed(3));
    const name = face?.labels?.[index] || `M${index + 1}`;
    const nameEl = knob.querySelector(":scope > span");
    if (nameEl) {
      nameEl.textContent = name;
    }
    knob.setAttribute("aria-label", name);
    const readout = knob.querySelector("[data-macro-value]");
    if (readout) {
      readout.textContent = value.toFixed(2);
    }
  });
}

function setNodeGraphMacroControl(index, value) {
  ensureNodeGraphMacroControls();
  const safeIndex = Math.max(0, Math.min(7, Math.round(Number(index) || 0)));
  nodeGraphMvp.macroControls[safeIndex] = normalizeNodeGraphMacroValue(value);
  renderNodeGraphMacroControls();
  if (typeof sendNodeGraphLiveMacroControls === "function") {
    sendNodeGraphLiveMacroControls();
  }
}

// Same modifier vocabulary as regular parameter sliders (see
// slider.numeric's tooltip and node-graph-slider-dragging.js) -- macro
// knobs store a flat 0..1 in nodeGraphMvp.macroControls rather than a
// DOM range-input-backed patch parameter, so the slider drag functions
// themselves don't apply here, but the modifier detection/math is shared
// via nodeGraphNumericDragMultiplier (node-graph-slider-values.js) and
// reproduced 1:1 for the rest.
function nodeGraphMacroKnobValueAtPointer(knob, event) {
  const rect = knob.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  // 0deg = up, clockwise positive -- matches the conic-gradient's own
  // `from -132deg` angle convention (see .node-macro-knob i in styles.css)
  // so this lines up exactly with what's drawn on screen.
  const angleDegrees = Math.atan2(dx, -dy) * (180 / Math.PI);
  const clampedAngle = clampNodeSliderValue(angleDegrees, -132, 132);
  return normalizeNodeGraphMacroValue((clampedAngle + 132) / 264);
}

function beginNodeGraphMacroControlDrag(event) {
  if (event.button > 0 || event.detail > 1) {
    return;
  }
  const knob = event.currentTarget;
  const index = Math.max(0, Math.min(7, Math.round(Number(knob.dataset.macroIndex) || 0)));
  event.preventDefault();
  knob.setPointerCapture?.(event.pointerId);
  const resetToDefaultOnClick = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  const jumpToPointerOnClick = event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey));
  if (jumpToPointerOnClick) {
    setNodeGraphMacroControl(index, nodeGraphMacroKnobValueAtPointer(knob, event));
  }
  nodeGraphMvp.dragging = {
    type: "macro-control",
    knob,
    index,
    moved: false,
    resetToDefaultOnClick,
    startX: event.clientX,
    startY: event.clientY,
    startValue: normalizeNodeGraphMacroValue(nodeGraphMvp.macroControls?.[index]),
    fineScale: nodeGraphNumericDragMultiplier(event),
  };
}

function dragNodeGraphMacroControl(event) {
  const drag = nodeGraphMvp.dragging;
  if (!drag || drag.type !== "macro-control") {
    return;
  }
  event.preventDefault();
  if (
    typeof nodeGraphPointerDragExceededMoveThreshold === "function"
      ? nodeGraphPointerDragExceededMoveThreshold(drag.startX, drag.startY, event.clientX, event.clientY, 1)
      : (Math.abs(event.clientX - drag.startX) > 1 || Math.abs(drag.startY - event.clientY) > 1)
  ) {
    drag.moved = true;
  }
  if (event.altKey && !(event.shiftKey && (event.ctrlKey || event.metaKey))) {
    setNodeGraphMacroControl(drag.index, nodeGraphMacroKnobValueAtPointer(drag.knob, event));
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.startValue = normalizeNodeGraphMacroValue(nodeGraphMvp.macroControls?.[drag.index]);
    return;
  }
  // Fine/coarse scale is read live from the current event on every move (not
  // just at pointer-down), matching dragNodeSlider -- pressing/releasing
  // Shift or Ctrl mid-drag changes sensitivity immediately. Re-anchor on a
  // scale change so the value doesn't jump; only further movement's
  // sensitivity changes.
  const currentFineScale = nodeGraphNumericDragMultiplier(event);
  if (currentFineScale !== drag.fineScale) {
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.startValue = normalizeNodeGraphMacroValue(nodeGraphMvp.macroControls?.[drag.index]);
    drag.fineScale = currentFineScale;
    return;
  }
  const delta = typeof nodeGraphPointerDragTravelDelta === "function"
    ? nodeGraphPointerDragTravelDelta(drag.startX, drag.startY, event.clientX, event.clientY, 240, drag.fineScale)
    : (((event.clientX - drag.startX) + (drag.startY - event.clientY)) / 240) * drag.fineScale;
  setNodeGraphMacroControl(drag.index, drag.startValue + delta);
}

function endNodeGraphMacroControlDrag(event) {
  const drag = nodeGraphMvp.dragging;
  if (drag?.type === "macro-control") {
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    if (drag.resetToDefaultOnClick && !drag.moved) {
      setNodeGraphMacroControl(drag.index, 0);
    }
    nodeGraphMvp.dragging = null;
  }
}

function cancelNodeGraphMacroKnobEdit(knob) {
  const input = knob?.querySelector?.(".node-macro-knob-edit-input");
  const readout = knob?._macroKnobEditReadout;
  if (input && readout) {
    input.replaceWith(readout);
  }
  if (knob) {
    knob.dataset.editing = "false";
    delete knob._macroKnobEditReadout;
  }
}

function beginNodeGraphMacroKnobEdit(event) {
  const knob = event.currentTarget;
  if (knob.dataset.editing === "true") {
    return;
  }
  const index = Math.max(0, Math.min(7, Math.round(Number(knob.dataset.macroIndex) || 0)));
  const readout = knob.querySelector("[data-macro-value]");
  if (!readout) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  knob.dataset.editing = "true";
  knob._macroKnobEditReadout = readout;
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.className = "node-macro-knob-edit-input";
  input.value = normalizeNodeGraphMacroValue(nodeGraphMvp.macroControls?.[index]).toFixed(2);
  readout.replaceWith(input);
  input.addEventListener("pointerdown", (pointerEvent) => pointerEvent.stopPropagation());
  input.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
  input.addEventListener("keydown", (keyEvent) => {
    keyEvent.stopPropagation();
    if (keyEvent.key === "Enter") {
      keyEvent.preventDefault();
      input.blur();
    } else if (keyEvent.key === "Escape") {
      keyEvent.preventDefault();
      cancelNodeGraphMacroKnobEdit(knob);
    }
  });
  input.addEventListener("blur", () => {
    const parsed = Number(input.value);
    cancelNodeGraphMacroKnobEdit(knob);
    if (Number.isFinite(parsed)) {
      setNodeGraphMacroControl(index, parsed);
    }
  });
  input.focus();
  input.select();
}

function bindNodeGraphMacroControlModuleEvents() {
  document.querySelectorAll("[data-macro-index]").forEach((knob) => {
    if (knob.dataset.macroControlBound === "true") {
      return;
    }
    knob.dataset.macroControlBound = "true";
    knob.addEventListener("pointerdown", beginNodeGraphMacroControlDrag);
    knob.addEventListener("pointermove", dragNodeGraphMacroControl);
    knob.addEventListener("pointerup", endNodeGraphMacroControlDrag);
    knob.addEventListener("pointercancel", endNodeGraphMacroControlDrag);
    knob.addEventListener("lostpointercapture", endNodeGraphMacroControlDrag);
    knob.addEventListener("dblclick", beginNodeGraphMacroKnobEdit);
    if (typeof nodeGraphApplyTooltip === "function") {
      nodeGraphApplyTooltip(knob, "slider.knob", {}, { title: false });
    }
  });
  if (document.body.dataset.macroControlWindowBound !== "true") {
    document.body.dataset.macroControlWindowBound = "true";
    window.addEventListener("pointermove", dragNodeGraphMacroControl);
    window.addEventListener("pointerup", endNodeGraphMacroControlDrag);
    window.addEventListener("pointercancel", endNodeGraphMacroControlDrag);
  }
  renderNodeGraphMacroControls();
}

const nodeGraphMidiKeyboardStartMidi = 24;
const nodeGraphMidiKeyboardMinKeyCount = 8;
// 88 covers a full piano keyboard. A single wire value can't safely hold an
// 88-bit mask (see the Held Keys bit-width note below), so key indices are
// split across a "low" half (0-48, 49 bits) and a "high" half (49-87, up to
// 39 bits), each independently within the 53-bit safe-integer ceiling.
const nodeGraphMidiKeyboardMaxKeyCount = 88;
const nodeGraphMidiKeyboardHeldKeysLowBitCount = 49;
const nodeGraphMidiKeyboardBlackPitchClasses = Object.freeze(new Set([1, 3, 6, 8, 10]));
const nodeGraphMidiKeyboardSampleRate = 44100;

// User-configurable key count (shared/global, same mirroring pattern as
// midiKeyboardOctave -- every rendered .node-midi-keyboard-module surface
// shows the same span). Anchor note (nodeGraphMidiKeyboardStartMidi, C0)
// stays fixed; only how many keys are visible from there changes.
function nodeGraphMidiKeyboardKeyCount(value = nodeGraphMvp.midiKeyboardKeyCount) {
  const count = Math.round(Number(value));
  return Number.isFinite(count)
    ? Math.max(nodeGraphMidiKeyboardMinKeyCount, Math.min(nodeGraphMidiKeyboardMaxKeyCount, count))
    : 25;
}

// Walks startMidi..startMidi+keyCount-1, classifying each MIDI note as a
// white or black key. Black key horizontal position is expressed as a
// percentage of the white-key row's width, placed just past the 0.65 mark
// of the white key before it -- matches where a real keyboard's black
// keys sit relative to the white key they're attached to (reverse-derived
// from this module's original hand-placed --key-left percentages, which
// this replaces for an arbitrary key count).
function nodeGraphMidiKeyboardGenerateKeys(startMidi = nodeGraphMidiKeyboardStartMidi, keyCount = nodeGraphMidiKeyboardKeyCount()) {
  const whiteKeys = [];
  const blackKeys = [];
  for (let offset = 0; offset < keyCount; offset += 1) {
    const midi = startMidi + offset;
    const pitchClass = ((midi % 12) + 12) % 12;
    if (nodeGraphMidiKeyboardBlackPitchClasses.has(pitchClass)) {
      blackKeys.push({ midi, index: offset, leftWhiteIndex: whiteKeys.length - 1 });
    } else {
      whiteKeys.push({ midi, index: offset });
    }
  }
  const totalWhite = whiteKeys.length;
  for (const key of blackKeys) {
    key.leftPercent = totalWhite > 0 && key.leftWhiteIndex >= 0
      ? ((key.leftWhiteIndex + 0.65) / totalWhite) * 100
      : 0;
  }
  return { whiteKeys, blackKeys, totalWhite };
}

// Rebuilds every rendered keyboard surface's white/black key DOM from the
// current key count -- called once at bind time (populating the empty
// rows createNodeGraphKeyboardControllerBody leaves behind) and again on
// every key-count change. Full rebuild rather than incremental diffing:
// key count changes are rare (a user clicking +/-), not a per-frame path.
function renderNodeGraphMidiKeyboardKeys() {
  const { whiteKeys, blackKeys, totalWhite } = nodeGraphMidiKeyboardGenerateKeys();
  const octave = nodeGraphMidiKeyboardOctaveOffset();
  const blackWidthPercent = totalWhite > 0 ? (0.63 / totalWhite) * 100 : 4.2;
  document.querySelectorAll(".node-midi-keyboard-module .node-midi-keyboard-surface").forEach((surface) => {
    const whiteRow = surface.querySelector(".node-midi-keyboard-white-row");
    const blackRow = surface.querySelector(".node-midi-keyboard-black-row");
    if (!whiteRow || !blackRow) {
      return;
    }
    whiteRow.style.gridTemplateColumns = `repeat(${totalWhite}, minmax(0, 1fr))`;
    whiteRow.replaceChildren(...whiteKeys.map((key) => {
      const span = document.createElement("span");
      span.dataset.midi = String(key.midi);
      span.dataset.keyIndex = String(key.index);
      span.textContent = nodeGraphMidiKeyboardPitchLabel(nodeGraphMidiKeyboardShiftMidi(key.midi, octave));
      return span;
    }));
    blackRow.replaceChildren(...blackKeys.map((key) => {
      const span = document.createElement("span");
      span.dataset.midi = String(key.midi);
      span.dataset.keyIndex = String(key.index);
      span.style.setProperty("--key-left", `${key.leftPercent}%`);
      span.style.width = `${blackWidthPercent}%`;
      span.textContent = nodeGraphMidiKeyboardPitchLabel(nodeGraphMidiKeyboardShiftMidi(key.midi, octave));
      return span;
    }));
  });
  renderNodeGraphMidiKeyboardSignal(null);
  renderNodeGraphMidiKeyboardHeldKeys();
}

// Ctrl/shift+click "held keys" bitmask -- bit i = "the key currently at
// screen position i is toggled held." Positional, not absolute pitch:
// stable across octave transpose (transpose only shifts output pitch,
// never which screen position a key occupies), only shifts meaning if
// key count itself changes. See docs/plan for the full design
// discussion this came out of.
//
// Bit index can reach 87 (nodeGraphMidiKeyboardMaxKeyCount - 1), but
// JS's native bitwise operators (<<, |, &, >>>) coerce to 32-bit
// integers -- silently wrong past bit 31 (e.g. `1 << 40` does not
// compute 2^40, it wraps to `1 << 8` per the spec's shift-amount-mod-32
// rule). A double can exactly represent integers up to 2^53 via ordinary
// arithmetic, just not via the truncating bitwise ops, so bit set/clear/
// test here use arithmetic instead -- but that 53-bit ceiling is still a
// real limit: a single JS Number cannot combine a low bit (e.g. index 0)
// and a high bit (e.g. index 87) in the SAME value without silently
// losing the low bit (float64 precision near 2^87 is +/-2^35, way
// bigger than 1). So the 88-key range is stored as two independent
// numbers -- low (bits 0-48) and high (bits 0-38, representing absolute
// key index 49-87) -- never combined into one.
function nodeGraphMidiKeyboardBitmaskHasBit(mask, index) {
  return Math.floor((Number(mask) || 0) / 2 ** index) % 2 === 1;
}

function nodeGraphMidiKeyboardBitmaskSetBit(mask, index, on) {
  const safeMask = Number(mask) || 0;
  const has = nodeGraphMidiKeyboardBitmaskHasBit(safeMask, index);
  if (has === Boolean(on)) {
    return safeMask;
  }
  return on ? safeMask + 2 ** index : safeMask - 2 ** index;
}

// Routes an absolute key index (0..nodeGraphMidiKeyboardMaxKeyCount-1) to
// which of the two storage numbers it lives in, and its bit position
// within that number.
function nodeGraphMidiKeyboardHeldKeyBitLocation(index) {
  return index < nodeGraphMidiKeyboardHeldKeysLowBitCount
    ? { half: "low", localIndex: index }
    : { half: "high", localIndex: index - nodeGraphMidiKeyboardHeldKeysLowBitCount };
}

function nodeGraphMidiKeyboardHeldKeyBitIsSet(index, low = nodeGraphMvp.midiKeyboardHeldKeysLowBitmask, high = nodeGraphMvp.midiKeyboardHeldKeysHighBitmask) {
  const location = nodeGraphMidiKeyboardHeldKeyBitLocation(index);
  return nodeGraphMidiKeyboardBitmaskHasBit(location.half === "low" ? low : high, location.localIndex);
}

// Pure -- returns the updated {low, high} pair rather than mutating
// nodeGraphMvp directly, so it composes with the rotate/transpose helpers
// below (which build up a whole new pair bit-by-bit).
function nodeGraphMidiKeyboardHeldKeysWithBit(low, high, index, on) {
  const location = nodeGraphMidiKeyboardHeldKeyBitLocation(index);
  return location.half === "low"
    ? { low: nodeGraphMidiKeyboardBitmaskSetBit(low, location.localIndex, on), high }
    : { low, high: nodeGraphMidiKeyboardBitmaskSetBit(high, location.localIndex, on) };
}

// Placeholder for ctrl+shift+click -- rotates the whole mask by one bit
// position (wrap-around) within the current key count. Deliberately
// simple/exploratory per explicit direction, not a finished feature;
// revisit later.
function nodeGraphMidiKeyboardBitmaskRotate(low, high, keyCount) {
  if (keyCount <= 1) {
    return { low, high };
  }
  const topBit = nodeGraphMidiKeyboardHeldKeyBitIsSet(keyCount - 1, low, high);
  let rotated = { low: 0, high: 0 };
  for (let index = keyCount - 1; index > 0; index -= 1) {
    rotated = nodeGraphMidiKeyboardHeldKeysWithBit(
      rotated.low,
      rotated.high,
      index,
      nodeGraphMidiKeyboardHeldKeyBitIsSet(index - 1, low, high),
    );
  }
  return nodeGraphMidiKeyboardHeldKeysWithBit(rotated.low, rotated.high, 0, topBit);
}

// Placeholder for shift+alt+click -- distinct from ctrl+shift+click's
// generic rotate-by-one. Shifts every currently-held bit by a fixed
// musically-meaningful interval (7 positions, a perfect fifth if keys
// are semitone-spaced) instead of rotating the whole mask uniformly,
// so it reshapes a held chord rather than just spinning it. Bits that
// land past the current key count wrap back around. Deliberately
// simple/exploratory, same spirit as the rotate placeholder above.
function nodeGraphMidiKeyboardBitmaskTranspose(low, high, keyCount, interval) {
  if (keyCount <= 1) {
    return { low, high };
  }
  let transposed = { low: 0, high: 0 };
  for (let index = 0; index < keyCount; index += 1) {
    if (nodeGraphMidiKeyboardHeldKeyBitIsSet(index, low, high)) {
      const target = ((index + interval) % keyCount + keyCount) % keyCount;
      transposed = nodeGraphMidiKeyboardHeldKeysWithBit(transposed.low, transposed.high, target, true);
    }
  }
  return transposed;
}

function nodeGraphMidiKeyboardToggleHeldKeyBit(index) {
  const { low, high } = nodeGraphMidiKeyboardHeldKeysWithBit(
    nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
    nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
    index,
    !nodeGraphMidiKeyboardHeldKeyBitIsSet(index),
  );
  nodeGraphMvp.midiKeyboardHeldKeysLowBitmask = low;
  nodeGraphMvp.midiKeyboardHeldKeysHighBitmask = high;
  renderNodeGraphMidiKeyboardHeldKeys();
  saveNodeGraphMidiKeyboardMemory();
  if (typeof sendNodeGraphLiveMidiKeyboardHeldKeysBitmask === "function") {
    sendNodeGraphLiveMidiKeyboardHeldKeysBitmask();
  }
}

function renderNodeGraphMidiKeyboardHeldKeys() {
  document.querySelectorAll(".node-midi-keyboard-module [data-key-index]").forEach((key) => {
    const index = Number(key.dataset.keyIndex);
    key.classList.toggle("held", nodeGraphMidiKeyboardHeldKeyBitIsSet(index));
  });
  renderNodeGraphMidiKeyboardBitmaskDisplay();
}

// One square per key, across the full key range (not a fixed 53 -- the
// old single-number storage capped the display at its own safe-integer
// ceiling, but that ceiling doesn't apply the same way to the low/high
// pair, so the display now just tracks the real key range).
function nodeGraphMidiKeyboardBitmaskDisplayBitCount() {
  return nodeGraphMidiKeyboardMaxKeyCount;
}

// Phase-bit multiplexing for the "Held Keys" wire: a single wire is one
// JS Number, safe up to 2^53-1, but the full held-keys state can span 88
// bits. Rather than a second wire, the SAME wire carries the low half
// (bits 0-48) every sample by default -- true 0-sample-delay as long as
// nothing above key 48 is held -- and only starts alternating between
// the low and high half, one per sample, once the high half is actually
// in use. Bit 49 (nodeGraphMidiKeyboardHeldKeysLowBitCount) of the
// TRANSMITTED value is a self-describing phase flag: any receiver can
// decode a single sample in isolation (no shared state / sample-count
// assumptions needed) as "value < 2^49 -> this is the low half" or
// "value >= 2^49 -> subtract 2^49, this is the high half", then latch
// each half into its own register and combine them for the real 88-bit
// state. Worst-case update latency for any one bit is 1 sample, and only
// while the high half is actively in use.
const nodeGraphMidiKeyboardHeldKeysPhaseValue = 2 ** nodeGraphMidiKeyboardHeldKeysLowBitCount;

function nodeGraphMidiKeyboardHeldKeysTransmitValue(low, high, phase) {
  const safeHigh = Number(high) || 0;
  if (!safeHigh) {
    return Number(low) || 0;
  }
  return phase
    ? nodeGraphMidiKeyboardHeldKeysPhaseValue + safeHigh
    : Number(low) || 0;
}

// Leading square is the phase flag itself, not a key -- 🔴 when the high
// half has any bits set (the wire will alternate low/high, one per
// sample) or 🟢 when it's empty (the wire always carries the low half,
// true 0-sample-delay). This can't track the actual audio-thread's
// per-sample phase toggle (that's 44.1kHz, nothing to usefully show a
// human at that rate, and it lives inside the worklet/offline evaluator,
// not the main thread) -- it shows the thing that DECIDES whether
// alternation happens at all, which is what's actually meaningful to see
// at a glance. Then one square per key, across the full key range.
function nodeGraphMidiKeyboardBitmaskEmoji(low, high) {
  let out = (Number(high) || 0) !== 0 ? "🔴" : "🟢";
  for (let index = 0; index < nodeGraphMidiKeyboardBitmaskDisplayBitCount(); index += 1) {
    out += nodeGraphMidiKeyboardHeldKeyBitIsSet(index, low, high) ? "⬛" : "⬜";
  }
  return out;
}

function renderNodeGraphMidiKeyboardBitmaskDisplay() {
  const text = nodeGraphMidiKeyboardBitmaskEmoji(
    nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
    nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
  );
  document.querySelectorAll("[data-midi-keyboard-bitmask-value]").forEach((el) => {
    el.textContent = text;
  });
}

function renderNodeGraphMidiKeyboardKeyCountControl() {
  const value = nodeGraphMidiKeyboardKeyCount();
  document.querySelectorAll("[data-midi-keyboard-key-count-value]").forEach((el) => {
    el.textContent = String(value);
  });
  document.querySelectorAll("[data-midi-keyboard-key-count-down]").forEach((button) => {
    button.disabled = value <= nodeGraphMidiKeyboardMinKeyCount;
  });
  document.querySelectorAll("[data-midi-keyboard-key-count-up]").forEach((button) => {
    button.disabled = value >= nodeGraphMidiKeyboardMaxKeyCount;
  });
}

function changeNodeGraphMidiKeyboardKeyCount(delta) {
  nodeGraphMvp.midiKeyboardKeyCount = nodeGraphMidiKeyboardKeyCount(nodeGraphMidiKeyboardKeyCount() + delta);
  renderNodeGraphMidiKeyboardKeyCountControl();
  renderNodeGraphMidiKeyboardKeys();
  saveNodeGraphMidiKeyboardMemory();
}
const nodeGraphMidiKeyboardMinOctave = -4;
const nodeGraphMidiKeyboardMaxOctave = 4;
const nodeGraphMidiKeyboardNoteNames = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const nodeGraphMidiKeyboardMemoryStorageKey = "soemdsp-sandbox-midi-keyboard-memory-v1";

function nodeGraphMidiKeyboardClamp01(value) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function nodeGraphMidiKeyboardTenthVoltPerOctave(midi) {
  return nodeGraphMidiKeyboardClamp01((Number(midi) || 0) / 120);
}

function normalizeNodeGraphMidiKeyboardMemorySignal(signal, options = {}) {
  if (!signal || typeof signal !== "object") {
    return null;
  }
  const midi = Math.max(0, Math.min(127, Math.round(Number(signal.midi) || 60)));
  const rawMidi = Math.max(0, Math.min(127, Math.round(Number(signal.rawMidi) || midi)));
  const octave = nodeGraphMidiKeyboardOctaveOffset(signal.octave);
  const keyIndex = Math.max(0, Math.min(nodeGraphMidiKeyboardKeyCount() - 1, Number(signal.keyIndex) || 0));
  const keyQuantized = nodeGraphMidiKeyboardClamp01(signal.keyQuantized ?? (keyIndex / Math.max(1, nodeGraphMidiKeyboardKeyCount() - 1)));
  const frequency = Math.max(0, Number(signal.frequency) || 440 * 2 ** ((midi - 69) / 12));
  const gate = options.preserveGate ? (Number(signal.gate) > 0 ? 1 : 0) : 0;
  return {
    source: signal.source || "remembered",
    gate,
    gatePulse: options.preserveGatePulse ? (Number(signal.gatePulse) > 0 ? 1 : 0) : 0,
    x: nodeGraphMidiKeyboardClamp01(signal.x ?? keyQuantized),
    y: nodeGraphMidiKeyboardClamp01(signal.y ?? 0),
    keyIndex,
    keyQuantized,
    rawMidi,
    octave,
    midi,
    pitch: signal.pitch || nodeGraphMidiKeyboardPitchLabel(midi),
    pitchValue: Math.max(0, Math.min(127, Number(signal.pitchValue) || midi)),
    midiNormalized: nodeGraphMidiKeyboardClamp01(signal.midiNormalized ?? (midi / 127)),
    tenthVoltPerOctave: nodeGraphMidiKeyboardClamp01(signal.tenthVoltPerOctave ?? (midi / 120)),
    increment: Math.max(0, Number(signal.increment) || frequency / nodeGraphMidiKeyboardSampleRate),
    frequency,
  };
}

function nodeGraphMidiKeyboardHeldKeysBitmaskValue(value) {
  const mask = Math.floor(Number(value));
  return Number.isFinite(mask) && mask >= 0 ? mask : 0;
}

function nodeGraphMidiKeyboardMemoryPayload() {
  return {
    heldKeysLowBitmask: nodeGraphMidiKeyboardHeldKeysBitmaskValue(nodeGraphMvp.midiKeyboardHeldKeysLowBitmask),
    heldKeysHighBitmask: nodeGraphMidiKeyboardHeldKeysBitmaskValue(nodeGraphMvp.midiKeyboardHeldKeysHighBitmask),
    inputId: nodeGraphMvp.midiKeyboardInputId || "",
    keyCount: nodeGraphMidiKeyboardKeyCount(),
    mode: nodeGraphMidiKeyboardMode(),
    modWheel: nodeGraphPerformanceModWheelValue(),
    octave: nodeGraphMidiKeyboardOctaveOffset(),
    pitchWheel: nodeGraphPerformancePitchWheelValue(),
    signal: normalizeNodeGraphMidiKeyboardMemorySignal(nodeGraphMvp.midiKeyboardSignal),
  };
}

function saveNodeGraphMidiKeyboardMemory() {
  try {
    window.localStorage.setItem(
      nodeGraphMidiKeyboardMemoryStorageKey,
      JSON.stringify(nodeGraphMidiKeyboardMemoryPayload()),
    );
    return true;
  } catch {
    return false;
  }
}

function loadNodeGraphMidiKeyboardMemory() {
  try {
    const text = window.localStorage.getItem(nodeGraphMidiKeyboardMemoryStorageKey);
    if (!text) {
      return null;
    }
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return {
      heldKeysLowBitmask: nodeGraphMidiKeyboardHeldKeysBitmaskValue(payload.heldKeysLowBitmask),
      heldKeysHighBitmask: nodeGraphMidiKeyboardHeldKeysBitmaskValue(payload.heldKeysHighBitmask),
      inputId: String(payload.inputId || ""),
      keyCount: nodeGraphMidiKeyboardKeyCount(payload.keyCount),
      mode: nodeGraphMidiKeyboardMode(payload.mode),
      modWheel: nodeGraphPerformanceModWheelValue(payload.modWheel),
      octave: nodeGraphMidiKeyboardOctaveOffset(payload.octave),
      pitchWheel: nodeGraphPerformancePitchWheelValue(payload.pitchWheel),
      signal: normalizeNodeGraphMidiKeyboardMemorySignal(payload.signal),
    };
  } catch {
    return null;
  }
}

function applyNodeGraphMidiKeyboardMemory() {
  nodeGraphMvp.midiKeyboardMemoryLoaded = true;
  const memory = loadNodeGraphMidiKeyboardMemory();
  if (!memory) {
    return false;
  }
  nodeGraphMvp.midiKeyboardHeldKeysLowBitmask = memory.heldKeysLowBitmask;
  nodeGraphMvp.midiKeyboardHeldKeysHighBitmask = memory.heldKeysHighBitmask;
  nodeGraphMvp.midiKeyboardInputId = memory.inputId;
  nodeGraphMvp.midiKeyboardKeyCount = memory.keyCount;
  nodeGraphMvp.midiKeyboardMode = memory.mode;
  nodeGraphMvp.modWheelSignal = memory.modWheel;
  nodeGraphMvp.midiKeyboardOctave = memory.octave;
  nodeGraphMvp.pitchWheelSignal = memory.pitchWheel;
  nodeGraphMvp.midiKeyboardSignal = memory.signal;
  nodeGraphMvp.midiKeyboardPreviousGate = 0;
  return true;
}

function ensureNodeGraphMidiKeyboardMemoryLoaded() {
  if (nodeGraphMvp.midiKeyboardMemoryLoaded) {
    return;
  }
  applyNodeGraphMidiKeyboardMemory();
}

function nodeGraphPerformancePitchWheelValue(value = nodeGraphMvp.pitchWheelSignal) {
  return clampNodeSliderValue(Number(value) || 0, -1, 1);
}

function nodeGraphPerformanceModWheelValue(value = nodeGraphMvp.modWheelSignal) {
  return clampNodeSliderValue(Number(value) || 0, 0, 1);
}

function renderNodeGraphPerformanceWheels() {
  const pitchWheel = nodeGraphPerformancePitchWheelValue();
  const modWheel = nodeGraphPerformanceModWheelValue();
  nodeGraphMvp.pitchWheelSignal = pitchWheel;
  nodeGraphMvp.modWheelSignal = modWheel;
  const controls = [
    {
      kind: "pitchWheel",
      position: (pitchWheel + 1) * 0.5,
      value: pitchWheel,
      valueKey: "pitchWheel",
    },
    {
      kind: "modWheel",
      position: modWheel,
      value: modWheel,
      valueKey: "modWheel",
    },
  ];
  for (const control of controls) {
    document.querySelectorAll(`[data-performance-wheel="${control.kind}"]`).forEach((element) => {
      element.style.setProperty("--wheel-value", String(control.position));
      element.setAttribute("aria-valuenow", control.value.toFixed(3));
    });
    document.querySelectorAll(`[data-performance-wheel-value="${control.valueKey}"]`).forEach((valueElement) => {
      valueElement.textContent = control.value.toFixed(3);
    });
  }
}

function setNodeGraphPerformanceWheel(kind, value, status = "") {
  if (kind === "pitchWheel") {
    nodeGraphMvp.pitchWheelSignal = nodeGraphPerformancePitchWheelValue(value);
  } else if (kind === "modWheel") {
    nodeGraphMvp.modWheelSignal = nodeGraphPerformanceModWheelValue(value);
  }
  if (status) {
    nodeGraphMvp.midiKeyboardStatus = status;
  }
  saveNodeGraphMidiKeyboardMemory();
  renderNodeGraphPerformanceWheels();
  renderNodeGraphMidiKeyboardInputControls();
  if (typeof sendNodeGraphLivePitchModWheelSignal === "function") {
    sendNodeGraphLivePitchModWheelSignal();
  }
}

function setNodeGraphPerformanceWheelFromPointer(element, event) {
  const rect = element.getBoundingClientRect();
  const y = nodeGraphMidiKeyboardClamp01((event.clientY - rect.top) / Math.max(1, rect.height));
  const kind = element.dataset.performanceWheel;
  const value = kind === "pitchWheel" ? 1 - y * 2 : 1 - y;
  setNodeGraphPerformanceWheel(kind, value, kind === "pitchWheel"
    ? `pitch wheel ${nodeGraphPerformancePitchWheelValue(value).toFixed(3)}`
    : `mod wheel ${nodeGraphPerformanceModWheelValue(value).toFixed(3)}`);
}

function beginNodeGraphPerformanceWheelDrag(event) {
  const element = event.currentTarget;
  event.preventDefault();
  element.setPointerCapture?.(event.pointerId);
  setNodeGraphPerformanceWheelFromPointer(element, event);
}

function dragNodeGraphPerformanceWheel(event) {
  if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    return;
  }
  event.preventDefault();
  setNodeGraphPerformanceWheelFromPointer(event.currentTarget, event);
}

function endNodeGraphPerformanceWheelDrag(event) {
  const element = event.currentTarget;
  if (element.hasPointerCapture?.(event.pointerId)) {
    element.releasePointerCapture?.(event.pointerId);
  }
  if (element.dataset.performanceWheel === "pitchWheel") {
    setNodeGraphPerformanceWheel("pitchWheel", 0, "pitch wheel centered");
  }
}

// Octave numbering follows the Roland convention: MIDI 0 = C-2, so middle C
// (MIDI 60) is C3 and the keyboard's anchor key (MIDI 24) is C0. This is the
// single source of every note name in the app -- the keyboard key caps, the
// signal readout, the MIDI status line and the key-map grid all call it -- so
// changing the -2 here shifts the whole scheme consistently.
function nodeGraphMidiKeyboardPitchLabel(midi) {
  const rounded = Math.round(Number(midi) || 0);
  const note = nodeGraphMidiKeyboardNoteNames[((rounded % 12) + 12) % 12];
  return `${note}${Math.floor(rounded / 12) - 2}`;
}

function nodeGraphMidiKeyboardOctaveOffset(value = nodeGraphMvp.midiKeyboardOctave) {
  return Math.max(
    nodeGraphMidiKeyboardMinOctave,
    Math.min(nodeGraphMidiKeyboardMaxOctave, Math.round(Number(value) || 0)),
  );
}

function nodeGraphMidiKeyboardShiftMidi(rawMidi, octave = nodeGraphMidiKeyboardOctaveOffset()) {
  return Math.max(0, Math.min(127, Math.round(Number(rawMidi) || 0) + octave * 12));
}

function nodeGraphMidiKeyboardOctaveLabel(value = nodeGraphMidiKeyboardOctaveOffset()) {
  const octave = nodeGraphMidiKeyboardOctaveOffset(value);
  return `${octave >= 0 ? "+" : ""}${octave}`;
}

const nodeGraphMidiKeyboardModes = Object.freeze(["press", "hold", "toggle"]);

function nodeGraphMidiKeyboardMode(value = nodeGraphMvp.midiKeyboardMode) {
  return nodeGraphMidiKeyboardModes.includes(value) ? value : "press";
}

function nodeGraphMidiKeyboardModeLabel(value = nodeGraphMidiKeyboardMode()) {
  return {
    press: "Press",
    hold: "Hold",
    toggle: "Toggle",
  }[nodeGraphMidiKeyboardMode(value)] || "Press";
}

function nodeGraphMidiKeyboardRawMidiFromSignal(signal) {
  if (Number.isFinite(Number(signal?.rawMidi))) {
    return Math.round(Number(signal.rawMidi));
  }
  const signalOctave = nodeGraphMidiKeyboardOctaveOffset(signal?.octave);
  return Math.round(Number(signal?.midi) || 60) - signalOctave * 12;
}

function renderNodeGraphMidiKeyboardKeyLabels() {
  const octave = nodeGraphMidiKeyboardOctaveOffset();
  document.querySelectorAll(".node-midi-keyboard-module [data-midi]").forEach((key) => {
    const rawMidi = Math.round(Number(key.dataset.midi) || 0);
    key.textContent = nodeGraphMidiKeyboardPitchLabel(nodeGraphMidiKeyboardShiftMidi(rawMidi, octave));
    key.setAttribute("aria-label", `${key.textContent} / MIDI ${nodeGraphMidiKeyboardShiftMidi(rawMidi, octave)}`);
  });
}

function nodeGraphMidiKeyboardSignalFromRaw(rawMidi, options = {}) {
  const octave = nodeGraphMidiKeyboardOctaveOffset();
  const midi = nodeGraphMidiKeyboardShiftMidi(rawMidi, octave);
  const rawKeyIndex = Math.max(
    0,
    Math.min(nodeGraphMidiKeyboardKeyCount() - 1, Math.round(Number(rawMidi) || 0) - nodeGraphMidiKeyboardStartMidi),
  );
  const keyQuantized = nodeGraphMidiKeyboardKeyCount() > 1 ? rawKeyIndex / (nodeGraphMidiKeyboardKeyCount() - 1) : 0;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  return {
    source: options.source || "keyboard",
    gate: options.gate ? 1 : 0,
    gatePulse: options.gatePulse ? 1 : 0,
    x: nodeGraphMidiKeyboardClamp01(options.x ?? keyQuantized),
    y: nodeGraphMidiKeyboardClamp01(options.y ?? 0),
    keyIndex: rawKeyIndex,
    keyQuantized,
    rawMidi: Math.round(Number(rawMidi) || 0),
    octave,
    midi,
    pitchValue: midi,
    midiNormalized: midi / 127,
    tenthVoltPerOctave: nodeGraphMidiKeyboardTenthVoltPerOctave(midi),
    increment: frequency / nodeGraphMidiKeyboardSampleRate,
    frequency,
    pitch: nodeGraphMidiKeyboardPitchLabel(midi),
  };
}

function nodeGraphMidiKeyboardFallbackSignal() {
  return nodeGraphMidiKeyboardSignalFromRaw(60, {
    source: "fallback",
    gate: 0,
    gatePulse: 0,
    x: 0.5,
    y: 0,
  });
}

function nodeGraphMidiKeyboardSignalFromPointer(event, surface) {
  const rect = surface.getBoundingClientRect();
  const x = nodeGraphMidiKeyboardClamp01((event.clientX - rect.left) / Math.max(1, rect.width));
  const y = nodeGraphMidiKeyboardClamp01(1 - (event.clientY - rect.top) / Math.max(1, rect.height));
  const target = event.target?.closest?.("[data-midi]");
  const targetMidi = target && surface.contains(target) ? Number(target.dataset.midi) : NaN;
  const fallbackKeyIndex = Math.min(
    nodeGraphMidiKeyboardKeyCount() - 1,
    Math.max(0, Math.floor(x * nodeGraphMidiKeyboardKeyCount())),
  );
  const rawMidi = Number.isFinite(targetMidi) ? targetMidi : nodeGraphMidiKeyboardStartMidi + fallbackKeyIndex;
  const gate = event.buttons > 0 ? 1 : 0;
  return nodeGraphMidiKeyboardSignalFromRaw(rawMidi, {
    source: "pointer",
    gate,
    x,
    y,
  });
}

function nodeGraphMidiKeyboardSignalFromMidi(midiValue, velocityValue = 0, gateValue = 0, pulseValue = 0) {
  const rawMidi = Math.max(0, Math.min(127, Math.round(Number(midiValue) || 0)));
  const velocity = Math.max(0, Math.min(127, Math.round(Number(velocityValue) || 0)));
  return nodeGraphMidiKeyboardSignalFromRaw(rawMidi, {
    source: "midi",
    gate: gateValue ? 1 : 0,
    gatePulse: pulseValue ? 1 : 0,
    y: velocity / 127,
  });
}

function sendNodeGraphMidiKeyboardSignalToLive(signal) {
  if (typeof sendNodeGraphLiveMidiKeyboardSignal === "function") {
    sendNodeGraphLiveMidiKeyboardSignal(signal || nodeGraphMidiKeyboardFallbackSignal());
  }
}

function nodeGraphMidiKeyboardHeldPointerSignal() {
  const held = nodeGraphMvp.midiKeyboardPointerHeldSignal;
  return held && typeof held === "object" ? { ...held, gate: 1, source: "pointerHold" } : null;
}

function clearNodeGraphMidiKeyboardPointerHold(status = "") {
  nodeGraphMvp.midiKeyboardPointerHeldSignal = null;
  if (status) {
    nodeGraphMvp.midiKeyboardStatus = status;
  }
  renderNodeGraphMidiKeyboardSignal(null);
}

function nodeGraphMidiKeyboardFixedText(text, width) {
  return String(text ?? "").padStart(Math.max(0, Number(width) || 0), " ");
}

function nodeGraphMidiKeyboardFixedInteger(value, width, fallback = "-") {
  const number = Number(value);
  const text = Number.isFinite(number) ? String(Math.round(number)) : fallback;
  return nodeGraphMidiKeyboardFixedText(text, width);
}

function nodeGraphMidiKeyboardFixedDecimal(value, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return nodeGraphMidiKeyboardFixedText(options.fallback ?? "-", options.width ?? 1);
  }
  const text = typeof limit_decimals === "function"
    ? limit_decimals(
      String(number),
      options.maxDigits ?? 4,
      options.decimalPlaces ?? 3,
      options.decimalPlaces ?? 3,
      false,
    )
    : number.toFixed(options.decimalPlaces ?? 3);
  return nodeGraphMidiKeyboardFixedText(text, options.width ?? text.length);
}

function toggleNodeGraphMidiKeyboardPointerHold(event, surface) {
  const signal = nodeGraphMidiKeyboardSignalFromPointer(event, surface);
  const held = nodeGraphMidiKeyboardHeldPointerSignal();
  event.preventDefault();
  if (held && held.midi === signal.midi) {
    clearNodeGraphMidiKeyboardPointerHold(`${signal.pitch} hold off`);
    return;
  }
  nodeGraphMvp.midiKeyboardPointerHeldSignal = {
    ...signal,
    gate: 1,
    gatePulse: 1,
    source: "pointerHold",
  };
  nodeGraphMvp.midiKeyboardStatus = `${signal.pitch} held`;
  renderNodeGraphMidiKeyboardSignal(nodeGraphMvp.midiKeyboardPointerHeldSignal);
}

function clearNodeGraphMidiKeyboardPulseDisplay(serial) {
  window.setTimeout(() => {
    if (nodeGraphMvp.midiKeyboardPulseSerial !== serial || !nodeGraphMvp.midiKeyboardSignal) {
      return;
    }
    nodeGraphMvp.midiKeyboardSignal.gatePulse = 0;
    const field = document.querySelector('.node-midi-keyboard-module [data-keyboard-signal="gatePulse"]');
    if (field) {
      field.textContent = nodeGraphMidiKeyboardFixedInteger(0, 1, "0");
    }
    sendNodeGraphMidiKeyboardSignalToLive(nodeGraphMvp.midiKeyboardSignal);
  }, 60);
}

function renderNodeGraphMidiKeyboardSignal(signal = null) {
  const previousGate = Number(nodeGraphMvp.midiKeyboardPreviousGate) > 0 ? 1 : 0;
  const rememberedSignal = normalizeNodeGraphMidiKeyboardMemorySignal(nodeGraphMvp.midiKeyboardSignal);
  const nextSignal = signal
    ? normalizeNodeGraphMidiKeyboardMemorySignal(signal, { preserveGate: true, preserveGatePulse: true })
    : rememberedSignal;
  if (nextSignal) {
    const gate = Number(nextSignal.gate) > 0 ? 1 : 0;
    nextSignal.gate = gate;
    nextSignal.gatePulse = Number(nextSignal.gatePulse) > 0 || (gate > 0 && previousGate <= 0) ? 1 : 0;
    nodeGraphMvp.midiKeyboardPreviousGate = gate;
    if (nextSignal.gatePulse > 0) {
      nodeGraphMvp.midiKeyboardPulseSerial = (Number(nodeGraphMvp.midiKeyboardPulseSerial) || 0) + 1;
    }
  } else {
    nodeGraphMvp.midiKeyboardPreviousGate = 0;
  }
  nodeGraphMvp.midiKeyboardSignal = nextSignal ? { ...nextSignal } : null;
  saveNodeGraphMidiKeyboardMemory();
  const values = {
    gate: nodeGraphMidiKeyboardFixedInteger(nextSignal?.gate ?? 0, 1, "0"),
    gatePulse: nodeGraphMidiKeyboardFixedInteger(nextSignal?.gatePulse ?? 0, 1, "0"),
    key: nextSignal ? nodeGraphMidiKeyboardFixedInteger(nextSignal.keyIndex, 2) : nodeGraphMidiKeyboardFixedText("-", 2),
    quantized: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.keyQuantized, { decimalPlaces: 3, maxDigits: 4, width: 5 })
      : nodeGraphMidiKeyboardFixedText("-", 5),
    midi: nextSignal ? nodeGraphMidiKeyboardFixedInteger(nextSignal.midi, 3) : nodeGraphMidiKeyboardFixedText("-", 3),
    octave: nodeGraphMidiKeyboardOctaveLabel(),
    double: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.midiNormalized, { decimalPlaces: 6, maxDigits: 7, width: 8 })
      : nodeGraphMidiKeyboardFixedText("-", 8),
    tenthVoltPerOctave: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.tenthVoltPerOctave, { decimalPlaces: 6, maxDigits: 7, width: 8 })
      : nodeGraphMidiKeyboardFixedText("-", 8),
    increment: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.increment, { decimalPlaces: 7, maxDigits: 8, width: 9 })
      : nodeGraphMidiKeyboardFixedText("-", 9),
    frequency: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.frequency, { decimalPlaces: 2, maxDigits: 7, width: 8 })
      : nodeGraphMidiKeyboardFixedText("-", 8),
    pitch: nextSignal ? nodeGraphMidiKeyboardFixedText(nextSignal.pitch, 3) : nodeGraphMidiKeyboardFixedText("-", 3),
    x: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.x, { decimalPlaces: 3, maxDigits: 4, width: 5 })
      : nodeGraphMidiKeyboardFixedDecimal(0, { decimalPlaces: 3, maxDigits: 4, width: 5 }),
    y: nextSignal
      ? nodeGraphMidiKeyboardFixedDecimal(nextSignal.y, { decimalPlaces: 3, maxDigits: 4, width: 5 })
      : nodeGraphMidiKeyboardFixedDecimal(0, { decimalPlaces: 3, maxDigits: 4, width: 5 }),
  };
  document.querySelectorAll(".node-midi-keyboard-module [data-keyboard-signal]").forEach((field) => {
    const key = field.dataset.keyboardSignal;
    field.textContent = values[key] ?? "-";
  });
  document.querySelectorAll(".node-midi-keyboard-module [data-midi]").forEach((key) => {
    const activeMidi = nextSignal ? nodeGraphMidiKeyboardRawMidiFromSignal(nextSignal) : NaN;
    const active = Boolean(
      nextSignal &&
      Number(key.dataset.midi) === activeMidi &&
      nextSignal.gate > 0,
    );
    key.classList.toggle("active", active);
  });
  sendNodeGraphMidiKeyboardSignalToLive(nodeGraphMvp.midiKeyboardSignal);
  if (nextSignal?.gatePulse > 0) {
    clearNodeGraphMidiKeyboardPulseDisplay(nodeGraphMvp.midiKeyboardPulseSerial);
  }
}

function renderNodeGraphMidiKeyboardOctaveControl() {
  nodeGraphMvp.midiKeyboardOctave = nodeGraphMidiKeyboardOctaveOffset();
  renderNodeGraphMidiKeyboardKeyLabels();
  document.querySelectorAll("[data-midi-keyboard-octave-value]").forEach((value) => {
    value.textContent = nodeGraphMidiKeyboardOctaveLabel(nodeGraphMvp.midiKeyboardOctave);
  });
  document.querySelectorAll("[data-midi-keyboard-octave-down]").forEach((down) => {
    down.disabled = nodeGraphMvp.midiKeyboardOctave <= nodeGraphMidiKeyboardMinOctave;
  });
  document.querySelectorAll("[data-midi-keyboard-octave-up]").forEach((up) => {
    up.disabled = nodeGraphMvp.midiKeyboardOctave >= nodeGraphMidiKeyboardMaxOctave;
  });
}

function renderNodeGraphMidiKeyboardModeControl() {
  nodeGraphMvp.midiKeyboardMode = nodeGraphMidiKeyboardMode();
  document.querySelectorAll("[data-midi-keyboard-mode-select]").forEach((select) => {
    select.value = nodeGraphMvp.midiKeyboardMode;
  });
}

function handleNodeGraphMidiKeyboardModeChange(event) {
  const mode = nodeGraphMidiKeyboardMode(event.currentTarget.value);
  nodeGraphMvp.midiKeyboardMode = mode;
  nodeGraphMvp.midiKeyboardStatus = `${nodeGraphMidiKeyboardModeLabel(mode)} mode`;
  if (mode !== "hold") {
    nodeGraphMvp.midiKeyboardPointerHeldSignal = null;
  }
  renderNodeGraphMidiKeyboardModeControl();
  renderNodeGraphMidiKeyboardSignal(mode === "hold" ? nodeGraphMidiKeyboardHeldPointerSignal() : null);
  saveNodeGraphMidiKeyboardMemory();
  renderNodeGraphMidiKeyboardInputControls();
}

function retuneNodeGraphMidiKeyboardSignal(signal) {
  if (!signal) {
    return null;
  }
  return {
    ...nodeGraphMidiKeyboardSignalFromRaw(nodeGraphMidiKeyboardRawMidiFromSignal(signal), {
      source: signal.source || "keyboard",
      gate: Number(signal.gate) > 0 ? 1 : 0,
      gatePulse: Number(signal.gatePulse) > 0 ? 1 : 0,
      x: signal.x,
      y: signal.y,
    }),
  };
}

// Click-drag scrubbing for the keyboard's stepper readouts (octave transpose
// and key count). The -/+ buttons still work; this just makes the number
// between them draggable like a slider, which is far quicker than clicking +
// twenty times to get from 25 keys to 61.
//
// Horizontal drag is the primary axis, with upward drag also counting as
// "increase" so either gesture feels right. Steps are emitted one at a time
// from an accumulator, so the value tracks the pointer exactly instead of
// jumping, and every step goes through the same change*() function the
// buttons use -- no duplicated clamping, persistence, or re-render logic.
const nodeGraphMidiKeyboardScrubPixelsPerStep = 8;

function bindNodeGraphMidiKeyboardScrubControl(element, applyDelta) {
  if (!element || element.dataset.midiKeyboardScrubBound === "true") {
    return;
  }
  element.dataset.midiKeyboardScrubBound = "true";
  element.classList.add("scrubbable");
  element.style.touchAction = "none";
  let pointerId = null;
  let originX = 0;
  let originY = 0;
  let emitted = 0;
  let moved = false;
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    emitted = 0;
    moved = false;
    element.setPointerCapture?.(pointerId);
    element.classList.add("scrubbing");
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) {
      return;
    }
    const travel = (event.clientX - originX) + (originY - event.clientY);
    const target = Math.trunc(travel / nodeGraphMidiKeyboardScrubPixelsPerStep);
    const steps = target - emitted;
    if (steps) {
      moved = true;
      emitted = target;
      const direction = steps > 0 ? 1 : -1;
      for (let index = 0; index < Math.abs(steps); index += 1) {
        applyDelta(direction);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  });
  const endScrub = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) {
      return;
    }
    element.releasePointerCapture?.(pointerId);
    pointerId = null;
    element.classList.remove("scrubbing");
    // A press with no movement is a plain click on the number -- swallow it
    // so it does not fall through to the module underneath.
    if (moved) {
      event.preventDefault();
    }
    event.stopPropagation();
  };
  element.addEventListener("pointerup", endScrub);
  element.addEventListener("pointercancel", endScrub);
}

function bindNodeGraphMidiKeyboardScrubControls() {
  document.querySelectorAll("[data-midi-keyboard-octave-value]").forEach((element) => {
    bindNodeGraphMidiKeyboardScrubControl(element, changeNodeGraphMidiKeyboardOctave);
  });
  document.querySelectorAll("[data-midi-keyboard-key-count-value]").forEach((element) => {
    bindNodeGraphMidiKeyboardScrubControl(element, changeNodeGraphMidiKeyboardKeyCount);
  });
}

function changeNodeGraphMidiKeyboardOctave(delta) {
  nodeGraphMvp.midiKeyboardOctave = nodeGraphMidiKeyboardOctaveOffset(nodeGraphMvp.midiKeyboardOctave + delta);
  nodeGraphMvp.midiKeyboardPointerHeldSignal = retuneNodeGraphMidiKeyboardSignal(nodeGraphMvp.midiKeyboardPointerHeldSignal);
  nodeGraphMvp.midiKeyboardStatus = `octave ${nodeGraphMidiKeyboardOctaveLabel(nodeGraphMvp.midiKeyboardOctave)}`;
  renderNodeGraphMidiKeyboardOctaveControl();
  renderNodeGraphMidiKeyboardSignal(retuneNodeGraphMidiKeyboardSignal(nodeGraphMvp.midiKeyboardSignal));
  saveNodeGraphMidiKeyboardMemory();
  renderNodeGraphMidiKeyboardInputControls();
}

function updateNodeGraphMidiKeyboardSignal(event) {
  const surface = event.currentTarget?.closest?.(".node-midi-keyboard-module")?.querySelector(".node-midi-keyboard-surface") ||
    document.querySelector(".node-midi-keyboard-module .node-midi-keyboard-surface");
  if (!surface) {
    return;
  }
  const mode = nodeGraphMidiKeyboardMode();
  // Ctrl+click builds the "held keys" bitmask -- checked before the
  // existing shift/hold-mode branch below so plain shift+click (no
  // ctrl) still falls through unchanged to that existing behavior.
  if (event.type === "pointerdown" && event.ctrlKey) {
    const target = event.target?.closest?.("[data-key-index]");
    if (target && surface.contains(target)) {
      const index = Number(target.dataset.keyIndex);
      const keyCount = nodeGraphMidiKeyboardKeyCount();
      if (event.shiftKey) {
        const rotated = nodeGraphMidiKeyboardBitmaskRotate(
          nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
          nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
          keyCount,
        );
        nodeGraphMvp.midiKeyboardHeldKeysLowBitmask = rotated.low;
        nodeGraphMvp.midiKeyboardHeldKeysHighBitmask = rotated.high;
        renderNodeGraphMidiKeyboardHeldKeys();
        saveNodeGraphMidiKeyboardMemory();
        if (typeof sendNodeGraphLiveMidiKeyboardHeldKeysBitmask === "function") {
          sendNodeGraphLiveMidiKeyboardHeldKeysBitmask();
        }
      } else {
        nodeGraphMidiKeyboardToggleHeldKeyBit(index);
      }
    }
    event.preventDefault();
    return;
  }
  // A plain click on a key that's already held -- however it got held,
  // ctrl+click/toggle-mode's bitmask or shift+click's single-note latch
  // -- releases it, instead of requiring the exact gesture that held it
  // in the first place (shift+click again, or another ctrl+click).
  // Checked before mode-specific behavior below so this takes priority
  // in every mode.
  if (event.type === "pointerdown" && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    const target = event.target?.closest?.("[data-key-index]");
    if (target && surface.contains(target)) {
      const index = Number(target.dataset.keyIndex);
      if (nodeGraphMidiKeyboardHeldKeyBitIsSet(index)) {
        nodeGraphMidiKeyboardToggleHeldKeyBit(index);
        event.preventDefault();
        return;
      }
      const heldPointer = nodeGraphMidiKeyboardHeldPointerSignal();
      const targetMidi = Number(target.dataset.midi);
      if (heldPointer && heldPointer.midi === targetMidi) {
        clearNodeGraphMidiKeyboardPointerHold(`${heldPointer.pitch} hold off`);
        event.preventDefault();
        return;
      }
    }
  }
  // Toggle mode turns a plain click into what ctrl+click already does --
  // toggles that key's held-keys bit instead of playing a note. Ctrl and
  // Shift+Alt keep their own meanings above regardless of mode, so this
  // only fires for an unmodified click.
  if (event.type === "pointerdown" && mode === "toggle" && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    const target = event.target?.closest?.("[data-key-index]");
    if (target && surface.contains(target)) {
      nodeGraphMidiKeyboardToggleHeldKeyBit(Number(target.dataset.keyIndex));
    }
    event.preventDefault();
    return;
  }
  // Shift+Alt+click transposes the held-keys bitmask -- checked before
  // the plain shift/hold-mode branch below so plain shift+click (no
  // alt) still falls through unchanged to that existing behavior.
  if (event.type === "pointerdown" && event.shiftKey && event.altKey && !event.ctrlKey) {
    const keyCount = nodeGraphMidiKeyboardKeyCount();
    const transposed = nodeGraphMidiKeyboardBitmaskTranspose(
      nodeGraphMvp.midiKeyboardHeldKeysLowBitmask,
      nodeGraphMvp.midiKeyboardHeldKeysHighBitmask,
      keyCount,
      7,
    );
    nodeGraphMvp.midiKeyboardHeldKeysLowBitmask = transposed.low;
    nodeGraphMvp.midiKeyboardHeldKeysHighBitmask = transposed.high;
    renderNodeGraphMidiKeyboardHeldKeys();
    saveNodeGraphMidiKeyboardMemory();
    if (typeof sendNodeGraphLiveMidiKeyboardHeldKeysBitmask === "function") {
      sendNodeGraphLiveMidiKeyboardHeldKeysBitmask();
    }
    event.preventDefault();
    return;
  }
  if (event.type === "pointerdown" && (event.shiftKey || mode === "hold")) {
    toggleNodeGraphMidiKeyboardPointerHold(event, surface);
    return;
  }
  const held = nodeGraphMidiKeyboardHeldPointerSignal();
  if (event.type === "pointerup" && (event.shiftKey || mode === "hold") && !held) {
    renderNodeGraphMidiKeyboardSignal(null);
    return;
  }
  if (held && event.buttons <= 0) {
    renderNodeGraphMidiKeyboardSignal(held);
    return;
  }
  renderNodeGraphMidiKeyboardSignal(nodeGraphMidiKeyboardSignalFromPointer(event, surface));
}

function handleNodeGraphMidiKeyboardPointerLeave() {
  renderNodeGraphMidiKeyboardSignal(nodeGraphMidiKeyboardHeldPointerSignal());
}

function renderNodeGraphMidiKeyboardInputControls() {
  const inputs = Array.isArray(nodeGraphMvp.midiKeyboardInputs) ? nodeGraphMvp.midiKeyboardInputs : [];
  document.querySelectorAll("[data-midi-keyboard-midi-button]").forEach((button) => {
    button.textContent = nodeGraphMvp.midiKeyboardAccess ? "Refresh MIDI" : "Enable MIDI";
  });
  document.querySelectorAll("[data-midi-keyboard-midi-input]").forEach((select) => {
    const selected = nodeGraphMvp.midiKeyboardInputId || "";
    select.replaceChildren(new Option(inputs.length ? "all midi inputs" : "no midi input", ""));
    for (const input of inputs) {
      select.append(new Option(input.name || input.id || "midi input", input.id));
    }
    select.disabled = !inputs.length;
    select.value = inputs.some((input) => input.id === selected) ? selected : "";
  });
  renderNodeGraphMidiKeyboardModeControl();
  renderNodeGraphMidiToggleButton();
}

function refreshNodeGraphMidiKeyboardInputs() {
  const access = nodeGraphMvp.midiKeyboardAccess;
  const inputs = access?.inputs ? Array.from(access.inputs.values()) : [];
  nodeGraphMvp.midiKeyboardInputs = inputs.map((input) => ({
    id: input.id,
    name: input.name || input.manufacturer || input.id,
  }));
  if (nodeGraphMvp.midiKeyboardInputId && !inputs.some((input) => input.id === nodeGraphMvp.midiKeyboardInputId)) {
    nodeGraphMvp.midiKeyboardInputId = "";
  }
  for (const input of inputs) {
    input.onmidimessage = handleNodeGraphMidiKeyboardMessage;
  }
  nodeGraphMvp.midiKeyboardStatus = inputs.length ? `${inputs.length} midi input${inputs.length === 1 ? "" : "s"}` : "midi ready: no inputs";
  renderNodeGraphMidiKeyboardInputControls();
}

// Header "MIDI" live toggle (next to Input/Output). On => request Web MIDI
// access and attach the note handler; off => detach every input's handler so
// nothing is received, while keeping the granted access object around so
// turning it back on does not re-prompt the browser.
function disableNodeGraphMidiKeyboardInput() {
  const access = nodeGraphMvp.midiKeyboardAccess;
  if (access) {
    access.onstatechange = null;
    for (const input of access.inputs?.values?.() || []) {
      input.onmidimessage = null;
    }
  }
  nodeGraphMvp.midiKeyboardHeldNotes?.clear?.();
  nodeGraphMvp.midiKeyboardStatus = "midi off";
  renderNodeGraphMidiKeyboardInputControls();
  renderNodeGraphMidiToggleButton();
}

async function toggleNodeGraphMidiInput() {
  if (nodeGraphMvp.midiInputEnabled) {
    nodeGraphMvp.midiInputEnabled = false;
    disableNodeGraphMidiKeyboardInput();
    setNodeInteractionHelp("MIDI input off.");
    return;
  }
  nodeGraphMvp.midiInputEnabled = true;
  renderNodeGraphMidiToggleButton();
  await enableNodeGraphMidiKeyboardInput();
  // enable* leaves midiKeyboardAccess null when the browser has no Web MIDI
  // or the user denied the permission prompt -- do not leave the button
  // claiming MIDI is on in that case.
  if (!nodeGraphMvp.midiKeyboardAccess) {
    nodeGraphMvp.midiInputEnabled = false;
  }
  renderNodeGraphMidiToggleButton();
  setNodeInteractionHelp(
    nodeGraphMvp.midiInputEnabled
      ? `MIDI input on -- ${nodeGraphMvp.midiKeyboardStatus || "ready"}.`
      : `MIDI input unavailable: ${nodeGraphMvp.midiKeyboardStatus || "blocked"}.`,
  );
}

function renderNodeGraphMidiToggleButton() {
  const button = document.getElementById("nodeLiveMidiButton");
  if (!button) {
    return;
  }
  const on = Boolean(nodeGraphMvp.midiInputEnabled);
  button.classList.toggle("active", on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.replaceChildren();
  for (const text of ["MIDI", on ? "(On)" : "(Off)"]) {
    const line = document.createElement("span");
    line.textContent = text;
    button.append(line);
  }
  button.title = on
    ? `MIDI input on -- ${nodeGraphMvp.midiKeyboardStatus || "ready"}. Click to stop receiving MIDI.`
    : "MIDI input off. Click to request Web MIDI access and receive notes from a connected controller.";
}

async function enableNodeGraphMidiKeyboardInput() {
  if (!navigator.requestMIDIAccess) {
    nodeGraphMvp.midiKeyboardStatus = "web midi unavailable";
    renderNodeGraphMidiKeyboardInputControls();
    return;
  }
  try {
    nodeGraphMvp.midiKeyboardStatus = "requesting midi...";
    renderNodeGraphMidiKeyboardInputControls();
    const access = await navigator.requestMIDIAccess({ sysex: false });
    nodeGraphMvp.midiKeyboardAccess = access;
    access.onstatechange = refreshNodeGraphMidiKeyboardInputs;
    refreshNodeGraphMidiKeyboardInputs();
  } catch (error) {
    nodeGraphMvp.midiKeyboardStatus = error?.message || "midi access blocked";
    renderNodeGraphMidiKeyboardInputControls();
  }
}

function handleNodeGraphMidiKeyboardInputChange(event) {
  nodeGraphMvp.midiKeyboardInputId = event.currentTarget.value || "";
  saveNodeGraphMidiKeyboardMemory();
  renderNodeGraphMidiKeyboardInputControls();
}

function handleNodeGraphMidiKeyboardMessage(event) {
  const input = event.currentTarget;
  if (nodeGraphMvp.midiKeyboardInputId && input?.id !== nodeGraphMvp.midiKeyboardInputId) {
    return;
  }
  const [status = 0, data1 = 0, data2 = 0] = Array.from(event.data || []);
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  if (command === 0xb0 && data1 === 1) {
    const value = Math.max(0, Math.min(127, Math.round(data2))) / 127;
    setNodeGraphPerformanceWheel("modWheel", value, `ch ${channel} mod wheel ${value.toFixed(3)}`);
    return;
  }
  if (command === 0xe0) {
    const raw = Math.max(0, Math.min(16383, (Math.round(data1) || 0) + (Math.round(data2) || 0) * 128));
    const value = raw >= 8192 ? (raw - 8192) / 8191 : (raw - 8192) / 8192;
    setNodeGraphPerformanceWheel("pitchWheel", value, `ch ${channel} pitch bend ${nodeGraphPerformancePitchWheelValue(value).toFixed(3)}`);
    return;
  }
  if (command !== 0x80 && command !== 0x90) {
    return;
  }
  const midi = Math.max(0, Math.min(127, Math.round(data1)));
  const velocity = Math.max(0, Math.min(127, Math.round(data2)));
  const noteOn = command === 0x90 && velocity > 0;
  if (!(nodeGraphMvp.midiKeyboardHeldNotes instanceof Map)) {
    nodeGraphMvp.midiKeyboardHeldNotes = new Map();
  }
  if (noteOn) {
    nodeGraphMvp.midiKeyboardHeldNotes.set(midi, velocity);
    nodeGraphMvp.midiKeyboardStatus = `ch ${channel} ${nodeGraphMidiKeyboardPitchLabel(midi)} vel ${velocity}`;
    renderNodeGraphMidiKeyboardSignal(nodeGraphMidiKeyboardSignalFromMidi(midi, velocity, 1, 1));
    return;
  }
  nodeGraphMvp.midiKeyboardHeldNotes.delete(midi);
  const held = Array.from(nodeGraphMvp.midiKeyboardHeldNotes.entries()).at(-1);
  if (held) {
    const [heldMidi, heldVelocity] = held;
    nodeGraphMvp.midiKeyboardStatus = `ch ${channel} ${nodeGraphMidiKeyboardPitchLabel(heldMidi)} vel ${heldVelocity}`;
    renderNodeGraphMidiKeyboardSignal(nodeGraphMidiKeyboardSignalFromMidi(heldMidi, heldVelocity, 1));
    return;
  }
  nodeGraphMvp.midiKeyboardStatus = `ch ${channel} ${nodeGraphMidiKeyboardPitchLabel(midi)} off`;
  renderNodeGraphMidiKeyboardSignal(nodeGraphMidiKeyboardSignalFromMidi(midi, 0, 0));
}

function bindNodeGraphKeyboardControllerModuleEvents() {
  document.querySelectorAll(".node-midi-keyboard-module .node-midi-keyboard-surface").forEach((surface) => {
    if (surface.dataset.keyboardSignalBound === "true") {
      return;
    }
    surface.dataset.keyboardSignalBound = "true";
    surface.addEventListener("pointermove", updateNodeGraphMidiKeyboardSignal);
    surface.addEventListener("pointerdown", updateNodeGraphMidiKeyboardSignal);
    surface.addEventListener("pointerup", updateNodeGraphMidiKeyboardSignal);
    surface.addEventListener("pointerleave", handleNodeGraphMidiKeyboardPointerLeave);
  });
  document.querySelectorAll("[data-performance-wheel]").forEach((wheel) => {
    if (wheel.dataset.performanceWheelBound === "true") {
      return;
    }
    wheel.dataset.performanceWheelBound = "true";
    wheel.addEventListener("pointerdown", beginNodeGraphPerformanceWheelDrag);
    wheel.addEventListener("pointermove", dragNodeGraphPerformanceWheel);
    wheel.addEventListener("pointerup", endNodeGraphPerformanceWheelDrag);
    wheel.addEventListener("pointercancel", endNodeGraphPerformanceWheelDrag);
  });
  document.querySelectorAll("[data-midi-keyboard-midi-button]").forEach((button) => {
    if (button.dataset.midiKeyboardButtonBound === "true") {
      return;
    }
    button.dataset.midiKeyboardButtonBound = "true";
    button.addEventListener("click", enableNodeGraphMidiKeyboardInput);
  });
  document.querySelectorAll("[data-midi-keyboard-midi-input]").forEach((select) => {
    if (select.dataset.midiKeyboardInputBound === "true") {
      return;
    }
    select.dataset.midiKeyboardInputBound = "true";
    select.addEventListener("change", handleNodeGraphMidiKeyboardInputChange);
  });
  document.querySelectorAll("[data-midi-keyboard-mode-select]").forEach((select) => {
    if (select.dataset.midiKeyboardModeBound === "true") {
      return;
    }
    select.dataset.midiKeyboardModeBound = "true";
    select.addEventListener("change", handleNodeGraphMidiKeyboardModeChange);
  });
  document.querySelectorAll("[data-midi-keyboard-octave-down]").forEach((button) => {
    if (button.dataset.midiKeyboardOctaveBound === "true") {
      return;
    }
    button.dataset.midiKeyboardOctaveBound = "true";
    button.addEventListener("click", () => changeNodeGraphMidiKeyboardOctave(-1));
  });
  document.querySelectorAll("[data-midi-keyboard-octave-up]").forEach((button) => {
    if (button.dataset.midiKeyboardOctaveBound === "true") {
      return;
    }
    button.dataset.midiKeyboardOctaveBound = "true";
    button.addEventListener("click", () => changeNodeGraphMidiKeyboardOctave(1));
  });
  document.querySelectorAll("[data-midi-keyboard-key-count-down]").forEach((button) => {
    if (button.dataset.midiKeyboardKeyCountBound === "true") {
      return;
    }
    button.dataset.midiKeyboardKeyCountBound = "true";
    button.addEventListener("click", () => changeNodeGraphMidiKeyboardKeyCount(-1));
  });
  document.querySelectorAll("[data-midi-keyboard-key-count-up]").forEach((button) => {
    if (button.dataset.midiKeyboardKeyCountBound === "true") {
      return;
    }
    button.dataset.midiKeyboardKeyCountBound = "true";
    button.addEventListener("click", () => changeNodeGraphMidiKeyboardKeyCount(1));
  });
  // Populates any newly-mounted surface's empty white/black rows (see
  // createNodeGraphKeyboardControllerBody) and re-renders every surface
  // to the current key count -- cheap enough to always run here rather
  // than tracking "is this a first mount" separately.
  bindNodeGraphMidiKeyboardScrubControls();
  renderNodeGraphMidiKeyboardKeys();
  renderNodeGraphMidiKeyboardKeyCountControl();
  renderNodeGraphMidiKeyboardSignal(null);
  renderNodeGraphMidiKeyboardOctaveControl();
  renderNodeGraphPerformanceWheels();
  renderNodeGraphMidiKeyboardInputControls();
}

function renderNodeGraphKeyboardControllerModules() {
  ensureNodeGraphMidiKeyboardMemoryLoaded();
  bindNodeGraphKeyboardControllerModuleEvents();
}

function toggleNodeGraphVideoView() {
  nodeGraphMvp.videoViewVisible = !nodeGraphMvp.videoViewVisible;
  renderNodeGraphVideoViewToggle();
  setNodeInteractionHelp(nodeGraphMvp.videoViewVisible ? "Camera view shown." : "Camera view hidden.");
}

function toggleNodeGraphGridVisibility() {
  nodeGraphMvp.gridVisible = !nodeGraphMvp.gridVisible;
  renderNodeGraphGridToggle();
}

function toggleNodeGraphModuleButtonsVisibility() {
  setNodeGraphModuleButtonsVisibility(nodeGraphMvp.moduleButtonsVisible === false);
}

function toggleNodeGraphOscilloscopeVisibility() {
  nodeGraphMvp.moduleOscilloscopesVisible = nodeGraphMvp.moduleOscilloscopesVisible === false;
  renderNodeGraphModuleVisibilityToggles();
  if (typeof scheduleNodeGraphLivePlanSync === "function") {
    scheduleNodeGraphLivePlanSync();
  }
  if (nodeGraphMvp.moduleOscilloscopesVisible) {
    scheduleNodeGraphModuleScopeDraw();
  } else {
    if (typeof closeNodeScopeContextMenu === "function") {
      closeNodeScopeContextMenu();
    }
  }
  setNodeInteractionHelp(nodeGraphMvp.moduleOscilloscopesVisible ? "Displays shown." : "Displays hidden.");
}

function toggleNodeGraphModuleSlidersVisibility() {
  nodeGraphMvp.moduleSlidersVisible = nodeGraphMvp.moduleSlidersVisible === false;
  renderNodeGraphModuleVisibilityToggles();
  setNodeInteractionHelp(nodeGraphMvp.moduleSlidersVisible ? "Module sliders shown." : "Module sliders hidden.");
}

function toggleNodeGraphModuleInterfaceControlsVisibility() {
  nodeGraphMvp.moduleInterfaceControlsVisible = nodeGraphMvp.moduleInterfaceControlsVisible === false;
  renderNodeGraphModuleVisibilityToggles();
  setNodeInteractionHelp(nodeGraphMvp.moduleInterfaceControlsVisible ? "Module control surfaces shown." : "Module control surfaces hidden.");
}

function toggleNodeGraphKeyboardDebugVisibility() {
  // Session-only: D / Visibility toggles debug chrome for this visit.
  // Not written to UI settings; refresh / Clear Startup / Save always start hidden
  // (debug and release builds alike).
  nodeGraphMvp.keyboardDebugInfoVisible = !(nodeGraphMvp.keyboardDebugInfoVisible === true);
  renderNodeGraphKeyboardDebugToggle();
  setNodeInteractionHelp(
    nodeGraphMvp.keyboardDebugInfoVisible
      ? "Debug chrome shown (session only — not saved)."
      : "Debug chrome hidden.",
  );
}

function toggleNodeGraphSliderAmount() {
  nodeGraphMvp.sliderAmountVisible = !nodeGraphMvp.sliderAmountVisible;
  renderNodeGraphSliderVisibilityToggles();
}

function toggleNodeGraphSliderPosition() {
  nodeGraphMvp.sliderPositionVisible = !nodeGraphMvp.sliderPositionVisible;
  renderNodeGraphSliderVisibilityToggles();
}

function renderNodeVisibility() {
  for (const node of document.querySelectorAll(".dsp-node")) {
    node.classList.toggle("removed", !nodeGraphMvp.activeNodes.has(node.dataset.node));
  }
  drawNodeGraphWires();
}

function renderNodePalette() {
  for (const button of document.querySelectorAll("[data-palette-node]")) {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  }
}

function handleNodeGraphMappingCellClick(event) {
  const cell = event.target.closest("[data-mapping-key][data-mapping-velocity]");
  if (!cell) {
    return;
  }
  const active = cell.getAttribute("aria-pressed") !== "true";
  cell.setAttribute("aria-pressed", String(active));
  cell.classList.toggle("active", active);
  const key = Number(cell.dataset.mappingKey);
  const velocity = Number(cell.dataset.mappingVelocity);
  const keyLabel = nodeGraphMidiKeyboardPitchLabel(key);
  const status = document.getElementById("nodeMappingStatus");
  if (status) {
    status.textContent = `${active ? "mapped" : "cleared"} key ${keyLabel} (${key}) velocity ${velocity}`;
  }
}

function renderNodeGraphMappingView() {
  const grid = document.getElementById("nodeMappingGrid");
  if (!grid) {
    return;
  }
  if (grid.dataset.rendered === "true") {
    return;
  }
  grid.dataset.rendered = "true";
  if (grid.dataset.bound !== "true") {
    grid.dataset.bound = "true";
    grid.addEventListener("click", handleNodeGraphMappingCellClick);
  }
  const fragment = document.createDocumentFragment();
  const corner = document.createElement("div");
  corner.className = "node-mapping-corner";
  corner.textContent = "velocity \\ key";
  fragment.append(corner);
  for (let key = 0; key < 128; key += 1) {
    const header = document.createElement("div");
    header.className = "node-mapping-col-header";
    header.title = `${nodeGraphMidiKeyboardPitchLabel(key)} / MIDI ${key}`;
    header.textContent = String(key);
    fragment.append(header);
  }
  for (let velocity = 127; velocity >= 0; velocity -= 1) {
    const rowHeader = document.createElement("div");
    rowHeader.className = "node-mapping-row-header";
    rowHeader.title = `Velocity ${velocity}`;
    rowHeader.textContent = String(velocity);
    fragment.append(rowHeader);
    for (let key = 0; key < 128; key += 1) {
      const cell = document.createElement("button");
      cell.className = "node-mapping-cell";
      cell.type = "button";
      cell.dataset.mappingKey = String(key);
      cell.dataset.mappingVelocity = String(velocity);
      cell.setAttribute("aria-label", `Map key ${nodeGraphMidiKeyboardPitchLabel(key)} MIDI ${key} at velocity ${velocity}`);
      cell.setAttribute("aria-pressed", "false");
      fragment.append(cell);
    }
  }
  grid.replaceChildren(fragment);
}

function setNodeGraphViewMode(mode) {
  if (typeof syncNodeGraphRegisteredFloatingWindowSurfaces === "function") {
    syncNodeGraphRegisteredFloatingWindowSurfaces();
  }
  if (mode !== "script") {
    flushNodeGraphScriptCommit();
  }
  const settingsMode = mode === "settings";
  const scriptMode = mode === "script";
  const codeMode = mode === "code";
  const mappingMode = mode === "mapping";
  const modularOnlyMode = mode === "modular-only";
  const modularMode = modularOnlyMode || (!settingsMode && !scriptMode && !codeMode && !mappingMode);
  const workspaceMode = modularMode;
  const wiringPanel = document.getElementById("nodeWiringPanel");
  wiringPanel?.classList.toggle("modular-only-view", modularOnlyMode);
  document.getElementById("nodeGraphWorkspace").hidden = !workspaceMode;
  document.getElementById("nodeModularOnlyBackButton").textContent = "←";
  document
    .getElementById("nodeModularOnlyBackButton")
    .setAttribute("aria-label", "Return to full modular view");
  document.getElementById("nodeScriptView").hidden = !scriptMode;
  document.getElementById("nodeCodeScreenView").hidden = !codeMode;
  document.getElementById("nodeMappingView").hidden = !mappingMode;
  document.getElementById("nodeSettingsView").hidden = !settingsMode;
  renderNodeGraphKeyboardControllerModules();
  renderNodeGraphMacroControls();
  renderNodeGraphVideoViewToggle();
  document.getElementById("nodeSettingsViewButton").classList.toggle("active", settingsMode);
  document.getElementById("nodeModularOnlyViewButton").classList.toggle("active", modularOnlyMode);
  document.getElementById("nodeSceneToggleModularOnlyView")?.classList.toggle("active", modularOnlyMode);
  document.getElementById("nodeMappingViewButton")?.classList.toggle("active", mappingMode);
  document.getElementById("nodeCodeScreenViewButton").classList.toggle("active", codeMode);
  document.getElementById("nodeSettingsScriptViewButton").classList.toggle("active", scriptMode);
  document.getElementById("nodeSettingsViewButton").setAttribute("aria-pressed", String(settingsMode));
  document.getElementById("nodeModularOnlyViewButton").setAttribute("aria-pressed", String(modularOnlyMode));
  document.getElementById("nodeSceneToggleModularOnlyView")?.setAttribute("aria-pressed", String(modularOnlyMode));
  document.getElementById("nodeMappingViewButton")?.setAttribute("aria-pressed", String(mappingMode));
  document.getElementById("nodeCodeScreenViewButton").setAttribute("aria-pressed", String(codeMode));
  document.getElementById("nodeSettingsScriptViewButton").setAttribute("aria-pressed", String(scriptMode));
  if (scriptMode) {
    syncNodeGraphScriptView();
  } else if (codeMode) {
    renderNodeGraphCodeScreen();
  } else if (settingsMode) {
    syncNodeGraphSettingsView();
    scheduleNodeSettingsHeaderTextFit();
  } else if (mappingMode) {
    renderNodeGraphMappingView();
  } else {
    drawNodeGraphWires();
  }
  if (typeof renderNodeGraphCameraView === "function") {
    renderNodeGraphCameraView();
  }
  if (typeof applyNodeGraphWorkspaceView === "function") {
    applyNodeGraphWorkspaceView();
  }
}
