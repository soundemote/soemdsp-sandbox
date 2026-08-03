// Scope WebGL program / renderer helpers (Phase D).
// Load after scopes.js. Extract-only.

function createNodeGraphModuleScopeShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("module scope shader compile failed", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createNodeGraphModuleScopeProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createNodeGraphModuleScopeShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createNodeGraphModuleScopeShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("module scope shader link failed", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createNodeGraphModuleScopeWebGlRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }) || canvas.getContext("experimental-webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }

  const colorProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `, `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
      gl_FragColor = uColor;
    }
  `);
  const beamProgram = createNodeGraphModuleScopeProgram(gl, `
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    attribute float aPointAge;
    uniform vec2 uCanvasSize;
    uniform float uSize;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vPointAge;
    void main() {
      vec2 segment = aEnd - aStart;
      float segmentLength = max(length(segment), 0.0001);
      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2(-tangent.y, tangent.x);
      float side = (aCorner == 0.0 || aCorner == 2.0) ? 1.0 : -1.0;
      float endpointMix = aCorner < 2.0 ? 0.0 : 1.0;
      float cap = aCorner < 2.0 ? -1.0 : 1.0;
      float beamHalfWidth = max(uSize * 1.85, 1.5);
      vec2 endpoint = mix(aStart, aEnd, endpointMix);
      vec2 position = endpoint + normal * side * beamHalfWidth + tangent * cap * beamHalfWidth;
      vStart = aStart;
      vEnd = aEnd;
      vPosition = position;
      vPointAge = aPointAge;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `, `
    precision highp float;
    uniform vec3 uColor;
    uniform float uBlur;
    uniform float uIntensity;
    uniform float uSize;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vPointAge;
    void main() {
      vec2 segment = vEnd - vStart;
      float segmentLengthSquared = max(dot(segment, segment), 0.0001);
      float along = clamp(dot(vPosition - vStart, segment) / segmentLengthSquared, 0.0, 1.0);
      vec2 closest = vStart + segment * along;
      float radius = max(uSize * 0.34, 0.0001);
      float normalizedDistance = length(vPosition - closest) / radius;
      if (normalizedDistance > 5.4) {
        discard;
      }
      float distanceSquared = normalizedDistance * normalizedDistance;
      float blur = clamp(uBlur, 0.0, 1.0);
      float edgeWidth = mix(0.01, 1.0, blur);
      float alpha = clamp((1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, normalizedDistance)) * uIntensity, 0.0, 1.0);
      gl_FragColor = vec4(uColor * alpha, alpha);
    }
  `);
  if (!colorProgram || !beamProgram) {
    if (colorProgram) {
      gl.deleteProgram(colorProgram);
    }
    if (beamProgram) {
      gl.deleteProgram(beamProgram);
    }
    return null;
  }

  const renderer = {
    beamBuffer: gl.createBuffer(),
    beamBlurLocation: gl.getUniformLocation(beamProgram, "uBlur"),
    beamCanvasSizeLocation: gl.getUniformLocation(beamProgram, "uCanvasSize"),
    beamColorLocation: gl.getUniformLocation(beamProgram, "uColor"),
    beamCornerLocation: gl.getAttribLocation(beamProgram, "aCorner"),
    beamEndLocation: gl.getAttribLocation(beamProgram, "aEnd"),
    beamIntensityLocation: gl.getUniformLocation(beamProgram, "uIntensity"),
    beamPointAgeLocation: gl.getAttribLocation(beamProgram, "aPointAge"),
    beamProgram,
    beamSizeLocation: gl.getUniformLocation(beamProgram, "uSize"),
    beamStartLocation: gl.getAttribLocation(beamProgram, "aStart"),
    canvas,
    colorLocation: gl.getUniformLocation(colorProgram, "uColor"),
    colorPositionBuffer: gl.createBuffer(),
    colorPositionLocation: gl.getAttribLocation(colorProgram, "aPosition"),
    colorProgram,
    gl,
    kind: "webgl",
  };
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return renderer;
}

function nodeGraphModuleScopeRenderer(canvas) {
  const current = nodeGraphModuleScopeState.renderer;
  if (current?.canvas === canvas) {
    return current;
  }
  const renderer = createNodeGraphModuleScopeWebGlRenderer(canvas);
  nodeGraphModuleScopeState.renderer = renderer;
  document.getElementById("nodeGraphWorkspace")
    ?.classList.toggle("module-scopes-webgl-unavailable", !renderer);
  return renderer;
}

function nodeGraphModuleScopeThreshold(buffer, start = 0, end = buffer.length) {
  const range = nodeGraphModuleScopeSampleRange(buffer, start, end);
  return range ? range.mid : null;
}

/** Min/max/mid/span over a buffer slice. Null when empty or DC (no edge material). */
function nodeGraphModuleScopeSampleRange(buffer, start = 0, end = buffer?.length || 0) {
  let min = Infinity;
  let max = -Infinity;
  const first = Math.max(0, Math.floor(start));
  const limit = Math.min(buffer?.length || 0, Math.ceil(end));
  for (let index = first; index < limit; index += 1) {
    const value = Number(buffer[index]) || 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-5) {
    return null;
  }
  return {
    max,
    mid: (min + max) * 0.5,
    min,
    span: max - min,
  };
}

/**
 * Rising-edge crossings. Optional hysteresis (oscilloscope-style) suppresses
 * chatter around the level: arm below level−hyst, fire above level+hyst.
 */
// Scope sync helpers → node-graph-module-scope-sync.js
