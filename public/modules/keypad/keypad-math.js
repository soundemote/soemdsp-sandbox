// Keypad — 12-slot phone pad. Slot math is shared by live + worklet.
// Script select is reserved (hasScript / script) and not wired yet.

const NODE_GRAPH_KEYPAD_LABELS = Object.freeze([
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "*", "0", "#",
]);

const NODE_GRAPH_KEYPAD_COUNT = NODE_GRAPH_KEYPAD_LABELS.length;
const NODE_GRAPH_KEYPAD_LABELS_TEXT = NODE_GRAPH_KEYPAD_LABELS.join("");

function nodeGraphKeypadNormalizeLabels(value) {
  const fallback = NODE_GRAPH_KEYPAD_LABELS;
  const chars = Array.from(String(value ?? ""));
  const next = [];
  for (let i = 0; i < NODE_GRAPH_KEYPAD_COUNT; i += 1) {
    const ch = chars[i];
    next.push(ch != null && String(ch) !== "" ? String(ch) : (fallback[i] || " "));
  }
  return next.join("");
}

function nodeGraphKeypadLabelsList(value) {
  const text = nodeGraphKeypadNormalizeLabels(
    value == null || value === "" ? NODE_GRAPH_KEYPAD_LABELS_TEXT : value,
  );
  return Array.from(text).slice(0, NODE_GRAPH_KEYPAD_COUNT);
}

function nodeGraphKeypadWrap(value, count = NODE_GRAPH_KEYPAD_COUNT) {
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_KEYPAD_COUNT));
  const raw = Math.round(Number(value) || 0);
  return ((raw % n) + n) % n;
}

function nodeGraphKeypadAnalogSlot(analog, count = NODE_GRAPH_KEYPAD_COUNT) {
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_KEYPAD_COUNT));
  const unit = Math.max(0, Math.min(1, Number(analog) || 0));
  if (!(unit > 0)) {
    return null;
  }
  return Math.min(n - 1, Math.floor(unit * n - 1e-9));
}

/** Digital/script 1 = key "1". 0 = idle (no key). */
function nodeGraphKeypadDigitalToSlot(digital, count = NODE_GRAPH_KEYPAD_COUNT) {
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_KEYPAD_COUNT));
  const value = Math.round(Number(digital) || 0);
  if (value <= 0) {
    return null;
  }
  return nodeGraphKeypadWrap(value - 1, n);
}

function nodeGraphKeypadSlotToDigital(slot, count = NODE_GRAPH_KEYPAD_COUNT) {
  if (slot == null || !Number.isFinite(Number(slot))) {
    return 0;
  }
  return nodeGraphKeypadWrap(slot, count) + 1;
}

function nodeGraphKeypadSlotToAnalog(slot, count = NODE_GRAPH_KEYPAD_COUNT) {
  const n = Math.max(1, Math.round(Number(count) || NODE_GRAPH_KEYPAD_COUNT));
  const digital = nodeGraphKeypadSlotToDigital(slot, n);
  if (digital <= 0 || n <= 0) {
    return 0;
  }
  return digital / n;
}

/** 4×3 pad: X left→right 0–1, Y bottom→top 0–1. */
function nodeGraphKeypadSlotToXY(slot) {
  const s = nodeGraphKeypadWrap(slot);
  const col = s % 3;
  const row = Math.floor(s / 3);
  return {
    X: col / 2,
    Y: 1 - row / 3,
  };
}

/**
 * Resolve the audible/visible slot.
 * Priority (when we add script later): script → digital → analog → pointer.
 */
