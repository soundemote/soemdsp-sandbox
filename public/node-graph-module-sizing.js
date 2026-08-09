function nodeGraphModuleBodyRowCount(type) {
  const definition = nodeGraphModuleDefinitions[type];
  return definition?.parameters?.length || 0;
}

function nodeGraphModuleVisibleBodyRowCount(type) {
  return (nodeGraphModuleDefinitions[type]?.parameters || [])
    .filter((parameter) => parameter?.hidden !== true)
    .length;
}

function nodeGraphModuleVisibleSliderRowCountForUi(type, ui = {}) {
  const effectiveUi = nodeGraphEffectivePatchNodeUi(ui, type);
  if (!nodeGraphModuleTypeHasHideableSliders(type) || effectiveUi.slidersHidden) {
    return 0;
  }
  return nodeGraphModuleVisibleBodyRowCount(type);
}

/** Definition flag: module never shows param rows (LayoutA status faces, etc.). */
function nodeGraphModuleTypeSlidersAlwaysHidden(type) {
  return Boolean(nodeGraphModuleDefinitions[type]?.slidersAlwaysHidden);
}

function nodeGraphModuleTypeHasHideableSliders(type) {
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition?.parameters?.length) {
    return false;
  }
  if (nodeGraphModuleTypeSlidersAlwaysHidden(type)) {
    return false;
  }
  // LayoutB modules (incl. knob) keep ordinary param rows under the face.
  return definition.layout !== "led";
}

const nodeGraphModuleWidthLimits = Object.freeze({
  maxGu: 60,
  // LayoutA / generic modules.
  minGu: 4,
});

const nodeGraphModuleHeightLimits = Object.freeze({
  maxGu: 60,
  minGu: 1,
});

// App-wide display-area policy: resizable display 1…60 gu (LayoutA + LayoutB).
// EVERY face (scopes, filter curves, LayoutB shells, custom UIs) must honor
// minGu: 1 — never inflate CSS rows (e.g. no 1.5× scope height) past this floor.
const nodeGraphModuleDisplayHeightLimits = Object.freeze({
  maxGu: 60,
  minGu: 1,
  stepGu: 1,
});

/** LayoutB module width floor (display height uses displayHeightLimits.minGu = 1). */
const nodeGraphLayoutBMinGu = 2;

function nodeGraphModuleWidthLimitsForType(type) {
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: 1 };
  }
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: nodeGraphLayoutBMinGu };
  }
  // MIDI Keyboard needs real horizontal room for white keys + labels.
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    return { ...nodeGraphModuleWidthLimits, minGu: 14 };
  }
  return nodeGraphModuleWidthLimits;
}

function nodeGraphModuleHeightLimitsForType(type) {
  return nodeGraphModuleHeightLimits;
}

/** Shared display-height limits for every type (min 1gu). Do not raise per-layout. */
function nodeGraphModuleDisplayHeightLimitsForType(_type = null) {
  return nodeGraphModuleDisplayHeightLimits;
}

