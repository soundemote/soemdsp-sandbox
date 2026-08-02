// Soft Fractal — WebGL full-face Julia (Milkdrop-class path).
// Fragment shader does smooth escape + orbit traps; palette is a 256×1 LUT texture.

const NODE_GRAPH_RGB_FRACTAL_GL_VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// GLSL ES 1.0 (WebGL1). Prefer highp so smooth coloring does not band/hard-edge.
// Soft knob: wider spatial AA, fewer iters (kills sub-pixel noise), gentler color wraps.
const NODE_GRAPH_RGB_FRACTAL_GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform vec2 uC;
uniform vec2 uCenter;
uniform float uHalfSpan;
uniform float uCosR;
uniform float uSinR;
uniform float uMaxIter;
uniform float uSoft;
uniform float uGlow;
uniform float uColorPhase;
uniform float uBreath;
uniform float uTrapMix;
uniform vec2 uTrapPoint;
uniform float uTime;
uniform float uFold;
uniform float uBands;
uniform float uDomainWarp;
uniform sampler2D uPalette;
uniform vec3 uBackground;

// Optional domain fold (kaleidoscope-ish) before Julia — denser structure, still evolves with c.
vec2 domainFold(vec2 z, float fold) {
  if (fold < 0.001) {
    return z;
  }
  float f = clamp(fold, 0.0, 1.0);
  // Reflect into first quadrant then re-expand with slight rotation over time
  vec2 a = abs(z);
  float ang = atan(a.y, a.x);
  float rad = length(a);
  float petals = mix(1.0, 4.0, f);
  ang = abs(mod(ang * petals + uTime * 0.15 * f, 3.14159265) - 1.5707963);
  vec2 folded = vec2(cos(ang), sin(ang)) * rad;
  return mix(z, folded, f * 0.85);
}

// One Julia sample → energy in [0,1]. soft already baked into maxIter / trap mix by caller.
float juliaEnergy(vec2 z0, vec2 c, float maxIter, float soft, float trapMix) {
  vec2 z = domainFold(z0, uFold);
  float trap = 1e6;
  float trap2 = 1e6;
  float i = 0.0;
  // Wider trap falloff when soft → fewer hard filaments
  float trapW = mix(1.0, 2.4, soft);
  float trapW2 = mix(0.7, 1.8, soft);

  for (int n = 0; n < 256; n++) {
    if (i >= maxIter) break;
    float x = z.x * z.x - z.y * z.y + c.x;
    float y = 2.0 * z.x * z.y + c.y;
    z = vec2(x, y);
    // Mild mid-iter fold for organic branching when fold > 0
    if (uFold > 0.2 && mod(i, 3.0) < 0.5) {
      z = mix(z, abs(z) * vec2(1.0, 1.0) - vec2(0.15, 0.1) * uFold, uFold * 0.25);
    }
    float r2 = dot(z, z);
    trap = min(trap, length(z - uTrapPoint));
    trap2 = min(trap2, abs(length(z) - 0.55));
    if (r2 > 256.0) {
      // Continuous potential (smooth escape time)
      float logZn = 0.5 * log(max(1e-12, r2));
      float nu = log(max(1e-12, logZn / log(2.0))) / log(2.0);
      float smoothI = i + 1.0 - nu;
      float escape = clamp(smoothI / max(1.0, maxIter), 0.0, 1.0);
      // Soften escape contour (hard rings → cream)
      escape = smoothstep(0.0, mix(0.55, 1.0, soft), escape);
      escape = mix(escape, smoothstep(0.0, 1.0, escape), soft * 0.85);

      float t1 = 1.0 - smoothstep(0.0, trapW, trap);
      float t2 = 1.0 - smoothstep(0.0, trapW2, trap2);
      // Soft kills sharp trap lines (main source of "tiny pixel noise")
      float traps = clamp(t1 * 0.55 + t2 * 0.45, 0.0, 1.0);
      traps = smoothstep(0.0, mix(0.35, 0.85, soft), traps);

      float tm = clamp(trapMix * (1.0 - soft * 0.65), 0.0, 0.85);
      float e = mix(escape, traps, tm);
      // Final soft curve — flattens micro-contrast
      e = mix(e, e * e * (3.0 - 2.0 * e), soft * 0.7);
      return clamp(e, 0.0, 1.0);
    }
    i += 1.0;
  }
  // Interior: wide trap glow, almost no high-freq sin when soft
  float t1 = 1.0 - smoothstep(0.0, mix(1.2, 2.2, soft), trap);
  float grain = (1.0 - soft) * 0.05 * sin(z0.x * 3.5 + z0.y * 2.8 + uTime);
  return clamp(0.05 + 0.14 * t1 + grain, 0.0, 1.0);
}

