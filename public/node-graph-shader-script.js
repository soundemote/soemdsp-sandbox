const nodeGraphShaderScriptStorageKey = "soemdsp-sandbox.modularShader.v1";
const nodeGraphScopeShaderModuleDefaultsStorageKey = "soemdsp-sandbox.scopeShaderModuleDefaults.v1";
const nodeGraphShaderScriptMaxScopes = 32;
const nodeGraphShaderScriptEditorFontSizeLimits = Object.freeze({
  defaultPx: 11.5,
  maxPx: 22,
  minPx: 8,
  stepPx: 0.75,
});
const nodeGraphShaderScriptUtilityCameraPadding = 18;
const nodeGraphShaderScriptColorWidgetModuleUrl = "./public/color-widget.js?v=shader-token-color-widget-1";
const nodeGraphShaderScriptBlendModes = Object.freeze(["laser", "led", "light", "paint", "solid", "heatmap"]);
const nodeGraphShaderScriptBlendModePatternSource = nodeGraphShaderScriptBlendModes
  .map((mode) => mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const nodeGraphShaderScriptScopeModes = Object.freeze(["1d_full", "1d_scan", "x_y", "one_value"]);
const nodeGraphShaderScriptScopeModePatternSource = nodeGraphShaderScriptScopeModes
  .map((mode) => mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const nodeGraphShaderScriptScopeSyncModes = Object.freeze(["inherit", "on", "off"]);
const nodeGraphShaderScriptScopeSyncPatternSource = nodeGraphShaderScriptScopeSyncModes
  .map((mode) => mode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const nodeGraphShaderScriptHighlightTokenPattern = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|\\b(?:dot[12]\\.(?:global|globals)\\.(?:size|brightness|blur|color)|(?:dot[12]|blend|video|scope)\\.[a-zA-Z_]\\w*|globalsize|global\\.size)\\b|\\b(?:${nodeGraphShaderScriptBlendModePatternSource}|${nodeGraphShaderScriptScopeModePatternSource}|${nodeGraphShaderScriptScopeSyncPatternSource}|none|output\\d+)\\b|~|-?\\d+(?:\\.\\d+)?\\b|[=*]`,
  "g",
);
const nodeGraphShaderScriptEditableTokenPattern = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|-?\\d+(?:\\.\\d+)?\\b|\\b(?:${nodeGraphShaderScriptBlendModePatternSource}|${nodeGraphShaderScriptScopeModePatternSource}|${nodeGraphShaderScriptScopeSyncPatternSource})\\b`,
  "g",
);
const nodeGraphShaderScriptDefaultSyntaxColors = Object.freeze({
  assignment: "#d6a35f",
  comment: "#9ca4a6",
  mode: "#d3a070",
  number: "#a9cda6",
  property: "#7fc7d9",
});
const nodeGraphShaderScriptLegacySyntaxColors = Object.freeze({
  assignment: "#ffd87f",
  comment: "#9ca4a6",
  mode: "#ffae6e",
  number: "#b4ffb2",
  property: "#84e6ff",
});

function nodeGraphScopeShaderDefaultModuleKey(node) {
  return String(node?.type || "").trim().slice(0, 80);
}

function normalizeNodeGraphScopeShaderModuleDefaults(defaults = {}) {
  const source = defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, value]) => key && typeof value === "string" && value.trim())
      .map(([key, value]) => [
        String(key).slice(0, 80),
        nodeGraphScopeShaderCanonicalModuleDefaultSource(String(key), String(value).slice(0, 20000)),
      ]),
  );
}

function nodeGraphScopeShaderCanonicalModuleDefaultSource(type, source = "") {
  const current = String(source || "").trim();
  if (!current) {
    return "";
  }
  const compact = compactNodeGraphShaderScriptSource(current);
  const genericLegacy = compactNodeGraphShaderScriptSource(`video.input     = ~;
scope.mode      = 1d_full;
scope.sync      = inherit;
scope.cycles    = 1.7639;
scope.zoom      = 1.0;
scope.length    = 1.0;
scope.padding   = 0.04;
scope.syncSpeed = 1.0;
dot1.color      = dot1.global.color;
dot1.size       = 1.0 * dot1.global.size;
dot1.blur       = 0.00;
dot1.brightness = 4.50;
dot2.color      = dot2.global.color;
dot2.size       = 1.0 * dot2.global.size;
dot2.blur       = 0.00;
dot2.brightness = 0.45;
blend.mode      = laser;`);
  const visualLegacy = compactNodeGraphShaderScriptSource(
    genericLegacy.replace("scope.mode      = 1d_full;", "scope.mode      = x_y;"),
  );
  // Dot 2 has been removed app-wide; this is the last generic default that
  // still had it -- derived from the current (Dot 2-free) template by
  // splicing its dot2.* lines back in, so stored module defaults matching
  // this shape get regenerated from the current template below.
  const dot2Legacy = compactNodeGraphShaderScriptSource(
    nodeGraphScopeShaderDefaultSource.replace(
      "dot1.brightness = 1.0 * dot1.global.brightness;",
      `dot1.brightness = 1.0 * dot1.global.brightness;
dot2.color      = dot2.global.color;
dot2.size       = 1.0 * dot2.global.size;
dot2.blur       = 1.0 * dot2.global.blur;
dot2.brightness = 1.0 * dot2.global.brightness;`,
    ),
  );
  const dot2VisualLegacy = compactNodeGraphShaderScriptSource(
    dot2Legacy.replace("scope.mode      = 1d_full;", "scope.mode      = x_y;"),
  );
  if (
    compact === genericLegacy ||
    compact === visualLegacy ||
    compact === dot2Legacy ||
    compact === dot2VisualLegacy
  ) {
    return nodeGraphScopeShaderDefaultSourceForType(type);
  }
  return current;
}

function loadNodeGraphScopeShaderModuleDefaults() {
  try {
    const stored = window.localStorage.getItem(nodeGraphScopeShaderModuleDefaultsStorageKey) || "{}";
    const normalized = normalizeNodeGraphScopeShaderModuleDefaults(JSON.parse(stored));
    const serialized = JSON.stringify(normalized);
    if (serialized !== stored) {
      window.localStorage.setItem(nodeGraphScopeShaderModuleDefaultsStorageKey, serialized);
    }
    return normalized;
  } catch {
    return {};
  }
}

function nodeGraphScopeShaderModuleDefaultSource(node) {
  const key = nodeGraphScopeShaderDefaultModuleKey(node);
  return key ? loadNodeGraphScopeShaderModuleDefaults()[key] || "" : "";
}

const nodeGraphShaderScriptVertexSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Default dark-room bloom user prefs.
// Keep these as plain numbers so the default shader can be tuned without
// editing the GLSL body. Scene exposure brightens/dims the whole room; bloom
// and glow only affect screen/wire light sources and their illumination.
const nodeGraphDefaultScreenShaderPrefs = Object.freeze({
  bloomAmount: 1.0,
  cornerDarkness: 1.0,
  glowAmount: 1.0,
  roomBrightness: 1.0,
  sceneExposure: 1.0,
  screenLightAmount: 1.0,
  warmGlassAmount: 1.0,
});

