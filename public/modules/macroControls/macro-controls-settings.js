// Macro Controls face appearance — shared by the module and the floating
// keyboard dock (global look: one bank of 8 knobs).
//
// Display Settings: right-click the macro panel → background, arc fill,
// arc track (unfilled ring), and 8 control names.

const nodeGraphMacroControlsFaceDefaults = Object.freeze({
  background: "#000000",
  // Filled portion of the arc (value).
  arcFill: "#f1b84b",
  // Unfilled ring / “slider area” behind the value.
  arcTrack: "#3a3428",
  labels: Object.freeze(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]),
  // Look used to live in UIDEV. One face object is the SSOT.
  arcThickness: 7,
  arcGapBrightness: 0,
  sizeScale: 1,
  knobSpacing: 4,
  labelPosition: "top",
  valuePosition: "mid",
  rotationDegrees: 264,
  showLabels: true,
  showValues: true,
});

function nodeGraphMacroControlsDefaultLabels() {
  return nodeGraphMacroControlsFaceDefaults.labels.map((label) => label);
}

function normalizeNodeGraphMacroControlLabel(value, index = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return `M${Math.max(0, Math.min(7, index)) + 1}`;
  }
  return raw.slice(0, 12);
}

function normalizeNodeGraphMacroControlsFaceSettings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const parseColor = (value, fallback) => {
    const text = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text) || /^#[0-9a-fA-F]{3}$/.test(text)) {
      return text.length === 4
        ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
        : text;
    }
    if (/^rgba?\(/i.test(text) || /^hsla?\(/i.test(text)) {
      return text;
    }
    return fallback;
  };
  const labelsIn = Array.isArray(source.labels) ? source.labels : [];
  const labels = [];
  for (let i = 0; i < 8; i += 1) {
    labels.push(normalizeNodeGraphMacroControlLabel(labelsIn[i], i));
  }
  return {
    background: parseColor(source.background, nodeGraphMacroControlsFaceDefaults.background),
    arcFill: parseColor(source.arcFill, nodeGraphMacroControlsFaceDefaults.arcFill),
    arcTrack: parseColor(source.arcTrack, nodeGraphMacroControlsFaceDefaults.arcTrack),
    labels,
    arcThickness: typeof normalizeNodeGraphMacroKnobArcThickness === "function"
      ? normalizeNodeGraphMacroKnobArcThickness(
        source.arcThickness ?? source.macroKnobArcThickness ?? nodeGraphMvp?.macroKnobArcThickness,
      )
      : Number(source.arcThickness) || nodeGraphMacroControlsFaceDefaults.arcThickness,
    arcGapBrightness: typeof normalizeNodeGraphMacroKnobArcGapBrightness === "function"
      ? normalizeNodeGraphMacroKnobArcGapBrightness(
        source.arcGapBrightness ?? source.macroKnobArcGapBrightness ?? nodeGraphMvp?.macroKnobArcGapBrightness,
      )
      : Number(source.arcGapBrightness) || 0,
    sizeScale: typeof normalizeNodeGraphMacroKnobSizeScale === "function"
      ? normalizeNodeGraphMacroKnobSizeScale(
        source.sizeScale ?? source.macroKnobSizeScale ?? nodeGraphMvp?.macroKnobSizeScale,
      )
      : Number(source.sizeScale) || 1,
    knobSpacing: (() => {
      const n = Number(source.knobSpacing ?? source.spacing);
      return Number.isFinite(n) ? Math.max(0, Math.min(32, Math.round(n))) : 4;
    })(),
    labelPosition: typeof normalizeNodeGraphMacroKnobLabelPosition === "function"
      ? normalizeNodeGraphMacroKnobLabelPosition(
        source.labelPosition ?? source.macroKnobLabelPosition ?? nodeGraphMvp?.macroKnobLabelPosition,
      )
      : (source.labelPosition || "top"),
    valuePosition: typeof normalizeNodeGraphMacroKnobValuePosition === "function"
      ? normalizeNodeGraphMacroKnobValuePosition(
        source.valuePosition ?? source.macroKnobValuePosition ?? nodeGraphMvp?.macroKnobValuePosition,
      )
      : (source.valuePosition || "mid"),
    rotationDegrees: (() => {
      const n = Number(source.rotationDegrees);
      return Number.isFinite(n)
        ? Math.max(0, Math.min(1440, n))
        : nodeGraphMacroControlsFaceDefaults.rotationDegrees;
    })(),
    showLabels: source.showLabels !== false,
    showValues: source.showValues !== false,
  };
}

