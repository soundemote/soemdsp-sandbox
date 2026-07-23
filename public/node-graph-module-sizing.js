function nodeGraphModuleBodyRowCount(type) {
  const definition = nodeGraphModuleDefinitions[type];
  return definition?.parameters?.length || 0;
}

function nodeGraphModuleVisibleBodyRowCount(type) {
  return nodeGraphModuleBodyRowCount(type);
}

function nodeGraphModuleVisibleSliderRowCountForUi(type, ui = {}) {
  const effectiveUi = nodeGraphEffectivePatchNodeUi(ui);
  if (!nodeGraphModuleTypeHasHideableSliders(type) || effectiveUi.slidersHidden) {
    return 0;
  }
  return nodeGraphModuleVisibleBodyRowCount(type);
}

function nodeGraphModuleTypeHasHideableSliders(type) {
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition?.parameters?.length) {
    return false;
  }
  return !["knobWidget", "led", "sliderWidget"].includes(definition.layout);
}

const nodeGraphModuleWidthLimits = Object.freeze({
  maxGu: 18,
  minGu: 4,
});

const nodeGraphModuleHeightLimits = Object.freeze({
  maxGu: 24,
  minGu: 1,
});

const nodeGraphModuleDisplayHeightLimits = Object.freeze({
  maxGu: 48,
  minGu: 1,
  stepGu: 1,
});

function nodeGraphModuleWidthLimitsForType(type) {
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: 1 };
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "knobWidget") {
    return { ...nodeGraphModuleWidthLimits, minGu: 1 };
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    // No GU cap -- key count is user-configurable (see
    // nodeGraphMidiKeyboardKeyCount in node-graph-view-controls.js) and a
    // wide key range needs room to not cramp the keys.
    return { maxGu: 9999, minGu: 1 };
  }
  return nodeGraphModuleWidthLimits;
}

function nodeGraphModuleHeightLimitsForType(type) {
  if (type === "audioPlayer") {
    return { ...nodeGraphModuleHeightLimits, maxGu: nodeGraphModuleHeightLimits.maxGu + 1 };
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "knobWidget") {
    return { ...nodeGraphModuleHeightLimits, minGu: 1 };
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    return { maxGu: 9999, minGu: 1 };
  }
  return nodeGraphModuleHeightLimits;
}

const nodeGraphTextBoxHeightLimits = Object.freeze({
  maxGu: 24,
  minGu: 1,
});

function nodeGraphPatchNodeLayout(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const fallback = nodeGraphModuleDefinitions[patchNode?.type]?.layout;
  if (patchNode?.type === "canvas" && typeof normalizeNodeGraphCanvasScript === "function") {
    const layout = normalizeNodeGraphCanvasScript(patchNode.canvasScript).layout;
    return layout === "oscilloscope" ? "visualScope" : fallback;
  }
  return fallback;
}

function nodeGraphModuleTypeHasHideableOscilloscope(type) {
  const layout = nodeGraphModuleDefinitions[type]?.layout;
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return false;
  }
  // xyPad never renders a scope section (its pad is the display), so don't
  // offer a show/hide oscilloscope toggle for it either.
  if (type === "xyPad") {
    return false;
  }
  return Boolean(nodeGraphModuleDefinitions[type]) && ![
    "canvas",
    "clapPlugin",
    "graph",
    "image",
    "keyboardController",
    "knobWidget",
    "macroControls",
    "pitchModWheel",
    "screenSpaceShader",
    "sliderWidget",
    "speakerProtection",
    "textBox",
    "visualScope",
  ].includes(layout);
}

function nodeGraphPatchNodeHasHideableOscilloscope(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  const layout = nodeGraphPatchNodeLayout(patchNode);
  if (layout && layout !== nodeGraphModuleDefinitions[patchNode?.type]?.layout) {
    return false;
  }
  return nodeGraphModuleTypeHasHideableOscilloscope(patchNode?.type);
}

