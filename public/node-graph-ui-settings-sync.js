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
  { property: "--node-slider-ghost-color", prefix: "nodeUiDevSliderGhostFill", fallback: [262, 100, 76, 38] },
]);

function syncNodeUiDevSnakeSelectColor() {
  const workspace = document.getElementById("nodeGraphWorkspace");
  if (!workspace) {
    return;
  }
  const hue = nodeUiDevSliderFillChannel("nodeUiDevSnakeSelectHue", 191, 360);
  const brightness = nodeUiDevSliderFillChannel("nodeUiDevSnakeSelectBrightness", 50, 100);
  const css = typeof nodeGraphHueBrightnessCss === "function"
    ? nodeGraphHueBrightnessCss(hue, brightness / 100)
    : `hsl(${hue} 100% 50%)`;
  workspace.style.setProperty("--node-selection-hit-trail-color", css);
  const hueOut = document.getElementById("nodeUiDevSnakeSelectHueValue");
  if (hueOut) {
    hueOut.textContent = `${hue}deg`;
  }
  const brightOut = document.getElementById("nodeUiDevSnakeSelectBrightnessValue");
  if (brightOut) {
    brightOut.textContent = `${brightness}%`;
  }
}

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
  for (const id of ["nodeUiDevSnakeSelectHue", "nodeUiDevSnakeSelectBrightness"]) {
    const input = document.getElementById(id);
    if (!input || input.dataset.snakeSelectColorBound === "true") {
      continue;
    }
    input.dataset.snakeSelectColorBound = "true";
    input.addEventListener("input", syncNodeUiDevSnakeSelectColor);
    input.addEventListener("change", syncNodeUiDevSnakeSelectColor);
  }
  syncNodeUiDevSliderFillColorControls();
  syncNodeUiDevSnakeSelectColor();
}

