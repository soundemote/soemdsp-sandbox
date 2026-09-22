// Slider module face: same Bias contract as Knob (offset + In), bar chrome.

function nodeGraphSliderFaceDisplaySettingsForNode(node) {
  const raw = node?.traceDisplaySettings && typeof node.traceDisplaySettings === "object"
    ? node.traceDisplaySettings
    : {};
  return typeof normalizeNodeGraphSliderFaceDisplaySettings === "function"
    ? normalizeNodeGraphSliderFaceDisplaySettings(raw)
    : raw;
}

function nodeGraphSliderFaceClearPinStyles(face) {
  const nodes = [
    face?.querySelector?.("[data-knob-face-dial]"),
    face?.querySelector?.("[data-knob-face-arc]"),
    face?.querySelector?.("[data-knob-face-label]"),
    face?.querySelector?.("[data-knob-face-readout]"),
    face?.querySelector?.("[data-knob-face-unit]"),
  ];
  const props = [
    "position", "top", "left", "right", "bottom", "margin", "margin-top", "margin-left",
    "transform", "width", "height", "font-size", "line-height", "overflow", "z-index",
    "white-space",
  ];
  for (const el of nodes) {
    if (!el?.style) continue;
    for (const prop of props) el.style.removeProperty(prop);
    delete el.dataset.pinAnchor;
  }
}

function nodeGraphSliderFaceApplyPin(el, align, pad, scale, fallbackAlign) {
  if (!el) return;
  const a = typeof normalizeNodeGraphKnobPinAlign === "function"
    ? normalizeNodeGraphKnobPinAlign(align, fallbackAlign)
    : (align || fallbackAlign || "mid");
  const p = Number.isFinite(Number(pad)) ? Math.max(0, Math.min(1, Number(pad))) : 0;
  const sc = Number.isFinite(Number(scale)) ? Math.max(0, Math.min(1, Number(scale))) : 0.2;
  el.dataset.pinAnchor = a;
  const set = (prop, value) => el.style.setProperty(prop, value, "important");
  set("position", "absolute");
  set("top", "auto");
  set("left", "auto");
  set("right", "auto");
  set("bottom", "auto");
  set("margin", "0");
  set("width", "max-content");
  set("height", "1em");
  set("line-height", "1");
  set("white-space", "nowrap");
  set("overflow", "visible");
  set("z-index", "3");
  set("font-size", `calc(${sc} * var(--knob-face-min, 100cqmin))`);
  const inset = `${(p * 100).toFixed(4)}%`;
  if (a === "topleft") {
    set("top", inset); set("left", inset); set("transform", "none");
  } else if (a === "top") {
    set("top", inset); set("left", "50%"); set("transform", "translateX(-50%)");
  } else if (a === "topright") {
    set("top", inset); set("right", inset); set("transform", "none");
  } else if (a === "midleft") {
    set("top", "50%"); set("left", inset); set("transform", "translateY(-50%)");
  } else if (a === "mid") {
    set("top", "50%"); set("left", "50%"); set("transform", "translate(-50%, -50%)");
  } else if (a === "midright") {
    set("top", "50%"); set("right", inset); set("transform", "translateY(-50%)");
  } else if (a === "bottomleft") {
    set("bottom", inset); set("left", inset); set("transform", "none");
  } else if (a === "bottom") {
    set("bottom", inset); set("left", "50%"); set("transform", "translateX(-50%)");
  } else {
    set("bottom", inset); set("right", inset); set("transform", "none");
  }
}

