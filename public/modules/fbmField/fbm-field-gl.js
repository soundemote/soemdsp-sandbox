// FBM Field face present: uploads WASM mono grid → bilinear texture + gradient LUT.
// Does NOT evaluate noise — only displays soemdsp_fbm_field_fill_grid results.

const NODE_GRAPH_FBM_FIELD_GL_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const NODE_GRAPH_FBM_FIELD_GL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uField;
uniform sampler2D uPalette;
uniform vec3 uBackground;
uniform float uSoft;

void main() {
  // Bilinear field sample (smooth upscale from WASM grid)
  float e = texture2D(uField, vUv).r;
  e = clamp(e, 0.0, 1.0);
  vec3 col = texture2D(uPalette, vec2(e, 0.5)).rgb;
  if (uSoft > 0.01) {
    float w = 0.004 + uSoft * 0.02;
    vec3 a = texture2D(uPalette, vec2(clamp(e - w, 0.0, 1.0), 0.5)).rgb;
    vec3 b = texture2D(uPalette, vec2(clamp(e + w, 0.0, 1.0), 0.5)).rgb;
    col = mix(col, (a + col + b) / 3.0, uSoft * 0.7);
  }
  // Mild vignette toward background
  vec2 q = vUv - 0.5;
  float vig = smoothstep(1.05, 0.15, length(q) * 1.2);
  col = mix(uBackground, col, mix(0.94, 1.0, vig));
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

function nodeGraphFbmFieldGlHexToRgb01(hex, fallback = [0, 0, 0]) {
  const color = typeof normalizeNodeGraphTraceDisplayColor === "function"
    ? normalizeNodeGraphTraceDisplayColor(hex, "#000000")
    : String(hex || "#000000");
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return fallback;
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function nodeGraphFbmFieldGlEnsure(canvas) {
  if (!canvas) return null;
  let state = nodeGraphFbmFieldGlStates.get(canvas);
  if (state?.gl && !state.lost) return state;
  if (state?.failed) return null;

  let gl = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) || canvas.getContext("experimental-webgl", { alpha: false, antialias: true });
  } catch (_) {
    gl = null;
  }
  if (!gl) {
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true });
    return null;
  }

  try {
    const program = nodeGraphFbmFieldGlLink(gl, NODE_GRAPH_FBM_FIELD_GL_VS, NODE_GRAPH_FBM_FIELD_GL_FS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");

    const fieldTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fieldTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
      fieldTex,
      paletteTex,
      paletteKey: "",
      fieldW: 0,
      fieldH: 0,
      lost: false,
      failed: false,
      uniforms: {
        uField: gl.getUniformLocation(program, "uField"),
        uPalette: gl.getUniformLocation(program, "uPalette"),
        uBackground: gl.getUniformLocation(program, "uBackground"),
        uSoft: gl.getUniformLocation(program, "uSoft"),
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
    console.warn("[FBM Field] WebGL present init failed", err);
    nodeGraphFbmFieldGlStates.set(canvas, { failed: true });
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
 * @param {HTMLCanvasElement} canvas full-res face canvas
 * @param {Float32Array} monoGrid row-major 0…1 from WASM
 * @param {number} gridW
 * @param {number} gridH
 * @param {object} options gradientStops, background, soft
 */
function nodeGraphFbmFieldGlPresent(canvas, monoGrid, gridW, gridH, options = {}) {
  const state = nodeGraphFbmFieldGlEnsure(canvas);
  if (!state?.gl || state.lost || !monoGrid || gridW < 1 || gridH < 1) {
    return false;
  }
  const gl = state.gl;
  const w = canvas.width | 0;
  const h = canvas.height | 0;
  if (w < 1 || h < 1) return false;

  nodeGraphFbmFieldGlUploadPalette(state, options.gradientStops);

  // Upload mono as LUMINANCE (WebGL1) for single-channel bilinear sample.
  const pixels = new Uint8Array(gridW * gridH);
  const n = Math.min(pixels.length, monoGrid.length);
  for (let i = 0; i < n; i += 1) {
    const e = Math.max(0, Math.min(1, monoGrid[i]));
    pixels[i] = Math.round(e * 255);
  }
  gl.bindTexture(gl.TEXTURE_2D, state.fieldTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    gridW,
    gridH,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  state.fieldW = gridW;
  state.fieldH = gridH;

  gl.viewport(0, 0, w, h);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.fieldTex);
  gl.uniform1i(state.uniforms.uField, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.paletteTex);
  gl.uniform1i(state.uniforms.uPalette, 1);
  const bg = nodeGraphFbmFieldGlHexToRgb01(options.background || "#000000");
  gl.uniform3f(state.uniforms.uBackground, bg[0], bg[1], bg[2]);
  gl.uniform1f(state.uniforms.uSoft, Math.max(0, Math.min(1, Number(options.soft) || 0.35)));

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

function nodeGraphFbmFieldGlClearBlack(canvas) {
  const state = nodeGraphFbmFieldGlEnsure(canvas);
  if (!state?.gl || state.lost) return false;
  const gl = state.gl;
  gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return true;
}
