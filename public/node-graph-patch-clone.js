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
  const metadata = cloneNodeGraphParamMeta(paramMeta);
  if (type === "output" && metadata.volume) {
    metadata.volume = {
      ...metadata.volume,
      def: 0.1,
      kind: "decimal",
      max: 1,
      mid: 0.1,
      min: 0,
      showSign: false,
      modClamp: true,
    };
  }
  return metadata;
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
    displayHeightOffsetGu: type
      ? normalizeNodeGraphModuleDisplayHeightOffsetUnits(type, source.displayHeightOffsetGu)
      : normalizeNodeGraphModuleDisplayHeightOffsetUnits(source.displayHeightOffsetGu),
    // Multi-mode faces removed — displayModeKey is no longer stored or used.
    displayModeKey: "",
    ioHidden: Boolean(source.ioHidden),
    interfaceControlsHidden: Boolean(source.interfaceControlsHidden),
    movementLocked: Boolean(source.movementLocked),
    oscilloscopeHidden: Boolean(source.oscilloscopeHidden),
    // LayoutA policy: definition.slidersAlwaysHidden forces param rows off.
    slidersHidden: alwaysHideSliders || Boolean(source.slidersHidden),
    titleHidden,
  };
}

/** @deprecated Multi-mode faces removed — always empty (one face per module). */
function normalizeNodeGraphPatchNodeDisplayModeKey(_type, _value = "") {
  return "";
}

function nodeGraphEffectivePatchNodeUi(ui = {}, type = "") {
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, type);
  const alwaysHideSliders = type
    && typeof nodeGraphModuleTypeSlidersAlwaysHidden === "function"
    && nodeGraphModuleTypeSlidersAlwaysHidden(type);
  return {
    ...normalizedUi,
    buttonsHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.buttonsHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleButtonsVisible : true,
    ),
    oscilloscopeHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.oscilloscopeHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleOscilloscopesVisible : true,
    ),
    interfaceControlsHidden: !nodeGraphPatchNodeSectionVisible(
      normalizedUi.interfaceControlsHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleInterfaceControlsVisible : true,
    ),
    slidersHidden: alwaysHideSliders || !nodeGraphPatchNodeSectionVisible(
      normalizedUi.slidersHidden,
      typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.moduleSlidersVisible : true,
    ),
  };
}

function nodeGraphPatchNodeSectionVisible(localHidden, globalVisible) {
  return !Boolean(localHidden) && globalVisible !== false;
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
const nodeGraphLedCenterColor = "#ffffff";

// LED light model:
//   energy = clamp(level * brightness, 0..1)   // mono "brightness" channel
//   color  = sample multi-stop gradient at energy  // free LUT (may go bright→dim)
// Legacy hue is only used to seed a default black→hue→white ramp when a patch
// has no gradientStops yet.
//
// rounding/cornerShape are the same pair the Music Player's waveform panel
// uses: rounding is a PERCENTAGE of the largest radius the face can take
// (half its shorter side), so 100 is fully round at any module size, and it
// means the same thing to both corner shapes.
const nodeGraphLedDefaultGradientStops = Object.freeze([
  Object.freeze({ t: 0, color: "#000000" }),
  Object.freeze({ t: 0.5, color: "#ff0000" }),
  Object.freeze({ t: 1, color: "#ffffff" }),
]);

const nodeGraphLedDefaultSettings = Object.freeze({
  blur: 0.35,
  brightness: 1,
  cornerShape: "squircle",
  // 0% = inscribed square (never a stretched rectangle of the cell);
  // 100% = lamp plate fills the available face area.
  fillPercent: 0,
  // Kept for migration / legacy UI; color comes from gradientStops.
  hue: 0,
  rounding: 100,
  gradientStops: nodeGraphLedDefaultGradientStops,
  // Decorative image layers (back → lamp → top). Same data-URL shape as value slider face.
  bottomImage: Object.freeze({ dataUrl: "", fileName: "" }),
  topImage: Object.freeze({ dataUrl: "", fileName: "" }),
});

function normalizeNodeGraphLedImageLayer(source = {}) {
  const raw = source && typeof source === "object" ? source : {};
  const dataUrl = String(raw.dataUrl || raw.src || "").trim();
  const safeUrl = dataUrl.startsWith("data:image/") && dataUrl.length <= 3_000_000
    ? dataUrl
    : "";
  return {
    dataUrl: safeUrl,
    fileName: String(raw.fileName || raw.name || "").trim().slice(0, 96),
  };
}

// A legacy node.led.color hex becomes the equivalent hue, so patches saved
// before the hue-based model keep the lamp color their author picked.
function nodeGraphLedHueFromHexColor(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
  if (!match) {
    return null;
  }
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span <= 0) {
    return null;
  }
  const hue = max === r
    ? ((g - b) / span + (g < b ? 6 : 0))
    : max === g
      ? (b - r) / span + 2
      : (r - g) / span + 4;
  return ((hue * 60) % 360 + 360) % 360;
}

