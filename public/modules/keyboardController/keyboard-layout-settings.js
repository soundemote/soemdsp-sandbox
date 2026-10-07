// Keyboard / Grid Keyboard face layout, per module (node.traceDisplaySettings
// over the defaults). White/black key sizes in pixels / percent. Piano width
// = whiteCount × whiteKeyWidth, centered, and scaled down if it would
// overflow the host (never clips).

const nodeGraphMidiKeyboardKeyLabelModes = Object.freeze(["off", "name", "number"]);

const nodeGraphMidiKeyboardLayoutDefaults = Object.freeze({
  whiteKeyWidth: 16,
  blackKeyWidth: 10,
  blackKeyHeight: 62,
  keyboardHeight: 112,
  keyLabels: "name",
  hideKeyboardInfo: true,
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
    hideKeyboardInfo: source.hideKeyboardInfo === false ? false : true,
  };
}

function nodeGraphMidiKeyboardLayoutForSurface(surface) {
  const nodeId = String(surface?.closest?.("[data-node]")?.dataset?.node || "").trim();
  const node = nodeId && typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const bag = node && (node.type === "keyboard" || node.type === "gridKeyboard")
    && node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  return normalizeNodeGraphMidiKeyboardLayout({
    ...nodeGraphMidiKeyboardLayoutDefaults,
    ...bag,
  });
}

function nodeGraphMidiKeyboardLayoutHostWidth(surface) {
  const surfaceW = Math.max(0, surface?.clientWidth || 0);
  if (surfaceW > 0) {
    return surfaceW;
  }
  const whiteRow = surface?.querySelector?.(".node-midi-keyboard-white-row");
  if (whiteRow?.clientWidth > 0) {
    return whiteRow.clientWidth;
  }
  return Math.max(0, surface?.parentElement?.clientWidth || 0);
}

function nodeGraphPositionMidiKeyboardBlackKeys(surface, blackByIndex, totalWhite, blackW, whiteW, blackH, blackKeyHeightPercent, inModuleFace, pads = null) {
  // pads: half-white beds past an edge black key (range starts / ends on black).
  const leadPad = Math.max(0, Number(pads?.leadPad) || 0);
  const trailPad = Math.max(0, Number(pads?.trailPad) || 0);
  const nW = Math.max(1, totalWhite + leadPad + trailPad);
  const widthPct = Math.min(90 / nW, (blackW / Math.max(1, whiteW)) * (100 / nW));
  const halfPct = widthPct * 0.5;
  const widthText = `${widthPct}%`;
  surface.querySelectorAll(".node-midi-keyboard-black-row [data-key-index]").forEach((span) => {
    const key = blackByIndex.get(Number(span.dataset.keyIndex));
    if (!key) {
      return;
    }
    const leftIdx = Number(key.leftWhiteIndex);
    if (!(leftIdx >= 0 || (leftIdx === -1 && leadPad > 0))) {
      if (span.style.display !== "none") {
        span.style.display = "none";
      }
      return;
    }
    let centerPct = ((leftIdx + 1 + leadPad) / nW) * 100;
    centerPct = Math.max(halfPct, Math.min(100 - halfPct, centerPct));
    const leftText = `${centerPct}%`;
    if (span.style.display === "none") {
      span.style.display = "";
    }
    if (span.style.left !== leftText) {
      span.style.left = leftText;
    }
    if (span.style.transform !== "translateX(-50%)") {
      span.style.transform = "translateX(-50%)";
    }
    if (span.style.width !== widthText) {
      span.style.width = widthText;
    }
    if (span.style.marginLeft) {
      span.style.removeProperty("margin-left");
    }
    const heightText = (inModuleFace || !(blackH > 0)) ? `${blackKeyHeightPercent}%` : `${blackH}px`;
    if (span.style.height !== heightText) {
      span.style.height = heightText;
    }
    if (inModuleFace || !(blackH > 0)) {
      if (span.style.maxHeight) {
        span.style.removeProperty("max-height");
      }
    } else if (span.style.maxHeight !== heightText) {
      span.style.maxHeight = heightText;
    }
  });
}

let nodeGraphMidiKeyboardLayoutApplying = false;

function applyNodeGraphMidiKeyboardLayout() {
  if (nodeGraphMidiKeyboardLayoutApplying) {
    return;
  }
  nodeGraphMidiKeyboardLayoutApplying = true;
  try {
    applyNodeGraphMidiKeyboardLayoutBody();
  } finally {
    nodeGraphMidiKeyboardLayoutApplying = false;
  }
}

