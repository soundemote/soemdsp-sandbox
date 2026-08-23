function cloneNodeGraphParamMeta(paramMeta = {}) {
  return Object.fromEntries(
    Object.entries(paramMeta || {}).map(([key, metadata]) => [
      key,
      {
        ...(metadata || {}),
        choices: [...(metadata?.choices || [])],
      },
    ]),
  );
}

function normalizeNodeGraphParamMetaForNode(type, paramMeta = {}) {
  return cloneNodeGraphParamMeta(paramMeta);
}

function normalizeNodeGraphPatchPortMeta(portMeta = {}) {
  const source = portMeta && typeof portMeta === "object" ? portMeta : {};
  const normalizeGroup = (group = {}) => Object.fromEntries(
    Object.entries(group || {})
      .map(([port, metadata]) => [
        String(port || "").trim(),
        { alias: normalizeNodeGraphPatchMetadataAlias(metadata?.alias) },
      ])
      .filter(([port, metadata]) => port && metadata.alias),
  );
  const input = normalizeGroup(source.input);
  const output = normalizeGroup(source.output);
  return {
    ...(Object.keys(input).length ? { input } : {}),
    ...(Object.keys(output).length ? { output } : {}),
  };
}

function normalizeNodeGraphPatchNodeUi(ui = {}, type = "") {
  const source = ui && typeof ui === "object" ? ui : {};
  const alwaysHideSliders = type
    && typeof nodeGraphModuleTypeSlidersAlwaysHidden === "function"
    && nodeGraphModuleTypeSlidersAlwaysHidden(type);
  // LayoutB (Knob, LED, XY Pad, …) shows a normal title bar by default.
  // "Hide title" still sets titleHidden:true and persists.
  const titleHidden = Object.prototype.hasOwnProperty.call(source, "titleHidden")
    ? Boolean(source.titleHidden)
    : false;
  return {
    buttonsHidden: Boolean(source.buttonsHidden),
    // Force-show override when Visibility has the section globally hidden.
    buttonsForceShow: Boolean(source.buttonsForceShow || source.buttonsShown),
    displayHeightOffsetGu: type
      ? normalizeNodeGraphModuleDisplayHeightOffsetUnits(type, source.displayHeightOffsetGu)
      : normalizeNodeGraphModuleDisplayHeightOffsetUnits(source.displayHeightOffsetGu),
    // Multi-mode faces removed — displayModeKey is no longer stored or used.
    displayModeKey: "",
    ioHidden: Boolean(source.ioHidden),
    // Hide unconnected I/O jacks (and mute unused param ports) on this module.
    hideUnused: Boolean(source.hideUnused || source.unusedHidden),
    interfaceControlsHidden: Boolean(source.interfaceControlsHidden),
    interfaceControlsForceShow: Boolean(
      source.interfaceControlsForceShow || source.interfaceControlsShown,
    ),
    movementLocked: Boolean(source.movementLocked),
    oscilloscopeHidden: Boolean(source.oscilloscopeHidden),
    oscilloscopeForceShow: Boolean(source.oscilloscopeForceShow || source.oscilloscopeShown),
    // LayoutA policy: definition.slidersAlwaysHidden forces param rows off.
    slidersHidden: alwaysHideSliders || Boolean(source.slidersHidden),
    slidersForceShow: alwaysHideSliders
      ? false
      : Boolean(source.slidersForceShow || source.slidersShown),
    titleHidden,
  };
}

/** @deprecated Multi-mode faces removed — always empty (one face per module). */
function normalizeNodeGraphPatchNodeDisplayModeKey(_type, _value = "") {
  return "";
}

/**
 * Global Visibility + local override:
 * - global shown → modules follow; a global Show also clears leftover *Hidden
 *   so H / Visibility unhide actually reveals every module
 * - global hidden → modules hide; local *ForceShow forces show
 * Per-module toggle never flips the global flag.
 */
