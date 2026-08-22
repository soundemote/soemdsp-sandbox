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