function nodeGraphMacroControlsFaceSettings() {
  if (typeof nodeGraphMvp === "undefined" || !nodeGraphMvp) {
    return normalizeNodeGraphMacroControlsFaceSettings();
  }
  return normalizeNodeGraphMacroControlsFaceSettings(nodeGraphMvp.macroControlsFace);
}

function setNodeGraphMacroControlsFaceSettings(next, options = {}) {
  if (typeof nodeGraphMvp === "undefined" || !nodeGraphMvp) {
    return;
  }
  nodeGraphMvp.macroControlsFace = normalizeNodeGraphMacroControlsFaceSettings(next);
  applyNodeGraphMacroControlsFaceSettings();
  if (options.persist !== false
    && typeof serializeNodeUiDevSettings === "function"
    && typeof saveNodeUiDevLocalDefaultSettings === "function") {
    saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  }
}

function applyNodeGraphMacroControlsLook(settings) {
  const s = settings || nodeGraphMacroControlsFaceSettings();
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    nodeGraphMvp.macroKnobArcThickness = s.arcThickness;
    nodeGraphMvp.macroKnobArcGapBrightness = s.arcGapBrightness;
    nodeGraphMvp.macroKnobSizeScale = s.sizeScale;
    nodeGraphMvp.macroKnobLabelPosition = s.labelPosition;
    nodeGraphMvp.macroKnobValuePosition = s.valuePosition;
  }
  if (typeof applyNodeGraphMacroKnobArcThickness === "function") {
    applyNodeGraphMacroKnobArcThickness();
  }
  if (typeof applyNodeGraphMacroKnobArcGapBrightness === "function") {
    applyNodeGraphMacroKnobArcGapBrightness();
  }
  if (typeof applyNodeGraphMacroKnobSizeScale === "function") {
    applyNodeGraphMacroKnobSizeScale();
  }
  if (typeof applyNodeGraphMacroKnobLabelPosition === "function") {
    applyNodeGraphMacroKnobLabelPosition();
  }
  if (typeof applyNodeGraphMacroKnobValuePosition === "function") {
    applyNodeGraphMacroKnobValuePosition();
  }
  const root = document.documentElement;
  if (root?.style) {
    const span = Number(s.rotationDegrees) || nodeGraphMacroControlsFaceDefaults.rotationDegrees;
    root.style.setProperty("--macro-arc-start-deg", `${-span * 0.5}deg`);
    root.style.setProperty("--macro-arc-span-deg", `${span}deg`);
    const gap = Number.isFinite(Number(s.knobSpacing)) ? Math.max(0, Math.min(32, Number(s.knobSpacing))) : 4;
    root.style.setProperty("--macro-knob-gap", `${gap}px`);
  }
  document.querySelectorAll(".node-macro-controls-panel, [data-macro-controls-display]").forEach((panel) => {
    panel.classList.toggle("macro-labels-hidden", s.showLabels === false);
    panel.classList.toggle("macro-values-hidden", s.showValues === false);
  });
}

function applyNodeGraphMacroControlsFaceSettings() {
  const settings = nodeGraphMacroControlsFaceSettings();
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    nodeGraphMvp.macroControlsFace = settings;
  }
  const root = document.documentElement;
  if (root?.style) {
    root.style.setProperty("--macro-controls-bg", settings.background);
    root.style.setProperty("--macro-arc-fill", settings.arcFill);
    root.style.setProperty("--macro-arc-track", settings.arcTrack);
  }
  document.querySelectorAll("[data-macro-index]").forEach((knob) => {
    const index = Math.max(0, Math.min(7, Math.round(Number(knob.dataset.macroIndex) || 0)));
    const name = settings.labels[index] || `M${index + 1}`;
    // Title sits above the dial (shared layout).
    const nameEl = knob.querySelector(
      ":scope > .node-macro-knob-label, :scope > [data-macro-knob-label], :scope > span:not(.node-macro-knob-dial)",
    );
    if (nameEl && !nameEl.dataset.macroValue) {
      nameEl.textContent = name;
    }
    knob.setAttribute("aria-label", name);
    knob.dataset.macroLabel = name;
  });
  applyNodeGraphMacroControlsLook(settings);
}

