// Fractal Brownian Field present: fBm per pixel in GLSL (shared picture device).
// Audio X/Y/Z probes stay in C++/WASM (same fieldAt). Display no longer calls
// fill_grid when GL works — only uniforms (seed, octaves, domainTime, …).

const NODE_GRAPH_FBM_FIELD_GL_REV = 3;

const NODE_GRAPH_FBM_FIELD_GL_VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Port of native_modules/fbm_field/fbm_field.cpp fieldAt / fbm2d / fbm3d / fade.
// Float murmur-style hash (highp). Typical zoom/scale matches the look; extreme
// lattice coords may diverge slightly from WASM audio probes (WISIWIH approx).
const NODE_GRAPH_FBM_FIELD_GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uPalette;
uniform vec2 uResolution;
uniform float uDomainTime;
uniform float uZoom;
uniform float uPanX;
uniform float uPanY;
uniform float uRotate;
uniform float uSeed;
uniform float uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform float uScale;
uniform float uSmoothness;
uniform float uContrast;
uniform float uBrightness;
uniform float uMotion;

// Lattice hashes stay in small float magnitudes (fp32-safe): integer lattice
// coords + seed folded to [0,4096) by the caller. Not bit-identical to the C++
// uint32 hash (WebGL1 has no integer bit ops); same value-noise statistics.
float hash2d(float ix, float iy, float seed) {
  vec3 p3 = fract(vec3(ix, iy, seed) * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z) * 2.0 - 1.0;
}

float hash3d(float ix, float iy, float iz, float seed) {
  vec4 p4 = fract(vec4(ix, iy, iz, seed) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.x + p4.y) * (p4.z + p4.w)) * 2.0 - 1.0;
}

float fade(float t, float smoothness) {
  float x = clamp(t, 0.0, 1.0);
  float s = clamp(smoothness, 0.0, 1.0);
  if (s <= 0.0) return x;
  float hermite = x * x * (3.0 - 2.0 * x);
  if (s <= 0.5) {
    float u = s * 2.0;
    return x + (hermite - x) * u;
  }
  float quintic = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  float u = (s - 0.5) * 2.0;
  return hermite + (quintic - hermite) * u;
}

float valueNoise2d(float x, float y, float seed, float smoothness) {
  float x0 = floor(x);
  float y0 = floor(y);
  float fx = x - x0;
  float fy = y - y0;
  float u = fade(fx, smoothness);
  float v = fade(fy, smoothness);
  float a = hash2d(x0, y0, seed);
  float b = hash2d(x0 + 1.0, y0, seed);
  float c = hash2d(x0, y0 + 1.0, seed);
  float d = hash2d(x0 + 1.0, y0 + 1.0, seed);
  float x1 = a + (b - a) * u;
  float x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}

float valueNoise3d(float x, float y, float z, float seed, float smoothness) {
  float x0 = floor(x);
  float y0 = floor(y);
  float z0 = floor(z);
  float fx = x - x0;
  float fy = y - y0;
  float fz = z - z0;
  float u = fade(fx, smoothness);
  float v = fade(fy, smoothness);
  float w = fade(fz, smoothness);
  float n000 = hash3d(x0, y0, z0, seed);
  float n100 = hash3d(x0 + 1.0, y0, z0, seed);
  float n010 = hash3d(x0, y0 + 1.0, z0, seed);
  float n110 = hash3d(x0 + 1.0, y0 + 1.0, z0, seed);
  float n001 = hash3d(x0, y0, z0 + 1.0, seed);
  float n101 = hash3d(x0 + 1.0, y0, z0 + 1.0, seed);
  float n011 = hash3d(x0, y0 + 1.0, z0 + 1.0, seed);
  float n111 = hash3d(x0 + 1.0, y0 + 1.0, z0 + 1.0, seed);
  float x00 = n000 + (n100 - n000) * u;
  float x10 = n010 + (n110 - n010) * u;
  float x01 = n001 + (n101 - n001) * u;
  float x11 = n011 + (n111 - n011) * u;
  float yz0 = x00 + (x10 - x00) * v;
  float yz1 = x01 + (x11 - x01) * v;
  return yz0 + (yz1 - yz0) * w;
}