vec2 mapUvToZ(vec2 frag, vec2 offsetPx) {
  vec2 uv = (frag + offsetPx) / uResolution;
  uv.y = 1.0 - uv.y;
  vec2 n = uv * 2.0 - 1.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = vec2(n.x * uHalfSpan * aspect, n.y * uHalfSpan);
  vec2 r = vec2(p.x * uCosR - p.y * uSinR, p.x * uSinR + p.y * uCosR);
  return r + uCenter;
}

float sampleAt(vec2 frag, vec2 offsetPx, float maxIter, float soft, float trapMix) {
  vec2 z0 = mapUvToZ(frag, offsetPx);
  // Domain warp: soft haze + independent Domain Warp knob (liquid, not sparkle)
  float wAmt = soft * 0.04 + uDomainWarp * 0.12;
  if (wAmt > 0.001) {
    z0 += wAmt * vec2(
      sin(z0.y * (2.2 + uDomainWarp) + uTime * 1.1),
      cos(z0.x * (1.9 + uDomainWarp * 0.7) - uTime * 0.9)
    );
    // Second scale for non-repeating liquid
    z0 += wAmt * 0.45 * vec2(
      cos(z0.x * 0.7 - z0.y * 1.3 + uTime * 0.37),
      sin(z0.y * 0.9 + z0.x * 0.5 - uTime * 0.29)
    );
  }
  return juliaEnergy(z0, uC, maxIter, soft, trapMix);
}

// Soft triangle wrap: no hard palette discontinuities like raw fract()
float softWrap(float x) {
  float f = fract(x);
  // smooth triangle 0→1→0 with rounded peak/valley
  float tri = 1.0 - abs(f * 2.0 - 1.0);
  return smoothstep(0.0, 1.0, tri);
}

vec3 paletteSample(float e, float soft) {
  // Soft: low-pass the LUT so color edges don't sparkle
  vec3 c0 = texture2D(uPalette, vec2(e, 0.5)).rgb;
  if (soft < 0.08) {
    return c0;
  }
  float w = mix(0.012, 0.055, soft);
  vec3 cL = texture2D(uPalette, vec2(fract(e - w), 0.5)).rgb;
  vec3 cR = texture2D(uPalette, vec2(fract(e + w), 0.5)).rgb;
  vec3 cLL = texture2D(uPalette, vec2(fract(e - w * 2.0), 0.5)).rgb;
  vec3 cRR = texture2D(uPalette, vec2(fract(e + w * 2.0), 0.5)).rgb;
  vec3 blur = cLL * 0.1 + cL * 0.25 + c0 * 0.3 + cR * 0.25 + cRR * 0.1;
  return mix(c0, blur, clamp(soft * 1.1, 0.0, 1.0));
}

