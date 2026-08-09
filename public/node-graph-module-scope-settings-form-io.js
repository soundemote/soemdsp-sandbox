// Display Settings form I/O: defaults, normalize, read/write form, color widgets, gradients.
// Peeled from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after scope-settings-controls.js, before field-edit / apply / window.

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
  // Knob: image layers + rotate flags (span/readout are form fields).
  if (type === "knobFace") {
    if (typeof bindNodeGraphKnobFaceDisplaySettingsEvents === "function") {
      bindNodeGraphKnobFaceDisplaySettingsEvents(host);
    }
    if (typeof syncNodeGraphKnobFaceDisplaySettingsControls === "function") {
      syncNodeGraphKnobFaceDisplaySettingsControls(host);
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
    const targetNode = !nodeGraphTraceDisplaySettingsEditingTraceDefaults()
      && !nodeGraphTraceDisplaySettingsEditingGlobal()
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())
      : null;
    const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(targetNode?.type)
      : nodeGraphScope2dTraceSettingsDefaults;
    return normalizeNodeGraphScope2dTraceSettings(typeDefaults, typeDefaults);
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
  if (type === "evolveFieldFace") {
    return typeof normalizeNodeGraphEvolveFieldSettings === "function"
      ? normalizeNodeGraphEvolveFieldSettings()
      : { background: "#000004", gradientStops: [] };
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
    const node = nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId());
    const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(node?.type)
      : null;
    return normalizeNodeGraphScope2dTraceSettings(settings, typeDefaults);
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
  if (type === "evolveFieldFace") {
    return typeof normalizeNodeGraphEvolveFieldSettings === "function"
      ? normalizeNodeGraphEvolveFieldSettings(settings)
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
    const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(node?.type)
      : null;
    return normalizeNodeGraphScope2dTraceSettings(node.traceDisplaySettings, typeDefaults);
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
  if (settingsSchema === "evolveFieldFace") {
    return typeof nodeGraphEvolveFieldSettingsForNode === "function"
      ? nodeGraphEvolveFieldSettingsForNode(node)
      : normalizeNodeGraphEvolveFieldSettings?.(node?.traceDisplaySettings);
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
  // Per-node Trace schema: Output stereo, Display, stereoTracePorts modules.
  // Plain Trace modules use the shared global bucket (editingTraceDefaults).
  if (
    settingsSchema === "trace" &&
    (typeof nodeGraphModuleKeepsPerNodeTraceDisplaySettings === "function"
      ? nodeGraphModuleKeepsPerNodeTraceDisplaySettings(node?.type)
      : (node?.type === "output" || node?.type === "visualOscilloscope"))
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
      if (key === "arcFill") {
        next.arcFill = input.value;
      }
      if (key === "arcTrack") {
        next.arcTrack = input.value;
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
  // Sync reconciliation — must key off which control is actually on the form.
  // Mono Trace only shows the Sync checkbox; syncChannel stays on `next` as a
  // stale default ("off"). That string is truthy, so the old branch always
  // forced sourceSync=false and made Sync impossible to enable on DSF / LFO
  // Trace faces / other mono displays.
  // Stereo Output shows the Sync channel select (off/left/right/mono).
  const hasSyncChannelControl = Boolean(
    root?.querySelector?.(`[data-trace-display-choice="syncChannel"]`),
  );
  const hasSourceSyncControl = Boolean(
    root?.querySelector?.(`[data-trace-display-toggle="sourceSync"]`),
  );
  if (hasSyncChannelControl) {
    const channel = String(next.syncChannel || "off").toLowerCase().trim();
    next.syncChannel = ["left", "right", "mono", "off"].includes(channel) ? channel : "off";
    next.sourceSync = next.syncChannel !== "off";
  } else if (hasSourceSyncControl) {
    next.syncChannel = next.sourceSync ? "mono" : "off";
  } else if (next.sourceSync === true) {
    next.syncChannel = next.syncChannel && next.syncChannel !== "off"
      ? next.syncChannel
      : "mono";
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
  if (key === "arcFill") {
    return settings.arcFill;
  }
  if (key === "arcTrack") {
    return settings.arcTrack;
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
  if (formType === "knobFace" && typeof syncNodeGraphKnobFaceDisplaySettingsControls === "function") {
    syncNodeGraphKnobFaceDisplaySettingsControls(root);
  }
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


// Control mapping + value clamps live in node-graph-module-scope-settings-controls.js


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
    return new URL("color-widget.js?v=hue-marker-1", script.src).href;
  }
  // Fallbacks: site root /public/, then document-relative public/
  try {
    return new URL("/public/color-widget.js?v=hue-marker-1", window.location.origin).href;
  } catch {
    return new URL("public/color-widget.js?v=hue-marker-1", window.location.href).href;
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
    if (nodeGraphTraceDisplaySettingsFormType() === "rgbFractalFace") {
      return "Bg";
    }
    return "Bg";
  }
  if (field === "ghostColor") {
    return "Ghost ink";
  }
  if (field === "dot1Color") {
    if (nodeGraphTraceDisplaySettingsFormType() === "numberReadout") {
      return "Light";
    }
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