function nodeGraphModuleSizingCapabilities(type) {
  const normalizedType = String(type || "").trim();
  const definition = nodeGraphModuleDefinitions[normalizedType];
  const moduleHeight = nodeGraphNodeTypeHasTextBoxLayout(normalizedType)
    ? "textBox"
    : normalizedType === "canvas"
      ? "canvasScript"
      : false;
  const displayHeight = nodeGraphModuleTypeHasHideableOscilloscope(normalizedType);
  return Object.freeze({
    width: Boolean(definition),
    moduleHeight,
    displayHeight,
    keyboardHeight: Boolean(moduleHeight || displayHeight),
  });
}

function nodeGraphModuleDisplayVisibleForUi(type, ui = {}) {
  if (!nodeGraphModuleTypeHasHideableOscilloscope(type)) {
    return false;
  }
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp?.moduleOscilloscopesVisible === false) {
    return false;
  }
  return !nodeGraphEffectivePatchNodeUi(ui).oscilloscopeHidden;
}

function normalizeNodeGraphModuleDisplayHeightUnits(heightGu) {
  const value = Math.round(Number(heightGu));
  return Number.isFinite(value)
    ? Math.max(
      nodeGraphModuleDisplayHeightLimits.minGu,
      Math.min(nodeGraphModuleDisplayHeightLimits.maxGu, value),
    )
    : nodeGraphModuleLayout.moduleScopeHeightGu;
}

function nodeGraphModuleDefaultDisplayHeightUnits(type) {
  return normalizeNodeGraphModuleDisplayHeightUnits(
    nodeGraphModuleDefinitions[type]?.displayHeightGu ?? nodeGraphModuleLayout.moduleScopeHeightGu,
  );
}

function normalizeNodeGraphModuleDisplayHeightOffsetUnits(typeOrOffsetGu, offsetGu = null) {
  const hasType = offsetGu !== null;
  const type = hasType ? typeOrOffsetGu : null;
  const offset = hasType ? offsetGu : typeOrOffsetGu;
  const defaultHeightGu = type ? nodeGraphModuleDefaultDisplayHeightUnits(type) : nodeGraphModuleLayout.moduleScopeHeightGu;
  const targetHeightGu = defaultHeightGu + Math.round(Number(offset) || 0);
  return normalizeNodeGraphModuleDisplayHeightUnits(targetHeightGu) - defaultHeightGu;
}

function nodeGraphModuleConfiguredDisplayHeightUnits(type, ui = {}) {
  if (!nodeGraphModuleTypeHasHideableOscilloscope(type)) {
    return 0;
  }
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, type);
  const defaultHeightGu = nodeGraphModuleDefaultDisplayHeightUnits(type);
  return Math.max(
    1,
    defaultHeightGu + normalizedUi.displayHeightOffsetGu,
  );
}

function nodeGraphModuleDisplayHeightUnits(type, ui = {}) {
  return nodeGraphModuleDisplayVisibleForUi(type, ui)
    ? nodeGraphModuleConfiguredDisplayHeightUnits(type, ui)
    : 0;
}

function nodeGraphModuleScopeExtraHeightUnits(type, ui = {}) {
  return nodeGraphModuleDisplayHeightUnits(type, ui);
}

function nodeGraphPatchNodeDisplayHeightUnits(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphModuleDisplayHeightUnits(patchNode?.type, patchNode?.ui);
}

function nodeGraphPatchNodeDisplayCssHeightUnits(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (nodeGraphPatchNodeLayout(patchNode) === "canvas") {
    return nodeGraphModuleDefaultDisplayHeightUnits(patchNode?.type);
  }
  return nodeGraphPatchNodeDisplayHeightUnits(patchNode);
}

function nodeGraphPatchNodeCanvasScriptGridUnits(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (patchNode?.type !== "canvas" || typeof normalizeNodeGraphCanvasScript !== "function") {
    return null;
  }
  const script = normalizeNodeGraphCanvasScript(patchNode.canvasScript);
  return {
    heightGu: Number.isFinite(Number(script.gridHeightGu)) ? Number(script.gridHeightGu) : null,
    widthGu: Number.isFinite(Number(script.gridWidthGu)) ? Number(script.gridWidthGu) : null,
  };
}

