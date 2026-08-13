// The SMOOTHING TIME (s) field is seconds-facing for the user, but the
// underlying metadata.smoothingSeconds is a sample count (app-wide policy:
// 0 = instant, 1 = 1 sample, 2 = 2 samples, ...). Convert at the UI edge.
function nodeGraphMetadataSmoothingSecondsToSamples(seconds) {
  const rate = typeof nodeGraphSmoothingSampleRate === "function" ? nodeGraphSmoothingSampleRate() : 44100;
  const value = Number(seconds);
  const safeSeconds = Number.isFinite(value) ? Math.max(0, value) : 0;
  return Math.round(safeSeconds * rate);
}

function nodeGraphMetadataSmoothingSamplesToSeconds(samples) {
  const rate = typeof nodeGraphSmoothingSampleRate === "function" ? nodeGraphSmoothingSampleRate() : 44100;
  const value = Number(samples);
  if (!Number.isFinite(value) || value <= 0) {
    return typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
      ? nodeGraphModuleSmoothingDefaultSeconds()
      : 0.0333;
  }
  // (0, 1) is already seconds (app-wide encoding). ≥ 1 is a sample count.
  if (value > 0 && value < 1) {
    return value;
  }
  return rate > 0 ? value / rate : 0;
}

function positionNodeMetadataPopover(popover, x, y, remember = false) {
  if (!popover) {
    return;
  }
  // Right-clicking another slider while this popover is already open and
  // already at its saved spot changes nothing on screen -- glow instead of
  // looking like a dead click. Shared with every other floating window; see
  // positionNodeGraphFloatingWindowWithAttention.
  if (typeof positionNodeGraphFloatingWindowWithAttention === "function") {
    positionNodeGraphFloatingWindowWithAttention(popover, () => {
      applyNodeMetadataPopoverPosition(popover, x, y, remember);
    });
    return;
  }
  applyNodeMetadataPopoverPosition(popover, x, y, remember);
}

function applyNodeMetadataPopoverPosition(popover, x, y, remember = false) {
  popover.hidden = false;
  const rect = popover?.getBoundingClientRect?.();
  const { left, top } = nodeGraphFloatingWindowPosition(popover, x, y, {
    visibleHeight: 48,
    visibleWidth: Math.max(80, (rect?.width || 360) * 0.5),
  });
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(popover, left, top);
  } else {
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }
  if (remember) {
    nodeGraphMvp.metadataPopoverPosition = { left, top };
    syncNodeGraphPatchWindowPosition("metadata", { left, top });
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "metaparameters",
      popover,
      { open: true, position: { left, top } },
      { persist: false },
    );
  }
}

const nodeMetadataPopoverDefaultSize = Object.freeze({
  width: 185,
  height: 620,
  minWidth: 24,
  maxWidth: 900,
  /* Tall enough for heading + a few fixed-height rows; shorter = scroll, never compress. */
  minHeight: 220,
  maxHeight: 820,
});

function normalizeNodeMetadataPopoverSize(size = {}) {
  if (typeof normalizeNodeGraphFloatingWindowSize === "function") {
    return normalizeNodeGraphFloatingWindowSize(size, nodeMetadataPopoverDefaultSize);
  }
  const source = size && typeof size === "object" ? size : {};
  return {
    width: Math.max(
      nodeMetadataPopoverDefaultSize.minWidth,
      Math.min(
        nodeMetadataPopoverDefaultSize.maxWidth,
        Math.round(Number(source.width) || nodeMetadataPopoverDefaultSize.width),
      ),
    ),
    height: Math.max(
      nodeMetadataPopoverDefaultSize.minHeight,
      Math.min(
        nodeMetadataPopoverDefaultSize.maxHeight,
        Math.round(Number(source.height) || nodeMetadataPopoverDefaultSize.height),
      ),
    ),
  };
}

function applyNodeMetadataPopoverSize(size = {}, element = null) {
  const popover = element || document.getElementById("nodeParameterMetadataPopover");
  const normalized = normalizeNodeMetadataPopoverSize(size);
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  if (popover) {
    if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
      applyNodeGraphFloatingWindowSizeVars(popover, "metadata-popover", nodeMetadataPopoverDefaultSize, normalized);
    } else {
      popover.style.setProperty("--metadata-popover-width", `${stored.width}px`);
      if (Number.isFinite(stored.height)) {
        popover.style.setProperty("--metadata-popover-height", `${stored.height}px`);
      }
    }
    if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
      syncNodeGraphFloatingWindowInlineBox(popover, stored);
    }
  }
  return stored;
}

function nodeMetadataPopoverSizeFromElement(popover = document.getElementById("nodeParameterMetadataPopover")) {
  const rect = popover?.getBoundingClientRect?.();
  return normalizeNodeMetadataPopoverSize({
    width: rect?.width,
    height: rect?.height,
  });
}

function nodeMetadataPopoverVisibleRect() {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (!popover || popover.hidden) {
    return null;
  }
  const rect = popover.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function hideNodeMetadataPopoverForInspectorReplacement() {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (popover) {
    popover.hidden = true;
  }
  setNodeMetadataClosePromptVisible(false);
  setNodeMetadataScriptDirty(false, "");
  if (nodeGraphMvp.metadataDragging?.handle) {
    nodeGraphMvp.metadataDragging.handle.classList.remove("dragging");
  }
  nodeGraphMvp.metadataDragging = null;
  nodeGraphMvp.metadataEditorTarget = null;
}

function prepareNodeMetadataPopoverForInspectorReplacement() {
  const rect = nodeMetadataPopoverVisibleRect();
  if (!rect) {
    return null;
  }
  if (nodeGraphMvp.metadataScriptDirty && !confirmNodeMetadataScriptDiscard()) {
    return false;
  }
  hideNodeMetadataPopoverForInspectorReplacement();
  return rect;
}

function nodeMetadataReplacementX(sourceRect, targetPopover, fallbackX) {
  const left = Number(sourceRect?.left);
  const width = Number(sourceRect?.width);
  if (!Number.isFinite(left)) {
    return fallbackX;
  }
  const targetRect = targetPopover?.getBoundingClientRect?.();
  return left + (Number.isFinite(width) ? width * 0.5 : 0) - (targetRect?.width || 0) * 0.5;
}

function saveNodeMetadataPopoverWindowState(options = {}) {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "metaparameters",
      popover,
      {
        open: !popover?.hidden,
        size: nodeMetadataPopoverSizeFromElement(popover),
      },
      { status: false, ...options },
    );
  }
}

function syncNodeGraphPatchWindowPosition(key, position) {
  const normalizedPosition = normalizeNodeGraphWindowPosition(position);
  if (key === "metadata") {
    nodeGraphMvp.metadataPopoverPosition = normalizedPosition;
  } else if (key === "moduleActions") {
    nodeGraphMvp.moduleActionWindowPosition = normalizedPosition;
  }
}

function nodeMetadataPopoverEmptyDragTarget(event) {
  const target = event?.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest?.(
    "button, a, input, textarea, select, option, label, " +
    ".metadata-script-reference, .metadata-script-preview, .metadata-script-effective, " +
    "[contenteditable='true']",
  )) {
    return false;
  }
  return Boolean(target.closest?.(
    ".metadata-script-panel, .metadata-script-heading, .metadata-script-actions, " +
    ".metadata-popover-grid, .node-parameter-metadata-popover",
  ));
}

function beginNodeMetadataPopoverDrag(event) {
  if (event.currentTarget?.id === "metadataPopoverCornerDrag") {
    beginNodeMetadataPopoverResize(event);
    return;
  }
  const headingTarget = event.currentTarget?.classList?.contains("scene-context-heading") ||
    event.currentTarget?.id === "metadataPopoverDragHandle";
  if (!headingTarget && !nodeMetadataPopoverEmptyDragTarget(event)) {
    return;
  }

  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (popover.hidden) {
    return;
  }

  const heading = document.querySelector("#nodeParameterMetadataPopover .scene-context-heading");
  const drag = beginNodeGraphFloatingWindowDrag(event, popover, "metadataDragging");
  if (drag) {
    drag.heading = heading;
    heading?.classList.add("dragging");
  }
}

function beginNodeMetadataPopoverResize(event) {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  beginNodeGraphFloatingWindowResize(event, popover, "metadataResizing");
}

function dragNodeMetadataPopoverResize(event) {
  dragNodeGraphFloatingWindowResize(event, "metadataResizing", applyNodeMetadataPopoverSize);
}

function endNodeMetadataPopoverResize(event) {
  endNodeGraphFloatingWindowResize(event, "metadataResizing", saveNodeMetadataPopoverWindowState);
}

function dragNodeMetadataPopover(event) {
  dragNodeGraphFloatingWindow(
    event,
    "metadataDragging",
    document.getElementById("nodeParameterMetadataPopover"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "metaparameters",
          document.getElementById("nodeParameterMetadataPopover"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeMetadataPopoverDrag(event) {
  const drag = nodeGraphMvp.metadataDragging;
  endNodeGraphFloatingWindowDrag(event, "metadataDragging", () => {
    drag?.heading?.classList.remove("dragging");
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      const position = Number.isFinite(Number(drag?.currentLeft)) && Number.isFinite(Number(drag?.currentTop))
        ? { left: drag.currentLeft, top: drag.currentTop }
        : undefined;
      rememberNodeGraphWorkspaceWindowState(
        "metaparameters",
        null,
        { open: true, size: nodeMetadataPopoverSizeFromElement(), ...(position ? { position } : {}) },
        { capturePosition: false, status: false },
      );
    }
  });
}

function metadataScriptStatus(message, error = false, detail = "") {
  const status = document.getElementById("metadataScriptStatus");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.title = detail || message;
  status.classList.toggle("error", Boolean(error));
  status.classList.toggle("dirty", Boolean(nodeGraphMvp.metadataScriptDirty));
}

function metadataScriptSourceText() {
  return document.getElementById("metadataScriptSource")?.value || "";
}

const nodeMetadataScriptHighlightTokenPattern =
  window.nodeCodeSettingsEditor?.assignmentTokenPattern ||
  /param\.[A-Za-z0-9_.]+|\[[^\]]*\]|-?(?:\d+\.\d+|\d+|\.\d+)(?:e[+-]?\d+)?|\b(?:true|false)\b|=|[A-Za-z_][\w-]*/gi;

const nodeMetadataScriptSupportedKeys = new Set([
  "alias",
  "choices",
  "curveAmount",
  "def",
  "displayChoices",
  "divideChoicesVisibly",
  "kind",
  "bipolar",
  "linearSmoothing",
  "max",
  "maxDigits",
  "mid",
  "min",
  "nonlinearSlider",
  "sliderCurve",
  "showSign",
  "smoothingMode",
  "smoothingSeconds",
  "smoothingType",
  "step",
  "tooltip",
  "unit",
  "wraparound",
]);

const nodeMetadataScriptBooleanKeys = new Set([
  "bipolar",
  "displayChoices",
  "divideChoicesVisibly",
  "linearSmoothing",
  "nonlinearSlider",
  "showSign",
  "wraparound",
]);

const nodeMetadataScriptTokenUnitOptions = Object.freeze([
  "",
  "Hz",
  "%",
  "x",
  "ms",
  "s",
  "dB",
  "V",
  "oct",
  "cycle",
]);

function nodeMetadataScriptKindOptions() {
  const templates = typeof nodeMetadataKindTemplates !== "undefined"
    ? nodeMetadataKindTemplates
    : typeof fallbackNodeMetadataKindTemplates !== "undefined"
      ? fallbackNodeMetadataKindTemplates
      : {};
  return Object.entries(templates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, template]) => ({
      label: template.label || value,
      value,
    }));
}

function nodeMetadataScriptTokenOptionsForKey(key = "") {
  if (key === "kind") {
    return {
      label: "kind",
      options: nodeMetadataScriptKindOptions(),
    };
  }
  if (nodeMetadataScriptBooleanKeys.has(key)) {
    return {
      label: key,
      options: [
        { label: "true", value: "true" },
        { label: "false", value: "false" },
      ],
    };
  }
  if (key === "step") {
    return {
      label: "step",
      options: [
        { label: "0", value: "0" },
        { label: "0.001", value: "0.001" },
        { label: "0.01", value: "0.01" },
        { label: "0.1", value: "0.1" },
        { label: "1", value: "1" },
      ],
    };
  }
  if (key === "unit") {
    return {
      label: "unit",
      options: nodeMetadataScriptTokenUnitOptions.map((value) => ({
        label: value || "none",
        value: value ? JSON.stringify(value) : "\"\"",
      })),
    };
  }
  return null;
}

