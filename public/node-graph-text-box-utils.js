function nodeGraphOneLineText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function nodeGraphTextBoxOneLineText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ");
}

/**
 * Text Box layout modes:
 * - singleLine — one line, no wrap; manual size only
 * - multiline  — explicit newlines; shrink-to-fit width only
 * - fill       — multiline + grow/shrink font so text uses available box room
 */
function normalizeNodeGraphTextBoxMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "multiline" || mode === "multi" || mode === "multi-line") {
    return "multiline";
  }
  if (mode === "fill" || mode === "multilinefill" || mode === "multiline-fill" || mode === "fit") {
    return "fill";
  }
  return "singleLine";
}

function nodeGraphTextBoxModeIsMultiline(mode) {
  const m = normalizeNodeGraphTextBoxMode(mode);
  return m === "multiline" || m === "fill";
}

function normalizeNodeGraphTextBoxHorizontalAlign(value) {
  const align = String(value || "").toLowerCase();
  return ["left", "center", "right"].includes(align) ? align : "center";
}

const nodeGraphTextBoxVerticalAlignLimits = Object.freeze({
  maxPercent: 150,
  minPercent: -50,
});

function normalizeNodeGraphTextBoxVerticalAlignPercent(value) {
  const numeric = Math.round(Number(value));
  if (Number.isFinite(numeric)) {
    return Math.max(
      nodeGraphTextBoxVerticalAlignLimits.minPercent,
      Math.min(nodeGraphTextBoxVerticalAlignLimits.maxPercent, numeric),
    );
  }
  const align = String(value || "").toLowerCase();
  if (align === "top") {
    return 0;
  }
  if (align === "bottom") {
    return 100;
  }
  return 50;
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
  return {
    backgroundColor: nodeGraphTextBoxNormalizeHex(
      source.backgroundColor,
      NODE_GRAPH_TEXT_BOX_DEFAULT_BACKGROUND,
    ),
    horizontalAlign: normalizeNodeGraphTextBoxHorizontalAlign(source.horizontalAlign || source.textAlign),
    kind: "textBox",
    text,
    textColor: nodeGraphTextBoxNormalizeHex(
      source.textColor,
      NODE_GRAPH_TEXT_BOX_DEFAULT_TEXT_COLOR,
    ),
    textSizePercent: normalizeNodeGraphTextBoxTextSizePercent(source.textSizePercent),
    textMode,
    verticalAlignPercent: normalizeNodeGraphTextBoxVerticalAlignPercent(
      source.verticalAlignPercent ?? source.verticalAlign,
    ),
  };
}
