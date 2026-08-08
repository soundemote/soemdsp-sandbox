// Soft Fractal — WebGL full-face Julia (Milkdrop-class path).
// Fragment shader does smooth escape + orbit traps; palette is a 256×1 LUT texture.

// Bump when fragment/vertex source changes so live sessions recompile.
const NODE_GRAPH_RGB_FRACTAL_GL_REV = 15;

// Separable 1D gaussian (horizontal or vertical). Dense 1px taps for smooth
// sub-pixel → light image soft. Screen Blur max = one H+V pair (not stacked).
const NODE_GRAPH_RGB_FRACTAL_GL_BLUR_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScene;
uniform vec2 uResolution;
// (1,0) = horizontal, (0,1) = vertical — unit is *pixels*
uniform vec2 uAxis;
// Sigma in pixels: ~0.25 sub-pixel edge kiss … ~1.7 light full soft (Screen Blur max)
uniform float uSigma;
void main() {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float sigma = max(0.18, uSigma);
  float inv2s2 = 1.0 / (2.0 * sigma * sigma);
  // 11 taps at 1px — enough for sigma ≤ ~2 without sparse “ghost squares”.
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -5; i <= 5; i++) {
    float fi = float(i);
    float w = exp(-(fi * fi) * inv2s2);
    vec2 o = uAxis * fi * texel;
    sum += texture2D(uScene, uv + o).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / max(1e-4, wsum), 1.0);
}
`;

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
uniform vec2 uPan;
uniform float uHalfSpan;
uniform float uCosR;
uniform float uSinR;
uniform float uMaxIter;
uniform float uSoft;
uniform float uBlur;
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
// 0 = Background plate (solid swatch)
// 1 = Gradient start (LUT stop 0) as outer / empty plate
// 2 = Haze — soft radial dream plate (symmetry-safe)
uniform float uOuterMode;

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
  // Static fold only — no uTime (time spin read as breathing).
  ang = abs(mod(ang * petals, 3.14159265) - 1.5707963);
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
  // Interior: wide trap glow — no time grain (that read as breathing).
  float t1 = 1.0 - smoothstep(0.0, mix(1.2, 2.2, soft), trap);
  return clamp(0.05 + 0.14 * t1, 0.0, 1.0);
}

vec2 mapUvToZ(vec2 frag, vec2 offsetPx) {
  vec2 uv = (frag + offsetPx) / uResolution;
  uv.y = 1.0 - uv.y;
  // Zoom about look-at: local frame is scaled by halfSpan, then rotated, then
  // translated by pan (X/Y). Pan is *not* scaled by halfSpan — so Scale zooms
  // into the point (uCenter + uPan) instead of drifting toward the origin.
  vec2 n = uv * 2.0 - 1.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = vec2(n.x * uHalfSpan * aspect, n.y * uHalfSpan);
  vec2 r = vec2(p.x * uCosR - p.y * uSinR, p.x * uSinR + p.y * uCosR);
  return r + uCenter + uPan;
}

float sampleAt(vec2 frag, vec2 offsetPx, float maxIter, float soft, float trapMix) {
  vec2 z0 = mapUvToZ(frag, offsetPx);
  // Domain warp only when explicitly requested — never free-run on soft/time (breathing).
  float wAmt = uDomainWarp * 0.1;
  if (wAmt > 0.001) {
    // Static spatial warp only (no uTime) so the plate does not pulse.
    z0 += wAmt * vec2(
      sin(z0.y * (1.05 + uDomainWarp * 0.35)),
      cos(z0.x * (0.95 + uDomainWarp * 0.28))
    );
    z0 += wAmt * 0.4 * vec2(
      cos(z0.x * 0.45 - z0.y * 0.7 + 1.7),
      sin(z0.y * 0.5 + z0.x * 0.35)
    );
  }
  return juliaEnergy(z0, uC, maxIter, soft, trapMix);
}

// Aug 2 soft triangle wrap: no hard palette discontinuities like raw fract()
// (raw fract seams were the main "noisy Soft Fractal" source after Aug 2).
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
  // Edge Blur domain 0…8 (UI); maps to gaussian sigma in pixels.
  float edgeBlur = max(0.0, uBlur);
  float glowAmt = clamp(uGlow, 0.0, 1.35);
  // Full iteration budget (Soft does not drop iters). Depth 0 may pass 1.
  float maxIter = max(1.0, uMaxIter);
  float trapMix = uTrapMix;

  // Energy sample. Edge Blur > 0 → dense 1px gaussian multi-tap of *energy*
  // (more of the edge-soften effect, no sparse step ghosts).
  // Edge Blur 0 → single center sample (sharp / no extra cost).
  float e;
  if (edgeBlur < 0.015) {
    e = sampleAt(gl_FragCoord.xy, vec2(0.0), maxIter, soft, trapMix);
  } else {
    // Lower max sigma to reduce filament shimmer (dense taps + large σ = thrash).
    // UI 0…8 → sigma ~0.15…~2.0 px.
    float sigma = min(2.0, 0.15 + edgeBlur * 0.23);
    float inv2s2 = 1.0 / max(1e-4, 2.0 * sigma * sigma);
    float sum = 0.0;
    float wsum = 0.0;
    // 7×7 at 1px steps — dense coverage; outer weights fall off with sigma.
    for (int j = -3; j <= 3; j++) {
      for (int i = -3; i <= 3; i++) {
        float fi = float(i);
        float fj = float(j);
        float d2 = fi * fi + fj * fj;
        float w = exp(-d2 * inv2s2);
        vec2 off = vec2(fi, fj); // 1px lattice — no large step gaps
        sum += sampleAt(gl_FragCoord.xy, off, maxIter, soft, trapMix) * w;
        wsum += w;
      }
    }
    e = sum / max(1e-4, wsum);
  }
  e = clamp(e, 0.0, 1.0);

  // Contrast: soft flattens micro-detail; glow still lifts midtones gently
  float gamma = mix(0.78, 1.05, soft) - glowAmt * 0.1;
  e = pow(e, max(0.45, gamma));

  // —— Aug 2 color path (cream gradient, not lit-gated multi-band scrub) ——
  // Color bands: uBands from Bands knob; soft reduces wraps; glow lifts richness.
  float band = mix(uBands + glowAmt * 0.9, uBands * 0.45 + glowAmt * 0.4, soft);
  band = max(0.25, band);
  float phase = uColorPhase * mix(1.0, 0.55, soft);
  // Soft (and low Soft) use triangle softWrap — never raw fract (hard seams = noise).
  float eColor = softWrap(e * band + phase);
  // Blend toward raw energy so it stays painterly, not zebra
  eColor = mix(e, eColor, mix(0.55, 0.35, soft));
  eColor = clamp(eColor * uBreath, 0.0, 1.0);
  // Soft pulls color toward mid palette (less extreme contrast edges)
  eColor = mix(eColor, 0.5 + (eColor - 0.5) * mix(1.0, 0.7, soft), soft * 0.5);

  vec3 col = paletteSample(eColor, soft);

  // Glow bloom (wide, soft)
  vec2 q2 = gl_FragCoord.xy / uResolution - 0.5;
  float rEdge = length(q2);
  if (glowAmt > 0.03) {
    float g = exp(-dot(q2, q2) * mix(2.6, 1.5, soft));
    vec3 tip = paletteSample(mix(0.88, 0.72, soft), soft);
    col += tip * g * (0.05 + glowAmt * 0.28) * mix(1.0, 0.75, soft);
  }

  // Outer plate (Display Settings → Outer color):
  // 0 Stop 0.00 — solid exterior from gradient LUT at t=0
  // 1 Gradient  — soft exterior sampled from the full gradient
  vec3 plate;
  if (uOuterMode > 0.5) {
    // Gradient: soft palette wash around the set (not solid stop0)
    float washT = clamp(0.06 + e * 0.42 + rEdge * 0.22 + phase * 0.08, 0.0, 1.0);
    vec3 washCol = paletteSample(washT, soft);
    vec3 stop0 = paletteSample(0.0, soft);
    plate = mix(stop0, washCol, mix(0.35, 0.7, soft));
    float vig = smoothstep(1.15, 0.18, rEdge * 1.1);
    float hazeAmt = mix(0.22, 0.48, soft);
    col = mix(col, plate, hazeAmt * (1.0 - vig * 0.5));
    col = mix(plate, col, mix(0.8, 1.0, vig));
  } else {
    // Stop 0.00: empty / exterior is gradient stop at t=0.00 (solid plate)
    plate = paletteSample(0.0, soft);
    float vig = smoothstep(1.12, 0.38, rEdge * 1.12);
    // Strong plate so outer color reads as Stop 0.00, not residual background
    col = mix(plate, col, mix(0.9, 1.0, vig));
  }

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

function nodeGraphRgbFractalGlHexToRgb01(hex, fallback = [0, 0, 0]) {
  const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(hex, "#000000")
    : String(hex || "#000000");
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
  if (state?.gl && !state.lost && state.rev === NODE_GRAPH_RGB_FRACTAL_GL_REV) {
    return state;
  }
  if (state?.failed && state.rev === NODE_GRAPH_RGB_FRACTAL_GL_REV) {
    return null;
  }
  if (state) {
    nodeGraphRgbFractalGlStates.delete(canvas);
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
    nodeGraphRgbFractalGlStates.set(canvas, {
      failed: true,
      rev: NODE_GRAPH_RGB_FRACTAL_GL_REV,
    });
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
      uPan: gl.getUniformLocation(program, "uPan"),
      uHalfSpan: gl.getUniformLocation(program, "uHalfSpan"),
      uCosR: gl.getUniformLocation(program, "uCosR"),
      uSinR: gl.getUniformLocation(program, "uSinR"),
      uMaxIter: gl.getUniformLocation(program, "uMaxIter"),
      uSoft: gl.getUniformLocation(program, "uSoft"),
      uBlur: gl.getUniformLocation(program, "uBlur"),
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
      uOuterMode: gl.getUniformLocation(program, "uOuterMode"),
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

    // Screen-blur post: fractal → scene FBO → ping-pong separable H/V passes → canvas.
    const blurProgram = nodeGraphRgbFractalGlLink(
      gl,
      NODE_GRAPH_RGB_FRACTAL_GL_VS,
      NODE_GRAPH_RGB_FRACTAL_GL_BLUR_FS,
    );
    const blurUniforms = {
      uScene: gl.getUniformLocation(blurProgram, "uScene"),
      uResolution: gl.getUniformLocation(blurProgram, "uResolution"),
      uAxis: gl.getUniformLocation(blurProgram, "uAxis"),
      uSigma: gl.getUniformLocation(blurProgram, "uSigma"),
    };
    const makeRgbaTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tex;
    };
    const sceneTex = makeRgbaTex();
    const pingTex = makeRgbaTex();
    const attachFbo = (tex) => {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
      return fbo;
    };
    const sceneFbo = attachFbo(sceneTex);
    const pingFbo = attachFbo(pingTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    state = {
      gl,
      program,
      buf,
      aPos,
      uniforms,
      paletteTex,
      paletteKey: "",
      blurProgram,
      blurUniforms,
      sceneTex,
      pingTex,
      sceneFbo,
      pingFbo,
      sceneW: 4,
      sceneH: 4,
      lost: false,
      failed: false,
      rev: NODE_GRAPH_RGB_FRACTAL_GL_REV,
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
    nodeGraphRgbFractalGlStates.set(canvas, {
      failed: true,
      rev: NODE_GRAPH_RGB_FRACTAL_GL_REV,
    });
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

function nodeGraphRgbFractalGlEnsureSceneTarget(state, w, h) {
  const gl = state.gl;
  if (state.sceneW === w && state.sceneH === h) {
    return;
  }
  state.sceneW = w;
  state.sceneH = h;
  for (const tex of [state.sceneTex, state.pingTex]) {
    if (!tex) continue;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * One separable blur pass: read from `srcTex`, write to `dstFbo` (null = canvas).
 * Dense 15-tap 1px gaussian along `axis` ( [1,0] or [0,1] ).
 */
function nodeGraphRgbFractalGlBlurPass(state, w, h, srcTex, dstFbo, axisX, axisY, sigma) {
  const gl = state.gl;
  const BU = state.blurUniforms;
  gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
  gl.viewport(0, 0, w, h);
  gl.useProgram(state.blurProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(BU.uScene, 0);
  gl.uniform2f(BU.uResolution, w, h);
  gl.uniform2f(BU.uAxis, axisX, axisY);
  gl.uniform1f(BU.uSigma, Math.max(0.35, sigma));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

  const stops = params.gradientStops;
  const peak = stops?.[stops.length - 1]?.color || "#ffffff";
  nodeGraphRgbFractalGlUploadPalette(state, stops, peak);

  const screenBlur = Math.max(0, Number(params.screenBlur) || 0);
  const useScreenBlur = screenBlur > 0.02 && state.sceneFbo && state.blurProgram;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  if (useScreenBlur) {
    nodeGraphRgbFractalGlEnsureSceneTarget(state, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.sceneFbo);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  gl.viewport(0, 0, w, h);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);

  const U = state.uniforms;
  gl.uniform2f(U.uResolution, w, h);
  gl.uniform2f(U.uC, params.cx, params.cy);
  gl.uniform2f(U.uCenter, params.centerX, params.centerY);
  const panX = Number(params.panX);
  const panY = Number(params.panY);
  gl.uniform2f(
    U.uPan,
    Number.isFinite(panX) ? panX : 0,
    Number.isFinite(panY) ? panY : 0,
  );
  gl.uniform1f(U.uHalfSpan, params.halfSpan);
  gl.uniform1f(U.uCosR, params.cosR);
  gl.uniform1f(U.uSinR, params.sinR);
  gl.uniform1f(U.uMaxIter, params.maxIter);
  gl.uniform1f(U.uSoft, params.soft);
  gl.uniform1f(U.uBlur, Number.isFinite(Number(params.blur)) ? Number(params.blur) : 0);
  gl.uniform1f(U.uGlow, params.glow);
  gl.uniform1f(U.uColorPhase, params.colorPhase);
  gl.uniform1f(U.uBreath, params.breath);
  gl.uniform1f(U.uTrapMix, params.trapMix);
  gl.uniform2f(U.uTrapPoint, params.trapX, params.trapY);
  gl.uniform1f(U.uTime, params.time);
  gl.uniform1f(U.uFold, Number(params.fold) || 0);
  gl.uniform1f(U.uBands, Number.isFinite(Number(params.bands)) ? Number(params.bands) : 1.65);
  gl.uniform1f(U.uDomainWarp, Number(params.domainWarp) || 0);
  const outerPlate = String(params.outerPlate || "stop0");
  // 0 = Stop 0.00 (solid palette t=0), 1 = Gradient (soft full-palette exterior)
  const outerMode = (
    outerPlate === "gradient"
    || outerPlate === "haze"
    || outerPlate === "2"
  ) ? 1 : 0;
  // uBackground: prefer explicit stop-0 color so Stop 0.00 matches the editor.
  const stop0Hex = typeof nodeGraphRgbFractalStop0Color === "function"
    ? nodeGraphRgbFractalStop0Color(stops)
    : ((Array.isArray(stops) && stops[0]?.color) || "#000000");
  const bgHex = outerMode < 0.5
    ? stop0Hex
    : (params.background || stop0Hex || "#000000");
  const bg = nodeGraphRgbFractalGlHexToRgb01(bgHex);
  gl.uniform3f(U.uBackground, bg[0], bg[1], bg[2]);
  gl.uniform1f(U.uOuterMode, outerMode);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(U.uPalette, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (useScreenBlur) {
    // One H+V pair only. UI 0…8 maps continuously into sub-pixel → light soft:
    //   0+  → sigma ~0.25 (barely soft edges)
    //   max → sigma ~1.65 (what used to feel like “first engage = already too much”)
    // No multi-pass stacking (that made mid values over-blurry).
    const t = Math.max(0, Math.min(1, screenBlur / 8));
    // Ease: more of the throw lives in fine/sub-pixel land.
    const tEase = t * t; // mid skew toward fine blur
    const sigma = 0.22 + tEase * 1.45; // ~0.22 … ~1.67 px
    nodeGraphRgbFractalGlBlurPass(
      state, w, h,
      state.sceneTex,
      state.pingFbo,
      1, 0,
      sigma,
    );
    nodeGraphRgbFractalGlBlurPass(
      state, w, h,
      state.pingTex,
      null,
      0, 1,
      sigma,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return true;
}

/** Clear to gradient stop 0 (or explicit plate color) — idle / engine-off plate. */
function nodeGraphRgbFractalGlClearPlate(canvas, plateHex = "#000000") {
  const state = nodeGraphRgbFractalGlEnsure(canvas);
  if (!state?.gl || state.lost) {
    return false;
  }
  const gl = state.gl;
  const rgb = nodeGraphRgbFractalGlHexToRgb01(plateHex);
  gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
  gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return true;
}

/** @deprecated use nodeGraphRgbFractalGlClearPlate */
function nodeGraphRgbFractalGlClearBlack(canvas) {
  return nodeGraphRgbFractalGlClearPlate(canvas, "#000000");
}