float fbm2d(float x, float y, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness) {
  float total = 0.0;
  float amplitude = 1.0;
  float noiseFreq = 1.0;
  float maxValue = 0.0;
  float baseSeed = mod(seed * 1009.0 + 17.0, 4096.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octaves) break;
    float sx = x * scale * noiseFreq;
    float sy = y * scale * noiseFreq;
    total += valueNoise2d(sx, sy, mod(baseSeed + float(i) * 1013.0, 4096.0), smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

float fbm3d(float x, float y, float z, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness) {
  float total = 0.0;
  float amplitude = 1.0;
  float noiseFreq = 1.0;
  float maxValue = 0.0;
  float baseSeed = mod(seed * 1009.0 + 17.0, 4096.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octaves) break;
    float sx = x * scale * noiseFreq;
    float sy = y * scale * noiseFreq;
    float sz = z * scale * noiseFreq;
    total += valueNoise3d(sx, sy, sz, mod(baseSeed + float(i) * 1013.0, 4096.0), smoothness) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFreq *= lacunarity;
  }
  return maxValue > 0.0 ? total / maxValue : 0.0;
}

float fieldAt(float spatialX, float spatialY, float domainT, float motion, float seed, float octaves, float persistence, float lacunarity, float scale, float smoothness, float span) {
  if (motion > 0.5) {
    return fbm3d(spatialX, spatialY, domainT * span, seed, octaves, persistence, lacunarity, scale, smoothness);
  }
  float scrollX = domainT * span;
  float scrollY = domainT * span * 0.73;
  return fbm2d(spatialX + scrollX, spatialY + scrollY, seed, octaves, persistence, lacunarity, scale, smoothness);
}

float bipolarToMono(float bipolar, float contrast) {
  float mid = bipolar * 0.5 + 0.5;
  float c = max(contrast, 0.0);
  if (abs(c - 1.0) > 1e-6) {
    mid = 0.5 + (mid - 0.5) * c;
  }
  return clamp(mid, 0.0, 1.0);
}

void main() {
  // Pixel centres; Y matches C++ fill_grid (j=0 = top → ny≈+1).
  vec2 frag = gl_FragCoord.xy;
  float u = frag.x / max(uResolution.x, 1.0);
  float vBottom = frag.y / max(uResolution.y, 1.0);
  float vTop = 1.0 - vBottom;
  float nx = 2.0 * u - 1.0;
  float ny = 1.0 - 2.0 * vTop;

  float safeZoom = max(uZoom, 0.05);
  float span = 1.0 / safeZoom;
  float ang = uRotate * 6.283185307179586;
  float cosR = cos(ang);
  float sinR = sin(ang);
  float px = nx * span;
  float py = ny * span;
  float rx = px * cosR - py * sinR;
  float ry = px * sinR + py * cosR;
  float spatialX = rx + uPanX;
  float spatialY = ry + uPanY;

  float seed = mod(floor(clamp(uSeed, 0.0, 99999.0)), 4096.0);
  float octaves = clamp(floor(uOctaves + 0.5), 1.0, 8.0);
  float pers = clamp(uPersistence, 0.0, 0.99);
  float lac = clamp(uLacunarity, 1.0, 4.0);
  float sc = max(uScale, 0.000001);
  float sm = clamp(uSmoothness, 0.0, 1.0);
  float contrast = max(uContrast, 0.0);
  float bright = max(uBrightness, 0.0);
  float motion = clamp(floor(uMotion + 0.5), 0.0, 1.0);

  float bipolar = fieldAt(spatialX, spatialY, uDomainTime, motion, seed, octaves, pers, lac, sc, sm, span);
  float mono = clamp(bipolarToMono(bipolar, contrast) * bright, 0.0, 1.0);
  vec3 col = texture2D(uPalette, vec2(mono, 0.5)).rgb;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** @type {WeakMap<HTMLCanvasElement, object>} */
const nodeGraphFbmFieldGlStates = new WeakMap();

function nodeGraphFbmFieldGlCompile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function nodeGraphFbmFieldGlLink(gl, vs, fs) {
  const v = nodeGraphFbmFieldGlCompile(gl, gl.VERTEX_SHADER, vs);
  const f = nodeGraphFbmFieldGlCompile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "link failed";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}

function nodeGraphFbmFieldGlEnsure(canvas) {
  if (!canvas) return null;
  const picture = typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
  let state = nodeGraphFbmFieldGlStates.get(canvas);
  if (
    state?.gl
    && !state.lost
    && !state.gl.isContextLost()
    && picture?.gl === state.gl
    && state.rev === NODE_GRAPH_FBM_FIELD_GL_REV
  ) {
    return state;
  }
  if (state?.gaveUp) return null;

  const gl = picture?.gl || null;
  if (!gl) {
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true });
    return null;
  }

  try {
    const program = nodeGraphFbmFieldGlLink(gl, NODE_GRAPH_FBM_FIELD_GL_VS, NODE_GRAPH_FBM_FIELD_GL_FS);
    const buf = picture.quad;
    const aPos = gl.getAttribLocation(program, "aPos");

    const colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const colorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, colorFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const blank = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i += 1) blank[i * 4 + 3] = 255;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);

    state = {
      gl,
      program,
      buf,
      aPos,
      colorTex,
      colorFbo,
      colorW: 4,
      colorH: 4,
      paletteTex,
      paletteKey: "",
      lost: false,
      failed: false,
      rev: NODE_GRAPH_FBM_FIELD_GL_REV,
      uniforms: {
        uPalette: gl.getUniformLocation(program, "uPalette"),
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uDomainTime: gl.getUniformLocation(program, "uDomainTime"),
        uZoom: gl.getUniformLocation(program, "uZoom"),
        uPanX: gl.getUniformLocation(program, "uPanX"),
        uPanY: gl.getUniformLocation(program, "uPanY"),
        uRotate: gl.getUniformLocation(program, "uRotate"),
        uSeed: gl.getUniformLocation(program, "uSeed"),
        uOctaves: gl.getUniformLocation(program, "uOctaves"),
        uPersistence: gl.getUniformLocation(program, "uPersistence"),
        uLacunarity: gl.getUniformLocation(program, "uLacunarity"),
        uScale: gl.getUniformLocation(program, "uScale"),
        uSmoothness: gl.getUniformLocation(program, "uSmoothness"),
        uContrast: gl.getUniformLocation(program, "uContrast"),
        uBrightness: gl.getUniformLocation(program, "uBrightness"),
        uMotion: gl.getUniformLocation(program, "uMotion"),
      },
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
    console.warn("[Fractal Brownian Field] WebGL init failed", err);
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true, gaveUp: true });
    return null;
  }
}