function nodeGraphShaderScriptDarkRoomBloomDefaultFragment() {
  const prefs = nodeGraphDefaultScreenShaderPrefs;
  return `
precision mediump float;

const float NODE_SHADER_BLOOM_AMOUNT = ${Number(prefs.bloomAmount).toFixed(3)};
const float NODE_SHADER_CORNER_DARKNESS = ${Number(prefs.cornerDarkness).toFixed(3)};
const float NODE_SHADER_GLOW_AMOUNT = ${Number(prefs.glowAmount).toFixed(3)};
const float NODE_SHADER_ROOM_BRIGHTNESS = ${Number(prefs.roomBrightness).toFixed(3)};
const float NODE_SHADER_SCENE_EXPOSURE = ${Number(prefs.sceneExposure).toFixed(3)};
const float NODE_SHADER_SCREEN_LIGHT_AMOUNT = ${Number(prefs.screenLightAmount).toFixed(3)};
const float NODE_SHADER_WARM_GLASS_AMOUNT = ${Number(prefs.warmGlassAmount).toFixed(3)};

uniform vec2 uResolution;
uniform float uTime;
uniform float uZoom;
uniform int uScopeCount;
uniform vec4 uScopeRects[32];

varying vec2 vUv;

float rectSdf(vec2 p, vec4 rect) {
  vec2 center = rect.xy + rect.zw * 0.5;
  vec2 q = abs(p - center) - rect.zw * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float softLight(float x) {
  return x * x * (3.0 - 2.0 * x);
}

void main() {
  vec2 uv = vUv;
  vec2 roomUv = (uv - 0.5) * vec2(1.22, 1.0);
  float roomFalloff = smoothstep(0.08, 0.82, length(roomUv));
  float screenBloom = 0.0;
  float screenCore = 0.0;
  float screenEdge = 0.0;

  for (int i = 0; i < 32; i++) {
    if (i < uScopeCount) {
      vec4 rect = uScopeRects[i];
      float d = rectSdf(uv, rect);
      float outer = exp(-max(d, 0.0) * 26.0);
      float mid = exp(-max(d, 0.0) * 78.0);
      float pane = smoothstep(0.014, -0.003, d);
      float edge = smoothstep(0.018, 0.000, abs(d));
      float scan = 0.88 + 0.12 * sin((uv.y * uResolution.y * 1.35) + uTime * 2.0);
      screenBloom += (outer * 0.30 + mid * 0.20 + pane * scan * 0.12) * NODE_SHADER_BLOOM_AMOUNT;
      screenCore += pane;
      screenEdge += edge;
    }
  }

  screenBloom = clamp(screenBloom, 0.0, 1.0);
  screenCore = clamp(screenCore, 0.0, 1.0);
  screenEdge = clamp(screenEdge, 0.0, 1.0);

  float dust = (grain(gl_FragCoord.xy + uTime * 9.0) - 0.5) * 0.010;
  float cornerDark = (0.32 + roomFalloff * 0.34) * NODE_SHADER_CORNER_DARKNESS;
  vec3 darkRoom = vec3(0.001, 0.004, 0.006) * (1.0 - roomFalloff * 0.35) * NODE_SHADER_ROOM_BRIGHTNESS;
  vec3 cyanGlow = vec3(0.12, 0.62, 0.68) * softLight(screenBloom) * NODE_SHADER_GLOW_AMOUNT;
  vec3 warmGlass = vec3(0.70, 0.48, 0.22) * screenEdge * 0.035 * NODE_SHADER_WARM_GLASS_AMOUNT;
  vec3 screenLight = vec3(0.75, 0.95, 0.88) * screenCore * 0.045 * NODE_SHADER_SCREEN_LIGHT_AMOUNT;
  vec3 color = (darkRoom + cyanGlow + warmGlass + screenLight) * NODE_SHADER_SCENE_EXPOSURE;

  float alpha = clamp(cornerDark - screenBloom * 0.16 - screenCore * 0.045 + dust, 0.10, 0.62);
  gl_FragColor = vec4(color, alpha);
}
`.trim();
}

const nodeGraphShaderScriptDefaultFragmentSource = nodeGraphShaderScriptDarkRoomBloomDefaultFragment();

function nodeGraphShaderScriptIsLegacyDefaultFragmentSource(source = "") {
  const text = String(source || "");
  return text.includes("function nodeGraphShaderScriptCameraPhosphorFragment")
    || text.includes("function nodeGraphShaderScriptBrightnessContrastDefaultFragment")
    || text.includes("color = (color - 0.5) * contrast + 0.5 + brightness")
    || text.includes("float darkness = 0.20 + vignette * 0.16")
    || text.includes("color = adjustSaturation(color, saturation)")
    || text.includes("color = posterize(color, posterizeLevels, posterizeAmount)")
    || text.includes("color = chromaticGlitch(color, uv, chromaticGlitchAmount)")
    || text.includes("color = scanlineGlow(color, uv, scanlineAmount)")
    || (
      text.includes("pseudocode:")
      && text.includes("brightness = this")
      && text.includes("contrast = that")
    );
}

const nodeGraphShaderScriptState = {
  animationFrame: 0,
  dialogMode: "global",
  dialogDrag: null,
  editorFontSizePx: nodeGraphShaderScriptEditorFontSizeLimits.defaultPx,
  // Off by default: the screen shader is an opt-in visual effect, and a fresh
  // profile (or one just reset by Clear Startup) should come up without it.
  enabled: false,
  fragmentSource: nodeGraphShaderScriptDefaultFragmentSource.trim(),
  gl: null,
  lastError: "",
  program: null,
  previewFrame: 0,
  renderer: null,
  liveApplyTimer: 0,
  colorWidget: null,
  colorWidgetLoad: null,
  scopeTargetNodeId: "",
  syntaxColors: { ...nodeGraphShaderScriptDefaultSyntaxColors },
  numberTokenDrag: null,
  tokenWidget: null,
};

function nodeGraphShaderScriptCanvas() {
  return document.getElementById("nodeModularShaderCanvas");
}

function nodeGraphShaderScriptWorkspace() {
  return document.getElementById("nodeGraphWorkspace");
}

function loadNodeGraphShaderScriptState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(nodeGraphShaderScriptStorageKey) || "{}");
    const storedFragmentSource = typeof parsed.fragmentSource === "string" ? parsed.fragmentSource.trim() : "";
    const shouldUseStoredFragment = storedFragmentSource
      && !nodeGraphShaderScriptIsLegacyDefaultFragmentSource(storedFragmentSource);
    if (
      shouldUseStoredFragment
    ) {
      nodeGraphShaderScriptState.fragmentSource = storedFragmentSource;
    } else {
      nodeGraphShaderScriptState.fragmentSource = nodeGraphShaderScriptDefaultFragmentSource.trim();
    }
    nodeGraphShaderScriptState.editorFontSizePx = normalizeNodeGraphShaderScriptEditorFontSize(
      parsed.editorFontSizePx,
    );
    nodeGraphShaderScriptState.syntaxColors = normalizeNodeGraphShaderScriptSyntaxColors(parsed.syntaxColors);
    // saveNodeGraphShaderScriptState() has always written `enabled`, but this
    // loader never read it back -- so the toggle silently reverted to the
    // hardcoded default on every reload. Absent key => off.
    nodeGraphShaderScriptState.enabled = parsed.enabled === true;
    if (storedFragmentSource && !shouldUseStoredFragment) {
      saveNodeGraphShaderScriptState();
    }
  } catch {
    nodeGraphShaderScriptState.fragmentSource = nodeGraphShaderScriptDefaultFragmentSource.trim();
    nodeGraphShaderScriptState.editorFontSizePx = nodeGraphShaderScriptEditorFontSizeLimits.defaultPx;
    nodeGraphShaderScriptState.syntaxColors = { ...nodeGraphShaderScriptDefaultSyntaxColors };
    nodeGraphShaderScriptState.enabled = false;
  }
}

function saveNodeGraphShaderScriptState() {
  try {
    window.localStorage.setItem(
      nodeGraphShaderScriptStorageKey,
      JSON.stringify({
        enabled: Boolean(nodeGraphShaderScriptState.enabled),
        editorFontSizePx: nodeGraphShaderScriptState.editorFontSizePx,
        fragmentSource: nodeGraphShaderScriptState.fragmentSource,
        syntaxColors: normalizeNodeGraphShaderScriptSyntaxColors(nodeGraphShaderScriptState.syntaxColors),
      }),
    );
  } catch {
    // Visual customization is nice-to-have UI state.
  }
}

function normalizeNodeGraphShaderScriptEditorFontSize(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? clampNodeSliderValue(number, nodeGraphShaderScriptEditorFontSizeLimits.minPx, nodeGraphShaderScriptEditorFontSizeLimits.maxPx)
    : nodeGraphShaderScriptEditorFontSizeLimits.defaultPx;
}

function normalizeNodeGraphShaderScriptSyntaxColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color)
    ? color.toLowerCase()
    : fallback;
}

function normalizeNodeGraphShaderScriptSyntaxColors(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(nodeGraphShaderScriptDefaultSyntaxColors).map(([key, fallback]) => {
      const normalized = normalizeNodeGraphShaderScriptSyntaxColor(source[key], fallback);
      return [
        key,
        normalized === nodeGraphShaderScriptLegacySyntaxColors[key] ? fallback : normalized,
      ];
    }),
  );
}

