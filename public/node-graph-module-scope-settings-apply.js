// Display Settings apply / persist / assign-to-node / mode change.
// Peeled from node-graph-module-scope-settings-ui.js (graphify community peel).
// Load after settings-field-edit.js, before settings-window.js.

function assignNodeGraphTypedDisplaySettingsToNode(node, displayType, settings) {
  if (!node) {
    return null;
  }
  if (displayType === "dot") {
    node.zeroDBurnSettings = normalizeNodeGraphZeroDBurnSettings(settings);
    return node.zeroDBurnSettings;
  }
  if (displayType === "vectorDot" || displayType === "pulseDot") {
    node.vectorDotSettings = typeof normalizeNodeGraphVectorDotSettings === "function"
      ? normalizeNodeGraphVectorDotSettings(settings)
      : (settings || {});
    if (node.type === "led") {
      node.led = typeof normalizeNodeGraphLedLayout === "function"
        ? normalizeNodeGraphLedLayout({
          ...(node.led || {}),
          hue: node.vectorDotSettings.hue,
          brightness: node.vectorDotSettings.dot1Brightness,
          blur: node.vectorDotSettings.lineThickness,
          dot1Size: node.vectorDotSettings.dot1Size,
        })
        : node.led;
    }
    return node.vectorDotSettings;
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
    const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
      ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(node?.type)
      : null;
    node.traceDisplaySettings = normalizeNodeGraphScope2dTraceSettings(settings, typeDefaults);
    return node.traceDisplaySettings;
  }
  // Must not fall through to Trace normalize: that drops decimals and expands
  // a full Trace schema onto the multimeter (can thrash draw/history/persist).
  if (displayType === "numberReadout") {
    const defaults = typeof nodeGraphNumberReadoutDefaultsForNode === "function"
      ? nodeGraphNumberReadoutDefaultsForNode(node)
      : null;
    const packed = {
      ...(settings && typeof settings === "object" ? settings : {}),
      faceStyle: typeof nodeGraphNumberReadoutFaceStyleForNode === "function"
        ? nodeGraphNumberReadoutFaceStyleForNode(node)
        : (node?.type === "valueLcd" ? "lcd" : "led"),
    };
    node.traceDisplaySettings = normalizeNodeGraphNumberReadoutSettings(packed, defaults);
    return node.traceDisplaySettings;
  }
  if (displayType === "portalFace") {
    const channel = typeof nodeGraphPortalClampChannel === "function"
      ? nodeGraphPortalClampChannel(settings?.channel)
      : Math.max(0, Math.round(Number(settings?.channel) || 0));
    node.params = { ...(node.params || {}), channel };
    if (typeof applyNodeGraphPortalDisplaySettingsToFace === "function") {
      applyNodeGraphPortalDisplaySettingsToFace(node);
    }
    return { channel };
  }
  if (displayType === "roundShapeFace" || displayType === "basicShapeFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphRoundShapeFaceSettings === "function"
      ? normalizeNodeGraphRoundShapeFaceSettings(settings)
      : (settings || {});
    if (displayType === "basicShapeFace"
      && typeof applyNodeGraphBasicShapeDisplaySettingsToFace === "function") {
      applyNodeGraphBasicShapeDisplaySettingsToFace(node);
    } else if (typeof applyNodeGraphRoundShapeDisplaySettingsToFace === "function") {
      applyNodeGraphRoundShapeDisplaySettingsToFace(node);
    }
    return node.traceDisplaySettings;
  }
  if (displayType === "toggleButtonFace" || displayType === "momentaryButtonFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphPluginButtonDisplaySettings === "function"
      ? normalizeNodeGraphPluginButtonDisplaySettings(settings)
      : (settings || {});
    if (typeof applyNodeGraphPluginButtonDisplaySettingsToFace === "function") {
      applyNodeGraphPluginButtonDisplaySettingsToFace(node);
    }
    return node.traceDisplaySettings;
  }
  if (displayType === "keypadFace") {
    node.layout = typeof normalizeNodeGraphKeypadLayout === "function"
      ? normalizeNodeGraphKeypadLayout(settings)
      : (settings || {});
    if (typeof applyNodeGraphKeypadDisplaySettingsToFace === "function") {
      applyNodeGraphKeypadDisplaySettingsToFace(node);
    }
    return node.layout;
  }
  if (displayType === "phosphorWaveform") {
    node.phosphorWaveformSettings = typeof normalizeNodeGraphPhosphorWaveformSettings === "function"
      ? normalizeNodeGraphPhosphorWaveformSettings(settings)
      : (settings || {});
    if (typeof applyNodeGraphPhosphorWaveformDisplaySettingsToFace === "function") {
      applyNodeGraphPhosphorWaveformDisplaySettingsToFace(node);
    }
    return node.phosphorWaveformSettings;
  }
  if (displayType === "limiterGainFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
      ? normalizeNodeGraphLimiterGainFaceSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "textBoxFace") {
    const previous = typeof normalizeNodeGraphTextBoxLayout === "function"
      ? normalizeNodeGraphTextBoxLayout(node.layout)
      : (node.layout || {});
    node.layout = typeof normalizeNodeGraphTextBoxLayout === "function"
      ? normalizeNodeGraphTextBoxLayout({ ...previous, ...(settings || {}), text: previous.text })
      : { ...previous, ...(settings || {}), text: previous.text };
    if (typeof applyNodeGraphTextBoxDisplaySettingsToFace === "function") {
      applyNodeGraphTextBoxDisplaySettingsToFace(node);
    }
    return node.layout;
  }
  if (displayType === "knobFace") {
    const normalized = normalizeNodeGraphKnobFaceDisplaySettings(settings);
    node.traceDisplaySettings = normalized;
    // Mirror span/readout/label into the face blob (image layers live there).
    if (typeof normalizeNodeGraphKnobFace === "function") {
      const face = normalizeNodeGraphKnobFace(node.knobFace);
      const nextFace = {
        ...face,
        rotationDegrees: normalized.rotationDegrees,
      };
      node.knobFace = typeof nodeGraphKnobFaceToPatch === "function"
        ? nodeGraphKnobFaceToPatch(nextFace)
        : nextFace;
    }
    // Live repaint so Span / Inner radius apply immediately.
    if (typeof paintNodeGraphKnobFaceLive === "function" && node?.id) {
      const el = document.querySelector?.(`.node-knob-face[data-node="${CSS.escape(String(node.id))}"]`);
      if (el) {
        paintNodeGraphKnobFaceLive(el, node.id, null);
      }
    }
    return node.traceDisplaySettings;
  }
  if (displayType === "patchFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphPatchFaceDisplaySettings === "function"
      ? normalizeNodeGraphPatchFaceDisplaySettings(settings)
      : (settings || {});
    if (typeof applyNodeGraphPatchFaceDisplay === "function" && node?.id) {
      const el = document.querySelector?.(`.node-patch-face[data-node="${CSS.escape(String(node.id))}"]`);
      applyNodeGraphPatchFaceDisplay(el, node);
    }
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
  if (displayType === "evolveFieldFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphEvolveFieldSettings === "function"
      ? normalizeNodeGraphEvolveFieldSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "fbmFieldFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphFbmFieldSettings === "function"
      ? normalizeNodeGraphFbmFieldSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "vectorRgbFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphVectorRgbSettings === "function"
      ? normalizeNodeGraphVectorRgbSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "rasterRgbFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphRasterRgbSettings === "function"
      ? normalizeNodeGraphRasterRgbSettings(settings)
      : (settings || {});
    return node.traceDisplaySettings;
  }
  if (displayType === "gradientVectorscopeFace") {
    node.traceDisplaySettings = typeof normalizeNodeGraphGradientVectorscopeSettings === "function"
      ? normalizeNodeGraphGradientVectorscopeSettings(settings)
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

/** @deprecated One face per module — display mode keys are no longer switched. */
function assignNodeGraphDisplayModeKeyToNode(node, _modeKey) {
  if (!node) {
    return null;
  }
  // Keep ui.displayModeKey aligned with the sole fixed mode (if any).
  const selectedMode = typeof nodeGraphModuleSelectedDisplayMode === "function"
    ? nodeGraphModuleSelectedDisplayMode(node)
    : null;
  if (!selectedMode) {
    return null;
  }
  const ui = typeof normalizeNodeGraphPatchNodeUi === "function"
    ? normalizeNodeGraphPatchNodeUi(node.ui, node.type)
    : { ...(node.ui || {}) };
  // Drop stale multi-mode selection; optional key only for patch round-trip.
  if (ui.displayModeKey) {
    delete ui.displayModeKey;
  }
  node.ui = ui;
  return selectedMode;
}

/** @deprecated One face per module — no-op switch. */
function assignNodeGraphDisplayModeKeyEverywhere(node, modeKey) {
  return assignNodeGraphDisplayModeKeyToNode(node, modeKey);
}

/** @deprecated Mode dropdown removed. */
function changeNodeGraphTraceDisplayMode(_event) {
  return false;
}

function nodeGraphSwapTraceLookPair(settings, leftKey, rightKey, mirrorKey) {
  const next = settings[rightKey];
  settings[rightKey] = settings[leftKey];
  settings[leftKey] = next;
  if (mirrorKey) {
    settings[mirrorKey] = settings[leftKey];
  }
}

/** Swap Left/Right look (color, size, blur, brightness) on Output / stereo Trace. */
function swapNodeGraphOutputTraceLook() {
  const nodeId = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  if (!node) {
    return;
  }
  const s = { ...(node.traceDisplaySettings || {}) };
  if (s.dot1Color === undefined && s.color !== undefined) {
    s.dot1Color = s.color;
  }
  if (s.dot1Size === undefined && s.size !== undefined) {
    s.dot1Size = s.size;
  }
  if (s.dot1Brightness === undefined && s.brightness !== undefined) {
    s.dot1Brightness = s.brightness;
  }
  nodeGraphSwapTraceLookPair(s, "dot1Color", "secondaryColor", "color");
  nodeGraphSwapTraceLookPair(s, "dot1Size", "secondarySize", "size");
  nodeGraphSwapTraceLookPair(s, "dot1Brightness", "secondaryBrightness", "brightness");
  nodeGraphSwapTraceLookPair(s, "lineThickness", "secondaryLineThickness");
  node.traceDisplaySettings = s;
  if (typeof noteNodeGraphHeavyHistoryAction === "function") {
    noteNodeGraphHeavyHistoryAction("swapLr");
  }
  nodeGraphMvp.patchDirtyState = "edited";
  persistNodeGraphTraceDisplaySettingsSoon("debounce");
  if (typeof recordNodeGraphHistory === "function") {
    recordNodeGraphHistory();
  } else if (typeof renderNodeGraphHistoryControls === "function") {
    renderNodeGraphHistoryControls();
  }
  if (typeof syncNodeGraphCurrentSavedPatchHeader === "function") {
    syncNodeGraphCurrentSavedPatchHeader();
  }
  if (typeof writeNodeGraphTraceDisplaySettingsForm === "function") {
    writeNodeGraphTraceDisplaySettingsForm(s);
  }
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw({ force: true });
  }
  if (typeof syncNodeGraphStampPreview === "function") {
    syncNodeGraphStampPreview(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
      s,
    );
  }
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
    // Global traceSettings SSOT is the session blob (workingPatch clone).
    if (typeof persistSession === "function") {
      persistSession({
        reason: "workingPatch",
        immediateFile: persistMode === "immediate",
      });
      return;
    }
    if (typeof saveNodeGraphWorkingPatchToUserSettings === "function") {
      saveNodeGraphWorkingPatchToUserSettings({ immediateFile: persistMode === "immediate" });
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


/**
 * Dirty keys for Display Settings multi-apply.
 * Selection changes commit the open form — without this, primary colors were
 * pushed onto every multi-target even when the user never edited color.
 */
function markNodeGraphTraceDisplaySettingsDirty(keys = null) {
  if (!nodeGraphMvp.traceDisplaySettingsDirtyKeys) {
    nodeGraphMvp.traceDisplaySettingsDirtyKeys = new Set();
  }
  const bag = nodeGraphMvp.traceDisplaySettingsDirtyKeys;
  if (keys == null || keys === "*") {
    bag.add("*");
    return;
  }
  if (Array.isArray(keys)) {
    for (const key of keys) {
      if (key) {
        bag.add(String(key));
      }
    }
    return;
  }
  if (keys) {
    bag.add(String(keys));
  }
}

function clearNodeGraphTraceDisplaySettingsDirty() {
  nodeGraphMvp.traceDisplaySettingsDirtyKeys = new Set();
}

function nodeGraphTraceDisplaySettingsIsDirty() {
  return (nodeGraphMvp.traceDisplaySettingsDirtyKeys?.size || 0) > 0;
}

/**
 * Multi-select apply: only write keys the user actually edited so unrelated
 * look (gradient/colors) stays per-module. Single-target still applies full form.
 */
function nodeGraphMergeDisplaySettingsDirty(existing, form, dirtyKeys) {
  const formObj = form && typeof form === "object" ? form : {};
  if (!dirtyKeys || dirtyKeys.size === 0) {
    return null;
  }
  if (dirtyKeys.has("*")) {
    return formObj;
  }
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  for (const key of dirtyKeys) {
    if (key === "*") {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(formObj, key)) {
      base[key] = formObj[key];
    }
  }
  // Coupled mirrors the form/normalize layer uses.
  if (dirtyKeys.has("dot1Brightness") && formObj.brightness !== undefined) {
    base.brightness = formObj.brightness;
  }
  if (dirtyKeys.has("dot1Color") && formObj.color !== undefined) {
    base.color = formObj.color;
  }
  if (dirtyKeys.has("backgroundColor") && formObj.background !== undefined) {
    base.background = formObj.background;
  }
  if (dirtyKeys.has("backgroundHue")) {
    if (formObj.background !== undefined) {
      base.background = formObj.background;
    }
    if (formObj.backgroundColor !== undefined) {
      base.backgroundColor = formObj.backgroundColor;
    }
    if (formObj.backgroundHue !== undefined) {
      base.backgroundHue = formObj.backgroundHue;
    }
  }
  if (dirtyKeys.has("gradientStops") || dirtyKeys.has("gradient")) {
    if (formObj.gradientStops != null) {
      base.gradientStops = formObj.gradientStops;
    }
    if (formObj.gradient != null) {
      base.gradient = formObj.gradient;
    }
    // Floor follows gradient when stops change.
    if (Array.isArray(formObj.gradientStops) && formObj.gradientStops[0]?.color) {
      base.background = formObj.gradientStops[0].color;
      base.backgroundColor = formObj.gradientStops[0].color;
    }
  }
  if (dirtyKeys.has("sourceSync") && formObj.syncChannel !== undefined) {
    base.syncChannel = formObj.syncChannel;
  }
  return base;
}

function nodeGraphTraceDisplayExistingSettingsForNode(node, settingsSchema) {
  if (!node) {
    return {};
  }
  if (typeof nodeGraphTraceDisplayCurrentSettingsForFormType === "function") {
    // Temporarily not available per-node — read typed bags.
  }
  if (settingsSchema === "lineBurn" || settingsSchema === "value" || settingsSchema === "trace"
    || settingsSchema === "scope2d" || settingsSchema === "scope2dTrace"
    || settingsSchema === "numberReadout" || settingsSchema === "knobFace"
    || settingsSchema === "phosphorLight" || settingsSchema === "roundShapeFace"
    || settingsSchema === "basicShapeFace"
    || settingsSchema === "limiterGainFace"
    || settingsSchema === "toggleButtonFace" || settingsSchema === "momentaryButtonFace") {
    return node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? { ...node.traceDisplaySettings }
      : {};
  }
  if (settingsSchema === "dot") {
    return node.zeroDBurnSettings && typeof node.zeroDBurnSettings === "object"
      ? { ...node.zeroDBurnSettings }
      : {};
  }
  if (settingsSchema === "ledLamp") {
    return node.led && typeof node.led === "object" ? { ...node.led } : {};
  }
  if (settingsSchema === "portalFace") {
    return typeof nodeGraphPortalDisplaySettingsForNode === "function"
      ? nodeGraphPortalDisplaySettingsForNode(node)
      : { channel: Number(node?.params?.channel) || 0 };
  }
  if (settingsSchema === "keypadFace") {
    return node.layout && typeof node.layout === "object" ? { ...node.layout } : {};
  }
  if (settingsSchema === "phosphorWaveform") {
    return node.phosphorWaveformSettings && typeof node.phosphorWaveformSettings === "object"
      ? { ...node.phosphorWaveformSettings }
      : {};
  }
  if (settingsSchema === "textBoxFace") {
    return node.layout && typeof node.layout === "object" ? { ...node.layout } : {};
  }
  return node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? { ...node.traceDisplaySettings }
    : {};
}

function applyNodeGraphTraceDisplaySettingsForm(options = {}) {
  const settings = readNodeGraphTraceDisplaySettingsForm();
  const commit = Boolean(options.record || options.commit);
  const forceAll = Boolean(options.forceAll);
  const dirtyKeys = nodeGraphMvp.traceDisplaySettingsDirtyKeys;
  const isDirty = forceAll || (dirtyKeys && dirtyKeys.size > 0);

  // Selection-follow / reopen commits without edits must not rewrite targets.
  if (!isDirty && !nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    return null;
  }

  if (nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    nodeGraphMvp.traceSettings = normalizeNodeGraphTraceDisplaySettings(settings);
  } else {
    // Multi-adjust: same display schema across selection → write targets.
    const targetIds = typeof nodeGraphTraceDisplaySettingsActiveTargetIds === "function"
      ? nodeGraphTraceDisplaySettingsActiveTargetIds()
      : [nodeGraphTraceDisplaySettingsTargetNodeId()].filter(Boolean);
    if (!targetIds.length) {
      return null;
    }
    let anyApplied = false;
    let needsParamSync = false;
    const multi = targetIds.length > 1;
    for (const targetId of targetIds) {
      const node = nodeGraphPatchNode(targetId);
      if (!nodeGraphNodeCanOpenDisplaySettings(node)) {
        continue;
      }
      const settingsSchema = nodeGraphModuleDisplaySettingsSchemaForNode(node);
      let toApply = settings;
      if (multi && !forceAll && dirtyKeys && !dirtyKeys.has("*")) {
        const existing = nodeGraphTraceDisplayExistingSettingsForNode(node, settingsSchema);
        toApply = nodeGraphMergeDisplaySettingsDirty(existing, settings, dirtyKeys);
        if (!toApply) {
          continue;
        }
      }
      assignNodeGraphTypedDisplaySettingsEverywhere(node, settingsSchema, toApply);
      anyApplied = true;
      if (settingsSchema === "spectrogramBurn") {
        needsParamSync = true;
      }
    }
    if (!anyApplied) {
      return null;
    }
    // Spectrogram bins ride params for the worklet — push a param sync.
    if (needsParamSync && typeof scheduleNodeGraphLiveParameterSync === "function") {
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
  // Force so background/color sticks while Stopped (paused schedule would
  // otherwise skip the full path; cold plates still run, but force refreshes
  // energy faces too after Clear-while-paused style freezes).
  scheduleNodeGraphModuleScopeDraw({ force: true });
  if (typeof syncNodeGraphStampPreview === "function") {
    syncNodeGraphStampPreview(
      document.getElementById("nodeTraceDisplaySettingsPopover"),
      settings,
    );
  }
  const dirty = nodeGraphMvp.traceDisplaySettingsDirtyKeys;
  const inkOnly = dirty
    && dirty.size > 0
    && ![...dirty].some((key) => {
      const k = String(key || "");
      return k === "*"
        || k === "background"
        || k === "backgroundColor"
        || k === "backgroundHue"
        || k === "backgroundBrightness"
        || k === "historySeconds"
        || k === "zoomSeconds"
        || k === "pixelDensity"
        || k === "scale";
    });
  if (typeof paintNodeGraphModuleScopeColdPlatesOnly === "function" && !inkOnly) {
    paintNodeGraphModuleScopeColdPlatesOnly(undefined, { force: true });
  }
  // XY Pad face is not a scope slot — repaint pads when display settings change.
  if (typeof nodeGraphXyPadRedrawAll === "function") {
    nodeGraphXyPadRedrawAll();
  }
  if (typeof nodeGraphSyncOutputProtectOverlay === "function") {
    nodeGraphSyncOutputProtectOverlay(globalThis.nodeGraphOutputProtectMute || 0, { force: true });
  }
  // Knob face readout decimals live in Display Settings.
  if (typeof refreshNodeGraphKnobFaces === "function") {
    refreshNodeGraphKnobFaces();
  }
  // Face cosmetics for every multi-adjust target (LED / RGB / FBM …).
  if (!nodeGraphTraceDisplaySettingsEditingTraceDefaults()) {
    const targetIds = typeof nodeGraphTraceDisplaySettingsActiveTargetIds === "function"
      ? nodeGraphTraceDisplaySettingsActiveTargetIds()
      : [nodeGraphTraceDisplaySettingsTargetNodeId()].filter(Boolean);
    for (const faceNodeId of targetIds) {
      const faceNode = faceNodeId ? nodeGraphPatchNode(faceNodeId) : null;
      if (!faceNode) {
        continue;
      }
      if (faceNode.type === "keypad") {
        if (typeof applyNodeGraphKeypadDisplaySettingsToFace === "function") {
          applyNodeGraphKeypadDisplaySettingsToFace(faceNode);
        } else if (typeof syncNodeGraphKeypadElement === "function") {
          const el = typeof nodeGraphNodeElement === "function"
            ? nodeGraphNodeElement(faceNodeId)
            : null;
          if (el) syncNodeGraphKeypadElement(el, faceNode);
        }
      }
      if (faceNode.type === "led") {
        if (typeof scheduleNodeGraphLedFaceRefresh === "function") {
          scheduleNodeGraphLedFaceRefresh(faceNodeId);
        } else if (typeof refreshNodeGraphLedFaceForNode === "function") {
          refreshNodeGraphLedFaceForNode(faceNodeId);
        }
      }
      if (faceNode.type === "rgbShape" && typeof paintNodeGraphRgbShapeFaceForNode === "function") {
        paintNodeGraphRgbShapeFaceForNode(faceNodeId);
        requestAnimationFrame(() => paintNodeGraphRgbShapeFaceForNode(faceNodeId));
      }
      if (faceNode.type === "rgbPicture" && typeof paintNodeGraphRgbPictureFaceForNode === "function") {
        paintNodeGraphRgbPictureFaceForNode(faceNodeId);
        requestAnimationFrame(() => paintNodeGraphRgbPictureFaceForNode(faceNodeId));
      }
      if (faceNode.type === "rgbFractal" && typeof paintNodeGraphRgbFractalFaceForNode === "function") {
        paintNodeGraphRgbFractalFaceForNode(faceNodeId, { force: true, dt: 0 });
        requestAnimationFrame(() => paintNodeGraphRgbFractalFaceForNode(faceNodeId, { force: true, dt: 0 }));
      }
      if (faceNode.type === "fbmField" && typeof paintNodeGraphFbmFieldFaceForNode === "function") {
        paintNodeGraphFbmFieldFaceForNode(faceNodeId, { force: true, dt: 0 });
        requestAnimationFrame(() => paintNodeGraphFbmFieldFaceForNode(faceNodeId, { force: true, dt: 0 }));
      }
    }
  }
  return settings;
}

function commitOpenNodeGraphTraceDisplaySettings() {
  const popover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover || popover.hidden || nodeGraphMvp.sharedInspectorActive !== "traceDisplaySettings") {
    return null;
  }
  // No user edits since last seed → do not push primary colors onto multi-targets.
  if (!nodeGraphTraceDisplaySettingsIsDirty()) {
    return null;
  }
  const applied = applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
  clearNodeGraphTraceDisplaySettingsDirty();
  return applied;
}

/**
 * Color / gradient keys kept when pressing Defaults on phosphor (and other
 * gradient) faces — reset numbers only; leave look (stops + solid colors).
 */
const NODE_GRAPH_DISPLAY_SETTINGS_PRESERVE_LOOK_KEYS = Object.freeze([
  "gradientStops",
  "gradient",
  "background",
  "backgroundColor",
  "backgroundHue",
  "backgroundBrightness",
  "color",
  "peakColor",
  "dot1Color",
  "secondaryColor",
  "meetColor",
  "ghostColor",
  "arcFill",
  "arcTrack",
  "buttonColor",
  "textColor",
  "strokeColor",
]);

function cloneNodeGraphDisplaySettingsClipboardBag(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  try {
    return JSON.parse(JSON.stringify(source));
  } catch (_error) {
    return { ...source };
  }
}

function nodeGraphDisplaySettingsClipboardFamilyForOpenForm() {
  const formType = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  return typeof nodeGraphDisplaySettingsClipboardFamily === "function"
    ? nodeGraphDisplaySettingsClipboardFamily(formType)
    : "";
}

function syncNodeGraphTraceDisplaySettingsClipboardButtons() {
  const family = nodeGraphDisplaySettingsClipboardFamilyForOpenForm();
  const copyBtn = document.getElementById("nodeTraceDisplaySettingsCopy");
  const pasteBtn = document.getElementById("nodeTraceDisplaySettingsPaste");
  const clip = nodeGraphMvp?.displaySettingsClipboard;
  const clipFamily = String(clip?.family || "");
  const row = copyBtn?.parentElement || pasteBtn?.parentElement;
  if (row?.classList) {
    row.classList.toggle("is-clipboard-row", Boolean(family));
  }
  if (copyBtn) {
    copyBtn.hidden = !family;
    copyBtn.disabled = !family;
    copyBtn.title = family
      ? `Copy ${nodeGraphDisplaySettingsClipboardFamilyLabel?.(family) || family} display settings`
      : "";
  }
  if (pasteBtn) {
    pasteBtn.hidden = !family;
    pasteBtn.disabled = !family || !clipFamily || clipFamily !== family;
    pasteBtn.title = !family
      ? ""
      : (!clipFamily
        ? "Paste display settings"
        : (clipFamily === family
          ? `Paste ${nodeGraphDisplaySettingsClipboardFamilyLabel?.(clipFamily) || clipFamily} display settings`
          : `Clipboard is ${nodeGraphDisplaySettingsClipboardFamilyLabel?.(clipFamily) || clipFamily}`));
  }
}

function copyNodeGraphTraceDisplaySettings() {
  const family = nodeGraphDisplaySettingsClipboardFamilyForOpenForm();
  if (!family) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This face cannot copy display settings.");
    }
    return;
  }
  const settings = typeof readNodeGraphTraceDisplaySettingsForm === "function"
    ? readNodeGraphTraceDisplaySettingsForm()
    : null;
  if (!settings || typeof settings !== "object") {
    return;
  }
  nodeGraphMvp.displaySettingsClipboard = {
    family,
    settings: cloneNodeGraphDisplaySettingsClipboardBag(settings),
  };
  syncNodeGraphTraceDisplaySettingsClipboardButtons();
  const label = typeof nodeGraphDisplaySettingsClipboardFamilyLabel === "function"
    ? nodeGraphDisplaySettingsClipboardFamilyLabel(family)
    : family;
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(`Copied ${label} display settings.`);
  }
}

function pasteNodeGraphTraceDisplaySettings() {
  const family = nodeGraphDisplaySettingsClipboardFamilyForOpenForm();
  const clip = nodeGraphMvp?.displaySettingsClipboard;
  const clipFamily = String(clip?.family || "");
  if (!family) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("This face cannot paste display settings.");
    }
    return;
  }
  if (!clipFamily || !clip.settings) {
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp("Nothing to paste. Copy display settings first.");
    }
    return;
  }
  if (clipFamily !== family) {
    const from = typeof nodeGraphDisplaySettingsClipboardFamilyLabel === "function"
      ? nodeGraphDisplaySettingsClipboardFamilyLabel(clipFamily)
      : clipFamily;
    const to = typeof nodeGraphDisplaySettingsClipboardFamilyLabel === "function"
      ? nodeGraphDisplaySettingsClipboardFamilyLabel(family)
      : family;
    if (typeof setNodeInteractionHelp === "function") {
      setNodeInteractionHelp(`Can't paste: clipboard is ${from}, this face is ${to}.`);
    }
    return;
  }
  const bag = cloneNodeGraphDisplaySettingsClipboardBag(clip.settings);
  writeNodeGraphTraceDisplaySettingsForm(bag);
  markNodeGraphTraceDisplaySettingsDirty("*");
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, forceAll: true });
  clearNodeGraphTraceDisplaySettingsDirty();
  const label = typeof nodeGraphDisplaySettingsClipboardFamilyLabel === "function"
    ? nodeGraphDisplaySettingsClipboardFamilyLabel(family)
    : family;
  if (typeof setNodeInteractionHelp === "function") {
    setNodeInteractionHelp(`Pasted ${label} display settings.`);
  }
}