/** Black keys must leave a white-key front lip — never meet the bottom wall. */
function nodeGraphMidiKeyboardBlackKeyHeightPx(surfaceHeight, blackHeightPercent) {
  const h = Math.max(0, nodeGraphFiniteNumber(surfaceHeight));
  if (h <= 0) {
    return 0;
  }
  const pct = Math.max(28, Math.min(82, nodeGraphFiniteNumber(blackHeightPercent, 62)));
  const lip = Math.max(12, Math.round(h * 0.24));
  const desired = h * (pct / 100);
  return Math.max(6, Math.min(desired, h - lip));
}

function applyNodeGraphMidiKeyboardLayoutBody() {
  let needsSecondPass = false;
  let layoutChanged = false;
  document.querySelectorAll(".node-midi-keyboard-module .node-midi-keyboard-surface").forEach((surface) => {
    // Key geometry from this keyboard's own window (octave + key count).
    const nodeId = String(surface.closest("[data-node]")?.dataset?.node || "").trim();
    const generated = typeof nodeGraphMidiKeyboardGenerateKeys === "function"
      ? nodeGraphMidiKeyboardGenerateKeys(nodeGraphKeyboardViewStartMidiFor(nodeId), nodeGraphKeyboardKeyCountFor(nodeId))
      : { blackKeys: [], totalWhite: 0 };
    const totalWhite = generated.totalWhite || 0;
    const pads = { leadPad: generated.leadPad || 0, trailPad: generated.trailPad || 0 };
    const totalUnits = totalWhite + pads.leadPad + pads.trailPad;
    const blackByIndex = new Map((generated.blackKeys || []).map((key) => [key.index, key]));
    const s = nodeGraphMidiKeyboardLayoutForSurface(surface);
    const available = nodeGraphMidiKeyboardLayoutHostWidth(surface);
    const desired = totalUnits * s.whiteKeyWidth;
    const inModuleFace = Boolean(surface.closest(
      ".dsp-node.keyboard-layout, .node-layout-canvas-tile, .node-screen-solo-stage, .node-metamodule-canvas-stage",
    ));
    const scale = desired > 0 && available > 0
      ? (inModuleFace ? (available / desired) : Math.min(1, available / desired))
      : 1;
    const whiteW = Math.max(1, s.whiteKeyWidth * scale);
    const blackW = Math.max(1, Math.min(s.blackKeyWidth * scale, whiteW * 0.92));
    const pianoW = inModuleFace && available > 0
      ? available
      : Math.max(0, totalUnits * whiteW);
    const surfaceH = Math.max(0, surface.clientHeight || 0);
    const layoutSig = [
      s.whiteKeyWidth,
      s.blackKeyWidth,
      s.blackKeyHeight,
      s.keyboardHeight,
      s.keyLabels,
      s.hideKeyboardInfo ? 1 : 0,
      inModuleFace ? 1 : 0,
      Math.round(available),
      Math.round(surfaceH),
      totalWhite,
      pads.leadPad,
      pads.trailPad,
    ].join(":");
    if (surface.dataset.midiLayoutSig === layoutSig) {
      const blackH = nodeGraphMidiKeyboardBlackKeyHeightPx(surfaceH, s.blackKeyHeight);
      nodeGraphPositionMidiKeyboardBlackKeys(
        surface,
        blackByIndex,
        totalWhite,
        blackW,
        whiteW,
        blackH,
        s.blackKeyHeight,
        inModuleFace,
        pads,
      );
      return;
    }
    if (surfaceH < 8) {
      const tries = Number(surface.dataset.midiLayoutTries || 0);
      if (tries < 2) {
        surface.dataset.midiLayoutTries = String(tries + 1);
        needsSecondPass = true;
      }
    } else {
      delete surface.dataset.midiLayoutTries;
    }
    surface.dataset.midiLayoutSig = layoutSig;
    layoutChanged = true;
    if (inModuleFace) {
      surface.style.width = "100%";
      surface.style.maxWidth = "100%";
    } else {
      surface.style.width = `${pianoW}px`;
      surface.style.maxWidth = "100%";
    }
    surface.dataset.keyLabels = s.keyLabels;
    surface.style.setProperty("--midi-white-key-width", `${whiteW}px`);
    surface.style.setProperty("--midi-black-key-width", `${blackW}px`);
    if (inModuleFace) {
      surface.style.removeProperty("--midi-keyboard-piano-height");
      surface.style.height = "100%";
      surface.style.minHeight = "0";
      surface.style.maxHeight = "100%";
    } else {
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
        ? (inModuleFace ? `repeat(${totalWhite}, minmax(0, 1fr))` : `repeat(${totalWhite}, ${whiteW}px)`)
        : "";
      // Empty half-white bed before / after an edge black key (% of surface width).
      const unitPct = totalUnits > 0 ? 100 / totalUnits : 0;
      whiteRow.style.paddingLeft = pads.leadPad > 0 ? `${pads.leadPad * unitPct}%` : "";
      whiteRow.style.paddingRight = pads.trailPad > 0 ? `${pads.trailPad * unitPct}%` : "";
    }
    // Black keys: geometry from key count only (not DOM measure, not octave).
    // N whites fill 100% width. Black sits on the joint after white[leftWhiteIndex],
    // centered, width ≈ 65% of one white, height = blackKeyHeight % of surface.
    const blackH = nodeGraphMidiKeyboardBlackKeyHeightPx(surfaceH, s.blackKeyHeight);
    surface.style.setProperty(
      "--midi-black-key-height",
      blackH > 0 ? `${blackH}px` : `${s.blackKeyHeight}%`,
    );
    nodeGraphPositionMidiKeyboardBlackKeys(
      surface,
      blackByIndex,
      totalWhite,
      blackW,
      whiteW,
      blackH,
      s.blackKeyHeight,
      inModuleFace,
      pads,
    );
    const module = surface.closest(".node-midi-keyboard-module");
    if (module) {
      module.classList.toggle("show-keyboard-info", s.hideKeyboardInfo === false);
      if (inModuleFace) {
        module.style.setProperty("--midi-keyboard-piano-width", "100%");
        module.style.removeProperty("--midi-keyboard-piano-height");
      } else {
        module.style.setProperty("--midi-keyboard-piano-width", `${pianoW}px`);
        module.style.setProperty("--midi-keyboard-piano-height", `${s.keyboardHeight}px`);
      }
    }
  });
  document.querySelectorAll(".node-grid-keyboard-module").forEach((module) => {
    module.classList.toggle("show-keyboard-info", nodeGraphMidiKeyboardLayoutForSurface(module).hideKeyboardInfo === false);
  });
  if (layoutChanged) {
    installNodeGraphMidiKeyboardLayoutResizeObserver();
    if (typeof renderNodeGraphMidiKeyboardKeyLabels === "function") {
      renderNodeGraphMidiKeyboardKeyLabels();
    }
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
    ".dsp-node .node-midi-keyboard-module, "
    + ".node-midi-keyboard-module .node-midi-keyboard-surface, "
    + ".node-layout-canvas-tile .node-midi-keyboard-module, "
    + ".node-metamodule-canvas-stage .node-midi-keyboard-module",
  ).forEach((el) => {
    nodeGraphMidiKeyboardLayoutResizeObserver.observe(el);
  });
}