function nodeGraphSliderFaceApplyStyle(face, settings) {
  if (!face) return;
  const s = typeof normalizeNodeGraphSliderFaceDisplaySettings === "function"
    ? normalizeNodeGraphSliderFaceDisplaySettings(settings)
    : (settings || {});
  const bg = s.background || "#000000";
  face.style.background = bg;
  face.style.setProperty("--knob-module-bg", bg);
  face.classList.add("is-slider-look");
  face.dataset.knobLook = "slider";
  const length = Number.isFinite(Number(s.sliderLength)) ? Math.max(0, Math.min(1, Number(s.sliderLength))) : 1;
  const height = Number.isFinite(Number(s.sliderHeight)) ? Math.max(0, Math.min(1, Number(s.sliderHeight))) : 0.22;
  const barAlign = typeof normalizeNodeGraphKnobSliderBarAlign === "function"
    ? normalizeNodeGraphKnobSliderBarAlign(s.sliderAlign, "mid")
    : (s.sliderAlign || "mid");
  face.setAttribute("data-slider-align", barAlign);
  face.style.setProperty("--knob-slider-length", String(length));
  face.style.setProperty("--knob-slider-height", String(height));
  face.classList.toggle("slider-bar-gone", length <= 0 || height <= 0);
  face.style.setProperty("--macro-arc-fill", s.sliderColor || "#4a6a78");
  face.style.setProperty("--macro-arc-track", s.arcTrack || "#1a2226");
  face.style.setProperty("--knob-slider-number-color", s.sliderNumberColor || "#ffffff");
  face.style.setProperty("--knob-slider-text-color", s.sliderTextColor || "#cfdde5");
  face.style.setProperty("--knob-slider-unit-color", s.sliderUnitColor || "#7fc7d9");
  face.classList.toggle("hide-slider-label", s.sliderShowLabel === false);
  face.classList.toggle("hide-slider-number", s.sliderShowNumber === false);
  face.classList.toggle("hide-slider-unit", s.sliderShowUnit === false);
  nodeGraphSliderFaceApplyPin(face.querySelector("[data-knob-face-label]"), s.sliderLabelAlign, s.sliderLabelPadding, s.sliderLabelScale, "topleft");
  nodeGraphSliderFaceApplyPin(face.querySelector("[data-knob-face-readout]"), s.sliderNumberAlign, s.sliderNumberPadding, s.sliderNumberScale, "mid");
  nodeGraphSliderFaceApplyPin(face.querySelector("[data-knob-face-unit]"), s.sliderUnitAlign, s.sliderUnitPadding, s.sliderUnitScale, "topright");
  const rounding = Number.isFinite(Number(s.sliderRounding)) ? Math.max(0, Math.min(1, Number(s.sliderRounding))) : 0.5;
  face.style.setProperty("--knob-slider-rounding", String(rounding));
  face.style.setProperty("--knob-slider-corner-shape", s.sliderCornerShape === "square" ? "round" : "squircle");
  const minSide = Math.min(face.clientWidth || 0, face.clientHeight || 0);
  if (minSide > 0) {
    face.style.setProperty("--knob-face-min", `${minSide.toFixed(2)}px`);
  }
}

