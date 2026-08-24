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

const nodeGraphTextBoxVerticalAlignLimits = Object.freeze({
  maxPercent: 100,
  minPercent: -100,
});

function nodeGraphTextBoxMigrateLegacyVerticalPercent(value) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  // Legacy 0=top / 50=center / 100=bottom → bipolar 0=center.
  return Math.max(
    nodeGraphTextBoxVerticalAlignLimits.minPercent,
    Math.min(nodeGraphTextBoxVerticalAlignLimits.maxPercent, (numeric - 50) * 2),
  );
}

function normalizeNodeGraphTextBoxVerticalAlignPercent(value, options = {}) {
  const align = String(value || "").toLowerCase();
  if (align === "top") {
    return -100;
  }
  if (align === "bottom") {
    return 100;
  }
  if (align === "center" || align === "middle") {
    return 0;
  }
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (options.legacy) {
    return nodeGraphTextBoxMigrateLegacyVerticalPercent(numeric);
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
  const bipolarVertical = source.verticalBipolar === true;
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
    verticalBipolar: true,
    verticalAlignPercent: normalizeNodeGraphTextBoxVerticalAlignPercent(
      source.verticalAlignPercent ?? source.verticalAlign,
      { legacy: !bipolarVertical },
    ),
  };
}

function nodeGraphTextBoxFontFamily(value) {
  if (typeof nodeGraphAppFontFamily === "function") {
    return nodeGraphAppFontFamily(value, NODE_GRAPH_TEXT_BOX_DEFAULT_FONT);
  }
  return "\"Cascadia Mono\", \"Cascadia Code\", Consolas, \"Courier New\", monospace";
}
