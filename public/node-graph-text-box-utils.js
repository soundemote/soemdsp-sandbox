function nodeGraphOneLineText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function nodeGraphTextBoxOneLineText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ");
}

/**
 * Text Box layout modes:
 * - singleLine — one line, no wrap; Size sets font
 * - multiline  — wraps in the face; Size sets font
 * Legacy "fill" stores as multiline.
 */
function normalizeNodeGraphTextBoxMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (
    mode === "multiline"
    || mode === "multi"
    || mode === "multi-line"
    || mode === "fill"
    || mode === "multilinefill"
    || mode === "multiline-fill"
    || mode === "fit"
  ) {
    return "multiline";
  }
  return "singleLine";
}

function nodeGraphTextBoxModeIsMultiline(mode) {
  return normalizeNodeGraphTextBoxMode(mode) === "multiline";
}

function normalizeNodeGraphTextBoxHorizontalAlign(value) {
  const align = String(value || "").toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "center";
}

/**
 * Vertical % places the *center* of the text block along the face height:
 *   0   → text center on the top edge (half clips above)
 *   50  → text centered in the face (default)
 *   100 → text center on the bottom edge (half clips below)
 */
const nodeGraphTextBoxVerticalAlignLimits = Object.freeze({
  maxPercent: 100,
  minPercent: 0,
  defaultPercent: 50,
});

/** Old bipolar −100…+100 (0 = center) → new 0…100 center-point. */
function nodeGraphTextBoxMigrateBipolarVerticalPercent(value) {
  const bipolar = Math.round(Number(value));
  if (!Number.isFinite(bipolar)) {
    return nodeGraphTextBoxVerticalAlignLimits.defaultPercent;
  }
  return Math.max(
    nodeGraphTextBoxVerticalAlignLimits.minPercent,
    Math.min(
      nodeGraphTextBoxVerticalAlignLimits.maxPercent,
      Math.round((bipolar + 100) / 2),
    ),
  );
}

function normalizeNodeGraphTextBoxVerticalAlignPercent(value, options = {}) {
  const align = String(value || "").toLowerCase();
  if (align === "top") {
    return 0;
  }
  if (align === "bottom") {
    return 100;
  }
  if (align === "center" || align === "middle") {
    return nodeGraphTextBoxVerticalAlignLimits.defaultPercent;
  }
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return nodeGraphTextBoxVerticalAlignLimits.defaultPercent;
  }
  if (options.fromBipolar) {
    return nodeGraphTextBoxMigrateBipolarVerticalPercent(numeric);
  }
  return Math.max(
    nodeGraphTextBoxVerticalAlignLimits.minPercent,
    Math.min(nodeGraphTextBoxVerticalAlignLimits.maxPercent, numeric),
  );
}

const nodeGraphTextBoxTextSizeLimits = Object.freeze({
  maxPercent: 1000,
  minPercent: 50,
  stepPercent: 10,
});

function normalizeNodeGraphTextBoxTextSizePercent(value) {
  const textSizePercent = Math.round(Number(value));
  return Number.isFinite(textSizePercent)
    ? Math.max(
      nodeGraphTextBoxTextSizeLimits.minPercent,
      Math.min(nodeGraphTextBoxTextSizeLimits.maxPercent, textSizePercent),
    )
    : 100;
}

const NODE_GRAPH_TEXT_BOX_DEFAULT_BACKGROUND = "#020407";
const NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_COLOR = "#f3f1ec";
/** Match the previous hardcoded Cascadia Mono face (app font catalog id). */
const NODE_GRAPH_TEXT_BOX_DEFAULT_FONT = "cascadia-mono";
/** Same 100–900 step scale as Keypad Boldness (shared clamp). */
const NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_WEIGHT = typeof NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT === "number"
  ? NODE_GRAPH_APP_FONT_WEIGHT_DEFAULT
  : 400;