function nodeMetadataScriptLineAssignmentInfo(line = "") {
  return window.nodeCodeSettingsEditor.assignmentInfo(line, {
    keyFromPath: nodeMetadataScriptKeyFromPath,
  });
}

function nodeMetadataScriptTokenIsMenuEligible(key, start, end, assignment) {
  const config = nodeMetadataScriptTokenOptionsForKey(key);
  return Boolean(
    config?.options?.length &&
    assignment &&
    start >= assignment.valueStart &&
    end <= assignment.valueEnd,
  );
}

function nodeMetadataScriptReferenceOptionHtml(option, context) {
  return window.nodeCodeSettingsEditor.referenceOptionHtml(option, context, {
    optionClass: "metadata-script-reference-kind",
  });
}

function nodeMetadataScriptReferenceContextHtml(context = null) {
  return window.nodeCodeSettingsEditor.referenceContextHtml(context, {
    optionClass: "metadata-script-reference-kind",
  });
}

function nodeMetadataScriptReferenceHtml(context = nodeGraphMvp.metadataScriptSuggestionContext) {
  const keys = Array.from(nodeMetadataScriptSupportedKeys).sort();
  return window.nodeCodeSettingsEditor.referenceHtml({
    context,
    defaultLabel: "keys",
    defaultSuggestions: keys.map((key) => ({
      label: key,
      title: `Insert param.name.${key}`,
      value: key,
    })),
    keyClass: "metadata-script-reference-key",
    optionClass: "metadata-script-reference-kind",
  });
}

function syncNodeMetadataScriptReference(context = nodeGraphMvp.metadataScriptSuggestionContext) {
  const reference = document.getElementById("metadataScriptReference");
  if (!reference) {
    return;
  }
  reference.innerHTML = nodeMetadataScriptReferenceHtml(context);
}

function setNodeMetadataScriptSuggestionContext(context = null) {
  nodeGraphMvp.metadataScriptSuggestionContext = context;
  syncNodeMetadataScriptReference(context);
}

function nodeMetadataScriptPlaceholderValue(key) {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  const metadata = slider ? nodeSliderMetadata(slider) : {};
  return nodeMetadataScriptValue(metadata[nodeMetadataScriptKeyFromPath(key)], key);
}

function insertNodeMetadataScriptKey(key) {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return;
  }
  const paramKey = nodeMetadataScriptParamKey(slider);
  const value = nodeMetadataScriptPlaceholderValue(key);
  insertNodeMetadataScriptAssignment(`param.${paramKey}.${key} = ${value};`);
}

function insertNodeMetadataScriptKind(kind) {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return;
  }
  const paramKey = nodeMetadataScriptParamKey(slider);
  insertNodeMetadataScriptAssignment(`param.${paramKey}.kind = ${normalizeNodeMetadataKind(kind)};`);
}

function handleNodeMetadataScriptReferenceClick(event) {
  const target = event.target?.closest?.("[data-key], [data-token-option]");
  if (!target) {
    return;
  }
  insertNodeMetadataScriptReferenceTarget(target);
}

function handleNodeMetadataScriptReferenceKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const target = event.target?.closest?.("[data-key], [data-token-option]");
  if (!target) {
    return;
  }
  event.preventDefault();
  insertNodeMetadataScriptReferenceTarget(target);
}

function insertNodeMetadataScriptReferenceTarget(target) {
  if (target.dataset.tokenOption !== undefined) {
    replaceNodeMetadataScriptToken(target.dataset.tokenOption);
  } else if (target.dataset.key) {
    insertNodeMetadataScriptKey(target.dataset.key);
  }
}

function escapeNodeMetadataScriptHtml(value = "") {
  return window.nodeCodeSettingsEditor.escapeHtml(value);
}

function colorizeNodeMetadataScriptLine(line = "") {
  return window.nodeCodeSettingsEditor.colorizeLine(line, {
    assignmentInfo: nodeMetadataScriptLineAssignmentInfo,
    isPropertyToken: (token) => String(token || "").startsWith("param."),
    tokenIsMenuEligible: nodeMetadataScriptTokenIsMenuEligible,
    tokenPattern: nodeMetadataScriptHighlightTokenPattern,
  });
}

function resizeNodeMetadataScriptEditorToContent() {
  const source = document.getElementById("metadataScriptSource");
  const editor = document.querySelector(".metadata-script-editor");
  const highlight = document.getElementById("metadataScriptHighlight");
  if (!source || !editor) {
    return;
  }
  source.style.height = "auto";
  const nextHeight = Math.max(286, source.scrollHeight);
  source.style.height = `${nextHeight}px`;
  editor.style.minHeight = `${nextHeight}px`;
  editor.style.height = `${nextHeight}px`;
  if (highlight) {
    highlight.style.minHeight = `${nextHeight}px`;
  }
}

function updateNodeMetadataScriptHighlight() {
  const source = document.getElementById("metadataScriptSource");
  const highlight = document.getElementById("metadataScriptHighlight");
  if (!source || !highlight) {
    return;
  }
  const text = source.value || "";
  highlight.innerHTML = window.nodeCodeSettingsEditor.highlightHtml(text, {
    colorizeLine: colorizeNodeMetadataScriptLine,
    ignoredLines: new Set(analyzeNodeMetadataScriptSource(text).ignored),
    ignoredLineClass: "metadata-script-line metadata-script-line-ignored",
    lineClass: "metadata-script-line",
  });
  highlight.scrollTop = source.scrollTop;
  highlight.scrollLeft = source.scrollLeft;
  resizeNodeMetadataScriptEditorToContent();
}

function clearNodeMetadataScriptTokenSelection() {
  nodeGraphMvp.metadataScriptActiveToken = null;
}

function clearNodeMetadataScriptSuggestionContext() {
  clearNodeMetadataScriptTokenSelection();
  setNodeMetadataScriptSuggestionContext(null);
}

function findNodeMetadataScriptTokenAt(index) {
  const source = document.getElementById("metadataScriptSource");
  const text = source?.value || "";
  return window.nodeCodeSettingsEditor.findTokenAt(text, index, {
    assignmentInfo: nodeMetadataScriptLineAssignmentInfo,
    optionsForKey: nodeMetadataScriptTokenOptionsForKey,
  });
}

function showNodeMetadataScriptTokenSuggestions(token) {
  if (!token?.config?.options?.length) {
    clearNodeMetadataScriptSuggestionContext();
    return;
  }
  nodeGraphMvp.metadataScriptActiveToken = token;
  setNodeMetadataScriptSuggestionContext(token);
}

function replaceNodeMetadataScriptToken(nextToken) {
  const source = document.getElementById("metadataScriptSource");
  const token = nodeGraphMvp.metadataScriptActiveToken;
  if (!source || !token) {
    return;
  }
  const replacement = String(nextToken);
  source.setRangeText(replacement, token.start, token.end, "end");
  nodeGraphMvp.metadataScriptActiveToken = {
    ...token,
    end: token.start + replacement.length,
    token: replacement,
  };
  updateNodeMetadataScriptHighlight();
  syncNodeMetadataScriptDiagnostics();
  setNodeMetadataScriptSuggestionContext(nodeGraphMvp.metadataScriptActiveToken);
}

function handleNodeMetadataScriptSourcePointer(event) {
  if (event.defaultPrevented) {
    return;
  }
  window.setTimeout(() => {
    const source = document.getElementById("metadataScriptSource");
    const token = findNodeMetadataScriptTokenAt(source?.selectionStart ?? 0);
    if (token) {
      showNodeMetadataScriptTokenSuggestions(token);
    } else {
      clearNodeMetadataScriptSuggestionContext();
    }
  }, 0);
}

function handleNodeMetadataScriptSourceKeyup(event) {
  const source = event.currentTarget;
  if (!source || source.id !== "metadataScriptSource") {
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    const token = findNodeMetadataScriptTokenAt(source.selectionStart ?? 0);
    if (token) {
      showNodeMetadataScriptTokenSuggestions(token);
    } else {
      clearNodeMetadataScriptSuggestionContext();
    }
  }
}

function handleNodeMetadataScriptSourceInput() {
  clearNodeMetadataScriptSuggestionContext();
  syncNodeMetadataScriptDiagnostics();
}

function setMetadataScriptSourceText(text) {
  const source = document.getElementById("metadataScriptSource");
  if (!source) {
    return;
  }
  source.value = String(text || "");
  updateNodeMetadataScriptHighlight();
  updateNodeMetadataScriptPreview(source.value);
  clearNodeMetadataScriptSuggestionContext();
}

function setNodeMetadataScriptDirty(dirty, message = "", error = false, detail = "") {
  nodeGraphMvp.metadataScriptDirty = Boolean(dirty);
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (popover) {
    popover.dataset.metadataScriptDirty = dirty ? "true" : "false";
  }
  const saveButton = document.getElementById("metadataScriptApply");
  if (saveButton) {
    saveButton.classList.toggle("armed", Boolean(dirty));
  }
  if (!dirty) {
    setNodeMetadataClosePromptVisible(false);
  }
  if (message) {
    metadataScriptStatus(message, error, detail);
  } else {
    metadataScriptStatus(dirty ? "unsaved" : "saved", false);
  }
}

function confirmNodeMetadataScriptDiscard() {
  return !nodeGraphMvp.metadataScriptDirty ||
    window.confirm("Discard unsaved metadata script changes?");
}

function setNodeMetadataClosePromptVisible(visible) {
  const prompt = document.getElementById("metadataClosePrompt");
  if (prompt) {
    prompt.hidden = !visible;
  }
}

function nodeMetadataScriptParamKey(slider) {
  return String(slider?.dataset?.param || "parameter")
    .trim()
    .replace(/[^\w]+/g, "_") || "parameter";
}

