function normalizeNodeGraphPatchInfo(info = {}) {
  const bank = Math.round(Number(info.bank));
  const program = Math.round(Number(info.program));
  return {
    author: nodeGraphOneLineText(info.author),
    bank: Number.isFinite(bank) ? Math.max(0, Math.min(127, bank)) : 0,
    bankName: nodeGraphOneLineText(info.bankName),
    category: nodeGraphOneLineText(info.category),
    description: String(info.description ?? "").trim(),
    name: nodeGraphOneLineText(info.name),
    program: Number.isFinite(program) ? Math.max(0, Math.min(127, program)) : 0,
    tags: nodeGraphOneLineText(info.tags),
  };
}

function normalizeNodeGraphPatchAudio(audio = {}) {
  const targetSampleRate = Number(audio?.targetSampleRate);
  // Global 0.1V/Oct pitch reference: "pitchReferenceHz" is the frequency
  // sounded at "pitchReferenceMidiNote" (0.1V/Oct = midi/120 in this
  // sandbox's keyboard/pitch-quantizer convention). Any oscillator that
  // sets its own Frequency parameter equal to this value is, by
  // definition, in tune with a MIDI keyboard -- and doubling that
  // Frequency transposes the whole instrument up exactly one octave.
  // Defaults to C3 @ 100Hz (this sandbox's chosen standard) rather than
  // the more common A4/440Hz convention, which is available as a preset
  // in the Patch Settings panel for anyone who wants it instead.
  const pitchReferenceMidiNote = Number(audio?.pitchReferenceMidiNote);
  const pitchReferenceHz = Number(audio?.pitchReferenceHz);
  // Project Speed Limit: absolute max Hz for frequency domains / f-jack /
  // DSP clamps. User-adjustable (header + patch settings). Default 20000.
  // There is no project minimum frequency (0 is allowed on signals).
  const speedLimitHz = Number(audio?.speedLimitHz);
  const defaultLimit = typeof nodeGraphProjectSpeedLimitDefaultHz === "function"
    ? nodeGraphProjectSpeedLimitDefaultHz()
    : 20000;
  const controlMax = typeof NODE_GRAPH_PROJECT_SPEED_LIMIT_CONTROL_MAX_HZ === "number"
    ? NODE_GRAPH_PROJECT_SPEED_LIMIT_CONTROL_MAX_HZ
    : 192000;
  const safeSpeedLimit = Number.isFinite(speedLimitHz) && speedLimitHz > 0
    ? Math.min(controlMax, speedLimitHz)
    : defaultLimit;
  return {
    targetSampleRate: Number.isFinite(targetSampleRate)
      ? Math.max(8000, Math.min(768000, targetSampleRate))
      : 44100,
    pitchReferenceMidiNote: Number.isFinite(pitchReferenceMidiNote)
      ? Math.max(0, Math.min(127, pitchReferenceMidiNote))
      : 48,
    pitchReferenceHz: Number.isFinite(pitchReferenceHz) && pitchReferenceHz > 0
      ? Math.max(0.01, Math.min(safeSpeedLimit, pitchReferenceHz))
      : 100,
    speedLimitHz: safeSpeedLimit,
  };
}

function normalizeNodeGraphPatchTiming(timing = {}) {
  const tempoBpm = Math.round(Number(timing?.tempoBpm));
  const numerator = Math.round(Number(timing?.timeSignatureNumerator));
  const denominator = Math.round(Number(timing?.timeSignatureDenominator));
  return {
    tempoBpm: Number.isFinite(tempoBpm)
      ? Math.max(1, Math.min(320, tempoBpm))
      : 120,
    timeSignatureDenominator: Number.isFinite(denominator)
      ? Math.max(1, Math.min(32, denominator))
      : 4,
    timeSignatureNumerator: Number.isFinite(numerator)
      ? Math.max(1, Math.min(32, numerator))
      : 4,
  };
}

function normalizeNodeGraphPatchGrid(grid = {}) {
  const fallbackSize = Number(grid?.sizePx);
  const fallback = Number.isFinite(fallbackSize) && fallbackSize > 0
    ? fallbackSize
    : nodeGraphGrid.sizePx;
  const width = Number(grid?.widthPx);
  const height = Number(grid?.heightPx);
  const widthPx = Number.isFinite(width) && width > 0 ? width : fallback;
  const heightPx = Number.isFinite(height) && height > 0 ? height : fallback;
  return {
    heightPx: Math.max(8, Math.min(96, heightPx)),
    sizePx: Math.max(8, Math.min(96, Math.min(widthPx, heightPx))),
    widthPx: Math.max(8, Math.min(96, widthPx)),
  };
}

const nodeGraphScopeShaderDefaultSource = `video.input     = ~;
scope.mode      = 1d_full;
scope.sync      = inherit;
scope.cycles    = 2.0;
scope.zoom      = 1.0;
scope.length    = 1.0;
scope.padding   = 0.04;
scope.syncSpeed = 1.0;
dot1.color      = dot1.global.color;
dot1.size       = 1.0 * dot1.global.size;
dot1.blur       = 1.0 * dot1.global.blur;
dot1.brightness = 1.0 * dot1.global.brightness;
blend.mode      = laser;`;

