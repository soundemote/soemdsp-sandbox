// FBM Field — WebGL full-face 2D fBm (Soft Fractal–class path).
// Fragment shader evaluates value-noise FBM; palette is a 256×1 LUT texture.

const NODE_GRAPH_FBM_FIELD_GL_VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// GLSL ES 1.0 (WebGL1). Highp for smooth terrain without banding.
const NODE_GRAPH_FBM_FIELD_GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform float uScale;
uniform float uSmoothness;
uniform float uZoom;
uniform vec2 uPan;
uniform float uRotate;
uniform float uContrast;
uniform float uSeed;
uniform float uEvolve;
uniform float uSoft;
uniform sampler2D uPalette;
uniform vec3 uBackground;

// Hash → [0,1) (visual quality; audio uses integer WASM hash)
float hash21(vec2 p) {
  p = fract(p * vec2(123.34 + uSeed * 0.001, 456.21 + uSeed * 0.0007));
  p += dot(p, p + 45.32 + uSeed * 0.01);
  return fract(p.x * p.y);
}

float fade(float t, float smoothness) {
  float x = clamp(t, 0.0, 1.0);
  float s = clamp(smoothness, 0.0, 1.0);
  if (s <= 0.0) return x;
  float hermite = x * x * (3.0 - 2.0 * x);
  if (s <= 0.5) {
    float u = s * 2.0;
    return mix(x, hermite, u);
  }
  float quintic = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  float u = (s - 0.5) * 2.0;
  return mix(hermite, quintic, u);
}