function nodeGraphDefaultModuleGridWidthUnits(type) {
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return 1;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "stepGrid") {
    // Wide enough that up to 16 squares (plus the add affordance) stay
    // comfortably clickable -- there's no generic per-node resize handle
    // in this graph editor, so this is a fixed width the square count
    // grows/shrinks within (see createNodeGraphStepGridBody).
    return 11;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "knobWidget") {
    return 4;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "sliderWidget") {
    return 6;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "visualScope") {
    return 7;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "graph") {
    return 14;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "filterCurve") {
    return 8;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pulseCurve") {
    return 8;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "wallRoomDisplay") {
    return 8;
  }
  return 7;
}

function normalizeNodeGraphModuleWidthUnits(type, widthGu) {
  const fallback = nodeGraphDefaultModuleGridWidthUnits(type);
  const limits = nodeGraphModuleWidthLimitsForType(type);
  const value = Math.round(Number(widthGu));
  return Number.isFinite(value)
    ? Math.max(limits.minGu, Math.min(limits.maxGu, value))
    : fallback;
}

function nodeGraphModuleGridWidthUnits(type) {
  return nodeGraphDefaultModuleGridWidthUnits(type);
}

function nodeGraphPatchNodeGridWidthUnits(node) {
  const scriptGrid = nodeGraphPatchNodeCanvasScriptGridUnits(node);
  if (scriptGrid?.widthGu) {
    return normalizeNodeGraphModuleWidthUnits(node?.type, scriptGrid.widthGu);
  }
  return normalizeNodeGraphModuleWidthUnits(node?.type, node?.widthGu);
}

function normalizeNodeGraphModuleHeightUnits(type, heightGu, ui = {}) {
  const fallback = nodeGraphModuleGridHeightUnitsForUi(type, ui);
  const limits = nodeGraphModuleHeightLimitsForType(type);
  const minimum = Math.max(limits.minGu, Math.ceil(fallback));
  const value = Math.round(Number(heightGu));
  return Number.isFinite(value)
    ? Math.max(minimum, value)
    : fallback;
}

function normalizeNodeGraphTextBoxHeightUnits(heightGu) {
  const value = Math.round(Number(heightGu));
  if (!Number.isFinite(value)) {
    return nodeGraphModuleGridHeightUnitsForUi("textBox");
  }
  return Math.max(
    nodeGraphTextBoxHeightLimits.minGu,
    Math.min(nodeGraphTextBoxHeightLimits.maxGu, value),
  );
}

function nodeGraphModuleSliderBodyHeightGu(type) {
  const rows = nodeGraphModuleVisibleBodyRowCount(type);
  if (rows <= 0) {
    return 0;
  }
  return (
    rows * nodeGraphModuleLayout.sliderRowHeightGu +
    Math.max(0, rows - 1) * nodeGraphModuleLayout.bodyRowGapGu
  );
}

function nodeGraphModuleIoRowCount(type) {
  const definition = nodeGraphModuleDefinitions[type];
  return Math.max(
    definition?.inputs?.length || 0,
    definition?.outputs?.length || 0,
    1,
  );
}

function nodeGraphModuleTypeHasIoPorts(type) {
  const definition = nodeGraphModuleDefinitions[type];
  return Boolean((definition?.inputs?.length || 0) || (definition?.outputs?.length || 0));
}

function nodeGraphModuleIoSectionHeightGu(type) {
  const rows = nodeGraphModuleIoRowCount(type);
  const rowHeight = rows * nodeGraphModuleLayout.ioRowHeightGu;
  const gapHeight = Math.max(0, rows - 1) * nodeGraphModuleLayout.ioRowGapGu;
  return Math.max(
    nodeGraphModuleLayout.ioSectionMinHeightGu,
    rowHeight + gapHeight + nodeGraphModuleLayout.ioPaddingYGu,
  );
}