// Display Settings > Range (piano Keyboard only): four Label [-][+] value
// steppers in the app's shared GU stepper row (.scene-context-width-controls,
// same as Module Settings Width). The keys' MIDI notes come from
// lowMidi + keyCount (node-graph-view-controls.js); a step that would cross
// MIDI 0 / 127 or the key-count limits is disabled, never half-applied.
const nodeGraphKeyboardRangeRowSpecs = Object.freeze([
  Object.freeze({ action: "octave", label: "Octave", downAria: "Shift all keys down one octave", upAria: "Shift all keys up one octave" }),
  Object.freeze({ action: "semitone", label: "Semitone", downAria: "Shift all keys down one semitone", upAria: "Shift all keys up one semitone" }),
  Object.freeze({ action: "bottom", label: "Keys at bottom", downAria: "Remove the lowest key", upAria: "Add a key below the lowest key" }),
  Object.freeze({ action: "top", label: "Keys at top", downAria: "Remove the highest key", upAria: "Add a key above the highest key" }),
]);

function nodeGraphKeyboardRangeEscapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Values + enabled steps for one piano Keyboard's Range section (null = not a piano Keyboard). */
function nodeGraphKeyboardRangeDisplayState(nodeId) {
  const id = String(nodeId || "").trim();
  const node = id && typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  if (!node || node.type !== "keyboard"
    || typeof nodeGraphKeyboardRangeFor !== "function"
    || typeof nodeGraphMidiKeyboardRangeStep !== "function") {
    return null;
  }
  const range = nodeGraphKeyboardRangeFor(id);
  const high = range.low + range.count - 1;
  const offsets = typeof nodeGraphKeyboardRangeOffsets === "function"
    ? nodeGraphKeyboardRangeOffsets(range)
    : { octave: 0, semitone: 0 };
  const signed = (n) => `${n >= 0 ? "+" : "-"}${Math.abs(n)}`;
  const name = (midi) => (typeof nodeGraphMidiKeyboardPitchLabel === "function" ? nodeGraphMidiKeyboardPitchLabel(midi) : String(midi));
  const can = (action, direction) => Boolean(nodeGraphMidiKeyboardRangeStep(range, action, direction));
  const offsetTitle = `Lowest key ${name(range.low)} (MIDI ${range.low}); offsets are from the default C0 (MIDI 24)`;
  const row = (action, value, title) => ({ value, title, down: can(action, -1), up: can(action, 1) });
  return {
    nodeId: id,
    summary: `Range \u00b7 ${range.count} keys \u00b7 MIDI ${range.low}\u2013${high}`,
    rows: {
      octave: row("octave", signed(offsets.octave), offsetTitle),
      semitone: row("semitone", signed(offsets.semitone), offsetTitle),
      bottom: row("bottom", name(range.low), `Lowest key ${name(range.low)} (MIDI ${range.low})`),
      top: row("top", name(high), `Highest key ${name(high)} (MIDI ${high})`),
    },
  };
}