function nodeGraphKeypadResolveSlot(options = {}) {
  const count = Math.max(1, Math.round(Number(options.count) || NODE_GRAPH_KEYPAD_COUNT));
  const offset = nodeGraphKeypadWrap(options.offset, count);
  const applyOffset = (slot) => (
    slot == null ? null : nodeGraphKeypadWrap(slot + offset, count)
  );
  if (options.hasScript) {
    return applyOffset(nodeGraphKeypadDigitalToSlot(options.script, count));
  }
  if (options.hasDigital) {
    return applyOffset(nodeGraphKeypadDigitalToSlot(options.digital, count));
  }
  if (options.hasAnalog) {
    return applyOffset(nodeGraphKeypadAnalogSlot(options.analog, count));
  }
  if (options.down || options.hasPointer) {
    if (options.pointerSlot == null || !Number.isFinite(Number(options.pointerSlot))) {
      return null;
    }
    return applyOffset(options.pointerSlot);
  }
  return null;
}

function nodeGraphKeypadIsLatch(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "latch" || raw === "1") return true;
  const n = Number(value);
  return Number.isFinite(n) && Math.round(n) >= 1;
}

/** Drag defaults on. Off / 0 disables glide across keys. */
function nodeGraphKeypadDragEnabled(value) {
  if (value === undefined || value === null || value === "") {
    return true;
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") {
    return false;
  }
  if (raw === "on" || raw === "true" || raw === "1") {
    return true;
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    return Math.round(n) >= 1;
  }
  return true;
}

function nodeGraphKeypadStoredSlot(params) {
  const raw = params?.slot;
  if (raw === "" || raw == null) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return nodeGraphKeypadWrap(n);
}

function createNodeGraphKeypadState() {
  return {
    down: 0,
    latched: 0,
    needsRestore: true,
    pointerSlot: null,
  };
}

function nodeGraphKeypadSample(state, options = {}) {
  const latch = nodeGraphKeypadIsLatch(options.mode);
  if (state && state.needsRestore) {
    state.needsRestore = false;
    if (latch) {
      const stored = nodeGraphKeypadStoredSlot({ slot: options.slot });
      if (stored != null) {
        state.pointerSlot = stored;
        state.latched = 1;
        state.down = 1;
      }
    }
  }
  const pointerLive = latch
    ? Boolean(state?.latched && state?.pointerSlot != null)
    : Boolean(state?.down);
  const down = pointerLive ? 1 : 0;
  const slot = nodeGraphKeypadResolveSlot({
    analog: options.analog,
    count: NODE_GRAPH_KEYPAD_COUNT,
    digital: options.digital,
    down,
    hasAnalog: options.hasAnalog,
    hasDigital: options.hasDigital,
    hasPointer: pointerLive,
    hasScript: options.hasScript,
    offset: options.offset,
    pointerSlot: state?.pointerSlot ?? options.pointerSlot,
    script: options.script,
  });
  const held = down;
  const cvHeld = slot != null && (options.hasDigital || options.hasAnalog || options.hasScript) ? 1 : 0;
  const xy = slot == null ? { X: 0, Y: 0 } : nodeGraphKeypadSlotToXY(slot);
  const digital = nodeGraphKeypadSlotToDigital(slot);
  return {
    Analog: nodeGraphKeypadSlotToAnalog(slot),
    Digital: digital,
    Gate: held || cvHeld ? 1 : 0,
    Index: digital,
    X: xy.X,
    Y: xy.Y,
  };
}

const NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS = Object.freeze({
  backgroundColor: "#000000",
  buttonColor: "#c4c2a6",
  buttonHeight: 1,
  buttonSize: 1,
  buttonWidth: 1,
  cornerShape: "squircle",
  downColor: "#d9d9d9",
  font: "thasadith",
  hoverColor: "#89bfc2",
  padPx: 2,
  rounding: 48.2527147087858,
  squareRatio: false,
  stroke: 0.0705278719888686,
  strokeColor: "#5c5071",
  textColor: "#2d2d2d",
  textSize: 0.87708066581306,
  textWeight: 900,
  labels: NODE_GRAPH_KEYPAD_LABELS_TEXT,
});

function nodeGraphKeypadClampUnit(value, fallback = NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.buttonWidth) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function nodeGraphKeypadClampWidth(value) {
  return nodeGraphKeypadClampUnit(value, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.buttonWidth);
}

function nodeGraphKeypadClampHeight(value) {
  return nodeGraphKeypadClampUnit(value, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.buttonHeight);
}

