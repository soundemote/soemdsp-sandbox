function createNodeGraphTextBoxBody(node) {
  const body = document.createElement("div");
  body.className = "node-text-box-body";
  body.dataset.node = node;
  return body;
}

function syncNodeGraphTextBoxContentAlignment(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field) {
    return;
  }
  field.style.setProperty("--node-text-box-content-offset", "0px");
  const style = window.getComputedStyle(field);
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const text = String(field.value || "");
  const multiline = typeof nodeGraphTextBoxModeIsMultiline === "function"
    ? nodeGraphTextBoxModeIsMultiline(layout.textMode)
    : layout.textMode !== "singleLine";
  const lineCount = multiline
    ? Math.max(1, text.split(/\r\n|\r|\n/).length)
    : 1;
  const contentHeight = lineCount * lineHeight;
  const availableHeight = Math.max(0, field.clientHeight - paddingTop - paddingBottom);
  const remainingHeight = Math.max(0, availableHeight - contentHeight);
  const offset = remainingHeight * normalizeNodeGraphTextBoxVerticalAlignPercent(layout.verticalAlignPercent) / 100;
  field.style.setProperty("--node-text-box-content-offset", `${offset.toFixed(2)}px`);
}

const nodeGraphTextBoxFitScaleLimits = Object.freeze({
  min: 0.4,
  // Fill mode may grow well past 1× when the face is large / text is short.
  maxFill: 16,
});

/**
 * Measure max painted line width at the field's current computed font (fit-scale=1).
 */
function nodeGraphTextBoxMeasureMaxLineWidth(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field) {
    return 0;
  }
  const style = window.getComputedStyle(field);
  const text = String(field.value || "");
  const lines = text.split(/\r\n|\r|\n/);
  const mode = normalizeNodeGraphTextBoxMode(layout.textMode);
  // Multiline/fill: measure whole lines (newlines are author breaks).
  // Also measure longest word so a single long token still shrinks to width.
  const samples = mode === "singleLine"
    ? [text || " "]
    : [
      ...lines.map((line) => line || " "),
      ...lines.flatMap((line) => line.trim().split(/\s+/).filter(Boolean)),
    ];
  const list = samples.length ? samples : [" "];
  const canvas = nodeGraphTextBoxMeasureMaxLineWidth.canvas ||= document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return 0;
  }
  context.font = style.font;
  return list.reduce((width, sample) =>
    Math.max(width, context.measureText(sample || " ").width), 0);
}

/**
 * multiline: shrink only when wider than the box (never grow).
 */
function nodeGraphTextBoxWidthFitScale(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field) {
    return 1;
  }
  if (normalizeNodeGraphTextBoxMode(layout.textMode) === "singleLine") {
    return 1;
  }
  const style = window.getComputedStyle(field);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const availableWidth = Math.max(1, field.clientWidth - paddingLeft - paddingRight);
  const maxWidth = nodeGraphTextBoxMeasureMaxLineWidth(field, layout);
  if (!(maxWidth > 0)) {
    return 1;
  }
  return maxWidth > availableWidth
    ? Math.max(nodeGraphTextBoxFitScaleLimits.min, availableWidth / maxWidth)
    : 1;
}

/**
 * fill: grow or shrink so text uses available height and stays within width.
 * textSizePercent is the base (preferred) size; fit-scale multiplies from there.
 */
function nodeGraphTextBoxFillFitScale(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field) {
    return 1;
  }
  const style = window.getComputedStyle(field);
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const availableWidth = Math.max(1, field.clientWidth - paddingLeft - paddingRight);
  const availableHeight = Math.max(1, field.clientHeight - paddingTop - paddingBottom);
  const text = String(field.value || "");
  const lineCount = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const contentHeightAt1 = lineCount * lineHeight;
  const maxWidthAt1 = nodeGraphTextBoxMeasureMaxLineWidth(field, layout);
  const sHeight = contentHeightAt1 > 0 ? availableHeight / contentHeightAt1 : nodeGraphTextBoxFitScaleLimits.maxFill;
  const sWidth = maxWidthAt1 > 0 ? availableWidth / maxWidthAt1 : nodeGraphTextBoxFitScaleLimits.maxFill;
  const scale = Math.min(sHeight, sWidth);
  return Math.max(
    nodeGraphTextBoxFitScaleLimits.min,
    Math.min(nodeGraphTextBoxFitScaleLimits.maxFill, scale),
  );
}

function nodeGraphTextBoxFontFitScale(field, layout = normalizeNodeGraphTextBoxLayout()) {
  const mode = normalizeNodeGraphTextBoxMode(layout.textMode);
  if (mode === "fill") {
    return nodeGraphTextBoxFillFitScale(field, layout);
  }
  if (mode === "multiline") {
    return nodeGraphTextBoxWidthFitScale(field, layout);
  }
  return 1;
}

function syncNodeGraphTextBoxVisualFit(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field) {
    return;
  }
  field.scrollLeft = 0;
  field.scrollTop = 0;
  // Measure at fit-scale 1 (base = textSizePercent only), then apply fit.
  field.style.setProperty("--node-text-box-font-fit-scale", "1");
  // Force layout so getComputedStyle reflects fit=1 before measuring.
  void field.offsetWidth;
  field.style.setProperty(
    "--node-text-box-font-fit-scale",
    String(nodeGraphTextBoxFontFitScale(field, layout)),
  );
  syncNodeGraphTextBoxContentAlignment(field, layout);
}

const nodeGraphTextBoxFitLayouts = new WeakMap();
let nodeGraphTextBoxResizeObserver = null;