const nodeGraphScopeShaderVisualOscilloscopeDefaultSource = nodeGraphScopeShaderDefaultSource
  .replace("scope.mode      = 1d_full;", "scope.mode      = x_y;");

const nodeGraphScopeShaderAudioPlayerDefaultSource = nodeGraphScopeShaderDefaultSource
  .replace("scope.mode      = 1d_full;", "scope.mode      = x_y;");

const nodeGraphCanvasScriptDefaultSource = `canvas.ratio(1, 1);
canvas.background = #00000000;
canvas.layout = oscilloscope;
canvas.grid(7, 12);
canvas.face.background = checkerboard;
canvas.face.screen = #000000;
bufferInput("a_buffer");
input("a not buffer");

layer("a_buffer").input   = a_buffer;
layer("a_buffer").x       = 0.5;
layer("a_buffer").y       = 0.5;
layer("a_buffer").scale   = 1.0;
layer("a_buffer").opacity = 1.0;

output = canvas;`;

const nodeGraphScreenSpaceShaderDefaultSource = `input("Shake");
input("Dim");
input("Red");
input("Green");
input("Blue");
input("X");
input("Y");
input("Scope Off");
input("Pause");
input("Trace Image");

screen.shake = Shake;
screen.dim = Dim;
screen.color = zrgba(Red, Green, Blue, 1);
screen.offset = vec2(X, Y);
screen.scopeOff = Scope Off;
screen.pause = Pause;
screen.traceImage = Trace Image;`;

const nodeGraphScopeShaderModes = Object.freeze(["1d_full", "1d_scan", "x_y", "one_value"]);
const nodeGraphScopeShaderBlendModes = Object.freeze(["laser", "led", "light", "paint", "solid", "heatmap"]);
const nodeGraphScopeShaderSyncModes = Object.freeze(["inherit", "on", "off"]);
const nodeGraphBufferedInputSampleLimit = 262144;

function nodeGraphScopeShaderDefaultSourceForType(type) {
  const moduleType = String(type || "");
  return moduleType === "visualOscilloscope" ||
      moduleType === "spiral" ||
      moduleType === "ellipsoid" ||
      moduleType === "lorenzAttractor"
    ? nodeGraphScopeShaderVisualOscilloscopeDefaultSource
    : moduleType === "audioPlayer"
      ? nodeGraphScopeShaderAudioPlayerDefaultSource
    : nodeGraphScopeShaderDefaultSource;
}

// Dot 2 has been removed app-wide. A node's saved typed-display settings
// (traceDisplaySettings / zeroDBurnSettings) may still carry legacy dot2*
// keys from before that change -- migrate them once at patch-load time,
// before the type-specific normalizer ever sees them:
// - Output nodes reused dot1/dot2 as Left/Right stereo channels, so their
//   dot2* keys get a straight rename onto the new secondary* fields.
// - Every other display type only ever used dot2 as a decorative second
//   dot layer. If dot1 was off and dot2 was the only visible dot, flip
//   dot1 back on and adopt dot2's look so the display doesn't go blank;
//   otherwise the dot2* keys are just dropped.
const nodeGraphLegacyDot2OutputRenameTable = Object.freeze({
  dot2Color: "secondaryColor",
  dot2Size: "secondarySize",
  dot2Brightness: "secondaryBrightness",
  dot2LineThickness: "secondaryLineThickness",
  dot2Enabled: "secondaryEnabled",
});

const nodeGraphLegacyDot2RescueRenameTable = Object.freeze({
  dot2Color: "dot1Color",
  dot2Size: "dot1Size",
  dot2Brightness: "dot1Brightness",
  dot2LineThickness: "lineThickness",
});

function migrateNodeGraphLegacyDot2Settings(settings, isOutput) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return settings;
  }
  const legacyKeys = Object.keys(nodeGraphLegacyDot2OutputRenameTable);
  if (!legacyKeys.some((key) => Object.hasOwn(settings, key))) {
    return settings;
  }
  const next = { ...settings };
  if (isOutput) {
    for (const [from, to] of Object.entries(nodeGraphLegacyDot2OutputRenameTable)) {
      if (Object.hasOwn(next, from)) {
        next[to] = next[from];
      }
    }
  } else if (next.dot1Enabled === false && next.dot2Enabled !== false) {
    next.dot1Enabled = true;
    for (const [from, to] of Object.entries(nodeGraphLegacyDot2RescueRenameTable)) {
      if (Object.hasOwn(next, from)) {
        next[to] = next[from];
      }
    }
  }
  for (const key of legacyKeys) {
    delete next[key];
  }
  return next;
}

function normalizeNodeGraphScopeShaderVideoInput(value = "~") {
  const text = String(value || "~").trim().toLowerCase();
  if (text === "none") {
    return "none";
  }
  if (/^output\d+$/.test(text)) {
    return text;
  }
  return "~";
}

function parseNodeGraphScopeShaderVideoInput(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*video\.input\s*=\s*(~|none|output\d+)\s*;/i);
  return normalizeNodeGraphScopeShaderVideoInput(match?.[1] || "~");
}