void main() {
  float soft = clamp(uSoft, 0.0, 1.0);
  float glowAmt = clamp(uGlow, 0.0, 1.35);
  // Soft rolls off iteration depth → sub-pixel filigree becomes smooth color, not noise
  float maxIter = max(20.0, uMaxIter * mix(1.0, 0.42, soft));
  float trapMix = uTrapMix;

  // Spatial AA radius in pixels — grows with soft (true anti-alias of fine structure)
  float rad = mix(0.65, 2.8, soft);
  float energy = 0.0;
  float wsum = 0.0;

  // Center
  {
    float s = sampleAt(gl_FragCoord.xy, vec2(0.0), maxIter, soft, trapMix);
    energy += s * 1.2;
    wsum += 1.2;
  }

  // 4-tap diamond (always on — baseline AA even at soft 0)
  {
    float tw = 0.85;
    energy += sampleAt(gl_FragCoord.xy, vec2( rad,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-rad,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0,  rad), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0, -rad), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  // 4-tap diagonals when soft enough (creamier, kills sparkle)
  if (soft > 0.18) {
    float d = rad * 0.72;
    float tw = 0.45 + soft * 0.45;
    energy += sampleAt(gl_FragCoord.xy, vec2( d,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( d, -d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d, -d), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  // Extra ring at high soft — larger footprint = dreamy, no pixel dust
  if (soft > 0.55) {
    float d = rad * 1.35;
    float tw = 0.35 + (soft - 0.55) * 0.8;
    energy += sampleAt(gl_FragCoord.xy, vec2( d,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0, -d), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  float e = energy / max(1e-4, wsum);
  e = clamp(e, 0.0, 1.0);

  // Contrast: soft flattens micro-detail; glow still lifts midtones gently
  float gamma = mix(0.78, 1.05, soft) - glowAmt * 0.1;
  e = pow(e, max(0.45, gamma));

  // Color bands: uBands from Bands knob; soft reduces wraps; glow still lifts richness
  float band = mix(uBands + glowAmt * 0.9, uBands * 0.45 + glowAmt * 0.4, soft);
  band = max(0.25, band);
  float phase = uColorPhase * mix(1.0, 0.55, soft);
  // Soft uses rounded triangle wrap; low soft uses gentle fract
  float eColor;
  if (soft > 0.25) {
    eColor = softWrap(e * band + phase);
    // Blend toward raw energy so it stays painterly, not zebra
    eColor = mix(e, eColor, mix(0.55, 0.35, soft));
  } else {
    eColor = fract(e * band + phase);
  }
  eColor = clamp(eColor * uBreath, 0.0, 1.0);
  // Soft pulls color toward mid palette (less extreme contrast edges)
  eColor = mix(eColor, 0.5 + (eColor - 0.5) * mix(1.0, 0.7, soft), soft * 0.5);

  vec3 col = paletteSample(eColor, soft);

  // Glow bloom (wide, soft) — full throw of Glow 0…4 maps into glowAmt
  if (glowAmt > 0.03) {
    vec2 q = gl_FragCoord.xy / uResolution - 0.5;
    float g = exp(-dot(q, q) * mix(2.6, 1.5, soft));
    vec3 tip = paletteSample(mix(0.88, 0.72, soft), soft);
    col += tip * g * (0.05 + glowAmt * 0.28) * mix(1.0, 0.75, soft);
  }

  // Soft overall haze toward background (dream plate)
  vec2 q2 = gl_FragCoord.xy / uResolution - 0.5;
  float vig = smoothstep(1.05, 0.2, length(q2) * 1.2);
  float haze = soft * 0.12;
  col = mix(col, uBackground, haze * (1.0 - vig * 0.5));
  col = mix(uBackground, col, mix(0.94, 1.0, vig));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** @type {WeakMap<HTMLCanvasElement, object>} */
const nodeGraphRgbFractalGlStates = new WeakMap();

function nodeGraphRgbFractalGlCompile(gl, type, source) {
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

function nodeGraphRgbFractalGlLink(gl, vsSource, fsSource) {
  const vs = nodeGraphRgbFractalGlCompile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = nodeGraphRgbFractalGlCompile(gl, gl.FRAGMENT_SHADER, fsSource);
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

function nodeGraphRgbFractalGlHexToRgb01(hex, fallback = [0.02, 0, 0.08]) {
  const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(hex, "#050014")
    : String(hex || "#050014");
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

/**
 * Acquire or rebuild WebGL state for a face canvas.
 * Returns null if WebGL unavailable (caller uses CPU fallback).
 */
function nodeGraphRgbFractalGlEnsure(canvas) {
  if (!canvas) {
    return null;
  }
  let state = nodeGraphRgbFractalGlStates.get(canvas);
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
    nodeGraphRgbFractalGlStates.set(canvas, { failed: true });
    return null;
  }

  try {
    const program = nodeGraphRgbFractalGlLink(
      gl,
      NODE_GRAPH_RGB_FRACTAL_GL_VS,
      NODE_GRAPH_RGB_FRACTAL_GL_FS,
    );
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Fullscreen triangle strip / quad
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1,
      ]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    const uniforms = {
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uC: gl.getUniformLocation(program, "uC"),
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uHalfSpan: gl.getUniformLocation(program, "uHalfSpan"),
      uCosR: gl.getUniformLocation(program, "uCosR"),
      uSinR: gl.getUniformLocation(program, "uSinR"),
      uMaxIter: gl.getUniformLocation(program, "uMaxIter"),
      uSoft: gl.getUniformLocation(program, "uSoft"),
      uGlow: gl.getUniformLocation(program, "uGlow"),
      uColorPhase: gl.getUniformLocation(program, "uColorPhase"),
      uBreath: gl.getUniformLocation(program, "uBreath"),
      uTrapMix: gl.getUniformLocation(program, "uTrapMix"),
      uTrapPoint: gl.getUniformLocation(program, "uTrapPoint"),
      uTime: gl.getUniformLocation(program, "uTime"),
      uFold: gl.getUniformLocation(program, "uFold"),
      uBands: gl.getUniformLocation(program, "uBands"),
      uDomainWarp: gl.getUniformLocation(program, "uDomainWarp"),
      uPalette: gl.getUniformLocation(program, "uPalette"),
      uBackground: gl.getUniformLocation(program, "uBackground"),
    };

    const paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Placeholder 256×1
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
      const s = nodeGraphRgbFractalGlStates.get(canvas);
      if (s) s.lost = true;
    }, false);
    canvas.addEventListener("webglcontextrestored", () => {
      nodeGraphRgbFractalGlStates.delete(canvas);
    }, false);

    nodeGraphRgbFractalGlStates.set(canvas, state);
    return state;
  } catch (err) {
    console.warn("[Soft Fractal] WebGL init failed, using CPU fallback", err);
    nodeGraphRgbFractalGlStates.set(canvas, { failed: true });
    return null;
  }
}

function nodeGraphRgbFractalGlUploadPalette(state, stops, peak) {
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
 * Full-face GPU paint. params from display orchestrator.
 * @returns {boolean} true if drawn
 */
function nodeGraphRgbFractalGlPaint(canvas, params) {
  const state = nodeGraphRgbFractalGlEnsure(canvas);
  if (!state?.gl || state.lost) {
    return false;
  }
  const gl = state.gl;
  const w = canvas.width | 0;
  const h = canvas.height | 0;
  if (w < 1 || h < 1) {
    return false;
  }

  if (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h) {
    // size changed via canvas.width — viewport below handles it
  }

  const stops = params.gradientStops;
  const peak = stops?.[stops.length - 1]?.color || "#ffffff";
  nodeGraphRgbFractalGlUploadPalette(state, stops, peak);

  gl.viewport(0, 0, w, h);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);

  const U = state.uniforms;
  gl.uniform2f(U.uResolution, w, h);
  gl.uniform2f(U.uC, params.cx, params.cy);
  gl.uniform2f(U.uCenter, params.centerX, params.centerY);
  gl.uniform1f(U.uHalfSpan, params.halfSpan);
  gl.uniform1f(U.uCosR, params.cosR);
  gl.uniform1f(U.uSinR, params.sinR);
  gl.uniform1f(U.uMaxIter, params.maxIter);
  gl.uniform1f(U.uSoft, params.soft);
  gl.uniform1f(U.uGlow, params.glow);
  gl.uniform1f(U.uColorPhase, params.colorPhase);
  gl.uniform1f(U.uBreath, params.breath);
  gl.uniform1f(U.uTrapMix, params.trapMix);
  gl.uniform2f(U.uTrapPoint, params.trapX, params.trapY);
  gl.uniform1f(U.uTime, params.time);
  gl.uniform1f(U.uFold, Number(params.fold) || 0);
  gl.uniform1f(U.uBands, Number.isFinite(Number(params.bands)) ? Number(params.bands) : 1.65);
  gl.uniform1f(U.uDomainWarp, Number(params.domainWarp) || 0);
  const bg = nodeGraphRgbFractalGlHexToRgb01(params.background);
  gl.uniform3f(U.uBackground, bg[0], bg[1], bg[2]);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(U.uPalette, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

function nodeGraphRgbFractalGlClearBlack(canvas) {
  const state = nodeGraphRgbFractalGlEnsure(canvas);
  if (!state?.gl || state.lost) {
    return false;
  }
  const gl = state.gl;
  gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return true;
}
