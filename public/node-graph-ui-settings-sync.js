function syncNodeUiDevNodeColorControls() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  for (const input of document.querySelectorAll("[data-node-color-var]")) {
    const property = input.dataset.nodeColorVar;
    if (!property?.startsWith("--")) {
      continue;
    }
    const fallback = input.getAttribute("value") || "#000000";
    const color = normalizeNodeUiDevColor(input.value, fallback);
    input.value = color;
    workspace.style.setProperty(property, color);
    const output = document.getElementById(`${input.id}Value`);
    if (output) {
      output.textContent = color;
    }
  }
}

// Slider fill colors (amount band + position/handle indicator) as full HSLA.
// Deliberately NOT folded into syncNodeUiDevSettingsHeaderControls below --
// that function bails early if any one of its ~80 hardcoded inputs is missing,
// so anything added to it inherits that fragility. This reads its own controls
// by definition key and writes two CSS custom properties, nothing else.
const nodeUiDevSliderFillColorTargets = Object.freeze([
  { property: "--node-slider-amount-color", prefix: "nodeUiDevSliderAmountFill", fallback: [200, 31, 15, 55] },
  { property: "--node-slider-position-color", prefix: "nodeUiDevSliderPositionFill", fallback: [203, 55, 57, 37] },
]);

function nodeUiDevSliderFillChannel(id, fallback, max) {
  const input = document.getElementById(id);
  const value = Number(input?.value);
  return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
}

function syncNodeUiDevSliderFillColorControls() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  for (const target of nodeUiDevSliderFillColorTargets) {
    const [hueFallback, satFallback, lightFallback, alphaFallback] = target.fallback;
    const hue = nodeUiDevSliderFillChannel(`${target.prefix}Hue`, hueFallback, 360);
    const saturation = nodeUiDevSliderFillChannel(`${target.prefix}Saturation`, satFallback, 100);
    const lightness = nodeUiDevSliderFillChannel(`${target.prefix}Lightness`, lightFallback, 100);
    const alpha = nodeUiDevSliderFillChannel(`${target.prefix}Alpha`, alphaFallback, 100);
    workspace.style.setProperty(
      target.property,
      `hsl(${hue} ${saturation}% ${lightness}% / ${alpha / 100})`,
    );
    for (const [suffix, text] of [
      ["Hue", `${hue}deg`],
      ["Saturation", `${saturation}%`],
      ["Lightness", `${lightness}%`],
      ["Alpha", `${alpha}%`],
    ]) {
      const output = document.getElementById(`${target.prefix}${suffix}Value`);
      if (output) {
        output.textContent = text;
      }
    }
  }
}

function bindNodeUiDevSliderFillColorControls() {
  for (const target of nodeUiDevSliderFillColorTargets) {
    for (const suffix of ["Hue", "Saturation", "Lightness", "Alpha"]) {
      const input = document.getElementById(`${target.prefix}${suffix}`);
      if (!input || input.dataset.sliderFillColorBound === "true") {
        continue;
      }
      input.dataset.sliderFillColorBound = "true";
      input.addEventListener("input", syncNodeUiDevSliderFillColorControls);
      input.addEventListener("change", syncNodeUiDevSliderFillColorControls);
    }
  }
  syncNodeUiDevSliderFillColorControls();
}

