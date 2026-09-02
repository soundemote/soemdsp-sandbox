// Shared MIDI keyboard layout (dock + module). White/black key sizes in
// pixels / percent. Piano width = whiteCount × whiteKeyWidth, centered,
// and scaled down if it would overflow the host (never clips).

const nodeGraphMidiKeyboardKeyLabelModes = Object.freeze(["off", "name", "number"]);

const nodeGraphMidiKeyboardLayoutDefaults = Object.freeze({
  whiteKeyWidth: 16,
  blackKeyWidth: 10,
  blackKeyHeight: 62,
  keyboardHeight: 112,
  keyLabels: "name",
});

function normalizeNodeGraphMidiKeyboardKeyLabels(value) {
  return nodeGraphMidiKeyboardKeyLabelModes.includes(value)
    ? value
    : nodeGraphMidiKeyboardLayoutDefaults.keyLabels;
}

function normalizeNodeGraphMidiKeyboardLayout(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  return {
    whiteKeyWidth: clamp(source.whiteKeyWidth, 6, 40, nodeGraphMidiKeyboardLayoutDefaults.whiteKeyWidth),
    blackKeyWidth: clamp(source.blackKeyWidth, 4, 28, nodeGraphMidiKeyboardLayoutDefaults.blackKeyWidth),
    blackKeyHeight: clamp(source.blackKeyHeight, 28, 82, nodeGraphMidiKeyboardLayoutDefaults.blackKeyHeight),
    keyboardHeight: clamp(source.keyboardHeight, 48, 220, nodeGraphMidiKeyboardLayoutDefaults.keyboardHeight),
    keyLabels: normalizeNodeGraphMidiKeyboardKeyLabels(source.keyLabels),
  };
}

function nodeGraphMidiKeyboardLayoutSettings() {
  return normalizeNodeGraphMidiKeyboardLayout(
    typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.midiKeyboardLayout : null,
  );
}

function setNodeGraphMidiKeyboardLayout(next, options = {}) {
  if (typeof nodeGraphMvp === "undefined" || !nodeGraphMvp) {
    return;
  }
  nodeGraphMvp.midiKeyboardLayout = normalizeNodeGraphMidiKeyboardLayout(next);
  applyNodeGraphMidiKeyboardLayout();
  if (options.persist !== false && typeof saveNodeGraphMidiKeyboardMemory === "function") {
    saveNodeGraphMidiKeyboardMemory();
  }
}

function nodeGraphMidiKeyboardLayoutHostWidth(surface) {
  const dock = surface?.closest?.(".node-standalone-midi-keyboard-dock");
  if (dock) {
    const body = dock.querySelector(".node-standalone-midi-keyboard-body") || dock;
    const wheel = Number.parseFloat(getComputedStyle(dock).getPropertyValue("--midi-keyboard-wheel-width")) || 64;
    return Math.max(0, (body.clientWidth || 0) - wheel);
  }
  const module = surface?.closest?.(".dsp-node, .node-midi-keyboard-module");
  if (module) {
    return Math.max(0, module.clientWidth || 0);
  }
  return Math.max(0, surface?.parentElement?.clientWidth || 0);
}

let nodeGraphMidiKeyboardLayoutApplying = false;

function applyNodeGraphMidiKeyboardLayout(settings = null) {
  if (nodeGraphMidiKeyboardLayoutApplying) {
    return;
  }
  nodeGraphMidiKeyboardLayoutApplying = true;
  try {
    applyNodeGraphMidiKeyboardLayoutBody(settings);
  } finally {
    nodeGraphMidiKeyboardLayoutApplying = false;
  }
}

/** Black keys must leave a white-key front lip — never meet the bottom wall. */
function nodeGraphMidiKeyboardBlackKeyHeightPx(surfaceHeight, blackHeightPercent) {
  const h = Math.max(0, Number(surfaceHeight) || 0);
  if (h <= 0) {
    return 0;
  }
  const pct = Math.max(28, Math.min(82, Number(blackHeightPercent) || 62));
  const lip = Math.max(12, Math.round(h * 0.24));
  const desired = h * (pct / 100);
  return Math.max(6, Math.min(desired, h - lip));
}

