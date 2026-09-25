// Toggle and Momentary share one Display Settings set.
// Button and label each have padding + nine-way alignment (slider-style).
// Off / On text is Display Settings, not Parameter Settings.

const NODE_GRAPH_PLUGIN_BUTTON_TEXT_MAX = 48;

const NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS = Object.freeze([
  "strokeScale",
  "buttonPadLeft",
  "buttonPadRight",
  "buttonPadTop",
  "buttonPadBottom",
  "textScale",
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
  "labelAlign",
]);

const NODE_GRAPH_PLUGIN_BUTTON_TEXT_FIELDS = Object.freeze([
  "labelText",
  "offText",
  "onText",
]);

const NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS = Object.freeze({
  strokeScale: 0.06,
  buttonPadLeft: 0,
  buttonPadRight: 0,
  buttonPadTop: 0,
  buttonPadBottom: 0,
  textScale: 1,
  labelText: "",
  labelPadding: 0.035,
  labelScale: 1,
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
    buttonPadLeft: nodeGraphPluginButtonClamp01(src.buttonPadLeft, d.buttonPadLeft),
    buttonPadRight: nodeGraphPluginButtonClamp01(src.buttonPadRight, d.buttonPadRight),
    buttonPadTop: nodeGraphPluginButtonClamp01(src.buttonPadTop, d.buttonPadTop),
    buttonPadBottom: nodeGraphPluginButtonClamp01(src.buttonPadBottom, d.buttonPadBottom),
    textScale: nodeGraphPluginButtonClamp01(src.textScale, d.textScale),
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
  if (typeof nodeGraphKnobResolvedDisplayNameForNode === "function") {
    return nodeGraphKnobResolvedDisplayNameForNode(patchNode) || "";
  }
  return s.labelText || "";
}

function nodeGraphPluginButtonClearPin(el) {
  if (!el?.style) return;
  for (const prop of [
    "position", "top", "left", "right", "bottom", "margin", "transform",
    "width", "height", "font-size", "line-height",
  ]) {
    el.style.removeProperty(prop);
  }
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
  face.dataset.labelAlign = s.labelAlign;
  face.style.setProperty("--plugin-btn-pad-left", String(s.buttonPadLeft));
  face.style.setProperty("--plugin-btn-pad-right", String(s.buttonPadRight));
  face.style.setProperty("--plugin-btn-pad-top", String(s.buttonPadTop));
  face.style.setProperty("--plugin-btn-pad-bottom", String(s.buttonPadBottom));
  face.style.setProperty("--plugin-btn-text-scale", String(s.textScale));
  face.style.setProperty("--plugin-label-scale", String(s.labelScale));
  face.style.setProperty("--plugin-label-pad", String(s.labelPadding));
  face.style.setProperty("--plugin-btn-stroke-scale", String(s.strokeScale));
  face.style.setProperty("--plugin-btn-text", s.textColor);
  face.style.padding = "0";
  nodeGraphPluginButtonClearPin(btn);
  nodeGraphPluginButtonClearPin(label);
  if (btn) {
    btn.style.setProperty("--plugin-btn-stroke", s.strokeColor);
    btn.style.setProperty("--plugin-btn-inactive", s.inactiveColor);
    btn.style.setProperty("--plugin-btn-active", s.activeColor);
    btn.style.setProperty("--plugin-btn-hover", s.hoverColor);
    btn.style.setProperty("--plugin-btn-text", s.textColor);
  }
  if (label) {
    const patchNode = typeof nodeGraphPatchNode === "function"
      ? nodeGraphPatchNode(face.dataset.node)
      : null;
    const title = s.buttonShowLabel === false
      ? ""
      : (typeof nodeGraphKnobResolvedDisplayNameForNode === "function"
        ? nodeGraphKnobResolvedDisplayNameForNode(patchNode)
        : (s.labelText || ""));
    if (label.dataset.editing !== "true") {
      label.textContent = title;
    }
    label.hidden = !title;
    label.style.color = s.textColor;
  }
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
    <div data-plugin-button-display-settings-panel>
      <div class="metadata-section-title">Label</div>
      <div class="metadata-field-section">${toggleRow("buttonShowLabel")}${choiceRow("labelAlign")}${["labelPadding", "labelScale"].map(fieldRow).join("")}${nodeGraphPluginButtonTextRowHtml("labelText", "Label", "")}</div>
      <div class="metadata-section-title">Button</div>
      <div class="metadata-field-section">${["buttonPadLeft", "buttonPadRight", "buttonPadTop", "buttonPadBottom", "strokeScale", "textScale"].map(fieldRow).join("")}</div>
      <div class="metadata-field-section">${nodeGraphPluginButtonTextRowHtml("offText", "Off", offPh)}${nodeGraphPluginButtonTextRowHtml("onText", "On", onPh)}</div>
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