function nodeGraphPatchNodeSectionEffectivelyHidden(localHidden, localForceShow, globalVisible) {
  if (localForceShow) {
    return false;
  }
  if (localHidden) {
    return true;
  }
  return globalVisible === false;
}

function nodeGraphEffectivePatchNodeUi(ui = {}, type = "") {
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, type);
  const alwaysHideSliders = type
    && typeof nodeGraphModuleTypeSlidersAlwaysHidden === "function"
    && nodeGraphModuleTypeSlidersAlwaysHidden(type);
  const globalButtons = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleButtonsVisible : false;
  const globalScopes = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleOscilloscopesVisible : true;
  const globalInterface = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleInterfaceControlsVisible : true;
  const globalSliders = typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleSlidersVisible : true;
  const buttonsHidden = nodeGraphPatchNodeSectionEffectivelyHidden(
    normalizedUi.buttonsHidden,
    normalizedUi.buttonsForceShow,
    globalButtons,
  );
  const oscilloscopeHidden = nodeGraphPatchNodeSectionEffectivelyHidden(
    normalizedUi.oscilloscopeHidden,
    normalizedUi.oscilloscopeForceShow,
    globalScopes,
  );
  const interfaceControlsHidden = nodeGraphPatchNodeSectionEffectivelyHidden(
    normalizedUi.interfaceControlsHidden,
    normalizedUi.interfaceControlsForceShow,
    globalInterface,
  );
  const slidersHidden = alwaysHideSliders || nodeGraphPatchNodeSectionEffectivelyHidden(
    normalizedUi.slidersHidden,
    normalizedUi.slidersForceShow,
    globalSliders,
  );
  return {
    ...normalizedUi,
    // Effective (resolved) hide flags for layout / menus.
    buttonsHidden,
    oscilloscopeHidden,
    interfaceControlsHidden,
    slidersHidden,
    // Force-show only when local override is active and section is effectively visible.
    buttonsForceShow: Boolean(normalizedUi.buttonsForceShow) && !buttonsHidden,
    oscilloscopeForceShow: Boolean(normalizedUi.oscilloscopeForceShow) && !oscilloscopeHidden,
    interfaceControlsForceShow: Boolean(normalizedUi.interfaceControlsForceShow) && !interfaceControlsHidden,
    slidersForceShow: Boolean(normalizedUi.slidersForceShow) && !slidersHidden && !alwaysHideSliders,
  };
}

/** @deprecated use nodeGraphPatchNodeSectionEffectivelyHidden */
function nodeGraphPatchNodeSectionVisible(localHidden, globalVisible) {
  return !nodeGraphPatchNodeSectionEffectivelyHidden(localHidden, false, globalVisible);
}

/**
 * Set local override so the section ends up hidden/shown without changing global Visibility.
 * wantHidden true → hide this module; false → show this module.
 */
function nodeGraphPatchNodeUiSetSectionWantHidden(ui, section, wantHidden, globalVisible) {
  const next = ui && typeof ui === "object" ? { ...ui } : {};
  const hiddenKey = `${section}Hidden`;
  const showKey = `${section}ForceShow`;
  const globalOn = globalVisible !== false;
  if (wantHidden) {
    // Want hide: if global already hides, clear override; else force hide.
    if (!globalOn) {
      next[hiddenKey] = false;
      next[showKey] = false;
    } else {
      next[hiddenKey] = true;
      next[showKey] = false;
    }
  } else {
    // Want show: if global already shows, clear override; else force show.
    if (globalOn) {
      next[hiddenKey] = false;
      next[showKey] = false;
    } else {
      next[hiddenKey] = false;
      next[showKey] = true;
    }
  }
  return next;
}

function normalizeNodeGraphPatchNodeAlias(alias) {
  return String(alias ?? "").trim().slice(0, 64);
}

