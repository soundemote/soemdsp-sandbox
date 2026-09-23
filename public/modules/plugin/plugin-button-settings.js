// Toggle and Momentary share one Display Settings set.
// Button and label each have padding + nine-way alignment (slider-style).
// Off / On text is Display Settings, not Parameter Settings.

const NODE_GRAPH_PLUGIN_BUTTON_TEXT_MAX = 48;

const NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS = Object.freeze([
  "strokeScale",
  "buttonScale",
  "textScale",
  "buttonPadding",
  "labelPadding",
  "labelScale",
]);

const NODE_GRAPH_PLUGIN_BUTTON_COLOR_FIELDS = Object.freeze([
  "strokeColor",
  "inactiveColor",
  "activeColor",
  "hoverColor",
  "textColor",
]);

const NODE_GRAPH_PLUGIN_BUTTON_CHOICE_FIELDS = Object.freeze([
  "buttonAlign",
  "labelAlign",
]);

const NODE_GRAPH_PLUGIN_BUTTON_TEXT_FIELDS = Object.freeze([
  "labelText",
  "offText",
  "onText",
]);

const NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS = Object.freeze({
  strokeScale: 0.06,
  buttonScale: 1,
  textScale: 0.72,
  buttonPadding: 0,
  buttonAlign: "mid",
  labelText: "",
  labelPadding: 0.035,
  labelScale: 0.22,
  labelAlign: "topleft",
  buttonShowLabel: true,
  offText: "Off",
  onText: "On",
  strokeColor: "#5c5071",
  inactiveColor: "#1a2228",
  activeColor: "#2f8f86",
  hoverColor: "#89bfc2",
  textColor: "#f4f7f8",
});

function nodeGraphPluginButtonIsMomentaryType(type) {
  const key = String(type || "").trim();
  return key === "momentaryButton" || key === "momentaryButtonFace";
}

function nodeGraphPluginButtonClamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function nodeGraphPluginButtonNormalizeHex(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }
  return fallback;
}

function nodeGraphPluginButtonNormalizeText(value, fallback) {
  if (value == null) return fallback;
  return String(value).replace(/\s+/g, " ").trim().slice(0, NODE_GRAPH_PLUGIN_BUTTON_TEXT_MAX);
}

function nodeGraphPluginButtonNormalizeAlign(value, fallback) {
  if (typeof normalizeNodeGraphKnobPinAlign === "function") {
    return normalizeNodeGraphKnobPinAlign(value, fallback);
  }
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const known = [
    "topleft", "top", "topright",
    "midleft", "mid", "midright",
    "bottomleft", "bottom", "bottomright",
  ];
  if (known.includes(raw)) return raw;
  const fb = String(fallback || "mid").trim().toLowerCase();
  return known.includes(fb) ? fb : "mid";
}

function normalizeNodeGraphPluginButtonDisplaySettings(settings, type) {
  const d = NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS;
  const src = settings && typeof settings === "object" ? settings : {};
  const momentary = nodeGraphPluginButtonIsMomentaryType(type);
  const fallbackOff = momentary ? "Gate" : d.offText;
  const fallbackOn = momentary ? "Gate" : d.onText;
  return {
    strokeScale: nodeGraphPluginButtonClamp01(src.strokeScale, d.strokeScale),
    buttonScale: nodeGraphPluginButtonClamp01(src.buttonScale, d.buttonScale),
    textScale: nodeGraphPluginButtonClamp01(src.textScale, d.textScale),
    buttonPadding: nodeGraphPluginButtonClamp01(src.buttonPadding, d.buttonPadding),
    buttonAlign: nodeGraphPluginButtonNormalizeAlign(src.buttonAlign, d.buttonAlign),
    labelText: nodeGraphPluginButtonNormalizeText(src.labelText, d.labelText),
    labelPadding: nodeGraphPluginButtonClamp01(src.labelPadding, d.labelPadding),
    labelScale: nodeGraphPluginButtonClamp01(src.labelScale, d.labelScale),
    labelAlign: nodeGraphPluginButtonNormalizeAlign(src.labelAlign, d.labelAlign),
    buttonShowLabel: src.buttonShowLabel !== false,
    offText: nodeGraphPluginButtonNormalizeText(src.offText, fallbackOff),
    onText: nodeGraphPluginButtonNormalizeText(src.onText, fallbackOn),
    strokeColor: nodeGraphPluginButtonNormalizeHex(src.strokeColor, d.strokeColor),
    inactiveColor: nodeGraphPluginButtonNormalizeHex(src.inactiveColor, d.inactiveColor),
    activeColor: nodeGraphPluginButtonNormalizeHex(src.activeColor, d.activeColor),
    hoverColor: nodeGraphPluginButtonNormalizeHex(src.hoverColor, d.hoverColor),
    textColor: nodeGraphPluginButtonNormalizeHex(src.textColor, d.textColor),
  };
}