function buildNodeGraphMacroControlsFaceDisplaySettingsBodyHtml() {
  const s = nodeGraphMacroControlsFaceSettings();
  const toHex = (c, fallback) => {
    const t = String(c || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
    if (/^#[0-9a-fA-F]{3}$/.test(t)) {
      return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
    }
    return fallback;
  };
  const bg = toHex(s.background, "#000000");
  const fill = toHex(s.arcFill, "#f1b84b");
  const track = toHex(s.arcTrack, "#3a3428");
  const posOpts = (current) => ["top", "mid", "bottom"].map((value) =>
    `<option value="${value}"${current === value ? " selected" : ""}>${value}</option>`).join("");
  const labelRows = s.labels.map((label, i) => `
    <label class="node-trace-display-line-burn-row" data-macro-face-label-row>
      <span>M${i + 1}</span>
      <input type="text" maxlength="12" data-macro-face-label="${i}" value="${String(label).replace(/"/g, "&quot;")}" aria-label="Macro ${i + 1} name">
    </label>`).join("");
  const thicknessMax = typeof nodeGraphMacroKnobArcThicknessMaxPx === "number"
    ? nodeGraphMacroKnobArcThicknessMaxPx
    : 21;
  return `
    <div class="metadata-field-section" data-macro-face-settings>
      <div class="metadata-section-title">Appearance</div>
      <label class="node-trace-display-line-burn-row">
        <span>Background</span>
        <input type="color" data-macro-face-color="background" value="${bg}" aria-label="Macro panel background">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Arc fill</span>
        <input type="color" data-macro-face-color="arcFill" value="${fill}" aria-label="Macro arc value fill">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Arc track</span>
        <input type="color" data-macro-face-color="arcTrack" value="${track}" aria-label="Macro arc unfilled track">
      </label>
      <div class="node-trace-display-line-burn-row">
        <span>Label</span>
        <span class="metadata-parameter-picker-controls">
          <select data-macro-face-select="labelPosition" aria-label="Macro label position">${posOpts(s.labelPosition)}</select>
          <span class="metadata-parameter-visibility-stepper" role="group" aria-label="Hide or show labels">
            <button type="button" data-macro-face-visibility="showLabels" data-macro-face-visibility-on="false" title="Hide labels" aria-pressed="${s.showLabels ? "false" : "true"}">-</button>
            <button type="button" data-macro-face-visibility="showLabels" data-macro-face-visibility-on="true" title="Show labels" aria-pressed="${s.showLabels ? "true" : "false"}">+</button>
          </span>
        </span>
      </div>
      <div class="node-trace-display-line-burn-row">
        <span>Value</span>
        <span class="metadata-parameter-picker-controls">
          <select data-macro-face-select="valuePosition" aria-label="Macro value position">${posOpts(s.valuePosition)}</select>
          <span class="metadata-parameter-visibility-stepper" role="group" aria-label="Hide or show values">
            <button type="button" data-macro-face-visibility="showValues" data-macro-face-visibility-on="false" title="Hide values" aria-pressed="${s.showValues ? "false" : "true"}">-</button>
            <button type="button" data-macro-face-visibility="showValues" data-macro-face-visibility-on="true" title="Show values" aria-pressed="${s.showValues ? "true" : "false"}">+</button>
          </span>
        </span>
      </div>
      <label class="node-trace-display-line-burn-row">
        <span>Knob size</span>
        <input type="range" min="0.25" max="4" step="0.05" data-macro-face-num="sizeScale" value="${s.sizeScale}" aria-label="Macro knob size">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Knob spacing</span>
        <input type="range" min="0" max="32" step="1" data-macro-face-num="knobSpacing" value="${s.knobSpacing}" aria-label="Space between macro knobs">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Arc span</span>
        <input type="range" min="0" max="1440" step="1" data-macro-face-num="rotationDegrees" value="${s.rotationDegrees}" aria-label="Macro arc span">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Arc thickness</span>
        <input type="range" min="1" max="${thicknessMax}" step="0.5" data-macro-face-num="arcThickness" value="${s.arcThickness}" aria-label="Macro arc thickness">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Arc gap</span>
        <input type="range" min="0" max="100" step="1" data-macro-face-num="arcGapBrightness" value="${s.arcGapBrightness}" aria-label="Macro arc gap brightness">
      </label>
      <div class="metadata-section-title" style="margin-top:0.75rem">Names</div>
      ${labelRows}
    </div>`;
}

function bindNodeGraphMacroControlsFaceDisplaySettingsBody(host) {
  if (!host || host.dataset.macroFaceBound === "true") {
    return;
  }
  host.dataset.macroFaceBound = "true";
  const lookSelector = [
    "[data-macro-face-color]",
    "[data-macro-face-label]",
    "[data-macro-face-num]",
    "[data-macro-face-select]",
    "[data-macro-face-toggle]",
  ].join(", ");
  const readForm = () => {
    const next = { ...nodeGraphMacroControlsFaceSettings() };
    for (const input of host.querySelectorAll("[data-macro-face-color]")) {
      const key = input.getAttribute("data-macro-face-color");
      if (key && input.value) next[key] = input.value;
    }
    for (const input of host.querySelectorAll("[data-macro-face-num]")) {
      const key = input.getAttribute("data-macro-face-num");
      if (key) next[key] = Number(input.value);
    }
    for (const input of host.querySelectorAll("[data-macro-face-select]")) {
      const key = input.getAttribute("data-macro-face-select");
      if (key) next[key] = input.value;
    }
    for (const input of host.querySelectorAll("[data-macro-face-toggle]")) {
      const key = input.getAttribute("data-macro-face-toggle");
      if (key) next[key] = Boolean(input.checked);
    }
    const labels = [];
    for (let i = 0; i < 8; i += 1) {
      const input = host.querySelector(`[data-macro-face-label="${i}"]`);
      labels.push(input?.value ?? `M${i + 1}`);
    }
    next.labels = labels;
    return next;
  };
  const commit = () => {
    setNodeGraphMacroControlsFaceSettings(readForm(), { persist: true });
  };
  const syncVisibilityButtons = (settings) => {
    const s = settings || nodeGraphMacroControlsFaceSettings();
    for (const btn of host.querySelectorAll("[data-macro-face-visibility]")) {
      const key = btn.getAttribute("data-macro-face-visibility");
      const on = btn.getAttribute("data-macro-face-visibility-on") === "true";
      btn.setAttribute("aria-pressed", s[key] === on ? "true" : "false");
    }
  };
  host.addEventListener("input", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches(lookSelector)) {
      setNodeGraphMacroControlsFaceSettings(readForm(), { persist: false });
    }
  });
  host.addEventListener("change", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches(lookSelector)) {
      commit();
    }
  });
  host.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("[data-macro-face-visibility]");
    if (!btn || !host.contains(btn)) {
      return;
    }
    event.preventDefault();
    const key = btn.getAttribute("data-macro-face-visibility");
    if (!key) {
      return;
    }
    const on = btn.getAttribute("data-macro-face-visibility-on") === "true";
    const next = { ...nodeGraphMacroControlsFaceSettings(), [key]: on };
    setNodeGraphMacroControlsFaceSettings(next, { persist: true });
    syncVisibilityButtons(next);
  });
}

