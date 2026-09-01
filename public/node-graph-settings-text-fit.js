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
  // Do not blank labels to 0/1px before measuring. Pause/Live label swaps
  // retrigger this via ResizeObserver; zeroing fontSize made Input/Output look
  // grey/empty until a later layout pass restored text (often seconds later).
  for (const span of spans) {
    const maxSize = Math.max(0, span.clientHeight - 1);
    if (maxSize <= 0 || textScale <= 0) {
      // Keep the previous size until the button has a real content box.
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
    const next = Math.max(1, low * textScale);
    span.style.fontSize = `${next.toFixed(3)}px`;
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

function nodeModularToolbarFitBox(el) {
  const cell = el.closest("button, a, .node-world-position-readout, .node-modular-view-size-readout, .node-selection-count-readout")
    || el;
  const styles = getComputedStyle(cell);
  const padX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
  const padY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  return {
    width: Math.max(0, cell.clientWidth - padX),
    height: Math.max(0, cell.clientHeight - padY),
  };
}

function nodeModularToolbarStackLineBudget(el, boxHeight) {
  const parent = el.parentElement;
  if (!parent) {
    return boxHeight;
  }
  const stacked = parent.classList.contains("node-toolbar-stack-label")
    || parent.classList.contains("node-selection-count-readout")
    || parent.classList.contains("node-world-position-readout")
    || parent.classList.contains("node-modular-view-size-readout");
  if (!stacked) {
    return boxHeight;
  }
  const lines = Math.max(1, parent.querySelectorAll(":scope > span").length || parent.children.length);
  const gap = Number.parseFloat(getComputedStyle(parent).columnGap || getComputedStyle(parent).gap) || 0;
  return Math.max(0, (boxHeight - gap * (lines - 1)) / lines);
}

function nodeModularToolbarGlyphFits(el, fontSize, context, box) {
  const text = el.textContent || "";
  if (!text) {
    return true;
  }
  const width = Math.max(0, box.width - 1);
  const height = Math.max(0, box.height - 1);
  if (width <= 0 || height <= 0) {
    return false;
  }
  const styles = getComputedStyle(el);
  context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
  const lineHeight = nodeModularToolbarStackLineBudget(el, height);
  return context.measureText(text).width <= width && fontSize <= lineHeight;
}

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
  toolbar.querySelectorAll(
    "#nodeUndoButton, #nodeRedoButton, #nodeDonateFiveButton, #nodeDonateFiveButton > span, #nodeDownloadFiftyButton > span, #seDebugButton, #seDebugButton .se-badge",
  ).forEach((el) => {
    el.style.removeProperty("font-size");
  });
  const spans = toolbar.querySelectorAll([
    ".node-view-tabs > .node-toolbar-stack-label > span",
    ".node-view-tabs > button > .node-modular-view-icon",
    ".node-history-controls > button:not(.node-room-dimmer-button):not(#nodeUndoButton):not(#nodeRedoButton):not(#nodeDonateFiveButton):not(#seDebugButton) > span",
    ".node-world-position-readout > span",
    ".node-modular-view-size-readout > span",
    ".node-selection-count-readout > span",
  ].join(", "));
  const floorPx = 11;
  for (const span of spans) {
    const box = nodeModularToolbarFitBox(span);
    const isIcon = span.classList.contains("node-modular-view-icon");
    const minPx = isIcon ? 16 : floorPx;
    const lineBudget = nodeModularToolbarStackLineBudget(span, box.height);
    const maxCap = isIcon
      ? Math.min(box.width, box.height)
      : Math.min(box.width, lineBudget);
    if (maxCap < minPx) {
      span.style.fontSize = `${minPx}px`;
      continue;
    }
    let low = minPx;
    let high = maxCap;
    for (let i = 0; i < 12; ++i) {
      const mid = (low + high) * 0.5;
      if (nodeModularToolbarGlyphFits(span, mid, context, box)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    span.style.fontSize = `${Math.max(minPx, low).toFixed(3)}px`;
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

let nodeModuleTitleTextFitFrame = 0;
let nodeModuleTitleTextResizeObserver = null;

function nodeGraphModuleTitleFitTextOf(el) {
  return el.tagName === "INPUT" ? (el.value || "") : (el.textContent || "");
}

function nodeGraphModuleTitleFits(el, text, fontSize, context, width, height) {
  const styles = getComputedStyle(el);
  context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
  return context.measureText(text).width <= width && fontSize <= height;
}

function fitNodeGraphModuleTitleText() {
  nodeModuleTitleTextFitFrame = 0;
  const context = nodeSettingsHeaderTextMeasureContext();
  if (!context) {
    return;
  }
  const titles = document.querySelectorAll([
    ".node-graph-workspace .dsp-node .node-header-title",
    ".node-module-store-list .scene-context-store-card strong",
  ].join(", "));
  const minPx = 8;
  for (const el of titles) {
    el.style.fontSize = "";
  }
  for (const el of titles) {
    const text = nodeGraphModuleTitleFitTextOf(el);
    const width = Math.max(0, el.clientWidth - 1);
    const height = Math.max(0, el.clientHeight - 1);
    if (!text || width <= 0 || height <= 0) {
      continue;
    }
    const cssMax = Number.parseFloat(getComputedStyle(el).fontSize) || height;
    const maxPx = Math.max(minPx, Math.min(height, cssMax));
    if (nodeGraphModuleTitleFits(el, text, maxPx, context, width, height)) {
      el.style.fontSize = `${maxPx.toFixed(3)}px`;
      continue;
    }
    let low = minPx;
    let high = maxPx;
    for (let i = 0; i < 12; i += 1) {
      const mid = (low + high) * 0.5;
      if (nodeGraphModuleTitleFits(el, text, mid, context, width, height)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    el.style.fontSize = `${Math.max(minPx, low).toFixed(3)}px`;
  }
}

function scheduleNodeGraphModuleTitleTextFit() {
  if (nodeModuleTitleTextFitFrame) {
    return;
  }
  nodeModuleTitleTextFitFrame = requestAnimationFrame(fitNodeGraphModuleTitleText);
}

function installNodeGraphModuleTitleTextFitObserver() {
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  if (!nodeModuleTitleTextResizeObserver) {
    nodeModuleTitleTextResizeObserver = new ResizeObserver(scheduleNodeGraphModuleTitleTextFit);
    window.addEventListener("resize", scheduleNodeGraphModuleTitleTextFit);
  }
  document.querySelectorAll([
    "#nodeGraphWorkspace",
    ".node-header-title-row",
    ".node-module-store-list",
    "#nodeModuleShopView",
  ].join(", ")).forEach((el) => {
    nodeModuleTitleTextResizeObserver.observe(el);
  });
  scheduleNodeGraphModuleTitleTextFit();
}
