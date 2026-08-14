let nodeSettingsHeaderTextFitFrame = 0;
let nodeSettingsHeaderTextFitCanvas = null;
let nodeSettingsHeaderTextResizeObserver = null;
let nodeLiveToggleTextFitFrame = 0;
let nodeLiveToggleTextResizeObserver = null;

function nodeSettingsHeaderTextMeasureContext() {
  if (!nodeSettingsHeaderTextFitCanvas) {
    nodeSettingsHeaderTextFitCanvas = document.createElement("canvas");
  }
  return nodeSettingsHeaderTextFitCanvas.getContext("2d");
}

function nodeSettingsHeaderSpanFits(span, fontSize, context) {
  const text = span.textContent || "";
  if (!text) {
    return true;
  }
  const styles = getComputedStyle(span);
  const width = Math.max(0, span.clientWidth - 1);
  const height = Math.max(0, span.clientHeight - 1);
  if (width <= 0 || height <= 0) {
    return false;
  }
  context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
  return context.measureText(text).width <= width && fontSize <= height;
}

function fitNodeSettingsHeaderText() {
  nodeSettingsHeaderTextFitFrame = 0;
  const settingsView = document.getElementById("nodeSettingsView");
  if (!settingsView || settingsView.hidden) {
    return;
  }
  const context = nodeSettingsHeaderTextMeasureContext();
  if (!context) {
    return;
  }

  const headerSpans = document.querySelectorAll([
    ".node-settings-actions button > span",
    ".node-settings-actions a > span",
    ".node-patch-page-toolbar button > span",
    ".node-patch-page-toolbar a > span",
  ].join(", "));
  for (const span of headerSpans) {
    span.style.fontSize = "1px";
  }

  for (const span of headerSpans) {
    const maxSize = Math.max(0, span.clientHeight - 1);
    if (maxSize <= 0) {
      span.style.fontSize = "0px";
      continue;
    }

    let low = 0;
    let high = maxSize;
    for (let i = 0; i < 12; ++i) {
      const mid = (low + high) * 0.5;
      if (nodeSettingsHeaderSpanFits(span, mid, context)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    span.style.fontSize = `${Math.max(0, low).toFixed(3)}px`;
  }
}

function scheduleNodeSettingsHeaderTextFit() {
  if (nodeSettingsHeaderTextFitFrame) {
    return;
  }
  nodeSettingsHeaderTextFitFrame = requestAnimationFrame(fitNodeSettingsHeaderText);
}

function fitNodeLiveToggleText() {
  nodeLiveToggleTextFitFrame = 0;
  const textScale = 0.89;
  const context = nodeSettingsHeaderTextMeasureContext();
  if (!context) {
    return;
  }

  // Render Sample's two lines are fitted alongside the Input/Output/MIDI
  // toggles so all four buttons in that row share one type size and one
  // setting (UI Dev "live toggle text size").
  const spans = document.querySelectorAll(
    ".node-live-toggle-palette .node-live-toggle span, #nodeRenderButton span",
  );
  for (const span of spans) {
    span.style.fontSize = "1px";
  }

  for (const span of spans) {
    const maxSize = Math.max(0, span.clientHeight - 1);
    if (maxSize <= 0 || textScale <= 0) {
      span.style.fontSize = "0px";
      continue;
    }

    let low = 0;
    let high = maxSize;
    for (let i = 0; i < 12; ++i) {
      const mid = (low + high) * 0.5;
      if (nodeSettingsHeaderSpanFits(span, mid, context)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    span.style.fontSize = `${Math.max(0, low * textScale).toFixed(3)}px`;
  }
}

function scheduleNodeLiveToggleTextFit() {
  if (nodeLiveToggleTextFitFrame) {
    return;
  }
  nodeLiveToggleTextFitFrame = requestAnimationFrame(fitNodeLiveToggleText);
}

function installNodeSettingsHeaderTextFitObserver() {
  if (nodeSettingsHeaderTextResizeObserver || !window.ResizeObserver) {
    return;
  }
  const settingsActions = document.querySelector(".node-settings-actions");
  if (!settingsActions) {
    return;
  }
  nodeSettingsHeaderTextResizeObserver = new ResizeObserver(scheduleNodeSettingsHeaderTextFit);
  nodeSettingsHeaderTextResizeObserver.observe(settingsActions);
}

function installNodeLiveToggleTextFitObserver() {
  if (nodeLiveToggleTextResizeObserver || !window.ResizeObserver) {
    return;
  }
  const palette = document.querySelector(".node-live-toggle-palette");
  if (!palette) {
    return;
  }
  nodeLiveToggleTextResizeObserver = new ResizeObserver(scheduleNodeLiveToggleTextFit);
  nodeLiveToggleTextResizeObserver.observe(palette);
  for (const button of palette.querySelectorAll(".node-live-toggle")) {
    nodeLiveToggleTextResizeObserver.observe(button);
  }
}

let nodeModularToolbarTextFitFrame = 0;
let nodeModularToolbarTextResizeObserver = null;

function fitNodeModularToolbarText() {
  nodeModularToolbarTextFitFrame = 0;
  const toolbar = document.querySelector(".node-view-toolbar");
  if (!toolbar) {
    return;
  }
  const context = nodeSettingsHeaderTextMeasureContext();
  if (!context) {
    return;
  }
  const spans = toolbar.querySelectorAll([
    ".node-view-tabs > .node-toolbar-stack-label > span",
    ".node-view-tabs > .node-modular-view-icon",
    ".node-view-tabs > button > .node-modular-view-icon",
    ".node-history-controls > button:not(.node-room-dimmer-button) > span",
    ".node-history-controls > #nodeUndoButton",
    ".node-history-controls > #nodeRedoButton",
    ".node-history-controls > #nodeVisibilityMenuButton",
    ".node-world-position-readout > span",
    ".node-modular-view-size-readout > span",
    ".node-selection-count-readout > span",
  ].join(", "));
  for (const span of spans) {
    span.style.fontSize = "1px";
  }
  for (const span of spans) {
    const maxSize = Math.max(0, Math.min(span.clientWidth, span.clientHeight) - 1);
    if (maxSize <= 0) {
      span.style.fontSize = "0px";
      continue;
    }
    let low = 0;
    let high = maxSize;
    for (let i = 0; i < 12; ++i) {
      const mid = (low + high) * 0.5;
      if (nodeSettingsHeaderSpanFits(span, mid, context)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    span.style.fontSize = `${Math.max(0, low).toFixed(3)}px`;
  }
}

function scheduleNodeModularToolbarTextFit() {
  if (nodeModularToolbarTextFitFrame) {
    return;
  }
  nodeModularToolbarTextFitFrame = requestAnimationFrame(fitNodeModularToolbarText);
}

function installNodeModularToolbarTextFitObserver() {
  if (nodeModularToolbarTextResizeObserver || !window.ResizeObserver) {
    return;
  }
  const toolbar = document.querySelector(".node-view-toolbar");
  if (!toolbar) {
    return;
  }
  nodeModularToolbarTextResizeObserver = new ResizeObserver(scheduleNodeModularToolbarTextFit);
  nodeModularToolbarTextResizeObserver.observe(toolbar);
  scheduleNodeModularToolbarTextFit();
}
