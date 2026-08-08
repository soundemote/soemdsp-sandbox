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
  const labelRows = s.labels.map((label, i) => `
    <label class="node-trace-display-line-burn-row" data-macro-face-label-row>
      <span>M${i + 1}</span>
      <input type="text" maxlength="12" data-macro-face-label="${i}" value="${String(label).replace(/"/g, "&quot;")}" aria-label="Macro ${i + 1} name">
    </label>`).join("");
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
      <div class="metadata-section-title" style="margin-top:0.75rem">Names</div>
      ${labelRows}
    </div>`;
}

function bindNodeGraphMacroControlsFaceDisplaySettingsBody(host) {
  if (!host || host.dataset.macroFaceBound === "true") {
    return;
  }
  host.dataset.macroFaceBound = "true";
  const readForm = () => {
    const next = { ...nodeGraphMacroControlsFaceSettings() };
    for (const input of host.querySelectorAll("[data-macro-face-color]")) {
      const key = input.getAttribute("data-macro-face-color");
      if (key && input.value) next[key] = input.value;
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
  host.addEventListener("input", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches("[data-macro-face-color], [data-macro-face-label]")) {
      setNodeGraphMacroControlsFaceSettings(readForm(), { persist: false });
    }
  });
  host.addEventListener("change", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches("[data-macro-face-color], [data-macro-face-label]")) {
      commit();
    }
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