function applyNodeGraphMidiKeyboardLayoutBody(settings = null) {
  const s = settings || nodeGraphMidiKeyboardLayoutSettings();
  if (typeof nodeGraphMvp !== "undefined" && nodeGraphMvp) {
    nodeGraphMvp.midiKeyboardLayout = s;
  }
  const generated = typeof nodeGraphMidiKeyboardGenerateKeys === "function"
    ? nodeGraphMidiKeyboardGenerateKeys()
    : { blackKeys: [], totalWhite: 0 };
  const totalWhite = generated.totalWhite || 0;
  const blackByIndex = new Map((generated.blackKeys || []).map((key) => [key.index, key]));
  let needsSecondPass = false;
  document.querySelectorAll(".node-midi-keyboard-module .node-midi-keyboard-surface").forEach((surface) => {
    const available = nodeGraphMidiKeyboardLayoutHostWidth(surface);
    const desired = totalWhite * s.whiteKeyWidth;
    const scale = desired > 0 && available > 0 ? Math.min(1, available / desired) : 1;
    const whiteW = Math.max(1, s.whiteKeyWidth * scale);
    const blackW = Math.max(1, Math.min(s.blackKeyWidth, whiteW));
    const pianoW = Math.max(0, totalWhite * whiteW);
    surface.style.width = `${pianoW}px`;
    surface.style.maxWidth = "100%";
    surface.dataset.keyLabels = s.keyLabels;
    surface.style.setProperty("--midi-white-key-width", `${whiteW}px`);
    surface.style.setProperty("--midi-black-key-width", `${blackW}px`);
    const docked = Boolean(surface.closest(".node-standalone-midi-keyboard-dock"));
    if (docked) {
      surface.style.removeProperty("--midi-keyboard-piano-height");
      surface.style.height = "100%";
      surface.style.minHeight = "0";
      surface.style.maxHeight = "100%";
      // Keep natural piano width (whiteCount × key width) and center in the
      // controller row — stretching to 100% packed keys hard left.
    } else {
      // Fit the requested piano height into whatever the module face allows.
      const host = surface.closest(".dsp-node, .node-midi-keyboard-module");
      const hostH = Math.max(0, host?.clientHeight || 0);
      const fittedH = hostH > 0 ? Math.min(s.keyboardHeight, hostH) : s.keyboardHeight;
      surface.style.setProperty("--midi-keyboard-piano-height", `${fittedH}px`);
      surface.style.height = `${fittedH}px`;
      surface.style.minHeight = "0";
      surface.style.maxHeight = "100%";
    }
    const whiteRow = surface.querySelector(".node-midi-keyboard-white-row");
    if (whiteRow) {
      whiteRow.style.gridTemplateColumns = totalWhite > 0
        ? `repeat(${totalWhite}, ${whiteW}px)`
        : "";
    }
    installNodeGraphMidiKeyboardLayoutResizeObserver();
    // Measure after width/height assignment so %→px black keys track the
    // live surface. A 0-height first pass (grid not settled) schedules retry.
    const surfaceH = Math.max(0, surface.clientHeight || 0);
    if (surfaceH < 8) {
      needsSecondPass = true;
    }
    const blackH = nodeGraphMidiKeyboardBlackKeyHeightPx(surfaceH, s.blackKeyHeight);
    surface.style.setProperty("--midi-black-key-height", blackH > 0 ? `${blackH}px` : `${s.blackKeyHeight}%`);
    surface.querySelectorAll(".node-midi-keyboard-black-row [data-key-index]").forEach((span) => {
      const key = blackByIndex.get(Number(span.dataset.keyIndex));
      if (!key) {
        return;
      }
      // Center on the joint after the preceding white key (C# between C and D).
      const left = (Number(key.leftWhiteIndex) + 1) * whiteW - blackW / 2;
      span.style.left = `${left}px`;
      span.style.width = `${blackW}px`;
      if (blackH > 0) {
        span.style.height = `${blackH}px`;
        span.style.maxHeight = `${blackH}px`;
      } else {
        span.style.height = `${s.blackKeyHeight}%`;
        span.style.removeProperty("max-height");
      }
    });
    const module = surface.closest(".node-midi-keyboard-module");
    if (module) {
      module.style.setProperty("--midi-keyboard-piano-width", `${pianoW}px`);
      if (!docked) {
        module.style.setProperty("--midi-keyboard-piano-height", `${s.keyboardHeight}px`);
      } else {
        module.style.removeProperty("--midi-keyboard-piano-height");
      }
    }
    const dock = surface.closest(".node-standalone-midi-keyboard-dock");
    if (dock) {
      dock.style.setProperty("--midi-keyboard-piano-width", `${pianoW}px`);
      dock.style.removeProperty("--midi-keyboard-piano-height");
      dock.style.setProperty("--midi-keyboard-wheel-width", "64px");
    }
  });
  if (typeof renderNodeGraphMidiKeyboardKeyLabels === "function") {
    renderNodeGraphMidiKeyboardKeyLabels();
  }
  if (needsSecondPass && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => applyNodeGraphMidiKeyboardLayout());
    });
  }
}

let nodeGraphMidiKeyboardLayoutResizeObserver = null;

function installNodeGraphMidiKeyboardLayoutResizeObserver() {
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  if (!nodeGraphMidiKeyboardLayoutResizeObserver) {
    nodeGraphMidiKeyboardLayoutResizeObserver = new ResizeObserver(() => {
      applyNodeGraphMidiKeyboardLayout();
    });
    window.addEventListener("resize", () => applyNodeGraphMidiKeyboardLayout());
  }
  document.querySelectorAll(
    ".node-standalone-midi-keyboard-dock, .dsp-node .node-midi-keyboard-module, .node-midi-keyboard-module .node-midi-keyboard-surface",
  ).forEach((el) => {
    nodeGraphMidiKeyboardLayoutResizeObserver.observe(el);
  });
}