function paintNodeGraphSliderFaceLive(face, nodeId, buffer = null) {
  if (!face || !nodeId) return;
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  const display = nodeGraphSliderFaceDisplaySettingsForNode(patchNode);
  nodeGraphSliderFaceApplyStyle(face, display);
  const wantsMouse = typeof nodeGraphDspControllerDisplayIsMouse === "function"
    ? nodeGraphDspControllerDisplayIsMouse(patchNode)
    : true;
  let value = 0;
  if (wantsMouse) {
    const base = typeof nodeGraphReadNodeNumber === "function"
      ? nodeGraphReadNodeNumber(nodeId, "offset")
      : Number(patchNode?.params?.offset);
    value = Number.isFinite(base) ? base : 0;
  } else if (typeof nodeGraphKnobFaceLiveOffset === "function") {
    value = nodeGraphKnobFaceLiveOffset(nodeId);
  }
  if (!Number.isFinite(value)) value = 0;
  const unit01 = typeof nodeGraphKnobFaceUnitFromValue === "function"
    ? nodeGraphKnobFaceUnitFromValue(value, patchNode || { id: nodeId })
    : 0;
  face.style.setProperty("--macro-value", String(unit01));
  face.dataset.liveValue = String(value);
  const showLabel = !face.classList.contains("hide-slider-label");
  const showReadout = !face.classList.contains("hide-slider-number");
  const label = face.querySelector("[data-knob-face-label]");
  if (label) {
    if (label.dataset.editing !== "true") {
      label.textContent = typeof nodeGraphKnobFaceLabelTextForNode === "function"
        ? nodeGraphKnobFaceLabelTextForNode(patchNode)
        : "Slider";
    }
    label.hidden = !showLabel;
  }
  const readout = face.querySelector("[data-knob-face-readout]");
  if (readout) {
    const slider = document.getElementById(`node-${nodeId}-offset`);
    readout.hidden = !showReadout;
    if (showReadout && typeof nodeGraphKnobFaceFormatReadout === "function") {
      readout.textContent = nodeGraphKnobFaceFormatReadout(value, patchNode, slider);
    }
  }
  const unitEl = face.querySelector("[data-knob-face-unit]");
  if (unitEl) {
    const showUnit = !face.classList.contains("hide-slider-unit");
    const slider = document.getElementById(`node-${nodeId}-offset`);
    const unit = showUnit
      ? String(slider?.dataset?.unit || patchNode?.paramMeta?.offset?.unit || "").trim()
      : "";
    unitEl.textContent = unit;
    unitEl.hidden = !unit;
  }
  if (typeof nodeGraphKnobFaceSyncLightSource === "function") {
    nodeGraphKnobFaceSyncLightSource(face, true);
  }
}

function createNodeGraphPluginSliderFace(node, type) {
  const face = document.createElement("div");
  face.className = "node-knob-face node-module-scope-window node-knob-module-macro node-macro-knob is-slider-look";
  face.dataset.node = node;
  face.dataset.nodeType = type || "pluginSlider";
  face.dataset.knobLook = "slider";
  face.dataset.sliderTarget = `node-${node}-offset`;
  face.dataset.lightStrength = "1";
  face.dataset.lightSource = "screen";
  face.tabIndex = 0;
  face.setAttribute("role", "slider");
  face.setAttribute("aria-label", `${nodeGraphNodeDisplayName(node)} slider`);

  const label = document.createElement("span");
  label.className = "node-macro-knob-label";
  label.dataset.knobFaceLabel = "true";
  label.textContent = typeof nodeGraphKnobFaceLabelTextForNode === "function"
    ? nodeGraphKnobFaceLabelTextForNode(typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(node) : null)
    : "Slider";
  if (typeof attachNodeGraphKnobFaceLabelEdit === "function") {
    attachNodeGraphKnobFaceLabelEdit(label, node);
  }

  const dial = document.createElement("span");
  dial.className = "node-macro-knob-dial";
  dial.dataset.knobFaceDial = "true";
  dial.dataset.macroKnobDial = "true";
  const arc = document.createElement("i");
  arc.className = "node-macro-knob-arc";
  arc.dataset.knobFaceArc = "true";
  arc.setAttribute("aria-hidden", "true");
  dial.append(arc);

  const readout = document.createElement("strong");
  readout.className = "node-macro-knob-value";
  readout.dataset.knobFaceReadout = "true";
  readout.textContent = "0.00";

  const unitEl = document.createElement("span");
  unitEl.className = "node-knob-face-unit";
  unitEl.dataset.knobFaceUnit = "true";
  unitEl.hidden = true;

  face.append(label, dial, readout, unitEl);
  if (typeof attachNodeGraphKnobFaceDrag === "function") {
    attachNodeGraphKnobFaceDrag(face);
  }
  paintNodeGraphSliderFaceLive(face, node, null);
  return face;
}

