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
  nodeGraphChromeClearInlineFontSize(
    ".node-module-store-list .scene-context-store-card strong",
  );
  const canvas = fitNodeGraphModuleTitleText.canvas
    || (fitNodeGraphModuleTitleText.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  if (!context) return;
  document.querySelectorAll(".node-graph-workspace .dsp-node .node-header-title").forEach((el) => {
    if (el.getAttribute("data-title-editing") === "1") {
      return;
    }
    const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) {
      el.style.removeProperty("font-size");
      return;
    }
    const style = getComputedStyle(el);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const maxW = Math.max(0, el.clientWidth - padX);
    const maxH = Math.max(0, el.clientHeight - padY);
    if (maxW < 1 || maxH < 1) {
      return;
    }
    const family = style.fontFamily || "sans-serif";
    const weight = style.fontWeight || "400";
    context.font = `${weight} ${maxH}px ${family}`;
    const probe = context.measureText(text);
    const glyphH = Math.max(
      1,
      (probe.actualBoundingBoxAscent || 0) + (probe.actualBoundingBoxDescent || 0),
    );
    let size = maxH * (maxH / glyphH);
    context.font = `${weight} ${size}px ${family}`;
    const width = context.measureText(text).width;
    if (width > maxW) {
      size *= maxW / width;
    }
    el.style.fontSize = `${Math.max(1, size)}px`;
  });
}

function scheduleNodeGraphModuleTitleTextFit() {
  fitNodeGraphModuleTitleText();
}

function installNodeGraphModuleTitleTextFitObserver() {
  fitNodeGraphModuleTitleText();
  const root = document.querySelector(".node-graph-workspace");
  if (!root || installNodeGraphModuleTitleTextFitObserver.watching) {
    return;
  }
  installNodeGraphModuleTitleTextFitObserver.watching = true;
  const observer = new ResizeObserver(() => {
    fitNodeGraphModuleTitleText();
  });
  observer.observe(root);
}