function nodeMetadataScriptValue(value, key = "") {
  if (key === "alias") {
    return JSON.stringify(normalizeNodeGraphPatchMetadataAlias(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ")}]`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Number.isFinite(Number(value)) && String(value).trim() !== "") {
    return formatNodeSliderCompactNumber(Number(value));
  }
  return String(value ?? "");
}

function formatNodeMetadataScript(slider, metadata = nodeSliderMetadata(slider)) {
  const key = nodeMetadataScriptParamKey(slider);
  const nodeElement = slider?.closest?.(".dsp-node");
  const node = nodeElement ? nodeGraphPatchNode(nodeElement.dataset.node) : null;
  const title = node ? nodeGraphPatchNodeTitle(node) : "Module";
  const label = nodeSliderLabelText(slider);
  const rows = [
    `// ${title} : ${label}`,
    `param.${key}.alias = ${nodeMetadataScriptValue(metadata.alias, "alias")};`,
    `param.${key}.kind = ${nodeMetadataScriptValue(metadata.kind, "kind")};`,
    `param.${key}.sliderCurve = ${nodeMetadataScriptValue(metadata.sliderCurve, "sliderCurve")};`,
    `param.${key}.curveAmount = ${nodeMetadataScriptValue(metadata.curveAmount, "curveAmount")};`,
    `param.${key}.min = ${nodeMetadataScriptValue(metadata.min, "min")};`,
    `param.${key}.mid = ${nodeMetadataScriptValue(metadata.mid, "mid")};`,
    `param.${key}.max = ${nodeMetadataScriptValue(metadata.max, "max")};`,
    `param.${key}.def = ${nodeMetadataScriptValue(metadata.def, "def")};`,
    `param.${key}.step = ${nodeMetadataScriptValue(metadata.step, "step")};`,
    `param.${key}.tooltip = ${nodeMetadataScriptValue(metadata.tooltip, "tooltip")};`,
    `param.${key}.unit = ${nodeMetadataScriptValue(metadata.unit, "unit")};`,
    `param.${key}.maxDigits = ${nodeMetadataScriptValue(metadata.maxDigits, "maxDigits")};`,
    `param.${key}.choices = ${nodeMetadataScriptValue(metadata.choices, "choices")};`,
    `param.${key}.displayChoices = ${nodeMetadataScriptValue(metadata.displayChoices, "displayChoices")};`,
    `param.${key}.divideChoicesVisibly = ${nodeMetadataScriptValue(metadata.divideChoicesVisibly, "divideChoicesVisibly")};`,
    `param.${key}.bipolar = ${nodeMetadataScriptValue(Boolean(metadata.bipolar), "bipolar")};`,
    `param.${key}.linearSmoothing = ${nodeMetadataScriptValue(metadata.linearSmoothing, "linearSmoothing")};`,
    `param.${key}.smoothingMode = ${nodeMetadataScriptValue(metadata.smoothingMode, "smoothingMode")};`,
    `param.${key}.smoothingSeconds = ${nodeMetadataScriptValue(metadata.smoothingSeconds, "smoothingSeconds")};`,
    `param.${key}.smoothingType = ${nodeMetadataScriptValue(metadata.smoothingType, "smoothingType")};`,
    `param.${key}.nonlinearSlider = ${nodeMetadataScriptValue(metadata.nonlinearSlider, "nonlinearSlider")};`,
    `param.${key}.showSign = ${nodeMetadataScriptValue(metadata.showSign, "showSign")};`,
    `param.${key}.wraparound = ${nodeMetadataScriptValue(metadata.wraparound, "wraparound")};`,
  ];
  return rows.join("\n");
}

function nodeMetadataScriptTemplateForKind(slider, kind) {
  const normalizedKind = normalizeNodeMetadataKind(kind);
  const template = nodeMetadataKindTemplates[normalizedKind] || nodeMetadataKindTemplates.decimal;
  const templateMetadata = {
    choices: template.choices || [],
    curveAmount: normalizeNodeSliderCurveAmount(template.curveAmount),
    def: Number.isFinite(Number(template.def)) ? Number(template.def) : 0,
    displayChoices: Boolean(template.displayChoices),
    divideChoicesVisibly: Boolean(template.divideChoicesVisibly),
    kind: normalizedKind,
    linearSmoothing: template.linearSmoothing !== false,
    max: Number.isFinite(Number(template.max)) ? Number(template.max) : 1,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(template.maxDigits, normalizedKind),
    mid: Number.isFinite(Number(template.mid)) ? Number(template.mid) : 0,
    min: Number.isFinite(Number(template.min)) ? Number(template.min) : 0,
    nonlinearSlider: Boolean(template.nonlinearSlider),
    sliderCurve: normalizeNodeSliderCurve(template.sliderCurve, template.nonlinearSlider),
    showSign: Boolean(template.showPlusMinus),
    step: Number.isFinite(Number(template.step)) ? Number(template.step) : 0,
    tooltip: String(template.tooltip || ""),
    unit: template.unit || "",
    wraparound: Boolean(template.wraparound),
  };
  const metadata = normalizeNodeGraphPatchParameterMetadata(
    nodeGraphPatchNode(slider?.closest?.(".dsp-node")?.dataset.node)?.type,
    slider?.dataset?.param,
    templateMetadata,
  ) || templateMetadata;
  return formatNodeMetadataScript(slider, metadata);
}

function syncNodeMetadataScriptFromFields(options = {}) {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return;
  }
  if (!options.force && nodeGraphMvp.metadataScriptDirty && !confirmNodeMetadataScriptDiscard()) {
    metadataScriptStatus("sync canceled", false);
    return;
  }
  const metadata = readNodeMetadataEditorValues(slider);
  setMetadataScriptSourceText(formatNodeMetadataScript(slider, metadata));
  setNodeMetadataScriptDirty(false, "script synced", false);
}

function parseNodeMetadataScriptBoolean(value, fallback = false) {
  const text = String(value || "").trim().toLowerCase();
  if (["true", "yes", "on", "1"].includes(text)) {
    return true;
  }
  if (["false", "no", "off", "0"].includes(text)) {
    return false;
  }
  return Boolean(fallback);
}

function parseNodeMetadataScriptChoices(value) {
  const text = String(value || "").trim();
  if (!text || text.toLowerCase() === "none" || text === "[]") {
    return [];
  }
  const body = text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1)
    : text;
  return parseNodeMetadataChoices(body);
}

function nodeMetadataScriptKeyFromPath(path = "") {
  if (String(path || "").trim().endsWith(".alias")) {
    return "alias";
  }
  return String(path || "").split(".").pop();
}

function parseNodeMetadataScriptAssignments(source) {
  const assignments = [];
  const ignored = [];
  const lines = String(source || "").split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) {
      continue;
    }
    const match = line.match(/^(.+?)\s*=\s*(.+?)\s*;?$/);
    if (!match) {
      ignored.push(index + 1);
      continue;
    }
    assignments.push({
      key: nodeMetadataScriptKeyFromPath(match[1]),
      line: index + 1,
      path: match[1],
      rawValue: match[2].trim(),
    });
  }
  return { assignments, ignored };
}

function analyzeNodeMetadataScriptSource(source) {
  const parsed = parseNodeMetadataScriptAssignments(source);
  const supported = [];
  const unsupported = [];
  for (const assignment of parsed.assignments) {
    if (nodeMetadataScriptSupportedKeys.has(assignment.key)) {
      supported.push(assignment);
    } else {
      unsupported.push(assignment);
    }
  }
  const ignored = [
    ...parsed.ignored,
    ...unsupported.map((assignment) => assignment.line),
  ].sort((a, b) => a - b);
  return {
    assignmentCount: parsed.assignments.length,
    ignored,
    ok: ignored.length === 0,
    syntaxIgnored: parsed.ignored,
    supported,
    supportedCount: supported.length,
    unsupported,
  };
}

function nodeMetadataScriptPreviewValueFingerprint(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => String(entry || "").trim()));
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Number.isFinite(Number(value)) && String(value).trim() !== "") {
    return String(Number(value));
  }
  return String(value ?? "").trim();
}

function nodeMetadataScriptPreviewValueText(value, key = "") {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ")}]`;
  }
  return nodeMetadataScriptValue(value, key);
}

function nodeMetadataScriptPreviewDetails(assignment, draftMetadata) {
  if (!draftMetadata || !nodeMetadataScriptSupportedKeys.has(assignment.key)) {
    return {
      after: assignment.rawValue,
      before: "",
      state: "supported",
    };
  }
  try {
    const beforeValue = draftMetadata[assignment.key];
    const parsedValue = parseNodeMetadataScriptValue(
      assignment.rawValue,
      assignment.key,
      draftMetadata,
    );
    draftMetadata[assignment.key] = parsedValue;
    const before = nodeMetadataScriptPreviewValueText(beforeValue, assignment.key);
    const after = nodeMetadataScriptPreviewValueText(parsedValue, assignment.key);
    return {
      after,
      before,
      state: nodeMetadataScriptPreviewValueFingerprint(beforeValue) ===
        nodeMetadataScriptPreviewValueFingerprint(parsedValue)
        ? "same"
        : "changed",
    };
  } catch {
    return {
      after: assignment.rawValue,
      before: "",
      state: "supported",
    };
  }
}

function nodeMetadataScriptUnsupportedPreviewDetails(assignment) {
  return {
    after: `unsupported: ${assignment.path}`,
    before: "",
    state: "unsupported",
  };
}

function nodeMetadataScriptPreviewItemHtml(assignment, details = "supported") {
  const detail = typeof details === "string" ? { state: details } : details;
  const state = detail.state || "supported";
  const stateText = state === "unsupported"
    ? "ignored"
    : state === "same"
      ? "same"
      : state === "changed"
        ? "change"
        : "will set";
  const valueText = state === "changed" && detail.before
    ? `${detail.before} => ${detail.after}`
    : detail.after || assignment.rawValue;
  const titleText = `line ${assignment.line}: ${assignment.path || assignment.key} = ${valueText}`;
  return `
    <li class="${state === "unsupported" ? "ignored" : state}" data-line="${escapeNodeMetadataScriptHtml(assignment.line)}" title="${escapeNodeMetadataScriptHtml(titleText)}">
      <span>${escapeNodeMetadataScriptHtml(stateText)}</span>
      <em>L${escapeNodeMetadataScriptHtml(assignment.line)}</em>
      <strong>${escapeNodeMetadataScriptHtml(assignment.key)}</strong>
      <code>${escapeNodeMetadataScriptHtml(valueText)}</code>
    </li>`;
}

function nodeMetadataScriptPreviewSummary(source = metadataScriptSourceText()) {
  const diagnostics = analyzeNodeMetadataScriptSource(source);
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  const currentMetadata = slider ? nodeSliderMetadata(slider) : null;
  const draftMetadata = currentMetadata ? {
    ...currentMetadata,
    choices: [...(currentMetadata.choices || [])],
  } : null;
  const counts = {
    changed: 0,
    ignored: diagnostics.ignored.length,
    same: 0,
    supported: diagnostics.supportedCount,
  };
  for (const assignment of diagnostics.supported) {
    const details = nodeMetadataScriptPreviewDetails(assignment, draftMetadata);
    if (details.state === "changed") {
      counts.changed += 1;
    } else if (details.state === "same") {
      counts.same += 1;
    }
  }
  return {
    ...diagnostics,
    counts,
  };
}

function nodeMetadataScriptEffectiveRows(metadata) {
  const flags = [
    metadata.displayChoices ? "display choices" : "",
    metadata.divideChoicesVisibly ? "divided choices" : "",
    metadata.linearSmoothing ? "smooth" : "",
    metadata.nonlinearSlider ? "nonlinear" : "",
    metadata.showSign ? "signed" : "",
    metadata.wraparound ? "wraparound" : "",
  ].filter(Boolean);
  const choices = Array.isArray(metadata.choices) && metadata.choices.length
    ? metadata.choices.join(", ")
    : "none";
  return [
    ["kind", metadata.kind || "decimal"],
    ["range", `${nodeMetadataScriptPreviewValueText(metadata.min, "min")} to ${nodeMetadataScriptPreviewValueText(metadata.max, "max")}`],
    ["mid", nodeMetadataScriptPreviewValueText(metadata.mid, "mid")],
    ["default", nodeMetadataScriptPreviewValueText(metadata.def, "default")],
    ["step", nodeMetadataScriptPreviewValueText(metadata.step, "step")],
    ["unit", metadata.unit || "none"],
    ["digits", normalizeNodeGraphMetadataMaxDigits(metadata.maxDigits, metadata.kind)],
    ["smoothing time", metadata.smoothingSeconds !== null && metadata.smoothingSeconds !== undefined && Number.isFinite(Number(metadata.smoothingSeconds)) ? `${metadata.smoothingSeconds}s` : "auto"],
    ["choices", choices],
    ["flags", flags.length ? flags.join(", ") : "none"],
  ];
}

function updateNodeMetadataScriptEffective(source = metadataScriptSourceText()) {
  const effective = document.getElementById("metadataScriptEffective");
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (effective?.classList.contains("metadata-script-extra-info")) {
    effective.hidden = true;
    effective.innerHTML = "";
    return;
  }
  if (!effective || !slider) {
    if (effective) {
      effective.hidden = true;
      effective.innerHTML = "";
    }
    return;
  }
  const parsed = parseNodeMetadataScript(source, slider);
  effective.hidden = false;
  effective.innerHTML = nodeMetadataScriptEffectiveRows(parsed.metadata)
    .map(([key, value]) => `
      <div>
        <dt>${escapeNodeMetadataScriptHtml(key)}</dt>
        <dd title="${escapeNodeMetadataScriptHtml(`${key}: ${value}`)}">${escapeNodeMetadataScriptHtml(value)}</dd>
      </div>`)
    .join("");
}

function updateNodeMetadataScriptPreview(source = metadataScriptSourceText()) {
  const preview = document.getElementById("metadataScriptPreview");
  if (!preview) {
    return;
  }
  updateNodeMetadataScriptEffective(source);
  if (preview.classList.contains("metadata-script-extra-info")) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  const diagnostics = analyzeNodeMetadataScriptSource(source);
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  const currentMetadata = slider ? nodeSliderMetadata(slider) : null;
  const draftMetadata = slider ? {
    ...currentMetadata,
    choices: [...(currentMetadata.choices || [])],
  } : null;
  const items = [
    ...diagnostics.supported.map((assignment) =>
      nodeMetadataScriptPreviewItemHtml(
        assignment,
        nodeMetadataScriptPreviewDetails(assignment, draftMetadata),
      )),
    ...diagnostics.unsupported.map((assignment) =>
      nodeMetadataScriptPreviewItemHtml(
        assignment,
        nodeMetadataScriptUnsupportedPreviewDetails(assignment),
      )),
  ];
  if (diagnostics.syntaxIgnored.length) {
    const firstSyntaxLine = diagnostics.syntaxIgnored[0];
    items.push(`
      <li class="ignored" data-line="${escapeNodeMetadataScriptHtml(firstSyntaxLine)}">
        <span>ignored</span>
        <em>L${escapeNodeMetadataScriptHtml(diagnostics.syntaxIgnored.join(","))}</em>
        <strong>syntax</strong>
        <code>expected path = value;</code>
      </li>`);
  }
  preview.hidden = items.length === 0;
  if (items.length === 0) {
    preview.innerHTML = "";
    return;
  }
  preview.innerHTML = items.join("");
}