function buildNodeGraphSliderFaceDisplaySettingsHtml() {
  const row = (fn, keys) => keys.map((key) => fn(key, "pluginSliderFace")).join("");
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildColorRowHtml(key, "pluginSliderFace")
    : () => "";
  const fieldRow = typeof nodeGraphDisplaySettingsBuildStepperRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildStepperRowHtml(key, "pluginSliderFace")
    : () => "";
  const choiceRow = typeof nodeGraphDisplaySettingsBuildChoiceRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildChoiceRowHtml(key)
    : () => "";
  const toggleRow = typeof nodeGraphDisplaySettingsBuildToggleRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildToggleRowHtml(key)
    : () => "";
  const corners = typeof buildNodeGraphPhosphorWaveformCornerChromeHtml === "function"
    ? buildNodeGraphPhosphorWaveformCornerChromeHtml({
      squareId: "nodeKnobSliderCornerSquareButton",
      squircleId: "nodeKnobSliderCornerSquircleButton",
      radiusId: "nodeKnobSliderCornerRadiusInput",
      includeSpacing: false,
    })
    : "";
  return `
    <div class="metadata-section-title">Bar</div>
    <div class="metadata-field-section">${row(colorRow, ["backgroundColor", "sliderColor"])}</div>
    <div class="metadata-field-section">${row(fieldRow, ["sliderLength", "sliderHeight"])}</div>
    <div class="metadata-field-section">${row(choiceRow, ["sliderAlign"])}</div>
    <div class="metadata-field-section">${corners}</div>
    <div class="metadata-section-title">Label</div>
    <div class="metadata-field-section">${row(toggleRow, ["sliderShowLabel"])}${row(choiceRow, ["sliderLabelAlign"])}${row(fieldRow, ["sliderLabelPadding", "sliderLabelScale"])}${row(colorRow, ["sliderTextColor"])}</div>
    <div class="metadata-section-title">Number</div>
    <div class="metadata-field-section">${row(toggleRow, ["sliderShowNumber"])}${row(choiceRow, ["sliderNumberAlign"])}${row(fieldRow, ["sliderNumberPadding", "sliderNumberScale"])}${row(colorRow, ["sliderNumberColor"])}</div>
    <div class="metadata-section-title">Unit</div>
    <div class="metadata-field-section">${row(toggleRow, ["sliderShowUnit"])}${row(choiceRow, ["sliderUnitAlign"])}${row(fieldRow, ["sliderUnitPadding", "sliderUnitScale"])}${row(colorRow, ["sliderUnitColor"])}</div>`;
}

function bindNodeGraphSliderFaceDisplaySettingsEvents(root) {
  const host = root?.closest?.("[data-display-settings-body]") || root;
  if (!host || host.dataset.sliderFaceSettingsBound === "true") return;
  host.dataset.sliderFaceSettingsBound = "true";
  const applyCorners = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.id === "nodeKnobSliderCornerRadiusInput") applyCorners("none", false);
  });
  host.addEventListener("change", (event) => {
    if (event.target?.id === "nodeKnobSliderCornerRadiusInput") applyCorners("immediate", true);
  });
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-corner-shape]");
    if (!corner || !host.contains(corner)) return;
    event.preventDefault();
    const next = corner.getAttribute("data-corner-shape") === "square" ? "square" : "squircle";
    for (const button of host.querySelectorAll("[data-corner-shape]")) {
      const on = button.getAttribute("data-corner-shape") === next;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    applyCorners("immediate", true);
  });
}

function syncNodeGraphSliderFaceDisplaySettingsControls(root) {
  const host = root || document.getElementById("nodeTraceDisplaySettingsPopover");
  const id = typeof nodeGraphTraceDisplaySettingsTargetNodeId === "function"
    ? nodeGraphTraceDisplaySettingsTargetNodeId()
    : "";
  const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(id) : null;
  const s = nodeGraphSliderFaceDisplaySettingsForNode(node);
  const setPressed = (btnId, active) => {
    const el = host?.querySelector?.(`#${btnId}`);
    if (!el) return;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  };
  setPressed("nodeKnobSliderCornerSquareButton", s.sliderCornerShape === "square");
  setPressed("nodeKnobSliderCornerSquircleButton", s.sliderCornerShape !== "square");
  const radius = host?.querySelector?.("#nodeKnobSliderCornerRadiusInput");
  if (radius && document.activeElement !== radius) {
    radius.value = String(s.sliderRounding ?? 0.5);
  }
}