function syncNodeUiDevSettingsHeaderControls() {
  // Runs before the early-return guard below so the slider fill colors apply
  // even if some unrelated control is absent from the DOM.
  syncNodeUiDevSliderFillColorControls();
  const settingsView = document.getElementById("nodeSettingsView");
  const mouseLightEnabledInput = document.getElementById("nodeUiDevMouseLightEnabled");
  const hoverModuleDimmerCutoutInput = document.getElementById("nodeUiDevHoverModuleDimmerCutout");
  const showOriginMarkerInput = document.getElementById("nodeUiDevShowOriginMarker");
  const scopeBloomEnabledInput = document.getElementById("nodeUiDevScopeBloomEnabled");
  const textSizeInput = document.getElementById("nodeUiDevSettingsHeaderTextSize");
  const textSizeValue = document.getElementById("nodeUiDevSettingsHeaderTextSizeValue");
  const uiDevTextSizeInput = document.getElementById("nodeUiDevButtonTextSize");
  const uiDevTextSizeValue = document.getElementById("nodeUiDevButtonTextSizeValue");
  const liveToggleTextSizeInput = document.getElementById("nodeUiDevLiveToggleTextSize");
  const liveToggleTextSizeValue = document.getElementById("nodeUiDevLiveToggleTextSizeValue");
  const modularHeaderButtonBackgroundInput = document.getElementById("nodeUiDevModularHeaderButtonBackground");
  const modularHeaderButtonBackgroundValue = document.getElementById("nodeUiDevModularHeaderButtonBackgroundValue");
  const tooltipTextSizeInput = document.getElementById("nodeUiDevTooltipTextSize");
  const tooltipTextSizeValue = document.getElementById("nodeUiDevTooltipTextSizeValue");
  const minimumGridBrightnessInput = document.getElementById("nodeUiDevMinimumGridBrightness");
  const minimumGridBrightnessValue = document.getElementById("nodeUiDevMinimumGridBrightnessValue");
  const moduleLightSpreadInput = document.getElementById("nodeUiDevModuleLightSpread");
  const moduleLightSpreadValue = document.getElementById("nodeUiDevModuleLightSpreadValue");
  const textGlowLevelInput = document.getElementById("nodeUiDevTextGlowLevel");
  const textGlowLevelValue = document.getElementById("nodeUiDevTextGlowLevelValue");
  const moduleGridInsetInput = document.getElementById("nodeUiDevModuleGridInset");
  const moduleGridInsetValue = document.getElementById("nodeUiDevModuleGridInsetValue");
  const moduleRoundnessInput = document.getElementById("nodeUiDevModuleRoundness");
  const moduleRoundnessValue = document.getElementById("nodeUiDevModuleRoundnessValue");
  const gridColorInput = document.getElementById("nodeUiDevGridColor");
  const gridColorValue = document.getElementById("nodeUiDevGridColorValue");
  const workspaceBackgroundColorInput = document.getElementById("nodeUiDevWorkspaceBackgroundColor");
  const workspaceBackgroundColorValue = document.getElementById("nodeUiDevWorkspaceBackgroundColorValue");
  const moduleBrowserEntryHeightInput = document.getElementById("nodeUiDevModuleBrowserEntryHeight");
  const moduleBrowserEntryHeightValue = document.getElementById("nodeUiDevModuleBrowserEntryHeightValue");
  const moduleBrowserEntryPaddingInput = document.getElementById("nodeUiDevModuleBrowserEntryPadding");
  const moduleBrowserEntryPaddingValue = document.getElementById("nodeUiDevModuleBrowserEntryPaddingValue");
  const moduleBrowserEntryTextSizeInput = document.getElementById("nodeUiDevModuleBrowserEntryTextSize");
  const moduleBrowserEntryTextSizeValue = document.getElementById("nodeUiDevModuleBrowserEntryTextSizeValue");
  const topRatioInput = document.getElementById("nodeUiDevSettingsHeaderTopRatio");
  const topRatioValue = document.getElementById("nodeUiDevSettingsHeaderTopRatioValue");
  const paddingInput = document.getElementById("nodeUiDevSettingsHeaderPadding");
  const paddingValue = document.getElementById("nodeUiDevSettingsHeaderPaddingValue");
  const floatingWindowHeaderHeightInput = document.getElementById("nodeUiDevFloatingWindowHeaderHeight");
  const floatingWindowHeaderHeightValue = document.getElementById("nodeUiDevFloatingWindowHeaderHeightValue");
  const moduleTitleFontInput = document.getElementById("nodeUiDevModuleTitleFont");
  const moduleTitleFontValue = document.getElementById("nodeUiDevModuleTitleFontValue");
  const moduleTitleHeightInput = document.getElementById("nodeUiDevModuleTitleHeight");
  const moduleTitleHeightValue = document.getElementById("nodeUiDevModuleTitleHeightValue");
  const moduleTitleTextFillInput = document.getElementById("nodeUiDevModuleTitleTextFill");
  const moduleTitleTextFillValue = document.getElementById("nodeUiDevModuleTitleTextFillValue");
  const moduleIoSectionHeightInput = document.getElementById("nodeUiDevModuleIoSectionHeight");
  const moduleIoSectionHeightValue = document.getElementById("nodeUiDevModuleIoSectionHeightValue");
  const moduleNodeSizeInput = document.getElementById("nodeUiDevModuleNodeSize");
  const moduleNodeSizeValue = document.getElementById("nodeUiDevModuleNodeSizeValue");
  const sliderWidthInput = document.getElementById("nodeUiDevSliderWidth");
  const sliderWidthValue = document.getElementById("nodeUiDevSliderWidthValue");
  const sliderHeightInput = document.getElementById("nodeUiDevSliderHeight");
  const sliderHeightValue = document.getElementById("nodeUiDevSliderHeightValue");
  const sliderLabelColorInput = document.getElementById("nodeUiDevSliderLabelColor");
  const sliderLabelColorValue = document.getElementById("nodeUiDevSliderLabelColorValue");
  const sliderValueColorInput = document.getElementById("nodeUiDevSliderValueColor");
  const sliderValueColorValue = document.getElementById("nodeUiDevSliderValueColorValue");
  const sliderUnitColorInput = document.getElementById("nodeUiDevSliderUnitColor");
  const sliderUnitColorValue = document.getElementById("nodeUiDevSliderUnitColorValue");
  const sliderFillHoverColorInput = document.getElementById("nodeUiDevSliderFillHoverColor");
  const sliderFillHoverColorValue = document.getElementById("nodeUiDevSliderFillHoverColorValue");
  const sliderFillHoverAlphaInput = document.getElementById("nodeUiDevSliderFillHoverAlpha");
  const sliderFillHoverAlphaValue = document.getElementById("nodeUiDevSliderFillHoverAlphaValue");
  const nodeGlowSizeInput = document.getElementById("nodeUiDevNodeGlowSize");
  const nodeGlowSizeValue = document.getElementById("nodeUiDevNodeGlowSizeValue");
  const wirePatchPointSizeInput = document.getElementById("nodeUiDevWirePatchPointSize");
  const wirePatchPointSizeValue = document.getElementById("nodeUiDevWirePatchPointSizeValue");
  const wireThicknessInput = document.getElementById("nodeUiDevWireThickness");
  const wireThicknessValue = document.getElementById("nodeUiDevWireThicknessValue");
  const traceWireThicknessInput = document.getElementById("nodeUiDevTraceWireThickness");
  const traceWireThicknessValue = document.getElementById("nodeUiDevTraceWireThicknessValue");
  const choiceSlideEmptyBorderInput = document.getElementById("nodeUiDevChoiceSlideEmptyBorder");
  const choiceSlideEmptyBorderValue = document.getElementById("nodeUiDevChoiceSlideEmptyBorderValue");
  const choiceDividerHeightInput = document.getElementById("nodeUiDevChoiceDividerHeight");
  const choiceDividerHeightValue = document.getElementById("nodeUiDevChoiceDividerHeightValue");
  const choiceSlideDebugBoxesInput = document.getElementById("nodeUiDevChoiceSlideDebugBoxes");
  const bypassIconSizeInput = document.getElementById("nodeUiDevBypassIconSize");
  const bypassIconSizeValue = document.getElementById("nodeUiDevBypassIconSizeValue");
  const bypassIconPreview = document.getElementById("nodeUiDevBypassIconPreview");
  const bypassIconGlowSpreadInput = document.getElementById("nodeUiDevBypassIconGlowSpread");
  const bypassIconGlowSpreadValue = document.getElementById("nodeUiDevBypassIconGlowSpreadValue");
  const bypassIconGlowColorInput = document.getElementById("nodeUiDevBypassIconGlowColor");
  const bypassIconGlowColorValue = document.getElementById("nodeUiDevBypassIconGlowColorValue");
  const bypassIconOnColorInput = document.getElementById("nodeUiDevBypassIconOnColor");
  const bypassIconOnColorValue = document.getElementById("nodeUiDevBypassIconOnColorValue");
  const bypassOnBackgroundColorInput = document.getElementById("nodeUiDevBypassOnBackgroundColor");
  const bypassOnBackgroundColorValue = document.getElementById("nodeUiDevBypassOnBackgroundColorValue");
  const bypassOffBackgroundColorInput = document.getElementById("nodeUiDevBypassOffBackgroundColor");
  const bypassOffBackgroundColorValue = document.getElementById("nodeUiDevBypassOffBackgroundColorValue");
  const moveSymbolSizeInput = document.getElementById("nodeUiDevMoveSymbolSize");
  const moveSymbolSizeValue = document.getElementById("nodeUiDevMoveSymbolSizeValue");
  const moveSymbolPreview = document.getElementById("nodeUiDevMoveSymbolPreview");
  const closeIconSizeInput = document.getElementById("nodeUiDevCloseIconSize");
  const closeIconSizeValue = document.getElementById("nodeUiDevCloseIconSizeValue");
  const closeIconPreview = document.getElementById("nodeUiDevCloseIconPreview");
  const highlightInput = document.getElementById("nodeUiDevSettingsHeaderHighlights");
  if (
    !settingsView ||
    !mouseLightEnabledInput ||
    !hoverModuleDimmerCutoutInput ||
    !showOriginMarkerInput ||
    !scopeBloomEnabledInput ||
    !textSizeInput ||
    !textSizeValue ||
    !uiDevTextSizeInput ||
    !uiDevTextSizeValue ||
    !liveToggleTextSizeInput ||
    !liveToggleTextSizeValue ||
    !modularHeaderButtonBackgroundInput ||
    !modularHeaderButtonBackgroundValue ||
    !tooltipTextSizeInput ||
    !tooltipTextSizeValue ||
    !minimumGridBrightnessInput ||
    !minimumGridBrightnessValue ||
    !moduleLightSpreadInput ||
    !moduleLightSpreadValue ||
    !textGlowLevelInput ||
    !textGlowLevelValue ||
    !moduleGridInsetInput ||
    !moduleGridInsetValue ||
    !moduleRoundnessInput ||
    !moduleRoundnessValue ||
    !gridColorInput ||
    !gridColorValue ||
    !workspaceBackgroundColorInput ||
    !workspaceBackgroundColorValue ||
    !moduleBrowserEntryHeightInput ||
    !moduleBrowserEntryHeightValue ||
    !moduleBrowserEntryPaddingInput ||
    !moduleBrowserEntryPaddingValue ||
    !moduleBrowserEntryTextSizeInput ||
    !moduleBrowserEntryTextSizeValue ||
    !topRatioInput ||
    !topRatioValue ||
    !paddingInput ||
    !paddingValue ||
    !floatingWindowHeaderHeightInput ||
    !floatingWindowHeaderHeightValue ||
    !moduleTitleFontInput ||
    !moduleTitleFontValue ||
    !moduleTitleHeightInput ||
    !moduleTitleHeightValue ||
    !moduleTitleTextFillInput ||
    !moduleTitleTextFillValue ||
    !moduleIoSectionHeightInput ||
    !moduleIoSectionHeightValue ||
    !moduleNodeSizeInput ||
    !moduleNodeSizeValue ||
    !sliderWidthInput ||
    !sliderWidthValue ||
    !sliderHeightInput ||
    !sliderHeightValue ||
    !sliderLabelColorInput ||
    !sliderLabelColorValue ||
    !sliderValueColorInput ||
    !sliderValueColorValue ||
    !sliderUnitColorInput ||
    !sliderUnitColorValue ||
    !sliderFillHoverColorInput ||
    !sliderFillHoverColorValue ||
    !sliderFillHoverAlphaInput ||
    !sliderFillHoverAlphaValue ||
    !nodeGlowSizeInput ||
    !nodeGlowSizeValue ||
    !wirePatchPointSizeInput ||
    !wirePatchPointSizeValue ||
    !wireThicknessInput ||
    !wireThicknessValue ||
    !traceWireThicknessInput ||
    !traceWireThicknessValue ||
    !choiceSlideEmptyBorderInput ||
    !choiceSlideEmptyBorderValue ||
    !choiceDividerHeightInput ||
    !choiceDividerHeightValue ||
    !choiceSlideDebugBoxesInput ||
    !bypassIconSizeInput ||
    !bypassIconSizeValue ||
    !bypassIconPreview ||
    !bypassIconGlowSpreadInput ||
    !bypassIconGlowSpreadValue ||
    !bypassIconGlowColorInput ||
    !bypassIconGlowColorValue ||
    !bypassIconOnColorInput ||
    !bypassIconOnColorValue ||
    !bypassOnBackgroundColorInput ||
    !bypassOnBackgroundColorValue ||
    !bypassOffBackgroundColorInput ||
    !bypassOffBackgroundColorValue ||
    !moveSymbolSizeInput ||
    !moveSymbolSizeValue ||
    !moveSymbolPreview ||
    !closeIconSizeInput ||
    !closeIconSizeValue ||
    !closeIconPreview ||
    !highlightInput
  ) {
    return;
  }

  const mouseLightEnabled = Boolean(mouseLightEnabledInput.checked);
  const hoverModuleDimmerCutoutEnabled = Boolean(hoverModuleDimmerCutoutInput.checked);
  const showOriginMarker = Boolean(showOriginMarkerInput.checked);
  const scopeBloomEnabled = Boolean(scopeBloomEnabledInput.checked);
  const textPercent = Math.max(0, Math.min(100, Number(textSizeInput.value) || 0));
  const uiDevTextPercent = Math.max(0, Math.min(100, Number(uiDevTextSizeInput.value) || 0));
  const liveToggleTextPercent = Math.max(0, Math.min(100, Number(liveToggleTextSizeInput.value) || 0));
  const modularHeaderButtonBackgroundPercent = Math.max(
    0,
    Math.min(100, Number(modularHeaderButtonBackgroundInput.value) || 0),
  );
  // Max ceiling for tip fit-to-box (not a fixed display size).
  const tooltipTextSizePx = Math.max(12, Math.min(96, Number(tooltipTextSizeInput.value) || 64));
  const minimumGridBrightnessPercent = Math.max(
    0,
    Math.min(100, Number(minimumGridBrightnessInput.value) || 0),
  );
  const moduleLightSpreadPercent = Math.max(40, Math.min(220, Number(moduleLightSpreadInput.value) || 78));
  const textGlowLevelPercent = Math.max(0, Math.min(100, Number(textGlowLevelInput.value) || 0));
  const moduleGridInsetPx = Math.max(0, Math.min(20, Number(moduleGridInsetInput.value) || 0));
  const moduleRoundnessPercent = Math.max(0, Math.min(100, Number(moduleRoundnessInput.value) || 0));
  const gridColor = normalizeNodeUiDevColor(gridColorInput.value, "#ffffff");
  const workspaceBackgroundColor = normalizeNodeUiDevColor(workspaceBackgroundColorInput.value, "#0d0d0d");
  const moduleBrowserEntryHeightPx = Math.max(
    24,
    Math.min(120, Number(moduleBrowserEntryHeightInput.value) || 46),
  );
  const moduleBrowserEntryPaddingPx = Math.max(
    0,
    Math.min(20, Number(moduleBrowserEntryPaddingInput.value) || 0),
  );
  const moduleBrowserEntryTextSizePx = Math.max(
    8,
    Math.min(28, Number(moduleBrowserEntryTextSizeInput.value) || 16),
  );
  const topPercent = Math.max(0, Math.min(100, Number(topRatioInput.value) || 0));
  const paddingPx = Math.max(0, Math.min(20, Number(paddingInput.value) || 0));
  const floatingWindowHeaderHeightPx = Math.max(
    20,
    Math.min(48, Number(floatingWindowHeaderHeightInput.value) || 30),
  );
  const moduleTitleFont = normalizeNodeUiDevControlValue(
    nodeUiDevSettingControls.find((definition) => definition.key === "moduleTitleFont"),
    moduleTitleFontInput.value,
  );
  const moduleTitleHeightPx = Math.max(12, Math.min(44, Number(moduleTitleHeightInput.value) || 26));
  const moduleTitleTextFillPercent = Math.max(0, Math.min(100, Number(moduleTitleTextFillInput.value) || 0));
  const moduleIoSectionHeightPx = 24;
  moduleIoSectionHeightInput.value = String(moduleIoSectionHeightPx);
  const moduleNodeSizePercent = Math.max(0, Math.min(100, Number(moduleNodeSizeInput.value) || 0));
  const sliderWidthPercent = Math.max(20, Math.min(100, Number(sliderWidthInput.value) || 100));
  const sliderHeightPx = Math.max(8, Math.min(40, Number(sliderHeightInput.value) || 28));
  const sliderLabelColor = normalizeNodeUiDevColor(sliderLabelColorInput.value, "#cfdde5");
  const sliderValueColor = normalizeNodeUiDevColor(sliderValueColorInput.value, "#ffffff");
  const sliderUnitColor = normalizeNodeUiDevColor(sliderUnitColorInput.value, "#7fc7d9");
  const sliderFillHoverColor = normalizeNodeUiDevColor(sliderFillHoverColorInput.value, "#7fc7d9");
  const sliderFillHoverAlphaPercent = Math.max(0, Math.min(100, Number(sliderFillHoverAlphaInput.value) || 0));
  const nodeGlowSizePercent = Math.max(0, Math.min(200, Number(nodeGlowSizeInput.value) || 0));
  const wirePatchPointSizePercent = Math.max(0, Math.min(200, Number(wirePatchPointSizeInput.value) || 0));
  const wireThicknessPercent = Math.max(0, Math.min(100, Number(wireThicknessInput.value) || 0));
  const traceWireThicknessPx = Math.max(1, Math.min(12, Number(traceWireThicknessInput.value) || 1));
  const choiceSlideEmptyBorderPx = Math.max(0, Math.min(8, Number(choiceSlideEmptyBorderInput.value) || 0));
  const choiceDividerHeightPx = Math.max(0, Math.min(35, Number(choiceDividerHeightInput.value) || 0));
  const bypassIconSizePercent = Math.max(0, Math.min(100, Number(bypassIconSizeInput.value) || 0));
  const bypassIconGlowSpreadPercent = Math.max(
    0,
    Math.min(200, Number(bypassIconGlowSpreadInput.value) || 0),
  );
  const bypassIconGlowColor = normalizeNodeUiDevColor(bypassIconGlowColorInput.value, "#f25d5d");
  const bypassIconOnColor = normalizeNodeUiDevColor(bypassIconOnColorInput.value, "#f7b758");
  const bypassOnBackgroundColor = normalizeNodeUiDevColor(bypassOnBackgroundColorInput.value, "#5c1818");
  const bypassOffBackgroundColor = normalizeNodeUiDevColor(bypassOffBackgroundColorInput.value, "#000000");
  const moveSymbolSizePercent = Math.max(0, Math.min(100, Number(moveSymbolSizeInput.value) || 0));
  const closeIconSizePercent = Math.max(0, Math.min(100, Number(closeIconSizeInput.value) || 0));
  const moduleTitleHeightGu = moduleTitleHeightPx / nodeGraphGrid.heightPx;
  settingsView.style.setProperty("--node-settings-knob-text-ratio", String(textPercent / 100));
  settingsView.style.setProperty("--node-settings-knob-top-ratio", String(topPercent / 100));
  settingsView.style.setProperty("--node-settings-knob-extra-padding", `${paddingPx}px`);
  document
    .getElementById("nodeWiringPanel")
    ?.style.setProperty(
      "--node-toolbar-button-bg-alpha",
      String(modularHeaderButtonBackgroundPercent / 100),
    );
  document
    .getElementById("nodeWiringPanel")
    ?.style.setProperty("--node-tooltip-text-size", `${tooltipTextSizePx}px`);
  // Tip text scales to the box; re-fit when the max ceiling changes.
  if (typeof fitNodeInteractionHelpText === "function") {
    fitNodeInteractionHelpText(document.getElementById("nodeInteractionHelp"));
  }
  document
    .documentElement
    .style
    .setProperty("--node-floating-window-header-height", `${floatingWindowHeaderHeightPx}px`);
  document
    .getElementById("nodeWiringPanel")
    ?.style.setProperty("--node-min-grid-brightness-alpha", String(minimumGridBrightnessPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-amount", mouseLightEnabled ? "0.79" : "0");
  document
    .getElementById("nodeGraphWorkspace")
    ?.classList.toggle("origin-marker-visible", showOriginMarker);
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    const previousScopeBloomEnabled = Boolean(nodeGraphMvp.scopeBloomEnabled);
    nodeGraphMvp.scopeBloomEnabled = scopeBloomEnabled;
    nodeGraphMvp.hoverModuleDimmerCutoutEnabled = hoverModuleDimmerCutoutEnabled;
    document
      .getElementById("nodeGraphWorkspace")
      ?.classList.toggle("scope-bloom-enabled", scopeBloomEnabled);
    document
      .getElementById("nodeGraphWorkspace")
      ?.classList.toggle("hover-module-dimmer-cutout-enabled", hoverModuleDimmerCutoutEnabled);
    if (typeof setNodeGraphHoverModuleDimmerCutoutEnabled === "function") {
      setNodeGraphHoverModuleDimmerCutoutEnabled(hoverModuleDimmerCutoutEnabled);
    }
    if (previousScopeBloomEnabled !== scopeBloomEnabled && typeof scheduleNodeGraphModuleScopeDraw === "function") {
      scheduleNodeGraphModuleScopeDraw();
    }
  }
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-spread", "0.05");
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-color-rgb", "127 199 217");
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-module-light-spread", String(moduleLightSpreadPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-text-light-level", String(textGlowLevelPercent / 100));
  document
    .getElementById("nodeWiringPanel")
    ?.style.setProperty("--node-text-light-level", String(textGlowLevelPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-module-grid-inset", `${moduleGridInsetPx}px`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-module-roundness-ratio", String(moduleRoundnessPercent / 100));
  // Module frame SVG reads border-radius — rebuild outlines when roundness changes.
  if (typeof scheduleNodeGraphModuleFramesUpdate === "function") {
    scheduleNodeGraphModuleFramesUpdate({ force: true });
  } else if (typeof updateAllNodeGraphModuleFrames === "function") {
    updateAllNodeGraphModuleFrames({ force: true });
  }
  gridColorInput.value = gridColor;
  workspaceBackgroundColorInput.value = workspaceBackgroundColor;
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-grid-color-rgb", nodeUiDevHexColorToRgbTriplet(gridColor));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-workspace-bg", workspaceBackgroundColor);
  document.body.style.setProperty(
    "--node-module-category-row-height",
    `${moduleBrowserEntryHeightPx}px`,
  );
  document.body.style.setProperty(
    "--node-module-category-row-padding",
    `${moduleBrowserEntryPaddingPx}px`,
  );
  document.body.style.setProperty(
    "--node-module-category-row-text-size",
    `${moduleBrowserEntryTextSizePx}px`,
  );
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty(
      "--node-header-title-font-family",
      nodeUiDevSelectCssValue(
        nodeUiDevSettingControls.find((definition) => definition.key === "moduleTitleFont"),
        moduleTitleFont,
      ),
    );
  moduleTitleFontInput.value = moduleTitleFont;
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-header-title-row-height", `calc(var(--node-grid-height) * ${moduleTitleHeightGu})`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-header-title-text-ratio", String(moduleTitleTextFillPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-io-section-min-height", `${moduleIoSectionHeightPx}px`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-port-size-ratio", String(moduleNodeSizePercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-width-ratio", String(sliderWidthPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-readout-height", `${sliderHeightPx}px`);
  sliderLabelColorInput.value = sliderLabelColor;
  sliderValueColorInput.value = sliderValueColor;
  sliderUnitColorInput.value = sliderUnitColor;
  sliderFillHoverColorInput.value = sliderFillHoverColor;
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-label-color", sliderLabelColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-value-color", sliderValueColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-unit-color", sliderUnitColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-fill-hover-rgb", nodeUiDevHexColorToRgbTriplet(sliderFillHoverColor));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-slider-fill-hover-alpha", String(sliderFillHoverAlphaPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-hover-glow-size-ratio", String(nodeGlowSizePercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-wire-patch-point-size-ratio", String(wirePatchPointSizePercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-wire-thickness-ratio", String(wireThicknessPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-trace-wire-thickness", `${traceWireThicknessPx}px`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-choice-slide-empty-border", `${choiceSlideEmptyBorderPx}`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-choice-divider-height", `${choiceDividerHeightPx}px`);
  document
    .getElementById("nodeWiringPanel")
    ?.classList.toggle("choice-slider-debug", choiceSlideDebugBoxesInput.checked);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-icon-size-ratio", String(bypassIconSizePercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-icon-glow-spread-ratio", String(bypassIconGlowSpreadPercent / 100));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-icon-glow-color", bypassIconGlowColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-icon-on-color", bypassIconOnColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-on-bg", bypassOnBackgroundColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-bypass-off-bg", bypassOffBackgroundColor);
  document.body.style.setProperty("--node-move-symbol-size-ratio", String(moveSymbolSizePercent / 100));
  document.body.style.setProperty("--panel-close-glyph-size-ratio", String(closeIconSizePercent / 100));
  textSizeValue.textContent = `${textPercent}%`;
  uiDevTextSizeValue.textContent = `${uiDevTextPercent}%`;
  liveToggleTextSizeValue.textContent = `${liveToggleTextPercent}%`;
  modularHeaderButtonBackgroundValue.textContent = `${modularHeaderButtonBackgroundPercent}%`;
  tooltipTextSizeValue.textContent = `${tooltipTextSizePx}px`;
  minimumGridBrightnessValue.textContent = `${minimumGridBrightnessPercent}%`;
  moduleLightSpreadValue.textContent = `${moduleLightSpreadPercent}%`;
  textGlowLevelValue.textContent = `${textGlowLevelPercent}%`;
  moduleGridInsetValue.textContent = `${moduleGridInsetPx}px`;
  moduleRoundnessValue.textContent = `${moduleRoundnessPercent}%`;
  gridColorValue.textContent = gridColor;
  workspaceBackgroundColorValue.textContent = workspaceBackgroundColor;
  moduleBrowserEntryHeightValue.textContent = `${moduleBrowserEntryHeightPx}px`;
  moduleBrowserEntryPaddingValue.textContent = `${moduleBrowserEntryPaddingPx}px`;
  moduleBrowserEntryTextSizeValue.textContent = `${moduleBrowserEntryTextSizePx}px`;
  topRatioValue.textContent = `${topPercent}%`;
  paddingValue.textContent = `${paddingPx}px`;
  floatingWindowHeaderHeightValue.textContent = `${floatingWindowHeaderHeightPx}px`;
  moduleTitleFontValue.textContent = nodeUiDevSelectLabel(
    nodeUiDevSettingControls.find((definition) => definition.key === "moduleTitleFont"),
    moduleTitleFont,
  );
  moduleTitleHeightValue.textContent = `${moduleTitleHeightPx}px`;
  moduleTitleTextFillValue.textContent = `${moduleTitleTextFillPercent}%`;
  moduleIoSectionHeightValue.textContent = `${moduleIoSectionHeightPx}px`;
  moduleNodeSizeValue.textContent = `${moduleNodeSizePercent}%`;
  sliderWidthValue.textContent = `${sliderWidthPercent}%`;
  sliderHeightValue.textContent = `${sliderHeightPx}px`;
  sliderLabelColorValue.textContent = sliderLabelColor;
  sliderValueColorValue.textContent = sliderValueColor;
  sliderUnitColorValue.textContent = sliderUnitColor;
  sliderFillHoverColorValue.textContent = sliderFillHoverColor;
  sliderFillHoverAlphaValue.textContent = `${sliderFillHoverAlphaPercent}%`;
  nodeGlowSizeValue.textContent = `${nodeGlowSizePercent}%`;
  wirePatchPointSizeValue.textContent = `${wirePatchPointSizePercent}%`;
  wireThicknessValue.textContent = `${wireThicknessPercent}%`;
  traceWireThicknessValue.textContent = `${traceWireThicknessPx}px`;
  choiceSlideEmptyBorderValue.textContent = `${choiceSlideEmptyBorderPx}px`;
  choiceDividerHeightValue.textContent = `${choiceDividerHeightPx}px`;
  bypassIconSizeValue.textContent = `${bypassIconSizePercent}%`;
  bypassIconGlowSpreadValue.textContent = `${bypassIconGlowSpreadPercent}%`;
  bypassIconGlowColorInput.value = bypassIconGlowColor;
  bypassIconGlowColorValue.textContent = bypassIconGlowColor;
  bypassIconOnColorInput.value = bypassIconOnColor;
  bypassIconOnColorValue.textContent = bypassIconOnColor;
  bypassOnBackgroundColorInput.value = bypassOnBackgroundColor;
  bypassOnBackgroundColorValue.textContent = bypassOnBackgroundColor;
  bypassOffBackgroundColorInput.value = bypassOffBackgroundColor;
  bypassOffBackgroundColorValue.textContent = bypassOffBackgroundColor;
  moveSymbolSizeValue.textContent = `${moveSymbolSizePercent}%`;
  closeIconSizeValue.textContent = `${closeIconSizePercent}%`;
  bypassIconPreview.style.setProperty(
    "--node-ui-dev-symbol-preview-size",
    String(bypassIconSizePercent / 100),
  );
  bypassIconPreview.style.setProperty(
    "--node-ui-dev-bypass-preview-size",
    String(bypassIconSizePercent / 100),
  );
  bypassIconPreview.style.setProperty(
    "--node-ui-dev-bypass-preview-glow-spread",
    String(bypassIconGlowSpreadPercent / 100),
  );
  bypassIconPreview.style.setProperty("--node-ui-dev-bypass-preview-glow-color", bypassIconGlowColor);
  bypassIconPreview.style.setProperty("--node-ui-dev-bypass-preview-on-color", bypassIconOnColor);
  bypassIconPreview.style.setProperty("--node-ui-dev-bypass-preview-bg", bypassOnBackgroundColor);
  moveSymbolPreview.style.setProperty("--node-ui-dev-symbol-preview-size", String(moveSymbolSizePercent / 100));
  closeIconPreview.style.setProperty("--node-ui-dev-symbol-preview-size", String(closeIconSizePercent / 100));
  document
    .getElementById("nodeWiringPanel")
    ?.classList.toggle("settings-header-layout-debug", highlightInput.checked);
  syncNodeUiDevNodeColorControls();
  syncNodeUserUiSettingsMirrorControls();
  applyNodeGraphPatchToDom();
  updateNodeGraphGridHeatmap();
  drawNodeGraphWires();
  scheduleNodeSettingsHeaderTextFit();
  scheduleNodeLiveToggleTextFit();
}