function nodeGraphKeypadClampButtonSize(value) {
  return nodeGraphKeypadClampUnit(value, 1);
}

function nodeGraphKeypadNormalizeFlag(value, fallback = NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.squareRatio) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === false || value === 0 || value === "false" || value === "0") {
    return false;
  }
  if (value === true || value === 1 || value === "true" || value === "1") {
    return true;
  }
  return fallback;
}

function nodeGraphKeypadClampPadPx(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.padPx;
  }
  return Math.max(0, Math.min(64, n));
}

/** 3×4 drawing box inside the padded keypad face. Square on = largest pack of equal cells. */
function nodeGraphKeypadGridMetrics(innerW, innerH, squareRatio) {
  const width = Math.max(0, Number(innerW) || 0);
  const height = Math.max(0, Number(innerH) || 0);
  if (squareRatio && width > 0 && height > 0) {
    const cell = Math.min(width / 3, height / 4);
    return {
      cell,
      height: cell * 4,
      width: cell * 3,
    };
  }
  return {
    cell: 0,
    height,
    width,
  };
}

function nodeGraphKeypadFontCatalog() {
  try {
    const catalog = typeof globalThis !== "undefined" ? globalThis.NODE_GRAPH_APP_FONTS : null;
    if (Array.isArray(catalog) && catalog.length) {
      return catalog;
    }
  } catch (_error) {
    // AudioWorklet: lexical NODE_GRAPH_APP_FONTS is not defined.
  }
  return Object.freeze([]);
}

const NODE_GRAPH_KEYPAD_FONTS = nodeGraphKeypadFontCatalog();

function nodeGraphKeypadNormalizeFont(value) {
  if (typeof nodeGraphAppNormalizeFont === "function") {
    return nodeGraphAppNormalizeFont(value, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.font);
  }
  const id = String(value || "").trim().toLowerCase();
  if (NODE_GRAPH_KEYPAD_FONTS.some((font) => font.id === id)) {
    return id;
  }
  return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.font;
}

function nodeGraphKeypadFontFamily(value) {
  if (typeof nodeGraphAppFontFamily === "function") {
    return nodeGraphAppFontFamily(value, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.font);
  }
  const id = nodeGraphKeypadNormalizeFont(value);
  return NODE_GRAPH_KEYPAD_FONTS.find((font) => font.id === id)?.family
    || "\"Thasadith\", sans-serif";
}

function nodeGraphKeypadClampTextSize(value, legacyPx) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 64) {
      return nodeGraphKeypadClampUnit(n / 48, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textSize);
    }
    return nodeGraphKeypadClampUnit(n, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textSize);
  }
  const px = Number(legacyPx);
  if (Number.isFinite(px)) {
    if (px > 1) {
      return nodeGraphKeypadClampUnit(px / 48, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textSize);
    }
    return nodeGraphKeypadClampUnit(px, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textSize);
  }
  return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textSize;
}

function nodeGraphKeypadClampPixelSize(value) {
  return nodeGraphKeypadClampTextSize(value);
}

function nodeGraphKeypadClampWeight(value) {
  if (typeof nodeGraphAppClampFontWeight === "function") {
    return nodeGraphAppClampFontWeight(value, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textWeight);
  }
  const n = Math.round(Number(value) / 100) * 100;
  if (!Number.isFinite(n)) return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.textWeight;
  return Math.max(100, Math.min(900, n));
}

function nodeGraphKeypadNormalizeCorner(value) {
  return String(value || "").trim().toLowerCase() === "pill" ? "pill" : "squircle";
}

function nodeGraphKeypadClampRounding(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.rounding;
  return Math.max(0, Math.min(100, n));
}

function nodeGraphKeypadClampStroke(value, legacyPx) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 16) {
      return nodeGraphKeypadClampUnit(n / 16, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.stroke);
    }
    return nodeGraphKeypadClampUnit(n, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.stroke);
  }
  const px = Number(legacyPx);
  if (Number.isFinite(px)) {
    if (px > 1) {
      return nodeGraphKeypadClampUnit(px / 16, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.stroke);
    }
    return nodeGraphKeypadClampUnit(px, NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.stroke);
  }
  return NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS.stroke;
}

