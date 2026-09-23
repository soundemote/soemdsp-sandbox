// Chrome labels (live toggles, Render Sample, settings header, toolbar,
// module titles) use CSS font-size. Do not measure glyphs or write inline px.

function nodeGraphChromeClearInlineFontSize(selectors) {
  document.querySelectorAll(selectors).forEach((el) => {
    el.style.removeProperty("font-size");
  });
}

function fitNodeSettingsHeaderText() {
  nodeGraphChromeClearInlineFontSize(".node-settings-actions button > span, .node-settings-actions a > span");
}

function scheduleNodeSettingsHeaderTextFit() {
  fitNodeSettingsHeaderText();
}

function installNodeSettingsHeaderTextFitObserver() {
  fitNodeSettingsHeaderText();
}

function fitNodeLiveToggleText() {
  nodeGraphChromeClearInlineFontSize(
    ".node-live-toggle-palette .node-live-toggle span, #nodeRenderButton span",
  );
}

function scheduleNodeLiveToggleTextFit() {
  fitNodeLiveToggleText();
}

function installNodeLiveToggleTextFitObserver() {
  fitNodeLiveToggleText();
}

function fitNodeModularToolbarText() {
  nodeGraphChromeClearInlineFontSize([
    ".node-view-toolbar .node-view-tabs > .node-toolbar-stack-label > span",
    ".node-view-toolbar .node-history-controls > button > span",
    ".node-view-toolbar .node-world-position-readout > span",
    ".node-view-toolbar .node-modular-view-size-readout > span",
    ".node-view-toolbar .node-selection-count-readout > span",
  ].join(", "));
}

function scheduleNodeModularToolbarTextFit() {
  fitNodeModularToolbarText();
}

function installNodeModularToolbarTextFitObserver() {
  fitNodeModularToolbarText();
}

function fitNodeGraphModuleTitleText() {
  nodeGraphChromeClearInlineFontSize([
    ".node-graph-workspace .dsp-node .node-header-title",
    ".node-module-store-list .scene-context-store-card strong",
  ].join(", "));
}

function scheduleNodeGraphModuleTitleTextFit() {
  fitNodeGraphModuleTitleText();
}

function installNodeGraphModuleTitleTextFitObserver() {
  fitNodeGraphModuleTitleText();
}