function focusNodeMetadataScriptLine(lineNumber) {
  const source = document.getElementById("metadataScriptSource");
  const line = Math.max(1, Number.parseInt(lineNumber, 10) || 1);
  if (!source) {
    return;
  }
  const lines = source.value.split("\n");
  const start = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
  const end = start + (lines[line - 1]?.length || 0);
  source.focus();
  source.setSelectionRange(start, end);
  const lineHeight = Number.parseFloat(window.getComputedStyle(source).lineHeight) || 18;
  source.scrollTop = Math.max(0, (line - 2) * lineHeight);
  updateNodeMetadataScriptHighlight();
}

function handleNodeMetadataScriptPreviewClick(event) {
  const row = event.target?.closest?.("[data-line]");
  if (!row) {
    return;
  }
  focusNodeMetadataScriptLine(row.dataset.line);
}

function handleNodeMetadataScriptPreviewKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    const row = event.target?.closest?.("[data-line]");
    if (row) {
      event.preventDefault();
      focusNodeMetadataScriptLine(row.dataset.line);
    }
  }
}

function nodeMetadataScriptDiagnosticMessage(source = metadataScriptSourceText()) {
  const diagnostics = nodeMetadataScriptPreviewSummary(source);
  const settingsText = diagnostics.supportedCount === 1
    ? "1 setting"
    : `${diagnostics.supportedCount} settings`;
  if (diagnostics.assignmentCount === 0 && diagnostics.ignored.length === 0) {
    return { error: false, message: "unsaved: empty script" };
  }
  if (diagnostics.ignored.length) {
    const syntaxDetail = diagnostics.syntaxIgnored.length
      ? `syntax lines ${diagnostics.syntaxIgnored.join(", ")}`
      : "";
    const unsupportedDetail = diagnostics.unsupported.length
      ? `unsupported ${diagnostics.unsupported.map((assignment) => `line ${assignment.line}: ${assignment.path}`).join("; ")}`
      : "";
    const detail = [syntaxDetail, unsupportedDetail].filter(Boolean).join(" | ");
    return {
      detail,
      error: true,
      message: `unsaved: ${settingsText}; ${diagnostics.counts.changed} changes; ${diagnostics.counts.same} same; ignored lines ${diagnostics.ignored.join(", ")}`,
    };
  }
  return {
    error: false,
    message: `unsaved: ${settingsText}; ${diagnostics.counts.changed} changes; ${diagnostics.counts.same} same`,
  };
}

function syncNodeMetadataScriptDiagnostics() {
  updateNodeMetadataScriptPreview();
  const diagnostics = nodeMetadataScriptDiagnosticMessage();
  setNodeMetadataScriptDirty(true, diagnostics.message, diagnostics.error, diagnostics.detail);
}

function runNodeMetadataScriptParserSelfTest() {
  const fakeSlider = document.createElement("div");
  fakeSlider.dataset.param = "waveform";
  const parsed = parseNodeMetadataScriptAssignments(`
// parser fixture
param.frequency.def = 440;
param.frequency.choices = [Saw, Square, Sine];
param.frequency.displayChoices = true;
this line is intentionally invalid
`);
  const samePreviewDraft = { def: 440, kind: "decimal" };
  const changedPreviewDraft = { def: 440, kind: "decimal" };
  const checks = [
    parsed.assignments.length === 3,
    parsed.assignments[0]?.key === "def",
    parsed.assignments[0]?.rawValue === "440",
    parsed.assignments[1]?.rawValue === "[Saw, Square, Sine]",
    parsed.assignments[2]?.key === "displayChoices",
    parsed.ignored.length === 1,
    parsed.ignored[0] === 6,
    analyzeNodeMetadataScriptSource("param.frequency.def = 440;").supportedCount === 1,
    analyzeNodeMetadataScriptSource("param.frequency.unknown = 1;").unsupported.length === 1,
    nodeMetadataScriptDiagnosticMessage("param.frequency.unknown = 1;").error === true,
    nodeMetadataScriptPreviewDetails({ key: "def", rawValue: "440" }, samePreviewDraft).state === "same",
    nodeMetadataScriptPreviewDetails({ key: "def", rawValue: "441" }, changedPreviewDraft).state === "changed",
    nodeMetadataScriptPreviewDetails({ key: "def", rawValue: "441" }, { def: 440, kind: "decimal" }).after === "441",
    nodeMetadataScriptPreviewDetails({ key: "def", rawValue: "441" }, { def: 440, kind: "decimal" }).before === "440",
    nodeMetadataScriptUnsupportedPreviewDetails({ path: "param.frequency.unknown" }).after === "unsupported: param.frequency.unknown",
    nodeMetadataScriptDiagnosticMessage("param.frequency.def = 441;").message.includes("changes"),
    nodeMetadataScriptDiagnosticMessage("param.frequency.unknown = 1;").message.includes("ignored lines"),
    nodeMetadataScriptEffectiveRows({ kind: "decimal", min: 0, mid: 0.5, max: 1, def: 0.25, step: 0, tooltip: "tip", unit: "", maxDigits: 2, choices: [], displayChoices: false, divideChoicesVisibly: false, linearSmoothing: true, nonlinearSlider: false, showSign: false, wraparound: false })
      .some(([key, value]) => key === "step" && value === "0"),
    parseNodeMetadataScriptValue('"hello tip"', "tooltip", { tooltip: "" }) === "hello tip",
    nodeMetadataScriptTemplateForKind(fakeSlider, "waveform").includes("param.waveform.choices = [Saw, Ramp, Square, Triangle, Sine, Noise];"),
    nodeMetadataScriptTemplateForKind(fakeSlider, "waveform").includes("param.waveform.displayChoices = true;"),
    nodeMetadataScriptAssignmentInsertion("param.a.min = 0;", "param.a.max = 1;", 16) === "\nparam.a.max = 1;",
    nodeMetadataScriptAssignmentInsertion("param.a.min = 0;\n", "param.a.max = 1;", 17) === "param.a.max = 1;",
    nodeMetadataScriptAssignmentInsertion("param.a.min = 0;param.a.def = 0.5;", "param.a.max = 1;", 16) === "\nparam.a.max = 1;\n",
    nodeMetadataScriptAssignmentInsertion("param.a.min = 0;\r\n", "param.a.max = 1;", 17) === "param.a.max = 1;",
  ];
  return {
    assignments: parsed.assignments,
    ignored: parsed.ignored,
    ok: checks.every(Boolean),
  };
}

function syncNodeMetadataScriptParserSelfTestStatus() {
  const result = runNodeMetadataScriptParserSelfTest();
  document.documentElement.dataset.metadataScriptParserSelfTest = result.ok ? "passed" : "failed";
  if (!result.ok) {
    console.warn("metadata script parser self-test failed", result);
  }
}

function scheduleNodeMetadataScriptParserSelfTestStatus() {
  if (document.readyState === "complete") {
    syncNodeMetadataScriptParserSelfTestStatus();
    return;
  }
  window.addEventListener("load", syncNodeMetadataScriptParserSelfTestStatus, { once: true });
}