/** Hex for a fully saturated hue at mid lightness (legacy seed color). */
function nodeGraphLedHexFromHue(hue) {
  const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) { r = 1; g = x; b = 0; }
  else if (h < 2) { r = x; g = 1; b = 0; }
  else if (h < 3) { r = 0; g = 1; b = x; }
  else if (h < 4) { r = 0; g = x; b = 1; }
  else if (h < 5) { r = x; g = 0; b = 1; }
  else { r = 1; g = 0; b = x; }
  const toHex = (c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Default black → hue → white when only a legacy hue/color is present. */
function nodeGraphLedGradientStopsFromHue(hue) {
  const mid = nodeGraphLedHexFromHue(hue);
  return [
    { t: 0, color: "#000000" },
    { t: 0.5, color: mid },
    { t: 1, color: "#ffffff" },
  ];
}

function normalizeNodeGraphLedGradientStops(raw, hueFallback = 0) {
  if (typeof normalizeNodeGraphSharedGradientStops === "function") {
    return normalizeNodeGraphSharedGradientStops(
      raw,
      nodeGraphLedGradientStopsFromHue(hueFallback),
    );
  }
  if (typeof NodeGraphGradientSelector !== "undefined"
    && typeof NodeGraphGradientSelector.normalizeStops === "function") {
    return NodeGraphGradientSelector.normalizeStops(raw, {
      channels: "color",
      defaultStops: "phosphor",
      fallbackStops: nodeGraphLedGradientStopsFromHue(hueFallback),
    });
  }
  const list = Array.isArray(raw) ? raw : null;
  if (list && list.length >= 2) {
    return list.map((s, i) => ({
      t: Math.max(0, Math.min(1, Number(s?.t) || (i / Math.max(1, list.length - 1)))),
      color: String(s?.color || "#ffffff"),
    }));
  }
  return nodeGraphLedGradientStopsFromHue(hueFallback);
}

function normalizeNodeGraphLedLayout(layout = {}) {
  const source = layout && typeof layout === "object" ? layout : {};
  const defaults = nodeGraphLedDefaultSettings;
  const color = normalizeNodeGraphModuleScopeDotCoreColor(source.color ?? nodeGraphLedDefaultColor, nodeGraphLedDefaultColor);
  const rawHue = Number(source.hue);
  const hue = Number.isFinite(rawHue)
    ? ((rawHue % 360) + 360) % 360
    : (nodeGraphLedHueFromHexColor(color) ?? defaults.hue);
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const hasStops = Array.isArray(source.gradientStops) && source.gradientStops.length >= 2
    || Array.isArray(source.gradient) && source.gradient.length >= 2;
  const gradientStops = normalizeNodeGraphLedGradientStops(
    hasStops ? (source.gradientStops ?? source.gradient) : null,
    hue,
  );
  // Peak of LUT (for legacy color field mirrors).
  const peakColor = gradientStops[gradientStops.length - 1]?.color || color;
  return {
    blur: clamp(source.blur, 0, 1, defaults.blur),
    brightness: clamp(source.brightness, 0, 1, defaults.brightness),
    color: normalizeNodeGraphModuleScopeDotCoreColor(peakColor, color),
    cornerShape: source.cornerShape === "square" ? "square" : "squircle",
    fillPercent: clamp(source.fillPercent ?? source.fill, 0, 100, defaults.fillPercent),
    gradientStops,
    hue,
    kind: "led",
    rounding: clamp(source.rounding, 0, 100, defaults.rounding),
    bottomImage: normalizeNodeGraphLedImageLayer(source.bottomImage || source.bottom),
    topImage: normalizeNodeGraphLedImageLayer(source.topImage || source.top),
  };
}

// When true, titles become "1D Trace 2" from id suffix. When false (default),
// every instance uses the plain label ("1D Trace") — cosmetic only; ids stay unique.
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
  if (displayType === "dot") {
    return { zeroDBurnSettings: normalizeNodeGraphZeroDBurnSettings(migrate(node.zeroDBurnSettings, false)) };
  }
  if (displayType === "lineBurn") {
    return { traceDisplaySettings: normalizeNodeGraphLineBurnSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "value") {
    return { traceDisplaySettings: normalizeNodeGraphValueOscilloscopeSettings(migrate(node.traceDisplaySettings, false)) };
  }
  // scope2d-schema faces (incl. Videoscope / bank / hypersaw energy phosphor).
  // Must not fall through to {} — validateNodeGraphPatch only copies what we
  // return here, so resize/commit would wipe burn/decay/density on miss.
  if (
    displayType === "scope2d"
    || displayType === "phosphorLight"
    || displayType === "videoscopeBurn"
    || displayType === "oscilloscopeBankBurn"
    || displayType === "hypersawBurn"
  ) {
    // phosphorLight is a legacy alias of scope2d; always store scope2d schema.
    const raw = migrate(node.traceDisplaySettings, false) || {};
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
  if (displayType === "scope2dTrace") {
    return { traceDisplaySettings: normalizeNodeGraphScope2dTraceSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "numberReadout") {
    return { traceDisplaySettings: normalizeNodeGraphNumberReadoutSettings(migrate(node.traceDisplaySettings, false)) };
  }
  if (displayType === "xyPad" && typeof normalizeNodeGraphXyPadDisplaySettings === "function") {
    return {
      traceDisplaySettings: normalizeNodeGraphXyPadDisplaySettings(migrate(node.traceDisplaySettings, false)),
    };
  }
  if (displayType === "spectrogramBurn" && typeof normalizeNodeGraphSpectrogramSettings === "function") {
    const merged = { ...(migrate(node.traceDisplaySettings, false) || {}) };
    if (merged.fftSize == null && node.params?.fftSize != null) {
      merged.fftSize = node.params.fftSize;
    }
    return { traceDisplaySettings: normalizeNodeGraphSpectrogramSettings(merged, node) };
  }
  if (displayType === "ledLamp" && typeof normalizeNodeGraphLedLayout === "function") {
    // LED face settings live on node.led (not traceDisplaySettings).
    return { led: normalizeNodeGraphLedLayout(node.led) };
  }
  if (displayType === "evolveFieldFace" && typeof normalizeNodeGraphEvolveFieldSettings === "function") {
    return {
      traceDisplaySettings: normalizeNodeGraphEvolveFieldSettings(migrate(node.traceDisplaySettings, false)),
    };
  }
  if (displayType === "rgbFractalFace" && typeof normalizeNodeGraphRgbFractalSettings === "function") {
    return {
      traceDisplaySettings: normalizeNodeGraphRgbFractalSettings(migrate(node.traceDisplaySettings, false)),
    };
  }
  if (displayType === "fbmFieldFace" && typeof normalizeNodeGraphFbmFieldSettings === "function") {
    return {
      traceDisplaySettings: normalizeNodeGraphFbmFieldSettings(migrate(node.traceDisplaySettings, false)),
    };
  }
  if (displayType === "trace" && Object.hasOwn(node, "traceDisplaySettings")) {
    return { traceDisplaySettings: normalizeNodeGraphTraceDisplaySettings(migrate(node.traceDisplaySettings, isOutput)) };
  }
  // Last resort: if a face still has settings but schema is unknown/new,
  // preserve the object rather than dropping it on every validate/clone.
  if (Object.hasOwn(node, "traceDisplaySettings") && node.traceDisplaySettings) {
    return {
      traceDisplaySettings: {
        ...(typeof node.traceDisplaySettings === "object" ? node.traceDisplaySettings : {}),
      },
    };
  }
  return {};
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
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "image"
          ? { layout: normalizeNodeGraphImageLayout(node.layout) }
          : {}),
        ...(nodeGraphModuleDefinitions[node.type]?.layout === "led"
          ? { led: normalizeNodeGraphLedLayout(node.led) }
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
        ...((node.type === "samplePlayer" || node.type === "sampleLooper" || node.type === "audioPlayer") && normalizeNodeGraphSampleId(node.sample?.id)
          ? { sample: { id: normalizeNodeGraphSampleId(node.sample?.id) } }
          : {}),
        ...(node.type === "audioPlayer" && Object.hasOwn(node, "phosphorWaveformSettings")
          ? { phosphorWaveformSettings: normalizeNodeGraphPhosphorWaveformSettings(node.phosphorWaveformSettings) }
          : {}),
        ...(node.type === "audioPlayer" && Number.isFinite(Number(node.samplePhase))
          ? { samplePhase: Math.max(0, Math.min(1, Number(node.samplePhase))) }
          : {}),
        paramMeta: normalizeNodeGraphParamMetaForNode(node.type, node.paramMeta),
        ...(Object.keys(normalizeNodeGraphPatchPortMeta(node.portMeta)).length
          ? { portMeta: normalizeNodeGraphPatchPortMeta(node.portMeta) }
          : {}),
        params: { ...(node.params || {}) },
        ...(ui.buttonsHidden || ui.ioHidden || ui.interfaceControlsHidden || ui.movementLocked || ui.titleHidden || ui.oscilloscopeHidden || ui.slidersHidden || ui.displayHeightOffsetGu ? { ui } : {}),
      };
    }),
    requiredAssets: typeof nodeGraphRequiredAssetsForPatch === "function"
      ? nodeGraphRequiredAssetsForPatch(patch)
      : [],
    samples: typeof normalizeNodeGraphPatchSamples === "function"
      ? normalizeNodeGraphPatchSamples(patch.samples)
      : [],
    timing: normalizeNodeGraphPatchTiming(patch.timing),
    uiItems: normalizeNodeGraphPatchUiItems(patch.uiItems),
    view: normalizeNodeGraphPatchView(patch.view),
    visual: normalizeNodeGraphPatchVisual(patch.visual),
    windows: normalizeNodeGraphPatchWindows(patch.windows),
  };
}
