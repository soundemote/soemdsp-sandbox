// Toggle and Momentary share one Display Settings set.
// Button and label each have padding + nine-way alignment (slider-style).
// Off / On text is Display Settings, not Parameter Settings.
// Corner shape (Pill / Squircle) + rounding 0…1 of half min-edge (APP_POLICY §15).

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
  "rounding",
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
  cornerShape: "squircle",
  // 0…1 of half min-edge; ~0.18 matches pre-rewrite default rounding 18%.
  rounding: 0.18,
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

function nodeGraphPluginButtonNormalizeRounding(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  // Legacy patches stored percent 0…100 (pre-rewrite / keypad-style).
  const unit = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, unit));
}

function nodeGraphPluginButtonNormalizeCornerShape(value, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pill") return "pill";
  if (raw === "squircle") return "squircle";
  const fb = String(fallback || "squircle").trim().toLowerCase();
  return fb === "pill" ? "pill" : "squircle";
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
    cornerShape: nodeGraphPluginButtonNormalizeCornerShape(src.cornerShape, d.cornerShape),
    rounding: nodeGraphPluginButtonNormalizeRounding(src.rounding, d.rounding),
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

function nodeGraphPluginButtonFaceLayoutBox(face) {
  if (!face) return { w: 0, h: 0 };
  const w = Math.round(Number(face.offsetWidth || face.clientWidth) || 0);
  const h = Math.round(Number(face.offsetHeight || face.clientHeight) || 0);
  return { w, h };
}

function nodeGraphPluginButtonScheduleFitCaption(btn) {
  if (!btn || btn._pluginBtnFitRetry) return;
  const tries = (Number(btn._pluginBtnFitTries) || 0) + 1;
  if (tries > 24) {
    btn._pluginBtnFitTries = 0;
    return;
  }
  btn._pluginBtnFitTries = tries;
  btn._pluginBtnFitRetry = requestAnimationFrame(() => {
    btn._pluginBtnFitRetry = 0;
    nodeGraphPluginButtonFitCaption(btn);
  });
}

function nodeGraphPluginButtonFitCaption(btn, options = {}) {
  const fit = btn?.querySelector?.(":scope > .btn-fit");
  if (!fit || !btn.isConnected) return;
  const face = btn.closest(".node-plugin-toggle-face, .node-plugin-momentary-face");
  const { w: faceW, h: faceH } = nodeGraphPluginButtonFaceLayoutBox(face);
  // Face layout CSS box only. Zoom does not change offsetWidth.
  // F-cycle reparent is 0×0 — do not write; retry after the box exists.
  if (faceW < 8 || faceH < 8) {
    nodeGraphPluginButtonScheduleFitCaption(btn);
    return;
  }
  btn._pluginBtnFitTries = 0;
  const padL = Math.max(0, Math.min(1, Number(face?.style.getPropertyValue("--plugin-btn-pad-left")) || 0));
  const padR = Math.max(0, Math.min(1, Number(face?.style.getPropertyValue("--plugin-btn-pad-right")) || 0));
  const padT = Math.max(0, Math.min(1, Number(face?.style.getPropertyValue("--plugin-btn-pad-top")) || 0));
  const padB = Math.max(0, Math.min(1, Number(face?.style.getPropertyValue("--plugin-btn-pad-bottom")) || 0));
  const maxW = Math.max(1, faceW * Math.max(0.05, 1 - padL - padR));
  const maxH = Math.max(1, faceH * Math.max(0.05, 1 - padT - padB));
  const text = String(fit.textContent || "").replace(/\s+/g, " ").trim();
  const scaleRaw = Number(face?.style.getPropertyValue("--plugin-btn-text-scale"));
  const textScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
  const key = `${faceW}x${faceH}|${text}|${textScale}|${padL},${padR},${padT},${padB}`;
  if (options.force !== true && face && face._pluginBtnFitKey === key) return;
  if (!text || textScale <= 0) {
    fit.style.fontSize = "1px";
    if (face) face._pluginBtnFitKey = key;
    return;
  }
  const canvas = nodeGraphPluginButtonFitCaption.canvas
    || (nodeGraphPluginButtonFitCaption.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  if (!context) return;
  const family = getComputedStyle(fit).fontFamily || "sans-serif";
  const weight = "700";
  context.font = `${weight} ${maxH}px ${family}`;
  const probe = context.measureText(text);
  const glyphH = Math.max(
    1,
    (probe.actualBoundingBoxAscent || 0) + (probe.actualBoundingBoxDescent || 0),
  );
  let size = maxH * (maxH / glyphH);
  context.font = `${weight} ${size}px ${family}`;
  const width = context.measureText(text).width;
  if (width > maxW) size *= maxW / width;
  fit.style.fontSize = `${Math.max(1, size * textScale)}px`;
  if (face) face._pluginBtnFitKey = key;
}

function nodeGraphPluginButtonRefitConnectedFaces() {
  document.querySelectorAll(".node-plugin-toggle-face, .node-plugin-momentary-face").forEach((face) => {
    const btn = face.querySelector(".node-plugin-toggle-button, .node-plugin-momentary-button");
    if (btn) nodeGraphPluginButtonFitCaption(btn);
  });
}

function nodeGraphPluginButtonWatchCaption(btn) {
  if (!btn) return;
  const face = btn.closest(".node-plugin-toggle-face, .node-plugin-momentary-face") || btn;
  if (face.dataset.pluginBtnCaptionWatch === "1") return;
  face.dataset.pluginBtnCaptionWatch = "1";
  const observer = new ResizeObserver(() => nodeGraphPluginButtonFitCaption(btn));
  observer.observe(face);
}

function nodeGraphPluginButtonPaintFace(face, settings) {
  if (!face) return;
  const type = face.dataset.nodeType || "";
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings, type);
  const btn = face.querySelector(".node-plugin-toggle-button, .node-plugin-momentary-button");
  const label = face.querySelector("[data-plugin-btn-label]");
  face.dataset.labelAlign = s.labelAlign;
  face.dataset.pluginBtnCorner = s.cornerShape;
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
    nodeGraphPluginButtonWatchCaption(btn);
    nodeGraphPluginButtonFitCaption(btn, { force: true });
    btn.style.setProperty("--plugin-btn-inactive", s.inactiveColor);
    btn.style.setProperty("--plugin-btn-active", s.activeColor);
    btn.style.setProperty("--plugin-btn-hover", s.hoverColor);
    btn.style.setProperty("--plugin-btn-text", s.textColor);
    const { w: faceW, h: faceH } = nodeGraphPluginButtonFaceLayoutBox(face);
    if (faceW >= 8 && faceH >= 8) {
      const radiusPx = Math.round(s.rounding * 0.5 * Math.min(faceW, faceH));
      btn.style.setProperty("--plugin-btn-radius", `${radiusPx}px`);
    }
    btn.style.setProperty(
      "--plugin-btn-corner-shape",
      s.cornerShape === "pill" ? "round" : "squircle",
    );
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
      <div class="metadata-field-section">
        <div class="node-led-settings-row" role="group" aria-label="Button corner shape">
          <span>Shape</span>
          <button type="button" data-plugin-btn-corner="pill" aria-pressed="false">Pill</button>
          <button type="button" data-plugin-btn-corner="squircle" aria-pressed="true">Squircle</button>
        </div>
        ${fieldRow("rounding")}
        ${["buttonPadLeft", "buttonPadRight", "buttonPadTop", "buttonPadBottom", "strokeScale", "textScale"].map(fieldRow).join("")}
      </div>
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
  for (const button of root.querySelectorAll?.("[data-plugin-btn-corner]") || []) {
    const on = button.getAttribute("data-plugin-btn-corner") === s.cornerShape;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
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
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-plugin-btn-corner]");
    if (!corner || !host.contains(corner)) return;
    event.preventDefault();
    const next = corner.getAttribute("data-plugin-btn-corner") === "pill" ? "pill" : "squircle";
    for (const button of host.querySelectorAll("[data-plugin-btn-corner]")) {
      const on = button.getAttribute("data-plugin-btn-corner") === next;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    apply("immediate", true);
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
  const activeCorner = panel?.querySelector?.(
    "[data-plugin-btn-corner].active, [data-plugin-btn-corner][aria-pressed='true']",
  );
  if (activeCorner) {
    next.cornerShape = activeCorner.getAttribute("data-plugin-btn-corner") === "pill"
      ? "pill"
      : "squircle";
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
