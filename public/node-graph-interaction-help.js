function nodeInteractionHelpText(target) {
  if (!(target instanceof Element)) {
    return "";
  }
  const helpTarget = target.closest(
    "[data-interaction-help], [data-tooltip-key], button, input, textarea, select, .node-slider-readout, .node-port, .node-io-row, .node-param-port, .node-wire-hit-path, .node-wire-path, .node-execution-order-badge, .node-execution-order li[data-node], .dsp-node, #nodeGraphZoomSurface, #nodeGraphWorkspace",
  );
  if (!helpTarget) {
    return "";
  }
  return nodeInteractionMouseHint(helpTarget);
}

function nodeGraphSelectionHelpText() {
  return "";
}

function composeNodeInteractionHelpText(text = "") {
  const selectionText = nodeGraphSelectionHelpText();
  if (!selectionText) {
    return text;
  }
  return text ? `${text}\n${selectionText}` : selectionText;
}

function normalizeNodeInteractionButtonLabel(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function nodeInteractionButtonLabel(button) {
  if (!button) {
    return "";
  }
  return normalizeNodeInteractionButtonLabel(
    button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      button.textContent ||
      "",
  );
}

function nodeInteractionMouseHint(element) {
  if (element.dataset.interactionHelp) {
    return element.dataset.interactionHelp;
  }
  const tooltipText = nodeGraphElementTooltipText(element);
  if (tooltipText) {
    return tooltipText;
  }
  const alias = element.dataset.alias || "";
  if (element.id === "nodeGraphWorkspace" || element.id === "nodeGraphZoomSurface") {
    return nodeGraphTooltipText("workspace.pan");
  }
  if (element.classList.contains("node-drag-handle")) {
    return nodeGraphTooltipText("module.drag");
  }
  if (element.classList.contains("dsp-node")) {
    return nodeGraphTooltipText("module.drag");
  }
  if (element.classList.contains("node-action-button")) {
    return nodeGraphTooltipText("module.actions");
  }
  if (element.classList.contains("node-display-settings-button")) {
    return nodeGraphTooltipText("module.displaySettings");
  }
  if (element.classList.contains("node-metaparameter-button")) {
    return nodeGraphTooltipText("module.metaparameters");
  }
  if (element.classList.contains("node-bypass-button")) {
    return nodeGraphTooltipText("module.bypass");
  }
  if (element.classList.contains("node-execution-order-badge")) {
    const state = element.dataset.executionState || "inactive";
    if (state === "active") {
      return nodeGraphTooltipText("module.executionActive", { order: element.textContent });
    }
    if (state === "bypassed") {
      return nodeGraphTooltipText("module.executionBypassed");
    }
    return nodeGraphTooltipText("module.executionInactive");
  }
  if (element.matches(".node-execution-order li[data-node]")) {
    const order = element.dataset.executionOrder || "?";
    const nodeName = nodeGraphNodeDisplayName(element.dataset.node);
    return nodeGraphTooltipText("module.executionListItem", { order, nodeName });
  }
  if (element.classList.contains("node-slider-readout")) {
    const slider = document.getElementById(element.dataset.sliderTarget);
    if (slider && nodeSliderShouldDisplayChoices(slider) && nodeSliderShouldDivideChoicesVisibly(slider)) {
      return nodeGraphTooltipText("slider.choices");
    }
    return nodeGraphTooltipText("slider.numeric");
  }
  if (element.classList.contains("node-port")) {
    const action = element.classList.contains("parameter-output")
      ? nodeGraphTooltipText("wire.parameterOutput")
      : element.classList.contains("output")
      ? nodeGraphTooltipText("wire.output")
      : nodeGraphTooltipText("wire.input");
    return alias ? `${alias} | ${action}` : action;
  }
  if (element.classList.contains("node-io-row")) {
    const action = element.dataset.io === "output"
      ? nodeGraphTooltipText("wire.output")
      : nodeGraphTooltipText("wire.input");
    return alias ? `${alias} | ${action}` : action;
  }
  if (element.classList.contains("node-param-port")) {
    const action = nodeGraphTooltipText("wire.modulationInput");
    return alias ? `${alias} | ${action}` : action;
  }
  if (element.classList.contains("node-wire-hit-path") || element.classList.contains("node-wire-path")) {
    const action = nodeGraphTooltipText("wire.selected");
    return alias ? `${alias} | ${action}` : action;
  }
  if (element.classList.contains("node-text-box-input")) {
    return nodeGraphTooltipText("module.textBoxEdit");
  }
  if (element.matches("input, textarea, select")) {
    return nodeGraphTooltipText("common.editText");
  }
  if (element.id === "nodeGraphResizeHandle") {
    return nodeGraphTooltipText("workspace.resize");
  }
  if (element.id === "nodeZoomOutButton" || element.id === "nodeZoomResetButton" || element.id === "nodeZoomInButton") {
    return nodeGraphTooltipText("view.zoomHelp");
  }
  if (element.id === "nodeSnapGridViewButton") {
    return nodeGraphTooltipText("view.snapGrid");
  }
  if (element.id === "nodeSettingsViewButton") {
    return nodeGraphTooltipText("view.patchSettings");
  }
  if (element.id === "nodeModularOnlyViewButton") {
    return nodeGraphTooltipText("view.switchView");
  }
  if (element.id === "nodeUndoButton" || element.id === "nodeRedoButton") {
    return nodeGraphTooltipText("history.help");
  }
  if (element.id === "nodeUserUiSettingsButton") {
    return nodeGraphTooltipText("settings.uiSettingsOpen");
  }
  if (element.id === "nodeGridToggleButton") {
    return nodeGraphTooltipText("view.gridHelp");
  }
  if (element.id === "nodeTooltipToggleButton") {
    return nodeGraphTooltipText(nodeGraphTooltipsShown() ? "view.tipsHide" : "view.tipsShow");
  }
  if (element.id === "nodeTooltipEmbedToggleButton") {
    return nodeGraphTooltipText(nodeGraphMvp.tooltipEmbedded ? "view.tipsFloat" : "view.tipsEmbed");
  }
  if (element.id === "nodeSliderAmountToggleButton") {
    return nodeGraphTooltipText(nodeGraphMvp.sliderAmountVisible ? "view.sliderAmountHide" : "view.sliderAmountShow");
  }
  if (element.id === "nodeSliderPositionToggleButton") {
    return nodeGraphTooltipText(nodeGraphMvp.sliderPositionVisible ? "view.sliderPositionHide" : "view.sliderPositionShow");
  }
  if (element.dataset.paletteNode) {
    return nodeGraphTooltipText("actions.addModule");
  }
  if (element.id === "nodeRenderButton") {
    return nodeGraphTooltipText("audio.render");
  }
  if (element.id === "nodeCopyRuntimeSketchButton") {
    return nodeGraphTooltipText("actions.copyRuntimeSketch");
  }
  if (element.id === "nodeCopyExecutionJsonButton") {
    return nodeGraphTooltipText("actions.copyExecutionJson");
  }
  if (element.id === "nodeDeleteButton") {
    return nodeGraphTooltipText("actions.deleteSelection");
  }
  if (element.matches("button")) {
    return nodeInteractionButtonLabel(element) || nodeGraphTooltipText("common.activate");
  }
  return nodeGraphTooltipText("common.interact");
}

// The embedded tip lives in the page flow, so its box must never change size
// -- a taller tip would push everything below it down, and the interface would
// twitch every time the pointer crossed a control. The box is pinned in CSS
// (.node-interaction-help.is-embedded) and the text is shrunk to fit it here.
//
// Binary search rather than a step-down loop: 9 iterations settle to well
// under a tenth of a pixel, and each probe is one layout read on an element
// that is already being laid out. The floor stops a pathologically long tip
// from becoming unreadable -- past that it simply clips, which is the lesser
// evil compared to reflowing the app.
const nodeInteractionHelpMinFontPx = 8;

function fitNodeInteractionHelpText(help) {
  if (!help || !help.classList.contains("is-embedded")) {
    if (help) {
      help.style.removeProperty("font-size");
    }
    return;
  }
  help.style.removeProperty("font-size");
  if (!help.textContent) {
    return;
  }
  const available = help.clientHeight;
  if (available <= 0) {
    return;
  }
  const natural = Number.parseFloat(window.getComputedStyle(help).fontSize) || 12;
  // The box centres its text (align-items: center). scrollHeight only counts
  // content spilling past the BOTTOM edge, so with centring it stays equal to
  // clientHeight while the first line is already clipped off the top -- the
  // overflow is split between both edges. Measure with the content top-
  // aligned so all of the overflow lands below and scrollHeight sees it.
  const previousAlign = help.style.alignItems;
  help.style.alignItems = "flex-start";
  const overflows = () => help.scrollHeight > help.clientHeight;
  if (overflows()) {
    let low = nodeInteractionHelpMinFontPx;
    let high = natural;
    for (let i = 0; i < 9; i += 1) {
      const mid = (low + high) * 0.5;
      help.style.fontSize = `${mid}px`;
      if (overflows()) {
        high = mid;
      } else {
        low = mid;
      }
    }
    help.style.fontSize = `${low.toFixed(2)}px`;
  }
  if (previousAlign) {
    help.style.alignItems = previousAlign;
  } else {
    help.style.removeProperty("align-items");
  }
}

function setNodeInteractionHelp(text = "") {
  const help = document.getElementById("nodeInteractionHelp");
  if (help) {
    const composedText = composeNodeInteractionHelpText(text);
    if (help.textContent === composedText) {
      return;
    }
    help.textContent = composedText;
    fitNodeInteractionHelpText(help);
  }
}

function handleNodeInteractionHelp(event) {
  setNodeInteractionHelp(nodeInteractionHelpText(event.target));
}

function attachNodeInteractionHelpTarget(element) {
  element.dataset.interactionHelpReady = "true";
  const showHelp = () => setNodeInteractionHelp(nodeInteractionHelpText(element));
  element.addEventListener("pointerover", showHelp);
  element.addEventListener("mouseover", showHelp);
  element.addEventListener("pointerdown", showHelp);
  element.addEventListener("click", showHelp);
  element.addEventListener("focus", showHelp);
}