function buildNodeGraphKeyboardRangeDisplaySettingsHtml(nodeId) {
  const state = nodeGraphKeyboardRangeDisplayState(nodeId);
  if (!state) {
    return "";
  }
  const esc = nodeGraphKeyboardRangeEscapeAttr;
  const rows = nodeGraphKeyboardRangeRowSpecs.map((spec) => {
    const r = state.rows[spec.action];
    return `
      <div class="scene-context-width-controls" data-midi-key-range-row="${spec.action}">
        <span class="scene-context-gu-label">${esc(spec.label)}</span>
        <button type="button" data-midi-key-range-step="${spec.action}" data-midi-key-range-dir="-1" aria-label="${esc(spec.downAria)}"${r.down ? "" : " disabled"}>-</button>
        <button type="button" data-midi-key-range-step="${spec.action}" data-midi-key-range-dir="1" aria-label="${esc(spec.upAria)}"${r.up ? "" : " disabled"}>+</button>
        <span class="scene-context-gu-value" data-midi-key-range-value="${spec.action}" title="${esc(r.title)}" aria-live="polite">${esc(r.value)}</span>
      </div>`;
  }).join("");
  return `
    <div class="metadata-field-section" data-midi-keyboard-range-settings data-midi-keyboard-range-node="${esc(state.nodeId)}">
      <div class="metadata-section-title" data-midi-key-range-summary>${esc(state.summary)}</div>${rows}
    </div>`;
}

function nodeGraphKeyboardRangeSectionNodeId(section) {
  return String(
    section?.closest?.("[data-display-settings-target-node]")?.dataset?.displaySettingsTargetNode
    || section?.dataset?.midiKeyboardRangeNode
    || "",
  ).trim();
}

/** Refresh every open Range section (values, disabled limits) from its node. */
function syncNodeGraphKeyboardRangeDisplaySettings(root = null) {
  const scope = root && typeof root.querySelectorAll === "function"
    ? root
    : (typeof document !== "undefined" ? document : null);
  if (!scope) {
    return;
  }
  scope.querySelectorAll("[data-midi-keyboard-range-settings]").forEach((section) => {
    const state = nodeGraphKeyboardRangeDisplayState(nodeGraphKeyboardRangeSectionNodeId(section));
    if (!state) {
      return;
    }
    const summary = section.querySelector("[data-midi-key-range-summary]");
    if (summary && summary.textContent !== state.summary) {
      summary.textContent = state.summary;
    }
    for (const spec of nodeGraphKeyboardRangeRowSpecs) {
      const r = state.rows[spec.action];
      const value = section.querySelector(`[data-midi-key-range-value="${spec.action}"]`);
      if (value) {
        if (value.textContent !== r.value) value.textContent = r.value;
        if (value.getAttribute("title") !== r.title) value.setAttribute("title", r.title);
      }
      section.querySelectorAll(`[data-midi-key-range-step="${spec.action}"]`).forEach((button) => {
        const allowed = Number(button.dataset.midiKeyRangeDir) > 0 ? r.up : r.down;
        if (button.disabled === allowed) button.disabled = !allowed;
      });
    }
  });
}