function parseNodeMetadataScriptValue(rawValue, key, current) {
  const value = String(rawValue || "").trim().replace(/;$/, "").trim();
  if (key === "alias") {
    return normalizeNodeGraphPatchMetadataAlias(value.replace(/^["']|["']$/g, ""));
  }
  if (key === "choices") {
    return parseNodeMetadataScriptChoices(value);
  }
  if (["bipolar", "displayChoices", "divideChoicesVisibly", "linearSmoothing", "nonlinearSlider", "showSign", "wraparound"].includes(key)) {
    return parseNodeMetadataScriptBoolean(value, current[key]);
  }
  if (key === "kind") {
    return normalizeNodeMetadataKind(value);
  }
  if (key === "sliderCurve") {
    return normalizeNodeSliderCurve(value.replace(/^["']|["']$/g, ""), current.nonlinearSlider);
  }
  if (key === "tooltip") {
    return value.replace(/^["']|["']$/g, "").slice(0, 240);
  }
  if (key === "unit") {
    return value.replace(/^["']|["']$/g, "");
  }
  if (key === "curveAmount") {
    return normalizeNodeSliderCurveAmount(value, current.curveAmount);
  }
  if (key === "maxDigits") {
    return normalizeNodeGraphMetadataMaxDigits(value, current.kind);
  }
  if (key === "smoothingSeconds") {
    if (!sanitizeNodeGraphNumericText(value)) {
      return null;
    }
    return normalizeNodeGraphMetadataSmoothingSeconds(parseNodeMetadataNumber(value, current.smoothingSeconds));
  }
  if (key === "smoothingMode") {
    return normalizeNodeGraphMetadataSmoothingMode(value.replace(/^["']|["']$/g, ""));
  }
  if (key === "smoothingType") {
    return normalizeNodeGraphMetadataSmoothingType(value.replace(/^["']|["']$/g, ""));
  }
  return parseNodeMetadataNumber(value, current[key]);
}

function parseNodeMetadataScript(source, slider) {
  const current = nodeSliderMetadata(slider);
  const next = { ...current, choices: [...(current.choices || [])] };
  const parsed = parseNodeMetadataScriptAssignments(source);
  const ignored = [...parsed.ignored];
  const portAliases = [];
  for (const assignment of parsed.assignments) {
    const portAlias = nodeMetadataScriptPortAliasAssignment(assignment);
    if (portAlias) {
      portAliases.push(portAlias);
      continue;
    }
    if (!nodeMetadataScriptSupportedKeys.has(assignment.key)) {
      ignored.push(assignment.line);
      continue;
    }
    next[assignment.key] = parseNodeMetadataScriptValue(
      assignment.rawValue,
      assignment.key,
      next,
    );
  }
  return {
    ignored,
    metadata: normalizeNodeGraphPatchParameterMetadata(
      nodeGraphPatchNode(slider.closest(".dsp-node")?.dataset.node)?.type,
      slider.dataset.param,
      next,
    ) || next,
    portAliases,
  };
}

function nodeMetadataScriptPortAliasAssignment(assignment) {
  const match = String(assignment?.path || "").trim().match(/^(input|output)(?:\.([A-Za-z_$][\w$]*)|\[(["'])(.*?)\3\])\.alias$/);
  if (!match) {
    return null;
  }
  return {
    alias: normalizeNodeGraphPatchMetadataAlias(String(assignment.rawValue || "").trim().replace(/^["']|["']$/g, "")),
    io: match[1],
    port: String(match[2] || match[4] || "").trim(),
  };
}

function applyNodeMetadataScriptPortAliases(slider, portAliases = []) {
  if (!portAliases.length) {
    return;
  }
  const patchNode = nodeGraphPatchNode(slider.closest(".dsp-node")?.dataset.node);
  if (!patchNode) {
    return;
  }
  const knownPorts = {
    input: new Set(nodeGraphPatchNodeInputPorts(patchNode)),
    output: new Set(nodeGraphPatchNodeOutputPorts(patchNode)),
  };
  const nextPortMeta = normalizeNodeGraphPatchPortMeta(patchNode.portMeta);
  for (const assignment of portAliases) {
    if (!knownPorts[assignment.io]?.has(assignment.port)) {
      continue;
    }
    nextPortMeta[assignment.io] = {
      ...(nextPortMeta[assignment.io] || {}),
      [assignment.port]: { alias: assignment.alias },
    };
    if (!assignment.alias) {
      delete nextPortMeta[assignment.io][assignment.port];
    }
    if (!Object.keys(nextPortMeta[assignment.io]).length) {
      delete nextPortMeta[assignment.io];
    }
  }
  patchNode.portMeta = normalizeNodeGraphPatchPortMeta(nextPortMeta);
}

function syncNodeMetadataChoiceToggleAvailability() {
  // Divide is independent storage, but separators only paint when labels are on.
  // Keep the checkbox enabled so users can set divide before turning display on.
  const displayInput = document.getElementById("metadataDisplayChoicesValue");
  const divideInput = document.getElementById("metadataDivideChoicesValue");
  const divideLabel = divideInput?.closest?.("label");
  if (!displayInput || !divideInput) {
    return;
  }
  const displayOn = Boolean(displayInput.checked);
  divideInput.disabled = false;
  if (divideLabel) {
    divideLabel.classList.toggle("is-choice-divide-idle", !displayOn);
    divideLabel.title = displayOn
      ? ""
      : "Separators only show while Display choices is on (this flag is still saved).";
  }
}

function writeNodeMetadataEditorValues(metadata) {
  document.getElementById("metadataAliasValue").value = metadata.alias || "";
  document.getElementById("metadataTooltipValue").value = metadata.tooltip || "";
  document.getElementById("metadataMinValue").value = formatNodeSliderCompactNumber(metadata.min);
  document.getElementById("metadataMidValue").value = formatNodeSliderCompactNumber(metadata.mid);
  document.getElementById("metadataMaxValue").value = formatNodeSliderCompactNumber(metadata.max);
  document.getElementById("metadataDefaultValue").value =
    formatNodeSliderCompactNumber(metadata.def);
  document.getElementById("metadataStepValue").value = formatNodeMetadataStep(metadata.step);
  document.getElementById("metadataMaxDigitsValue").value =
    String(normalizeNodeGraphMetadataMaxDigits(metadata.maxDigits, metadata.kind));
  document.getElementById("metadataKindValue").value = normalizeNodeMetadataKind(metadata.kind);
  document.getElementById("metadataUnitValue").value = metadata.unit;
  document.getElementById("metadataChoicesValue").value =
    formatNodeMetadataChoices(metadata.choices);
  // Independent booleans — never assign one from the other.
  const displayChoicesInput = document.getElementById("metadataDisplayChoicesValue");
  const divideChoicesInput = document.getElementById("metadataDivideChoicesValue");
  if (displayChoicesInput) {
    displayChoicesInput.checked = Boolean(metadata.displayChoices);
  }
  if (divideChoicesInput) {
    divideChoicesInput.checked = Boolean(metadata.divideChoicesVisibly);
  }
  const bipolarCheckbox = document.getElementById("metadataBipolarValue");
  if (bipolarCheckbox) {
    bipolarCheckbox.checked = Boolean(metadata.bipolar);
  }
  document.getElementById("metadataNonlinearSliderValue").checked = metadata.nonlinearSlider;
  document.getElementById("metadataSmoothingSecondsValue").value =
    Number.isFinite(Number(metadata.smoothingSeconds))
      ? formatNodeSliderCompactNumber(nodeGraphMetadataSmoothingSamplesToSeconds(metadata.smoothingSeconds))
      : "";
  syncMetadataSmoothingModeButtons(metadata);
  syncMetadataSmoothingTypeButtons(metadata);
  document.getElementById("metadataSliderCurveValue").value = normalizeNodeSliderCurve(metadata.sliderCurve, metadata.nonlinearSlider);
  document.getElementById("metadataCurveSensitivityValue").value = formatNodeSliderCompactNumber(metadata.curveAmount);
  document.getElementById("metadataShowSignValue").checked = metadata.showSign;
  const trailEl = document.getElementById("metadataRemoveTrailingZerosValue");
  if (trailEl) {
    trailEl.checked = Boolean(metadata.removeTrailingZeros);
  }
  document.getElementById("metadataWraparoundValue").checked = metadata.wraparound;
  syncNodeMetadataMidVisibility();
  syncNodeMetadataChoiceToggleAvailability();
}

/**
 * Place empty-state copy BELOW the unified nav toolbar (heading → nav → empty).
 * Never insert as heading's next sibling when a nav host already exists.
 */
function placeNodeGraphUnifiedInspectorEmpty(popover, empty) {
  if (!popover || !empty) {
    return;
  }
  const nav = popover.querySelector(":scope > .node-unified-window-nav-host");
  const heading = popover.querySelector(":scope > .scene-context-heading");
  const grid = popover.querySelector(
    ":scope > .metadata-popover-grid, :scope > .node-trace-display-settings-grid",
  );
  if (nav) {
    nav.after(empty);
  } else if (grid) {
    popover.insertBefore(empty, grid);
  } else if (heading) {
    heading.after(empty);
  } else {
    popover.append(empty);
  }
}

/** Show/hide the parameter form vs the “right-click a slider” empty state. */
function setNodeMetadataPopoverBlankState(blank = true, message = "Right-click on a slider") {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (!popover) {
    return;
  }
  const grid = popover.querySelector(".metadata-popover-grid");
  let empty = popover.querySelector(":scope > .node-unified-inspector-empty");
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "node-unified-inspector-empty";
    empty.setAttribute("role", "status");
  }
  empty.textContent = message;
  placeNodeGraphUnifiedInspectorEmpty(popover, empty);
  empty.hidden = !blank;
  if (grid) {
    grid.hidden = Boolean(blank);
  }
  popover.dataset.inspectorBlank = blank ? "true" : "false";
}

function fillNodeMetadataPopover(slider) {
  populateNodeMetadataKindChoices();
  const metadata = nodeSliderMetadata(slider);
  const sliderLabel = nodeSliderLabelText(slider);
  const moduleNodeId = slider.closest(".dsp-node")?.dataset.node;
  const moduleLabel = moduleNodeId ? nodeGraphNodeDisplayName(moduleNodeId) : "";
  document.getElementById("metadataPopoverTitle").textContent = sliderLabel || "PARAMETER";
  document.getElementById("metadataPopoverSubtitle").textContent = moduleLabel || "Settings";
  document.getElementById("metadataScriptTarget").textContent = sliderLabel;
  document.getElementById("metadataAliasValue").placeholder = sliderLabel;
  writeNodeMetadataEditorValues(metadata);
  setMetadataScriptSourceText(formatNodeMetadataScript(slider, metadata));
  setNodeMetadataScriptDirty(false, "script ready", false);
  setNodeMetadataAdvancedScriptVisible(false);
  setNodeMetadataFieldsDirty(false);
  document.getElementById("metadataRestoreDefaultButton")?.classList.remove("armed");
  setNodeMetadataPopoverBlankState(false);
}

function openNodeMetadataPopover(event, readout) {
  event.preventDefault();
  event.stopPropagation();
  bindNodeGraphMetadataPopoverEvents();
  const slider = document.getElementById(readout.dataset.sliderTarget);
  if (!slider) {
    return;
  }
  if (nodeGraphMvp.metadataEditorTarget !== slider.id && !confirmNodeMetadataScriptDiscard()) {
    return;
  }
  const displayRect = typeof prepareNodeGraphTraceDisplaySettingsForInspectorReplacement === "function"
    ? prepareNodeGraphTraceDisplaySettingsForInspectorReplacement()
    : null;
  if (displayRect === false) {
    return;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;

  nodeGraphMvp.metadataEditorTarget = slider.id;
  nodeGraphMvp.sharedInspectorActive = "metaparameters";
  fillNodeMetadataPopover(slider);
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  const savedPosition = sharedInspectorState.position || nodeGraphMvp.metadataPopoverPosition;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  applyNodeMetadataPopoverSize(sharedInspectorState.size);
  const popover = document.getElementById("nodeParameterMetadataPopover");
  // Unified switcher seats after return — skip independent placement.
  if (nodeGraphMvp._unifiedWindowSwitching) {
    popover.hidden = false;
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(popover);
    }
  } else {
    positionNodeMetadataPopover(
      popover,
      hasSavedPosition
        ? savedPosition.left
        : nodeMetadataReplacementX(displayRect || moduleActionsRect, popover, event.clientX),
      hasSavedPosition
        ? savedPosition.top
        : (displayRect?.top ?? moduleActionsRect?.top ?? event.clientY),
    );
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("metaparameters", popover, { open: true }, { status: false });
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("metaparameters", popover);
  }
}

/**
 * Parameter Settings never auto-bind from module selection — only right-click
 * on a slider fills the form. Selection changes only clear to the blank state
 * when nothing is selected or the open parameter no longer belongs to the selection.
 */
function syncOpenNodeMetadataPopoverToModule(nodeId) {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (!popover || popover.hidden || nodeGraphMvp.sharedInspectorActive !== "metaparameters") {
    return false;
  }
  const selectedNode = String(nodeId || "").trim();
  const targetId = String(nodeGraphMvp.metadataEditorTarget || "").trim();
  if (!targetId) {
    // Already blank — keep blank even when a module is selected.
    return true;
  }
  const slider = document.getElementById(targetId);
  const targetModuleId = String(slider?.closest?.(".dsp-node")?.dataset?.node || "").trim();
  if (selectedNode && targetModuleId && selectedNode === targetModuleId) {
    return true;
  }
  // Unselected, multi-select, or different module: clear to empty state.
  if (nodeGraphMvp.metadataEditorTarget && !confirmNodeMetadataScriptDiscard()) {
    return false;
  }
  showBlankNodeMetadataPopoverContent();
  return true;
}

/** Content-only blank fill (no positioning). Used by open + selection sync. */
function showBlankNodeMetadataPopoverContent() {
  nodeGraphMvp.metadataEditorTarget = null;
  nodeGraphMvp.sharedInspectorActive = "metaparameters";
  const title = document.getElementById("metadataPopoverTitle");
  const subtitle = document.getElementById("metadataPopoverSubtitle");
  const scriptTarget = document.getElementById("metadataScriptTarget");
  if (title) {
    title.textContent = "PARAMETER";
  }
  if (subtitle) {
    subtitle.textContent = "Settings";
  }
  if (scriptTarget) {
    scriptTarget.textContent = "No parameter selected";
  }
  setMetadataScriptSourceText("");
  if (typeof updateNodeMetadataScriptPreview === "function") {
    updateNodeMetadataScriptPreview("");
  }
  if (typeof updateNodeMetadataScriptEffective === "function") {
    updateNodeMetadataScriptEffective("");
  }
  setNodeMetadataScriptDirty(false, "no parameter selected", false, "Right-click on a slider");
  setNodeMetadataPopoverBlankState(true, "Right-click on a slider");
}

function openBlankNodeMetadataPopover(event = {}) {
  event.preventDefault?.();
  event.stopPropagation?.();
  bindNodeGraphMetadataPopoverEvents();
  if (nodeGraphMvp.metadataEditorTarget && !confirmNodeMetadataScriptDiscard()) {
    return;
  }
  const displayRect = typeof prepareNodeGraphTraceDisplaySettingsForInspectorReplacement === "function"
    ? prepareNodeGraphTraceDisplaySettingsForInspectorReplacement()
    : null;
  if (displayRect === false) {
    return;
  }
  const moduleActionsRect = typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function"
    ? prepareNodeModuleActionsWindowForInspectorReplacement()
    : null;
  showBlankNodeMetadataPopoverContent();
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  const savedPosition = sharedInspectorState.position || nodeGraphMvp.metadataPopoverPosition;
  const hasSavedPosition =
    Number.isFinite(Number(savedPosition?.left)) &&
    Number.isFinite(Number(savedPosition?.top));
  applyNodeMetadataPopoverSize(sharedInspectorState.size);
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (nodeGraphMvp._unifiedWindowSwitching) {
    popover.hidden = false;
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(popover);
    }
  } else {
    positionNodeMetadataPopover(
      popover,
      hasSavedPosition
        ? savedPosition.left
        : nodeMetadataReplacementX(displayRect || moduleActionsRect, popover, event.clientX ?? window.innerWidth * 0.5),
      hasSavedPosition
        ? savedPosition.top
        : (displayRect?.top ?? moduleActionsRect?.top ?? event.clientY ?? window.innerHeight * 0.25),
    );
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("metaparameters", popover, { open: true }, { status: false });
  }
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("metaparameters", popover);
  }
}

function finishCloseNodeMetadataPopover() {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (!popover) {
    return;
  }
  setNodeMetadataClosePromptVisible(false);
  popover.hidden = true;
  setNodeMetadataScriptDirty(false, "");
  if (nodeGraphMvp.metadataDragging?.handle) {
    nodeGraphMvp.metadataDragging.handle.classList.remove("dragging");
  }
  nodeGraphMvp.metadataDragging = null;
  nodeGraphMvp.metadataEditorTarget = null;
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("metaparameters", popover, { open: false }, { status: false });
  }
}

function closeNodeMetadataPopover() {
  if (nodeGraphMvp.metadataScriptDirty && nodeMetadataScriptPanelVisible()) {
    setNodeMetadataClosePromptVisible(true);
    metadataScriptStatus("save changes before closing?", false);
    return;
  }
  finishCloseNodeMetadataPopover();
}

function saveAndCloseNodeMetadataPopover() {
  if (applyNodeMetadataScriptEditor() && !nodeGraphMvp.metadataScriptDirty) {
    finishCloseNodeMetadataPopover();
  }
}

function discardAndCloseNodeMetadataPopover() {
  finishCloseNodeMetadataPopover();
}

function nodeMetadataScriptPanelVisible() {
  const panel = document.querySelector(".metadata-script-panel");
  return Boolean(panel) && window.getComputedStyle(panel).display !== "none";
}

function setNodeMetadataAdvancedScriptVisible(visible) {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  const toggle = document.getElementById("metadataAdvancedToggle");
  if (popover) {
    popover.classList.toggle("metadata-script-open", Boolean(visible));
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", visible ? "true" : "false");
    toggle.textContent = visible ? "Hide Script" : "Script (advanced)";
  }
}

function setNodeMetadataFieldsDirty(dirty) {
  const saveButton = document.getElementById("metadataSaveFieldsButton");
  if (saveButton) {
    saveButton.classList.toggle("dirty", Boolean(dirty));
  }
}

function toggleNodeMetadataAdvancedScript() {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  setNodeMetadataAdvancedScriptVisible(!popover?.classList.contains("metadata-script-open"));
}

/**
 * Parameter Settings −/+ step size from current magnitude + direction.
 * Same rules as nodeGraphMagnitudeStepperQuantum:
 *   |value| < 1 → 0.1 · 1…<10 → 1 · 10…<100 → 10 · …
 * Stepping DOWN from an exact decade (1, 10, 100, 1000) uses the next finer
 * step so 1→0.9 (not 1→0), 10→9, etc.
 * Max digits always steps by 1.
 *
 * @param {HTMLInputElement|null} input
 * @param {number} currentValue
 * @param {number} [direction]  -1 = minus, +1 = plus
 */
function metadataStepperQuantum(input, currentValue, direction = 0) {
  if (input?.id === "metadataMaxDigitsValue") {
    return 1;
  }
  if (typeof nodeGraphMagnitudeStepperQuantum === "function") {
    return nodeGraphMagnitudeStepperQuantum(currentValue, direction);
  }
  // Fallback if display-settings controls script not loaded yet.
  const abs = Math.abs(Number(currentValue));
  let q;
  if (!Number.isFinite(abs) || abs < 1 - 1e-12) {
    q = 0.1;
  } else if (abs < 10) {
    q = 1;
  } else if (abs < 100) {
    q = 10;
  } else if (abs < 1000) {
    q = 100;
  } else {
    q = 1000;
  }
  if (direction < 0 && Number.isFinite(abs) && abs > 0 && Math.abs(abs - q) <= 1e-9) {
    if (q === 1) q = 0.1;
    else if (q === 10) q = 1;
    else if (q === 100) q = 10;
    else if (q >= 1000) q = 100;
  }
  return q;
}

function formatMetadataStepperValue(value, quantum) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  // Whole-unit quanta (1, 10, 100, 1000) and max-digits: integer display.
  if (!Number.isFinite(quantum) || quantum >= 1 - 1e-12) {
    return String(Math.round(value));
  }
  // Sub-unit steps (0.1): keep one decimal without float dust.
  const decimals = Math.min(8, Math.max(0, String(quantum).split(".")[1]?.length || 0));
  return value.toFixed(decimals).replace(/\.?0+$/g, "");
}

function stepNodeMetadataField(event) {
  if (typeof nodeGraphSettingsTextGestureShouldIgnoreClick === "function" && nodeGraphSettingsTextGestureShouldIgnoreClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-metadata-step-target]");
  if (!button) {
    return;
  }
  const input = document.getElementById(button.dataset.metadataStepTarget || "");
  if (!input) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const direction = Number(button.dataset.metadataStepDirection) < 0 ? -1 : 1;
  const current = Number(input.value);
  const base = Number.isFinite(current) ? current : 0;
  // Pass direction so 1 − → 0.9 (not 1 − → 0).
  const quantum = metadataStepperQuantum(input, base, direction);
  let next = base + direction * quantum;
  if (quantum < 1 - 1e-12) {
    next = Math.round(next * 10) / 10;
  }
  if (input.id === "metadataMaxDigitsValue") {
    // App-wide: maxDigits ≥ 1 (0 is invalid).
    next = Math.max(1, Math.min(12, Math.round(next)));
  }
  // Optional clamp (e.g. SENSITIVITY uses standard curve range −1…+1).
  const clampMin = Number(input.dataset.metadataClampMin);
  const clampMax = Number(input.dataset.metadataClampMax);
  if (Number.isFinite(clampMin) && Number.isFinite(clampMax) && clampMax >= clampMin) {
    next = Math.max(clampMin, Math.min(clampMax, next));
  } else if (input.id === "metadataCurveSensitivityValue") {
    next = typeof normalizeNodeSliderCurveAmount === "function"
      ? normalizeNodeSliderCurveAmount(next, 0)
      : Math.max(-1, Math.min(1, next));
  }
  input.value = formatMetadataStepperValue(next, quantum);
  syncNodeMetadataMidVisibility();
  setNodeMetadataFieldsDirty(true);
  applyNodeMetadataEditor({ keepDirty: true });
  syncNodeMetadataScriptFromFields({ force: true });
}

// How many samples a mode will actually use, for the status line under the
// 5-way smoothing-source buttons. Sample counts are always rounded down.
function nodeGraphSmoothingModeStatusText(mode, smoothingSamples) {
  const rate = Math.max(1, Number(nodeGraphMvp?.sampleRate) || 44100);
  const globalSeconds = Number(nodeGraphMvp?.live?.autoSmoothingSeconds) || 0;
  const globalSamples = Math.floor(globalSeconds * rate);
  const internalSamples = Math.max(0, Math.floor(Number(smoothingSamples) || 0));
  switch (mode) {
    case "global":
      return `🌍 Global — ${globalSamples} samples.`;
    case "internalGlobal":
      return `🙂🌍 Internal + Global — ${internalSamples} internal + ${globalSamples} global = ${internalSamples + globalSamples} samples.`;
    case "off":
      return "❌ Off — 0 samples.";
    case "internal":
    default:
      return `🙂 Internal — ${internalSamples} sample${internalSamples === 1 ? "" : "s"}.`;
  }
}

function syncMetadataSmoothingModeButtons(metadata = {}) {
  const group = document.getElementById("metadataSmoothingModeGroup");
  if (!group) {
    return;
  }
  const mode = normalizeNodeGraphMetadataSmoothingMode(metadata.smoothingMode);
  group.dataset.mode = mode;
  for (const button of group.querySelectorAll("[data-smoothing-mode]")) {
    button.setAttribute("aria-pressed", button.dataset.smoothingMode === mode ? "true" : "false");
  }
  const status = document.getElementById("metadataSmoothingModeStatus");
  if (status) {
    status.textContent = nodeGraphSmoothingModeStatusText(mode, metadata.smoothingSeconds);
  }
}

function nodeGraphSmoothingTypeStatusText(type) {
  switch (normalizeNodeGraphMetadataSmoothingType(type)) {
    case "linear":
      return "L Linear — constant-rate lerp over the smoothing time.";
    case "none":
      // Discrete / legacy instant. User-facing “no smooth” is SOURCE ❌.
      return "Instant (no filter). For continuous params use SOURCE ❌ Off.";
    case "twoPole":
      return "2P Two-pole - cascaded one poles (more smooth and less expensive than papoulis)";
    case "papoulis":
      return "Π Papoulis - 3rd-order Optimum-L lowpass (most smooth but higher cpu usage)";
    case "onePole":
    default:
      return "1P One-pole — classic exponential parameter chase.";
  }
}

function syncMetadataSmoothingTypeButtons(metadata = {}) {
  const group = document.getElementById("metadataSmoothingTypeGroup");
  if (!group) {
    return;
  }
  const type = normalizeNodeGraphMetadataSmoothingType(metadata.smoothingType);
  group.dataset.type = type;
  for (const button of group.querySelectorAll("[data-smoothing-type]")) {
    button.setAttribute("aria-pressed", button.dataset.smoothingType === type ? "true" : "false");
  }
  const status = document.getElementById("metadataSmoothingTypeStatus");
  if (status) {
    status.textContent = nodeGraphSmoothingTypeStatusText(type);
  }
}

function clickNodeMetadataSmoothingModeButton(event) {
  const typeButton = event.target.closest("[data-smoothing-type]");
  if (typeButton) {
    event.preventDefault();
    event.stopPropagation();
    const typeGroup = document.getElementById("metadataSmoothingTypeGroup");
    if (!typeGroup) {
      return;
    }
    typeGroup.dataset.type = normalizeNodeGraphMetadataSmoothingType(typeButton.dataset.smoothingType);
    syncMetadataSmoothingTypeButtons({ smoothingType: typeGroup.dataset.type });
    setNodeMetadataFieldsDirty(true);
    applyNodeMetadataEditor({ keepDirty: true });
    syncNodeMetadataScriptFromFields({ force: true });
    return;
  }
  const button = event.target.closest("[data-smoothing-mode]");
  if (!button) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const group = document.getElementById("metadataSmoothingModeGroup");
  if (!group) {
    return;
  }
  group.dataset.mode = normalizeNodeGraphMetadataSmoothingMode(button.dataset.smoothingMode);
  syncMetadataSmoothingModeButtons({
    smoothingMode: group.dataset.mode,
    smoothingSeconds: nodeGraphMetadataSmoothingSecondsToSamples(
      parseNodeMetadataNumber(document.getElementById("metadataSmoothingSecondsValue")?.value, 0),
    ),
  });
  setNodeMetadataFieldsDirty(true);
  applyNodeMetadataEditor({ keepDirty: true });
  syncNodeMetadataScriptFromFields({ force: true });
}

function bindNodeGraphMetadataPopoverEvents() {
  const popover = document.getElementById("nodeParameterMetadataPopover");
  if (popover && popover.dataset.metadataPopoverBound !== "true") {
    popover.dataset.metadataPopoverBound = "true";
    if (typeof bindNodeGraphSettingsTextInputProtection === "function") {
      bindNodeGraphSettingsTextInputProtection(popover);
    }
    popover.addEventListener("input", handleNodeMetadataEditorInput);
    popover.addEventListener("change", handleNodeMetadataEditorInput);
    popover.addEventListener("click", stepNodeMetadataField);
    popover.addEventListener("click", clickNodeMetadataSmoothingModeButton);
  } else if (popover && typeof bindNodeGraphSettingsTextInputProtection === "function") {
    bindNodeGraphSettingsTextInputProtection(popover);
  }
  const scriptSource = document.getElementById("metadataScriptSource");
  syncNodeMetadataScriptReference();
  const scriptReference = document.getElementById("metadataScriptReference");
  if (scriptReference && scriptReference.dataset.metadataScriptReferenceBound !== "true") {
    scriptReference.dataset.metadataScriptReferenceBound = "true";
    scriptReference.addEventListener("click", handleNodeMetadataScriptReferenceClick);
    scriptReference.addEventListener("keydown", handleNodeMetadataScriptReferenceKeydown);
  }
  if (scriptSource && scriptSource.dataset.metadataScriptSourceBound !== "true") {
    scriptSource.dataset.metadataScriptSourceBound = "true";
    scriptSource.addEventListener("input", handleNodeMetadataScriptSourceInput);
    scriptSource.addEventListener("keydown", handleNodeMetadataScriptKeydown);
    scriptSource.addEventListener("keyup", handleNodeMetadataScriptSourceKeyup);
    scriptSource.addEventListener("pointerdown", (event) => event.stopPropagation());
    scriptSource.addEventListener("pointerup", handleNodeMetadataScriptSourcePointer);
    scriptSource.addEventListener("scroll", updateNodeMetadataScriptHighlight);
  }
  const scriptPreview = document.getElementById("metadataScriptPreview");
  if (scriptPreview && scriptPreview.dataset.metadataScriptPreviewBound !== "true") {
    scriptPreview.dataset.metadataScriptPreviewBound = "true";
    scriptPreview.addEventListener("click", handleNodeMetadataScriptPreviewClick);
    scriptPreview.addEventListener("keydown", handleNodeMetadataScriptPreviewKeydown);
  }
  const closeButton = document.getElementById("metadataPopoverClose");
  if (closeButton && closeButton.dataset.metadataCloseBound !== "true") {
    closeButton.dataset.metadataCloseBound = "true";
    closeButton.addEventListener("click", closeNodeMetadataPopover);
  }
  const closeSave = document.getElementById("metadataCloseSave");
  if (closeSave && closeSave.dataset.metadataCloseSaveBound !== "true") {
    closeSave.dataset.metadataCloseSaveBound = "true";
    closeSave.addEventListener("click", saveAndCloseNodeMetadataPopover);
  }
  const closeDiscard = document.getElementById("metadataCloseDiscard");
  if (closeDiscard && closeDiscard.dataset.metadataCloseDiscardBound !== "true") {
    closeDiscard.dataset.metadataCloseDiscardBound = "true";
    closeDiscard.addEventListener("click", discardAndCloseNodeMetadataPopover);
  }
  const beginMetaDrag = (event) => {
    if (typeof beginNodeGraphRegisteredFloatingWindowDrag === "function") {
      // Empty-body drag still allowed via beginNodeMetadataPopoverDrag for non-heading targets.
      if (event.currentTarget?.classList?.contains("scene-context-heading")
        || event.currentTarget?.id === "metadataPopoverDragHandle"
        || event.currentTarget?.classList?.contains("scene-context-drag-handle")) {
        beginNodeGraphRegisteredFloatingWindowDrag(event, "metaparameters");
        return;
      }
    }
    beginNodeMetadataPopoverDrag(event);
  };
  const beginMetaResize = (event) => {
    if (typeof beginNodeGraphRegisteredFloatingWindowResize === "function") {
      beginNodeGraphRegisteredFloatingWindowResize(event, "metaparameters");
      return;
    }
    beginNodeMetadataPopoverResize(event);
  };
  const dragHandle = document.getElementById("metadataPopoverDragHandle");
  if (dragHandle && dragHandle.dataset.metadataDragBound !== "true") {
    dragHandle.dataset.metadataDragBound = "true";
    dragHandle.addEventListener("pointerdown", beginMetaDrag);
  }
  const cornerDrag = document.getElementById("metadataPopoverCornerDrag");
  if (cornerDrag && cornerDrag.dataset.metadataCornerDragBound !== "true") {
    cornerDrag.dataset.metadataCornerDragBound = "true";
    cornerDrag.addEventListener("pointerdown", beginMetaResize);
  }
  const dragHeading = document.querySelector("#nodeParameterMetadataPopover .scene-context-heading");
  if (dragHeading && dragHeading.dataset.metadataDragHeadingBound !== "true") {
    dragHeading.dataset.metadataDragHeadingBound = "true";
    dragHeading.addEventListener("pointerdown", beginMetaDrag);
  }
  if (popover && popover.dataset.metadataEmptyDragBound !== "true") {
    popover.dataset.metadataEmptyDragBound = "true";
    popover.addEventListener("pointerdown", beginNodeMetadataPopoverDrag);
    // Move/resize end: registry pointer bridge (empty-body drag still uses metadataDragging key)
  }
  const defaultButton = document.getElementById("metadataRestoreDefaultButton");
  if (defaultButton && defaultButton.dataset.metadataDefaultBound !== "true") {
    defaultButton.dataset.metadataDefaultBound = "true";
    defaultButton.addEventListener("click", confirmAndRestoreNodeMetadataDefaultsFromKind);
  }
  const setCurrentDefaultButton = document.getElementById("metadataSetCurrentAsDefaultButton");
  if (setCurrentDefaultButton && setCurrentDefaultButton.dataset.metadataSetCurrentDefaultBound !== "true") {
    setCurrentDefaultButton.dataset.metadataSetCurrentDefaultBound = "true";
    setCurrentDefaultButton.addEventListener("click", confirmAndSetNodeMetadataCurrentValueAsDefault);
  }
  const saveFields = document.getElementById("metadataSaveFieldsButton");
  if (saveFields && saveFields.dataset.metadataSaveFieldsBound !== "true") {
    saveFields.dataset.metadataSaveFieldsBound = "true";
    saveFields.addEventListener("click", applyNodeMetadataEditor);
  }
  const restoreFields = document.getElementById("metadataRestoreFieldsButton");
  if (restoreFields && restoreFields.dataset.metadataRestoreFieldsBound !== "true") {
    restoreFields.dataset.metadataRestoreFieldsBound = "true";
    restoreFields.addEventListener("click", restoreNodeMetadataEditorFields);
  }
  const advancedToggle = document.getElementById("metadataAdvancedToggle");
  if (advancedToggle && advancedToggle.dataset.metadataAdvancedBound !== "true") {
    advancedToggle.dataset.metadataAdvancedBound = "true";
    advancedToggle.addEventListener("click", toggleNodeMetadataAdvancedScript);
  }
  const kindInput = document.getElementById("metadataKindValue");
  if (kindInput && kindInput.dataset.metadataKindBound !== "true") {
    kindInput.dataset.metadataKindBound = "true";
    kindInput.addEventListener("change", handleNodeMetadataKindChange);
  }
  const scriptApply = document.getElementById("metadataScriptApply");
  if (scriptApply && scriptApply.dataset.metadataScriptApplyBound !== "true") {
    scriptApply.dataset.metadataScriptApplyBound = "true";
    scriptApply.addEventListener("click", applyNodeMetadataScriptEditor);
  }
  const scriptRefresh = document.getElementById("metadataScriptRefresh");
  if (scriptRefresh && scriptRefresh.dataset.metadataScriptRefreshBound !== "true") {
    scriptRefresh.dataset.metadataScriptRefreshBound = "true";
    scriptRefresh.textContent = "Restore";
    scriptRefresh.title = "Restore script text from the selected parameter's current metadata.";
    scriptRefresh.addEventListener("click", () => syncNodeMetadataScriptFromFields({ force: true }));
  }
  const scriptKindTemplate = document.getElementById("metadataScriptKindTemplate");
  if (scriptKindTemplate && scriptKindTemplate.dataset.metadataScriptKindTemplateBound !== "true") {
    scriptKindTemplate.dataset.metadataScriptKindTemplateBound = "true";
    scriptKindTemplate.addEventListener("click", insertNodeMetadataScriptKindTemplate);
  }
  const scriptNormalize = document.getElementById("metadataScriptNormalize");
  if (scriptNormalize && scriptNormalize.dataset.metadataScriptNormalizeBound !== "true") {
    scriptNormalize.dataset.metadataScriptNormalizeBound = "true";
    scriptNormalize.addEventListener("click", normalizeNodeMetadataScriptEditor);
  }
  const scriptCopy = document.getElementById("metadataScriptCopy");
  if (scriptCopy && scriptCopy.dataset.metadataScriptCopyBound !== "true") {
    scriptCopy.dataset.metadataScriptCopyBound = "true";
    scriptCopy.addEventListener("click", copyNodeMetadataScriptSource);
  }
  const scriptPaste = document.getElementById("metadataScriptPaste");
  if (scriptPaste && scriptPaste.dataset.metadataScriptPasteBound !== "true") {
    scriptPaste.dataset.metadataScriptPasteBound = "true";
    scriptPaste.addEventListener("click", pasteNodeMetadataScriptSource);
  }
  const scriptToDesktop = document.getElementById("metadataScriptToDesktop");
  if (scriptToDesktop && scriptToDesktop.dataset.metadataScriptDesktopBound !== "true") {
    scriptToDesktop.dataset.metadataScriptDesktopBound = "true";
    scriptToDesktop.addEventListener("click", exportNodeMetadataScriptToDesktop);
  }
}

function insertNodeMetadataScriptText(text) {
  const source = document.getElementById("metadataScriptSource");
  if (!source) {
    return;
  }
  const start = source.selectionStart ?? source.value.length;
  const end = source.selectionEnd ?? start;
  source.setRangeText(text, start, end, "end");
  updateNodeMetadataScriptHighlight();
  syncNodeMetadataScriptDiagnostics();
}

function nodeMetadataScriptAssignmentInsertion(value, text, start, end = start) {
  const source = String(value || "");
  const insertStart = Math.max(0, Math.min(source.length, Number(start) || 0));
  const insertEnd = Math.max(insertStart, Math.min(source.length, Number(end) || insertStart));
  const before = source[insertStart - 1] || "";
  const after = source[insertEnd] || "";
  const prefix = insertStart > 0 && !nodeMetadataScriptIsLineBreak(before) ? "\n" : "";
  const suffix = insertEnd < source.length && !nodeMetadataScriptIsLineBreak(after) ? "\n" : "";
  return `${prefix}${text}${suffix}`;
}

function nodeMetadataScriptIsLineBreak(character) {
  return character === "\n" || character === "\r";
}

function insertNodeMetadataScriptAssignment(text) {
  const source = document.getElementById("metadataScriptSource");
  if (!source) {
    return;
  }
  const start = source.selectionStart ?? source.value.length;
  const end = source.selectionEnd ?? start;
  insertNodeMetadataScriptText(nodeMetadataScriptAssignmentInsertion(source.value, text, start, end));
}

function handleNodeMetadataScriptKeydown(event) {
  const source = event.currentTarget;
  if (!source || source.id !== "metadataScriptSource") {
    return;
  }
  const commandKey = event.ctrlKey || event.metaKey;
  if (event.key === "Tab") {
    event.preventDefault();
    insertNodeMetadataScriptText("  ");
    return;
  }
  if (commandKey && event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    normalizeNodeMetadataScriptEditor();
    return;
  }
  if (commandKey && (event.key.toLowerCase() === "s" || event.key === "Enter")) {
    event.preventDefault();
    applyNodeMetadataScriptEditor();
  }
}

function insertNodeMetadataScriptKindTemplate() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return;
  }
  if (nodeGraphMvp.metadataScriptDirty && !confirmNodeMetadataScriptDiscard()) {
    metadataScriptStatus("template canceled", false);
    return;
  }
  const kind = normalizeNodeMetadataKind(document.getElementById("metadataKindValue").value);
  setMetadataScriptSourceText(nodeMetadataScriptTemplateForKind(slider, kind));
  syncNodeMetadataScriptDiagnostics();
  metadataScriptStatus(`template: ${kind}`, false, `Kind template inserted for ${kind}. Save to apply.`);
}

function normalizeNodeMetadataScriptEditor() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return;
  }
  const parsed = parseNodeMetadataScript(metadataScriptSourceText(), slider);
  if (
    parsed.ignored.length &&
    !window.confirm(`Normalize will remove ignored metadata script lines: ${parsed.ignored.join(", ")}. Continue?`)
  ) {
    metadataScriptStatus("normalize canceled", false);
    return;
  }
  setMetadataScriptSourceText(formatNodeMetadataScript(slider, parsed.metadata));
  const ignoredText = parsed.ignored.length
    ? `; ignored lines ${parsed.ignored.join(", ")}`
    : "";
  syncNodeMetadataScriptDiagnostics();
  metadataScriptStatus(`normalized${ignoredText}`, Boolean(parsed.ignored.length), "Review the normalized script, then Save to apply.");
}

function bindNodeMetadataScriptBeforeUnload() {
  if (window.nodeMetadataScriptBeforeUnloadBound === true) {
    return;
  }
  window.nodeMetadataScriptBeforeUnloadBound = true;
  window.addEventListener("beforeunload", (event) => {
    if (!nodeGraphMvp.metadataScriptDirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
}

function readNodeMetadataEditorValues(slider) {
  const current = nodeSliderMetadata(slider);
  const sanitizeMetadataNumberInput = (id) => {
    const input = document.getElementById(id);
    if (!input) {
      return "";
    }
    const sanitized = typeof sanitizeNodeGraphNumericText === "function"
      ? sanitizeNodeGraphNumericText(input.value)
      : String(input.value ?? "").trim();
    if (sanitized && sanitized !== input.value) {
      input.value = sanitized;
    }
    return sanitized;
  };
  let min = parseNodeMetadataNumber(sanitizeMetadataNumberInput("metadataMinValue"), current.min);
  let max = parseNodeMetadataNumber(sanitizeMetadataNumberInput("metadataMaxValue"), current.max);
  if (min > max) {
    [min, max] = [max, min];
  }
  const stepInput = sanitizeMetadataNumberInput("metadataStepValue");
  const kind = normalizeNodeMetadataKind(document.getElementById("metadataKindValue").value);
  const smoothingSecondsInput = sanitizeMetadataNumberInput("metadataSmoothingSecondsValue");
  const smoothingSecondsFallback = nodeGraphMetadataSmoothingSamplesToSeconds(current.smoothingSeconds ?? 0);
  const smoothingSeconds = smoothingSecondsInput === ""
    ? (typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
      ? nodeGraphModuleSmoothingDefaultSeconds()
      : 0.0333)
    : nodeGraphMetadataSmoothingSecondsToSamples(parseNodeMetadataNumber(smoothingSecondsInput, smoothingSecondsFallback));
  const smoothingType = normalizeNodeGraphMetadataSmoothingType(
    document.getElementById("metadataSmoothingTypeGroup")?.dataset.type,
  );
  return {
    alias: normalizeNodeGraphPatchMetadataAlias(document.getElementById("metadataAliasValue").value),
    tooltip: String(document.getElementById("metadataTooltipValue").value || "").trim().slice(0, 240),
    curveAmount: normalizeNodeSliderCurveAmount(
      // Already −1…+1 in normalizeNodeSliderCurveAmount (standard bipolar curve range).
      sanitizeMetadataNumberInput("metadataCurveSensitivityValue"),
      current.curveAmount,
    ),
    def: parseNodeMetadataNumber(sanitizeMetadataNumberInput("metadataDefaultValue"), current.def),
    kind,
    max,
    maxDigits: normalizeNodeGraphMetadataMaxDigits(
      sanitizeMetadataNumberInput("metadataMaxDigitsValue"),
      kind,
    ),
    mid: parseNodeMetadataNumber(sanitizeMetadataNumberInput("metadataMidValue"), current.mid),
    min,
    choices: parseNodeMetadataChoices(document.getElementById("metadataChoicesValue").value),
    bipolar: Boolean(document.getElementById("metadataBipolarValue")?.checked),
    // Keep these independent — do not force divide from display or vice versa.
    displayChoices: Boolean(document.getElementById("metadataDisplayChoicesValue")?.checked),
    divideChoicesVisibly: Boolean(document.getElementById("metadataDivideChoicesValue")?.checked),
    linearSmoothing: typeof nodeGraphMetadataLinearSmoothingFromType === "function"
      ? nodeGraphMetadataLinearSmoothingFromType(smoothingType)
      : smoothingType !== "none",
    nonlinearSlider: document.getElementById("metadataSliderCurveValue").value !== "linear",
    smoothingMode: normalizeNodeGraphMetadataSmoothingMode(
      document.getElementById("metadataSmoothingModeGroup")?.dataset.mode,
    ),
    smoothingType,
    smoothingSeconds,
    sliderCurve: normalizeNodeSliderCurve(document.getElementById("metadataSliderCurveValue").value),
    step: Math.max(0, parseNodeMetadataNumber(stepInput, current.step)),
    showSign: document.getElementById("metadataShowSignValue").checked,
    removeTrailingZeros: Boolean(document.getElementById("metadataRemoveTrailingZerosValue")?.checked),
    wraparound: document.getElementById("metadataWraparoundValue").checked,
    unit: document.getElementById("metadataUnitValue").value.trim(),
  };
}

function applyNodeMetadataEditor(options = {}) {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    return;
  }

  const nextMetadata = readNodeMetadataEditorValues(slider);
  setNodeSliderMetadata(slider, nextMetadata);
  syncNodeGraphPatchMetadataFromSlider(slider, {
    status: "metadata synced",
  });
  syncMetadataSmoothingModeButtons(nextMetadata);
  syncMetadataSmoothingTypeButtons(nextMetadata);
  markNodeGraphRenderPending();
  if (!options.keepDirty) {
    setNodeMetadataFieldsDirty(false);
  }
}

function restoreNodeMetadataEditorFields() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    return;
  }
  const metadata = nodeSliderMetadata(slider);
  writeNodeMetadataEditorValues(metadata);
  setMetadataScriptSourceText(formatNodeMetadataScript(slider, metadata));
  setNodeMetadataScriptDirty(false, "restored", false);
  setNodeMetadataFieldsDirty(false);
  document.getElementById("metadataRestoreDefaultButton").classList.remove("armed");
}

function applyNodeMetadataScriptEditor() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    metadataScriptStatus("no parameter", true);
    return false;
  }
  const parsed = parseNodeMetadataScript(metadataScriptSourceText(), slider);
  setNodeSliderMetadata(slider, parsed.metadata);
  applyNodeMetadataScriptPortAliases(slider, parsed.portAliases);
  writeNodeMetadataEditorValues(nodeSliderMetadata(slider));
  syncNodeGraphPatchMetadataFromSlider(slider, {
    status: "metadata script synced",
  });
  applyNodeGraphPatchToDom();
  markNodeGraphRenderPending();
  const ignoredText = parsed.ignored.length
    ? `; ignored lines ${parsed.ignored.join(", ")}`
    : "";
  const ignoredDetail = parsed.ignored.length
    ? "Supported metadata was applied; ignored script lines remain unresolved."
    : "";
  setNodeMetadataScriptDirty(
    Boolean(parsed.ignored.length),
    `script applied${ignoredText}`,
    Boolean(parsed.ignored.length),
    ignoredDetail,
  );
  return true;
}

async function copyNodeMetadataScriptSource() {
  try {
    await navigator.clipboard.writeText(metadataScriptSourceText());
    metadataScriptStatus("copied", false);
  } catch {
    metadataScriptStatus("copy unavailable", true);
  }
}

async function pasteNodeMetadataScriptSource() {
  try {
    const text = await navigator.clipboard.readText();
    setMetadataScriptSourceText(text);
    syncNodeMetadataScriptDiagnostics();
  } catch {
    metadataScriptStatus("paste unavailable", true);
  }
}

function downloadNodeMetadataScriptSource(filename, source) {
  nodeGraphDownloadTextFile(filename, source);
}

async function exportNodeMetadataScriptToDesktop() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  const nodeElement = slider?.closest?.(".dsp-node");
  const node = nodeElement ? nodeGraphPatchNode(nodeElement.dataset.node) : null;
  const title = `${node ? nodeGraphPatchNodeTitle(node) : "module"}-${nodeMetadataScriptParamKey(slider)}`;
  const source = metadataScriptSourceText();
  try {
    const response = await fetch("/api/metadata-script/to-desktop", {
      body: JSON.stringify({ source, title }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "desktop export failed");
    }
    metadataScriptStatus(`desktop: ${result.filename}`, false);
  } catch {
    downloadNodeMetadataScriptSource(`${title.replace(/[^\w.-]+/g, "-") || "metadata-script"}.metadata-script.txt`, source);
    metadataScriptStatus("downloaded", false);
  }
}

function setNodeMetadataDefaultsFromKind() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    return;
  }
  const kind = normalizeNodeMetadataKind(document.getElementById("metadataKindValue").value);
  const template = nodeMetadataKindTemplates[kind] || nodeMetadataKindTemplates.decimal;
  const choices = template.choices || [];
  if (Number.isFinite(Number(template.min))) {
    document.getElementById("metadataMinValue").value = String(template.min);
  }
  if (Number.isFinite(Number(template.mid))) {
    document.getElementById("metadataMidValue").value = String(template.mid);
  }
  if (Number.isFinite(Number(template.max))) {
    document.getElementById("metadataMaxValue").value = String(template.max);
  }
  document.getElementById("metadataUnitValue").value = template.unit;
  document.getElementById("metadataTooltipValue").value = template.tooltip || "";
  document.getElementById("metadataMaxDigitsValue").value =
    String(normalizeNodeGraphMetadataMaxDigits(template.maxDigits, kind));
  document.getElementById("metadataChoicesValue").value = formatNodeMetadataChoices(choices);
  const displayChoicesInput = document.getElementById("metadataDisplayChoicesValue");
  const divideChoicesInput = document.getElementById("metadataDivideChoicesValue");
  if (displayChoicesInput) {
    displayChoicesInput.checked = Boolean(template.displayChoices);
  }
  if (divideChoicesInput) {
    divideChoicesInput.checked = Boolean(template.divideChoicesVisibly);
  }
  syncNodeMetadataChoiceToggleAvailability();
  const bipolarCheckbox = document.getElementById("metadataBipolarValue");
  if (bipolarCheckbox) {
    bipolarCheckbox.checked = Boolean(template.bipolar);
  }
  document.getElementById("metadataNonlinearSliderValue").checked = Boolean(template.nonlinearSlider);
  // Smoothing type buttons: migrate linearSmoothing=false → none (instant).
  const restoreType = template.linearSmoothing === false
    ? "none"
    : normalizeNodeGraphMetadataSmoothingType(template.smoothingType || "onePole");
  syncMetadataSmoothingTypeButtons({ smoothingType: restoreType });
  document.getElementById("metadataSmoothingSecondsValue").value =
    Number.isFinite(Number(template.smoothingSeconds)) ? formatNodeSliderCompactNumber(template.smoothingSeconds) : "";
  document.getElementById("metadataSliderCurveValue").value = normalizeNodeSliderCurve(template.sliderCurve, template.nonlinearSlider);
  document.getElementById("metadataCurveSensitivityValue").value =
    formatNodeSliderCompactNumber(normalizeNodeSliderCurveAmount(template.curveAmount));
  document.getElementById("metadataShowSignValue").checked = Boolean(template.showPlusMinus);
  document.getElementById("metadataWraparoundValue").checked = Boolean(template.wraparound);
  syncNodeMetadataMidVisibility();
  applyNodeMetadataEditor();
  syncNodeMetadataScriptFromFields({ force: true });
  setNodeMetadataFieldsDirty(false);
  document.getElementById("metadataRestoreDefaultButton").classList.remove("armed");
}

function confirmAndRestoreNodeMetadataDefaultsFromKind() {
  if (!window.confirm("Restore this parameter's metadata to the standard default for its kind? Any custom range, unit, or tooltip changes here will be overwritten.")) {
    return;
  }
  setNodeMetadataDefaultsFromKind();
}

// Complementary to "Restore Default": instead of resetting to the generic
// kind template, this captures whatever the parameter's slider is currently
// set to on the canvas right now and makes that the parameter's new default
// value -- so a future reset/double-click returns to this value instead of
// the generic template one.
function setNodeMetadataCurrentValueAsDefault() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (!slider) {
    return;
  }
  const currentValue = Number(slider.value);
  if (!Number.isFinite(currentValue)) {
    return;
  }
  document.getElementById("metadataDefaultValue").value = formatNodeSliderCompactNumber(currentValue);
  syncNodeMetadataMidVisibility();
  applyNodeMetadataEditor();
  syncNodeMetadataScriptFromFields({ force: true });
  setNodeMetadataFieldsDirty(false);
}

function confirmAndSetNodeMetadataCurrentValueAsDefault() {
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  const currentValue = slider ? Number(slider.value) : NaN;
  const valueLabel = Number.isFinite(currentValue) ? formatNodeSliderCompactNumber(currentValue) : "its current value";
  if (!window.confirm(`Set this parameter's default to ${valueLabel}? Anything currently patched or scripted to reset it will now reset to this value instead.`)) {
    return;
  }
  setNodeMetadataCurrentValueAsDefault();
}

function handleNodeMetadataKindChange() {
  setNodeMetadataFieldsDirty(true);
  applyNodeMetadataEditor({ keepDirty: true });
  document.getElementById("metadataRestoreDefaultButton").classList.add("armed");
}

function handleNodeMetadataEditorInput(event) {
  if (!nodeGraphMvp.metadataEditorTarget) {
    return;
  }
  if (event?.target?.id === "metadataScriptSource") {
    updateNodeMetadataScriptHighlight();
    syncNodeMetadataScriptDiagnostics();
    return;
  }
  // Checkboxes fire both "input" and "change". Applying twice is wasteful and
  // used to re-read mid-toggle form state in some browsers. Prefer change only.
  const target = event?.target;
  if (
    target
    && target.type === "checkbox"
    && event.type === "input"
  ) {
    return;
  }
  syncNodeMetadataMidVisibility();
  syncNodeMetadataChoiceToggleAvailability();
  setNodeMetadataFieldsDirty(true);
  applyNodeMetadataEditor({ keepDirty: true });
  // Re-assert independent choice flags from the slider we just wrote so a
  // stray form rewrite cannot couple Display ↔ Divide.
  const slider = document.getElementById(nodeGraphMvp.metadataEditorTarget);
  if (slider) {
    const live = nodeSliderMetadata(slider);
    const displayInput = document.getElementById("metadataDisplayChoicesValue");
    const divideInput = document.getElementById("metadataDivideChoicesValue");
    if (displayInput) {
      displayInput.checked = Boolean(live.displayChoices);
    }
    if (divideInput) {
      divideInput.checked = Boolean(live.divideChoicesVisibly);
    }
    syncNodeMetadataChoiceToggleAvailability();
  }
  syncNodeMetadataScriptFromFields({ force: true });
}
