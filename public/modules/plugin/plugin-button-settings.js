// Toggle / Momentary face look — Display Settings popover.
// Hue + physically plausible brightness (black → full hue @ 0.5 → white).

const NODE_GRAPH_PLUGIN_BUTTON_HUE_PAIRS = Object.freeze([
  ["textBrightness", "textColor"],
  ["buttonBrightness", "buttonColor"],
  ["buttonStrokeBrightness", "buttonStrokeColor"],
  ["hoverBrightness", "hoverColor"],
  ["onBrightness", "onColor"],
]);

const NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS = Object.freeze([
  "textSize",
  "rounding",
  "buttonStrokeThickness",
  "padPx",
  "hoverAlpha",
  "onAlpha",
]);

function nodeGraphPluginButtonHueHex(hueDeg, fallback = 200) {
  if (typeof nodeGraphHueUnitHex === "function") {
    return nodeGraphHueUnitHex(Number.isFinite(Number(hueDeg)) ? Number(hueDeg) : fallback);
  }
  return "#4d8dff";
}

const NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS = Object.freeze({
  font: "thasadith",
  textColor: nodeGraphPluginButtonHueHex(200),
  textBrightness: 0.82,
  textSize: 0.45,
  cornerShape: "squircle",
  rounding: 18,
  buttonColor: nodeGraphPluginButtonHueHex(210),
  buttonBrightness: 0.22,
  buttonStrokeColor: nodeGraphPluginButtonHueHex(200),
  buttonStrokeBrightness: 0.38,
  buttonStrokeThickness: 1,
  padPx: 4,
  hoverColor: nodeGraphPluginButtonHueHex(145),
  hoverBrightness: 0.42,
  hoverAlpha: 0.45,
  onColor: nodeGraphPluginButtonHueHex(145),
  onBrightness: 0.48,
  onAlpha: 0.7,
});

function nodeGraphPluginButtonClamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

function nodeGraphPluginButtonClamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, n));
}

function nodeGraphPluginButtonNormalizeFont(value) {
  if (typeof nodeGraphKeypadNormalizeFont === "function") {
    return nodeGraphKeypadNormalizeFont(value);
  }
  return String(value || NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS.font);
}

function nodeGraphPluginButtonFontFamily(value) {
  if (typeof nodeGraphKeypadFontFamily === "function") {
    return nodeGraphKeypadFontFamily(value);
  }
  return "\"Thasadith\", sans-serif";
}

function nodeGraphPluginButtonNormalizeColor(value, fallbackHex) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{3}$/.test(raw)) {
    return raw;
  }
  return fallbackHex;
}

function normalizeNodeGraphPluginButtonDisplaySettings(settings) {
  const d = NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS;
  const src = settings && typeof settings === "object" ? settings : {};
  const corner = String(src.cornerShape || "").trim().toLowerCase();
  return {
    font: nodeGraphPluginButtonNormalizeFont(src.font),
    textColor: nodeGraphPluginButtonNormalizeColor(src.textColor, d.textColor),
    textBrightness: nodeGraphPluginButtonClamp01(src.textBrightness, d.textBrightness),
    textSize: nodeGraphPluginButtonClamp01(src.textSize, d.textSize),
    cornerShape: corner === "pill" ? "pill" : "squircle",
    rounding: nodeGraphPluginButtonClamp(src.rounding, 0, 100, d.rounding),
    buttonColor: nodeGraphPluginButtonNormalizeColor(src.buttonColor, d.buttonColor),
    buttonBrightness: nodeGraphPluginButtonClamp01(src.buttonBrightness, d.buttonBrightness),
    buttonStrokeColor: nodeGraphPluginButtonNormalizeColor(src.buttonStrokeColor, d.buttonStrokeColor),
    buttonStrokeBrightness: nodeGraphPluginButtonClamp01(src.buttonStrokeBrightness, d.buttonStrokeBrightness),
    buttonStrokeThickness: nodeGraphPluginButtonClamp(src.buttonStrokeThickness, 0, 16, d.buttonStrokeThickness),
    padPx: nodeGraphPluginButtonClamp(src.padPx, 0, 64, d.padPx),
    hoverColor: nodeGraphPluginButtonNormalizeColor(src.hoverColor, d.hoverColor),
    hoverBrightness: nodeGraphPluginButtonClamp01(src.hoverBrightness, d.hoverBrightness),
    hoverAlpha: nodeGraphPluginButtonClamp01(src.hoverAlpha, d.hoverAlpha),
    onColor: nodeGraphPluginButtonNormalizeColor(src.onColor, d.onColor),
    onBrightness: nodeGraphPluginButtonClamp01(src.onBrightness, d.onBrightness),
    onAlpha: nodeGraphPluginButtonClamp01(src.onAlpha, d.onAlpha),
  };
}