function nodeGraphPluginButtonDisplaySettingsForNode(node) {
  return normalizeNodeGraphPluginButtonDisplaySettings(node?.traceDisplaySettings, node?.type);
}

function nodeGraphPluginButtonFaceLabels(node) {
  const patchNode = typeof node === "string" && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(node)
    : node;
  const s = nodeGraphPluginButtonDisplaySettingsForNode(patchNode);
  return { off: s.offText || "", on: s.onText || "" };
}

function nodeGraphPluginButtonFaceLabelText(node) {
  const patchNode = typeof node === "string" && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(node)
    : node;
  const s = nodeGraphPluginButtonDisplaySettingsForNode(patchNode);
  if (s.buttonShowLabel === false) return "";
  return s.labelText || "";
}

function nodeGraphPluginButtonStrokePixels(strokeScale, boxPx) {
  const t = nodeGraphPluginButtonClamp01(strokeScale, 0);
  const max = Math.max(0, Number(boxPx) * 0.5);
  return t * max;
}

function nodeGraphPluginButtonApplyBoxPin(el, align, padPx, widthPx, heightPx, faceW, faceH) {
  if (!el) return;
  const a = nodeGraphPluginButtonNormalizeAlign(align, "mid");
  const w = Math.max(0, Number(widthPx) || 0);
  const h = Math.max(0, Number(heightPx) || 0);
  const pad = Math.max(0, Number(padPx) || 0);
  const fw = Math.max(0, Number(faceW) || 0);
  const fh = Math.max(0, Number(faceH) || 0);
  let x = pad;
  let y = pad;
  if (a === "top" || a === "mid" || a === "bottom") x = (fw - w) * 0.5;
  else if (a === "topright" || a === "midright" || a === "bottomright") x = fw - pad - w;
  if (a === "midleft" || a === "mid" || a === "midright") y = (fh - h) * 0.5;
  else if (a === "bottomleft" || a === "bottom" || a === "bottomright") y = fh - pad - h;
  const set = (prop, value) => el.style.setProperty(prop, value, "important");
  set("position", "absolute");
  set("top", `${y}px`);
  set("left", `${x}px`);
  set("right", "auto");
  set("bottom", "auto");
  set("margin", "0");
  set("transform", "none");
  set("width", `${w}px`);
  set("height", `${h}px`);
  el.dataset.pinAnchor = a;
}

function applyNodeGraphPluginButtonDisplaySettingsToFace(node) {
  const id = String(node?.id || "").trim();
  if (!id) return;
  const face = document.querySelector(
    `.node-plugin-toggle-face[data-node="${CSS.escape(id)}"], .node-plugin-momentary-face[data-node="${CSS.escape(id)}"]`,
  );
  if (!face) return;
  nodeGraphPluginButtonPaintFace(face, nodeGraphPluginButtonDisplaySettingsForNode(node));
}