// Unselected plate outline. CSS-only — do not fold into the header sync
// (that rebuilds the patch / heatmap / wires on every input event).
function syncNodeUiDevModuleIdleStroke() {
  const thicknessInput = document.getElementById("nodeUiDevModuleStrokeThickness");
  const thicknessOut = document.getElementById("nodeUiDevModuleStrokeThicknessValue");
  const colorInput = document.getElementById("nodeUiDevModuleStrokeColor");
  const colorOut = document.getElementById("nodeUiDevModuleStrokeColorValue");
  const alphaInput = document.getElementById("nodeUiDevModuleStrokeAlpha");
  const alphaOut = document.getElementById("nodeUiDevModuleStrokeAlphaValue");
  const selectedColorInput = document.getElementById("nodeUiDevModuleSelectedStrokeColor");
  const selectedColorOut = document.getElementById("nodeUiDevModuleSelectedStrokeColorValue");
  const selectedAlphaInput = document.getElementById("nodeUiDevModuleSelectedStrokeAlpha");
  const selectedAlphaOut = document.getElementById("nodeUiDevModuleSelectedStrokeAlphaValue");
  const thicknessRaw = Number(thicknessInput?.value);
  const thicknessPx = Number.isFinite(thicknessRaw)
    ? Math.max(0, Math.min(8, thicknessRaw))
    : 1;
  const color = normalizeNodeUiDevColor(colorInput?.value, "#ffffff");
  const alphaRaw = Number(alphaInput?.value);
  const alphaPercent = Number.isFinite(alphaRaw)
    ? Math.max(0, Math.min(100, alphaRaw))
    : 50;
  const selectedColor = normalizeNodeUiDevColor(selectedColorInput?.value, "#e2a86d");
  const selectedAlphaRaw = Number(selectedAlphaInput?.value);
  const selectedAlphaPercent = Number.isFinite(selectedAlphaRaw)
    ? Math.max(0, Math.min(100, selectedAlphaRaw))
    : 100;
  if (thicknessInput && !thicknessInput.matches(":active")) {
    thicknessInput.value = String(thicknessPx);
  }
  if (colorInput) {
    colorInput.value = color;
  }
  if (alphaInput && !alphaInput.matches(":active")) {
    alphaInput.value = String(alphaPercent);
  }
  if (thicknessOut) {
    thicknessOut.textContent = `${thicknessPx}px`;
  }
  if (colorOut) {
    colorOut.textContent = color;
  }
  if (alphaOut) {
    alphaOut.textContent = `${alphaPercent}%`;
  }
  if (selectedColorInput) {
    selectedColorInput.value = selectedColor;
  }
  if (selectedAlphaInput && !selectedAlphaInput.matches(":active")) {
    selectedAlphaInput.value = String(selectedAlphaPercent);
  }
  if (selectedColorOut) {
    selectedColorOut.textContent = selectedColor;
  }
  if (selectedAlphaOut) {
    selectedAlphaOut.textContent = `${selectedAlphaPercent}%`;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  workspace?.style.setProperty("--node-module-idle-stroke-width", `${thicknessPx}px`);
  workspace?.style.setProperty(
    "--node-module-idle-stroke",
    `rgb(${nodeUiDevHexColorToRgbTriplet(color)} / ${alphaPercent / 100})`,
  );
  workspace?.style.setProperty(
    "--node-module-selected-stroke",
    `rgb(${nodeUiDevHexColorToRgbTriplet(selectedColor)} / ${selectedAlphaPercent / 100})`,
  );
}

function syncNodeUiDevModuleRoundness() {
  const roundEl = document.getElementById("nodeUiDevModuleRoundness");
  const roundOut = document.getElementById("nodeUiDevModuleRoundnessValue");
  const shapeEl = document.getElementById("nodeUiDevModuleCornerShape");
  const workspace = document.getElementById("nodeGraphWorkspace");
  const percent = Math.max(0, Math.min(100, Number(roundEl?.value) || 0));
  const shape = String(shapeEl?.value || "pill").toLowerCase() === "squircle" ? "squircle" : "pill";
  if (roundEl && !roundEl.matches(":active")) {
    roundEl.value = String(percent);
  }
  if (shapeEl) {
    shapeEl.value = shape;
  }
  if (roundOut) {
    roundOut.textContent = `${percent}%`;
  }
  for (const btn of document.querySelectorAll("[data-module-corner-shape]")) {
    const active = btn.getAttribute("data-module-corner-shape") === shape;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  workspace?.style.setProperty("--node-module-roundness-ratio", String(percent / 100));
  workspace?.style.setProperty("--node-module-corner-shape", shape === "squircle" ? "squircle" : "round");
}

function bindNodeUiDevModuleRoundness() {
  const roundEl = document.getElementById("nodeUiDevModuleRoundness");
  if (roundEl && roundEl.dataset.moduleRoundnessBound !== "true") {
    roundEl.dataset.moduleRoundnessBound = "true";
    roundEl.addEventListener("input", syncNodeUiDevModuleRoundness);
    roundEl.addEventListener("change", syncNodeUiDevModuleRoundness);
  }
  const host = document.getElementById("nodeUiDevHelper");
  if (host && host.dataset.moduleCornerShapeBound !== "true") {
    host.dataset.moduleCornerShapeBound = "true";
    host.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-module-corner-shape]");
      if (!btn || !host.contains(btn)) {
        return;
      }
      event.preventDefault();
      const shape = btn.getAttribute("data-module-corner-shape") === "squircle" ? "squircle" : "pill";
      const input = document.getElementById("nodeUiDevModuleCornerShape");
      if (input) {
        input.value = shape;
      }
      syncNodeUiDevModuleRoundness();
      if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
        scheduleNodeUiDevSettingsAutosave();
      }
    });
  }
  syncNodeUiDevModuleRoundness();
}