function nodeGraphPluginButtonDisplaySettingsForNode(node) {
  return normalizeNodeGraphPluginButtonDisplaySettings(node?.traceDisplaySettings);
}

function nodeGraphPluginButtonHueCss(colorHex, brightness, alpha = 1, fallbackHue = 200) {
  const hue = typeof nodeGraphHueDegFromHex === "function"
    ? nodeGraphHueDegFromHex(colorHex)
    : fallbackHue;
  if (typeof nodeGraphHueBrightnessCss === "function") {
    return nodeGraphHueBrightnessCss(hue, brightness, alpha);
  }
  return colorHex || "#d8e6ef";
}

function nodeGraphPluginButtonFaceLabels(node) {
  const patchNode = typeof node === "string" && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(node)
    : node;
  const type = patchNode?.type || "";
  let choices = [];
  if (typeof nodeGraphReadPatchParameterMetadata === "function" && patchNode) {
    const meta = nodeGraphReadPatchParameterMetadata(patchNode, "value");
    if (Array.isArray(meta?.choices) && meta.choices.length) {
      choices = meta.choices.map((c) => String(c ?? "").trim()).filter((c) => c.length);
    }
  }
  if (!choices.length) {
    const def = typeof nodeGraphModuleDefinitions === "object"
      ? nodeGraphModuleDefinitions[type]?.parameters?.find((p) => p.key === "value")
      : null;
    if (Array.isArray(def?.choices)) {
      choices = def.choices.map((c) => String(c ?? "").trim()).filter((c) => c.length);
    }
  }
  const fallbackOff = type === "momentaryButton" ? "GATE" : "Off";
  const fallbackOn = type === "momentaryButton" ? "GATE" : "On";
  return {
    off: choices[0] || fallbackOff,
    on: choices[1] || choices[0] || fallbackOn,
  };
}

function applyNodeGraphPluginButtonDisplaySettingsToFace(node) {
  const id = String(node?.id || "").trim();
  if (!id) {
    return;
  }
  const face = document.querySelector(
    `.node-plugin-toggle-face[data-node="${CSS.escape(id)}"], .node-plugin-momentary-face[data-node="${CSS.escape(id)}"]`,
  );
  if (!face) {
    return;
  }
  nodeGraphPluginButtonPaintFace(face, normalizeNodeGraphPluginButtonDisplaySettings(node.traceDisplaySettings));
}

function nodeGraphPluginButtonPaintFace(face, settings) {
  if (!face) {
    return;
  }
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings);
  const btn = face.querySelector(".node-plugin-toggle-button, .node-plugin-momentary-button");
  face.style.setProperty("--plugin-btn-pad", `${s.padPx}px`);
  face.dataset.pluginBtnCorner = s.cornerShape;
  if (!btn) {
    return;
  }
  const fill = nodeGraphPluginButtonHueCss(s.buttonColor, s.buttonBrightness, 1, 210);
  const stroke = nodeGraphPluginButtonHueCss(s.buttonStrokeColor, s.buttonStrokeBrightness, 1, 200);
  const text = nodeGraphPluginButtonHueCss(s.textColor, s.textBrightness, 1, 200);
  const hover = nodeGraphPluginButtonHueCss(s.hoverColor, s.hoverBrightness, 1, 145);
  const onFill = nodeGraphPluginButtonHueCss(s.onColor, s.onBrightness, 1, 145);
  btn.style.setProperty("--plugin-btn-fill", fill);
  btn.style.setProperty("--plugin-btn-stroke", stroke);
  btn.style.setProperty("--plugin-btn-text", text);
  btn.style.setProperty("--plugin-btn-stroke-w", `${s.buttonStrokeThickness}px`);
  btn.style.setProperty("--plugin-btn-hover", hover);
  btn.style.setProperty("--plugin-btn-hover-alpha", String(s.hoverAlpha));
  btn.style.setProperty("--plugin-btn-on", onFill);
  btn.style.setProperty("--plugin-btn-on-alpha", String(s.onAlpha));
  const family = nodeGraphPluginButtonFontFamily(s.font);
  btn.style.fontFamily = family;
  const w = Math.max(1, btn.clientWidth || 0);
  const h = Math.max(1, btn.clientHeight || 0);
  const maxRadius = Math.max(0, Math.min(w, h) * 0.5);
  const radius = Math.round((Math.max(0, Math.min(100, s.rounding)) / 100) * maxRadius);
  btn.style.setProperty("--plugin-btn-radius", `${radius}px`);
  btn.style.setProperty("--plugin-btn-corner-shape", s.cornerShape === "pill" ? "round" : "squircle");
  btn.style.fontSize = `${nodeGraphPluginButtonFitFontPx(btn, family, s.textSize)}px`;
}

