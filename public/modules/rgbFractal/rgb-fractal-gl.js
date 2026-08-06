// Soft Fractal — WebGL full-face Julia (Milkdrop-class path).
// Fragment shader does smooth escape + orbit traps; palette is a 256×1 LUT texture.
// Bump when fragment/vertex source changes so live sessions recompile (not keep a stale program).
const NODE_GRAPH_RGB_FRACTAL_GL_REV = 4;

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

// One Julia sample → energy in [0,1].
// soft: creamier escape, wider traps, flatter micro-contrast (pristine, not sparkly).
float juliaEnergy(vec2 z0, vec2 c, float maxIter, float soft, float trapMix) {
  vec2 z = domainFold(z0, uFold);
  float trap = 1e6;
  float trap2 = 1e6;
  float i = 0.0;
  // Soft expands trap falloff so filaments are airbrushed, not 1px hash.
  float trapW = mix(1.15, 2.8, soft);
  float trapW2 = mix(0.85, 2.1, soft);

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
      // Soften escape contour (hard rings → cream). Soft starts working early.
      float edge = mix(0.42, 1.05, soft);
      escape = smoothstep(0.0, edge, escape);
      escape = mix(escape, smoothstep(0.0, 1.0, escape), soft * 0.9);

      float t1 = 1.0 - smoothstep(0.0, trapW, trap);
      float t2 = 1.0 - smoothstep(0.0, trapW2, trap2);
      // Soft kills sharp trap lines (main source of "tiny pixel noise")
      float traps = clamp(t1 * 0.55 + t2 * 0.45, 0.0, 1.0);
      traps = smoothstep(0.0, mix(0.28, 0.92, soft), traps);

      float tm = clamp(trapMix * (1.0 - soft * 0.75), 0.0, 0.85);
      float e = mix(escape, traps, tm);
      // Final soft curve — flattens micro-contrast (pristine plate)
      e = mix(e, e * e * (3.0 - 2.0 * e), mix(0.25, 0.85, soft));
      return clamp(e, 0.0, 1.0);
    }
    i += 1.0;
  }
  // Interior: wide trap glow — no time grain (that read as breathing).
  float t1 = 1.0 - smoothstep(0.0, mix(1.2, 2.4, soft), trap);
  return clamp(0.05 + 0.14 * t1, 0.0, 1.0);
}

