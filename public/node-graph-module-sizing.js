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
  // App-wide floor (gu). Existing module box clips widgets as they run out of room.
  minGu: 1,
});

const nodeGraphModuleHeightLimits = Object.freeze({
  maxGu: 60,
  minGu: 1,
});

// ---------------------------------------------------------------------------
// MODULE HEIGHT — single source of truth (ALL modules)
// ---------------------------------------------------------------------------
// Grid unit = nodeGraphGrid.heightPx (28px). Three numbers matter:
//
// FACE  (display)  Integer 1…60. Stored as ui.displayHeightOffsetGu vs default.
//                  Floor is ALWAYS 1gu app-wide (LayoutA scopes, LayoutB shells,
//                  graph, XY Pad, …). LayoutC has no face.
//
// SHELL (LayoutB)  = FACE. Side jacks share the face height (CSS 1fr rows).
//                  Jacks must never inflate shell above face (that made Smooth
//                  Graph paint multi-gu while Height said 1gu).
//
// OUTER (bounds)   Total patch grid cells. THE Height readout + CSS var
//                  --node-grid-height-units.
//                    LayoutA: header + face + IO under + params + inset + lip
//                    LayoutB: header + shell(face) + params + inset + lip
//                    LayoutC: freehand heightGu (title + I/O only)
//
// HEIGHT CONTROL   Shows OUTER. Face modules: +/- steps FACE (min at face=1
//                  ⇒ min outer). LayoutC / textBox: +/- steps outer heightGu.
//
// Write path: nodeGraphApplyModuleShellHeightCssVars + --node-grid-height-units.
// ---------------------------------------------------------------------------

// App-wide face/display policy: 1…60 gu.
const nodeGraphModuleDisplayHeightLimits = Object.freeze({
  maxGu: 60,
  minGu: 1,
  stepGu: 1,
});

/** LayoutB module width floor (app-wide policy: 1 gu). */
const nodeGraphLayoutBMinGu = 1;

/** LayoutC convenience thrus (Vectorscope, …): app-wide floor is 1gu. */
const nodeGraphLayoutCMinGu = 1;

/**
 * LayoutA min width = app-wide floor only (no per-label inflation).
 * Kept as a named helper so call sites stay readable.
 */
function nodeGraphLayoutAMinWidthGuFromIoLabels(_type) {
  return nodeGraphModuleWidthLimits.minGu;
}

function nodeGraphModuleWidthLimitsForType(type) {
  if (nodeGraphChromelessModuleIsCompactTile(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: 1 };
  }
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: nodeGraphLayoutCMinGu };
  }
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    return { ...nodeGraphModuleWidthLimits, minGu: nodeGraphLayoutBMinGu };
  }
  // MIDI Keyboard needs real horizontal room for white keys + labels.
  if (nodeGraphModuleDefinitions[type]?.layout === "keyboardController") {
    return { ...nodeGraphModuleWidthLimits, minGu: 14 };
  }
  // LayoutA / generic: app-wide floor.
  return nodeGraphModuleWidthLimits;
}

function nodeGraphModuleHeightLimitsForType(type) {
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    // Floor is content (title + port rows); upper bound stays app-wide.
    return {
      maxGu: nodeGraphModuleHeightLimits.maxGu,
      minGu: nodeGraphLayoutCMinContentHeightGu(type),
    };
  }
  return nodeGraphModuleHeightLimits;
}

/**
 * LayoutC: title + I/O only. Minimum height = title strip + port-row strip
 * (max(in,out) rows). No face, no param rows.
 */
function nodeGraphLayoutCMinContentHeightGu(type, ui = {}) {
  const headerGu = typeof nodeGraphModuleHeaderHeightUnits === "function"
    ? nodeGraphModuleHeaderHeightUnits(ui, type)
    : nodeGraphModuleLayout.headerTitleRowHeightGu;
  const ioGu = nodeGraphModuleTypeHasIoPorts(type)
    ? nodeGraphModuleIoSectionHeightGu(type)
    : 0;
  // At least 2gu so a single port row stays clickable; dense I/O raises the floor.
  return Math.max(nodeGraphLayoutCMinGu, Math.ceil(headerGu + ioGu));
}

/** LayoutC total module height (bounds = gu). */
function nodeGraphLayoutCGridHeightUnits(type, ui = {}, heightGu = null) {
  const minGu = nodeGraphLayoutCMinContentHeightGu(type, ui);
  const maxGu = nodeGraphModuleHeightLimits.maxGu;
  const declared = Number(nodeGraphModuleDefinitions[type]?.defaultHeightGu);
  const fallback = Number.isFinite(declared) ? Math.round(declared) : minGu;
  const raw = Number.isFinite(Number(heightGu)) ? Math.round(Number(heightGu)) : fallback;
  return Math.max(minGu, Math.min(maxGu, raw));
}

/** Shared face/display-height limits for every type (min 1gu). Do not raise per-layout. */
function nodeGraphModuleDisplayHeightLimitsForType(_type = null) {
  return nodeGraphModuleDisplayHeightLimits;
}