function nodeGraphPluginButtonMeasureScratch() {
  if (!nodeGraphPluginButtonFitFontPx._ctx) {
    const canvas = document.createElement("canvas");
    nodeGraphPluginButtonFitFontPx._ctx = canvas.getContext("2d");
  }
  return nodeGraphPluginButtonFitFontPx._ctx;
}

/** Size 0 = 1px. Size 1 = glyph box touching the inner button walls. */
function nodeGraphPluginButtonFitFontPx(btn, family, textSize) {
  const t = Math.max(0, Math.min(1, Number(textSize) || 0));
  const minPx = 1;
  const text = String(btn?.textContent || "").replace(/\s+/g, " ").trim();
  const availW = Math.max(1, btn.clientWidth || 1);
  const availH = Math.max(1, btn.clientHeight || 1);
  if (!text || t <= 0) {
    return minPx;
  }
  const ctx = nodeGraphPluginButtonMeasureScratch();
  if (!ctx) {
    return minPx + t * Math.max(0, Math.min(availW, availH) - minPx);
  }
  const probe = 100;
  ctx.font = `700 ${probe}px ${family}`;
  const m = ctx.measureText(text);
  const glyphW = Math.max(
    1,
    (Number.isFinite(m.actualBoundingBoxLeft) && Number.isFinite(m.actualBoundingBoxRight)
      ? Math.abs(m.actualBoundingBoxLeft) + Math.abs(m.actualBoundingBoxRight)
      : m.width) || 1,
  );
  const glyphH = Math.max(
    1,
    (Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : probe * 0.8)
    + (Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : probe * 0.2),
  );
  const fit = Math.min(availW / glyphW, availH / glyphH) * probe;
  return minPx + t * Math.max(0, fit - minPx);
}

function buildNodeGraphPluginButtonDisplaySettingsBodyHtml() {
  const fontOptions = typeof nodeGraphAppFontOptionsHtml === "function"
    ? nodeGraphAppFontOptionsHtml()
    : ((typeof NODE_GRAPH_KEYPAD_FONTS !== "undefined" ? NODE_GRAPH_KEYPAD_FONTS : []).map((font) => {
      const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
        ? nodeGraphDisplaySettingsEscapeHtml
        : (value) => String(value ?? "");
      return `<option value="${escape(font.id)}">${escape(font.label)}</option>`;
    }).join(""));
  const escape = typeof nodeGraphDisplaySettingsEscapeHtml === "function"
    ? nodeGraphDisplaySettingsEscapeHtml
    : (value) => String(value ?? "");
  const hueRow = (title, stepField, colorField, fallbackHue) => (
    typeof nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml === "function"
      ? nodeGraphDisplaySettingsBuildHueTitleStepperRowHtml({
        title,
        stepField,
        colorField,
        formType: "toggleButtonFace",
        defaultHueHex: nodeGraphPluginButtonHueHex(fallbackHue, fallbackHue),
        titleAttr: `${title} brightness 0…1 (black → full hue at 0.5 → white). Drag the title to change hue.`,
      })
      : ""
  );
  return `
    <div class="node-led-display-settings-panel" data-plugin-button-display-settings-panel>
      <div class="metadata-section-title">Text</div>
      <label class="node-led-settings-row" data-trace-display-choice-row="font">
        <span>Font</span>
        <select data-trace-display-choice="font" aria-label="Button font">
          ${fontOptions}
        </select>
      </label>
      ${hueRow("Text", "textBrightness", "textColor", 200)}
      <label class="node-led-settings-row">
        <span>Size</span>
        <input type="range" min="0" max="1" step="0.01" data-plugin-btn-field="textSize" aria-label="Text size 0–1">
      </label>
      <div class="metadata-section-title">Button</div>
      <div class="node-led-settings-row" role="group" aria-label="Button corner shape">
        <span>Shape</span>
        <button type="button" data-plugin-btn-corner="pill" aria-pressed="false">Pill</button>
        <button type="button" data-plugin-btn-corner="squircle" aria-pressed="true">Squircle</button>
      </div>
      <label class="node-led-settings-row">
        <span>Rounding</span>
        <input type="range" min="0" max="100" step="1" data-plugin-btn-field="rounding" aria-label="Button rounding">
        <span>%</span>
      </label>
      ${hueRow("Button", "buttonBrightness", "buttonColor", 210)}
      <div class="metadata-section-title">Button stroke</div>
      ${hueRow("Stroke", "buttonStrokeBrightness", "buttonStrokeColor", 200)}
      <label class="node-led-settings-row">
        <span>Stroke</span>
        <input type="range" min="0" max="16" step="0.25" data-plugin-btn-field="buttonStrokeThickness" aria-label="Button stroke thickness in pixels">
        <span>px</span>
      </label>
      <label class="node-led-settings-row">
        <span>Pad</span>
        <input type="range" min="0" max="64" step="1" data-plugin-btn-field="padPx" aria-label="Padding from module walls in pixels">
        <span>px</span>
      </label>
      <div class="metadata-section-title">Hover</div>
      ${hueRow("Hover", "hoverBrightness", "hoverColor", 145)}
      <label class="node-led-settings-row">
        <span>Alpha</span>
        <input type="range" min="0" max="1" step="0.01" data-plugin-btn-field="hoverAlpha" aria-label="Hover overlay alpha 0–1">
      </label>
      <div class="metadata-section-title">On</div>
      ${hueRow("On", "onBrightness", "onColor", 145)}
      <label class="node-led-settings-row">
        <span>Alpha</span>
        <input type="range" min="0" max="1" step="0.01" data-plugin-btn-field="onAlpha" aria-label="On overlay alpha 0–1">
      </label>
    </div>`;
}