vec2 mapUvToZ(vec2 frag, vec2 offsetPx) {
  vec2 uv = (frag + offsetPx) / uResolution;
  uv.y = 1.0 - uv.y;
  // Pure view offset via uCenter (no UV wrap / torus pan).
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

// Sample 256×1 palette. Soft Fractal is fully gradient-compatible: energy
// 0…1 is one trip through the LUT (see eColor below). Soft low-passes the
// LUT so multi-stop palettes read as a cream spectrum, not posterized rings.
// Texel centers: (t * 255 + 0.5) / 256 so LINEAR filter does not grab edges.
vec3 paletteSample(float t, float soft) {
  float e = clamp(t, 0.0, 1.0);
  float u = (e * 255.0 + 0.5) / 256.0;
  vec3 c0 = texture2D(uPalette, vec2(u, 0.5)).rgb;
  // Soft: wider LUT blur (no spatial hash — that read as grainy noise).
  float w = mix(0.0, 0.07, soft);
  if (w < 0.001) {
    return c0;
  }
  float eL = clamp(e - w, 0.0, 1.0);
  float eR = clamp(e + w, 0.0, 1.0);
  float eLL = clamp(e - w * 2.0, 0.0, 1.0);
  float eRR = clamp(e + w * 2.0, 0.0, 1.0);
  float uL = (eL * 255.0 + 0.5) / 256.0;
  float uR = (eR * 255.0 + 0.5) / 256.0;
  float uLL = (eLL * 255.0 + 0.5) / 256.0;
  float uRR = (eRR * 255.0 + 0.5) / 256.0;
  vec3 cL = texture2D(uPalette, vec2(uL, 0.5)).rgb;
  vec3 cR = texture2D(uPalette, vec2(uR, 0.5)).rgb;
  vec3 cLL = texture2D(uPalette, vec2(uLL, 0.5)).rgb;
  vec3 cRR = texture2D(uPalette, vec2(uRR, 0.5)).rgb;
  vec3 blur = cLL * 0.1 + cL * 0.25 + c0 * 0.3 + cR * 0.25 + cRR * 0.1;
  return mix(c0, blur, clamp(soft * 1.15, 0.0, 1.0));
}

void main() {
  float soft = clamp(uSoft, 0.0, 1.0);
  // Soft response curve: mid Soft already cream (not "only works near 1").
  float softEase = soft * soft * (3.0 - 2.0 * soft);
  float glowAmt = clamp(uGlow, 0.0, 1.35);
  // Soft rolls off iteration depth hard → sub-pixel filigree becomes smooth color.
  // (High Depth + low Soft was the main "noisy Soft Fractal" failure mode.)
  float maxIter = max(14.0, uMaxIter * mix(1.0, 0.28, softEase));
  float trapMix = uTrapMix;

  // Spatial AA radius in pixels — grows with soft (true anti-alias of fine structure)
  float rad = mix(0.9, 3.2, softEase);
  float energy = 0.0;
  float wsum = 0.0;

  // Center
  {
    float s = sampleAt(gl_FragCoord.xy, vec2(0.0), maxIter, soft, trapMix);
    energy += s * 1.2;
    wsum += 1.2;
  }

  // 4-tap diamond (always on — baseline AA)
  {
    float tw = 0.9;
    energy += sampleAt(gl_FragCoord.xy, vec2( rad,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-rad,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0,  rad), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0, -rad), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  // Diagonals earlier in Soft — cream without needing Soft near 1
  if (soft > 0.08) {
    float d = rad * 0.72;
    float tw = 0.4 + softEase * 0.55;
    energy += sampleAt(gl_FragCoord.xy, vec2( d,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( d, -d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d, -d), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  // Extra ring at medium+ soft — larger footprint = dreamy, no pixel dust
  if (soft > 0.35) {
    float d = rad * 1.35;
    float tw = 0.3 + (softEase - 0.2) * 0.7;
    energy += sampleAt(gl_FragCoord.xy, vec2( d,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2(-d,  0.0), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0,  d), maxIter, soft, trapMix) * tw;
    energy += sampleAt(gl_FragCoord.xy, vec2( 0.0, -d), maxIter, soft, trapMix) * tw;
    wsum += tw * 4.0;
  }

  float e = energy / max(1e-4, wsum);
  e = clamp(e, 0.0, 1.0);

  // Soft: flatten micro-contrast so escape iso-lines don't posterize in the LUT.
  float gamma = mix(0.78, 1.08, softEase) - glowAmt * 0.08;
  e = pow(e, max(0.5, gamma));
  e = mix(e, e * e * (3.0 - 2.0 * e), softEase * 0.5);

  // Structure mask. Haze mode keeps a soft residual so color can wash into empty plate.
  float hazeMode = uOuterMode > 1.5 ? 1.0 : 0.0;
  float lit = hazeMode > 0.5
    ? smoothstep(0.012, 0.42, e)
    : smoothstep(mix(0.02, 0.05, softEase), mix(0.2, 0.35, softEase), e);
  float aura = hazeMode > 0.5
    ? smoothstep(0.0, 0.28, e) * (1.0 - lit * 0.55)
    : smoothstep(0.0, mix(0.14, 0.3, softEase), e) * (1.0 - lit) * softEase * 0.65;

  // —— Color (gradient-compatible) ————————————————————————————————————
  // Soft Fractal IS compatible with multi-stop gradients. Contract:
  //   energy 0…1  →  one trip through the LUT (bands = 1)
  //   Color Rate / Shift  →  rotate that mapping (fract), not clamp-scrub
  // Clamp-side phase scrub (old “banding fix”) piled colors at the ends of
  // the spectrum and looked multi-banded/noisy. True rotation + Soft LUT
  // blur matches the first implementation’s cream look.
  float phase = fract(uColorPhase);
  float eStruct = clamp(e * mix(1.0, uBreath, max(lit, aura * 0.4)), 0.0, 1.0);
  // Soft flattens escape iso-rings so multi-stop palettes don’t posterize.
  eStruct = mix(eStruct, eStruct * eStruct * (3.0 - 2.0 * eStruct), softEase * 0.4);

  float b = max(0.25, uBands);
  float eColor;
  if (b <= 1.001) {
    // One spectrum pass. b < 1 compresses toward low stops; b = 1 full range.
    // Phase rotates the whole mapping (Milkdrop-style) without re-wrapping structure.
    float span = clamp(b, 0.25, 1.0);
    float once = eStruct * span;
    // Soft: more weight on continuous energy (cream); less harsh phase spin.
    float rotated = fract(once + phase);
    eColor = mix(rotated, once, softEase * 0.38);
  } else {
    // Multi-wrap only when Color Bands > 1 (explicit psychedelic mode).
    float wrapAmt = clamp((b - 1.0) / 8.0, 0.0, 1.0) * (1.0 - softEase * 0.9);
    wrapAmt *= max(lit, aura * 0.35);
    float raw = eStruct * b + phase;
    float f = fract(raw);
    float seam = min(f, 1.0 - f);
    float seamSoft = smoothstep(0.0, mix(0.025, 0.1, softEase), seam);
    float eWrap = mix(0.5, f, seamSoft);
    float once = eStruct;
    eColor = mix(once, eWrap, wrapAmt);
  }
  eColor = clamp(eColor, 0.0, 1.0);

  vec2 q2 = gl_FragCoord.xy / uResolution - 0.5;
  float rEdge = length(q2);

  // Outer plate mode (Display Settings → Outer color):
  // 0 Background — solid swatch
  // 1 Gradient start — empty + edges → palette stop 0
  // 2 Haze — dream plate: palette wash breathes in around the fractal and out
  vec3 plate;
  // Global breath (time only — rotationally symmetric, no XY grain).
  float breathIn = 0.5 + 0.5 * sin(uTime * 0.17);
  float breathOut = 0.5 + 0.5 * sin(uTime * 0.11 + 1.7);
  float breath = mix(breathIn, breathOut, 0.45);

  if (hazeMode > 0.5) {
    // Wash: low–mid palette, clamp (no fract) so haze doesn't ring.
    float washT = clamp(
      0.06
      + e * mix(0.18, 0.38, soft)
      + phase * 0.2
      + breath * 0.05,
      0.0,
      1.0
    );
    vec3 washCol = paletteSample(washT, soft);
    vec3 stop0 = paletteSample(0.0, soft);
    // Base plate: background → stop0 → wash, breathing in (color fills outer)
    // and out (retreats toward background).
    float fill = mix(0.12, 0.62, soft) * mix(0.35, 1.0, breath);
    // Stronger wash near filaments (color blooms out from the fractal).
    float bloom = smoothstep(0.0, 0.32, e) * mix(0.55, 1.0, breathIn);
    float emptyWash = (1.0 - lit) * fill * mix(0.4, 1.0, bloom);
    plate = mix(uBackground, stop0, mix(0.15, 0.4, soft) * (0.7 + 0.3 * breathOut));
    plate = mix(plate, washCol, emptyWash);
  } else if (uOuterMode > 0.5) {
    plate = paletteSample(0.0, soft);
  } else {
    plate = uBackground;
  }

  // Structure + aura into palette; exterior is the living plate.
  float cover = clamp(lit + aura * mix(0.35, 0.75, soft), 0.0, 1.0);
  vec3 col = mix(plate, paletteSample(eColor, soft), cover);

  // Glow only on lit structure (not a full-face flash)
  if (glowAmt > 0.03 && lit > 0.01) {
    float g = exp(-dot(q2, q2) * mix(3.2, 2.0, soft));
    vec3 tip = paletteSample(mix(0.88, 0.72, soft), soft);
    col += tip * g * (0.04 + glowAmt * 0.22) * mix(1.0, 0.75, soft) * lit;
  }

  if (hazeMode > 0.5) {
    // Dream haze: color washes out toward plate at edges, breathing depth.
    float vig = smoothstep(1.2, 0.1, rEdge * 1.08);
    float hazeAmt = mix(0.2, 0.48, soft) * mix(0.55, 1.2, breathOut);
    // Wash-out pulls structure edges into plate; wash-in leaves more color in mid field.
    col = mix(col, plate, hazeAmt * (1.0 - vig * 0.5) * (1.0 - lit * 0.35));
    col = mix(plate, col, mix(0.72, 1.0, vig));
    // Gentle outer ring of wash color that pulses (in) then recedes (out).
    float ring = smoothstep(0.15, 0.55, rEdge) * smoothstep(0.95, 0.55, rEdge);
    vec3 ringCol = paletteSample(clamp(0.12 + phase * 0.12 + breath * 0.05, 0.0, 1.0), soft);
    col = mix(col, ringCol, ring * mix(0.04, 0.18, soft) * breathIn * (1.0 - lit));
  } else if (uOuterMode > 0.5) {
    // Gradient-start plate: soft falloff into stop 0
    float vig = smoothstep(1.15, 0.35, rEdge * 1.15);
    col = mix(plate, col, mix(0.92, 1.0, vig));
  } else {
    // Background: light haze + edges into solid swatch
    float vig = smoothstep(1.05, 0.2, rEdge * 1.2);
    float haze = soft * 0.12;
    col = mix(col, uBackground, haze * (1.0 - vig * 0.5));
    col = mix(uBackground, col, mix(0.94, 1.0, vig));
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
  // Stale program after shader source edit — drop and rebuild on this canvas.
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
      uPan: gl.getUniformLocation(program, "uPan"),
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

    state = {
      gl,
      program,
      buf,
      aPos,
      uniforms,
      paletteTex,
      paletteKey: "",
      rev: NODE_GRAPH_RGB_FRACTAL_GL_REV,
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
    nodeGraphRgbFractalGlStates.set(canvas, { failed: true, rev: NODE_GRAPH_RGB_FRACTAL_GL_REV });
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
  gl.uniform1f(U.uGlow, params.glow);
  gl.uniform1f(U.uColorPhase, params.colorPhase);
  gl.uniform1f(U.uBreath, params.breath);
  gl.uniform1f(U.uTrapMix, params.trapMix);
  gl.uniform2f(U.uTrapPoint, params.trapX, params.trapY);
  gl.uniform1f(U.uTime, params.time);
  gl.uniform1f(U.uFold, Number(params.fold) || 0);
  // Default 1 = one trip through the gradient (not multi-wrap psychedelia).
  gl.uniform1f(U.uBands, Number.isFinite(Number(params.bands)) ? Number(params.bands) : 1);
  gl.uniform1f(U.uDomainWarp, Number(params.domainWarp) || 0);
  const outerPlate = String(params.outerPlate || "background");
  const outerMode = outerPlate === "haze" ? 2
    : (outerPlate === "gradientStart" ? 1 : 0);
  const bgHex = params.background
    || (Array.isArray(stops) && stops[0]?.color)
    || "#000000";
  const bg = nodeGraphRgbFractalGlHexToRgb01(bgHex);
  gl.uniform3f(U.uBackground, bg[0], bg[1], bg[2]);
  gl.uniform1f(U.uOuterMode, outerMode);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(U.uPalette, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
