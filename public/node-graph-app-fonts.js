// App-wide font catalog for Display Settings dropdowns.
// Loaded Google / bundled / system faces actually used in the sandbox UI.

const NODE_GRAPH_APP_FONTS = Object.freeze([
  { id: "thasadith", family: "\"Thasadith\", sans-serif", label: "Thasadith" },
  { id: "poiret-one", family: "\"Poiret One\", sans-serif", label: "Poiret One" },
  { id: "big-shoulders", family: "\"Big Shoulders\", sans-serif", label: "Big Shoulders" },
  { id: "tenor-sans", family: "\"Tenor Sans\", sans-serif", label: "Tenor Sans" },
  { id: "zen-loop", family: "\"Zen Loop\", sans-serif", label: "Zen Loop" },
  { id: "segoe-ui", family: "\"Segoe UI\", Arial, sans-serif", label: "Segoe UI" },
  { id: "arial", family: "Arial, sans-serif", label: "Arial" },
  { id: "system-ui", family: "system-ui, sans-serif", label: "System UI" },
  { id: "cascadia-mono", family: "\"Cascadia Mono\", \"Cascadia Code\", Consolas, monospace", label: "Cascadia Mono" },
  { id: "jetbrains-mono", family: "\"JetBrains Mono\", \"Cascadia Mono\", Consolas, monospace", label: "JetBrains Mono" },
  { id: "consolas", family: "Consolas, \"Courier New\", monospace", label: "Consolas" },
  { id: "courier-new", family: "\"Courier New\", monospace", label: "Courier New" },
  { id: "dseg7", family: "\"DSEG7 Classic\", Consolas, monospace", label: "DSEG7 Classic" },
]);

if (typeof globalThis !== "undefined") {
  globalThis.NODE_GRAPH_APP_FONTS = NODE_GRAPH_APP_FONTS;
}

function nodeGraphAppFontById(value) {
  const id = String(value || "").trim().toLowerCase();
  return NODE_GRAPH_APP_FONTS.find((font) => font.id === id) || null;
}

function nodeGraphAppNormalizeFont(value, fallback = "thasadith") {
  if (nodeGraphAppFontById(value)) {
    return String(value || "").trim().toLowerCase();
  }
  const fb = String(fallback || "thasadith").trim().toLowerCase();
  return nodeGraphAppFontById(fb) ? fb : "thasadith";
}

function nodeGraphAppFontFamily(value, fallback = "thasadith") {
  const id = nodeGraphAppNormalizeFont(value, fallback);
  return nodeGraphAppFontById(id)?.family || "\"Thasadith\", sans-serif";
}

function nodeGraphAppFontOptionsHtml(escapeHtml) {
  const escape = typeof escapeHtml === "function"
    ? escapeHtml
    : (typeof nodeGraphDisplaySettingsEscapeHtml === "function"
      ? nodeGraphDisplaySettingsEscapeHtml
      : (value) => String(value ?? ""));
  return NODE_GRAPH_APP_FONTS.map((font) => (
    `<option value="${escape(font.id)}">${escape(font.label)}</option>`
  )).join("");
}

/** CSS font-weight 100–900 in steps of 100 (Keypad Boldness, Text Box, …). */
const NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT = 400;

function nodeGraphAppClampFontWeight(value, fallback = NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT) {
  const n = Math.round(Number(value) / 100) * 100;
  if (!Number.isFinite(n)) {
    const fb = Math.round(Number(fallback) / 100) * 100;
    return Number.isFinite(fb)
      ? Math.max(100, Math.min(900, fb))
      : NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT;
  }
  return Math.max(100, Math.min(900, n));
}

/**
 * Shared Display Settings “Boldness” range row.
 * @param {string} fieldAttr  e.g. data-keypad-field / data-textbox-field
 */
function nodeGraphAppFontWeightSettingsRowHtml(fieldAttr = "data-textbox-field") {
  const attr = String(fieldAttr || "data-textbox-field").trim() || "data-textbox-field";
  const safeAttr = attr.replace(/[^\w-]/g, "");
  return `
      <label class="node-led-settings-row">
        <span>Boldness</span>
        <input type="range" min="100" max="900" step="100" ${safeAttr}="textWeight" aria-label="Font weight 100–900">
      </label>`;
}

if (typeof globalThis !== "undefined") {
  globalThis.nodeGraphAppClampFontWeight = nodeGraphAppClampFontWeight;
  globalThis.nodeGraphAppFontWeightSettingsRowHtml = nodeGraphAppFontWeightSettingsRowHtml;
  globalThis.NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT = NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT;
}