function nodeGraphKeypadStrokePixels(stroke, widthPx, heightPx) {
  const t = nodeGraphKeypadClampStroke(stroke);
  const max = Math.max(0, Math.min(Number(widthPx) || 0, Number(heightPx) || 0) * 0.5);
  return Math.round(t * max);
}

function nodeGraphKeypadNormalizeHex(value, fallback) {
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

function nodeGraphKeypadNormalizeKeyImage(entry) {
  if (typeof nodeGraphNormalizeImageAsset === "function") {
    return nodeGraphNormalizeImageAsset(entry);
  }
  if (!entry || typeof entry !== "object") {
    return { dataUrl: "", fileName: "" };
  }
  const dataUrl = String(entry.dataUrl || entry.src || "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    return { dataUrl: "", fileName: "" };
  }
  return {
    dataUrl,
    fileName: String(entry.fileName || entry.name || "").slice(0, 180),
  };
}

function nodeGraphKeypadNormalizeKeyImages(list) {
  const source = Array.isArray(list) ? list : [];
  const count = typeof NODE_GRAPH_KEYPAD_COUNT === "number" ? NODE_GRAPH_KEYPAD_COUNT : 12;
  const next = [];
  for (let i = 0; i < count; i += 1) {
    next.push(nodeGraphKeypadNormalizeKeyImage(source[i]));
  }
  return next;
}

function normalizeNodeGraphKeypadLayout(layout = {}) {
  const source = layout && typeof layout === "object" ? layout : {};
  const textSize = nodeGraphKeypadClampTextSize(
    source.textSize ?? source.pixelSize,
    source.textSizePx,
  );
  const d = NODE_GRAPH_KEYPAD_LAYOUT_DEFAULTS;
  return {
    backgroundColor: nodeGraphKeypadNormalizeHex(source.backgroundColor, d.backgroundColor),
    buttonColor: nodeGraphKeypadNormalizeHex(source.buttonColor, d.buttonColor),
    downColor: nodeGraphKeypadNormalizeHex(source.downColor ?? source.mouseDownColor, d.downColor),
    hoverColor: nodeGraphKeypadNormalizeHex(source.hoverColor ?? source.mouseHoverColor, d.hoverColor),
    buttonHeight: nodeGraphKeypadClampHeight(source.buttonHeight),
    buttonSize: nodeGraphKeypadClampButtonSize(source.buttonSize ?? source.buttonMultiplier),
    buttonWidth: nodeGraphKeypadClampWidth(source.buttonWidth),
    padPx: nodeGraphKeypadClampPadPx(source.padPx ?? source.paddingPx ?? source.padding),
    squareRatio: nodeGraphKeypadNormalizeFlag(source.squareRatio ?? source.square, d.squareRatio),
    cornerShape: nodeGraphKeypadNormalizeCorner(source.cornerShape || d.cornerShape),
    font: nodeGraphKeypadNormalizeFont(source.font || d.font),
    rounding: nodeGraphKeypadClampRounding(source.rounding),
    stroke: nodeGraphKeypadClampStroke(source.stroke, source.strokePx),
    strokeColor: nodeGraphKeypadNormalizeHex(source.strokeColor, d.strokeColor),
    backgroundImage: nodeGraphKeypadNormalizeKeyImage(
      source.backgroundImage ?? source.bgImage ?? source.faceImage,
    ),
    keyImages: nodeGraphKeypadNormalizeKeyImages(source.keyImages ?? source.images),
    kind: "keypad",
    textColor: nodeGraphKeypadNormalizeHex(source.textColor, d.textColor),
    textSize,
    textSizePx: textSize,
    textWeight: nodeGraphKeypadClampWeight(source.textWeight ?? source.boldness),
    labels: nodeGraphKeypadNormalizeLabels(
      source.labels ?? source.keys ?? source.glyphs ?? d.labels,
    ),
  };
}