function bindNodeUiDevModuleIdleStroke() {
  for (const id of [
    "nodeUiDevModuleStrokeThickness",
    "nodeUiDevModuleStrokeColor",
    "nodeUiDevModuleStrokeAlpha",
    "nodeUiDevModuleSelectedStrokeColor",
    "nodeUiDevModuleSelectedStrokeAlpha",
  ]) {
    const input = document.getElementById(id);
    if (!input || input.dataset.moduleIdleStrokeBound === "true") {
      continue;
    }
    input.dataset.moduleIdleStrokeBound = "true";
    input.addEventListener("input", syncNodeUiDevModuleIdleStroke);
    input.addEventListener("change", syncNodeUiDevModuleIdleStroke);
  }
  syncNodeUiDevModuleIdleStroke();
}

/**
 * Room-dimmer mouse cutout + size/softness/shape.
 * Separate from the big header sync so a missing unrelated control cannot
 * block dimmer updates (same pattern as slider fill colors).
 */
function syncNodeUiDevDimmerCutoutControls() {
  const mouseEl = document.getElementById("nodeUiDevDimmerCutoutMouse");
  const sizeEl = document.getElementById("nodeUiDevDimmerMouseSize");
  const sizeOut = document.getElementById("nodeUiDevDimmerMouseSizeValue");
  const softEl = document.getElementById("nodeUiDevDimmerMouseSoftness");
  const softOut = document.getElementById("nodeUiDevDimmerMouseSoftnessValue");
  const shapeEl = document.getElementById("nodeUiDevDimmerMouseShape");
  const shapeOut = document.getElementById("nodeUiDevDimmerMouseShapeValue");

  let mouseOn = false;
  let size = 56;
  let soft = 25;
  let shape = 0;

  if (mouseEl) mouseOn = Boolean(mouseEl.checked);
  if (sizeEl) {
    size = Math.max(8, Math.min(240, Number(sizeEl.value) || 56));
    if (!sizeEl.matches(":active")) sizeEl.value = String(size);
  }
  if (softEl) {
    soft = Math.max(0, Math.min(100, Number(softEl.value) || 0));
    if (!softEl.matches(":active")) softEl.value = String(soft);
  }
  if (shapeEl) {
    shape = Math.max(0, Math.min(100, Number(shapeEl.value) || 0));
    if (!shapeEl.matches(":active")) shapeEl.value = String(shape);
  }

  if (sizeOut) sizeOut.textContent = `${size}px`;
  if (softOut) softOut.textContent = `${soft}%`;
  if (shapeOut) {
    shapeOut.textContent = shape <= 8
      ? "square"
      : (shape >= 92 ? "circle" : (shape < 55 ? "squircle" : "round"));
  }

  const ws = document.getElementById("nodeGraphWorkspace");
  ws?.classList.toggle("dimmer-cutout-mouse-enabled", mouseOn);

  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    nodeGraphMvp.dimmerCutoutMouseEnabled = mouseOn;
    nodeGraphMvp.dimmerMouseSize = size;
    nodeGraphMvp.dimmerMouseSoftness = soft;
    nodeGraphMvp.dimmerMouseShape = shape;
  }

  if (typeof setNodeGraphDimmerCutoutOptions === "function") {
    setNodeGraphDimmerCutoutOptions({
      mouse: mouseOn,
      mouseSize: size,
      mouseSoftness: soft,
      mouseShape: shape,
    });
  }
}

function nodeGraphGridVisualScaleFromMultiply(multiply) {
  const n = Math.round(Number(multiply));
  const step = Number.isFinite(n) ? Math.max(1, Math.min(8, n)) : 2;
  return 2 ** (step - 1);
}