/**
 * True when the module has a resizable display face (scopes, graph, XY Pad,
 * Pitch LED, RoundShape, filter curves, …). SSOT for “has a display”.
 * LayoutC / chromeless compact tiles have no face.
 * Must not call HasHideable* (that depends on this).
 *
 * Policy is opt-out (same as pre–DISPLAY HIDE SSOT HasHideableOscilloscope):
 * any defined LayoutA processor gets a default scope face even with no
 * displayType/layout field. Requiring displayType/layout only stripped faces
 * from Vactrols, linear envelopes, pluck, and other plain defs.
 * Hide still applies via nodeGraphModuleDisplayVisibleForUi when HasFace.
 */
function nodeGraphModuleHasFace(type) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType) {
    return false;
  }
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(normalizedType)) {
    return false;
  }
  if (nodeGraphChromelessModuleIsCompactTile?.(normalizedType)) {
    return false;
  }
  const definition = nodeGraphModuleDefinitions[normalizedType];
  if (!definition) {
    return false;
  }
  // Custom / status / control faces (Pitch, RoundShape, graph, XY, …).
  if (nodeGraphModuleTypeHasCustomDisplayArea(normalizedType)) {
    return true;
  }
  const layout = definition.layout;
  // Shells with no display face row (opt-out list).
  if ([
    "canvas",
    "image",
    "keyboardController",
    "macroControls",
    "pitchModWheel",
    "screenSpaceShader",
    "speakerProtection",
    "textBox",
  ].includes(layout)) {
    return false;
  }
  // Explicit analyzer / multi-mode faces.
  if (definition.displayType || (Array.isArray(definition.displayModes) && definition.displayModes.length)) {
    return true;
  }
  // Named layout that owns a face row, OR default LayoutA (no layout) DSP —
  // both get a face. Plain envelopes/filters rely on the no-layout path.
  return true;
}

/**
 * Clone ui with an absolute face height (clamped 1…60). Used for min/max outer.
 */
function nodeGraphModuleUiWithFaceHeightGu(ui, type, faceGu) {
  const base = typeof normalizeNodeGraphPatchNodeUi === "function"
    ? normalizeNodeGraphPatchNodeUi(ui, type)
    : { ...(ui || {}) };
  const defaultFace = nodeGraphModuleDefaultDisplayHeightUnits(type);
  const limits = nodeGraphModuleDisplayHeightLimitsForType(type);
  const face = Math.max(
    limits.minGu,
    Math.min(limits.maxGu, Math.round(Number(faceGu) || limits.minGu)),
  );
  return {
    ...base,
    displayHeightOffsetGu: face - defaultFace,
  };
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

// Types whose CUSTOM UI occupies the display area instead of a classic
// analyzer scope (xyPad pad, graph editor, Pitch LED, RoundShape, …).
// They still use display-height sizing. App-wide policy: ALL faces/displays
// honor show/hide via nodeGraphModuleDisplayVisibleForUi — no exemptions.
function nodeGraphModuleTypeHasCustomDisplayArea(type) {
  if (typeof nodeGraphChromelessModuleHasCustomDisplayArea === "function"
    && nodeGraphChromelessModuleHasCustomDisplayArea(type)) {
    return true;
  }
  const definition = nodeGraphModuleDefinitions[type];
  if (definition?.customDisplayArea) {
    return true;
  }
  const layout = definition?.layout;
  // LayoutA status faces + LayoutB/control faces that own the display row.
  return layout === "graph"
    || layout === "sliderWidget"
    || layout === "badvalMonitor"
    || layout === "pitchDetector"
    || layout === "pitchQuantizer"
    || layout === "asciiscope"
    || layout === "macroControls"
    || layout === "filterCurve"
    || layout === "roundShape"
    || layout === "envelopeCurve"
    || layout === "pulseCurve"
    || layout === "wallRoomDisplay";
}

/**
 * App-wide SSOT: any module with a face/display can be shown/hidden.
 * (Legacy name "oscilloscope" = the display face row, not only analyzer scopes.)
 */
function nodeGraphModuleTypeHasHideableOscilloscope(type) {
  if (nodeGraphChromelessModuleIsCompactTile?.(type)) {
    return false;
  }
  return nodeGraphModuleHasFace(type);
}

function nodeGraphPatchNodeHasHideableOscilloscope(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphModuleTypeHasHideableOscilloscope(patchNode?.type);
}

// Resizable face — gate for Height control on face modules (scopes, graph, XY, …).
function nodeGraphPatchNodeHasResizableDisplayArea(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  return nodeGraphModuleHasFace(patchNode?.type);
}

function nodeGraphModuleSizingCapabilities(type) {
  const normalizedType = String(type || "").trim();
  const definition = nodeGraphModuleDefinitions[normalizedType];
  const layout = definition?.layout;
  // LayoutC: freehand heightGu (bounds = module shell); no display-height face.
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(normalizedType)) {
    return Object.freeze({
      width: Boolean(definition),
      moduleHeight: "custom",
      displayHeight: false,
      keyboardHeight: true,
    });
  }
  // Freehand outer heightGu (text box / keyboard / canvas script). Most modules
  // use auto outer height + display-height for the face (app policy: Width + Height).
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
  // Face / display area height (1…60gu) — scopes, graph, XY Pad, filter curves, …
  // Graph (layout:"graph") must always expose this; no silent opt-out.
  const displayHeight = !moduleHeight && (
    nodeGraphModuleTypeHasHideableOscilloscope(normalizedType) ||
    nodeGraphModuleTypeHasCustomDisplayArea(normalizedType) ||
    layout === "graph"
  );
  return Object.freeze({
    width: Boolean(definition),
    moduleHeight,
    displayHeight,
    keyboardHeight: Boolean(moduleHeight || displayHeight),
  });
}

