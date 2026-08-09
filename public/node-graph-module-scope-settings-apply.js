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
    node.traceDisplaySettings = normalizeNodeGraphNumberReadoutSettings(settings);
    return node.traceDisplaySettings;
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
        // Keep face blob in sync for image-layer rotate math (centered span).
        showReadout: normalized.showReadout,
        showLabel: normalized.showLabel,
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
  if (nodeGraphTraceDisplayFieldFromTarget(event?.target)) {
    return;
  }
  applyNodeGraphTraceDisplaySettingsForm({ persist: "immediate", record: true, commit: true });
}
