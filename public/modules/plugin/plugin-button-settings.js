// Toggle and Momentary share one Display Settings set.
// Scales are 0…1 of the face. Active and inactive colors blend by the
// Bias smoother. Hover is an instant color, not a fade.

const NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS = Object.freeze([
  "strokeScale",
  "buttonScale",
  "textScale",
  "padding",
]);

const NODE_GRAPH_PLUGIN_BUTTON_COLOR_FIELDS = Object.freeze([
  "strokeColor",
  "inactiveColor",
  "activeColor",
  "hoverColor",
]);

const NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS = Object.freeze({
  strokeScale: 0.06,
  buttonScale: 1,
  textScale: 0.72,
  padding: 0,
  strokeColor: "#5c5071",
  inactiveColor: "#1a2228",
  activeColor: "#2f8f86",
  hoverColor: "#89bfc2",
});

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

function normalizeNodeGraphPluginButtonDisplaySettings(settings) {
  const d = NODE_GRAPH_PLUGIN_BUTTON_DISPLAY_DEFAULTS;
  const src = settings && typeof settings === "object" ? settings : {};
  return {
    strokeScale: nodeGraphPluginButtonClamp01(src.strokeScale, d.strokeScale),
    buttonScale: nodeGraphPluginButtonClamp01(src.buttonScale, d.buttonScale),
    textScale: nodeGraphPluginButtonClamp01(src.textScale ?? src.textSize, d.textScale),
    padding: nodeGraphPluginButtonClamp01(src.padding, d.padding),
    strokeColor: nodeGraphPluginButtonNormalizeHex(src.strokeColor ?? src.buttonStrokeColor, d.strokeColor),
    inactiveColor: nodeGraphPluginButtonNormalizeHex(src.inactiveColor ?? src.buttonColor, d.inactiveColor),
    activeColor: nodeGraphPluginButtonNormalizeHex(src.activeColor ?? src.onColor, d.activeColor),
    hoverColor: nodeGraphPluginButtonNormalizeHex(src.hoverColor, d.hoverColor),
  };
}

function nodeGraphPluginButtonDisplaySettingsForNode(node) {
  return normalizeNodeGraphPluginButtonDisplaySettings(node?.traceDisplaySettings);
}

function nodeGraphPluginButtonFaceLabels(node) {
  const patchNode = typeof node === "string" && typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(node)
    : node;
  const type = patchNode?.type || "";
  const fallbackOff = type === "momentaryButton" ? "Gate" : "Off";
  const fallbackOn = type === "momentaryButton" ? "Gate" : "On";
  return { off: fallbackOff, on: fallbackOn };
}

function nodeGraphPluginButtonStrokePixels(strokeScale, boxPx) {
  const t = nodeGraphPluginButtonClamp01(strokeScale, 0);
  const max = Math.max(0, Number(boxPx) * 0.5);
  return t * max;
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
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings);
  const btn = face.querySelector(".node-plugin-toggle-button, .node-plugin-momentary-button");
  face.style.setProperty("--plugin-btn-scale", String(s.buttonScale));
  if (!btn) return;
  const faceW = face.clientWidth || 0;
  const faceH = face.clientHeight || 0;
  const padPx = s.padding * Math.min(faceW, faceH) * 0.5;
  face.style.padding = `${padPx}px`;
  const innerW = Math.max(0, faceW - padPx * 2);
  const innerH = Math.max(0, faceH - padPx * 2);
  const box = Math.min(innerW, innerH) * s.buttonScale;
  btn.style.width = `${innerW * s.buttonScale}px`;
  btn.style.height = `${innerH * s.buttonScale}px`;
  const strokePx = nodeGraphPluginButtonStrokePixels(s.strokeScale, box || Math.min(faceW, faceH));
  btn.style.setProperty("--plugin-btn-stroke", s.strokeColor);
  btn.style.setProperty("--plugin-btn-stroke-w", `${strokePx}px`);
  btn.style.setProperty("--plugin-btn-inactive", s.inactiveColor);
  btn.style.setProperty("--plugin-btn-active", s.activeColor);
  btn.style.setProperty("--plugin-btn-hover", s.hoverColor);
  const radius = Math.max(0, box * 0.12);
  btn.style.setProperty("--plugin-btn-radius", `${radius}px`);
  btn.style.fontSize = `${nodeGraphPluginButtonFitFontPx(btn, s.textScale, box)}px`;
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

function buildNodeGraphPluginButtonDisplaySettingsBodyHtml() {
  const colorRow = typeof nodeGraphDisplaySettingsBuildColorRowHtml === "function"
    ? nodeGraphDisplaySettingsBuildColorRowHtml
    : () => "";
  const formType = "toggleButtonFace";
  const slider = (key, label) => `
      <label class="node-led-settings-row">
        <span>${label}</span>
        <input type="range" min="0" max="1" step="0.01" data-plugin-btn-field="${key}" aria-label="${label} 0–1">
      </label>`;
  return `
    <div class="node-led-display-settings-panel" data-plugin-button-display-settings-panel>
      ${slider("strokeScale", "Stroke scale")}
      ${slider("buttonScale", "Button scale")}
      ${slider("textScale", "Text scale")}
      ${slider("padding", "Padding")}
      ${colorRow("strokeColor", formType)}
      ${colorRow("activeColor", formType)}
      ${colorRow("inactiveColor", formType)}
      ${colorRow("hoverColor", formType)}
    </div>`;
}

function syncNodeGraphPluginButtonDisplaySettingsControls(root, settings) {
  if (!root || !settings) return;
  const s = normalizeNodeGraphPluginButtonDisplaySettings(settings);
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const el = root.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (el && document.activeElement !== el) el.value = String(s[key]);
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
  host.addEventListener("input", (event) => {
    if (event.target?.closest?.("[data-plugin-btn-field]")) apply("none", false);
  });
  host.addEventListener("change", (event) => {
    if (event.target?.closest?.("[data-plugin-btn-field]")) apply("immediate", true);
  });
}

function readNodeGraphPluginButtonDisplaySettingsForm(root, current) {
  const panel = root?.querySelector?.("[data-plugin-button-display-settings-panel]") || root;
  const next = { ...(current && typeof current === "object" ? current : {}) };
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_SLIDER_FIELDS) {
    const input = panel?.querySelector?.(`[data-plugin-btn-field="${key}"]`);
    if (input) next[key] = Number(input.value);
  }
  for (const key of NODE_GRAPH_PLUGIN_BUTTON_COLOR_FIELDS) {
    const input = panel?.querySelector?.(`[data-trace-display-color="${key}"]`);
    if (input && input.value) next[key] = input.value;
  }
  return normalizeNodeGraphPluginButtonDisplaySettings(next);
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