function syncNodeUiDevGridDivisionMultiply() {
  const input = document.getElementById("nodeUiDevGridDivisionMultiply");
  const raw = Math.round(Number(input?.value));
  const multiply = Number.isFinite(raw) ? Math.max(1, Math.min(8, raw)) : 2;
  if (input) {
    input.value = String(multiply);
  }
  const scale = nodeGraphGridVisualScaleFromMultiply(multiply);
  const output = document.getElementById("nodeUiDevGridDivisionMultiplyValue");
  if (output) {
    output.textContent = `${scale}×`;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const css = String(scale);
  workspace?.style.setProperty("--node-grid-visual-scale", css);
  document.documentElement.style.setProperty("--node-grid-visual-scale", css);
  if (typeof applyNodeGraphGridVisualCellSize === "function") {
    applyNodeGraphGridVisualCellSize(workspace);
  }
}

function syncNodeUiDevOutletRgbBrightness() {
  const input = document.getElementById("nodeUiDevOutletRgbBrightness");
  const raw = Number(input?.value);
  const brightness = Number.isFinite(raw)
    ? Math.max(0, Math.min(1, raw))
    : 0.75;
  if (input) {
    input.value = String(brightness);
  }
  const output = document.getElementById("nodeUiDevOutletRgbBrightnessValue");
  if (output) {
    output.textContent = brightness.toFixed(2);
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const css = `${Math.round(brightness * 100)}%`;
  workspace?.style.setProperty("--node-outlet-rgb-brightness", css);
  document.documentElement.style.setProperty("--node-outlet-rgb-brightness", css);
}

function syncNodeUiDevInletBlueBrightness() {
  const input = document.getElementById("nodeUiDevInletBlueBrightness");
  const raw = Number(input?.value);
  const brightness = Number.isFinite(raw)
    ? Math.max(0, Math.min(1, raw))
    : 0.75;
  if (input) {
    input.value = String(brightness);
  }
  const output = document.getElementById("nodeUiDevInletBlueBrightnessValue");
  if (output) {
    output.textContent = brightness.toFixed(2);
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  const css = `${Math.round(brightness * 100)}%`;
  workspace?.style.setProperty("--node-inlet-blue-brightness", css);
  document.documentElement.style.setProperty("--node-inlet-blue-brightness", css);
}

function nodeUiDevApplyJackColorVar(inputId, outputId, cssVar, fallback) {
  const input = document.getElementById(inputId);
  const color = typeof normalizeNodeUiDevColor === "function"
    ? normalizeNodeUiDevColor(input?.value, fallback)
    : (String(input?.value || fallback));
  if (input && input.value !== color) {
    input.value = color;
  }
  const output = document.getElementById(outputId);
  if (output) {
    output.textContent = color;
  }
  const workspace = document.getElementById("nodeGraphWorkspace");
  workspace?.style.setProperty(cssVar, color);
  document.documentElement.style.setProperty(cssVar, color);
  return color;
}

function syncNodeUiDevJackColors() {
  const red = nodeUiDevApplyJackColorVar(
    "nodeUiDevJackRgbRed",
    "nodeUiDevJackRgbRedValue",
    "--node-outlet-left-stroke",
    "#f25d5d",
  );
  const green = nodeUiDevApplyJackColorVar(
    "nodeUiDevJackRgbGreen",
    "nodeUiDevJackRgbGreenValue",
    "--node-outlet-mono-stroke",
    "#3ddc84",
  );
  const blue = nodeUiDevApplyJackColorVar(
    "nodeUiDevJackRgbBlue",
    "nodeUiDevJackRgbBlueValue",
    "--node-outlet-right-stroke",
    "#4d8dff",
  );
  const analogIn = nodeUiDevApplyJackColorVar(
    "nodeUiDevJackAnalogIn",
    "nodeUiDevJackAnalogInValue",
    "--node-input-fill",
    "#7fc7d9",
  );
  const analogOut = nodeUiDevApplyJackColorVar(
    "nodeUiDevJackAnalogOut",
    "nodeUiDevJackAnalogOutValue",
    "--node-output-fill",
    "#e2a86d",
  );
  nodeUiDevApplyJackColorVar(
    "nodeUiDevJackDigital",
    "nodeUiDevJackDigitalValue",
    "--node-digital-fill",
    "#ffffff",
  );
  const workspace = document.getElementById("nodeGraphWorkspace");
  const root = document.documentElement;
  const setBoth = (name, value) => {
    workspace?.style.setProperty(name, value);
    root.style.setProperty(name, value);
  };
  /* Connected-only type colors. Do not write unused crescent / idle stroke —
     unused I/O and param jacks share --node-port-idle-crescent-stroke in CSS. */
  setBoth("--node-input-stroke", analogIn);
  setBoth("--node-output-stroke", analogOut);
  setBoth("--node-inlet-blue-stroke", analogIn);
  workspace?.style.removeProperty("--node-port-idle-crescent-stroke");
  root.style.removeProperty("--node-port-idle-crescent-stroke");
  workspace?.style.removeProperty("--node-port-idle-stroke");
  root.style.removeProperty("--node-port-idle-stroke");
  workspace?.style.removeProperty("--node-port-crescent-stroke");
  root.style.removeProperty("--node-port-crescent-stroke");
  const fillIn = document.getElementById("nodeUiDevInputFillColor");
  const fillOut = document.getElementById("nodeUiDevOutputFillColor");
  if (fillIn) fillIn.value = analogIn;
  if (fillOut) fillOut.value = analogOut;
  const strokeIn = document.getElementById("nodeUiDevInputStrokeColor");
  const strokeOut = document.getElementById("nodeUiDevOutputStrokeColor");
  if (strokeIn) strokeIn.value = analogIn;
  if (strokeOut) strokeOut.value = analogOut;
  void red;
  void green;
  void blue;
}

function nodeUiDevSpreadRatioFromPercent(value, fallback = 78) {
  const raw = Number(value);
  const percent = Number.isFinite(raw) ? raw : fallback;
  return Math.max(0.4, Math.min(2.2, Math.max(40, Math.min(220, percent)) / 100));
}

function syncNodeUiDevModuleLightGridControls() {
  const lightBrightEl = document.getElementById("nodeUiDevModuleLightBrightness");
  const lightSpreadEl = document.getElementById("nodeUiDevModuleLightSpread");
  const gridBrightEl = document.getElementById("nodeUiDevMinimumGridBrightness");
  const gridSpreadEl = document.getElementById("nodeUiDevGridSpread");
  const lightBrightOut = document.getElementById("nodeUiDevModuleLightBrightnessValue");
  const lightSpreadOut = document.getElementById("nodeUiDevModuleLightSpreadValue");
  const gridBrightOut = document.getElementById("nodeUiDevMinimumGridBrightnessValue");
  const gridSpreadOut = document.getElementById("nodeUiDevGridSpreadValue");

  const lightBright = Math.max(0, Math.min(100, Number(lightBrightEl?.value) || 0));
  const lightSpread = Math.max(40, Math.min(220, Number(lightSpreadEl?.value) || 78));
  const gridBright = Math.max(0, Math.min(100, Number(gridBrightEl?.value) || 0));
  const gridSpread = Math.max(40, Math.min(220, Number(gridSpreadEl?.value) || 78));

  if (lightBrightOut) lightBrightOut.textContent = `${lightBright}%`;
  if (lightSpreadOut) lightSpreadOut.textContent = `${lightSpread}%`;
  if (gridBrightOut) gridBrightOut.textContent = `${gridBright}%`;
  if (gridSpreadOut) gridSpreadOut.textContent = `${gridSpread}%`;

  const ws = document.getElementById("nodeGraphWorkspace");
  ws?.style.setProperty("--node-module-light-brightness", String(lightBright / 100));
  ws?.style.setProperty("--node-module-light-spread", String(nodeUiDevSpreadRatioFromPercent(lightSpread)));
  ws?.style.setProperty("--node-grid-line-alpha", String(gridBright / 100));
  ws?.style.setProperty("--node-grid-reveal-spread", String(nodeUiDevSpreadRatioFromPercent(gridSpread)));
  // Never paint a full-workspace grid. Reveal is radius-around-modules only.
  ws?.style.setProperty("--node-min-grid-brightness-alpha", "0");
  document.getElementById("nodeWiringPanel")?.style.setProperty("--node-min-grid-brightness-alpha", "0");

  if (typeof updateNodeGraphGridHeatmap === "function") {
    updateNodeGraphGridHeatmap({ force: true });
  }
}

function bindNodeUiDevModuleLightGridControls() {
  for (const id of [
    "nodeUiDevModuleLightBrightness",
    "nodeUiDevModuleLightSpread",
    "nodeUiDevMinimumGridBrightness",
    "nodeUiDevGridSpread",
  ]) {
    const input = document.getElementById(id);
    if (!input || input.dataset.lightGridBound === "true") {
      continue;
    }
    input.dataset.lightGridBound = "true";
    input.addEventListener("input", syncNodeUiDevModuleLightGridControls);
    input.addEventListener("change", syncNodeUiDevModuleLightGridControls);
  }
  syncNodeUiDevModuleLightGridControls();
}

function syncNodeUiDevSettingsHeaderControls() {
  // Runs before the early-return guard below so the slider fill colors apply
  // even if some unrelated control is absent from the DOM.
  syncNodeUiDevSliderFillColorControls();
  if (typeof syncNodeUiDevSnakeSelectColor === "function") {
    syncNodeUiDevSnakeSelectColor();
  }
  syncNodeUiDevModuleIdleStroke();
  syncNodeUiDevDimmerCutoutControls();
  syncNodeUiDevOutletRgbBrightness();
  syncNodeUiDevInletBlueBrightness();
  syncNodeUiDevJackColors();
  syncNodeUiDevGridDivisionMultiply();
  syncNodeUiDevModuleLightGridControls();
  const settingsView = document.getElementById("nodeSettingsView");
  const mouseLightEnabledInput = document.getElementById("nodeUiDevMouseLightEnabled");
  const showOriginMarkerInput = document.getElementById("nodeUiDevShowOriginMarker");
  const tooltipTextSizeInput = document.getElementById("nodeUiDevTooltipTextSize");
  const tooltipTextSizeValue = document.getElementById("nodeUiDevTooltipTextSizeValue");
  const minimumGridBrightnessInput = document.getElementById("nodeUiDevMinimumGridBrightness");
  const minimumGridBrightnessValue = document.getElementById("nodeUiDevMinimumGridBrightnessValue");
  const moduleLightSpreadInput = document.getElementById("nodeUiDevModuleLightSpread");
  const moduleLightSpreadValue = document.getElementById("nodeUiDevModuleLightSpreadValue");
  const moduleGridInsetInput = document.getElementById("nodeUiDevModuleGridInset");
  const moduleGridInsetValue = document.getElementById("nodeUiDevModuleGridInsetValue");
  const gridColorInput = document.getElementById("nodeUiDevGridColor");
  const gridColorValue = document.getElementById("nodeUiDevGridColorValue");
  const workspaceBackgroundColorInput = document.getElementById("nodeUiDevWorkspaceBackgroundColor");
  const workspaceBackgroundColorValue = document.getElementById("nodeUiDevWorkspaceBackgroundColorValue");
  const moduleFillColorInput = document.getElementById("nodeUiDevModuleFillColor");
  const moduleFillColorValue = document.getElementById("nodeUiDevModuleFillColorValue");
  const moduleFillAlphaInput = document.getElementById("nodeUiDevModuleFillAlpha");
  const moduleFillAlphaValue = document.getElementById("nodeUiDevModuleFillAlphaValue");
  const sliderLabelColorInput = document.getElementById("nodeUiDevSliderLabelColor");
  const sliderLabelColorValue = document.getElementById("nodeUiDevSliderLabelColorValue");
  const sliderValueColorInput = document.getElementById("nodeUiDevSliderValueColor");
  const sliderValueColorValue = document.getElementById("nodeUiDevSliderValueColorValue");
  const sliderUnitColorInput = document.getElementById("nodeUiDevSliderUnitColor");
  const sliderUnitColorValue = document.getElementById("nodeUiDevSliderUnitColorValue");
  const traceWireThicknessInput = document.getElementById("nodeUiDevTraceWireThickness");
  const traceWireThicknessValue = document.getElementById("nodeUiDevTraceWireThicknessValue");
  const choiceSlideEmptyBorderInput = document.getElementById("nodeUiDevChoiceSlideEmptyBorder");
  const choiceSlideEmptyBorderValue = document.getElementById("nodeUiDevChoiceSlideEmptyBorderValue");
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
  if (typeof syncNodeUiDevModuleRoundness === "function") {
    syncNodeUiDevModuleRoundness();
  }
  if (typeof scheduleNodeUiDevSettingsAutosave === "function") {
    scheduleNodeUiDevSettingsAutosave();
  }
  if (
    !settingsView ||
    !mouseLightEnabledInput ||
    !showOriginMarkerInput ||
    !tooltipTextSizeInput ||
    !tooltipTextSizeValue ||
    !minimumGridBrightnessInput ||
    !minimumGridBrightnessValue ||
    !moduleLightSpreadInput ||
    !moduleLightSpreadValue ||
    !moduleGridInsetInput ||
    !moduleGridInsetValue ||
    !gridColorInput ||
    !gridColorValue ||
    !workspaceBackgroundColorInput ||
    !workspaceBackgroundColorValue ||
    !moduleFillColorInput ||
    !moduleFillColorValue ||
    !moduleFillAlphaInput ||
    !moduleFillAlphaValue ||
    !sliderLabelColorInput ||
    !sliderLabelColorValue ||
    !sliderValueColorInput ||
    !sliderValueColorValue ||
    !sliderUnitColorInput ||
    !sliderUnitColorValue ||
    !traceWireThicknessInput ||
    !traceWireThicknessValue ||
    !choiceSlideEmptyBorderInput ||
    !choiceSlideEmptyBorderValue ||
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
    !bypassOffBackgroundColorValue
  ) {
    return;
  }

  const mouseLightEnabled = Boolean(mouseLightEnabledInput.checked);
  const showOriginMarker = Boolean(showOriginMarkerInput.checked);
  // Max ceiling for tip fit-to-box (not a fixed display size).
  const tooltipTextSizePx = Math.max(12, Math.min(96, Number(tooltipTextSizeInput.value) || 64));
  const minimumGridBrightnessPercent = Math.max(
    0,
    Math.min(100, Number(minimumGridBrightnessInput.value) || 0),
  );
  const moduleLightSpreadPercent = Math.max(40, Math.min(220, Number(moduleLightSpreadInput.value) || 78));
  const moduleGridInsetPx = Math.max(0, Math.min(20, Number(moduleGridInsetInput.value) || 0));
  const gridColor = normalizeNodeUiDevColor(gridColorInput.value, "#ffffff");
  const workspaceBackgroundColor = normalizeNodeUiDevColor(workspaceBackgroundColorInput.value, "#1d1b1b");
  const moduleFillColor = normalizeNodeUiDevColor(moduleFillColorInput.value, "#171a1f");
  const moduleFillAlphaRaw = Number(moduleFillAlphaInput.value);
  const moduleFillAlphaPercent = Math.max(
    0,
    Math.min(100, Number.isFinite(moduleFillAlphaRaw) ? moduleFillAlphaRaw : 100),
  );
  const sliderLabelColor = normalizeNodeUiDevColor(sliderLabelColorInput.value, "#cfdde5");
  const sliderValueColor = normalizeNodeUiDevColor(sliderValueColorInput.value, "#ffffff");
  const sliderUnitColor = normalizeNodeUiDevColor(sliderUnitColorInput.value, "#7fc7d9");
  const traceWireThicknessPx = Math.max(1, Math.min(12, Number(traceWireThicknessInput.value) || 1));
  const choiceSlideEmptyBorderPx = Math.max(0, Math.min(8, Number(choiceSlideEmptyBorderInput.value) || 0));
  const bypassIconSizePercent = Math.max(0, Math.min(100, Number(bypassIconSizeInput.value) || 0));
  const bypassIconGlowSpreadPercent = Math.max(
    0,
    Math.min(200, Number(bypassIconGlowSpreadInput.value) || 0),
  );
  const bypassIconGlowColor = normalizeNodeUiDevColor(bypassIconGlowColorInput.value, "#f25d5d");
  const bypassIconOnColor = normalizeNodeUiDevColor(bypassIconOnColorInput.value, "#f7b758");
  const bypassOnBackgroundColor = normalizeNodeUiDevColor(bypassOnBackgroundColorInput.value, "#5c1818");
  const bypassOffBackgroundColor = normalizeNodeUiDevColor(bypassOffBackgroundColorInput.value, "#000000");
  document
    .getElementById("nodeWiringPanel")
    ?.style.setProperty("--node-tooltip-text-size", `${tooltipTextSizePx}px`);
  // Tip text scales to the box; re-fit when the max ceiling changes.
  if (typeof fitNodeInteractionHelpText === "function") {
    fitNodeInteractionHelpText(document.getElementById("nodeInteractionHelp"));
  }
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-amount", mouseLightEnabled ? "0.79" : "0");
  document
    .getElementById("nodeGraphWorkspace")
    ?.classList.toggle("origin-marker-visible", showOriginMarker);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-spread", "0.05");
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-mouse-light-color-rgb", "127 199 217");
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-module-grid-inset", `${moduleGridInsetPx}px`);
  gridColorInput.value = gridColor;
  workspaceBackgroundColorInput.value = workspaceBackgroundColor;
  moduleFillColorInput.value = moduleFillColor;
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-grid-color-rgb", nodeUiDevHexColorToRgbTriplet(gridColor));
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-workspace-bg", workspaceBackgroundColor);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty(
      "--node-module-fill",
      `rgb(${nodeUiDevHexColorToRgbTriplet(moduleFillColor)} / ${moduleFillAlphaPercent / 100})`,
    );
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.removeProperty("--node-port-size-ratio");
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.removeProperty("--node-slider-readout-height");
  sliderLabelColorInput.value = sliderLabelColor;
  sliderValueColorInput.value = sliderValueColor;
  sliderUnitColorInput.value = sliderUnitColor;
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
    ?.style.setProperty("--node-trace-wire-thickness", `${traceWireThicknessPx}px`);
  document
    .getElementById("nodeGraphWorkspace")
    ?.style.setProperty("--node-choice-slide-empty-border", `${choiceSlideEmptyBorderPx}`);
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
  tooltipTextSizeValue.textContent = `${tooltipTextSizePx}px`;
  minimumGridBrightnessValue.textContent = `${minimumGridBrightnessPercent}%`;
  moduleLightSpreadValue.textContent = `${moduleLightSpreadPercent}%`;
  moduleGridInsetValue.textContent = `${moduleGridInsetPx}px`;
  gridColorValue.textContent = gridColor;
  workspaceBackgroundColorValue.textContent = workspaceBackgroundColor;
  moduleFillColorValue.textContent = moduleFillColor;
  moduleFillAlphaValue.textContent = `${moduleFillAlphaPercent}%`;
  sliderLabelColorValue.textContent = sliderLabelColor;
  sliderValueColorValue.textContent = sliderValueColor;
  sliderUnitColorValue.textContent = sliderUnitColor;
  traceWireThicknessValue.textContent = `${traceWireThicknessPx}px`;
  choiceSlideEmptyBorderValue.textContent = `${choiceSlideEmptyBorderPx}px`;
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
  syncNodeUserUiSettingsMirrorControls();
  applyNodeGraphPatchToDom();
  updateNodeGraphGridHeatmap();
  drawNodeGraphWires();
  scheduleNodeSettingsHeaderTextFit();
  scheduleNodeLiveToggleTextFit();
}
