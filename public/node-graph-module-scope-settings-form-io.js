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
  if (typeof nodeGraphDisplaySettingsShowsStampPreview === "function"
    && nodeGraphDisplaySettingsShowsStampPreview(type)
    && typeof syncNodeGraphStampPreview === "function") {
    syncNodeGraphStampPreview(host, node?.traceDisplaySettings || {});
  }
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
  if (type === "keypadFace") {
    if (typeof bindNodeGraphKeypadDisplaySettingsBody === "function") {
      bindNodeGraphKeypadDisplaySettingsBody(host);
    }
    if (typeof syncNodeGraphKeypadDisplaySettingsControls === "function") {
      syncNodeGraphKeypadDisplaySettingsControls(
        host,
        typeof normalizeNodeGraphKeypadLayout === "function"
          ? normalizeNodeGraphKeypadLayout(node?.layout)
          : (node?.layout || {}),
      );
    }
  }
  if (type === "toggleButtonFace" || type === "momentaryButtonFace") {
    if (typeof bindNodeGraphPluginButtonDisplaySettingsBody === "function") {
      bindNodeGraphPluginButtonDisplaySettingsBody(host);
    }
    if (typeof syncNodeGraphPluginButtonDisplaySettingsControls === "function") {
      syncNodeGraphPluginButtonDisplaySettingsControls(
        host,
        typeof nodeGraphPluginButtonDisplaySettingsForNode === "function"
          ? nodeGraphPluginButtonDisplaySettingsForNode(node)
          : (node?.traceDisplaySettings || {}),
      );
    }
  }
  if (type === "phosphorWaveform") {
    if (node?.id && typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
      nodeGraphMvp.phosphorWaveformSettingsTargetNode = String(node.id);
    }
    if (typeof bindNodeGraphPhosphorWaveformDisplaySettingsBody === "function") {
      bindNodeGraphPhosphorWaveformDisplaySettingsBody(host);
    }
    if (typeof renderNodeGraphPhosphorWaveformSettingsWindow === "function") {
      renderNodeGraphPhosphorWaveformSettingsWindow();
    }
  }
  if (type === "limiterGainFace") {
    if (typeof bindNodeGraphLimiterGainDisplaySettingsBody === "function") {
      bindNodeGraphLimiterGainDisplaySettingsBody(host);
    }
    if (typeof syncNodeGraphLimiterGainDisplaySettingsControls === "function") {
      syncNodeGraphLimiterGainDisplaySettingsControls(
        host,
        typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
          ? normalizeNodeGraphLimiterGainFaceSettings(node?.traceDisplaySettings)
          : (node?.traceDisplaySettings || {}),
      );
    }
  }
  if (type === "portalFace") {
    if (typeof bindNodeGraphPortalDisplaySettingsBody === "function") {
      bindNodeGraphPortalDisplaySettingsBody(host);
    }
    if (typeof syncNodeGraphPortalDisplaySettingsControls === "function") {
      syncNodeGraphPortalDisplaySettingsControls(
        host,
        typeof nodeGraphPortalDisplaySettingsForNode === "function"
          ? nodeGraphPortalDisplaySettingsForNode(node)
          : { channel: 0 },
      );
    }
  }
  if (type === "textBoxFace") {
    if (typeof bindNodeGraphTextBoxDisplaySettingsBody === "function") {
      bindNodeGraphTextBoxDisplaySettingsBody(host);
    }
    if (typeof syncNodeGraphTextBoxDisplaySettingsControls === "function") {
      syncNodeGraphTextBoxDisplaySettingsControls(
        host,
        typeof normalizeNodeGraphTextBoxLayout === "function"
          ? normalizeNodeGraphTextBoxLayout(node?.layout)
          : (node?.layout || {}),
      );
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
  if (type === "keyboardControllerFace") {
    if (typeof bindNodeGraphKeyboardControllerFaceDisplaySettingsBody === "function") {
      bindNodeGraphKeyboardControllerFaceDisplaySettingsBody(host);
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
        // Multi-select: reset every XY Pad targeted by this Display Settings panel.
        const multiIds = typeof nodeGraphTraceDisplaySettingsActiveTargetIds === "function"
          ? nodeGraphTraceDisplaySettingsActiveTargetIds()
          : [];
        const fallbackId = popover.dataset.displaySettingsTargetNode
          || nodeGraphMvp?.traceDisplaySettingsTargetNode
          || node?.id
          || "";
        const ids = multiIds.length
          ? multiIds
          : (fallbackId ? [String(fallbackId)] : []);
        if (typeof nodeGraphXyPadResetCanvas === "function") {
          for (const id of ids) {
            if (id) nodeGraphXyPadResetCanvas(id);
          }
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
  bindNodeGraphHueTitleSteppers(host);
  syncNodeGraphHueTitleSteppers(host);
  // Packing latches (Full Dot Economy | Dots only | Clear): fit labels to cells.
  if (typeof AppLatchButton !== "undefined") {
    AppLatchButton.observeAll(host);
    AppLatchButton.scheduleFit(host);
  }
}

/** Read a Display Settings toggle (checkbox or app latch button). */
function nodeGraphDisplaySettingsReadToggleElement(el) {
  if (!el) {
    return undefined;
  }
  if (el.matches?.("input[type='checkbox']") || el.tagName === "INPUT") {
    return Boolean(el.checked);
  }
  if (typeof AppLatchButton !== "undefined" && AppLatchButton.isLatchButton(el)) {
    return AppLatchButton.isOn(el);
  }
  return el.getAttribute("aria-pressed") === "true" || el.dataset?.latchOn === "1";
}

/** Write a Display Settings toggle (checkbox or app latch button). */
function nodeGraphDisplaySettingsWriteToggleElement(el, on) {
  if (!el) {
    return;
  }
  if (el.matches?.("input[type='checkbox']") || el.tagName === "INPUT") {
    el.checked = Boolean(on);
    return;
  }
  if (typeof AppLatchButton !== "undefined" && AppLatchButton.isLatchButton(el)) {
    AppLatchButton.setOn(el, on);
    AppLatchButton.fitLabel(el);
    return;
  }
  el.setAttribute("aria-pressed", on ? "true" : "false");
  if (el.dataset) {
    el.dataset.latchOn = on ? "1" : "0";
  }
  el.classList?.toggle?.("is-on", Boolean(on));
  el.classList?.toggle?.("is-off", !on);
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
  if (type === "vectorDot" || type === "pulseDot") {
    return typeof normalizeNodeGraphVectorDotSettings === "function"
      ? normalizeNodeGraphVectorDotSettings(nodeGraphVectorDotSettingsDefaults)
      : { ...nodeGraphVectorDotSettingsDefaults };
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
    const targetNode = typeof nodeGraphPatchNode === "function"
      && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())
      : null;
    const defaults = typeof nodeGraphNumberReadoutDefaultsForNode === "function"
      ? nodeGraphNumberReadoutDefaultsForNode(targetNode)
      : nodeGraphNumberReadoutSettingsDefaults;
    return normalizeNodeGraphNumberReadoutSettings(defaults, defaults);
  }
  if (type === "knobFace") {
    return normalizeNodeGraphKnobFaceDisplaySettings(
      nodeGraphKnobFaceDisplaySettingsDefaults,
    );
  }
  if (type === "portalFace") {
    return { channel: 0 };
  }
  if (type === "roundShapeFace" || type === "basicShapeFace") {
    return typeof normalizeNodeGraphRoundShapeFaceSettings === "function"
      ? normalizeNodeGraphRoundShapeFaceSettings()
      : {
        lineHue: 165,
        lineBrightness: 0.5,
        lineThickness: 2,
        lineBlur: 0,
        dotHue: 165,
        dotBrightness: 1,
        dotThickness: 5,
        backgroundHue: 200,
        backgroundBrightness: 0.03,
        pixelDensity: 1,
        strokeColor: "#00ffd0",
        dotColor: "#00ffd0",
        backgroundColor: "#00aaff",
      };
  }
  if (type === "toggleButtonFace" || type === "momentaryButtonFace") {
    return typeof normalizeNodeGraphPluginButtonDisplaySettings === "function"
      ? normalizeNodeGraphPluginButtonDisplaySettings()
      : { ...(typeof NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS !== "undefined" ? NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS : {}) };
  }
  if (type === "keypadFace") {
    return typeof normalizeNodeGraphKeypadLayout === "function"
      ? normalizeNodeGraphKeypadLayout()
      : {
        backgroundColor: "#f4f3f0",
        buttonColor: "#f3f1ec",
        downColor: "#c4bdb3",
        hoverColor: "#ddd9d2",
        buttonHeight: 0.94,
        buttonSize: 1,
        buttonWidth: 0.94,
        font: "poiret-one",
        kind: "keypad",
        strokeColor: "#2d2d2d",
        textColor: "#2d2d2d",
        textSize: 0.55,
        textWeight: 400,
      };
  }
  if (type === "phosphorWaveform") {
    return typeof normalizeNodeGraphPhosphorWaveformSettings === "function"
      ? normalizeNodeGraphPhosphorWaveformSettings()
      : (typeof nodeGraphPhosphorWaveformDefaultSettings !== "undefined"
        ? { ...nodeGraphPhosphorWaveformDefaultSettings }
        : {});
  }
  if (type === "limiterGainFace") {
    return typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
      ? normalizeNodeGraphLimiterGainFaceSettings()
      : {
        backgroundColor: "#020407",
        historySeconds: 2,
        hue: 42,
        lineBrightness: 0.5,
        lineThickness: 2,
      };
  }
  if (type === "textBoxFace") {
    return typeof normalizeNodeGraphTextBoxLayout === "function"
      ? normalizeNodeGraphTextBoxLayout()
      : {
        backgroundColor: "#020407",
        horizontalAlign: "center",
        kind: "textBox",
        text: "",
        textColor: "#f3f1ec",
        textMode: "singleLine",
        textSizePercent: 100,
        verticalAlignPercent: 0,
      };
  }
  if (type === "patchFace") {
    return normalizeNodeGraphPatchFaceDisplaySettings(
      typeof nodeGraphPatchFaceDisplaySettingsDefaults !== "undefined"
        ? nodeGraphPatchFaceDisplaySettingsDefaults
        : {},
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
  if (type === "vectorRgbFace") {
    return typeof normalizeNodeGraphVectorRgbSettings === "function"
      ? normalizeNodeGraphVectorRgbSettings()
      : { background: "#000000" };
  }
  if (type === "rasterRgbFace") {
    return typeof normalizeNodeGraphRasterRgbSettings === "function"
      ? normalizeNodeGraphRasterRgbSettings()
      : { background: "#000000", squareRatio: false, screenPadding: 0, rounding: 0, screenShape: "pill" };
  }
  if (type === "gradientVectorscopeFace") {
    return typeof normalizeNodeGraphGradientVectorscopeSettings === "function"
      ? normalizeNodeGraphGradientVectorscopeSettings()
      : { background: "#000004", rotate90: false };
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
  if (type === "vectorDot" || type === "pulseDot") {
    return typeof normalizeNodeGraphVectorDotSettings === "function"
      ? normalizeNodeGraphVectorDotSettings(settings)
      : (settings || {});
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
    const targetNode = typeof nodeGraphPatchNode === "function"
      && typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())
      : null;
    const defaults = typeof nodeGraphNumberReadoutDefaultsForNode === "function"
      ? nodeGraphNumberReadoutDefaultsForNode(targetNode)
      : null;
    const packed = {
      ...(settings && typeof settings === "object" ? settings : {}),
      faceStyle: typeof nodeGraphNumberReadoutFaceStyleForNode === "function"
        ? nodeGraphNumberReadoutFaceStyleForNode(targetNode)
        : (targetNode?.type === "valueLcd" ? "lcd" : "led"),
    };
    return normalizeNodeGraphNumberReadoutSettings(packed, defaults);
  }
  if (type === "knobFace") {
    return normalizeNodeGraphKnobFaceDisplaySettings(settings);
  }
  if (type === "portalFace") {
    return {
      channel: typeof nodeGraphPortalClampChannel === "function"
        ? nodeGraphPortalClampChannel(settings?.channel)
        : Math.max(0, Math.round(Number(settings?.channel) || 0)),
    };
  }
  if (type === "roundShapeFace" || type === "basicShapeFace") {
    return typeof normalizeNodeGraphRoundShapeFaceSettings === "function"
      ? normalizeNodeGraphRoundShapeFaceSettings(settings)
      : (settings || {});
  }
  if (type === "toggleButtonFace" || type === "momentaryButtonFace") {
    return typeof normalizeNodeGraphPluginButtonDisplaySettings === "function"
      ? normalizeNodeGraphPluginButtonDisplaySettings(settings)
      : (settings || {});
  }
  if (type === "keypadFace") {
    return typeof normalizeNodeGraphKeypadLayout === "function"
      ? normalizeNodeGraphKeypadLayout(settings)
      : (settings || {});
  }
  if (type === "phosphorWaveform") {
    return typeof normalizeNodeGraphPhosphorWaveformSettings === "function"
      ? normalizeNodeGraphPhosphorWaveformSettings(settings)
      : (settings || {});
  }
  if (type === "limiterGainFace") {
    return typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
      ? normalizeNodeGraphLimiterGainFaceSettings(settings)
      : (settings || {});
  }
  if (type === "textBoxFace") {
    return typeof normalizeNodeGraphTextBoxLayout === "function"
      ? normalizeNodeGraphTextBoxLayout(settings)
      : (settings || {});
  }
  if (type === "patchFace") {
    return normalizeNodeGraphPatchFaceDisplaySettings(settings);
  }
  if (type === "vectorRgbFace") {
    return typeof normalizeNodeGraphVectorRgbSettings === "function"
      ? normalizeNodeGraphVectorRgbSettings(settings)
      : (settings || {});
  }
  if (type === "rasterRgbFace") {
    return typeof normalizeNodeGraphRasterRgbSettings === "function"
      ? normalizeNodeGraphRasterRgbSettings(settings)
      : (settings || {});
  }
  if (type === "gradientVectorscopeFace") {
    return typeof normalizeNodeGraphGradientVectorscopeSettings === "function"
      ? normalizeNodeGraphGradientVectorscopeSettings(settings)
      : (settings || {});
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
  // Keep this schema list in lockstep with assign + cloneNodeGraphTypedDisplaySettings.
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
    const defaults = typeof nodeGraphNumberReadoutDefaultsForNode === "function"
      ? nodeGraphNumberReadoutDefaultsForNode(node)
      : null;
    const packed = {
      ...(node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
        ? node.traceDisplaySettings
        : {}),
      faceStyle: typeof nodeGraphNumberReadoutFaceStyleForNode === "function"
        ? nodeGraphNumberReadoutFaceStyleForNode(node)
        : (node?.type === "valueLcd" ? "lcd" : "led"),
    };
    return normalizeNodeGraphNumberReadoutSettings(packed, defaults);
  }
  if (settingsSchema === "knobFace") {
    return nodeGraphKnobFaceDisplaySettingsForNode(node);
  }
  if (settingsSchema === "portalFace") {
    return typeof nodeGraphPortalDisplaySettingsForNode === "function"
      ? nodeGraphPortalDisplaySettingsForNode(node)
      : { channel: 0 };
  }
  if (settingsSchema === "roundShapeFace" || settingsSchema === "basicShapeFace") {
    return typeof nodeGraphRoundShapeFaceSettingsForNode === "function"
      ? nodeGraphRoundShapeFaceSettingsForNode(node)
      : (typeof normalizeNodeGraphRoundShapeFaceSettings === "function"
        ? normalizeNodeGraphRoundShapeFaceSettings(node?.traceDisplaySettings)
        : (node?.traceDisplaySettings || {}));
  }
  if (settingsSchema === "toggleButtonFace" || settingsSchema === "momentaryButtonFace") {
    return typeof nodeGraphPluginButtonDisplaySettingsForNode === "function"
      ? nodeGraphPluginButtonDisplaySettingsForNode(node)
      : (typeof normalizeNodeGraphPluginButtonDisplaySettings === "function"
        ? normalizeNodeGraphPluginButtonDisplaySettings(node?.traceDisplaySettings)
        : (node?.traceDisplaySettings || {}));
  }
  if (settingsSchema === "keypadFace") {
    return typeof nodeGraphKeypadDisplaySettingsForNode === "function"
      ? nodeGraphKeypadDisplaySettingsForNode(node)
      : (typeof normalizeNodeGraphKeypadLayout === "function"
        ? normalizeNodeGraphKeypadLayout(node?.layout)
        : (node?.layout || {}));
  }
  if (settingsSchema === "phosphorWaveform") {
    return typeof nodeGraphPhosphorWaveformSettingsForNode === "function"
      ? nodeGraphPhosphorWaveformSettingsForNode(node?.id)
      : (typeof normalizeNodeGraphPhosphorWaveformSettings === "function"
        ? normalizeNodeGraphPhosphorWaveformSettings(node?.phosphorWaveformSettings)
        : (node?.phosphorWaveformSettings || {}));
  }
  if (settingsSchema === "limiterGainFace") {
    return typeof nodeGraphLimiterGainFaceSettingsForNode === "function"
      ? nodeGraphLimiterGainFaceSettingsForNode(node)
      : (typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
        ? normalizeNodeGraphLimiterGainFaceSettings(node?.traceDisplaySettings)
        : (node?.traceDisplaySettings || {}));
  }
  if (settingsSchema === "textBoxFace") {
    return typeof nodeGraphTextBoxDisplaySettingsForNode === "function"
      ? nodeGraphTextBoxDisplaySettingsForNode(node)
      : (typeof normalizeNodeGraphTextBoxLayout === "function"
        ? normalizeNodeGraphTextBoxLayout(node?.layout)
        : (node?.layout || {}));
  }
  if (settingsSchema === "patchFace") {
    return typeof nodeGraphPatchFaceDisplaySettingsForNode === "function"
      ? nodeGraphPatchFaceDisplaySettingsForNode(node)
      : normalizeNodeGraphPatchFaceDisplaySettings(node?.traceDisplaySettings);
  }
  if (settingsSchema === "xyPad") {
    return normalizeNodeGraphXyPadDisplaySettings(node.traceDisplaySettings);
  }
  if (settingsSchema === "vectorDot" || settingsSchema === "pulseDot") {
    return typeof nodeGraphVectorDotSettingsForNode === "function"
      ? nodeGraphVectorDotSettingsForNode(node)
      : normalizeNodeGraphVectorDotSettings(
        node?.vectorDotSettings || node?.zeroDBurnSettings || node?.traceDisplaySettings,
      );
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
  if (settingsSchema === "trace" || settingsSchema === "traceXyz") {
    return nodeGraphTraceDisplaySettingsForNode(node);
  }
  if (settingsSchema === "gradientVectorscopeFace") {
    return typeof normalizeNodeGraphGradientVectorscopeSettings === "function"
      ? normalizeNodeGraphGradientVectorscopeSettings(node.traceDisplaySettings)
      : (node.traceDisplaySettings || {});
  }
  if (settingsSchema === "vectorRgbFace") {
    return typeof normalizeNodeGraphVectorRgbSettings === "function"
      ? normalizeNodeGraphVectorRgbSettings(node.traceDisplaySettings)
      : (node.traceDisplaySettings || {});
  }
  if (settingsSchema === "rasterRgbFace") {
    return typeof normalizeNodeGraphRasterRgbSettings === "function"
      ? normalizeNodeGraphRasterRgbSettings(node.traceDisplaySettings)
      : (node.traceDisplaySettings || {});
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
  if (formType === "portalFace") {
    const panel = root?.querySelector?.("[data-portal-display-settings-panel]") || root;
    const next = { ...current };
    const input = panel?.querySelector?.(`[data-portal-field="channel"]`);
    if (input) {
      next.channel = Number(input.value);
    }
    return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
  }
  if (formType === "phosphorWaveform") {
    const next = { ...current };
    const numberIds = [
      ["nodePhosphorWaveformTimeWindowInput", "timeWindowSeconds"],
      ["nodePhosphorWaveformLineWidthInput", "scrollLineWidth"],
      ["nodePhosphorWaveformTraceWidthInput", "traceWidth"],
      ["nodePhosphorWaveformHueInput", "hue"],
      ["nodePhosphorWaveformLineBrightnessInput", "lineBrightness"],
      ["nodePhosphorWaveformGridBrightnessInput", "gridBrightness"],
      ["nodePhosphorWaveformBackgroundHueInput", "backgroundHue"],
      ["nodePhosphorWaveformBackgroundBrightnessInput", "backgroundBrightness"],
      ["nodePhosphorWaveformCornerRadiusInput", "cornerRadius"],
      ["nodePhosphorWaveformEdgeSpacingInput", "edgeSpacing"],
      ["nodePhosphorWaveformLabelInsetInput", "labelInsetPx"],
      ["nodePhosphorWaveformPlaylistFadeInput", "playlistFade"],
      ["nodePhosphorWaveformPlaylistVisibleCountInput", "playlistVisibleCount"],
    ];
    for (const [id, key] of numberIds) {
      const input = document.getElementById(id);
      if (input) {
        next[key] = Number(input.value);
      }
    }
    if (document.getElementById("nodePhosphorWaveformScrollSnapButton")?.classList.contains("active")) {
      next.scrollMode = "snap";
    } else {
      next.scrollMode = "smooth";
    }
    if (document.getElementById("nodePhosphorWaveformPositionLeftButton")?.classList.contains("active")) {
      next.scrollLinePosition = "left";
    } else if (document.getElementById("nodePhosphorWaveformPositionRightButton")?.classList.contains("active")) {
      next.scrollLinePosition = "right";
    } else {
      next.scrollLinePosition = "mid";
    }
    next.cornerShape = document.getElementById("nodePhosphorWaveformCornerSquareButton")?.classList.contains("active")
      ? "square"
      : "squircle";
    return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
  }
  if (formType === "limiterGainFace") {
    const panel = root?.querySelector?.("[data-limiter-gain-display-settings-panel]") || root;
    const next = { ...current };
    for (const key of ["historySeconds", "lineThickness", "hue", "lineBrightness"]) {
      const input = panel?.querySelector?.(`[data-limiter-gain-field="${key}"]`);
      if (input) {
        next[key] = Number(input.value);
      }
    }
    const color = panel?.querySelector?.(`[data-trace-display-color="backgroundColor"]`);
    if (color) {
      next.backgroundColor = color.value;
    }
    return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
  }
  if (formType === "toggleButtonFace" || formType === "momentaryButtonFace") {
    if (typeof readNodeGraphPluginButtonDisplaySettingsForm === "function") {
      return readNodeGraphPluginButtonDisplaySettingsForm(root, current);
    }
    return normalizeNodeGraphDisplaySettingsForFormType(current, formType);
  }
  if (formType === "keypadFace") {
    const panel = root?.querySelector?.("[data-keypad-display-settings-panel]") || root;
    const next = { ...current };
    for (const key of ["textSize", "textWeight", "buttonWidth", "buttonHeight", "buttonSize", "padPx", "rounding", "stroke"]) {
      const input = panel?.querySelector?.(`[data-keypad-field="${key}"]`);
      if (input) {
        next[key] = Number(input.value);
      }
    }
    const square = panel?.querySelector?.(`[data-keypad-check="squareRatio"]`);
    if (square) {
      next.squareRatio = Boolean(square.checked);
    }
    const font = panel?.querySelector?.(`[data-trace-display-choice="font"]`);
    if (font) {
      next.font = font.value;
    }
    const labels = panel?.querySelector?.("[data-keypad-labels]");
    if (labels) {
      next.labels = labels.value;
    }
    const corner = panel?.querySelector?.("[data-keypad-corner].active, [data-keypad-corner][aria-pressed='true']");
    if (corner) {
      next.cornerShape = corner.getAttribute("data-keypad-corner") === "pill" ? "pill" : "squircle";
    }
    for (const key of ["backgroundColor", "buttonColor", "hoverColor", "downColor", "textColor", "strokeColor"]) {
      const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
      if (input) {
        next[key] = input.value;
      }
    }
    if (Array.isArray(current.keyImages)) {
      next.keyImages = current.keyImages;
    }
    if (current.backgroundImage && typeof current.backgroundImage === "object") {
      next.backgroundImage = current.backgroundImage;
    }
    return normalizeNodeGraphDisplaySettingsForFormType(next, formType);
  }
  if (formType === "textBoxFace") {
    const panel = root?.querySelector?.("[data-textbox-display-settings-panel]") || root;
    const next = { ...current };
    for (const key of ["textSizePercent", "verticalAlignPercent"]) {
      const input = panel?.querySelector?.(`[data-textbox-field="${key}"]`);
      if (input) {
        next[key] = Number(input.value);
      }
    }
    const mode = panel?.querySelector?.("[data-textbox-mode].active, [data-textbox-mode][aria-pressed='true']");
    if (mode) {
      next.textMode = mode.getAttribute("data-textbox-mode");
    }
    const align = panel?.querySelector?.("[data-textbox-align].active, [data-textbox-align][aria-pressed='true']");
    if (align) {
      next.horizontalAlign = align.getAttribute("data-textbox-align");
    }
    for (const key of ["backgroundColor", "textColor"]) {
      const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
      if (input) {
        next[key] = input.value;
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
      if (key === "backgroundHue") {
        const hueN = Number(sanitizedValue);
        if (Number.isFinite(hueN) && typeof nodeGraphHueUnitHex === "function") {
          const hueHex = nodeGraphHueUnitHex(hueN);
          next.background = hueHex;
          next.backgroundColor = hueHex;
        }
      }
      if (key === "zoomSeconds") {
        next.historySeconds = sanitizedValue;
      }
      if (key === "historySeconds") {
        next.zoomSeconds = sanitizedValue;
      }
      // Value LED/LCD: app-wide Trail/Ghost map onto hang + 8-floor aliases.
      if (key === "trail") {
        next.residual = sanitizedValue;
      }
      if (key === "residual") {
        next.trail = sanitizedValue;
      }
      if (key === "ghost") {
        next.ghostBrightness = sanitizedValue;
      }
      if (key === "ghostBrightness") {
        next.ghost = sanitizedValue;
      }
      // Sticky Burn + Burn Amount (residualSchema ≥ 3). Stamp schema so migrate accepts fields.
      if (key === "burn" || key === "burnAmount") {
        next.residualSchema = 3;
      }
    }
  }
  // Any residual-axis edit writes residualSchema ≥ 3 (sticky Burn + Burn Amount).
  if (
    activeFields.has("burn")
    || activeFields.has("burnAmount")
    || activeFields.has("ghost")
    || activeFields.has("trail")
  ) {
    next.residualSchema = 3;
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
      let on = nodeGraphDisplaySettingsReadToggleElement(input);
      // GROW UI: checked = digits grow/fill → stored decimalBudget is the inverse (fixed width).
      if (key === "decimalBudget") {
        on = !on;
      }
      next[key] = on;
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
  // Value LED/LCD: Trail hang + Ghost floor (legacy residual / ghostBrightness).
  if (key === "trail") {
    return settings.trail ?? settings.residual;
  }
  if (key === "residual") {
    return settings.residual ?? settings.trail;
  }
  if (key === "ghost") {
    return settings.ghost ?? settings.ghostBrightness;
  }
  if (key === "ghostBrightness") {
    return settings.ghostBrightness ?? settings.ghost;
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
  if (key === "backgroundHue") {
    const stored = Number(settings.backgroundHue);
    if (Number.isFinite(stored)) {
      return stored;
    }
    return typeof nodeGraphHueDegFromHex === "function"
      ? nodeGraphHueDegFromHex(settings.background ?? settings.backgroundColor)
      : 0;
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
  if (key === "zoomSeconds") {
    return settings.zoomSeconds ?? settings.historySeconds;
  }
  if (key === "historySeconds") {
    return settings.historySeconds ?? settings.zoomSeconds;
  }
  return settings[key];
}

function writeNodeGraphTraceDisplaySettingsForm(settings) {
  // Seeding the form from a node (or multi primary) is not a user edit.
  if (typeof clearNodeGraphTraceDisplaySettingsDirty === "function") {
    clearNodeGraphTraceDisplaySettingsDirty();
  }
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
  if (formType === "portalFace") {
    const panel = root?.querySelector?.("[data-portal-display-settings-panel]") || root;
    if (typeof syncNodeGraphPortalDisplaySettingsControls === "function") {
      syncNodeGraphPortalDisplaySettingsControls(panel, normalized);
    }
    return;
  }
  if (formType === "phosphorWaveform") {
    if (typeof renderNodeGraphPhosphorWaveformSettingsWindow === "function") {
      renderNodeGraphPhosphorWaveformSettingsWindow();
    }
    return;
  }
  if (formType === "limiterGainFace") {
    const panel = root?.querySelector?.("[data-limiter-gain-display-settings-panel]") || root;
    if (typeof syncNodeGraphLimiterGainDisplaySettingsControls === "function") {
      syncNodeGraphLimiterGainDisplaySettingsControls(panel, normalized);
    }
    syncNodeGraphTraceDisplayColorWidgets(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
    );
    return;
  }
  if (formType === "toggleButtonFace" || formType === "momentaryButtonFace") {
    const panel = root?.querySelector?.("[data-plugin-button-display-settings-panel]") || root;
    if (typeof syncNodeGraphPluginButtonDisplaySettingsControls === "function") {
      syncNodeGraphPluginButtonDisplaySettingsControls(panel, normalized);
    }
    syncNodeGraphTraceDisplayColorWidgets(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
    );
    if (typeof syncNodeGraphHueTitleSteppers === "function") {
      syncNodeGraphHueTitleSteppers(panel);
    }
    return;
  }
  if (formType === "keypadFace") {
    const panel = root?.querySelector?.("[data-keypad-display-settings-panel]") || root;
    if (typeof syncNodeGraphKeypadDisplaySettingsControls === "function") {
      syncNodeGraphKeypadDisplaySettingsControls(panel, normalized);
    }
    for (const key of ["backgroundColor", "buttonColor", "hoverColor", "downColor", "textColor", "strokeColor"]) {
      const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
      if (input) {
        input.value = normalized[key] || "";
      }
    }
    syncNodeGraphTraceDisplayColorWidgets(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
    );
    return;
  }
  if (formType === "textBoxFace") {
    const panel = root?.querySelector?.("[data-textbox-display-settings-panel]") || root;
    if (typeof syncNodeGraphTextBoxDisplaySettingsControls === "function") {
      syncNodeGraphTextBoxDisplaySettingsControls(panel, normalized);
    }
    for (const key of ["backgroundColor", "textColor"]) {
      const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
      if (input) {
        input.value = normalized[key] || "";
      }
    }
    syncNodeGraphTraceDisplayColorWidgets(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
    );
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
      let on = Boolean(normalized[key]);
      // GROW UI: show on when digits grow/fill (decimalBudget false).
      if (key === "decimalBudget") {
        on = !on;
      }
      nodeGraphDisplaySettingsWriteToggleElement(input, on);
    }
  }
  // Refit packing latch labels after values land.
  if (typeof AppLatchButton !== "undefined" && root) {
    AppLatchButton.scheduleFit(root);
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
  syncNodeGraphHueTitleSteppers(root);
  if (formType === "knobFace" && typeof syncNodeGraphKnobFaceDisplaySettingsControls === "function") {
    syncNodeGraphKnobFaceDisplaySettingsControls(root);
  }
  if (typeof nodeGraphDisplaySettingsShowsStampPreview === "function"
    && nodeGraphDisplaySettingsShowsStampPreview(formType)
    && typeof syncNodeGraphStampPreview === "function") {
    syncNodeGraphStampPreview(root, normalized);
  }
}

/** Smart title ink for pure-hue title cells (Rec. 709 luminance). */
function nodeGraphHueTitleInkForHex(hex) {
  const s = String(hex || "#ffffff").replace("#", "");
  if (s.length < 6) {
    return "#ffffff";
  }
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  if (![r, g, b].every(Number.isFinite)) {
    return "#ffffff";
  }
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.55 ? "#000000" : "#ffffff";
}

function nodeGraphHueTitleStepperApplySwatch(root, pureHex) {
  if (!root) {
    return;
  }
  const hex = typeof nodeGraphTraceDisplayPureHueHex === "function"
    ? nodeGraphTraceDisplayPureHueHex(pureHex, "#ff0000")
    : pureHex;
  const ink = nodeGraphHueTitleInkForHex(hex);
  const swatch = root.querySelector?.("[data-hue-title-swatch]");
  if (swatch) {
    // Set properties AND inline paint so global `button { background }` cannot win.
    swatch.style.setProperty("--hts-hue", hex);
    swatch.style.setProperty("--hts-ink", ink);
    swatch.style.backgroundColor = hex;
    swatch.style.color = ink;
    swatch.style.backgroundImage = "none";
  }
}

function syncNodeGraphHueTitleSteppers(host = nodeGraphTraceDisplaySettingsRoot()) {
  if (!host) {
    return;
  }
  for (const row of host.querySelectorAll("[data-hue-title-stepper]")) {
    const colorField = row.getAttribute("data-hue-title-color-field") || "dot1Color";
    const colorInput = row.querySelector(`[data-trace-display-color="${colorField}"]`)
      || host.querySelector(`[data-trace-display-color="${colorField}"]`);
    const raw = colorInput?.value || "#ff0000";
    const pure = typeof nodeGraphTraceDisplayPureHueHex === "function"
      ? nodeGraphTraceDisplayPureHueHex(raw, "#ff0000")
      : raw;
    if (colorInput && pure && colorInput.value !== pure) {
      // Keep stored color as pure hue for NR LED path.
      colorInput.value = pure;
    }
    nodeGraphHueTitleStepperApplySwatch(row, pure);
  }
}

function bindNodeGraphHueTitleSteppers(host) {
  if (!host || host.dataset.hueTitleSteppersBound === "true") {
    return;
  }
  host.dataset.hueTitleSteppersBound = "true";
  let drag = null;

  const endDrag = (event) => {
    if (!drag) {
      return;
    }
    if (drag.pointerId !== null && event?.pointerId !== undefined
      && drag.pointerId !== event.pointerId) {
      return;
    }
    if (event?.pointerId !== undefined && drag.swatch?.hasPointerCapture?.(event.pointerId)) {
      drag.swatch.releasePointerCapture(event.pointerId);
    }
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty(
        drag?.row?.getAttribute("data-hue-title-color-field") || "dot1Color",
      );
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true });
    }
    drag = null;
  };

  host.addEventListener("pointerdown", (event) => {
    const swatch = event.target?.closest?.("[data-hue-title-swatch]");
    if (!swatch || !host.contains(swatch) || event.button > 0) {
      return;
    }
    const row = swatch.closest("[data-hue-title-stepper]");
    if (!row) {
      return;
    }
    const colorField = row.getAttribute("data-hue-title-color-field") || "dot1Color";
    const colorInput = row.querySelector(`[data-trace-display-color="${colorField}"]`);
    if (!colorInput) {
      return;
    }
    const hsl = typeof nodeGraphTraceDisplayHexToHsl === "function"
      ? nodeGraphTraceDisplayHexToHsl(colorInput.value)
      : { h: 0 };
    drag = {
      pointerId: event.pointerId ?? null,
      swatch,
      row,
      colorInput,
      startX: event.clientX,
      startHue: Number(hsl.h) || 0,
    };
    swatch.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  host.addEventListener("pointermove", (event) => {
    if (!drag
      || (drag.pointerId !== null && event.pointerId !== undefined
        && drag.pointerId !== event.pointerId)) {
      return;
    }
    // ~1.2° per screen px; Shift = fine.
    // App-wide hue policy: no wrap — clamp to red edges (0…360).
    const fine = event.shiftKey ? 0.15 : 1;
    const delta = (event.clientX - drag.startX) * 1.2 * fine;
    const nextH = Math.max(0, Math.min(360, drag.startHue + delta));
    const pure = typeof nodeGraphTraceDisplayPureHueHex === "function"
      ? nodeGraphTraceDisplayPureHueHex({ h: nextH }, "#ff0000")
      : `hsl(${nextH} 100% 50%)`;
    drag.colorInput.value = pure;
    nodeGraphHueTitleStepperApplySwatch(drag.row, pure);
    // Live-paint LED only — do NOT rewrite the whole form / re-sync Background
    // color widgets (that was coupling LED hue with the plane widget).
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty(
        drag.row?.getAttribute("data-hue-title-color-field") || "dot1Color",
      );
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist: "none", record: false });
    }
    event.preventDefault();
  });

  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);
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
    return new URL("color-widget.js?v=hue-reset-red-1", script.src).href;
  }
  // Fallbacks: site root /public/, then document-relative public/
  try {
    return new URL("/public/color-widget.js?v=hue-reset-red-1", window.location.origin).href;
  } catch {
    return new URL("public/color-widget.js?v=hue-reset-red-1", window.location.href).href;
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
    h: Math.round(hue * 360) % 360,
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
  // Title lives inside the widget (swatch). Never a side "Color" heading.
  if (field === "secondaryColor") {
    return "Right";
  }
  if (field === "backgroundColor") {
    if (nodeGraphTraceDisplaySettingsFormType() === "numberReadout") {
      return "Background";
    }
    return "Bg";
  }
  if (field === "buttonColor") {
    return "Button";
  }
  if (field === "hoverColor") {
    return "Hover";
  }
  if (field === "downColor") {
    return "Down";
  }
  if (field === "textColor") {
    return "Text";
  }
  if (field === "strokeColor") {
    return "Stroke";
  }
  if (field === "arcFill") {
    return "Fill";
  }
  if (field === "arcTrack") {
    return "Track";
  }
  if (field === "ghostColor") {
    return "Ghost ink";
  }
  if (field === "dot1Color") {
    if (nodeGraphTraceDisplaySettingsFormType() === "patchFace") {
      return "Ink";
    }
    // Value LCD: full foreground color widget (same chrome as Background).
    // Value LED: no label (hue strip lives on the LED amount row).
    if (nodeGraphTraceDisplaySettingsFormType() === "numberReadout") {
      const nodeType = typeof nodeGraphPatchNode === "function"
        ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
        : null;
      return nodeType === "valueLcd" ? "Foreground" : "";
    }
    const nodeType = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type
      : null;
    const isStereo = typeof nodeGraphModuleUsesStereoTraceDisplay === "function"
      ? nodeGraphModuleUsesStereoTraceDisplay(nodeType)
      : nodeType === "output";
    return isStereo ? "Left" : "";
  }
  return "";
}

/** Pure hue hex at s=100 l=50 (Number Readout Light stores hue only). */
function nodeGraphTraceDisplayPureHueHex(hslOrHex, fallback = "#fcfdbf") {
  let h = 50;
  if (hslOrHex && typeof hslOrHex === "object" && Number.isFinite(Number(hslOrHex.h))) {
    h = ((Number(hslOrHex.h) % 360) + 360) % 360;
  } else {
    const parsed = nodeGraphTraceDisplayHexToHsl(String(hslOrHex || fallback));
    h = Number(parsed.h) || 0;
  }
  // HSL → RGB (s=1, l=0.5) → #rrggbb
  const s = 1;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
      // Value LED Light: hue bar only (Bright does grey→hue→white).
      // Value LCD Foreground: full color widget (same as Background).
      const lcdNode = liveType === "numberReadout"
        && typeof nodeGraphPatchNode === "function"
        && ["valueLcd", "helmholtzPitch"].includes(
          nodeGraphPatchNode(nodeGraphTraceDisplaySettingsTargetNodeId())?.type,
        );
      const hueOnly = liveType === "numberReadout" && field === "dot1Color" && !lcdNode;
      const mountHsl = hueOnly
        ? { h: hsl.h, s: 100, l: 50, a: 1 }
        : hsl;
      let widget = nodeGraphTraceDisplayColorWidgetState.widgets.get(field);
      // Remount if channel mode must change (full ↔ hue).
      if (widget && hueOnly && widget.channels !== "hue") {
        try {
          widget.destroy?.();
        } catch {
          // ignore
        }
        nodeGraphTraceDisplayColorWidgetState.widgets.delete(field);
        host.replaceChildren();
        widget = null;
      }
      if (widget && !hueOnly && widget.channels === "hue") {
        try {
          widget.destroy?.();
        } catch {
          // ignore
        }
        nodeGraphTraceDisplayColorWidgetState.widgets.delete(field);
        host.replaceChildren();
        widget = null;
      }
      if (!widget) {
        try {
          host.replaceChildren();
          const defaultHex = typeof nodeGraphDisplaySettingsColorRowMeta === "function"
            ? nodeGraphDisplaySettingsColorRowMeta(field, liveType, { stereo: true }).defaultValue
            : "";
          const defaultHsl = defaultHex
            ? nodeGraphTraceDisplayHexToHsl(defaultHex)
            : null;
          widget = mount(host, {
            // Hue-only never shows a title (giant scaled "Hue" was a waste strip).
            label: hueOnly ? "" : label,
            ...mountHsl,
            // 0 = red (Left). Must pass explicitly — falsy 0 is still a hue.
            defaultHue: Number.isFinite(Number(defaultHsl?.h)) ? defaultHsl.h : undefined,
            channels: hueOnly ? "hue" : "full",
            onChange: (color) => {
              if (nodeGraphTraceDisplayColorWidgetState.syncing) {
                return;
              }
              const nextHex = hueOnly
                ? nodeGraphTraceDisplayPureHueHex(color, hex)
                : nodeGraphTraceDisplayNormalizeHexColor(color?.hex, hex);
              const colorInput = nodeGraphTraceDisplaySettingsRoot()?.querySelector?.(
                `[data-trace-display-color="${field}"]`,
              );
              if (colorInput) {
                colorInput.value = nextHex;
              }
              // Live paint while dragging strips.
              if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
                markNodeGraphTraceDisplaySettingsDirty(field);
              }
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
        // Only push color into this field's widget when the value actually changed.
        // Avoids re-painting Background plane while the user drags LED hue.
        const liveHex = nodeGraphTraceDisplayNormalizeHexColor(
          widget.getColor?.()?.hex || "",
          "",
        );
        const nextHex = nodeGraphTraceDisplayNormalizeHexColor(hex, "");
        if (liveHex && nextHex && liveHex === nextHex) {
          if (widget.label !== (hueOnly ? "" : label)) {
            widget.label = hueOnly ? "" : label;
            widget.render?.();
          }
          continue;
        }
        nodeGraphTraceDisplayColorWidgetState.syncing = true;
        try {
          widget.label = hueOnly ? "" : label;
          widget.setColor(mountHsl, false);
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