function setNodeGraphTraceDisplaySettingsDefaults() {
  const formType = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  const defaults = typeof nodeGraphDisplaySettingsDefaultsForFormType === "function"
    ? nodeGraphDisplaySettingsDefaultsForFormType(formType)
    : {};
  // Preserve live look from the open form (or current node settings).
  const current = typeof readNodeGraphTraceDisplaySettingsForm === "function"
    ? readNodeGraphTraceDisplaySettingsForm()
    : null;
  const merged = { ...(defaults && typeof defaults === "object" ? defaults : {}) };
  if (current && typeof current === "object") {
    for (const key of NODE_GRAPH_DISPLAY_SETTINGS_PRESERVE_LOOK_KEYS) {
      if (current[key] != null) {
        merged[key] = current[key];
      }
    }
  }
  writeNodeGraphTraceDisplaySettingsForm(merged);
  // Defaults is an explicit edit of numeric fields (look preserved in merge).
  markNodeGraphTraceDisplaySettingsDirty("*");
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, forceAll: true });
  clearNodeGraphTraceDisplaySettingsDirty();
}

function nodeGraphTraceDisplaySettingsDirtyKeysFromEvent(event) {
  const t = event?.target;
  if (!t || !t.closest) {
    return ["*"];
  }
  const field = t.closest?.("[data-trace-display-field]")
    || (t.matches?.("[data-trace-display-field]") ? t : null);
  if (field) {
    return [field.getAttribute("data-trace-display-field") || field.dataset?.traceDisplayField].filter(Boolean);
  }
  const color = t.closest?.("[data-trace-display-color]")
    || (t.matches?.("[data-trace-display-color]") ? t : null);
  if (color) {
    return [color.getAttribute("data-trace-display-color") || color.dataset?.traceDisplayColor].filter(Boolean);
  }
  const toggle = t.closest?.("[data-trace-display-toggle]")
    || (t.matches?.("[data-trace-display-toggle]") ? t : null);
  if (toggle) {
    return [toggle.getAttribute("data-trace-display-toggle") || toggle.dataset?.traceDisplayToggle].filter(Boolean);
  }
  const choice = t.closest?.("[data-trace-display-choice]")
    || (t.matches?.("[data-trace-display-choice]") ? t : null);
  if (choice) {
    return [choice.getAttribute("data-trace-display-choice") || choice.dataset?.traceDisplayChoice].filter(Boolean);
  }
  const latch = t.closest?.("[data-latch-button][data-trace-display-toggle]");
  if (latch) {
    return [latch.getAttribute("data-trace-display-toggle") || latch.dataset?.traceDisplayToggle].filter(Boolean);
  }
  // Gradient editor / hue title / unknown control — treat as full form dirty.
  if (t.closest?.("[data-shared-gradient-editor], [data-hue-title-stepper], .node-shared-gradient-editor")) {
    return ["gradientStops", "background", "backgroundColor"];
  }
  return ["*"];
}

function updateNodeGraphTraceDisplaySettingsLive(event) {
  markNodeGraphTraceDisplaySettingsDirty(nodeGraphTraceDisplaySettingsDirtyKeysFromEvent(event));
  applyNodeGraphTraceDisplaySettingsForm({ persist: "none", record: false });
}

function commitNodeGraphTraceDisplaySettingsChange(event) {
  if (nodeGraphTraceDisplayFieldFromTarget(event?.target)) {
    return;
  }
  // Skip change events from our owned pointerdown toggle (avoids double-apply /
  // undoing Full Dots when the label also fires a native change).
  const toggle = event?.target?.closest?.("[data-trace-display-toggle], [data-latch-button]")
    || (event?.target?.matches?.("[data-trace-display-toggle]") ? event.target : null);
  if (toggle?.dataset?.traceDisplayToggleOwned === "1") {
    return;
  }
  // Latch buttons apply on pointerdown — ignore stray change/input from them.
  if (event?.target?.closest?.("[data-latch-button][data-trace-display-toggle]")) {
    return;
  }
  markNodeGraphTraceDisplaySettingsDirty(nodeGraphTraceDisplaySettingsDirtyKeysFromEvent(event));
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
}