function openNodeGraphMacroControlsDisplaySettings(event = {}) {
  if (event?.preventDefault) {
    event.preventDefault();
    event.stopPropagation();
  }
  // Prefer a placed macroControls node so the shared inspector path works;
  // otherwise open with a synthetic target for the dock / global bank.
  let nodeId = "";
  if (typeof nodeGraphMvp?.patch?.nodes === "object") {
    const placed = nodeGraphMvp.patch.nodes.find((n) => n?.type === "macroControls");
    if (placed?.id) nodeId = String(placed.id);
  }
  if (!nodeId) {
    // Synthetic id so the display popover can open without a graph node.
    nodeId = "__macroControlsFace";
  }

  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover
    && !existingPopover.hidden
    && nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings"
    && (
      nodeGraphMvp.traceDisplaySettingsTargetNode === nodeId
      || existingPopover.dataset.displaySettingsType === "macroControlsFace"
    )
    && existingPopover.dataset.inspectorBlank !== "true"
  ) {
    if (typeof pulseNodeGraphFloatingWindowAttention === "function") {
      pulseNodeGraphFloatingWindowAttention(existingPopover);
    }
    return true;
  }

  if (typeof commitOpenNodeGraphTraceDisplaySettings === "function") {
    commitOpenNodeGraphTraceDisplaySettings();
  }
  if (typeof prepareNodeMetadataPopoverForInspectorReplacement === "function") {
    prepareNodeMetadataPopoverForInspectorReplacement();
  }
  if (typeof prepareNodeModuleActionsWindowForInspectorReplacement === "function") {
    prepareNodeModuleActionsWindowForInspectorReplacement();
  }

  const popover = typeof nodeGraphTraceDisplaySettingsElement === "function"
    ? nodeGraphTraceDisplaySettingsElement()
    : document.getElementById("nodeTraceDisplaySettingsPopover");
  if (!popover) {
    return false;
  }
  if (typeof bindNodeGraphTraceDisplaySettingsEvents === "function") {
    bindNodeGraphTraceDisplaySettingsEvents(popover);
  }
  nodeGraphMvp.traceDisplaySettingsTargetNode = nodeId;
  nodeGraphMvp.sharedInspectorActive = "traceDisplaySettings";
  if (typeof setNodeGraphTraceDisplaySettingsHeader === "function") {
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Macro Controls");
  }
  // Force body remount as macroControlsFace.
  popover.dataset.displaySettingsBodyType = "";
  popover.dataset.displaySettingsType = "macroControlsFace";
  popover.dataset.displaySettingsTargetNode = nodeId;
  if (typeof mountNodeGraphDisplaySettingsBody === "function") {
    mountNodeGraphDisplaySettingsBody(popover, "macroControlsFace", null);
  }
  if (typeof setNodeGraphTraceDisplaySettingsBlankState === "function") {
    setNodeGraphTraceDisplaySettingsBlankState(false);
  }
  if (typeof setNodeGraphTraceDisplayModeSelectorVisible === "function") {
    setNodeGraphTraceDisplayModeSelectorVisible(popover, false);
  }
  const sharedInspectorState = typeof normalizeNodeGraphSharedInspectorWindowState === "function"
    ? normalizeNodeGraphSharedInspectorWindowState(nodeGraphMvp.sharedInspectorWindowState, nodeGraphMvp.workspaceWindowStates)
    : (nodeGraphMvp.sharedInspectorWindowState || {});
  if (typeof applyNodeGraphTraceDisplaySettingsWindowSize === "function") {
    applyNodeGraphTraceDisplaySettingsWindowSize(sharedInspectorState.size);
  }
  popover.hidden = false;
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("traceDisplaySettings", popover);
  }
  return true;
}

function bindNodeGraphMacroControlsDisplayContextMenu() {
  if (document.body.dataset.macroFaceContextBound === "true") {
    return;
  }
  document.body.dataset.macroFaceContextBound = "true";
  document.addEventListener("contextmenu", (event) => {
    const panel = event.target?.closest?.(".node-macro-controls-panel, [data-macro-controls-display]");
    if (!panel) {
      return;
    }
    // Don't steal knobs' future menus; whole panel including knobs opens face settings.
    openNodeGraphMacroControlsDisplaySettings(event);
  }, true);
}

// Apply on load once DOM is ready enough.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyNodeGraphMacroControlsFaceSettings();
      bindNodeGraphMacroControlsDisplayContextMenu();
    });
  } else {
    applyNodeGraphMacroControlsFaceSettings();
    bindNodeGraphMacroControlsDisplayContextMenu();
  }
}