function nodeGraphModuleHiddenIoSectionHeightGu(type) {
  return nodeGraphModuleTypeHasIoPorts(type) ? nodeGraphModuleLayout.ioSectionMinHeightGu : 0;
}

function nodeGraphModuleTypeHasInterfaceControls(type) {
  return ["samplePlayer", "sampleLooper", "audioPlayer"].includes(type);
}

function nodeGraphModuleInterfaceControlsVisibleForUi(type, ui = {}) {
  return nodeGraphModuleTypeHasInterfaceControls(type) && !nodeGraphEffectivePatchNodeUi(ui).interfaceControlsHidden;
}

function nodeGraphModuleInterfaceControlsHeightGu(type, ui = {}) {
  if (!nodeGraphModuleInterfaceControlsVisibleForUi(type, ui)) {
    return 0;
  }
  if (type === "audioPlayer") {
    return 4;
  }
  if (type === "samplePlayer" || type === "sampleLooper") {
    return 4;
  }
  return 0;
}

function nodeGraphPatchNodeInterfaceControlsHeightUnits(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphModuleInterfaceControlsHeightGu(patchNode?.type, patchNode?.ui);
}

function nodeGraphModuleRequiredHeightUnits(type) {
  return nodeGraphModuleRequiredHeightUnitsForUi(type);
}

function nodeGraphModuleHeaderHeightUnits(ui = {}) {
  const normalizedUi = nodeGraphEffectivePatchNodeUi(ui);
  if (normalizedUi.buttonsHidden && normalizedUi.titleHidden) {
    return 0;
  }
  if (normalizedUi.buttonsHidden) {
    return nodeGraphModuleLayout.headerTitleRowHeightGu;
  }
  if (normalizedUi.titleHidden) {
    return nodeGraphModuleLayout.headerHeightGu - nodeGraphModuleLayout.headerTitleRowHeightGu;
  }
  return nodeGraphModuleLayout.headerHeightGu;
}

