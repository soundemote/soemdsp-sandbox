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
    return alias ? `Alias: ${alias}\n${action}` : action;
  }
  if (element.classList.contains("node-io-row")) {
    const action = element.dataset.io === "output"
      ? nodeGraphTooltipText("wire.output")
      : nodeGraphTooltipText("wire.input");
    return alias ? `Alias: ${alias}\n${action}` : action;
  }
  if (element.classList.contains("node-param-port")) {
    const action = nodeGraphTooltipText("wire.modulationInput");
    return alias ? `Alias: ${alias}\n${action}` : action;
  }
  if (element.classList.contains("node-wire-hit-path") || element.classList.contains("node-wire-path")) {
    const action = nodeGraphTooltipText("wire.selected");
    return alias ? `Alias: ${alias}\n${action}` : action;
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
    const windowOpen = !document.getElementById("nodeTooltipWindow")?.hidden;
    return nodeGraphTooltipText(windowOpen ? "view.tipsHide" : "view.tipsShow");
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

function setNodeInteractionHelp(text = "") {
  const help = document.getElementById("nodeInteractionHelp");
  if (help) {
    const composedText = composeNodeInteractionHelpText(text);
    if (help.textContent === composedText) {
      return;
    }
    help.textContent = composedText;
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