function normalizeNodeGraphGraphConnections(graphConnections = []) {
  if (!Array.isArray(graphConnections)) {
    return [];
  }
  return graphConnections.map((connection) => ({
    destinationGraphInput: String(connection.destinationGraphInput || "").trim(),
    destinationNode: String(connection.destinationNode || "").trim(),
    sourceNode: String(connection.sourceNode || "").trim(),
    sourcePort: String(connection.sourcePort || "").trim(),
    ...(typeof nodeGraphWireOptionalPatchFields === "function"
      ? nodeGraphWireOptionalPatchFields(connection)
      : {
        ...(nodeGraphWireTypePatchValue(connection.wireType)
          ? { wireType: nodeGraphWireTypePatchValue(connection.wireType) }
          : {}),
        ...(normalizeNodeGraphTracePoints(connection.tracePoints).length
          ? { tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints) }
          : {}),
      }),
  })).filter((connection) =>
    connection.sourceNode &&
    connection.sourcePort &&
    connection.destinationNode &&
    connection.destinationGraphInput,
  );
}

const nodeGraphLedDefaultColor = "#ff0000";

// When true, titles become "1D Waterfall 2" from id suffix. When false (default),
// every instance uses the plain label ("1D Waterfall") — cosmetic only; ids stay unique.
const nodeGraphModuleTitleAppendIdSuffix = false;

function nodeGraphDefaultNodeTitle(type, id) {
  const label = nodeGraphNodeLabels[type] || String(type || "");
  if (!nodeGraphModuleTitleAppendIdSuffix) {
    return label;
  }
  const idText = String(id || "").trim();
  const suffix = idText.split("-").at(-1) || "";
  if (id === type || idText.toLowerCase() === label.toLowerCase() || suffix.toLowerCase() === label.toLowerCase()) {
    return label;
  }
  return `${label} ${suffix}`;
}

/**
 * Chrome header / Module Settings “selected” line: user alias when set,
 * otherwise the module type title (or plugin/group binding name).
 * Same resolution as nodeGraphPatchNodeTitle for ordinary modules.
 */
function nodeGraphModuleChromeTitle(node) {
  if (typeof nodeGraphPatchNodeTitle === "function") {
    return nodeGraphPatchNodeTitle(node);
  }
  const patchNode = typeof node === "string"
    ? (typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null)
    : node;
  if (!patchNode || typeof patchNode !== "object") {
    const type = typeof nodeGraphNodeType === "function" ? nodeGraphNodeType(node) : "";
    return nodeGraphNodeLabels?.[type] || String(node || type || "");
  }
  if (patchNode.type === "moduleGroup") {
    return normalizeNodeGraphModuleGroup(patchNode.moduleGroup).name
      || nodeGraphNodeLabels.moduleGroup
      || "Module Group";
  }
  return normalizeNodeGraphPatchNodeAlias(patchNode.alias)
    || nodeGraphDefaultNodeTitle(patchNode.type, patchNode.id);
}

function nodeGraphPatchNodeTitle(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (!patchNode) {
    return nodeGraphNodeLabels[nodeGraphNodeType(node)] || String(node || "");
  }
  if (patchNode.type === "moduleGroup") {
    return normalizeNodeGraphPatchNodeAlias(patchNode.alias) ||
      normalizeNodeGraphModuleGroup(patchNode.moduleGroup).name ||
      nodeGraphNodeLabels.moduleGroup;
  }
  return normalizeNodeGraphPatchNodeAlias(patchNode.alias) || nodeGraphDefaultNodeTitle(patchNode.type, patchNode.id);
}