function nodeGraphModuleHeightWidgetUnits(type, ui = {}) {
  const normalizedUi = nodeGraphEffectivePatchNodeUi(ui);
  const slidersVisible = nodeGraphModuleTypeHasHideableSliders(type) && !normalizedUi.slidersHidden;
  const displayVisible = nodeGraphModuleDisplayVisibleForUi(type, ui);
  const interfaceControlsVisible = nodeGraphModuleInterfaceControlsVisibleForUi(type, ui);
  const ioVisible = !normalizedUi.ioHidden || nodeGraphModuleTypeHasIoPorts(type);
  const ioHeightGu = normalizedUi.ioHidden
    ? nodeGraphModuleHiddenIoSectionHeightGu(type)
    : nodeGraphModuleIoSectionHeightGu(type);
  if (type === "samplePlayer" || type === "sampleLooper" || type === "audioPlayer") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "scope", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "interfaceControls", heightGu: nodeGraphModuleInterfaceControlsHeightGu(type, ui), visible: interfaceControlsVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "led") {
    return [{ id: "face", heightGu: 1, visible: true }];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "knobWidget") {
    return [{ id: "face", heightGu: 4, visible: true }];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "textBox") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "text", heightGu: nodeGraphModuleLayout.textBoxBodyMinGu, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "image") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "image", heightGu: nodeGraphModuleLayout.moduleScopeHeightGu, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "canvas") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "canvas", heightGu: nodeGraphModuleDefaultDisplayHeightUnits(type), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "visualScope") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "screen", heightGu: nodeGraphDefaultModuleGridWidthUnits(type), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "traceDisplay") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "trace", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "graph") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "graph", heightGu: nodeGraphModuleLayout.moduleScopeHeightGu * 4, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "sliderWidget") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "slider", heightGu: nodeGraphModuleLayout.moduleScopeHeightGu, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "keyboard", heightGu: 12, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "macroControls") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "macros", heightGu: 5, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pitchModWheel") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "wheels", heightGu: 5, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "filterCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui) * 1.5, visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "wallRoomDisplay") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "room", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui) * 1.5, visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pulseCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui) * 1.5, visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "clapPlugin") {
    // clapPlugin has no static parameters[] (they're discovered live from
    // whatever plugin is bound, see nodeGraphClapParameterPayload), so the
    // generic "params" row below -- driven by nodeGraphModuleBodyRowCount's
    // static definition.parameters.length -- always saw 0 and never grew
    // the node. The 18gu body budget here is a fixed estimate sized to fit
    // the plugin select, preset row, detail text, safety line, and the
    // 8-button action grid at their real CSS min-heights, plus the
    // scrollable parameter list's own 240px max-height (see
    // .node-clap-plugin-param-list) -- so a plugin with many parameters
    // (e.g. "Soundemote - soemdsp DSP Proof") scrolls its own param list
    // instead of the node overlapping neighboring modules.
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "clapBody", heightGu: 18, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  return [
    { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
    { id: "scope", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
    { id: "interfaceControls", heightGu: nodeGraphModuleInterfaceControlsHeightGu(type, ui), visible: interfaceControlsVisible },
    { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
    { id: "fit", heightGu: nodeGraphModuleLayout.fitCushionGu, visible: true },
    { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
  ];
}

function nodeGraphModuleRequiredHeightUnitsForUi(type, ui = {}) {
  return nodeGraphModuleHeightWidgetUnits(type, ui)
    .filter((widget) => widget.visible !== false)
    .reduce((total, widget) => total + Math.max(0, Number(widget.heightGu) || 0), 0);
}

function nodeGraphModuleGridHeightUnits(type) {
  return nodeGraphModuleGridHeightUnitsForUi(type);
}

function nodeGraphModuleGridHeightUnitsForUi(type, ui = {}) {
  // Chromeless layouts (see nodeGraphChromelessModuleLayouts in
  // node-graph-module-rendering.js) have no header, no display, no IO
  // section, and no generic param rows -- the widget-list calc below
  // assumes at least some of those exist, which inflates the required
  // height even though nothing extra is actually rendered. Most chromeless
  // modules are sized by their own dedicated CSS rule
  // (.dsp-node.<layout>-layout) at exactly 1gu tall, same as led always
  // was; this generalizes led's existing shortcut so a future 100%
  // custom-UI module gets it automatically just by joining that set.
  // A chromeless module that opts into the hideable-oscilloscope capability
  // (see nodeGraphModuleTypeHasHideableOscilloscope) is a whole-body display
  // instead -- e.g. stepGrid, where more grid units means more room per
  // square -- so it reuses the same configured-display-height mechanism
  // every other display-capable module already exposes (context menu /
  // keyboard shortcut), rather than being pinned at 1 regardless of that
  // setting.
  if (nodeGraphChromelessModuleLayouts.has(nodeGraphModuleDefinitions[type]?.layout)) {
    if (nodeGraphModuleTypeHasHideableOscilloscope(type)) {
      return nodeGraphModuleConfiguredDisplayHeightUnits(type, ui);
    }
    return 1;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "knobWidget") {
    return 4;
  }
  return Math.ceil(nodeGraphModuleRequiredHeightUnitsForUi(type, ui));
}

function nodeGraphPatchNodeGridHeightUnits(node) {
  const scriptGrid = nodeGraphPatchNodeCanvasScriptGridUnits(node);
  if (scriptGrid?.heightGu) {
    return normalizeNodeGraphModuleHeightUnits(node?.type, scriptGrid.heightGu);
  }
  if (nodeGraphNodeTypeHasTextBoxLayout(node?.type) && Number.isFinite(Number(node.heightGu))) {
    return normalizeNodeGraphTextBoxHeightUnits(node.heightGu);
  }
  const autoHeightGu = nodeGraphModuleGridHeightUnitsForUi(node?.type, node?.ui);
  return normalizeNodeGraphModuleHeightUnits(node?.type, autoHeightGu, node?.ui);
}
