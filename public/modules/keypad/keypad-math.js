// Keypad — 12-slot phone pad. Slot math is shared by live + worklet.
// Script select is reserved (hasScript / script) and not wired yet.

const NODE_GRAPH_KEYPAD_LABELS = Object.freeze([
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "*", "0", "#",
]);

const NODE_GRAPH_KEYPAD_COUNT = NODE_GRAPH_KEYPAD_LABELS.length;

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
    return nodeGraphKeypadWrap(options.pointerSlot, count);
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

function createNodeGraphKeypadState() {
  return {
    down: 0,
    pointerSlot: null,
  };
}

function nodeGraphKeypadSample(state, options = {}) {
  const down = state?.down ? 1 : 0;
  const slot = nodeGraphKeypadResolveSlot({
    analog: options.analog,
    count: NODE_GRAPH_KEYPAD_COUNT,
    digital: options.digital,
    down,
    hasAnalog: options.hasAnalog,
    hasDigital: options.hasDigital,
    hasPointer: down,
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

function nodeGraphKeypadClampUnit(value, fallback = 0.94) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function nodeGraphKeypadClampWidth(value) {
  return nodeGraphKeypadClampUnit(value, 0.94);
}

function nodeGraphKeypadClampHeight(value) {
  return nodeGraphKeypadClampUnit(value, 0.94);
}

function nodeGraphKeypadClampButtonSize(value) {
  return nodeGraphKeypadClampUnit(value, 1);
}

function nodeGraphKeypadNormalizeFlag(value, fallback = true) {
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
    return 0;
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

const NODE_GRAPH_KEYPAD_FONTS = Object.freeze([
  { id: "thasadith", family: "\"Thasadith\", sans-serif", label: "Thasadith" },
  { id: "poiret-one", family: "\"Poiret One\", sans-serif", label: "Poiret One" },
  { id: "big-shoulders", family: "\"Big Shoulders\", sans-serif", label: "Big Shoulders" },
  { id: "tenor-sans", family: "\"Tenor Sans\", sans-serif", label: "Tenor Sans" },
  { id: "zen-loop", family: "\"Zen Loop\", sans-serif", label: "Zen Loop" },
]);

function nodeGraphKeypadNormalizeFont(value) {
  const id = String(value || "").trim().toLowerCase();
  if (NODE_GRAPH_KEYPAD_FONTS.some((font) => font.id === id)) {
    return id;
  }
  return "poiret-one";
}

function nodeGraphKeypadFontFamily(value) {
  const id = nodeGraphKeypadNormalizeFont(value);
  return NODE_GRAPH_KEYPAD_FONTS.find((font) => font.id === id)?.family
    || "\"Poiret One\", sans-serif";
}

function nodeGraphKeypadClampTextSize(value, legacyPx) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 64) {
      return nodeGraphKeypadClampUnit(n / 48, 0.55);
    }
    return nodeGraphKeypadClampUnit(n, 0.55);
  }
  const px = Number(legacyPx);
  if (Number.isFinite(px)) {
    if (px > 1) {
      return nodeGraphKeypadClampUnit(px / 48, 0.55);
    }
    return nodeGraphKeypadClampUnit(px, 0.55);
  }
  return 0.55;
}

function nodeGraphKeypadClampPixelSize(value) {
  return nodeGraphKeypadClampTextSize(value);
}

function nodeGraphKeypadClampWeight(value) {
  const n = Math.round(Number(value) / 100) * 100;
  if (!Number.isFinite(n)) return 400;
  return Math.max(100, Math.min(900, n));
}

function nodeGraphKeypadNormalizeCorner(value) {
  return String(value || "").trim().toLowerCase() === "pill" ? "pill" : "squircle";
}

function nodeGraphKeypadClampRounding(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function nodeGraphKeypadClampStroke(value, legacyPx) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 16) {
      return nodeGraphKeypadClampUnit(n / 16, 0);
    }
    return nodeGraphKeypadClampUnit(n, 0);
  }
  const px = Number(legacyPx);
  if (Number.isFinite(px)) {
    if (px > 1) {
      return nodeGraphKeypadClampUnit(px / 16, 0);
    }
    return nodeGraphKeypadClampUnit(px, 0);
  }
  return 0;
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
  return {
    backgroundColor: nodeGraphKeypadNormalizeHex(source.backgroundColor, "#f4f3f0"),
    buttonColor: nodeGraphKeypadNormalizeHex(source.buttonColor, "#f3f1ec"),
    downColor: nodeGraphKeypadNormalizeHex(source.downColor ?? source.mouseDownColor, "#c4bdb3"),
    hoverColor: nodeGraphKeypadNormalizeHex(source.hoverColor ?? source.mouseHoverColor, "#ddd9d2"),
    buttonHeight: nodeGraphKeypadClampHeight(source.buttonHeight),
    buttonSize: nodeGraphKeypadClampButtonSize(source.buttonSize ?? source.buttonMultiplier),
    buttonWidth: nodeGraphKeypadClampWidth(source.buttonWidth),
    padPx: nodeGraphKeypadClampPadPx(source.padPx ?? source.paddingPx ?? source.padding),
    squareRatio: nodeGraphKeypadNormalizeFlag(source.squareRatio ?? source.square, true),
    cornerShape: nodeGraphKeypadNormalizeCorner(source.cornerShape),
    font: nodeGraphKeypadNormalizeFont(source.font),
    rounding: nodeGraphKeypadClampRounding(source.rounding),
    stroke: nodeGraphKeypadClampStroke(source.stroke, source.strokePx),
    strokeColor: nodeGraphKeypadNormalizeHex(
      source.strokeColor,
      nodeGraphKeypadNormalizeHex(source.textColor, "#2d2d2d"),
    ),
    backgroundImage: nodeGraphKeypadNormalizeKeyImage(
      source.backgroundImage ?? source.bgImage ?? source.faceImage,
    ),
    keyImages: nodeGraphKeypadNormalizeKeyImages(source.keyImages ?? source.images),
    kind: "keypad",
    textColor: nodeGraphKeypadNormalizeHex(source.textColor, "#2d2d2d"),
    textSize,
    textSizePx: textSize,
    textWeight: nodeGraphKeypadClampWeight(source.textWeight ?? source.boldness),
  };
}