function applyNodeGraphShaderScriptSyntaxColors() {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  const colors = normalizeNodeGraphShaderScriptSyntaxColors(nodeGraphShaderScriptState.syntaxColors);
  nodeGraphShaderScriptState.syntaxColors = colors;
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--node-shader-token-${key}`, value);
    const input = document.querySelector(`[data-shader-syntax-color="${key}"]`);
    if (input) {
      input.value = value;
    }
  }
}

function setNodeGraphShaderScriptSyntaxColor(key, value) {
  if (!Object.hasOwn(nodeGraphShaderScriptDefaultSyntaxColors, key)) {
    return;
  }
  nodeGraphShaderScriptState.syntaxColors = normalizeNodeGraphShaderScriptSyntaxColors({
    ...nodeGraphShaderScriptState.syntaxColors,
    [key]: value,
  });
  applyNodeGraphShaderScriptSyntaxColors();
  saveNodeGraphShaderScriptState();
}

function resetNodeGraphShaderScriptSyntaxColors() {
  nodeGraphShaderScriptState.syntaxColors = { ...nodeGraphShaderScriptDefaultSyntaxColors };
  applyNodeGraphShaderScriptSyntaxColors();
  saveNodeGraphShaderScriptState();
}

function applyNodeGraphShaderScriptEditorFontSize() {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  const size = normalizeNodeGraphShaderScriptEditorFontSize(nodeGraphShaderScriptState.editorFontSizePx);
  nodeGraphShaderScriptState.editorFontSizePx = size;
  root.style.setProperty("--node-shader-script-font-size", `${size.toFixed(2)}px`);
  const decrease = document.getElementById("nodeShaderScriptTextSizeDecrease");
  const increase = document.getElementById("nodeShaderScriptTextSizeIncrease");
  if (decrease) {
    decrease.disabled = size <= nodeGraphShaderScriptEditorFontSizeLimits.minPx;
  }
  if (increase) {
    increase.disabled = size >= nodeGraphShaderScriptEditorFontSizeLimits.maxPx;
  }
}

function setNodeGraphShaderScriptSyntaxColorsPanelVisible(visible) {
  const panel = document.getElementById("nodeShaderScriptSyntaxColorsPanel");
  const button = document.getElementById("nodeShaderScriptSyntaxColorsButton");
  if (panel) {
    panel.hidden = !visible;
  }
  if (button) {
    button.setAttribute("aria-expanded", String(Boolean(visible)));
  }
  if (visible) {
    applyNodeGraphShaderScriptSyntaxColors();
  }
}

function toggleNodeGraphShaderScriptSyntaxColorsPanel() {
  const panel = document.getElementById("nodeShaderScriptSyntaxColorsPanel");
  setNodeGraphShaderScriptSyntaxColorsPanelVisible(Boolean(panel?.hidden));
}

function changeNodeGraphShaderScriptEditorFontSize(delta) {
  nodeGraphShaderScriptState.editorFontSizePx = normalizeNodeGraphShaderScriptEditorFontSize(
    nodeGraphShaderScriptState.editorFontSizePx + delta,
  );
  applyNodeGraphShaderScriptEditorFontSize();
  saveNodeGraphShaderScriptState();
  updateNodeGraphShaderScriptHighlight();
}

function compileNodeGraphShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || "shader compile failed";
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}

function createNodeGraphShaderProgram(gl, fragmentSource) {
  const vertex = compileNodeGraphShader(gl, gl.VERTEX_SHADER, nodeGraphShaderScriptVertexSource);
  const fragment = compileNodeGraphShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) || "shader link failed";
    gl.deleteProgram(program);
    throw new Error(error);
  }
  return program;
}

function createNodeGraphShaderRenderer(canvas) {
  const gl = canvas?.getContext?.("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
    stencil: false,
  });
  if (!gl) {
    return null;
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return {
    buffer,
    canvas,
    gl,
    positionLocation: -1,
    rectLocations: [],
    resolutionLocation: null,
    scopeCountLocation: null,
    timeLocation: null,
    zoomLocation: null,
  };
}

function updateNodeGraphShaderProgram(fragmentSource = nodeGraphShaderScriptState.fragmentSource) {
  const canvas = nodeGraphShaderScriptCanvas();
  const renderer = nodeGraphShaderScriptState.renderer ||= createNodeGraphShaderRenderer(canvas);
  if (!renderer) {
    nodeGraphShaderScriptStatus("WebGL unavailable", true);
    return false;
  }
  const { gl } = renderer;
  try {
    const program = createNodeGraphShaderProgram(gl, fragmentSource);
    if (nodeGraphShaderScriptState.program) {
      gl.deleteProgram(nodeGraphShaderScriptState.program);
    }
    nodeGraphShaderScriptState.program = program;
    renderer.positionLocation = gl.getAttribLocation(program, "aPosition");
    renderer.resolutionLocation = gl.getUniformLocation(program, "uResolution");
    renderer.timeLocation = gl.getUniformLocation(program, "uTime");
    renderer.zoomLocation = gl.getUniformLocation(program, "uZoom");
    renderer.scopeCountLocation = gl.getUniformLocation(program, "uScopeCount");
    renderer.rectLocations = Array.from({ length: nodeGraphShaderScriptMaxScopes }, (_, index) =>
      gl.getUniformLocation(program, `uScopeRects[${index}]`));
    nodeGraphShaderScriptState.fragmentSource = fragmentSource;
    nodeGraphShaderScriptState.lastError = "";
    nodeGraphShaderScriptStatus("shader applied", false);
    saveNodeGraphShaderScriptState();
    scheduleNodeGraphShaderScriptDraw();
    return true;
  } catch (error) {
    nodeGraphShaderScriptState.lastError = error?.message || "shader error";
    nodeGraphShaderScriptStatus(nodeGraphShaderScriptState.lastError, true);
    return false;
  }
}

function nodeGraphShaderScriptStatus(message, isError = false) {
  const status = document.getElementById("nodeShaderScriptStatus");
  if (!status) {
    return;
  }
  const text = String(message || "ready");
  status.dataset.fullText = text;
  status.textContent = text.slice(0, 140);
  status.classList.toggle("warn", Boolean(isError));
  status.classList.toggle("good", !isError);
}

async function copyNodeGraphShaderScriptStatus() {
  const status = document.getElementById("nodeShaderScriptStatus");
  const text = status?.dataset.fullText || status?.textContent || "";
  if (!text.trim()) {
    nodeGraphShaderScriptStatus("nothing to copy", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    const previous = {
      isError: status?.classList.contains("warn") || false,
      text,
    };
    nodeGraphShaderScriptStatus("error copied", false);
    window.setTimeout(() => nodeGraphShaderScriptStatus(previous.text, previous.isError), 900);
  } catch (_error) {
    const button = document.getElementById("nodeShaderScriptCopyStatus");
    if (status) {
      const range = document.createRange();
      range.selectNodeContents(status);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (button) {
      const previousText = button.textContent || "Copy Error";
      button.textContent = "Selected";
      window.setTimeout(() => {
        button.textContent = previousText;
      }, 900);
    }
  }
}

function escapeNodeGraphShaderScriptHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function compactNodeGraphShaderScriptSource(source = "") {
  return String(source || "").replace(/\n{3,}/g, "\n").trim();
}

function nodeGraphShaderScriptIsModeToken(token) {
  return Boolean(nodeGraphShaderScriptModeTokenKind(token)) ||
    token === "~" ||
    token === "none" ||
    /^output\d+$/.test(token);
}

function nodeGraphShaderScriptIsBlendModeToken(token) {
  return nodeGraphShaderScriptBlendModes.includes(token);
}

function nodeGraphShaderScriptModeTokenKind(token) {
  const text = String(token || "").trim();
  if (nodeGraphShaderScriptBlendModes.includes(text)) {
    return "blend";
  }
  if (nodeGraphShaderScriptScopeModes.includes(text)) {
    return "scope";
  }
  if (nodeGraphShaderScriptScopeSyncModes.includes(text)) {
    return "sync";
  }
  return "";
}

function nodeGraphShaderScriptModeOptionsForKind(kind) {
  if (kind === "scope") {
    return {
      label: "display mode",
      options: nodeGraphShaderScriptScopeModes,
    };
  }
  if (kind === "sync") {
    return {
      label: "sync",
      options: nodeGraphShaderScriptScopeSyncModes,
    };
  }
  return {
    label: "blend",
    options: nodeGraphShaderScriptBlendModes,
  };
}

function nodeGraphShaderScriptIsPropertyToken(token) {
  return token.startsWith("dot") ||
    token.startsWith("blend") ||
    token.startsWith("video") ||
    token.startsWith("scope") ||
    token.startsWith("global");
}

function colorizeNodeGraphShaderScriptLine(line = "", lineStart = 0) {
  const commentIndex = line.indexOf("//");
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  let html = "";
  let lastIndex = 0;
  for (const match of code.matchAll(nodeGraphShaderScriptHighlightTokenPattern)) {
    const token = match[0];
    html += escapeNodeGraphShaderScriptHtml(code.slice(lastIndex, match.index));
    const className = token.startsWith("#")
      ? "node-shader-token-color"
      : token === "=" || token === "*"
        ? "node-shader-token-assignment"
        : nodeGraphShaderScriptIsModeToken(token)
          ? "node-shader-token-mode"
        : nodeGraphShaderScriptIsPropertyToken(token)
          ? "node-shader-token-property"
          : "node-shader-token-number";
    const tokenStart = lineStart + match.index;
    const tokenEnd = tokenStart + token.length;
    const tokenType = token.startsWith("#")
      ? "color"
      : className === "node-shader-token-number"
        ? "number"
        : className === "node-shader-token-mode" && nodeGraphShaderScriptModeTokenKind(token)
          ? "mode"
        : "";
    const tokenAttributes = tokenType
      ? ` data-token-type="${tokenType}" data-token-start="${tokenStart}" data-token-end="${tokenEnd}"`
      : "";
    const linkClass = tokenType ? " node-shader-token-link" : "";
    const tokenStyle = tokenType === "color"
      ? ` style="color: ${normalizeNodeGraphShaderScriptColorToken(token)}"`
      : "";
    html += `<span class="${className}${linkClass}"${tokenAttributes}${tokenStyle}>${escapeNodeGraphShaderScriptHtml(token)}</span>`;
    lastIndex = match.index + token.length;
  }
  html += escapeNodeGraphShaderScriptHtml(code.slice(lastIndex));
  if (comment) {
    html += `<span class="node-shader-token-comment">${escapeNodeGraphShaderScriptHtml(comment)}</span>`;
  }
  return html;
}

function updateNodeGraphShaderScriptHighlight() {
  const source = document.getElementById("nodeShaderScriptSource");
  const highlight = document.getElementById("nodeShaderScriptHighlight");
  if (!source || !highlight) {
    return;
  }
  const text = source.value || "";
  let lineStart = 0;
  highlight.innerHTML = text.split("\n").map((line) => {
    const html = colorizeNodeGraphShaderScriptLine(line, lineStart);
    lineStart += line.length + 1;
    return html;
  }).join("\n") || "&nbsp;";
  highlight.scrollTop = source.scrollTop;
  highlight.scrollLeft = source.scrollLeft;
}

function closeNodeGraphShaderScriptTokenWidget() {
  destroyNodeGraphShaderScriptColorWidget();
  nodeGraphShaderScriptState.numberTokenDrag = null;
  const widget = document.getElementById("nodeShaderScriptTokenWidget");
  if (widget) {
    widget.hidden = true;
  }
  for (const id of [
    "nodeShaderScriptColorWidget",
    "nodeShaderScriptModeWidget",
  ]) {
    const section = document.getElementById(id);
    if (section) {
      section.hidden = true;
    }
  }
  nodeGraphShaderScriptState.tokenWidget = null;
}

function destroyNodeGraphShaderScriptColorWidget() {
  nodeGraphShaderScriptState.colorWidget?.destroy?.();
  nodeGraphShaderScriptState.colorWidget = null;
}

function normalizeNodeGraphShaderScriptColorToken(value = "") {
  const token = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(token)) {
    return token.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(token)) {
    return `#${token[1]}${token[1]}${token[2]}${token[2]}${token[3]}${token[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(token)) {
    return token.slice(0, 7).toLowerCase();
  }
  return "#ffffff";
}