function nodeGraphPluginButtonPaintFace(face, settings) {
  if (!face) return;
  const type = face.dataset.nodeType || "";
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings, type);
  const btn = face.querySelector(".node-plugin-toggle-button, .node-plugin-momentary-button");
  const label = face.querySelector("[data-plugin-btn-label]");
  face.style.setProperty("--plugin-btn-scale", String(s.buttonScale));
  face.style.setProperty("--plugin-btn-text", s.textColor);
  face.style.padding = "0";
  const faceW = face.clientWidth || 0;
  const faceH = face.clientHeight || 0;
  const minSide = Math.min(faceW, faceH);
  if (minSide > 0) {
    face.style.setProperty("--knob-face-min", `${minSide.toFixed(2)}px`);
  }
  const padPx = s.buttonPadding * minSide * 0.5;
  const innerW = Math.max(0, faceW - padPx * 2);
  const innerH = Math.max(0, faceH - padPx * 2);
  const boxW = innerW * s.buttonScale;
  const boxH = innerH * s.buttonScale;
  const box = Math.min(boxW, boxH);
  if (btn) {
    nodeGraphPluginButtonApplyBoxPin(btn, s.buttonAlign, padPx, boxW, boxH, faceW, faceH);
    const strokePx = nodeGraphPluginButtonStrokePixels(s.strokeScale, box || minSide);
    btn.style.setProperty("--plugin-btn-stroke", s.strokeColor);
    btn.style.setProperty("--plugin-btn-stroke-w", `${strokePx}px`);
    btn.style.setProperty("--plugin-btn-inactive", s.inactiveColor);
    btn.style.setProperty("--plugin-btn-active", s.activeColor);
    btn.style.setProperty("--plugin-btn-hover", s.hoverColor);
    btn.style.setProperty("--plugin-btn-text", s.textColor);
    const radius = Math.max(0, box * 0.12);
    btn.style.setProperty("--plugin-btn-radius", `${radius}px`);
    btn.style.fontSize = `${nodeGraphPluginButtonFitFontPx(btn, s.textScale, box)}px`;
  }
  if (label) {
    const title = s.buttonShowLabel === false ? "" : (s.labelText || "");
    if (label.dataset.editing !== "true") {
      label.textContent = title;
    }
    label.hidden = !title;
    label.style.color = s.textColor;
    if (typeof nodeGraphSliderFaceApplyPin === "function") {
      nodeGraphSliderFaceApplyPin(label, s.labelAlign, s.labelPadding, s.labelScale, "topleft");
    } else {
      nodeGraphPluginButtonApplyBoxPin(label, s.labelAlign, s.labelPadding * minSide, 0, 0, faceW, faceH);
      label.style.fontSize = `${s.labelScale * minSide}px`;
      label.style.width = "max-content";
      label.style.height = "1em";
    }
  }
}

function nodeGraphPluginButtonMeasureScratch() {
  if (!nodeGraphPluginButtonFitFontPx._ctx) {
    const canvas = document.createElement("canvas");
    nodeGraphPluginButtonFitFontPx._ctx = canvas.getContext("2d");
  }
  return nodeGraphPluginButtonFitFontPx._ctx;
}

/** Text scale 0 = 1px. 1 = the glyph box touches the inside of the button. */
function nodeGraphPluginButtonFitFontPx(btn, textScale, boxPx) {
  const t = nodeGraphPluginButtonClamp01(textScale, 0);
  const minPx = 1;
  const text = String(btn?.textContent || "").replace(/\s+/g, " ").trim();
  const avail = Math.max(1, Number(boxPx) || Math.min(btn?.clientWidth || 1, btn?.clientHeight || 1));
  if (!text || t <= 0) return minPx;
  const ctx = nodeGraphPluginButtonMeasureScratch();
  if (!ctx) return minPx + t * Math.max(0, avail - minPx);
  const probe = 100;
  ctx.font = `700 ${probe}px sans-serif`;
  const m = ctx.measureText(text);
  const glyphW = Math.max(1, m.width || 1);
  const glyphH = Math.max(
    1,
    (Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : probe * 0.8)
    + (Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : probe * 0.2),
  );
  const fit = Math.min(avail / glyphW, avail / glyphH) * probe;
  return minPx + t * Math.max(0, fit - minPx);
}

function nodeGraphPluginButtonTextRowHtml(key, label, placeholder) {
  const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
    ? nodeGraphDisplaySettingsEscapeHtml
    : (value) => String(value ?? "");
  return `
    <label class="node-trace-display-line-burn-row" data-trace-display-control-row>
      <span>${escape(label)}</span>
      <input type="text" spellcheck="false" autocomplete="off" maxlength="${NODE_GRAPH_PLUGIN_BUTTON_TEXT_MAX}"
        data-plugin-btn-text="${escape(key)}" aria-label="${escape(label)}" placeholder="${escape(placeholder || "")}">
    </label>`;
}

function buildNodeGraphPluginButtonDisplaySettingsBodyHtml(formType) {
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildColorRowHtml(key, formType || "toggleButtonFace")
    : () => "";
  const fieldRow = typeof nodeGraphDisplaySettingsBuildStepperRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildStepperRowHtml(key, formType || "toggleButtonFace")
    : () => "";
  const choiceRow = typeof nodeGraphDisplaySettingsBuildChoiceRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildChoiceRowHtml(key)
    : () => "";
  const toggleRow = typeof nodeGraphDisplaySettingsBuildToggleRowHtml === "function"
    ? (key) => nodeGraphDisplaySettingsBuildToggleRowHtml(key)
    : () => "";
  const momentary = nodeGraphPluginButtonIsMomentaryType(formType);
  const offPh = momentary ? "Gate" : "Off";
  const onPh = momentary ? "Gate" : "On";
  return `
    <div class="node-led-display-settings-panel" data-plugin-button-display-settings-panel>
      <div class="metadata-section-title">Button</div>
      <div class="metadata-field-section">${["strokeScale", "buttonScale", "textScale", "buttonPadding"].map(fieldRow).join("")}</div>
      <div class="metadata-field-section">${choiceRow("buttonAlign")}</div>
      <div class="metadata-field-section">${nodeGraphPluginButtonTextRowHtml("offText", "Off", offPh)}${nodeGraphPluginButtonTextRowHtml("onText", "On", onPh)}</div>
      <div class="metadata-section-title">Label</div>
      <div class="metadata-field-section">${toggleRow("buttonShowLabel")}${choiceRow("labelAlign")}${["labelPadding", "labelScale"].map(fieldRow).join("")}${nodeGraphPluginButtonTextRowHtml("labelText", "Label", "")}</div>
      <div class="metadata-section-title">Colors</div>
      <div class="metadata-field-section">${["strokeColor", "activeColor", "inactiveColor", "hoverColor", "textColor"].map(colorRow).join("")}</div>
    </div>`;
}