function normalizeNodeGraphScopeShaderMode(value = "1d_full") {
  const text = String(value || "1d_full").trim().toLowerCase();
  return nodeGraphScopeShaderModes.includes(text) ? text : "1d_full";
}

function parseNodeGraphScopeShaderMode(source = "") {
  let mode = "1d_full";
  for (const match of String(source || "").matchAll(/(?:^|\n)\s*scope\.mode\s*=\s*["']?(1d_full|1d_scan|x_y|one_value)["']?\s*;?/gi)) {
    mode = match[1];
  }
  return normalizeNodeGraphScopeShaderMode(mode);
}

function normalizeNodeGraphScopeShaderBlendMode(value = "laser") {
  const text = String(value || "laser").trim().toLowerCase();
  return nodeGraphScopeShaderBlendModes.includes(text) ? text : "laser";
}

function parseNodeGraphScopeShaderBlendMode(source = "") {
  let mode = "laser";
  for (const match of String(source || "").matchAll(/(?:^|\n)\s*blend\.mode\s*=\s*["']?(laser|led|light|paint|solid|heatmap)["']?\s*;?/gi)) {
    mode = match[1];
  }
  return normalizeNodeGraphScopeShaderBlendMode(mode);
}

function normalizeNodeGraphScopeShaderSync(value = "inherit") {
  const text = String(value || "inherit").trim().toLowerCase();
  return nodeGraphScopeShaderSyncModes.includes(text) ? text : "inherit";
}

function parseNodeGraphScopeShaderSync(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*scope\.sync\s*=\s*(inherit|on|off)\s*;/i);
  return normalizeNodeGraphScopeShaderSync(match?.[1] || "inherit");
}

function normalizeNodeGraphScopeShaderNumber(value, fallback, min, max) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  return Number.isFinite(number)
    ? Math.max(safeMin, Math.min(safeMax, number))
    : safeFallback;
}

function parseNodeGraphScopeShaderNumber(source = "", key = "", fallback = 0, min = -Infinity, max = Infinity) {
  const safeKey = String(key || "").replace(/[^\w]/g, "");
  if (!safeKey) {
    return normalizeNodeGraphScopeShaderNumber(fallback, fallback, min, max);
  }
  const match = String(source || "").match(new RegExp(`(?:^|\\n)\\s*scope\\.${safeKey}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;`, "i"));
  return normalizeNodeGraphScopeShaderNumber(match?.[1], fallback, min, max);
}

function normalizeNodeGraphScopeShader(scopeShader = {}) {
  const source = typeof scopeShader === "string"
    ? scopeShader
    : scopeShader && typeof scopeShader === "object"
      ? scopeShader.source
      : "";
  const language = String(scopeShader?.language || "scope-js").trim().slice(0, 32) || "scope-js";
  const normalizedSource = String(source || "").trim().slice(0, 100000);
  const normalizedVideoInput = parseNodeGraphScopeShaderVideoInput(normalizedSource);
  const normalizedMode = parseNodeGraphScopeShaderMode(normalizedSource);
  const normalizedBlendMode = parseNodeGraphScopeShaderBlendMode(normalizedSource);
  const normalizedSync = parseNodeGraphScopeShaderSync(normalizedSource);
  const normalizedCycles = parseNodeGraphScopeShaderNumber(normalizedSource, "cycles", 2, 1, 128);
  const normalizedZoom = parseNodeGraphScopeShaderNumber(normalizedSource, "zoom", 1, 0.01, 50);
  const normalizedLength = parseNodeGraphScopeShaderNumber(normalizedSource, "length", 1, 0, 1);
  const normalizedPadding = parseNodeGraphScopeShaderNumber(normalizedSource, "padding", 0.04, 0, 0.45);
  const normalizedSyncSpeed = parseNodeGraphScopeShaderNumber(normalizedSource, "syncSpeed", 1, 0, 50);
  return {
    cycles: normalizedCycles,
    blendMode: normalizedBlendMode,
    enabled: scopeShader?.enabled !== false,
    kind: "scopeShader",
    language,
    length: normalizedLength,
    mode: normalizedMode,
    padding: normalizedPadding,
    source: normalizedSource || nodeGraphScopeShaderDefaultSource,
    sync: normalizedSync,
    syncSpeed: normalizedSyncSpeed,
    videoInput: normalizedVideoInput,
    zoom: normalizedZoom,
  };
}

function normalizeNodeGraphCanvasScriptRatioValue(value, fallback = 1) {
  const number = Math.round(Number(value));
  const safeFallback = Math.max(1, Math.round(Number(fallback)) || 1);
  return Number.isFinite(number) ? Math.max(1, Math.min(1000, number)) : safeFallback;
}

function reduceNodeGraphCanvasScriptRatio(width, height) {
  let a = normalizeNodeGraphCanvasScriptRatioValue(width);
  let b = normalizeNodeGraphCanvasScriptRatioValue(height);
  const gcd = (x, y) => y ? gcd(y, x % y) : x;
  const divisor = gcd(a, b) || 1;
  a = Math.max(1, Math.round(a / divisor));
  b = Math.max(1, Math.round(b / divisor));
  return {
    aspectRatio: a / b,
    ratioHeight: b,
    ratioWidth: a,
  };
}

function parseNodeGraphCanvasScriptRatio(source = "") {
  const text = String(source || "");
  const ratioCall = text.match(/(?:^|\n)\s*canvas\.ratio\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*;/i);
  if (ratioCall) {
    return reduceNodeGraphCanvasScriptRatio(ratioCall[1], ratioCall[2]);
  }
  const ratioAssignment = text.match(/(?:^|\n)\s*canvas\.ratio\s*=\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*;/i);
  if (ratioAssignment) {
    return reduceNodeGraphCanvasScriptRatio(ratioAssignment[1], ratioAssignment[2]);
  }
  const legacySize = text.match(/(?:^|\n)\s*canvas\.size\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*;/i);
  if (legacySize) {
    return reduceNodeGraphCanvasScriptRatio(legacySize[1], legacySize[2]);
  }
  return reduceNodeGraphCanvasScriptRatio(1, 1);
}

function parseNodeGraphCanvasScriptGrid(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*canvas\.grid\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*;/i);
  const normalizeGridUnit = (value) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(1, Math.min(24, number)) : null;
  };
  return {
    heightGu: normalizeGridUnit(match?.[2]),
    widthGu: normalizeGridUnit(match?.[1]),
  };
}