function scheduleNodeGraphTextBoxVisualFit(field, layout = normalizeNodeGraphTextBoxLayout()) {
  const normalizedLayout = normalizeNodeGraphTextBoxLayout(layout);
  const syncIfConnected = () => {
    if (field?.isConnected) {
      syncNodeGraphTextBoxVisualFit(field, normalizedLayout);
    }
  };
  requestAnimationFrame(syncIfConnected);
  document.fonts?.ready?.then(() => requestAnimationFrame(syncIfConnected));
}

function observeNodeGraphTextBoxVisualFit(field, layout = normalizeNodeGraphTextBoxLayout()) {
  if (!field || !window.ResizeObserver) {
    return;
  }
  nodeGraphTextBoxFitLayouts.set(field, normalizeNodeGraphTextBoxLayout(layout));
  if (!nodeGraphTextBoxResizeObserver) {
    nodeGraphTextBoxResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const layout = nodeGraphTextBoxFitLayouts.get(entry.target);
        if (layout) {
          scheduleNodeGraphTextBoxVisualFit(entry.target, layout);
        }
      }
    });
  }
  nodeGraphTextBoxResizeObserver.observe(field);
}

function handleNodeGraphTextBoxWheel(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.deltaY) {
    zoomNodeGraphAt(
      -Math.sign(event.deltaY),
      event.clientX,
      event.clientY,
    );
  }
}

// Title/Text data-input resolution -- returns null when the port isn't
// wired (caller falls back to the typed value), or the resolved string
// (raw wire value, optionally transformed by a port script stored at
// `patchNode.portScripts[port]`) when it is. Port scripts are plain
// JavaScript, see node-graph-port-script.js.
function nodeGraphTextBoxResolvedTitle(patchNode) {
  const raw = readNodeGraphDataInput(patchNode.id, "Title");
  if (raw === undefined) {
    return null;
  }
  return String(evaluateNodeGraphPortScript(patchNode.portScripts?.Title, raw) ?? "");
}

function nodeGraphTextBoxResolvedText(patchNode) {
  const raw = readNodeGraphDataInput(patchNode.id, "Text");
  if (raw === undefined) {
    return null;
  }
  return String(evaluateNodeGraphPortScript(patchNode.portScripts?.Text, raw) ?? "");
}

// Every module's title is directly editable inline now (see
// createNodeGraphModuleHeader / commitNodeGraphModuleTitleFromHeaderInput
// in node-graph-module-header-rendering.js and node-graph-module-actions.js
// -- ".node-header-title" is always an <input>, committing to node.alias).
// Text Box layers one thing on top of that generic behavior: when the
// Title data-input port is connected, the wire's resolved value overrides
// whatever's typed and the field goes read-only.
function syncNodeGraphTextBoxTitle(element, patchNode) {
  const field = element.querySelector(".node-header-title");
  if (!field) {
    return;
  }
  const resolvedTitle = nodeGraphTextBoxResolvedTitle(patchNode);
  field.readOnly = resolvedTitle !== null;
  const displayValue = resolvedTitle !== null ? resolvedTitle : nodeGraphPatchNodeTitle(patchNode.id);
  if (document.activeElement !== field && field.value !== displayValue) {
    field.value = displayValue;
  }
}

function syncNodeGraphTextBoxElement(element, patchNode) {
  if (!element || !patchNode) {
    return;
  }
  syncNodeGraphTextBoxTitle(element, patchNode);
  const layout = normalizeNodeGraphTextBoxLayout(patchNode.layout);
  const resolvedText = nodeGraphTextBoxResolvedText(patchNode);
  if (resolvedText !== null) {
    layout.text = resolvedText;
  }
  if (nodeGraphModuleDefinitions[patchNode.type]?.dataOutputs?.includes("Text Out")) {
    writeNodeGraphDataOutput(patchNode.id, "Text Out", layout.text);
  }
  const body = element.querySelector(".node-text-box-body");
  if (!body) {
    return;
  }
  body.dataset.textHorizontalAlign = layout.horizontalAlign;
  body.dataset.textVerticalAlignPercent = String(layout.verticalAlignPercent);
  const desiredTag = "TEXTAREA";
  let field = body.querySelector(".node-text-box-input");
  if (!field || field.tagName !== desiredTag) {
    const replacement = document.createElement("textarea");
    replacement.className = "node-text-box-input";
    replacement.dataset.node = patchNode.id;
    replacement.dataset.textBoxMode = layout.textMode;
    replacement.setAttribute("aria-label", `${nodeGraphNodeDisplayName(patchNode.id)} text display`);
    replacement.readOnly = true;
    replacement.spellcheck = false;
    replacement.tabIndex = -1;
    replacement.rows = 1;
    replacement.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    replacement.addEventListener("click", (event) => event.stopPropagation());
    replacement.addEventListener("dblclick", openNodeModuleActionMenu);
    replacement.addEventListener("wheel", handleNodeGraphTextBoxWheel, { passive: false });
    field?.replaceWith(replacement);
    if (!field) {
      body.replaceChildren(replacement);
    }
    field = replacement;
  }
  field.dataset.textAlign = layout.horizontalAlign;
  field.dataset.textBoxMode = layout.textMode;
  // fill is multiline + auto size; keep CSS white-space rules on multiline path
  field.dataset.textBoxModeCss = layout.textMode === "singleLine" ? "singleLine" : "multiline";
  field.style.textAlign = layout.horizontalAlign;
  field.style.setProperty("--node-text-box-font-scale", String(layout.textSizePercent / 100));
  if (field.value !== layout.text) {
    field.value = layout.text;
  }
  syncNodeGraphTextBoxVisualFit(field, layout);
  scheduleNodeGraphTextBoxVisualFit(field, layout);
  observeNodeGraphTextBoxVisualFit(field, layout);
}