function syncNodeGraphPluginButtonDisplaySettingsControls(root, settings) {
  if (!root || !settings) {
    return;
  }
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings);
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const el = root.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (el && document.activeElement !== el) {
      el.value = String(s[key]);
    }
  }
  const font = root.querySelector?.(`[data-trace-display-choice="font"]`);
  if (font) {
    font.value = s.font;
  }
  for (const [brightKey, colorKey] of NODE_GRAPH_PLUGIN_BUTTON_HUE_PAIRS) {
    const bright = root.querySelector?.(`[data-trace-display-field="${brightKey}"]`);
    if (bright && document.activeElement !== bright) {
      bright.value = String(s[brightKey]);
    }
    const color = root.querySelector?.(`[data-trace-display-color="${colorKey}"]`);
    if (color) {
      color.value = s[colorKey];
    }
  }
  for (const button of root.querySelectorAll?.("[data-plugin-btn-corner]") || []) {
    const on = button.getAttribute("data-plugin-btn-corner") === s.cornerShape;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

function bindNodeGraphPluginButtonDisplaySettingsBody(host) {
  if (!host || host.dataset.pluginBtnSettingsBound === "true") {
    return;
  }
  host.dataset.pluginBtnSettingsBound = "true";
  const apply = (persist, record) => {
    if (typeof markNodeGraphTraceDisplaySettingsDirty === "function") {
      markNodeGraphTraceDisplaySettingsDirty("*");
    }
    if (typeof applyNodeGraphTraceDisplaySettingsForm === "function") {
      applyNodeGraphTraceDisplaySettingsForm({ persist, record, commit: record });
    }
  };
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-plugin-btn-field], [data-trace-display-field]")) {
      apply("none", false);
    }
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-plugin-btn-field], [data-trace-display-choice], [data-trace-display-field]")) {
      apply("immediate", true);
    }
  });
  host.addEventListener("click", (event) => {
    const corner = event.target?.closest?.("[data-plugin-btn-corner]");
    if (!corner || !host.contains(corner)) {
      return;
    }
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
  const next = { ...current };
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const input = panel?.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (input) {
      next[key] = Number(input.value);
    }
  }
  const font = panel?.querySelector?.(`[data-trace-display-choice="font"]`);
  if (font) {
    next.font = font.value;
  }
  for (const [brightKey, colorKey] of NODE_GRAPH_PLUGIN_BUTTON_HUE_PAIRS) {
    const bright = panel?.querySelector?.(`[data-trace-display-field="${brightKey}"]`);
    if (bright) {
      next[brightKey] = Number(bright.value);
    }
    const color = panel?.querySelector?.(`[data-trace-display-color="${colorKey}"]`);
    if (color) {
      next[colorKey] = color.value;
    }
  }
  const activeCorner = panel?.querySelector?.("[data-plugin-btn-corner].active, [data-plugin-btn-corner][aria-pressed='true']");
  if (activeCorner) {
    next.cornerShape = activeCorner.getAttribute("data-plugin-btn-corner") === "pill"
      ? "pill"
      : "squircle";
  }
  return normalizeNodeGraphPluginButtonDisplaySettings(next);
}