// Bipolar value noise in 2D
float valueNoise2d(vec2 p, float smoothness) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float u = fade(f.x, smoothness);
  float v = fade(f.y, smoothness);
  float a = hash21(i) * 2.0 - 1.0;
  float b = hash21(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  float c = hash21(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  float d = hash21(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float x1 = mix(a, b, u);
  float x2 = mix(c, d, u);
  return mix(x1, x2, v);
}

float fbm2d(vec2 p, float octaves, float persistence, float lacunarity, float scale, float smoothness) {
  float total = 0.0;
  float amplitude = 1.0;
  float freq = 1.0;
  float maxValue = 0.0;
  // Fixed unroll bound; early-out by octaves
  for (int n = 0; n < 8; n++) {
    if (float(n) >= octaves) break;
    total += valueNoise2d(p * scale * freq + vec2(float(n) * 17.13, float(n) * 9.71), smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    freq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

float sampleEnergy(vec2 frag, vec2 offsetPx) {
  vec2 uv = (frag + offsetPx) / uResolution;
  uv.y = 1.0 - uv.y;
  vec2 n = uv * 2.0 - 1.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = vec2(n.x * aspect, n.y);
  float ang = uRotate * 6.28318530718;
  float c = cos(ang);
  float s = sin(ang);
  vec2 r = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  float span = 1.0 / max(0.05, uZoom);
  // uTime is domain position already integrated with Frequency (and Evolve scale).
  // uEvolve kept as residual scroll bias (usually 1 when time is pre-integrated).
  float scroll = uTime * max(uEvolve, 0.0);
  vec2 world = r * span + uPan + vec2(scroll, scroll * 0.73);
  float bipolar = fbm2d(world, uOctaves, uPersistence, uLacunarity, uScale, uSmoothness);
  float mono = bipolar * 0.5 + 0.5;
  // Contrast around mid-grey
  mono = 0.5 + (mono - 0.5) * max(0.0, uContrast);
  return clamp(mono, 0.0, 1.0);
}

vec3 paletteSample(float e, float soft) {
  vec3 c0 = texture2D(uPalette, vec2(e, 0.5)).rgb;
  if (soft < 0.05) {
    return c0;
  }
  float w = mix(0.01, 0.04, soft);
  vec3 cL = texture2D(uPalette, vec2(clamp(e - w, 0.0, 1.0), 0.5)).rgb;
  vec3 cR = texture2D(uPalette, vec2(clamp(e + w, 0.0, 1.0), 0.5)).rgb;
  return mix(c0, (cL + c0 + cR) / 3.0, soft * 0.85);
}

void main() {
  float soft = clamp(uSoft, 0.0, 1.0);
  float rad = mix(0.55, 1.6, soft);
  float energy = 0.0;
  float wsum = 0.0;

  energy += sampleEnergy(gl_FragCoord.xy, vec2(0.0)) * 1.2;
  wsum += 1.2;

  energy += sampleEnergy(gl_FragCoord.xy, vec2( rad,  0.0)) * 0.85;
  energy += sampleEnergy(gl_FragCoord.xy, vec2(-rad,  0.0)) * 0.85;
  energy += sampleEnergy(gl_FragCoord.xy, vec2( 0.0,  rad)) * 0.85;
  energy += sampleEnergy(gl_FragCoord.xy, vec2( 0.0, -rad)) * 0.85;
  wsum += 0.85 * 4.0;

  if (soft > 0.2) {
    float d = rad * 0.72;
    float tw = 0.4 + soft * 0.4;
    energy += sampleEnergy(gl_FragCoord.xy, vec2( d,  d)) * tw;
    energy += sampleEnergy(gl_FragCoord.xy, vec2(-d,  d)) * tw;
    energy += sampleEnergy(gl_FragCoord.xy, vec2( d, -d)) * tw;
    energy += sampleEnergy(gl_FragCoord.xy, vec2(-d, -d)) * tw;
    wsum += tw * 4.0;
  }

  float e = clamp(energy / max(1e-4, wsum), 0.0, 1.0);
  // Mild gamma so midtones read well through the LUT
  e = pow(e, mix(0.92, 1.05, soft));

  vec3 col = paletteSample(e, soft);

  // Soft vignette toward background
  vec2 q = gl_FragCoord.xy / uResolution - 0.5;
  float vig = smoothstep(1.1, 0.15, length(q) * 1.25);
  col = mix(uBackground, col, mix(0.92, 1.0, vig));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** @type {WeakMap<HTMLCanvasElement, object>} */
const nodeGraphFbmFieldGlStates = new WeakMap();

function nodeGraphFbmFieldGlCompile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function nodeGraphFbmFieldGlLink(gl, vsSource, fsSource) {
  const vs = nodeGraphFbmFieldGlCompile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = nodeGraphFbmFieldGlCompile(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "program link failed";
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  return prog;
}

function nodeGraphFbmFieldGlHexToRgb01(hex, fallback = [0.02, 0.024, 0.04]) {
  const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(hex, "#05060a")
    : String(hex || "#05060a");
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!match) {
    return fallback;
  }
  const n = Number.parseInt(match[1], 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

function nodeGraphFbmFieldGlEnsure(canvas) {
  if (!canvas) {
    return null;
  }
  let state = nodeGraphFbmFieldGlStates.get(canvas);
  if (state?.gl && !state.lost) {
    return state;
  }
  if (state?.failed) {
    return null;
  }

  let gl = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) || canvas.getContext("experimental-webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
  } catch (_) {
    gl = null;
  }
  if (!gl) {
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true });
    return null;
  }

  try {
    const program = nodeGraphFbmFieldGlLink(
      gl,
      NODE_GRAPH_FBM_FIELD_GL_VS,
      NODE_GRAPH_FBM_FIELD_GL_FS,
    );
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    const uniforms = {
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uTime: gl.getUniformLocation(program, "uTime"),
      uOctaves: gl.getUniformLocation(program, "uOctaves"),
      uPersistence: gl.getUniformLocation(program, "uPersistence"),
      uLacunarity: gl.getUniformLocation(program, "uLacunarity"),
      uScale: gl.getUniformLocation(program, "uScale"),
      uSmoothness: gl.getUniformLocation(program, "uSmoothness"),
      uZoom: gl.getUniformLocation(program, "uZoom"),
      uPan: gl.getUniformLocation(program, "uPan"),
      uRotate: gl.getUniformLocation(program, "uRotate"),
      uContrast: gl.getUniformLocation(program, "uContrast"),
      uSeed: gl.getUniformLocation(program, "uSeed"),
      uEvolve: gl.getUniformLocation(program, "uEvolve"),
      uSoft: gl.getUniformLocation(program, "uSoft"),
      uPalette: gl.getUniformLocation(program, "uPalette"),
      uBackground: gl.getUniformLocation(program, "uBackground"),
    };

    const paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const blank = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i += 1) {
      blank[i * 4 + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);

    state = {
      gl,
      program,
      buf,
      aPos,
      uniforms,
      paletteTex,
      paletteKey: "",
      lost: false,
      failed: false,
    };

    canvas.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();
      const s = nodeGraphFbmFieldGlStates.get(canvas);
      if (s) s.lost = true;
    }, false);
    canvas.addEventListener("webglcontextrestored", () => {
      nodeGraphFbmFieldGlStates.delete(canvas);
    }, false);

    nodeGraphFbmFieldGlStates.set(canvas, state);
    return state;
  } catch (err) {
    console.warn("[FBM Field] WebGL init failed, using CPU fallback", err);
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true });
    return null;
  }
}

function nodeGraphFbmFieldGlUploadPalette(state, stops, peak) {
  const gl = state.gl;
  const keyParts = [];
  if (Array.isArray(stops)) {
    for (let i = 0; i < stops.length; i += 1) {
      keyParts.push(String(stops[i]?.t), String(stops[i]?.color));
    }
  }
  keyParts.push(String(peak));
  const key = keyParts.join("|");
  if (state.paletteKey === key) {
    return;
  }
  state.paletteKey = key;

  const data = new Uint8Array(256 * 4);
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(stops, t, peak)
    : typeof nodeGraphFbmFieldSampleGradientRgb === "function"
      ? (t) => nodeGraphFbmFieldSampleGradientRgb(stops, t)
      : (t) => {
        const v = Math.round(t * 255);
        return [v, v, v];
      };
  for (let i = 0; i < 256; i += 1) {
    const rgb = sample(i / 255);
    const o = i * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

/**
 * Full-face GPU paint.
 * @returns {boolean}
 */
function nodeGraphFbmFieldGlPaint(canvas, params) {
  const state = nodeGraphFbmFieldGlEnsure(canvas);
  if (!state?.gl || state.lost) {
    return false;
  }
  const gl = state.gl;
  const w = canvas.width | 0;
  const h = canvas.height | 0;
  if (w < 1 || h < 1) {
    return false;
  }

  const stops = params.gradientStops;
  const peak = stops?.[stops.length - 1]?.color || "#ffffff";
  nodeGraphFbmFieldGlUploadPalette(state, stops, peak);

  gl.viewport(0, 0, w, h);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);

  const U = state.uniforms;
  gl.uniform2f(U.uResolution, w, h);
  gl.uniform1f(U.uTime, Number(params.time) || 0);
  gl.uniform1f(U.uOctaves, Math.max(1, Math.min(8, Number(params.octaves) || 4)));
  gl.uniform1f(U.uPersistence, Math.max(0, Math.min(0.99, Number(params.persistence) || 0.5)));
  gl.uniform1f(U.uLacunarity, Math.max(1, Math.min(4, Number(params.lacunarity) || 2)));
  gl.uniform1f(U.uScale, Math.max(0.000001, Number(params.scale) || 1));
  gl.uniform1f(U.uSmoothness, Math.max(0, Math.min(1, Number(params.smoothness) || 0.55)));
  gl.uniform1f(U.uZoom, Math.max(0.05, Number(params.zoom) || 1));
  gl.uniform2f(U.uPan, Number(params.panX) || 0, Number(params.panY) || 0);
  gl.uniform1f(U.uRotate, Number(params.rotate) || 0);
  gl.uniform1f(U.uContrast, Math.max(0, Number(params.contrast) || 1));
  gl.uniform1f(U.uSeed, Number(params.seed) || 1);
  gl.uniform1f(U.uEvolve, Number(params.speed) || 0.15);
  // Map smoothness toward a mild AA/soft look (0.15–0.55 typical)
  const soft = Math.max(0, Math.min(1, 0.2 + (Number(params.smoothness) || 0.55) * 0.45));
  gl.uniform1f(U.uSoft, soft);
  const bg = nodeGraphFbmFieldGlHexToRgb01(params.background);
  gl.uniform3f(U.uBackground, bg[0], bg[1], bg[2]);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(U.uPalette, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

/** Clear face to pure black (audio stopped / reset). */
function nodeGraphFbmFieldGlClearBlack(canvas) {
  const state = nodeGraphFbmFieldGlEnsure(canvas);
  if (!state?.gl || state.lost) {
    return false;
  }
  const gl = state.gl;
  gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return true;
}