function cloneNodeGraphTypedDisplaySettings(node) {
  const displayType = typeof nodeGraphModuleDisplaySettingsSchemaForNode === "function"
    ? nodeGraphModuleDisplaySettingsSchemaForNode(node)
    : nodeGraphModuleDefinitions?.[node?.type]?.displayType || "";
  const isOutput = node?.type === "output";
  const migrate = typeof migrateNodeGraphLegacyDot2Settings === "function"
    ? migrateNodeGraphLegacyDot2Settings
    : (settings) => settings;
  const bag = migrate(node?.traceDisplaySettings, displayType === "trace" && isOutput);
  switch (displayType) {
    case "dot":
      return { zeroDBurnSettings: normalizeNodeGraphZeroDBurnSettings(migrate(node.zeroDBurnSettings, false)) };
    case "vectorDot":
    case "pulseDot": {
      const packed = node.vectorDotSettings
        || (typeof nodeGraphMigrateLegacyLedToVectorDot === "function"
          ? nodeGraphMigrateLegacyLedToVectorDot(node.led)
          : node.led)
        || node.zeroDBurnSettings
        || {};
      return {
        vectorDotSettings: typeof normalizeNodeGraphVectorDotSettings === "function"
          ? normalizeNodeGraphVectorDotSettings(packed)
          : packed,
      };
    }
    case "lineBurn":
      return { traceDisplaySettings: normalizeNodeGraphLineBurnSettings(bag) };
    case "value":
      return { traceDisplaySettings: normalizeNodeGraphValueOscilloscopeSettings(bag) };
    case "scope2d":
    case "phosphorLight":
    case "videoscopeBurn":
    case "oscilloscopeBankBurn":
    case "hypersawBurn": {
      const raw = bag || {};
      const mapped = {
        ...raw,
        background: raw.background ?? raw.backgroundColor,
        dot1Color: raw.dot1Color ?? raw.color,
        dot1Brightness: raw.dot1Brightness ?? raw.brightness,
        lineThickness: raw.lineThickness ?? raw.dot1Blur,
      };
      const typeDefaults = typeof nodeGraphScope2dSettingsDefaultsForModuleType === "function"
        ? nodeGraphScope2dSettingsDefaultsForModuleType(node?.type)
        : null;
      return { traceDisplaySettings: normalizeNodeGraphScope2dSettings(mapped, typeDefaults) };
    }
    case "scope2dTrace": {
      const typeDefaults = typeof nodeGraphScope2dTraceSettingsDefaultsForModuleType === "function"
        ? nodeGraphScope2dTraceSettingsDefaultsForModuleType(node?.type)
        : null;
      return { traceDisplaySettings: normalizeNodeGraphScope2dTraceSettings(bag, typeDefaults) };
    }
    case "numberReadout": {
      const defaults = typeof nodeGraphNumberReadoutDefaultsForNode === "function"
        ? nodeGraphNumberReadoutDefaultsForNode(node)
        : null;
      return { traceDisplaySettings: normalizeNodeGraphNumberReadoutSettings(bag, defaults) };
    }
    case "xyPad":
      return typeof normalizeNodeGraphXyPadDisplaySettings === "function"
        ? { traceDisplaySettings: normalizeNodeGraphXyPadDisplaySettings(bag) }
        : { traceDisplaySettings: bag || {} };
    case "spectrogramBurn": {
      const merged = { ...(bag || {}) };
      if (merged.fftSize == null && node.params?.fftSize != null) {
        merged.fftSize = node.params.fftSize;
      }
      return {
        traceDisplaySettings: typeof normalizeNodeGraphSpectrogramSettings === "function"
          ? normalizeNodeGraphSpectrogramSettings(merged, node)
          : merged,
      };
    }
    case "phosphorWaveform":
      return {
        phosphorWaveformSettings: typeof normalizeNodeGraphPhosphorWaveformSettings === "function"
          ? normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings)
          : (node.phosphorWaveformSettings || {}),
      };
    case "knobFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphKnobFaceDisplaySettings === "function"
          ? normalizeNodeGraphKnobFaceDisplaySettings(bag)
          : (bag || {}),
      };
    case "portalFace": {
      const channel = typeof nodeGraphPortalClampChannel === "function"
        ? nodeGraphPortalClampChannel(node?.params?.channel)
        : Math.max(0, Math.round(Number(node?.params?.channel) || 0));
      return { params: { ...(node.params || {}), channel } };
    }
    case "roundShapeFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphRoundShapeFaceSettings === "function"
          ? normalizeNodeGraphRoundShapeFaceSettings(bag)
          : (bag || {}),
      };
    case "toggleButtonFace":
    case "momentaryButtonFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphPluginButtonDisplaySettings === "function"
          ? normalizeNodeGraphPluginButtonDisplaySettings(bag)
          : (bag || {}),
      };
    case "keypadFace":
      return {
        layout: typeof normalizeNodeGraphKeypadLayout === "function"
          ? normalizeNodeGraphKeypadLayout(node.layout)
          : (node.layout || {}),
      };
    case "textBoxFace":
      return {
        layout: typeof normalizeNodeGraphTextBoxLayout === "function"
          ? normalizeNodeGraphTextBoxLayout(node.layout)
          : (node.layout || {}),
      };
    case "patchFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphPatchFaceDisplaySettings === "function"
          ? normalizeNodeGraphPatchFaceDisplaySettings(bag)
          : (bag || {}),
      };
    case "limiterGainFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphLimiterGainFaceSettings === "function"
          ? normalizeNodeGraphLimiterGainFaceSettings(bag)
          : (bag || {}),
      };
    case "evolveFieldFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphEvolveFieldSettings === "function"
          ? normalizeNodeGraphEvolveFieldSettings(bag)
          : (bag || {}),
      };
    case "rgbShapeFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphRgbShapeSettings === "function"
          ? normalizeNodeGraphRgbShapeSettings(bag)
          : (bag || {}),
      };
    case "rgbPictureFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphRgbPictureSettings === "function"
          ? normalizeNodeGraphRgbPictureSettings(node.rgbPicture || bag)
          : (bag || {}),
      };
    case "rgbFractalFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphRgbFractalSettings === "function"
          ? normalizeNodeGraphRgbFractalSettings(bag)
          : (bag || {}),
      };
    case "fbmFieldFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphFbmFieldSettings === "function"
          ? normalizeNodeGraphFbmFieldSettings(bag)
          : (bag || {}),
      };
    case "vectorRgbFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphVectorRgbSettings === "function"
          ? normalizeNodeGraphVectorRgbSettings(bag)
          : (bag || {}),
      };
    case "rasterRgbFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphRasterRgbSettings === "function"
          ? normalizeNodeGraphRasterRgbSettings(bag)
          : (bag || {}),
      };
    case "gradientVectorscopeFace":
      return {
        traceDisplaySettings: typeof normalizeNodeGraphGradientVectorscopeSettings === "function"
          ? normalizeNodeGraphGradientVectorscopeSettings(bag)
          : (bag || {}),
      };
    case "matrixFace":
    case "matrixWaterfallFace":
    case "matrixDisplayFace": {
      if (node.type === "matrixWaterfall" || displayType === "matrixWaterfallFace") {
        const settings = node.matrixWaterfall || node.matrixDisplay || bag;
        return {
          matrixWaterfall: typeof normalizeNodeGraphMatrixWaterfall === "function"
            ? normalizeNodeGraphMatrixWaterfall(settings)
            : (typeof normalizeNodeGraphMatrixFaceSettings === "function"
              ? normalizeNodeGraphMatrixFaceSettings(settings, "matrixWaterfallFace")
              : (settings || {})),
        };
      }
      const settings = node.matrixDisplay || bag;
      return {
        matrixDisplay: typeof normalizeNodeGraphMatrixPlate === "function"
          ? normalizeNodeGraphMatrixPlate(settings)
          : (typeof normalizeNodeGraphMatrixFaceSettings === "function"
            ? normalizeNodeGraphMatrixFaceSettings(settings, "matrixDisplayFace")
            : (settings || {})),
      };
    }
    case "trace":
    case "traceXyz":
      return { traceDisplaySettings: normalizeNodeGraphTraceDisplaySettings(bag) };
    default:
      if (node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object") {
        return { traceDisplaySettings: { ...node.traceDisplaySettings } };
      }
      return {};
  }
}