function normalizeNodeGraphCanvasScriptIdentifier(value = "", fallback = "layer") {
  const text = String(value || "").trim().replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "");
  return text || fallback;
}

function normalizeNodeGraphCanvasScriptScalar(value = "", fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  return Number.isFinite(number)
    ? Math.max(safeMin, Math.min(safeMax, number))
    : safeFallback;
}

function normalizeNodeGraphCanvasScriptToken(value = "", fallback = "") {
  const text = String(value || "").trim();
  return text.replace(/^["']|["']$/g, "") || fallback;
}

function normalizeNodeGraphCanvasScriptHexColor(value = "", fallback = "#00000000", options = {}) {
  const text = normalizeNodeGraphCanvasScriptToken(value, fallback).toLowerCase();
  if (options.allowCheckerboard && text === "checkerboard") {
    return "checkerboard";
  }
  return /^#[0-9a-f]{3}(?:[0-9a-f]{1})?$|^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text)
    ? text
    : fallback;
}

function nodeGraphCanvasScriptColorIsTransparent(value = "") {
  const text = String(value || "").trim().toLowerCase();
  return text === "#0000" || /^[#][0-9a-f]{6}00$/i.test(text);
}

function normalizeNodeGraphBufferedInputName(value = "") {
  return String(value || "").trim().replace(/^["']|["']$/g, "").slice(0, 64);
}

function normalizeNodeGraphBufferedInputList(inputs = [], allowedPorts = []) {
  const allowed = new Set((allowedPorts || []).map((port) => String(port || "").trim()).filter(Boolean));
  const result = [];
  for (const input of inputs || []) {
    const name = normalizeNodeGraphBufferedInputName(input);
    if (!name || (allowed.size && !allowed.has(name)) || result.includes(name)) {
      continue;
    }
    result.push(name);
  }
  return result;
}

function parseNodeGraphCanvasScriptBufferedInputs(source = "", allowedPorts = []) {
  const names = [];
  const text = String(source || "");
  for (const match of text.matchAll(/(?:^|\n)\s*bufferInput\s*\(\s*([^)\n]+?)\s*\)\s*;/gi)) {
    names.push(normalizeNodeGraphCanvasScriptToken(match[1], ""));
  }
  return normalizeNodeGraphBufferedInputList(names, allowedPorts);
}

function parseNodeGraphCanvasScriptInputs(source = "") {
  const names = [];
  const text = String(source || "");
  for (const match of text.matchAll(/(?:^|\n)\s*(?:bufferInput|input)\s*\(\s*([^)\n]+?)\s*\)\s*;/gi)) {
    names.push(normalizeNodeGraphCanvasScriptToken(match[1], ""));
  }
  return normalizeNodeGraphBufferedInputList(names);
}

function parseNodeGraphScreenSpaceShaderInputs(source = "") {
  return parseNodeGraphCanvasScriptInputs(source);
}

function parseNodeGraphScreenSpaceShaderBufferedInputs(source = "", allowedPorts = []) {
  return parseNodeGraphCanvasScriptBufferedInputs(source, allowedPorts);
}

const nodeGraphScreenSpaceShaderPropertyMap = Object.freeze({
  blue: { key: "blue", mode: "intensity" },
  b: { key: "blue", mode: "intensity" },
  brightness: { key: "visualBrightness", mode: "intensity" },
  bloom: { key: "visualBloom", mode: "intensity" },
  dim: { key: "screenDim", mode: "intensity" },
  glow: { key: "visualGlow", mode: "intensity" },
  green: { key: "green", mode: "intensity" },
  g: { key: "green", mode: "intensity" },
  pause: { key: "scopePaused", mode: "intensity" },
  red: { key: "red", mode: "intensity" },
  r: { key: "red", mode: "intensity" },
  scopeoff: { key: "scopeTracesOff", mode: "intensity" },
  scopepaused: { key: "scopePaused", mode: "intensity" },
  scopetracesoff: { key: "scopeTracesOff", mode: "intensity" },
  screendim: { key: "screenDim", mode: "intensity" },
  shake: { key: "screenShake", mode: "intensity" },
  screenshake: { key: "screenShake", mode: "intensity" },
  traceimage: { key: "traceImage", mode: "raw" },
  tracetexture: { key: "traceImage", mode: "raw" },
  visualbloom: { key: "visualBloom", mode: "intensity" },
  visualbrightness: { key: "visualBrightness", mode: "intensity" },
  visualglow: { key: "visualGlow", mode: "intensity" },
  x: { key: "x", mode: "signed" },
  y: { key: "y", mode: "signed" },
});

function normalizeNodeGraphScreenSpaceShaderSourceToken(value = "") {
  return normalizeNodeGraphCanvasScriptToken(value, "").replace(/[^A-Za-z0-9_ .-]/g, "").trim();
}

function normalizeNodeGraphScreenSpaceShaderInputReference(value = "", allowedInputs = []) {
  const token = normalizeNodeGraphScreenSpaceShaderSourceToken(value);
  const lower = token.toLowerCase();
  return allowedInputs.find((input) => input.toLowerCase() === lower) || "";
}

function nodeGraphScreenSpaceShaderLabelForProperty(property = "") {
  const text = String(property || "").trim();
  if (!text) {
    return "";
  }
  const lower = text.toLowerCase();
  if (lower === "scopeoff" || lower === "scopetracesoff") {
    return "Scope Off";
  }
  if (lower === "scopepaused") {
    return "Pause";
  }
  if (lower === "screendim") {
    return "Dim";
  }
  if (lower === "screenshake") {
    return "Shake";
  }
  if (lower === "traceimage" || lower === "tracetexture") {
    return "Trace Image";
  }
  if (lower.startsWith("visual")) {
    return nodeGraphScreenSpaceShaderLabelForProperty(text.slice(6));
  }
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function parseNodeGraphScreenSpaceShaderVisualInputs(source = "", inputs = []) {
  const visualInputs = new Map();
  const addMapping = (key, label, port, mode = "intensity") => {
    if (!key || !port || !inputs.includes(port)) {
      return;
    }
    visualInputs.set(key, {
      key,
      label: label || port,
      mode,
      port,
    });
  };
  const text = String(source || "");
  for (const match of text.matchAll(/(?:^|\n)\s*screen\.([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^;\n]+)\s*;/gi)) {
    const property = String(match[1] || "").trim().toLowerCase();
    const expression = String(match[2] || "").trim();
    if (property === "color") {
      const colorMatch = expression.match(/z?rgba\s*\(\s*([^,\n]+)\s*,\s*([^,\n]+)\s*,\s*([^,\n]+)(?:\s*,\s*([^,\n]+))?\s*\)/i);
      if (colorMatch) {
        addMapping("red", "Red", normalizeNodeGraphScreenSpaceShaderInputReference(colorMatch[1], inputs), "intensity");
        addMapping("green", "Green", normalizeNodeGraphScreenSpaceShaderInputReference(colorMatch[2], inputs), "intensity");
        addMapping("blue", "Blue", normalizeNodeGraphScreenSpaceShaderInputReference(colorMatch[3], inputs), "intensity");
      }
      continue;
    }
    if (property === "offset") {
      const offsetMatch = expression.match(/vec2\s*\(\s*([^,\n]+)\s*,\s*([^,\n]+)\s*\)/i);
      if (offsetMatch) {
        addMapping("x", "X", normalizeNodeGraphScreenSpaceShaderInputReference(offsetMatch[1], inputs), "signed");
        addMapping("y", "Y", normalizeNodeGraphScreenSpaceShaderInputReference(offsetMatch[2], inputs), "signed");
      }
      continue;
    }
    const spec = nodeGraphScreenSpaceShaderPropertyMap[property];
    if (!spec) {
      continue;
    }
    addMapping(
      spec.key,
      nodeGraphScreenSpaceShaderLabelForProperty(property),
      normalizeNodeGraphScreenSpaceShaderInputReference(expression, inputs),
      spec.mode,
    );
  }
  return Array.from(visualInputs.values()).slice(0, 32);
}

function normalizeNodeGraphScreenSpaceShader(screenSpaceShader = {}) {
  const source = typeof screenSpaceShader === "string"
    ? screenSpaceShader
    : screenSpaceShader && typeof screenSpaceShader === "object"
      ? screenSpaceShader.source
      : "";
  const normalizedSource = String(source || "").trim().slice(0, 100000) || nodeGraphScreenSpaceShaderDefaultSource;
  const inputs = parseNodeGraphScreenSpaceShaderInputs(normalizedSource);
  return {
    bufferSampleLimit: nodeGraphBufferedInputSampleLimit,
    bufferedInputs: parseNodeGraphScreenSpaceShaderBufferedInputs(normalizedSource, inputs),
    enabled: screenSpaceShader?.enabled !== false,
    inputs,
    kind: "screenSpaceShader",
    language: String(screenSpaceShader?.language || "screen-space-js").trim().slice(0, 32) || "screen-space-js",
    source: normalizedSource,
    visualInputs: parseNodeGraphScreenSpaceShaderVisualInputs(normalizedSource, inputs),
  };
}

function parseNodeGraphCanvasScriptBackground(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*canvas\.background\s*=\s*([^;\n]+)\s*;/i);
  return normalizeNodeGraphCanvasScriptHexColor(match?.[1], "#00000000").slice(0, 64);
}

function parseNodeGraphCanvasScriptLayout(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*canvas\.layout\s*=\s*([^;\n]+)\s*;/i);
  const layout = normalizeNodeGraphCanvasScriptToken(match?.[1], "canvas").toLowerCase();
  if (layout === "oscilloscope" || layout === "scope" || layout === "visualscope") {
    return "oscilloscope";
  }
  return "canvas";
}

function parseNodeGraphCanvasScriptFace(source = "", canvasBackground = "#00000000") {
  const text = String(source || "");
  const token = (property, fallback = "", options = {}) => {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*canvas\\.face\\.${property}\\s*=\\s*([^;\\n]+)\\s*;`, "i"));
    return normalizeNodeGraphCanvasScriptHexColor(match?.[1], fallback, options).slice(0, 64);
  };
  const fitMatch = text.match(/(?:^|\n)\s*canvas\.face\.fit\s*=\s*([^;\n]+)\s*;/i);
  const fit = normalizeNodeGraphCanvasScriptToken(fitMatch?.[1], "contain").toLowerCase();
  return {
    background: token("background", "#000000", { allowCheckerboard: true }),
    fit: fit === "stretch" || fit === "fill" ? "stretch" : "contain",
    screen: token(
      "screen",
      nodeGraphCanvasScriptColorIsTransparent(canvasBackground) ? "#000000" : canvasBackground,
      { allowCheckerboard: true },
    ),
  };
}

function parseNodeGraphCanvasScriptOutput(source = "") {
  const match = String(source || "").match(/(?:^|\n)\s*output\s*=\s*([^;\n]+)\s*;/i);
  return normalizeNodeGraphCanvasScriptToken(match?.[1], "canvas").slice(0, 64);
}

function parseNodeGraphCanvasScriptLayers(source = "") {
  const layers = new Map();
  const ensureLayer = (name) => {
    const id = normalizeNodeGraphCanvasScriptIdentifier(name, `layer-${layers.size + 1}`);
    if (!layers.has(id)) {
      layers.set(id, {
        id,
        input: id,
        opacity: 1,
        rotation: 0,
        scale: 1,
        visible: true,
        x: 0.5,
        y: 0.5,
      });
    }
    return layers.get(id);
  };
  const pattern = /(?:^|\n)\s*layer\(\s*["']?([^"')]+)["']?\s*\)\.([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^;\n]+)\s*;/g;
  for (const match of String(source || "").matchAll(pattern)) {
    const layer = ensureLayer(match[1]);
    const key = String(match[2] || "").trim();
    const rawValue = normalizeNodeGraphCanvasScriptToken(match[3]);
    if (key === "input") {
      layer.input = normalizeNodeGraphCanvasScriptIdentifier(rawValue, layer.id);
    } else if (key === "x" || key === "y") {
      layer[key] = normalizeNodeGraphCanvasScriptScalar(rawValue, layer[key], 0, 1);
    } else if (key === "opacity") {
      layer.opacity = normalizeNodeGraphCanvasScriptScalar(rawValue, layer.opacity, 0, 1);
    } else if (key === "scale") {
      layer.scale = normalizeNodeGraphCanvasScriptScalar(rawValue, layer.scale, 0, 100);
    } else if (key === "rotation") {
      layer.rotation = normalizeNodeGraphCanvasScriptScalar(rawValue, layer.rotation, -360, 360);
    } else if (key === "visible") {
      layer.visible = !["false", "0", "off", "hidden"].includes(rawValue.toLowerCase());
    }
  }
  if (!layers.size) {
    ensureLayer("A");
    ensureLayer("B");
  }
  return Array.from(layers.values()).slice(0, 16);
}

function parseNodeGraphCanvasScriptModel(source = "") {
  const normalizedSource = String(source || "").trim() || nodeGraphCanvasScriptDefaultSource;
  const ratio = parseNodeGraphCanvasScriptRatio(normalizedSource);
  const grid = parseNodeGraphCanvasScriptGrid(normalizedSource);
  const background = parseNodeGraphCanvasScriptBackground(normalizedSource);
  const face = parseNodeGraphCanvasScriptFace(normalizedSource, background);
  return {
    aspectRatio: ratio.aspectRatio,
    background,
    bufferedInputs: parseNodeGraphCanvasScriptBufferedInputs(normalizedSource),
    faceBackground: face.background,
    faceFit: face.fit,
    faceScreen: face.screen,
    gridHeightGu: grid.heightGu,
    gridWidthGu: grid.widthGu,
    inputs: parseNodeGraphCanvasScriptInputs(normalizedSource),
    layout: parseNodeGraphCanvasScriptLayout(normalizedSource),
    layers: parseNodeGraphCanvasScriptLayers(normalizedSource),
    output: parseNodeGraphCanvasScriptOutput(normalizedSource),
    ratioHeight: ratio.ratioHeight,
    ratioWidth: ratio.ratioWidth,
  };
}

function normalizeNodeGraphCanvasScript(canvasScript = {}) {
  const source = typeof canvasScript === "string"
    ? canvasScript
    : canvasScript && typeof canvasScript === "object"
      ? canvasScript.source
      : "";
  const language = String(canvasScript?.language || "canvas-js").trim().slice(0, 32) || "canvas-js";
  const normalizedSource = String(source || "").trim().slice(0, 100000);
  const model = parseNodeGraphCanvasScriptModel(normalizedSource || nodeGraphCanvasScriptDefaultSource);
  return {
    aspectRatio: model.aspectRatio,
    background: model.background,
    bufferedInputs: model.bufferedInputs,
    bufferSampleLimit: nodeGraphBufferedInputSampleLimit,
    enabled: canvasScript?.enabled !== false,
    faceBackground: model.faceBackground,
    faceFit: model.faceFit,
    faceScreen: model.faceScreen,
    gridHeightGu: model.gridHeightGu,
    gridWidthGu: model.gridWidthGu,
    inputs: model.inputs,
    kind: "canvasScript",
    language,
    layout: model.layout,
    layers: model.layers,
    output: model.output,
    ratioHeight: model.ratioHeight,
    ratioWidth: model.ratioWidth,
    source: normalizedSource || nodeGraphCanvasScriptDefaultSource,
  };
}

const nodeGraphDefaultCameraColors = Object.freeze([
  "#ff3333",
  "#3399ff",
  "#38c46b",
  "#9b5cff",
]);

const nodeGraphDefaultCameraFrame = Object.freeze({
  height: 489,
  width: 868,
  x: 0,
  y: 0,
});

const nodeGraphCameraFrameLimits = Object.freeze({
  minHeight: 80,
  minWidth: 120,
});

const nodeGraphDefaultCameraResolution = Object.freeze({
  height: 1080,
  width: 1920,
});

function normalizeNodeGraphCameraResolution(value, fallback) {
  const resolution = Math.round(Number(value));
  return Number.isFinite(resolution) ? Math.max(16, Math.min(16384, resolution)) : fallback;
}

function normalizeNodeGraphCameraMidiTrigger(trigger = null) {
  const source = trigger && typeof trigger === "object" ? trigger : {};
  const type = source.type === "cc" ? "cc" : source.type === "note" ? "note" : "";
  if (!type) {
    return null;
  }
  const channel = Math.round(Number(source.channel));
  const number = Math.round(Number(source.number));
  return {
    channel: Number.isFinite(channel) ? Math.max(1, Math.min(16, channel)) : 1,
    number: Number.isFinite(number) ? Math.max(0, Math.min(127, number)) : 0,
    type,
    valueMode: source.valueMode === "threshold" ? "threshold" : "select",
  };
}

function normalizeNodeGraphCamera(camera = {}, index = 0) {
  const source = camera && typeof camera === "object" ? camera : {};
  const fallbackId = `camera-${index + 1}`;
  const id = String(source.id || fallbackId).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || fallbackId;
  const color = String(source.color || nodeGraphDefaultCameraColors[index % nodeGraphDefaultCameraColors.length] || "#ff3333").trim();
  const x = Math.round(Number(source.x));
  const y = Math.round(Number(source.y));
  const width = Math.round(Number(source.width));
  const resolutionWidth = normalizeNodeGraphCameraResolution(
    source.resolutionWidth,
    nodeGraphDefaultCameraResolution.width,
  );
  const resolutionHeight = normalizeNodeGraphCameraResolution(
    source.resolutionHeight,
    nodeGraphDefaultCameraResolution.height,
  );
  const aspectRatio = Math.max(0.01, resolutionWidth / resolutionHeight);
  const safeWidth = Number.isFinite(width)
    ? Math.max(nodeGraphCameraFrameLimits.minWidth, Math.min(4000, width))
    : nodeGraphDefaultCameraFrame.width;
  const safeHeight = Math.max(nodeGraphCameraFrameLimits.minHeight, Math.round(safeWidth / aspectRatio));
  return {
    color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : nodeGraphDefaultCameraColors[index % nodeGraphDefaultCameraColors.length],
    enabled: source.enabled !== false,
    height: Math.min(4000, safeHeight),
    id,
    midiTrigger: normalizeNodeGraphCameraMidiTrigger(source.midiTrigger),
    name: nodeGraphOneLineText(source.name).slice(0, 64) || `Camera ${index + 1}`,
    resolutionHeight,
    resolutionWidth,
    width: Math.min(4000, Math.round(Math.min(4000, safeHeight) * aspectRatio)),
    x: Number.isFinite(x) ? Math.max(0, Math.min(10000, x)) : nodeGraphDefaultCameraFrame.x,
    y: Number.isFinite(y) ? Math.max(0, Math.min(10000, y)) : nodeGraphDefaultCameraFrame.y,
  };
}

function normalizeNodeGraphPatchCameras(cameras = [], activeCameraId = "") {
  const source = Array.isArray(cameras) && cameras.length ? cameras : [{}];
  const seen = new Set();
  const normalized = source.map((camera, index) => normalizeNodeGraphCamera(camera, index))
    .filter((camera) => {
      if (seen.has(camera.id)) {
        return false;
      }
      seen.add(camera.id);
      return true;
    });
  const safeCameras = normalized.length ? normalized : [normalizeNodeGraphCamera({}, 0)];
  const active = String(activeCameraId || "").trim();
  return {
    activeCameraId: safeCameras.some((camera) => camera.id === active) ? active : safeCameras[0].id,
    cameras: safeCameras,
  };
}

function normalizeNodeGraphWindowPosition(position = {}) {
  const source = position && typeof position === "object" ? position : {};
  const left = source.left === null || source.left === undefined ? NaN : Number(source.left);
  const top = source.top === null || source.top === undefined ? NaN : Number(source.top);
  return {
    left: Number.isFinite(left) ? left : null,
    top: Number.isFinite(top) ? top : null,
  };
}

function normalizeNodeGraphPatchWindows(windows = {}) {
  return {
    metadata: normalizeNodeGraphWindowPosition(windows.metadata),
    moduleActions: normalizeNodeGraphWindowPosition(windows.moduleActions),
  };
}

const nodeGraphWorkspaceViewLimits = Object.freeze({
  minHeightGu: 1,
  minWidthGu: 4,
});

function normalizeNodeGraphPatchViewZoom(value) {
  const zoom = Number(value);
  const limits = typeof nodeGraphZoomLimits === "object"
    ? nodeGraphZoomLimits
    : { min: 0.1, max: 50 };
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return 1;
  }
  return Math.max(limits.min, Math.min(limits.max, zoom));
}

function normalizeNodeGraphPatchView(view = {}) {
  const widthGu = Math.round(Number(view?.widthGu));
  const heightGu = Math.round(Number(view?.heightGu));
  const source = view && typeof view === "object" ? view : {};
  const flag = (key, fallback) => (
    Object.hasOwn(source, key) ? Boolean(source[key]) : fallback
  );
  return {
    heightGu: Number.isFinite(heightGu)
      ? Math.max(0, heightGu)
      : 0,
    widthGu: Number.isFinite(widthGu)
      ? Math.max(0, widthGu)
      : 0,
    zoom: normalizeNodeGraphPatchViewZoom(view?.zoom),
    gridVisible: flag("gridVisible", true),
    gridLightVisible: flag("gridLightVisible", true),
    wireLengthsVisible: flag("wireLengthsVisible", true),
    wiringChromeVisible: flag("wiringChromeVisible", true),
    wiresAboveModules: flag("wiresAboveModules", false),
    moduleButtonsVisible: flag("moduleButtonsVisible", true),
    moduleOscilloscopesVisible: flag("moduleOscilloscopesVisible", true),
    moduleInterfaceControlsVisible: flag("moduleInterfaceControlsVisible", true),
    moduleSlidersVisible: flag("moduleSlidersVisible", true),
    sliderAmountVisible: flag("sliderAmountVisible", true),
    sliderPositionVisible: flag("sliderPositionVisible", true),
  };
}

const nodeGraphPatchUiItemSizeLimits = Object.freeze({
  minWidth: 64,
  maxWidth: 720,
  minHeight: 28,
  maxHeight: 420,
});

function normalizeNodeGraphPatchUiItems(uiItems = [], options = {}) {
  if (!Array.isArray(uiItems)) {
    return [];
  }

  const nodeIds = options.nodeIds instanceof Set ? options.nodeIds : null;
  const seen = new Set();
  return uiItems
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const sourceNodeId = String(source.sourceNodeId || "").trim();
      if (nodeIds && (!sourceNodeId || !nodeIds.has(sourceNodeId))) {
        return null;
      }
      const idSource = String(source.id || "").trim() || `ui-${index + 1}`;
      const id = idSource.replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `ui-${index + 1}`;
      if (seen.has(id)) {
        return null;
      }
      seen.add(id);
      const x = Math.round(Number(source.x));
      const y = Math.round(Number(source.y));
      const w = Math.round(Number(source.w));
      const h = Math.round(Number(source.h));
      const label = nodeGraphOneLineText(source.label).slice(0, 64) || sourceNodeId || id;
      const type = ["graphEditor", "moduleControl"].includes(source.type) ? source.type : "moduleControl";
      return {
        h: Number.isFinite(h)
          ? Math.max(nodeGraphPatchUiItemSizeLimits.minHeight, Math.min(nodeGraphPatchUiItemSizeLimits.maxHeight, h))
          : type === "graphEditor" ? 260 : 44,
        id,
        label,
        sourceNodeId,
        type,
        w: Number.isFinite(w)
          ? Math.max(nodeGraphPatchUiItemSizeLimits.minWidth, Math.min(nodeGraphPatchUiItemSizeLimits.maxWidth, w))
          : type === "graphEditor" ? 460 : 132,
        x: Number.isFinite(x) ? Math.max(0, Math.min(2000, x)) : 24,
        y: Number.isFinite(y) ? Math.max(0, Math.min(2000, y)) : 24,
      };
    })
    .filter(Boolean);
}