function normalizeNodeGraphTextBoxTextWeight(value) {
  if (typeof nodeGraphAppClampFontWeight === "function") {
    return nodeGraphAppClampFontWeight(value, NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_WEIGHT);
  }
  const n = Math.round(Number(value) / 100) * 100;
  if (!Number.isFinite(n)) {
    return NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_WEIGHT;
  }
  return Math.max(100, Math.min(900, n));
}

/** CSS line-height multiplier for Multi / newlines (matches prior face default 1.2). */
const NODE_GRAPH_TEXT_BOX_DEFAULT_LINE_HEIGHT = 1.2;
const nodeGraphTextBoxLineHeightLimits = Object.freeze({
  max: 3,
  min: 0.5,
  step: 0.05,
});

function normalizeNodeGraphTextBoxLineHeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return NODE_GRAPH_TEXT_BOX_DEFAULT_LINE_HEIGHT;
  }
  const stepped = Math.round(n / nodeGraphTextBoxLineHeightLimits.step)
    * nodeGraphTextBoxLineHeightLimits.step;
  return Math.max(
    nodeGraphTextBoxLineHeightLimits.min,
    Math.min(nodeGraphTextBoxLineHeightLimits.max, Number(stepped.toFixed(2))),
  );
}

function nodeGraphTextBoxNormalizeHex(value, fallback) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    const r = text[1];
    const g = text[2];
    const b = text[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function normalizeNodeGraphTextBoxLayout(layout = {}) {
  const source = layout && typeof layout === "object" ? layout : {};
  const textMode = normalizeNodeGraphTextBoxMode(source.textMode || source.mode);
  const text = textMode === "singleLine"
    ? nodeGraphTextBoxOneLineText(source.text)
    : String(source.text ?? "");
  // Schema 2 = center-point 0…100. Older saves used bipolar −100…+100 with verticalBipolar.
  const verticalSchema = Number(source.verticalAlignSchema);
  const fromBipolar = source.verticalBipolar === true && verticalSchema !== 2;
  const font = typeof nodeGraphAppNormalizeFont === "function"
    ? nodeGraphAppNormalizeFont(source.font, NODE_GRAPH_TEXT_BOX_DEFAULT_FONT)
    : String(source.font || NODE_GRAPH_TEXT_BOX_DEFAULT_FONT).trim().toLowerCase() || NODE_GRAPH_TEXT_BOX_DEFAULT_FONT;
  return {
    backgroundColor: nodeGraphTextBoxNormalizeHex(
      source.backgroundColor,
      NODE_GRAPH_TEXT_BOX_DEFAULT_BACKGROUND,
    ),
    font,
    horizontalAlign: normalizeNodeGraphTextBoxHorizontalAlign(source.horizontalAlign || source.textAlign),
    kind: "textBox",
    text,
    textColor: nodeGraphTextBoxNormalizeHex(
      source.textColor,
      NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_COLOR,
    ),
    textSizePercent: normalizeNodeGraphTextBoxTextSizePercent(source.textSizePercent),
    textWeight: normalizeNodeGraphTextBoxTextWeight(
      source.textWeight ?? source.boldness ?? source.fontWeight,
    ),
    lineHeight: normalizeNodeGraphTextBoxLineHeight(
      source.lineHeight ?? source.lineSpacing ?? source.newlineSpacing,
    ),
    textMode,
    verticalAlignSchema: 2,
    verticalAlignPercent: normalizeNodeGraphTextBoxVerticalAlignPercent(
      source.verticalAlignPercent ?? source.verticalAlign,
      { fromBipolar },
    ),
  };
}

function nodeGraphTextBoxFontFamily(value) {
  if (typeof nodeGraphAppFontFamily === "function") {
    return nodeGraphAppFontFamily(value, NODE_GRAPH_TEXT_BOX_DEFAULT_FONT);
  }
  return "\"Cascadia Mono\", \"Cascadia Code\", Consolas, \"Courier New\", monospace";
}