/**
 * App-wide SSOT for “is this module’s display face shown?”
 * Uses effective UI (local hide + force-show + global Displays toggle).
 * No layout/type is exempt — if it has a face, it can be hidden.
 */
function nodeGraphModuleDisplayVisibleForUi(type, ui = {}) {
  if (!nodeGraphModuleHasFace(type)) {
    return false;
  }
  return !nodeGraphEffectivePatchNodeUi(ui, type).oscilloscopeHidden;
}

/** Mount-time gate: only create/attach display faces when visible. */
function nodeGraphModuleShouldMountDisplayFace(type, ui = {}) {
  return nodeGraphModuleDisplayVisibleForUi(type, ui);
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

/**
 * Absolute face height in gu (1…60), or 0 if this type has no face / face hidden.
 * This is NEVER the Module Settings "Height" readout — that is outer height.
 */
function nodeGraphModuleConfiguredDisplayHeightUnits(type, ui = {}) {
  if (!nodeGraphModuleHasFace(type)) {
    return 0;
  }
  const normalizedUi = normalizeNodeGraphPatchNodeUi(ui, type);
  const defaultHeightGu = nodeGraphModuleDefaultDisplayHeightUnits(type);
  return normalizeNodeGraphModuleDisplayHeightUnits(
    defaultHeightGu + Number(normalizedUi.displayHeightOffsetGu || 0),
    type,
  );
}

/** Face height used for layout (0 when oscilloscope hidden on hideable faces). */
function nodeGraphModuleDisplayHeightUnits(type, ui = {}) {
  if (!nodeGraphModuleHasFace(type)) {
    return 0;
  }
  return nodeGraphModuleDisplayVisibleForUi(type, ui)
    ? nodeGraphModuleConfiguredDisplayHeightUnits(type, ui)
    : 0;
}

/** Alias — absolute face height when visible. */
function nodeGraphModuleFaceHeightGu(type, ui = {}) {
  return nodeGraphModuleDisplayHeightUnits(type, ui);
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
    const limits = nodeGraphModuleWidthLimitsForType(type);
    return Math.max(limits.minGu, Math.round(declaredWidthGu));
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
  if (
    nodeGraphModuleDefinitions[type]?.layout === "filterCurve"
    || nodeGraphModuleDefinitions[type]?.layout === "roundShape"
  ) {
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
  if (nodeGraphModuleDefinitions[type]?.layout === "pitchDetector") {
    return Math.max(8, nodeGraphLayoutAMinWidthGuFromIoLabels(type) || 8);
  }
  // LayoutA: default at least wide enough for port labels (Frequency, …).
  const layoutAMin = nodeGraphLayoutAMinWidthGuFromIoLabels(type);
  return Math.max(7, layoutAMin || 0);
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

/** Title visible, everything else hidden — no extra lip / empty chrome. */
function nodeGraphModuleIsTitleOnlyUi(type, ui = {}) {
  // Text Box is opted out of "display face" (not an oscilloscope). Without
  // this exception, default buttons-off + no I/O + no sliders collapses the
  // module to the header only and hides the body.
  if (nodeGraphModuleDefinitions[type]?.layout === "textBox") {
    return false;
  }
  const effective = typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(ui, type)
    : ui;
  if (!effective || effective.titleHidden) {
    return false;
  }
  const displayOff = typeof nodeGraphModuleHasFace === "function"
    ? !nodeGraphModuleDisplayVisibleForUi(type, ui)
    : true;
  const slidersOff = typeof nodeGraphModuleTypeHasHideableSliders === "function"
    ? !nodeGraphModuleTypeHasHideableSliders(type) || Boolean(effective.slidersHidden)
    : Boolean(effective.slidersHidden);
  const ioOff = typeof nodeGraphModuleTypeHasIoPorts === "function"
    ? !nodeGraphModuleTypeHasIoPorts(type) || Boolean(effective.ioHidden)
    : Boolean(effective.ioHidden);
  const buttonsOff = Boolean(effective.buttonsHidden);
  const surfaceOff = typeof nodeGraphModuleInterfaceControlsVisibleForUi === "function"
    ? !nodeGraphModuleInterfaceControlsVisibleForUi(type, ui)
    : true;
  return displayOff && slidersOff && ioOff && buttonsOff && surfaceOff;
}

/** Display + title + buttons + I/O + sliders all hidden. */
function nodeGraphModuleIsCollapsedUi(type, ui = {}) {
  if (nodeGraphModuleDefinitions[type]?.layout === "textBox") {
    return false;
  }
  const effective = typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(ui, type)
    : ui;
  if (!effective) {
    return false;
  }
  const displayOff = typeof nodeGraphModuleHasFace === "function"
    ? !nodeGraphModuleDisplayVisibleForUi(type, ui)
    : Boolean(effective.oscilloscopeHidden);
  const slidersOff = typeof nodeGraphModuleTypeHasHideableSliders === "function"
    ? !nodeGraphModuleTypeHasHideableSliders(type) || Boolean(effective.slidersHidden)
    : Boolean(effective.slidersHidden);
  const ioOff = typeof nodeGraphModuleTypeHasIoPorts === "function"
    ? !nodeGraphModuleTypeHasIoPorts(type) || Boolean(effective.ioHidden)
    : Boolean(effective.ioHidden);
  return Boolean(effective.titleHidden)
    && Boolean(effective.buttonsHidden)
    && displayOff
    && slidersOff
    && ioOff;
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

/**
 * Param stack height in gu (visible rows only).
 * Must match CSS: .dsp-node-body grid-auto-rows = --node-body-row-height
 * and gap = --node-body-row-gap (currently 0).
 * Pass ui to honor sliders-hidden / effective UI; omit ui for raw definition rows.
 */
function nodeGraphModuleSliderBodyHeightGu(type, ui = null) {
  const rows = ui != null
    ? nodeGraphModuleVisibleSliderRowCountForUi(type, ui)
    : nodeGraphModuleVisibleBodyRowCount(type);
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
  // LayoutB modules keep ports in the shell — no under-face IO strip height.
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    return 0;
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
 * LayoutB side-column band height (gu) when sizing a free-standing jack column.
 * In the shell, bands are CSS 1fr shares of the face height — they do NOT
 * force the shell taller than the face (face can be 1gu with N ports).
 */
function nodeGraphLayoutBPortBandGu(_type = null) {
  return 1;
}

/** @deprecated alias — use nodeGraphLayoutBPortBandGu */
const nodeGraphSolidModulePortBandGu = nodeGraphLayoutBPortBandGu;

function nodeGraphLayoutBIoColumnHeightGu(type) {
  const rows = Math.max(0, nodeGraphModuleIoRowCount(type));
  if (rows <= 0) {
    return 0;
  }
  return rows * nodeGraphLayoutBPortBandGu(type);
}

/** @deprecated alias — use nodeGraphLayoutBIoColumnHeightGu */
const nodeGraphSolidModuleIoColumnHeightGu = nodeGraphLayoutBIoColumnHeightGu;

/**
 * LayoutB shell height in gu = FACE height (1…60).
 *
 * Side jacks live inside the shell and share its height via equal 1fr rows.
 * They must never inflate shell above the face — otherwise “Height face = 1gu”
 * still painted multi-gu (Smooth Graph / multi-port LayoutB) and min outer
 * could not reach the true face=1 floor.
 */
function nodeGraphLayoutBShellHeightGu(type, ui = {}) {
  const faceGu = nodeGraphModuleDisplayHeightUnits(type, ui);
  if (faceGu > 0) {
    return Math.max(nodeGraphModuleDisplayHeightLimits.minGu, faceGu);
  }
  // No visible face: still need a 1gu plate (or jack-only floor).
  const ioGu = nodeGraphLayoutBIoColumnHeightGu(type);
  return Math.max(nodeGraphModuleDisplayHeightLimits.minGu, ioGu);
}

/** @deprecated use nodeGraphLayoutBShellHeightGu */
const nodeGraphSolidModuleShellHeightGu = nodeGraphLayoutBShellHeightGu;

/**
 * Write face / shell / IO CSS height units onto a module element.
 * Single write path for create + patch sync + visibility refresh.
 *
 *   --node-module-display-height-units  face (LayoutA scope row / LayoutB face)
 *   --node-module-shell-height-units    LayoutB shell track (= face when face on)
 *   --node-module-io-height-units       LayoutA under-face IO strip (0 on LayoutB)
 *   --node-grid-height-units            OUTER module (set by callers separately)
 */
function nodeGraphApplyModuleShellHeightCssVars(element, patchNode) {
  if (!element || !patchNode) {
    return;
  }
  const type = patchNode.type;
  const ui = patchNode.ui;
  const faceGu = typeof nodeGraphPatchNodeDisplayHeightUnits === "function"
    ? nodeGraphPatchNodeDisplayHeightUnits(patchNode)
    : nodeGraphModuleDisplayHeightUnits(type, ui);
  // Face units drive LayoutA --node-module-scope-height.
  element.style.setProperty("--node-module-display-height-units", String(faceGu));
  const isLayoutB = typeof nodeGraphModuleUsesLayoutB === "function"
    && nodeGraphModuleUsesLayoutB(type);
  const shellGu = isLayoutB
    ? nodeGraphLayoutBShellHeightGu(type, ui)
    : faceGu;
  element.style.setProperty("--node-module-shell-height-units", String(shellGu));
  // LayoutA only: reserve under-face I/O strip so dense outlets never crush params.
  // LayoutB ports are in the shell — always 0.
  const effectiveUi = typeof nodeGraphEffectivePatchNodeUi === "function"
    ? nodeGraphEffectivePatchNodeUi(ui, type)
    : (ui || {});
  const ioHidden = Boolean(effectiveUi.ioHidden)
    || !nodeGraphModuleTypeHasIoPorts(type)
    || isLayoutB;
  const ioGu = ioHidden
    ? 0
    : (typeof nodeGraphModuleIoSectionHeightGu === "function"
      ? nodeGraphModuleIoSectionHeightGu(type)
      : 0);
  element.style.setProperty("--node-module-io-height-units", String(ioGu));
  // Tracks + child placement are owned by applyNodeGraphModuleLayout.
  // Hidden face ⇒ no face track (do not leave a 0px hole for auto-placement).
  element.classList.remove("face-row-collapsed");
  if (typeof applyNodeGraphModuleLayout === "function") {
    applyNodeGraphModuleLayout(element, patchNode);
  }
}

/** Widget-list ids → one of: header | face | controls | io | params | shell | lip */
const NODE_GRAPH_MODULE_WIDGET_BAND_ID = Object.freeze({
  header: "header",
  scope: "face",
  trace: "face",
  curve: "face",
  room: "face",
  face: "face",
  screen: "face",
  image: "face",
  canvas: "face",
  text: "face",
  keyboard: "face",
  wheels: "face",
  interfaceControls: "controls",
  io: "io",
  params: "params",
  shell: "shell",
  cushion: "lip",
  waveformInset: "lip",
  inset: "lip",
});

function nodeGraphModuleCanonicalBandId(widgetId) {
  const key = String(widgetId || "");
  return NODE_GRAPH_MODULE_WIDGET_BAND_ID[key] || key;
}

function tagNodeGraphModuleBand(element, bandId) {
  if (!element || !bandId) {
    return element;
  }
  element.dataset.moduleBand = bandId;
  if (bandId === "face") {
    element.classList.add("node-module-face");
  }
  return element;
}

/**
 * Ordered visible stack for one module. Same numbers as the widget list;
 * ids are the six chrome bands. Hidden band ⇒ omitted from apply.
 */
function nodeGraphModuleLayoutBands(type, ui = {}) {
  if (typeof nodeGraphModuleIsCollapsedUi === "function" && nodeGraphModuleIsCollapsedUi(type, ui)) {
    return [];
  }
  if (typeof nodeGraphModuleIsTitleOnlyUi === "function" && nodeGraphModuleIsTitleOnlyUi(type, ui)) {
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    return headerGu > 0
      ? [{ id: "header", heightGu: headerGu, visible: true, grow: false }]
      : [];
  }
  // LayoutB article is header + shell(face+side ports) + params — never an
  // under-face I/O track. LED / Value LED / XY Pad all share this recipe.
  // Mapping leftover "face" widgets as the only track hid the shell (jacks
  // crushed, lamp display:none via apply).
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    const shellGu = typeof nodeGraphLayoutBShellHeightGu === "function"
      ? nodeGraphLayoutBShellHeightGu(type, ui)
      : nodeGraphModuleDisplayHeightUnits(type, ui);
    const paramsGu = nodeGraphModuleSliderBodyHeightGu(type, ui);
    const bands = [];
    if (headerGu > 0) {
      bands.push({ id: "header", heightGu: headerGu, visible: true, grow: false });
    }
    bands.push({
      id: "shell",
      heightGu: Math.max(1, Number(shellGu) || 1),
      visible: true,
      grow: paramsGu <= 0,
    });
    if (paramsGu > 0) {
      bands.push({ id: "params", heightGu: paramsGu, visible: true, grow: false });
      bands.push({ id: "lip", heightGu: 0, visible: true, grow: true });
    }
    return bands;
  }
  const widgets = nodeGraphModuleHeightWidgetUnits(type, ui);
  const byId = new Map();
  for (const widget of widgets) {
    const id = nodeGraphModuleCanonicalBandId(widget.id);
    if (!id || id === "lip") {
      continue;
    }
    const heightGu = Math.max(0, Number(widget.heightGu) || 0);
    const visible = widget.visible !== false && heightGu > 0;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, heightGu, visible, grow: false });
    } else {
      existing.heightGu = Math.max(existing.heightGu, heightGu);
      existing.visible = existing.visible || visible;
    }
  }
  let order = [...byId.keys()];
  // Music Player: load-path chrome above the waveform (historical stack).
  if (type === "audioPlayer") {
    order = order.filter((id) => id !== "face" && id !== "controls");
    const headerAt = order.indexOf("header");
    const insertAt = headerAt >= 0 ? headerAt + 1 : 0;
    const extra = ["controls", "face"].filter((id) => byId.has(id));
    order.splice(insertAt, 0, ...extra);
  }
  const isLayoutB = typeof nodeGraphModuleUsesLayoutB === "function"
    && nodeGraphModuleUsesLayoutB(type);
  const isLayoutC = typeof nodeGraphModuleUsesLayoutC === "function"
    && nodeGraphModuleUsesLayoutC(type);
  const layout = nodeGraphModuleDefinitions[type]?.layout;
  const paramsVisible = Boolean(byId.get("params")?.visible);
  const bands = order.map((id) => ({ ...byId.get(id) }));
  if (type === "audioPlayer" || layout === "textBox") {
    const face = bands.find((band) => band.id === "face");
    if (face?.visible) {
      face.grow = true;
    }
  }
  if (isLayoutC) {
    const io = bands.find((band) => band.id === "io");
    if (io?.visible) {
      io.grow = true;
    }
  }
  if (isLayoutB && !paramsVisible) {
    const shell = bands.find((band) => band.id === "shell");
    if (shell?.visible) {
      shell.grow = true;
    }
  }
  const wantsLip = layout !== "led"
    && layout !== "textBox"
    && !(isLayoutB && !paramsVisible);
  if (wantsLip) {
    const musicLip = type === "audioPlayer";
    bands.push({
      id: "lip",
      heightGu: musicLip ? 1 : 0,
      visible: true,
      grow: !musicLip,
    });
  }
  return bands;
}

function nodeGraphModuleBandTrackCss(band) {
  if (!band) {
    return "auto";
  }
  if (band.id === "header") {
    return "var(--node-header-height)";
  }
  if (band.id === "face") {
    return band.grow
      ? "minmax(var(--node-module-scope-height), 1fr)"
      : "var(--node-module-scope-height)";
  }
  if (band.id === "controls") {
    return "var(--node-module-interface-controls-height)";
  }
  if (band.id === "io") {
    return band.grow
      ? "minmax(0, 1fr)"
      : "minmax(var(--node-module-io-track-min, var(--node-io-section-min-height)), auto)";
  }
  if (band.id === "params") {
    return "auto";
  }
  if (band.id === "shell") {
    return band.grow
      ? "minmax(0, 1fr)"
      : "var(--node-module-layout-b-shell-track, calc(var(--node-grid-height) * var(--node-module-shell-height-units, 1)))";
  }
  if (band.id === "lip") {
    if (band.heightGu > 0 && !band.grow) {
      return "var(--node-grid-height)";
    }
    return "var(--node-module-bottom-gap-track, minmax(2px, 1fr))";
  }
  if (band.grow) {
    return "minmax(0, 1fr)";
  }
  if (band.heightGu > 0) {
    return `calc(var(--node-grid-height) * ${band.heightGu})`;
  }
  return "auto";
}

function inferNodeGraphModuleBandId(child) {
  if (!child || child.nodeType !== 1) {
    return "";
  }
  const tagged = child.dataset?.moduleBand;
  if (tagged) {
    return tagged;
  }
  const cls = child.classList;
  if (cls.contains("node-text-box-body")) {
    return "face";
  }
  if (cls.contains("dsp-node-header")) {
    return "header";
  }
  if (cls.contains("dsp-node-io-section")) {
    return "io";
  }
  if (cls.contains("dsp-node-body")) {
    return "params";
  }
  if (cls.contains("node-sample-module-body") || cls.contains("node-module-interface-controls")) {
    return "controls";
  }
  if (cls.contains("node-solid-module-shell") || cls.contains("node-module-chrome-layout-b-shell")) {
    return "shell";
  }
  if (cls.contains("node-module-frame") || child.tagName === "svg") {
    return "";
  }
  if (cls.contains("node-live-input-state-badge")) {
    return "";
  }
  return "face";
}

/**
 * Write article tracks + place children by band id.
 * Hidden band ⇒ no track and the matching child is hidden.
 */
function applyNodeGraphModuleLayout(article, patchNodeOrBands) {
  if (!article) {
    return;
  }
  const bands = Array.isArray(patchNodeOrBands)
    ? patchNodeOrBands
    : nodeGraphModuleLayoutBands(
      patchNodeOrBands?.type || article.dataset?.nodeType,
      patchNodeOrBands?.ui,
    );
  const visible = bands.filter((band) => (
    band.visible && (band.heightGu > 0 || band.grow || band.id === "lip")
  ));
  const stack = visible.map(nodeGraphModuleBandTrackCss).join(" ") || "minmax(0, 1fr)";
  article.classList.add("module-stack");
  article.style.setProperty("--node-module-stack-rows", stack);
  article.style.gridTemplateRows = stack;
  let lastContentIndex = -1;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    if (visible[index].id !== "lip") {
      lastContentIndex = index;
      break;
    }
  }
  for (const child of article.children) {
    const id = inferNodeGraphModuleBandId(child);
    if (id && child.dataset && !child.dataset.moduleBand) {
      child.dataset.moduleBand = id;
    }
    if (id === "face") {
      child.classList.add("node-module-face");
    }
    if (!id) {
      if (lastContentIndex >= 0 && child.tagName !== "svg" && !child.classList.contains("node-module-frame")) {
        child.style.gridRow = String(lastContentIndex + 1);
      }
      continue;
    }
    const index = visible.findIndex((band) => band.id === id);
    if (index >= 0) {
      child.style.gridRow = String(index + 1);
      child.hidden = false;
    } else if (child.classList.contains("node-text-box-body")) {
      const faceIndex = visible.findIndex((band) => band.id === "face");
      child.style.gridRow = String(faceIndex >= 0 ? faceIndex + 1 : Math.max(2, visible.length));
      child.hidden = false;
    } else {
      child.style.gridRow = "auto";
      child.hidden = true;
    }
  }
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
  // LayoutC: title + I/O only (no face, no params).
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui, type), visible: true },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
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
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    return [
      { id: "header", heightGu: headerGu, visible: headerGu > 0 },
      { id: "shell", heightGu: nodeGraphLayoutBShellHeightGu(type, ui), visible: true },
    ];
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
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "visualScope") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "screen", heightGu: nodeGraphDefaultModuleGridWidthUnits(type), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "traceDisplay") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "trace", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "graph") {
    // LayoutB: header + shell(face) + params. Outer via nodeGraphLayoutBGridHeightUnits.
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    const paramsGu = nodeGraphModuleSliderBodyHeightGu(type, ui);
    return [
      { id: "header", heightGu: headerGu, visible: headerGu > 0 },
      { id: "shell", heightGu: nodeGraphLayoutBShellHeightGu(type, ui), visible: true },
      { id: "params", heightGu: paramsGu, visible: paramsGu > 0 },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: paramsGu > 0 },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "sliderWidget") {
    // LayoutB headerless: optional title + shell + sliders (+ clearance outside).
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    const paramsGu = nodeGraphModuleSliderBodyHeightGu(type, ui);
    return [
      { id: "header", heightGu: headerGu, visible: headerGu > 0 },
      { id: "shell", heightGu: nodeGraphLayoutBShellHeightGu(type, ui), visible: true },
      { id: "params", heightGu: paramsGu, visible: paramsGu > 0 },
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: paramsGu > 0 },
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
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (
    nodeGraphModuleDefinitions[type]?.layout === "filterCurve"
    || nodeGraphModuleDefinitions[type]?.layout === "roundShape"
  ) {
    // LayoutA stack: header | face (display gu) | IO under | params.
    // Crossovers stay LayoutA so many band outs do not inflate the face height.
    // RoundShape reuses the same stack (cheap static orbit face).
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "envelopeCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pitchQuantizer") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "asciiscope") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "face", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "wallRoomDisplay") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "room", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  if (nodeGraphModuleDefinitions[type]?.layout === "pulseCurve") {
    return [
      { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui), visible: true },
      { id: "curve", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
      { id: "io", heightGu: ioHeightGu, visible: ioVisible },
      { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type), visible: slidersVisible },
      /* Vertical plate: top full + bottom half (CSS --node-module-grid-inset-y-total). */
      { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
    ];
  }
  return [
    { id: "header", heightGu: nodeGraphModuleHeaderHeightUnits(ui, type), visible: true },
    { id: "scope", heightGu: nodeGraphModuleDisplayHeightUnits(type, ui), visible: displayVisible },
    { id: "interfaceControls", heightGu: nodeGraphModuleInterfaceControlsHeightGu(type, ui), visible: interfaceControlsVisible },
    { id: "io", heightGu: ioHeightGu, visible: ioVisible },
    // Pass ui so sliders-hidden / effective UI matches the outer height SSOT.
    { id: "params", heightGu: nodeGraphModuleSliderBodyHeightGu(type, ui), visible: slidersVisible },
    { id: "inset", heightGu: nodeGraphModuleLayout.moduleGridInsetGu * 1.5, visible: true },
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
 * LayoutB content stack (no clearance) — THE LayoutB height formula:
 *   header + shell(face) + param body [+ plate inset when params exist]
 *
 * Shell = face (ports share face height). Never add under-face IO.
 * Param body uses the same SSOT as LayoutA (nodeGraphModuleSliderBodyHeightGu).
 */
function nodeGraphLayoutBContentHeightGu(type, ui = {}, { compact = false } = {}) {
  const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
  const shellGu = nodeGraphLayoutBShellHeightGu(type, ui);
  const sliderGu = nodeGraphModuleSliderBodyHeightGu(type, ui);
  if (sliderGu <= 0) {
    return headerGu + shellGu;
  }
  if (compact) {
    return headerGu + shellGu + sliderGu;
  }
  // Plate inset: top full + bottom half (CSS --node-module-grid-inset-y-total).
  return headerGu + shellGu + sliderGu + nodeGraphModuleLayout.moduleGridInsetGu * 1.5;
}

/**
 * LayoutB OUTER height (grid cells) → CSS --node-grid-height-units.
 * With params: content + bottom clearance (≥2px lip).
 * No params: ceil(header+shell); CSS gives shell 1fr of that box.
 */
function nodeGraphLayoutBGridHeightUnits(type, ui = {}, { compact = false } = {}) {
  const content = nodeGraphLayoutBContentHeightGu(type, ui, { compact });
  const sliderGu = nodeGraphModuleSliderBodyHeightGu(type, ui);
  if (sliderGu <= 0) {
    return Math.max(1, Math.ceil(content));
  }
  return nodeGraphModuleHeightWithBottomClearance(content);
}

/** @deprecated use nodeGraphLayoutBGridHeightUnits */
const nodeGraphSolidModuleGridHeightUnits = nodeGraphLayoutBGridHeightUnits;

/**
 * OUTER module height for a type+ui (content stack + clearance).
 * This is the single auto-height path used by CSS --node-grid-height-units.
 */
function nodeGraphModuleGridHeightUnitsForUi(type, ui = {}) {
  if (typeof nodeGraphModuleIsCollapsedUi === "function" && nodeGraphModuleIsCollapsedUi(type, ui)) {
    return 1;
  }
  if (typeof nodeGraphModuleIsTitleOnlyUi === "function" && nodeGraphModuleIsTitleOnlyUi(type, ui)) {
    const headerGu = nodeGraphModuleHeaderHeightUnits(ui, type);
    return Math.max(1, Math.ceil(headerGu));
  }
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    return nodeGraphLayoutCGridHeightUnits(type, ui, null);
  }
  if (typeof nodeGraphModuleUsesLayoutB === "function" && nodeGraphModuleUsesLayoutB(type)) {
    if (
      nodeGraphChromelessModuleLayouts.has(nodeGraphModuleDefinitions[type]?.layout)
      && nodeGraphChromelessModuleIsCompactTile(type)
    ) {
      return nodeGraphLayoutBGridHeightUnits(type, ui, { compact: true });
    }
    return nodeGraphLayoutBGridHeightUnits(type, ui);
  }
  if (nodeGraphChromelessModuleLayouts.has(nodeGraphModuleDefinitions[type]?.layout)) {
    if (nodeGraphChromelessModuleIsCompactTile(type)) {
      return nodeGraphModuleSizingCapabilities(type).displayHeight
        ? Math.max(1, nodeGraphModuleConfiguredDisplayHeightUnits(type, ui))
        : 1;
    }
    return nodeGraphModuleHeightWithBottomClearance(
      nodeGraphModuleRequiredHeightUnitsForUi(type, ui),
    );
  }
  return nodeGraphModuleHeightWithBottomClearance(
    nodeGraphModuleRequiredHeightUnitsForUi(type, ui),
  );
}