function nodeGraphFbmFieldGlUploadPalette(state, stops) {
  const gl = state.gl;
  const key = Array.isArray(stops)
    ? stops.map((s) => `${s?.t}|${s?.color}`).join(";")
    : "";
  if (state.paletteKey === key) return;
  state.paletteKey = key;
  const data = new Uint8Array(256 * 4);
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(stops, t, "#ffffff")
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
 * Present field from uniforms (no WASM face grid). canvas sized to gridW×gridH.
 */
function nodeGraphFbmFieldGlPresentParams(canvas, params = {}) {
  const state = nodeGraphFbmFieldGlEnsure(canvas);
  if (!state?.gl || state.lost) return false;
  const gridW = Math.max(1, params.width | 0);
  const gridH = Math.max(1, params.height | 0);
  if ((canvas.width | 0) !== gridW || (canvas.height | 0) !== gridH) {
    canvas.width = gridW;
    canvas.height = gridH;
  }

  const gl = state.gl;
  nodeGraphFbmFieldGlUploadPalette(state, params.gradientStops);

  if (state.colorW !== gridW || state.colorH !== gridH) {
    state.colorW = gridW;
    state.colorH = gridH;
    gl.bindTexture(gl.TEXTURE_2D, state.colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridW, gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.colorFbo);
  gl.viewport(0, 0, gridW, gridH);
  gl.scissor(0, 0, gridW, gridH);
  gl.enable(gl.SCISSOR_TEST);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(state.uniforms.uPalette, 0);
  gl.uniform2f(state.uniforms.uResolution, gridW, gridH);
  gl.uniform1f(state.uniforms.uDomainTime, Number(params.domainTime) || 0);
  gl.uniform1f(state.uniforms.uZoom, Math.max(0.05, Number(params.zoom) || 1));
  gl.uniform1f(state.uniforms.uPanX, Number(params.panX) || 0);
  gl.uniform1f(state.uniforms.uPanY, Number(params.panY) || 0);
  gl.uniform1f(state.uniforms.uRotate, Number(params.rotate) || 0);
  gl.uniform1f(state.uniforms.uSeed, Math.max(0, Math.min(99999, Math.round(Number(params.seed) || 1))));
  gl.uniform1f(state.uniforms.uOctaves, Math.max(1, Math.min(8, Math.round(Number(params.octaves) || 4))));
  gl.uniform1f(state.uniforms.uPersistence, Math.max(0, Math.min(0.99, Number(params.persistence) || 0.5)));
  gl.uniform1f(state.uniforms.uLacunarity, Math.max(1, Math.min(4, Number(params.lacunarity) || 2)));
  gl.uniform1f(state.uniforms.uScale, Math.max(1e-6, Number(params.scale) || 1));
  gl.uniform1f(state.uniforms.uSmoothness, Math.max(0, Math.min(1, Number(params.smoothness) || 0.55)));
  // Explicit zero valid for contrast/brightness — never coerce with ||.
  const contrast = Number(params.contrast);
  gl.uniform1f(state.uniforms.uContrast, Number.isFinite(contrast) ? Math.max(0, contrast) : 1);
  const brightness = Number(params.brightness);
  gl.uniform1f(state.uniforms.uBrightness, Number.isFinite(brightness) ? Math.max(0, brightness) : 1);
  const motion = Number(params.motion);
  gl.uniform1f(
    state.uniforms.uMotion,
    Number.isFinite(motion) ? Math.max(0, Math.min(1, Math.round(motion))) : 1,
  );

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (params.nodeId && typeof nodeGraphPicturePublish === "function") {
    nodeGraphPicturePublish(params.nodeId, state.colorTex, gridW, gridH);
  }
  if (typeof nodeGraphPicturePresent === "function") {
    return nodeGraphPicturePresent(state.colorTex, gridW, gridH, canvas, canvas.width | 0, canvas.height | 0);
  }
  return true;
}

/** Canvas2D LUT present from monoFloat grid (no-GL / context-loss fallback). */
function nodeGraphFbmFieldPresentCanvas2d(canvas, monoGrid, gridW, gridH, options = {}) {
  if (!canvas || !monoGrid || gridW < 1 || gridH < 1) return false;
  if ((canvas.width | 0) !== (gridW | 0) || (canvas.height | 0) !== (gridH | 0)) {
    canvas.width = gridW;
    canvas.height = gridH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const stops = options.gradientStops;
  const sample = typeof nodeGraphSampleGradientStopsRgb === "function"
    ? (t) => nodeGraphSampleGradientStopsRgb(stops, t, "#ffffff")
    : (t) => {
      const v = Math.round(t * 255);
      return [v, v, v];
    };
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const rgb = sample(i / 255);
    lut[i * 3] = rgb[0];
    lut[i * 3 + 1] = rgb[1];
    lut[i * 3 + 2] = rgb[2];
  }
  const img = ctx.createImageData(gridW, gridH);
  const data = img.data;
  const n = Math.min(monoGrid.length, gridW * gridH);
  for (let i = 0; i < n; i += 1) {
    const e = Math.max(0, Math.min(1, monoGrid[i]));
    const idx = Math.round(e * 255) * 3;
    const o = i * 4;
    data[o] = lut[idx];
    data[o + 1] = lut[idx + 1];
    data[o + 2] = lut[idx + 2];
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

/**
 * Legacy entry: prefer params path; mono grid → Canvas2D fallback.
 */
function nodeGraphFbmFieldGlPresent(canvas, monoGrid, gridW, gridH, options = {}) {
  if (options && options.fieldParams) {
    return nodeGraphFbmFieldGlPresentParams(canvas, {
      ...options.fieldParams,
      width: gridW,
      height: gridH,
      gradientStops: options.gradientStops,
      background: options.background,
      nodeId: options.nodeId,
    });
  }
  return nodeGraphFbmFieldPresentCanvas2d(canvas, monoGrid, gridW, gridH, options);
}

function nodeGraphFbmFieldGlClearBlack(canvas) {
  if (!canvas) return false;
  if (!(canvas.width > 0) || !(canvas.height > 0)) {
    canvas.width = Math.max(1, canvas.width | 0, 1);
    canvas.height = Math.max(1, canvas.height | 0, 1);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const w = Math.max(1, canvas.width | 0);
  const h = Math.max(1, canvas.height | 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  return true;
}