function syncNodeGraphPluginButtonDisplaySettingsControls(root, settings) {
  if (!root || !settings) return;
  const type = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings, type);
  const format = typeof formatNodeGraphTraceDisplaySetting === "function"
    ? formatNodeGraphTraceDisplaySetting
    : (value) => String(value);
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const el = root.querySelector?.(`[data-trace-display-field="${key}"]`)
      || root.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = format(s[key]);
      if (el.dataset?.traceDisplayField) el.readOnly = true;
    }
  }
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_CHOICE_FIELDS) {
    const el = root.querySelector?.(`[data-trace-display-choice="${key}"]`);
    if (el && document.activeElement !== el) el.value = String(s[key]);
  }
  const show = root.querySelector?.(`[data-trace-display-toggle="buttonShowLabel"]`);
  if (show) show.checked = s.buttonShowLabel !== false;
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_TEXT_FIELDS) {
    const el = root.querySelector?.(`[data-plugin-btn-text="${key}"]`);
    if (el && document.activeElement !== el) el.value = String(s[key] || "");
  }
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_COLOR_FIELDS) {
    const input = root.querySelector?.(`[data-trace-display-color="${key}"]`);
    if (input) input.value = s[key];
  }
}

function bindNodeGraphPluginButtonDisplaySettingsBody(host) {
  if (!host || host.dataset.pluginBtnSettingsBound === "true") return;
  host.dataset.pluginBtnSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  const isOurs = (target) => target?.closest?.(
    "[data-plugin-btn-field], [data-plugin-btn-text], [data-trace-display-field], [data-trace-display-choice], [data-trace-display-toggle]",
  );
  host.addEventListener("input", (event) => {
    if (isOurs(event.target)) apply("none", false);
  });
  host.addEventListener("change", (event) => {
    if (isOurs(event.target)) apply("immediate", true);
  });
}

function readNodeGraphPluginButtonDisplaySettingsForm(root, current) {
  const panel = root?.querySelector?.("[data-plugin-button-display-settings-panel]") || root;
  const type = typeof nodeGraphTraceDisplaySettingsFormType === "function"
    ? nodeGraphTraceDisplaySettingsFormType()
    : "";
  const next = { ...(current && typeof current === "object" ? current : {}) };
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const input = panel?.querySelector?.(`[data-trace-display-field="${key}"]`)
      || panel?.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (input) next[key] = Number(input.value);
  }
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_CHOICE_FIELDS) {
    const input = panel?.querySelector?.(`[data-trace-display-choice="${key}"]`);
    if (input) next[key] = input.value;
  }
  const show = panel?.querySelector?.(`[data-trace-display-toggle="buttonShowLabel"]`);
  if (show) next.buttonShowLabel = Boolean(show.checked);
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_TEXT_FIELDS) {
    const input = panel?.querySelector?.(`[data-plugin-btn-text="${key}"]`);
    if (input) next[key] = input.value;
  }
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_COLOR_FIELDS) {
    const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
    if (input && input.value) next[key] = input.value;
  }
  return normalizeNodeGraphPluginButtonDisplaySettings(next, type);
}

function nodeGraphPluginButtonBindLook(face, nodeId) {
  if (!face) return;
  const paint = () => {
    const node = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
    nodeGraphPluginButtonPaintFace(face, nodeGraphPluginButtonDisplaySettingsForNode(node));
  };
  face._pluginBtnPaintLook = paint;
  if (typeof ResizeObserver === "function" && !face._pluginBtnRo) {
    const ro = new ResizeObserver(() => paint());
    ro.observe(face);
    face._pluginBtnRo = ro;
  }
  paint();
}