/**
 * OUTER module height on the patch grid (THE height readout / CSS height units).
 * Freehand heightGu only for LayoutC / textBox / keyboard-style custom modules.
 */
function nodeGraphPatchNodeGridHeightUnits(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (!patchNode) {
    return 1;
  }
  const scriptGrid = nodeGraphPatchNodeCanvasScriptGridUnits(patchNode);
  if (scriptGrid?.heightGu) {
    return normalizeNodeGraphModuleHeightUnits(patchNode.type, scriptGrid.heightGu);
  }
  const type = patchNode.type;
  const ui = patchNode.ui;
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    return nodeGraphLayoutCGridHeightUnits(type, ui, patchNode.heightGu);
  }
  const moduleHeightCapability = nodeGraphModuleSizingCapabilities(type).moduleHeight;
  if (moduleHeightCapability === "textBox" && Number.isFinite(Number(patchNode.heightGu))) {
    return normalizeNodeGraphTextBoxHeightUnits(patchNode.heightGu);
  }
  if (moduleHeightCapability === "custom" && Number.isFinite(Number(patchNode.heightGu))) {
    return normalizeNodeGraphModuleHeightUnits(type, patchNode.heightGu, ui);
  }
  // Face modules + auto LayoutA/B: outer height always follows content (face-driven).
  return Math.max(1, nodeGraphModuleGridHeightUnitsForUi(type, ui));
}