function cloneNodeGraphPatch(patch) {
  const cameraState = normalizeNodeGraphPatchCameras(patch.cameras, patch.activeCameraId);
  return {
    activeCameraId: cameraState.activeCameraId,
    audio: normalizeNodeGraphPatchAudio(patch.audio),
    bypassedNodes: Array.isArray(patch.bypassedNodes) ? [...patch.bypassedNodes] : [],
    cameras: cameraState.cameras,
    codeScreen: normalizeNodeGraphCodeScreen(patch.codeScreen),
    connections: (patch.connections || []).map((connection) => ({
      ...connection,
      tracePoints: normalizeNodeGraphTracePoints(connection.tracePoints),
    })),
    format: { ...(patch.format || nodeGraphPatchFormat) },
    grid: normalizeNodeGraphPatchGrid(patch.grid),
    graphConnections: normalizeNodeGraphGraphConnections(patch.graphConnections),
    info: normalizeNodeGraphPatchInfo(patch.info),
    modularOnlyControlsVisible: Boolean(patch.modularOnlyControlsVisible),
    modulations: (patch.modulations || []).map((modulation) => ({
      ...modulation,
      tracePoints: normalizeNodeGraphTracePoints(modulation.tracePoints),
    })),
    monitors: normalizeNodeGraphPatchMonitors(patch.monitors, patch),
    nodes: (patch.nodes || []).map((rawNode) => {
      const node = typeof migrateNodeGraphPhosphorLightToScope2d === "function"
        ? migrateNodeGraphPhosphorLightToScope2d(rawNode)
        : rawNode;
      const ui = nodeGraphModuleDefinitions[node.type]?.layout === "textBox" && !Object.hasOwn(node, "ui")
        ? { buttonsHidden: true }
        : normalizeNodeGraphPatchNodeUi(node.ui, node.type);
      if (ui.displayModeKey) {
        ui.displayModeKey = "";
      }
      return {
        ...node,
        ...(normalizeNodeGraphPatchNodeAlias(node.alias)
          ? { alias: normalizeNodeGraphPatchNodeAlias(node.alias) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "textBox"
          ? { layout: normalizeNodeGraphTextBoxLayout(node.layout) }
          : {}),
        ...(node.type === "keypad" && typeof normalizeNodeGraphKeypadLayout === "function"
          ? { layout: normalizeNodeGraphKeypadLayout(node.layout) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "image"
          ? { layout: normalizeNodeGraphImageLayout(node.layout) }
          : {}),
        ...(node.type === "led"
          ? {
            vectorDotSettings: typeof normalizeNodeGraphVectorDotSettings === "function"
              ? normalizeNodeGraphVectorDotSettings(
                node.vectorDotSettings
                || (typeof nodeGraphMigrateLegacyLedToVectorDot === "function"
                  ? nodeGraphMigrateLegacyLedToVectorDot(node.led)
                  : node.led),
              )
              : (node.vectorDotSettings || {}),
          }
          : {}),
        ...(nodeGraphModuleIsGraphType(node.type)
          ? {
            graph: nodeGraphGraphEndpointYLockEnabledForNode(node)
              ? nodeGraphGraphWithLockedEndpointY(nodeGraphGraphWithPhaseCursor(node))
              : nodeGraphGraphWithPhaseCursor(node),
          }
          : {}),
        ...(node.type === "codeblock"
          ? { codeblock: normalizeNodeGraphCodeblock(node.codeblock) }
          : {}),
        ...(node.type === "customDisplay"
          ? { customDisplay: normalizeNodeGraphCustomDisplay(node.customDisplay) }
          : {}),
        ...(node.type === "matrixWaterfall" && typeof normalizeNodeGraphMatrixWaterfall === "function"
          ? {
            matrixWaterfall: normalizeNodeGraphMatrixWaterfall(
              node.matrixWaterfall || node.matrixDisplay,
            ),
          }
          : {}),
        ...(node.type === "matrixDisplay"
          ? {
            matrixDisplay: typeof normalizeNodeGraphMatrixPlate === "function"
              ? normalizeNodeGraphMatrixPlate(node.matrixDisplay)
              : (typeof normalizeNodeGraphAsciiscope === "function"
                ? normalizeNodeGraphAsciiscope(node.matrixDisplay)
                : node.matrixDisplay),
          }
          : {}),
        ...(node.type === "asciiscope" && typeof normalizeNodeGraphMatrixDisplay === "function"
          ? {
            asciiscope: normalizeNodeGraphMatrixDisplay(
              node.asciiscope?.glyphRamp != null ? node.asciiscope : node.matrixDisplay,
            ),
          }
          : {}),
        ...(node.type === "textStream" && typeof normalizeNodeGraphTextStream === "function"
          ? { textStream: normalizeNodeGraphTextStream(node.textStream) }
          : {}),
        ...(node.type === "canvas"
          ? { canvasScript: normalizeNodeGraphCanvasScript(node.canvasScript) }
          : {}),
        ...(node.type === "screenSpaceShader"
          ? { screenSpaceShader: normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader) }
          : {}),
        ...cloneNodeGraphTypedDisplaySettings(node),
        ...(Object.hasOwn(node, "scopeShader")
          ? { scopeShader: normalizeNodeGraphScopeShader(node.scopeShader) }
          : {}),
        ...(node.type === "moduleGroup"
          ? { moduleGroup: normalizeNodeGraphModuleGroup(node.moduleGroup) }
          : {}),
        ...((node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") && node.sample
          ? (() => {
            const pointer = typeof normalizeNodeGraphNodeSamplePointer === "function"
              ? normalizeNodeGraphNodeSamplePointer(node.sample)
              : (normalizeNodeGraphSampleId(node.sample?.id) ? { id: normalizeNodeGraphSampleId(node.sample.id) } : null);
            return pointer ? { sample: pointer } : {};
          })()
          : {}),
        ...(node.type === "audioPlayer" && Object.hasOwn(node, "phosphorWaveformSettings")
          ? { phosphorWaveformSettings: normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings) }
          : {}),
        ...(node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhase))
          ? { samplePhase: Math.max(0, Math.min(1, Number(node.samplePhase))) }
          : {}),
        ...(node.type === "audioPlayer" && node.playlist && typeof nodeGraphAudioPlayerPlaylistNormalize === "function"
          ? { playlist: nodeGraphAudioPlayerPlaylistNormalize(node.playlist) }
          : {}),
        paramMeta: normalizeNodeGraphParamMetaForNode(node.type, node.paramMeta),
        ...(Object.keys(normalizeNodeGraphPatchPortMeta(node.portMeta)).length
          ? { portMeta: normalizeNodeGraphPatchPortMeta(node.portMeta) }
          : {}),
        params: { ...(node.params || {}) },
        ...(ui.buttonsHidden || ui.buttonsForceShow || ui.ioHidden || ui.hideUnused || ui.interfaceControlsHidden || ui.interfaceControlsForceShow || ui.movementLocked || ui.titleHidden || ui.oscilloscopeHidden || ui.oscilloscopeForceShow || ui.slidersHidden || ui.slidersForceShow || ui.displayHeightOffsetGu ? { ui } : {}),
      };
    }),
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patch)
      : [],
    samples: typeof nodeGraphPatchSamplesWithoutEmbeddedAudio === "function"
      ? nodeGraphPatchSamplesWithoutEmbeddedAudio(patch.samples)
      : (typeof normalizeNodeGraphPatchSamples === "function"
        ? normalizeNodeGraphPatchSamples(patch.samples)
        : []),
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems: normalizeNodeGraphPatchUiItems(patch.uiItems),
    view: normalizeNodeGraphPatchView(patch.view),
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: normalizeNodeGraphPatchWindows(patch.windows),
  };
}