function buildNodeGraphKeyboardControllerFaceDisplaySettingsBodyHtml() {
  const nodeId = typeof nodeGraphMvp !== "undefined"
    ? String(nodeGraphMvp?.traceDisplaySettingsTargetNode || "").trim()
    : "";
  const node = nodeId && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(nodeId)
    : null;
  const s = normalizeNodeGraphMidiKeyboardLayout({
    ...nodeGraphMidiKeyboardLayoutDefaults,
    ...(node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
      ? node.traceDisplaySettings
      : {}),
  });
  // Module size is Width/Height in Module Settings (and Shift+arrows).
  // White width / keyboard height layout sliders removed — they no longer drive the face.
  return `${buildNodeGraphKeyboardRangeDisplaySettingsHtml(nodeId)}
    <div class="metadata-field-section" data-midi-keyboard-layout-settings>
      <div class="metadata-section-title">Keys</div>
      <label class="metadata-checkbox-label">
        <input type="checkbox" data-midi-key-layout="hideKeyboardInfo"${s.hideKeyboardInfo ? " checked" : ""} aria-label="Hide keyboard info">
        <span>Hide keyboard info</span>
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
    const nodeId = String(
      host.closest?.("[data-display-settings-target-node]")?.dataset?.displaySettingsTargetNode
      || (typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.traceDisplaySettingsTargetNode : "")
      || "",
    ).trim();
    const node = nodeId && typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(nodeId)
      : null;
    const next = normalizeNodeGraphMidiKeyboardLayout({
      ...nodeGraphMidiKeyboardLayoutDefaults,
      ...(node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
        ? node.traceDisplaySettings
        : {}),
    });
    for (const input of host.querySelectorAll("[data-midi-key-layout]")) {
      const key = input.getAttribute("data-midi-key-layout");
      if (key) {
        if (input.type === "checkbox") next[key] = input.checked;
        else next[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
      }
    }
    return next;
  };
  const commit = (persist) => {
    const next = readForm();
    const nodeId = String(
      host.closest?.("[data-display-settings-target-node]")?.dataset?.displaySettingsTargetNode
      || (typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp.traceDisplaySettingsTargetNode : "")
      || "",
    ).trim();
    const node = nodeId && typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(nodeId)
      : null;
    if (node && typeof assignNodeGraphTypedDisplaySettingsEverywhere === "function") {
      assignNodeGraphTypedDisplaySettingsEverywhere(node, "keyboardControllerFace", {
        ...(node.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
          ? node.traceDisplaySettings
          : {}),
        ...next,
      });
    }
    applyNodeGraphMidiKeyboardLayout();
    if (persist && typeof setNodeGraphPatchDirtyState === "function") {
      setNodeGraphPatchDirtyState("edited");
    }
  };
  // Range steppers write lowMidi / keyCount straight onto the node (undoable)
  // and re-render the keys; the form read above never touches them.
  host.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-midi-key-range-step]");
    if (!button || !host.contains(button) || button.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest("[data-midi-keyboard-range-settings]");
    const nodeId = nodeGraphKeyboardRangeSectionNodeId(section);
    if (nodeId && typeof changeNodeGraphMidiKeyboardRange === "function") {
      changeNodeGraphMidiKeyboardRange(nodeId, button.dataset.midiKeyRangeStep, Number(button.dataset.midiKeyRangeDir));
    }
    syncNodeGraphKeyboardRangeDisplaySettings(host);
  });
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
  const fromEl = event?.target instanceof Element
    ? event.target
    : (event?.currentTarget instanceof Element ? event.currentTarget : null);
  let nodeId = String(
    fromEl?.closest?.(".node-midi-keyboard-module[data-node], .dsp-node.keyboard-layout[data-node], .dsp-node[data-node]")?.dataset?.node
    || "",
  ).trim();
  const patchNode = typeof nodeGraphPatchNode === "function" && nodeId
    ? nodeGraphPatchNode(nodeId)
    : null;
  if (patchNode && patchNode.type !== "keyboard" && patchNode.type !== "gridKeyboard") {
    nodeId = "";
  }
  if (!nodeId && Array.isArray(nodeGraphMvp?.patch?.nodes)) {
    const placed = nodeGraphMvp.patch.nodes.find((n) => n?.type === "keyboard");
    if (placed?.id) {
      nodeId = String(placed.id);
    }
  }
  if (nodeId && typeof ensureNodeGraphModuleSelectedForContext === "function") {
    ensureNodeGraphModuleSelectedForContext(nodeId, event);
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
    setNodeGraphTraceDisplaySettingsHeader("DISPLAY", "Settings", "Keyboard");
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
  if (typeof syncNodeGraphLayoutCanvasSettingsControl === "function") {
    syncNodeGraphLayoutCanvasSettingsControl();
  }
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