/**
 * Minimum outer height: face modules use face=1gu; LayoutC uses content floor.
 * Height − is disabled at this outer size (cannot go thinner).
 */
function nodeGraphModuleMinOuterHeightGu(type, ui = {}) {
  if (typeof nodeGraphModuleUsesLayoutC === "function" && nodeGraphModuleUsesLayoutC(type)) {
    return nodeGraphLayoutCMinContentHeightGu(type, ui);
  }
  if (nodeGraphModuleHasFace(type)) {
    const uiMin = nodeGraphModuleUiWithFaceHeightGu(ui, type, nodeGraphModuleDisplayHeightLimits.minGu);
    return nodeGraphModuleGridHeightUnitsForUi(type, uiMin);
  }
  const limits = nodeGraphModuleHeightLimitsForType(type);
  return Math.max(1, limits.minGu || 1);
}

/** Maximum outer height when face is max (60gu), or height limits max. */
function nodeGraphModuleMaxOuterHeightGu(type, ui = {}) {
  if (nodeGraphModuleHasFace(type)) {
    const uiMax = nodeGraphModuleUiWithFaceHeightGu(ui, type, nodeGraphModuleDisplayHeightLimits.maxGu);
    return nodeGraphModuleGridHeightUnitsForUi(type, uiMax);
  }
  return nodeGraphModuleHeightLimitsForType(type).maxGu;
}