const nodeGraphTextBoxHeightLimits = Object.freeze({
  maxGu: 60,
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

// Types whose CUSTOM UI occupies the display area instead of an
// oscilloscope (e.g. xyPad's interactive pad, graph2's dot editor). They
// participate in the display-height sizing system exactly like a scope --
// same resize controls, same height contribution -- but the area can't be
// hidden (hiding the module's own control surface would make it useless).
// graph2 isn't registered in the chromeless-module registry (it still has a
// normal header/title bar, unlike XY Pad/Bug Button), so it's called out
// here directly rather than through nodeGraphChromelessModuleHasCustomDisplayArea
// -- this is what gives it the same standard Width/Height controls as
// every other custom-display module instead of neither one.
function nodeGraphModuleTypeHasCustomDisplayArea(type) {
  // Face-owned display area (not the same as LayoutA/B port chrome).
  // Participates in the same display-height resize policy as scopes (1…60gu).
  if (typeof nodeGraphChromelessModuleHasCustomDisplayArea === "function"
    && nodeGraphChromelessModuleHasCustomDisplayArea(type)) {
    return true;
  }
  const definition = nodeGraphModuleDefinitions[type];
  if (definition?.customDisplayArea) {
    return true;
  }
  const layout = definition?.layout;
  // LayoutA status faces (BADVAL, …) and LayoutB faces that own the display row.
  // filterCurve / envelopeCurve / pulseCurve / wallRoomDisplay are control
  // surfaces (crossover lines, filter magnitude, …) — not hideable scopes.
  return layout === "graph"
    || layout === "sliderWidget"
    || layout === "badvalMonitor"
    || layout === "pitchQuantizer"
    || layout === "asciiscope"
    || layout === "macroControls"
    || layout === "filterCurve"
    || layout === "envelopeCurve"
    || layout === "pulseCurve"
    || layout === "wallRoomDisplay";
}

function nodeGraphModuleTypeHasHideableOscilloscope(type) {
  const layout = nodeGraphModuleDefinitions[type]?.layout;
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return false;
  }
  // Custom-display-area types never render a scope section, so there is no
  // oscilloscope to show/hide (their display HEIGHT still resizes -- see
  // nodeGraphModuleSizingCapabilities).
  if (nodeGraphModuleTypeHasCustomDisplayArea(type)) {
    return false;
  }
  return Boolean(nodeGraphModuleDefinitions[type]) && ![
    "canvas",
    "graph",
    "image",
    "keyboardController",
    "macroControls",
    "pitchModWheel",
    "screenSpaceShader",
    // badvalMonitor is customDisplayArea (height via display-height policy), not a hideable scope.
    "badvalMonitor",
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

// Resizable display AREA (oscilloscope OR custom UI) -- the gate for
// display-height resize actions, as opposed to the show/hide toggle above
// which only applies to actual oscilloscopes.
function nodeGraphPatchNodeHasResizableDisplayArea(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return (
    nodeGraphPatchNodeHasHideableOscilloscope(patchNode) ||
    nodeGraphModuleTypeHasCustomDisplayArea(patchNode?.type)
  );
}

function nodeGraphModuleSizingCapabilities(type) {
  const normalizedType = String(type || "").trim();
  const definition = nodeGraphModuleDefinitions[normalizedType];
  const layout = definition?.layout;
  // LayoutB chromeless modules size from content (shell + sliders), not freehand heightGu.
  // Graph uses shared display-height (min 1gu), not a custom moduleHeight floor.
  const moduleHeight = nodeGraphNodeTypeHasTextBoxLayout(normalizedType)
    ? "textBox"
    : normalizedType === "canvas"
      ? "canvasScript"
      : (
        (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(normalizedType)
          && typeof nodeGraphChromelessModuleLayouts !== "undefined"
          && nodeGraphChromelessModuleLayouts.has(layout))
          ? false
          : (layout === "keyboardController" ? "custom" : false)
      );
  // Display-height resizing works for any type with a display AREA --
  // whether an oscilloscope fills it or the module's own custom UI does
  // (graph faces, XY pad, Knob, macro knobs, etc.). Min face height is 1gu app-wide.
  const displayHeight = !moduleHeight && (
    nodeGraphModuleTypeHasHideableOscilloscope(normalizedType) ||
    nodeGraphModuleTypeHasCustomDisplayArea(normalizedType)
  );
  return Object.freeze({
    width: Boolean(definition),
    moduleHeight,
    displayHeight,
    keyboardHeight: Boolean(moduleHeight || displayHeight),
  });
}

function nodeGraphModuleDisplayVisibleForUi(type, ui = {}) {
  // A custom display area is always "visible" -- it's the module's own
  // control surface, exempt from the oscilloscope show/hide flags.
  if (nodeGraphModuleTypeHasCustomDisplayArea(type)) {
    return true;
  }
  if (!nodeGraphModuleTypeHasHideableOscilloscope(type)) {
    return false;
  }
  // Effective UI already resolves global Displays + local force-show /
  // local hide. Do not short-circuit on the global flag alone — that left
  // force-shown modules at 0 display gu (CSS face on, shell min 1gu).
  return !nodeGraphEffectivePatchNodeUi(ui, type).oscilloscopeHidden;
}

function normalizeNodeGraphModuleDisplayHeightUnits(heightGu, type = null) {
  const limits = nodeGraphModuleDisplayHeightLimitsForType(type);
  const value = Math.round(Number(heightGu));
  return Number.isFinite(value)
    ? Math.max(
      limits.minGu,
      Math.min(limits.maxGu, value),
    )
    : Math.max(limits.minGu, nodeGraphModuleLayout.moduleScopeHeightGu);
}

function nodeGraphModuleDefaultDisplayHeightUnits(type) {
  return normalizeNodeGraphModuleDisplayHeightUnits(
    nodeGraphModuleDefinitions[type]?.displayHeightGu ?? nodeGraphModuleLayout.moduleScopeHeightGu,
    type,
  );
}

function normalizeNodeGraphModuleDisplayHeightOffsetUnits(typeOrOffsetGu, offsetGu = null) {
  const hasType = offsetGu !== null;
  const type = hasType ? typeOrOffsetGu : null;
  const offset = hasType ? offsetGu : typeOrOffsetGu;
  const defaultHeightGu = type ? nodeGraphModuleDefaultDisplayHeightUnits(type) : nodeGraphModuleLayout.moduleScopeHeightGu;
  const targetHeightGu = defaultHeightGu + Math.round(Number(offset) || 0);
  return normalizeNodeGraphModuleDisplayHeightUnits(targetHeightGu, type) - defaultHeightGu;
}

function nodeGraphModuleConfiguredDisplayHeightUnits(type, ui = {}) {
  if (
    !nodeGraphModuleTypeHasHideableOscilloscope(type) &&
    !nodeGraphModuleTypeHasCustomDisplayArea(type)
  ) {
    return 0;
  }
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, type);
  const defaultHeightGu = nodeGraphModuleDefaultDisplayHeightUnits(type);
  // App-wide: min 1gu face (LayoutA scopes, LayoutB shells, Knob, …).
  return normalizeNodeGraphModuleDisplayHeightUnits(
    defaultHeightGu + normalizedUi.displayHeightOffsetGu,
    type,
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
  const declaredWidthGu = Number(nodeGraphModuleDefinitions[type]?.defaultWidthGu);
  if (Number.isFinite(declaredWidthGu)) {
    return Math.max(1, Math.round(declaredWidthGu));
  }
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
  if (nodeGraphModuleDefinitions[type]?.layout === "envelopeCurve") {
    return 8;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pitchQuantizer") {
    return 10;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "asciiscope") {
    return 14;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pulseCurve") {
    return 8;
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "wallRoomDisplay") {
    return 8;
  }
  // ~15 white keys at usable width + I/O chrome; 7gu was crushing note labels.
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    return 18;
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
    ? Math.max(minimum, Math.min(limits.maxGu, value))
    : fallback;
}

/**
 * Shared LayoutA + LayoutB bottom clearance (one mechanism):
 *   heightGu = ceil(contentGu)
 *   if leftover &lt; 2px → heightGu += 1
 * CSS places that leftover under the last content via a trailing
 * minmax(2px, 1fr) track (see --node-module-bottom-gap-track).
 */
function nodeGraphModuleHeightWithBottomClearance(contentGu) {
  const required = Math.max(0, Number(contentGu) || 0);
  let heightGu = Math.ceil(required);
  const gridPx = Math.max(1, Number(nodeGraphGrid?.heightPx) || 28);
  const slackPx = (heightGu - required) * gridPx;
  if (slackPx < 2) {
    heightGu += 1;
  }
  return heightGu;
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

/** Fixed I/O strip height for graph layout (Smooth/Step Graph). App policy: 26px. */
const nodeGraphGraphLayoutIoSectionHeightPx = 26;

function nodeGraphGraphLayoutIoSectionHeightGu() {
  const gridH = typeof nodeGraphGridHeight === "function" ? nodeGraphGridHeight() : 28;
  return nodeGraphGraphLayoutIoSectionHeightPx / Math.max(1, Number(gridH) || 28);
}

function nodeGraphModuleIoSectionHeightGu(type) {
  // Smooth / Step Graph: always 26px — no growth with port count, no exceptions.
  if (nodeGraphModuleDefinitions[type]?.layout === "graph") {
    return nodeGraphGraphLayoutIoSectionHeightGu();
  }
  const rows = nodeGraphModuleIoRowCount(type);
  const rowHeight = rows * nodeGraphModuleLayout.ioRowHeightGu;
  const gapHeight = Math.max(0, rows - 1) * nodeGraphModuleLayout.ioRowGapGu;
  return Math.max(
    nodeGraphModuleLayout.ioSectionMinHeightGu,
    rowHeight + gapHeight + nodeGraphModuleLayout.ioPaddingYGu,
  );
}

/**
 * LayoutB side columns: each jack row is fixed to --node-port-area-size
 * (one grid gu), not the compact text-row height used by LayoutA IO.
 * Height math MUST match that CSS or short shells clip ports and hitboxes drift.
 * Graph layout: 26px jack bands (see .dsp-node.graph-node-layout).
 */
function nodeGraphLayoutBPortBandGu(type = null) {
  if (type && nodeGraphModuleDefinitions[type]?.layout === "graph") {
    return nodeGraphGraphLayoutIoSectionHeightGu();
  }
  return 1;
}

/** @deprecated use nodeGraphLayoutBPortBandGu */
const nodeGraphSolidModulePortBandGu = nodeGraphLayoutBPortBandGu;

function nodeGraphLayoutBIoColumnHeightGu(type) {
  const rows = Math.max(0, nodeGraphModuleIoRowCount(type));
  if (rows <= 0) {
    return 0;
  }
  return rows * nodeGraphLayoutBPortBandGu(type);
}

/** @deprecated use nodeGraphLayoutBIoColumnHeightGu */
const nodeGraphSolidModuleIoColumnHeightGu = nodeGraphLayoutBIoColumnHeightGu;

/** LayoutB shell height in gu: max(display Height, denser IO column, 1gu floor). */
function nodeGraphLayoutBShellHeightGu(type, ui = {}) {
  const displayGu = nodeGraphModuleConfiguredDisplayHeightUnits(type, ui);
  const ioGu = nodeGraphLayoutBIoColumnHeightGu(type);
  const minDisplayGu = nodeGraphModuleDisplayHeightLimits.minGu;
  return Math.max(minDisplayGu, displayGu, ioGu);
}

/** @deprecated use nodeGraphLayoutBShellHeightGu */
const nodeGraphSolidModuleShellHeightGu = nodeGraphLayoutBShellHeightGu;

/** Keep LayoutB shell CSS vars in sync with height math (create + resize paths). */
function nodeGraphApplyModuleShellHeightCssVars(element, patchNode) {
  if (!element || !patchNode) {
    return;
  }
  const displayGu = typeof nodeGraphPatchNodeDisplayHeightUnits === "function"
    ? nodeGraphPatchNodeDisplayHeightUnits(patchNode)
    : nodeGraphModuleDisplayHeightUnits(patchNode.type, patchNode.ui);
  element.style.setProperty("--node-module-display-height-units", String(displayGu));
  const shellGu = (
    typeof nodeGraphModuleUsesLayoutB === "function"
    && nodeGraphModuleUsesLayoutB(patchNode.type)
  )
    ? nodeGraphLayoutBShellHeightGu(patchNode.type, patchNode.ui)
    : displayGu;
  element.style.setProperty("--node-module-shell-height-units", String(shellGu));
}

function nodeGraphModuleHiddenIoSectionHeightGu(type) {
  // Hide In/Out for real — no proxy strip height residual.
  void type;
  return 0;
}

function nodeGraphModuleTypeHasInterfaceControls(type) {
  return ["samplePlayer", "sampleLooper", "audioPlayer"].includes(type);
}

function nodeGraphModuleInterfaceControlsVisibleForUi(type, ui = {}) {
  return nodeGraphModuleTypeHasInterfaceControls(type) && !nodeGraphEffectivePatchNodeUi(ui, type).interfaceControlsHidden;
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

function nodeGraphModuleHeaderHeightUnits(ui = {}, type = "") {
  const normalizedUi = nodeGraphEffectivePatchNodeUi(ui, type);
  // Headerless LayoutB (Knob, …) omits the header entirely when the
  // title is hidden — do not reserve the LayoutA "buttons-only" strip.
  if (
    type
    && typeof nodeGraphModuleIsHeaderlessLayoutB === "function"
    && nodeGraphModuleIsHeaderlessLayoutB(type)
    && normalizedUi.titleHidden
  ) {
    return 0;
  }
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
  const normalizedUi = nodeGraphEffectivePatchNodeUi(ui, type);
  const slidersVisible = nodeGraphModuleTypeHasHideableSliders(type) && !normalizedUi.slidersHidden;
  const displayVisible = nodeGraphModuleDisplayVisibleForUi(type, ui);
  const interfaceControlsVisible = nodeGraphModuleInterfaceControlsVisibleForUi(type, ui);
  const ioVisible = !normalizedUi.ioHidden && nodeGraphModuleTypeHasIoPorts(type);
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
      // Music Player's waveform row is `minmax(scope, 1fr)` (styles.css), so it
      // swallows every spare pixel and the slider stack always ended up flush
      // with the module's bottom edge no matter how tall the module was. The
      // matching cushion row in the phosphor-waveform grid template is what the
      // clearance actually lands in; this keeps the height math aware of it.
      { id: "cushion", heightGu: 1, visible: type === "audioPlayer" },
      // The waveform panel sits inside a 2px margin plus a 1px black ring on
      // each side (.node-phosphor-waveform-display), so its grid row is 6px
      // taller than the canvas the scope-height setting asks for.
      { id: "waveformInset", heightGu: 6 / 28, visible: type === "audioPlayer" },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "led") {
    return [{ id: "face", heightGu: 1, visible: true }];
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
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "canvas") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "canvas", heightGu: nodeGraphModuleDefaultDisplayHeightUnits(type), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "visualScope") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "screen", heightGu: nodeGraphDefaultModuleGridWidthUnits(type), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
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
      // Shared display-height control (min 1gu) — was fixed at 4×scope (~8gu+).
      { id: "graph", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "sliderWidget") {
    // LayoutB headerless: optional title + shell + sliders (+ clearance outside).
    const paramRows = slidersVisible ? nodeGraphModuleVisibleBodyRowCount(type) : 0;
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    return [
      { id: "header", heightGu: headerGu, visible: headerGu > 0 },
      { id: "shell", heightGu: nodeGraphLayoutBShellHeightGu(type, ui), visible: true },
      {
        id: "params",
        heightGu: paramRows * nodeGraphModuleLayout.sliderRowHeightGu,
        visible: paramRows > 0,
      },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    // Heading + piano surface + signal/bitmask rows need more than a scope face.
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "keyboard", heightGu: 16, visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "macroControls") {
    // Macro knobs are the display face (no heading chrome).
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
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
  // LayoutA custom display faces (BADVAL warning panel, …): same row stack as
  // a normal scope module — header / display / IO / params / inset — so Height
  // resize follows LayoutA display-height policy.
  if (nodeGraphModuleDefinitions[type]?.layout === "badvalMonitor") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "filterCurve") {
    // LayoutA stack: header | face (display gu) | IO under | params.
    // Crossovers stay LayoutA so many band outs do not inflate the face height.
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "envelopeCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pitchQuantizer") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "asciiscope") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "wallRoomDisplay") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "room", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pulseCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 2, visible: true },
    ];
  }
  return [
    { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
    { id: "scope", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
    { id: "interfaceControls", heightGu: nodeGraphModuleInterfaceControlsHeightGu(type, ui), visible: interfaceControlsVisible },
    { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
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

/**
 * Content height only (no clearance). LayoutB stack:
 *   [header/title] + shell (face + side ports) + param rows + inset
 * Shell already absorbs side-port column height — do NOT add a separate IO
 * track under the face (that is LayoutA). Display and sliders each own space.
 * Clearance is applied via nodeGraphModuleHeightWithBottomClearance when params exist.
 */
function nodeGraphLayoutBContentHeightGu(type, ui = {}, { compact = false } = {}) {
  const shellGu = nodeGraphLayoutBShellHeightGu(type, ui);
  const rows = nodeGraphModuleVisibleSliderRowCountForUi(type, ui);
  const sliderGu = rows > 0
    ? rows * nodeGraphModuleLayout.sliderRowHeightGu
    : 0;
  // Headered LayoutB (crossover, graph, …) and headerless-with-title both use
  // the shared header height helper (0 when title/buttons fully hidden).
  const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
  // No slider band: content is header + shell only (no empty bottom lip / inset).
  if (sliderGu <= 0) {
    return headerGu + shellGu;
  }
  if (compact) {
    return headerGu + shellGu + sliderGu;
  }
  return headerGu + shellGu + sliderGu + nodeGraphModuleLayout.moduleGridInsetGu * 2;
}

/** LayoutB total height: params → bottom-clearance lip; no params → exact shell. */
function nodeGraphLayoutBGridHeightUnits(type, ui = {}, { compact = false } = {}) {
  const content = nodeGraphLayoutBContentHeightGu(type, ui, { compact });
  const rows = nodeGraphModuleVisibleSliderRowCountForUi(type, ui);
  // No sliders: do not add the shared bottom-gap gu — CSS gives shell 1fr instead.
  if (rows <= 0) {
    return Math.max(1, Math.ceil(content));
  }
  return nodeGraphModuleHeightWithBottomClearance(content);
}

/** @deprecated use nodeGraphLayoutBGridHeightUnits */
const nodeGraphSolidModuleGridHeightUnits = nodeGraphLayoutBGridHeightUnits;

function nodeGraphModuleGridHeightUnitsForUi(type, ui = {}) {
  // Any LayoutB module (crossover filter-curve, graph, chromeless, knob, …):
  // header + shell (face | ports) + sliders. Never use LayoutA's "face + IO under
  // + params" stack — that under-allocates and overlaps display with sliders.
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    if (
      nodeGraphChromelessModuleLayouts.has(nodeGraphModuleDefinitions[type]?.layout)
      && nodeGraphChromelessModuleIsCompactTile(type)
    ) {
      return nodeGraphLayoutBGridHeightUnits(type, ui, { compact: true });
    }
    return nodeGraphLayoutBGridHeightUnits(type, ui);
  }
  // Chromeless LayoutA: full header/face/IO/params stack.
  if (nodeGraphChromelessModuleLayouts.has(nodeGraphModuleDefinitions[type]?.layout)) {
    if (nodeGraphChromelessModuleIsCompactTile(type)) {
      return nodeGraphModuleSizingCapabilities(type).displayHeight
        ? nodeGraphModuleConfiguredDisplayHeightUnits(type, ui)
        : 1;
    }
    const layoutAContentGu = nodeGraphModuleRequiredHeightUnitsForUi(type, ui);
    return nodeGraphModuleHeightWithBottomClearance(layoutAContentGu);
  }
  // LayoutA headered modules: content widgets only, then same clearance rule.
  const contentGu = nodeGraphModuleRequiredHeightUnitsForUi(type, ui);
  return nodeGraphModuleHeightWithBottomClearance(contentGu);
}

function nodeGraphPatchNodeGridHeightUnits(node) {
  const scriptGrid = nodeGraphPatchNodeCanvasScriptGridUnits(node);
  if (scriptGrid?.heightGu) {
    return normalizeNodeGraphModuleHeightUnits(node?.type, scriptGrid.heightGu);
  }
  const moduleHeightCapability = nodeGraphModuleSizingCapabilities(node?.type).moduleHeight;
  if (moduleHeightCapability === "textBox" && Number.isFinite(Number(node.heightGu))) {
    return normalizeNodeGraphTextBoxHeightUnits(node.heightGu);
  }
  if (moduleHeightCapability === "custom" && Number.isFinite(Number(node.heightGu))) {
    return normalizeNodeGraphModuleHeightUnits(node?.type, node.heightGu, node.ui);
  }
  const autoHeightGu = nodeGraphModuleGridHeightUnitsForUi(node?.type, node?.ui);
  return normalizeNodeGraphModuleHeightUnits(node?.type, autoHeightGu, node?.ui);
}