function buildNodeGraphKeyboardControllerFaceDisplaySettingsBodyHtml() {
  const s = nodeGraphMidiKeyboardLayoutSettings();
  return `
    <div class="metadata-field-section" data-midi-keyboard-layout-settings>
      <div class="metadata-section-title">Keys</div>
      <label class="node-trace-display-line-burn-row">
        <span>White width</span>
        <input type="range" min="6" max="40" step="1" data-midi-key-layout="whiteKeyWidth" value="${s.whiteKeyWidth}" aria-label="White key width">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Black width</span>
        <input type="range" min="4" max="28" step="1" data-midi-key-layout="blackKeyWidth" value="${s.blackKeyWidth}" aria-label="Black key width">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Black height</span>
        <input type="range" min="28" max="82" step="1" data-midi-key-layout="blackKeyHeight" value="${s.blackKeyHeight}" aria-label="Black key height">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Keyboard height</span>
        <input type="range" min="48" max="220" step="2" data-midi-key-layout="keyboardHeight" value="${s.keyboardHeight}" aria-label="Keyboard height">
      </label>
      <label class="node-trace-display-line-burn-row">
        <span>Labels</span>
        <select data-midi-key-layout="keyLabels" aria-label="Key labels">
          <option value="off"${s.keyLabels === "off" ? " selected" : ""}>Off</option>
          <option value="name"${s.keyLabels === "name" ? " selected" : ""}>MIDI note name</option>
          <option value="number"${s.keyLabels === "number" ? " selected" : ""}>MIDI note number</option>
        </select>
      </label>
    </div>`;
}

function bindNodeGraphKeyboardControllerFaceDisplaySettingsBody(host) {
  if (!host || host.dataset.midiKeyboardLayoutBound === "true") {
    return;
  }
  host.dataset.midiKeyboardLayoutBound = "true";
  const readForm = () => {
    const next = { ...nodeGraphMidiKeyboardLayoutSettings() };
    for (const input of host.querySelectorAll("[data-midi-key-layout]")) {
      const key = input.getAttribute("data-midi-key-layout");
      if (key) {
        next[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
      }
    }
    return next;
  };
  const commit = (persist) => {
    setNodeGraphMidiKeyboardLayout(readForm(), { persist });
  };
  host.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-midi-key-layout]")) {
      commit(false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.matches?.("[data-midi-key-layout]")) {
      commit(true);
    }
  });
}

function openNodeGraphKeyboardControllerDisplaySettings(event = {}) {
  if (event?.preventDefault) {
    event.preventDefault();
    event.stopPropagation();
  }
  let nodeId = "";
  if (typeof nodeGraphMvp?.patch?.nodes === "object") {
    const placed = nodeGraphMvp.patch.nodes.find((n) => n?.type === "keyboardController");
    if (placed?.id) {
      nodeId = String(placed.id);
    }
  }
  if (!nodeId) {
    nodeId = "__keyboardControllerFace";
  }
  const existingPopover = document.getElementById("nodeTraceDisplaySettingsPopover");
  if (
    existingPopover
    && !existingPopover.hidden
    && nodeGraphMvp.sharedInspectorActive === "traceDisplaySettings"
    && (
      nodeGraphMvp.traceDisplaySettingsTargetNode === nodeId
      || existingPopover.dataset.displaySettingsType === "keyboardControllerFace"
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
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "MIDI Keyboard");
  }
  popover.dataset.displaySettingsBodyType = "";
  popover.dataset.displaySettingsType = "keyboardControllerFace";
  popover.dataset.displaySettingsTargetNode = nodeId;
  if (typeof mountNodeGraphDisplaySettingsBody === "function") {
    mountNodeGraphDisplaySettingsBody(popover, "keyboardControllerFace", null);
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

function bindNodeGraphKeyboardControllerDisplayContextMenu() {
  if (document.body.dataset.midiKeyboardFaceContextBound === "true") {
    return;
  }
  document.body.dataset.midiKeyboardFaceContextBound = "true";
  document.addEventListener("contextmenu", (event) => {
    const panel = event.target?.closest?.(".node-midi-keyboard-panel, .node-midi-keyboard-surface");
    if (!panel) {
      return;
    }
    openNodeGraphKeyboardControllerDisplaySettings(event);
  }, true);
}

if (typeof document !== "undefined") {
  const boot = () => {
    applyNodeGraphMidiKeyboardLayout();
    installNodeGraphMidiKeyboardLayoutResizeObserver();
    bindNodeGraphKeyboardControllerDisplayContextMenu();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