function nodeGraphShaderScriptHexToHsl(hexToken = "#ffffff") {
  const hex = normalizeNodeGraphShaderScriptColorToken(hexToken);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue /= 6;
  }
  return {
    a: 1,
    h: Math.round(hue * 359),
    l: Math.round(lightness * 100),
    s: Math.round(saturation * 100),
  };
}

function loadNodeGraphShaderScriptColorWidgetModule() {
  nodeGraphShaderScriptState.colorWidgetLoad ||= import(nodeGraphShaderScriptColorWidgetModuleUrl);
  return nodeGraphShaderScriptState.colorWidgetLoad;
}

async function mountNodeGraphShaderScriptColorWidget(token) {
  const host = document.getElementById("nodeShaderScriptColorWidgetHost");
  if (!host || !token || token.type !== "color") {
    return;
  }
  destroyNodeGraphShaderScriptColorWidget();
  host.replaceChildren();
  const tokenStart = token.start;
  const module = await loadNodeGraphShaderScriptColorWidgetModule();
  const activeToken = nodeGraphShaderScriptState.tokenWidget;
  if (!activeToken || activeToken.type !== "color" || activeToken.start !== tokenStart) {
    return;
  }
  nodeGraphShaderScriptState.colorWidget = module.mountColorWidget(host, {
    label: "color",
    ...nodeGraphShaderScriptHexToHsl(activeToken.token),
    onChange: (color) => {
      if (nodeGraphShaderScriptState.tokenWidget?.type !== "color") {
        return;
      }
      replaceNodeGraphShaderScriptToken(normalizeNodeGraphShaderScriptColorToken(color.hex));
    },
  });
}

function nodeGraphShaderScriptNumberPrecision(token = "") {
  const match = String(token).match(/\.(\d+)/);
  return match ? match[1].length : 0;
}

function nodeGraphShaderScriptNumberStep(token = "") {
  const precision = nodeGraphShaderScriptNumberPrecision(token);
  return precision > 0 ? 1 / (10 ** precision) : 1;
}

function formatNodeGraphShaderScriptNumberToken(value, previousToken = "") {
  const precision = nodeGraphShaderScriptNumberPrecision(previousToken);
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(precision)
    : String(previousToken || "0");
}

function findNodeGraphShaderScriptEditableTokenAt(index) {
  const source = document.getElementById("nodeShaderScriptSource");
  const text = source?.value || "";
  const position = clampNodeSliderValue(Number(index) || 0, 0, text.length);
  for (const match of text.matchAll(nodeGraphShaderScriptEditableTokenPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position >= start && position <= end) {
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const commentIndex = text.indexOf("//", lineStart);
      if (commentIndex >= 0 && commentIndex < start) {
        return null;
      }
      return {
        end,
        modeKind: nodeGraphShaderScriptModeTokenKind(match[0]),
        start,
        token: match[0],
        type: match[0].startsWith("#")
          ? "color"
          : nodeGraphShaderScriptModeTokenKind(match[0])
            ? "mode"
            : "number",
      };
    }
  }
  return null;
}

function replaceNodeGraphShaderScriptToken(nextToken) {
  const source = document.getElementById("nodeShaderScriptSource");
  const token = nodeGraphShaderScriptState.tokenWidget;
  if (!source || !token) {
    return;
  }
  const replacement = String(nextToken);
  source.setRangeText(replacement, token.start, token.end, "end");
  nodeGraphShaderScriptState.tokenWidget = {
    ...token,
    end: token.start + replacement.length,
    token: replacement,
  };
  updateNodeGraphShaderScriptHighlight();
  syncNodeGraphShaderScriptVideoInputControls();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  scheduleNodeGraphShaderScriptScopePreview();
  scheduleNodeGraphShaderScriptLiveApply();
}

function findNodeGraphShaderScriptNumberTokenAtPoint(event, options = {}) {
  const source = document.getElementById("nodeShaderScriptSource");
  const highlight = document.getElementById("nodeShaderScriptHighlight");
  if (!source || !highlight || !event) {
    return null;
  }
  if (options.refresh !== false) {
    updateNodeGraphShaderScriptHighlight();
  }
  for (const tokenElement of highlight.querySelectorAll('[data-token-type="number"]')) {
    const rect = tokenElement.getBoundingClientRect();
    if (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      const start = Number(tokenElement.dataset.tokenStart);
      const end = Number(tokenElement.dataset.tokenEnd);
      const token = source.value.slice(start, end);
      if (Number.isFinite(start) && Number.isFinite(end) && token) {
        return {
          end,
          start,
          token,
          type: "number",
        };
      }
    }
  }
  return null;
}

function replaceNodeGraphShaderScriptNumberDragToken(nextValue) {
  const source = document.getElementById("nodeShaderScriptSource");
  const drag = nodeGraphShaderScriptState.numberTokenDrag;
  if (!source || !drag?.token) {
    return;
  }
  const nextToken = formatNodeGraphShaderScriptNumberToken(nextValue, drag.initialToken);
  source.setRangeText(nextToken, drag.token.start, drag.token.end, "end");
  drag.token = {
    ...drag.token,
    end: drag.token.start + nextToken.length,
    token: nextToken,
  };
  updateNodeGraphShaderScriptHighlight();
}

function beginNodeGraphShaderScriptNumberTokenDrag(event) {
  if (event.button > 0) {
    return;
  }
  const source = document.getElementById("nodeShaderScriptSource");
  const token = findNodeGraphShaderScriptNumberTokenAtPoint(event);
  if (!source || !token) {
    return;
  }
  const baseValue = Number(token.token);
  if (!Number.isFinite(baseValue)) {
    return;
  }
  nodeGraphShaderScriptState.numberTokenDrag = {
    baseValue,
    changed: false,
    initialToken: token.token,
    lastSteps: 0,
    pointerId: event.pointerId ?? null,
    startX: event.clientX,
    startY: event.clientY,
    step: nodeGraphShaderScriptNumberStep(token.token),
    token,
  };
  source.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphShaderScriptNumberToken(event) {
  const drag = nodeGraphShaderScriptState.numberTokenDrag;
  if (!drag) {
    return;
  }
  if (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId) {
    return;
  }
  const distance = (event.clientX - drag.startX) - (event.clientY - drag.startY);
  const steps = Math.round(distance / 8);
  drag.changed = drag.changed || Math.abs(event.clientX - drag.startX) >= 3 || Math.abs(event.clientY - drag.startY) >= 3;
  if (steps !== drag.lastSteps) {
    drag.lastSteps = steps;
    replaceNodeGraphShaderScriptNumberDragToken(drag.baseValue + steps * drag.step);
  }
  event.preventDefault();
  event.stopPropagation();
}

function endNodeGraphShaderScriptNumberTokenDrag(event) {
  const drag = nodeGraphShaderScriptState.numberTokenDrag;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  const source = document.getElementById("nodeShaderScriptSource");
  source?.releasePointerCapture?.(event.pointerId);
  nodeGraphShaderScriptState.numberTokenDrag = null;
  event.preventDefault();
  event.stopPropagation();
}

function positionNodeGraphShaderScriptTokenWidget(event) {
  const widget = document.getElementById("nodeShaderScriptTokenWidget");
  const editor = document.querySelector(".node-shader-script-editor");
  if (!widget || !editor) {
    return;
  }
  const rect = editor.getBoundingClientRect();
  const x = clampNodeSliderValue((event?.clientX || rect.left + 16) - rect.left + 8, 8, Math.max(8, rect.width - 180));
  const y = clampNodeSliderValue((event?.clientY || rect.top + 16) - rect.top + 8, 8, Math.max(8, rect.height - 58));
  widget.style.left = `${x}px`;
  widget.style.top = `${y}px`;
}

function openNodeGraphShaderScriptTokenWidget(token, event) {
  const widget = document.getElementById("nodeShaderScriptTokenWidget");
  const colorSection = document.getElementById("nodeShaderScriptColorWidget");
  const modeSection = document.getElementById("nodeShaderScriptModeWidget");
  if (!widget || !colorSection || !modeSection || !token || token.type === "number") {
    closeNodeGraphShaderScriptTokenWidget();
    return;
  }
  nodeGraphShaderScriptState.tokenWidget = token;
  widget.hidden = false;
  colorSection.hidden = token.type !== "color";
  modeSection.hidden = token.type !== "mode";
  if (token.type === "color") {
    mountNodeGraphShaderScriptColorWidget(token);
  } else if (token.type === "mode") {
    populateNodeGraphShaderScriptModeWidget(token);
  }
  positionNodeGraphShaderScriptTokenWidget(event);
}

function populateNodeGraphShaderScriptModeWidget(token) {
  const modeSection = document.getElementById("nodeShaderScriptModeWidget");
  const kind = token?.modeKind || nodeGraphShaderScriptModeTokenKind(token?.token);
  const config = nodeGraphShaderScriptModeOptionsForKind(kind);
  if (!modeSection) {
    return;
  }
  modeSection.replaceChildren();
  const label = document.createElement("span");
  label.textContent = config.label;
  modeSection.append(label);
  for (const option of config.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.shaderModeKind = kind || "blend";
    button.dataset.shaderModeOption = option;
    button.textContent = option;
    button.setAttribute("aria-pressed", String(option === token?.token));
    modeSection.append(button);
  }
}

function handleNodeGraphShaderScriptSourcePointer(event) {
  if (event.defaultPrevented) {
    return;
  }
  window.setTimeout(() => {
    const source = document.getElementById("nodeShaderScriptSource");
    const token = findNodeGraphShaderScriptEditableTokenAt(source?.selectionStart ?? 0);
    if (token) {
      openNodeGraphShaderScriptTokenWidget(token, event);
    } else {
      closeNodeGraphShaderScriptTokenWidget();
    }
  }, 0);
}

function nodeGraphShaderScriptSourceText() {
  return document.getElementById("nodeShaderScriptSource")?.value || "";
}

function setNodeGraphShaderScriptSourceText(text) {
  const source = document.getElementById("nodeShaderScriptSource");
  if (!source) {
    return;
  }
  source.value = String(text || "");
  updateNodeGraphShaderScriptHighlight();
  closeNodeGraphShaderScriptTokenWidget();
}

async function copyNodeGraphShaderScriptSource() {
  const text = nodeGraphShaderScriptSourceText();
  try {
    await navigator.clipboard.writeText(text);
    nodeGraphShaderScriptStatus("copied", false);
  } catch {
    nodeGraphShaderScriptStatus("copy unavailable", true);
  }
}

async function pasteNodeGraphShaderScriptSource() {
  try {
    const text = await navigator.clipboard.readText();
    setNodeGraphShaderScriptSourceText(text);
    nodeGraphShaderScriptStatus("pasted", false);
  } catch {
    nodeGraphShaderScriptStatus("paste unavailable", true);
  }
}

function downloadNodeGraphShaderScriptSource(filename, source) {
  nodeGraphDownloadTextFile(filename, source);
}

async function exportNodeGraphShaderScriptToDesktop() {
  const targetNode = nodeGraphShaderScriptDialogScopeNode();
  const title = targetNode ? nodeGraphPatchNodeTitle(targetNode) : "modular-shader";
  const source = nodeGraphShaderScriptSourceText();
  try {
    const response = await fetch("/api/shader-script/to-desktop", {
      body: JSON.stringify({ source, title }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "desktop export failed");
    }
    nodeGraphShaderScriptStatus(`desktop: ${result.filename}`, false);
  } catch {
    downloadNodeGraphShaderScriptSource(`${title.replace(/[^\w.-]+/g, "-") || "scope-shader"}.scope-shader.txt`, source);
    nodeGraphShaderScriptStatus("downloaded", false);
  }
}

function nodeGraphShaderScriptDialog() {
  return document.getElementById("nodeShaderScriptDialog");
}

function nodeGraphShaderScriptDialogCanDragTarget(target) {
  return !target?.closest?.("button, textarea, input, select, option, .node-shader-script-editor");
}

function positionNodeGraphShaderScriptDialog(left, top) {
  const dialog = nodeGraphShaderScriptDialog();
  if (!dialog) {
    return;
  }
  const { left: nextLeft, top: nextTop } = nodeGraphFloatingWindowPosition(dialog, left, top);
  setNodeGraphFloatingWindowViewportPosition(dialog, nextLeft, nextTop);
  dialog.style.bottom = "auto";
}

function beginNodeGraphShaderScriptDialogDrag(event) {
  if (event.button > 0 || !nodeGraphShaderScriptDialogCanDragTarget(event.target)) {
    return;
  }
  const dialog = nodeGraphShaderScriptDialog();
  if (!dialog || dialog.hidden) {
    return;
  }
  const rect = dialog.getBoundingClientRect();
  nodeGraphShaderScriptState.dialogDrag = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    pointerId: event.pointerId ?? null,
  };
  dialog.classList.add("dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function dragNodeGraphShaderScriptDialog(event) {
  const drag = nodeGraphShaderScriptState.dialogDrag;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  positionNodeGraphShaderScriptDialog(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  event.preventDefault();
}

function endNodeGraphShaderScriptDialogDrag(event) {
  const drag = nodeGraphShaderScriptState.dialogDrag;
  if (
    !drag ||
    (drag.pointerId !== null && event.pointerId !== undefined && drag.pointerId !== event.pointerId)
  ) {
    return;
  }
  nodeGraphShaderScriptState.dialogDrag = null;
  nodeGraphShaderScriptDialog()?.classList.remove("dragging");
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  event.preventDefault();
}

function nodeGraphShaderScriptDialogScopeNode() {
  const nodeId = String(nodeGraphShaderScriptState.scopeTargetNodeId || "").trim();
  return nodeId ? nodeGraphPatchNode(nodeId) : null;
}

function nodeGraphShaderScriptDialogScopeSource() {
  const node = nodeGraphShaderScriptDialogScopeNode();
  if (node && !Object.hasOwn(node, "scopeShader")) {
    const moduleDefault = nodeGraphScopeShaderModuleDefaultSource(node);
    if (moduleDefault) {
      return compactNodeGraphShaderScriptSource(moduleDefault);
    }
    if (typeof nodeGraphScopeShaderDefaultSourceForType === "function") {
      return compactNodeGraphShaderScriptSource(nodeGraphScopeShaderDefaultSourceForType(node.type));
    }
  }
  return compactNodeGraphShaderScriptSource(normalizeNodeGraphScopeShader(node?.scopeShader).source);
}

function nodeGraphShaderScriptDialogScopeVideoInput() {
  const source = nodeGraphShaderScriptState.dialogMode === "scope"
    ? document.getElementById("nodeShaderScriptSource")?.value || nodeGraphShaderScriptDialogScopeSource()
    : "";
  return normalizeNodeGraphScopeShader({ source }).videoInput;
}

function nodeGraphShaderScriptVideoInputChoices(node = nodeGraphShaderScriptDialogScopeNode()) {
  const ports = node ? nodeGraphPatchNodeOutputPorts(node) : [];
  const labels = nodeGraphModuleDefinitions[node?.type]?.outputLabels || {};
  return [
    { label: "~", title: "module camera", value: "~" },
    ...ports.map((port, index) => ({
      label: labels[port] || port,
      port,
      title: port,
      value: `output${index}`,
    })),
  ];
}

function replaceNodeGraphShaderScriptVideoInputLine(value) {
  const source = document.getElementById("nodeShaderScriptSource");
  if (!source) {
    return;
  }
  const nextValue = normalizeNodeGraphScopeShaderVideoInput(value);
  const text = source.value || "";
  const linePattern = /(^|\n)\s*video\.input\s*=\s*(~|none|output\d+)\s*;/i;
  if (linePattern.test(text)) {
    source.value = text.replace(linePattern, (match, prefix) => `${prefix}video.input     = ${nextValue};`);
  } else {
    source.value = `video.input     = ${nextValue};\n${text}`;
  }
  handleNodeGraphShaderScriptSourceChanged();
}

function syncNodeGraphShaderScriptVideoInputControls() {
  const bar = document.getElementById("nodeShaderScriptVideoInputBar");
  const choices = document.getElementById("nodeShaderScriptVideoInputChoices");
  const scopeMode = nodeGraphShaderScriptState.dialogMode === "scope";
  const node = scopeMode ? nodeGraphShaderScriptDialogScopeNode() : null;
  if (!bar || !choices) {
    return;
  }
  bar.hidden = !scopeMode || !node;
  choices.replaceChildren();
  if (bar.hidden) {
    return;
  }
  const selected = nodeGraphShaderScriptDialogScopeVideoInput();
  for (const choice of nodeGraphShaderScriptVideoInputChoices(node)) {
    const button = document.createElement("button");
    button.type = "button";
    if (choice.port) {
      const index = document.createElement("span");
      index.className = "node-shader-script-video-input-index";
      index.textContent = choice.value;
      const label = document.createElement("span");
      label.className = "node-shader-script-video-input-label";
      label.textContent = choice.label;
      button.append(index, label);
    } else {
      button.textContent = choice.label;
    }
    button.title = choice.port ? `${choice.value}: ${choice.title || choice.label}` : choice.title || choice.label;
    button.dataset.shaderVideoInput = choice.value;
    button.setAttribute("aria-pressed", String(choice.value === selected));
    button.addEventListener("click", () => replaceNodeGraphShaderScriptVideoInputLine(choice.value));
    choices.append(button);
  }
}

function nodeGraphShaderScriptUtilityCameraId(nodeId = nodeGraphShaderScriptState.scopeTargetNodeId) {
  return `scope-shader-${String(nodeId || "target").trim() || "target"}`;
}

function copyNodeGraphShaderScriptScopeCanvasCrop(sourceCanvas, sourceRect, targetSurface) {
  if (!sourceCanvas || !sourceRect || !targetSurface) {
    return false;
  }
  const sourceCanvasRect = sourceCanvas.getBoundingClientRect();
  if (
    sourceCanvasRect.width <= 0 ||
    sourceCanvasRect.height <= 0 ||
    sourceCanvas.width <= 0 ||
    sourceCanvas.height <= 0
  ) {
    return false;
  }
  const scaleX = sourceCanvas.width / sourceCanvasRect.width;
  const scaleY = sourceCanvas.height / sourceCanvasRect.height;
  const sourceX = clampNodeSliderValue((sourceRect.left - sourceCanvasRect.left) * scaleX, 0, Math.max(0, sourceCanvas.width - 1));
  const sourceY = clampNodeSliderValue((sourceRect.top - sourceCanvasRect.top) * scaleY, 0, Math.max(0, sourceCanvas.height - 1));
  const sourceWidth = Math.max(1, Math.min(sourceCanvas.width - sourceX, sourceRect.width * scaleX));
  const sourceHeight = Math.max(1, Math.min(sourceCanvas.height - sourceY, sourceRect.height * scaleY));
  const cssWidth = Math.max(1, Number(sourceRect.width) || 1);
  const cssHeight = Math.max(1, Number(sourceRect.height) || 1);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.className = "node-shader-script-scope-crop-canvas";
  cropCanvas.width = Math.max(1, Math.ceil(sourceWidth));
  cropCanvas.height = Math.max(1, Math.ceil(sourceHeight));
  cropCanvas.style.position = "absolute";
  cropCanvas.style.left = "0";
  cropCanvas.style.top = "0";
  cropCanvas.style.width = `${cssWidth}px`;
  cropCanvas.style.height = `${cssHeight}px`;
  cropCanvas.style.pointerEvents = "none";
  try {
    cropCanvas.getContext("2d")?.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height,
    );
  } catch {
    return false;
  }
  targetSurface.append(cropCanvas);
  return true;
}

function decorateNodeGraphShaderScriptScopePreviewClone(clone) {
  const node = nodeGraphShaderScriptDialogScopeNode();
  const nodeId = node?.id || "";
  if (!clone || !nodeId) {
    return;
  }
  const liveNode = nodeGraphNodeElement(nodeId);
  const liveScope = liveNode?.querySelector(".node-module-scope-window, .node-led-face");
  const cloneNode = clone.querySelector(`.dsp-node[data-node="${CSS.escape(nodeId)}"]`);
  const cloneScope = cloneNode?.querySelector(".node-module-scope-window, .node-led-face");
  const cloneSurface = cloneScope?.querySelector(".node-module-scope-window-surface") || cloneScope;
  if (!liveScope || !cloneSurface) {
    return;
  }
  clone.querySelectorAll(".node-module-scope-canvas, .node-module-scope-light-canvas").forEach((canvas) => {
    canvas.style.display = "none";
  });
  cloneSurface.querySelectorAll(".node-shader-script-scope-crop-canvas").forEach((canvas) => canvas.remove());
  const sourceRect = liveScope.getBoundingClientRect();
  copyNodeGraphShaderScriptScopeCanvasCrop(document.getElementById("nodeModuleScopeCanvas"), sourceRect, cloneSurface);
  copyNodeGraphShaderScriptScopeCanvasCrop(document.getElementById("nodeModuleScopeLightCanvas"), sourceRect, cloneSurface);
}

function drawNodeGraphShaderScriptScopePreview() {
  nodeGraphShaderScriptState.previewFrame = 0;
  const panel = document.getElementById("nodeShaderScriptPreviewPanel");
  const viewport = document.getElementById("nodeShaderScriptCameraViewport");
  const surface = document.getElementById("nodeShaderScriptCameraSurface");
  const status = document.getElementById("nodeShaderScriptPreviewStatus");
  if (
    nodeGraphShaderScriptState.dialogMode !== "scope" ||
    !panel ||
    panel.hidden ||
    !viewport ||
    !surface
  ) {
    return;
  }
  const node = nodeGraphShaderScriptDialogScopeNode();
  const videoInput = nodeGraphShaderScriptDialogScopeVideoInput();
  if (videoInput === "none") {
    surface.replaceChildren();
    if (status) {
      status.textContent = "Video input: none.";
    }
    scheduleNodeGraphShaderScriptScopePreview();
    return;
  }
  if (videoInput.startsWith("output")) {
    const choice = nodeGraphShaderScriptVideoInputChoices(node).find((candidate) => candidate.value === videoInput);
    if (status) {
      status.textContent = choice?.title ? `Monitoring ${choice.title}.` : `Monitoring ${videoInput}.`;
    }
  }
  const element = node?.id ? nodeGraphNodeElement(node.id) : null;
  const camera = typeof createNodeGraphUtilityCameraForElement === "function"
    ? createNodeGraphUtilityCameraForElement(nodeGraphShaderScriptUtilityCameraId(node?.id), element, {
      name: node ? `Display Shader: ${nodeGraphPatchNodeTitle(node)}` : "Display Shader",
      padding: nodeGraphShaderScriptUtilityCameraPadding,
    })
    : null;
  if (!camera || typeof renderNodeGraphCameraFeed !== "function") {
    surface.replaceChildren();
    if (status) {
      status.textContent = "No display selected.";
    }
    scheduleNodeGraphShaderScriptScopePreview();
    return;
  }
  try {
    if (typeof drawNodeGraphModuleScopes === "function") {
      drawNodeGraphModuleScopes();
    }
    renderNodeGraphCameraFeed({
      camera,
      decorateClone: decorateNodeGraphShaderScriptScopePreviewClone,
      surface,
      viewport,
    });
    if (status) {
      status.textContent = videoInput.startsWith("output")
        ? status.textContent
        : "";
    }
  } catch {
    surface.replaceChildren();
    if (status) {
      status.textContent = "Camera feed unavailable.";
    }
  }
  scheduleNodeGraphShaderScriptScopePreview();
}

function scheduleNodeGraphShaderScriptScopePreview() {
  if (nodeGraphShaderScriptState.previewFrame) {
    return;
  }
  if (
    nodeGraphShaderScriptState.dialogMode !== "scope" ||
    document.getElementById("nodeShaderScriptDialog")?.hidden
  ) {
    return;
  }
  nodeGraphShaderScriptState.previewFrame = window.requestAnimationFrame(drawNodeGraphShaderScriptScopePreview);
}

function syncNodeGraphShaderScriptControls(options = {}) {
  const source = document.getElementById("nodeShaderScriptSource");
  const scopeMode = nodeGraphShaderScriptState.dialogMode === "scope";
  if (source && (options.forceSource || document.activeElement !== source)) {
    source.value = scopeMode
      ? nodeGraphShaderScriptDialogScopeSource()
      : nodeGraphShaderScriptState.fragmentSource;
  }
  updateNodeGraphShaderScriptHighlight();
  const title = document.getElementById("nodeShaderScriptTitle");
  const targetNode = scopeMode ? nodeGraphShaderScriptDialogScopeNode() : null;
  if (title) {
    title.textContent = scopeMode && targetNode
      ? `Display Shader: ${nodeGraphPatchNodeTitle(targetNode)}`
      : "Shader Script";
  }
  const modeLabel = title?.closest?.(".node-shader-script-heading")?.querySelector?.("span");
  if (modeLabel) {
    modeLabel.textContent = scopeMode ? "module scope" : "modular view";
  }
  const enable = document.getElementById("nodeShaderScriptEnable");
  if (enable) {
    enable.hidden = scopeMode;
    enable.textContent = "Disable";
    enable.setAttribute(
      "aria-label",
      "Disable live post processing shader"
    );
    enable.setAttribute("aria-pressed", String(!nodeGraphShaderScriptState.enabled && !scopeMode));
  }
  const applyButton = document.getElementById("nodeShaderScriptApply");
  if (applyButton) {
    applyButton.textContent = scopeMode ? "Save" : "Apply";
    applyButton.setAttribute("aria-pressed", String(Boolean(nodeGraphShaderScriptState.enabled && !scopeMode)));
    applyButton.setAttribute(
      "aria-label",
      scopeMode ? "Save display shader" : "Apply and enable live post processing shader"
    );
  }
  const previewPanel = document.getElementById("nodeShaderScriptPreviewPanel");
  if (previewPanel) {
    previewPanel.hidden = !scopeMode;
  }
  syncNodeGraphShaderScriptVideoInputControls();
  const toolbar = document.getElementById("nodeShaderScriptButton");
  if (toolbar) {
    toolbar.setAttribute("aria-pressed", String(Boolean(nodeGraphShaderScriptState.enabled)));
  }
  const uiSetting = document.getElementById("nodeUiDevModularShaderEnabled");
  if (uiSetting && document.activeElement !== uiSetting) {
    uiSetting.checked = Boolean(nodeGraphShaderScriptState.enabled);
  }
  nodeGraphShaderScriptWorkspace()?.classList.toggle("shader-enabled", Boolean(nodeGraphShaderScriptState.enabled));
  applyNodeGraphShaderScriptEditorFontSize();
  applyNodeGraphShaderScriptSyntaxColors();
  scheduleNodeGraphShaderScriptScopePreview();
}

function clearNodeGraphShaderScriptCanvas() {
  const canvas = nodeGraphShaderScriptCanvas();
  const gl = nodeGraphShaderScriptState.renderer?.gl || canvas?.getContext?.("webgl");
  if (!gl) {
    return;
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function nodeGraphShaderScriptRects(canvas) {
  const workspace = nodeGraphShaderScriptWorkspace();
  if (!workspace || !canvas?.width || !canvas?.height) {
    return [];
  }
  const workspaceRect = workspace.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, workspaceRect.width);
  const scaleY = canvas.height / Math.max(1, workspaceRect.height);
  return [...workspace.querySelectorAll(".node-module-scope-window, .node-led-face")]
    .filter((scope) => scope.offsetParent !== null)
    .slice(0, nodeGraphShaderScriptMaxScopes)
    .map((scope) => {
      const rect = scope.getBoundingClientRect();
      const x = ((rect.left - workspaceRect.left) * scaleX) / canvas.width;
      const y = (canvas.height - ((rect.bottom - workspaceRect.top) * scaleY)) / canvas.height;
      const width = (rect.width * scaleX) / canvas.width;
      const height = (rect.height * scaleY) / canvas.height;
      return [
        clampNodeSliderValue(x, -1, 2),
        clampNodeSliderValue(y, -1, 2),
        clampNodeSliderValue(width, 0, 2),
        clampNodeSliderValue(height, 0, 2),
      ];
    });
}

function resizeNodeGraphShaderCanvas(canvas) {
  const workspace = nodeGraphShaderScriptWorkspace();
  if (!workspace || !canvas) {
    return false;
  }
  const pixelRatio = window.devicePixelRatio || 1;
  const rect = workspace.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  return true;
}

function drawNodeGraphShaderScriptFrame() {
  nodeGraphShaderScriptState.animationFrame = 0;
  if (!nodeGraphShaderScriptState.enabled) {
    return;
  }
  const canvas = nodeGraphShaderScriptCanvas();
  if (!resizeNodeGraphShaderCanvas(canvas)) {
    scheduleNodeGraphShaderScriptDraw();
    return;
  }
  const renderer = nodeGraphShaderScriptState.renderer ||= createNodeGraphShaderRenderer(canvas);
  if (!renderer || !nodeGraphShaderScriptState.program) {
    updateNodeGraphShaderProgram();
    scheduleNodeGraphShaderScriptDraw();
    return;
  }
  const { gl } = renderer;
  const program = nodeGraphShaderScriptState.program;
  const scopeRects = nodeGraphShaderScriptRects(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
  gl.enableVertexAttribArray(renderer.positionLocation);
  gl.vertexAttribPointer(renderer.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(renderer.resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(renderer.timeLocation, (performance.now?.() || Date.now()) / 1000);
  gl.uniform1f(renderer.zoomLocation, Number(nodeGraphMvp?.zoom) || 1);
  gl.uniform1i(renderer.scopeCountLocation, scopeRects.length);
  for (let index = 0; index < nodeGraphShaderScriptMaxScopes; index += 1) {
    const rect = scopeRects[index] || [0, 0, 0, 0];
    const location = renderer.rectLocations[index];
    if (location) {
      gl.uniform4f(location, rect[0], rect[1], rect[2], rect[3]);
    }
  }
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disableVertexAttribArray(renderer.positionLocation);
  scheduleNodeGraphShaderScriptDraw();
}

function scheduleNodeGraphShaderScriptDraw() {
  if (nodeGraphShaderScriptState.animationFrame || !nodeGraphShaderScriptState.enabled) {
    return;
  }
  nodeGraphShaderScriptState.animationFrame = window.requestAnimationFrame(drawNodeGraphShaderScriptFrame);
}

function setNodeGraphShaderScriptEnabled(enabled, options = {}) {
  const nextEnabled = Boolean(enabled);
  nodeGraphShaderScriptState.enabled = nextEnabled;
  if (!nextEnabled && nodeGraphShaderScriptState.liveApplyTimer) {
    window.clearTimeout(nodeGraphShaderScriptState.liveApplyTimer);
    nodeGraphShaderScriptState.liveApplyTimer = 0;
  }
  if (options.persist !== false) {
    saveNodeGraphShaderScriptState();
  }
  syncNodeGraphShaderScriptControls();
  if (nextEnabled) {
    scheduleNodeGraphShaderScriptDraw();
  } else {
    clearNodeGraphShaderScriptCanvas();
  }
}

function setNodeGraphShaderScriptDialogVisible(visible) {
  const dialog = nodeGraphShaderScriptDialog();
  if (!dialog) {
    return;
  }
  dialog.hidden = !visible;
  if (visible) {
    syncNodeGraphShaderScriptControls({ forceSource: true });
    document.getElementById("nodeShaderScriptSource")?.focus();
  } else {
    if (nodeGraphShaderScriptState.previewFrame) {
      window.cancelAnimationFrame(nodeGraphShaderScriptState.previewFrame);
      nodeGraphShaderScriptState.previewFrame = 0;
    }
    if (typeof removeNodeGraphUtilityCamera === "function") {
      removeNodeGraphUtilityCamera(nodeGraphShaderScriptUtilityCameraId());
    }
    setNodeGraphShaderScriptSyntaxColorsPanelVisible(false);
  }
}

function nodeGraphShaderScriptSavedSourceForDialog() {
  return nodeGraphShaderScriptState.dialogMode === "scope"
    ? nodeGraphShaderScriptDialogScopeSource()
    : nodeGraphShaderScriptState.fragmentSource;
}

function normalizeNodeGraphShaderScriptDirtySource(source) {
  return compactNodeGraphShaderScriptSource(String(source || ""));
}

function nodeGraphShaderScriptDialogIsDirty() {
  const dialog = nodeGraphShaderScriptDialog();
  if (!dialog || dialog.hidden) {
    return false;
  }
  return normalizeNodeGraphShaderScriptDirtySource(nodeGraphShaderScriptSourceText()) !==
    normalizeNodeGraphShaderScriptDirtySource(nodeGraphShaderScriptSavedSourceForDialog());
}

function saveNodeGraphShaderScriptDialogChanges() {
  if (nodeGraphShaderScriptState.dialogMode === "scope") {
    return saveNodeGraphScopeShaderScriptFromDialog();
  }
  const source = nodeGraphShaderScriptSourceText();
  if (!updateNodeGraphShaderProgram(source)) {
    return false;
  }
  setNodeGraphShaderScriptEnabled(true);
  return true;
}

function closeNodeGraphShaderScriptDialogWithDirtyCheck() {
  if (!nodeGraphShaderScriptDialogIsDirty()) {
    setNodeGraphShaderScriptDialogVisible(false);
    return true;
  }
  if (window.confirm("Save shader changes before closing?")) {
    if (!saveNodeGraphShaderScriptDialogChanges()) {
      nodeGraphShaderScriptStatus("save failed; editor left open", true);
      return false;
    }
    setNodeGraphShaderScriptDialogVisible(false);
    return true;
  }
  if (window.confirm("Discard unsaved shader changes?")) {
    setNodeGraphShaderScriptDialogVisible(false);
    return true;
  }
  nodeGraphShaderScriptStatus("close canceled", false);
  return false;
}

function setNodeGraphShaderScriptDialogMode(mode, nodeId = "") {
  nodeGraphShaderScriptState.dialogMode = mode === "scope" ? "scope" : "global";
  nodeGraphShaderScriptState.scopeTargetNodeId = nodeGraphShaderScriptState.dialogMode === "scope"
    ? String(nodeId || "").trim()
    : "";
}

function openNodeGraphGlobalShaderScript() {
  setNodeGraphShaderScriptDialogMode("global");
  setNodeGraphShaderScriptDialogVisible(true);
}

function openNodeGraphScopeShaderScript(nodeId) {
  const node = nodeGraphPatchNode(nodeId);
  if (!node) {
    return false;
  }
  return false;
}

function disableNodeGraphShaderScriptLiveApply() {
  setNodeGraphShaderScriptEnabled(false);
  nodeGraphShaderScriptStatus("post processing disabled", false);
}

function saveNodeGraphScopeShaderScriptFromDialog() {
  const targetNode = nodeGraphShaderScriptDialogScopeNode();
  if (!targetNode) {
    nodeGraphShaderScriptStatus("display module missing", true);
    return false;
  }
  const source = document.getElementById("nodeShaderScriptSource")?.value || "";
  const patch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const node = patch.nodes.find((candidate) => candidate.id === targetNode.id);
  if (!node) {
    nodeGraphShaderScriptStatus("display module missing", true);
    return false;
  }
  node.scopeShader = normalizeNodeGraphScopeShader({
    ...node.scopeShader,
    source,
  });
  commitNodeGraphPatch(patch, {
    status: `display shader saved for ${nodeGraphPatchNodeTitle(node)}`,
  });
  nodeGraphShaderScriptStatus("display shader saved", false);
  return true;
}

function applyNodeGraphShaderScriptFromDialog() {
  if (nodeGraphShaderScriptState.dialogMode === "scope") {
    saveNodeGraphScopeShaderScriptFromDialog();
    return;
  }
  const source = document.getElementById("nodeShaderScriptSource")?.value || "";
  if (updateNodeGraphShaderProgram(source)) {
    setNodeGraphShaderScriptEnabled(true);
  }
}

function applyNodeGraphShaderScriptLiveFromEditor() {
  nodeGraphShaderScriptState.liveApplyTimer = 0;
  if (nodeGraphShaderScriptState.dialogMode !== "global" || !nodeGraphShaderScriptState.enabled) {
    return;
  }
  const source = document.getElementById("nodeShaderScriptSource")?.value || "";
  updateNodeGraphShaderProgram(source);
}

function scheduleNodeGraphShaderScriptLiveApply() {
  if (nodeGraphShaderScriptState.dialogMode !== "global" || !nodeGraphShaderScriptState.enabled) {
    return;
  }
  if (nodeGraphShaderScriptState.liveApplyTimer) {
    window.clearTimeout(nodeGraphShaderScriptState.liveApplyTimer);
  }
  nodeGraphShaderScriptState.liveApplyTimer = window.setTimeout(
    applyNodeGraphShaderScriptLiveFromEditor,
    90,
  );
}

function handleNodeGraphShaderScriptSourceChanged() {
  updateNodeGraphShaderScriptHighlight();
  closeNodeGraphShaderScriptTokenWidget();
  syncNodeGraphShaderScriptVideoInputControls();
  if (typeof scheduleNodeGraphModuleScopeDraw === "function") {
    scheduleNodeGraphModuleScopeDraw();
  }
  scheduleNodeGraphShaderScriptScopePreview();
  scheduleNodeGraphShaderScriptLiveApply();
}

function bindNodeGraphShaderScriptEvents() {
  loadNodeGraphShaderScriptState();
  syncNodeGraphShaderScriptControls();
  document.getElementById("nodeShaderScriptButton")?.addEventListener("click", () =>
    openNodeGraphGlobalShaderScript());
  document.getElementById("nodeShaderScriptClose")?.addEventListener("click", () =>
    closeNodeGraphShaderScriptDialogWithDirtyCheck());
  document.getElementById("nodeShaderScriptApply")?.addEventListener("click", applyNodeGraphShaderScriptFromDialog);
  document.getElementById("nodeShaderScriptCopy")?.addEventListener("click", copyNodeGraphShaderScriptSource);
  document.getElementById("nodeShaderScriptCopyStatus")?.addEventListener("click", copyNodeGraphShaderScriptStatus);
  document.getElementById("nodeShaderScriptPaste")?.addEventListener("click", pasteNodeGraphShaderScriptSource);
  document.getElementById("nodeShaderScriptToDesktop")?.addEventListener("click", exportNodeGraphShaderScriptToDesktop);
  document.getElementById("nodeShaderScriptTextSizeDecrease")?.addEventListener("click", () =>
    changeNodeGraphShaderScriptEditorFontSize(-nodeGraphShaderScriptEditorFontSizeLimits.stepPx));
  document.getElementById("nodeShaderScriptTextSizeIncrease")?.addEventListener("click", () =>
    changeNodeGraphShaderScriptEditorFontSize(nodeGraphShaderScriptEditorFontSizeLimits.stepPx));
  document.getElementById("nodeShaderScriptSyntaxColorsButton")?.addEventListener("click", toggleNodeGraphShaderScriptSyntaxColorsPanel);
  document.getElementById("nodeShaderScriptSyntaxColorsReset")?.addEventListener("click", resetNodeGraphShaderScriptSyntaxColors);
  document.querySelectorAll("[data-shader-syntax-color]").forEach((input) => {
    input.addEventListener("input", () => setNodeGraphShaderScriptSyntaxColor(input.dataset.shaderSyntaxColor, input.value));
  });
  const source = document.getElementById("nodeShaderScriptSource");
  source?.addEventListener("input", handleNodeGraphShaderScriptSourceChanged);
  source?.addEventListener("scroll", updateNodeGraphShaderScriptHighlight);
  source?.addEventListener("pointerdown", beginNodeGraphShaderScriptNumberTokenDrag);
  source?.addEventListener("pointermove", dragNodeGraphShaderScriptNumberToken);
  source?.addEventListener("pointercancel", endNodeGraphShaderScriptNumberTokenDrag);
  source?.addEventListener("pointerup", endNodeGraphShaderScriptNumberTokenDrag);
  source?.addEventListener("pointerup", handleNodeGraphShaderScriptSourcePointer);
  source?.addEventListener("keyup", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const token = findNodeGraphShaderScriptEditableTokenAt(source.selectionStart ?? 0);
      if (token) {
        openNodeGraphShaderScriptTokenWidget(token, event);
      } else {
        closeNodeGraphShaderScriptTokenWidget();
      }
    }
  });
  document.getElementById("nodeShaderScriptModeWidget")?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-shader-mode-option]");
    if (!button) {
      return;
    }
    const token = nodeGraphShaderScriptState.tokenWidget;
    const option = button.dataset.shaderModeOption;
    const optionKind = button.dataset.shaderModeKind || "";
    if (token?.type === "mode" && optionKind === token.modeKind && nodeGraphShaderScriptModeTokenKind(option) === optionKind) {
      replaceNodeGraphShaderScriptToken(option);
      populateNodeGraphShaderScriptModeWidget(nodeGraphShaderScriptState.tokenWidget);
    }
  });
  const panel = document.querySelector("#nodeShaderScriptDialog .node-shader-script-panel");
  panel?.addEventListener("pointerdown", beginNodeGraphShaderScriptDialogDrag);
  panel?.addEventListener("pointermove", dragNodeGraphShaderScriptDialog);
  panel?.addEventListener("pointerup", endNodeGraphShaderScriptDialogDrag);
  panel?.addEventListener("pointercancel", endNodeGraphShaderScriptDialogDrag);
  document.getElementById("nodeShaderScriptEnable")?.addEventListener("click", disableNodeGraphShaderScriptLiveApply);
  updateNodeGraphShaderProgram(nodeGraphShaderScriptState.fragmentSource);
  if (nodeGraphShaderScriptState.enabled) {
    scheduleNodeGraphShaderScriptDraw();
  }
}
