// Shared Matrix WebGL cell renderer (Waterfall + Display).
//
// CPU keeps the sim (heads / energy / glyph ids). GPU does the plate:
//   1) cell data texture (cols×rows RGBA8: liveIdx, residualIdx, energy, pad)
//   2) glyph atlas texture (high-res font bake — sharp until workspace zoom)
//   3) one fullscreen triangle — fragment shader stamps glyphs + gradient LUT
//
// Display area is letterboxed to fixed cell aspect (no skew), like Number
// Readout natural layout. Default render is "vector" (face CSS × dpr).

/** Design cell aspect for letterboxing (2:3). Buffer size follows CSS×dpr. */
const MATRIX_GL_CELL_W = 8;
const MATRIX_GL_CELL_H = 12;
/** High-res atlas tile (font baked once; sampled into each cell). */
const MATRIX_GL_ATLAS_CELL_W = 48;
const MATRIX_GL_ATLAS_CELL_H = 72;
const MATRIX_GL_ATLAS_COLS = 16;

const MATRIX_GL_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// mode: 0 = Info/Serial (live hard; residual = energy ghost)
//       1 = Waterfall (live + residual both energy-modulated)
//
// Pipeline (gradient last — all asciiscope / matrix faces):
//   1) sample glyph coverage (AA / LINEAR atlas = smooth mono edge)
//   2) accumulate mono = coverage × cell energy (pixels age in brightness)
//   3) gradient LUT is the final step (not mix(plate, gradient(e), cov)
//      which gradiates first then blends RGB)
const MATRIX_GL_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform sampler2D uLut;
uniform vec2 uGrid;
uniform vec2 uAtlasSize;
uniform float uBrightness;
uniform float uMode;
uniform vec3 uPlate;

// Film present (energy → mono) then brightness, then LUT — brightness is present-only.
float filmEnergy(float raw) {
  float lifted = max(raw, 0.0) + 0.04 * pow(max(raw, 0.0), 0.42);
  float e = 1.0 - exp(-lifted * 2.35);
  return pow(clamp(e, 0.0, 1.0), 0.92);
}

vec3 gradientOf(float mono) {
  float t = clamp(mono * uBrightness, 0.0, 1.0);
  return texture2D(uLut, vec2(t, 0.5)).rgb;
}

float sampleGlyph(float glyphIndex, vec2 localUv) {
  float gi = floor(glyphIndex + 0.5);
  float ac = uAtlasSize.x;
  float ar = uAtlasSize.y;
  float gx = mod(gi, ac);
  float gy = floor(gi / ac);
  // Cell local: y=0 at top of bin (after grid flip). Atlas is baked top-down
  // on a 2D canvas with UNPACK_FLIP_Y=0 — sample with matching Y (no extra flip)
  // so glyphs read upright like the 2D asciiscope path.
  vec2 lu = clamp(localUv, 0.0, 1.0);
  lu.y = 1.0 - lu.y; // top of cell → top of glyph tile
  lu = lu * 0.92 + 0.04;
  vec2 uv = vec2(
    (gx + lu.x) / ac,
    1.0 - (gy + lu.y) / ar
  );
  vec3 s = texture2D(uAtlas, uv).rgb;
  return max(s.r, max(s.g, s.b));
}

void main() {
  if (uMode > 1.5) {
    gl_FragColor = vec4(uPlate, 1.0);
    return;
  }

  // Flip Y: sim row 0 = top of plate. WebGL vUv.y=0 is bottom — without
  // this flip rain walks toward increasing rows which read as falling UP.
  vec2 gridUv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 gridPos = gridUv * uGrid;
  vec2 cell = floor(gridPos);
  vec2 local = fract(gridPos);

  vec2 dataUv = (cell + 0.5) / uGrid;
  vec4 d = texture2D(uCells, dataUv);
  float liveIdx = floor(d.r * 255.0 + 0.5);
  float resIdx = floor(d.g * 255.0 + 0.5);
  float energy = d.b; // 0..1 mono cell age / brightness

  float spaceIdx = 0.0;
  // Accumulate mono first (smooth glyph coverage × energy), then gradient once.
  float mono = 0.0;

  if (uMode < 0.5) {
    // Info / Serial: residual = film(energy); live = hard (t=1)
    if (energy > 0.001 && resIdx > spaceIdx + 0.5) {
      float cov = sampleGlyph(resIdx, local);
      mono = max(mono, cov * filmEnergy(energy) * 0.85);
    }
    if (liveIdx > spaceIdx + 0.5) {
      float cov = sampleGlyph(liveIdx, local);
      mono = max(mono, cov * 1.0);
    }
  } else {
    // Waterfall: one glyph; trail length from energy decay (Trail param), not brightness.
    // No hardcoded tip glow — brightness is present gain only.
    float gi = liveIdx > spaceIdx + 0.5 ? liveIdx : resIdx;
    if (gi > spaceIdx + 0.5 && energy > 0.001) {
      float cov = sampleGlyph(gi, local);
      float film = filmEnergy(energy);
      mono = max(mono, cov * film);
    }
  }

  // Plate residual ghosts (Info/Serial already set mono). Film already applied for rain.
  // Brightness is only here via gradientOf — never baked into energy deposits.
  vec3 color = mono < 0.001 ? uPlate : gradientOf(mono);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/** @type {WeakMap<HTMLCanvasElement, object>} */
const matrixGlStates = new WeakMap();

function matrixGlCompile(gl, type, source) {
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

function matrixGlLink(gl, vsSource, fsSource) {
  const vs = matrixGlCompile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = matrixGlCompile(gl, gl.FRAGMENT_SHADER, fsSource);
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

/**
 * Bake the closed glyph set into a high-res mono atlas (white on black).
 * High tile size = sharp sampling at normal module zoom (LCD-style).
 */
function matrixGlBuildAtlasImage(cellW = MATRIX_GL_ATLAS_CELL_W, cellH = MATRIX_GL_ATLAS_CELL_H) {
  const glyphs = MATRIX_GLYPH_SET;
  const count = Math.max(1, glyphs.length);
  const cols = MATRIX_GL_ATLAS_COLS;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cw = Math.max(8, Math.round(cellW) | 0);
  const ch = Math.max(12, Math.round(cellH) | 0);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Slight inset so LINEAR mag doesn't bleed into neighboring tiles.
  const fontPx = Math.max(6, Math.floor(ch * 0.78));
  ctx.font = `700 ${fontPx}px ${MATRIX_FONT_STACK}`;
  for (let i = 0; i < count; i += 1) {
    const chGlyph = glyphs[i];
    if (!chGlyph || chGlyph === " ") continue;
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    const cx = gx * cw + cw * 0.5;
    const cy = gy * ch + ch * 0.54;
    ctx.fillText(chGlyph, cx, cy);
  }
  return { canvas, cols, rows, count, cellW: cw, cellH: ch };
}

function matrixGlUploadAtlas(gl, atlasImage, existingTex = null) {
  const tex = existingTex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  // LINEAR looks smooth when atlas tiles are larger than on-screen cells;
  // NEAREST for exact lo-fi. Default LINEAR for LCD-like sharpness.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImage.canvas);
  return tex;
}

/**
 * Rebuild atlas when on-screen cell px exceeds bake quality.
 * Sharp and Pixel share the same atlas *size* (same glyph shapes/areas).
 * Only filter differs: LINEAR (smooth) vs NEAREST (pixelated sample of same bake).
 */
function matrixGlSyncAtlas(glState, pxPerCol, pxPerRow, loFi = false) {
  if (!glState?.gl || !glState.atlasTex) return;
  const gl = glState.gl;
  // Same high-quality bake for both modes so Pixel ≈ Sharp with hard edges.
  const needW = Math.max(MATRIX_GL_ATLAS_CELL_W, Math.ceil(pxPerCol * 1.35));
  const needH = Math.max(MATRIX_GL_ATLAS_CELL_H, Math.ceil(pxPerRow * 1.35));
  let acw = Math.min(128, needW);
  let ach = Math.min(192, needH);
  const design = MATRIX_GL_CELL_W / MATRIX_GL_CELL_H;
  if (acw / ach > design) acw = Math.max(8, Math.round(ach * design));
  else ach = Math.max(12, Math.round(acw / design));
  const filter = loFi ? gl.NEAREST : gl.LINEAR;
  // Same atlas size: only switch filter (Sharp ↔ Pixel) without rebaking geometry.
  if (glState.atlasCellW === acw && glState.atlasCellH === ach) {
    gl.bindTexture(gl.TEXTURE_2D, glState.atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    glState.atlasLoFi = Boolean(loFi);
    return;
  }
  const image = matrixGlBuildAtlasImage(acw, ach);
  if (!image) return;
  matrixGlUploadAtlas(gl, image, glState.atlasTex);
  gl.bindTexture(gl.TEXTURE_2D, glState.atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  glState.atlasCols = image.cols;
  glState.atlasRows = image.rows;
  glState.atlasCellW = acw;
  glState.atlasCellH = ach;
  glState.atlasLoFi = Boolean(loFi);
}

/**
 * Create (or recover) WebGL state for a face canvas.
 * Returns null if WebGL is unavailable (caller should use 2D fallback).
 */
function matrixGlEnsure(canvas) {
  if (!canvas) return null;
  let state = matrixGlStates.get(canvas);
  if (state?.gl && !state.gl.isContextLost()) {
    return state;
  }
  if (state?.failed) return null;

  // Never call getContext("2d") on this canvas first — that permanently
  // blocks WebGL. Prefer webgl only; 2D fallback uses a separate path only
  // when this returns null.
  let gl = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      gl = canvas.getContext("experimental-webgl", {
        alpha: false,
        antialias: true,
        depth: false,
        preserveDrawingBuffer: false,
      });
    }
  } catch (_) {
    gl = null;
  }
  if (!gl) {
    matrixGlStates.set(canvas, { failed: true });
    return null;
  }

  try {
    const program = matrixGlLink(gl, MATRIX_GL_VS, MATRIX_GL_FS);
    const aPos = gl.getAttribLocation(program, "aPos");
    const uniforms = {
      uCells: gl.getUniformLocation(program, "uCells"),
      uAtlas: gl.getUniformLocation(program, "uAtlas"),
      uLut: gl.getUniformLocation(program, "uLut"),
      uGrid: gl.getUniformLocation(program, "uGrid"),
      uAtlasSize: gl.getUniformLocation(program, "uAtlasSize"),
      uBrightness: gl.getUniformLocation(program, "uBrightness"),
      uMode: gl.getUniformLocation(program, "uMode"),
      uPlate: gl.getUniformLocation(program, "uPlate"),
    };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // Fullscreen triangle (covers NDC with one triangle)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        3, -1,
        -1, 3,
      ]),
      gl.STATIC_DRAW,
    );

    const atlasImage = matrixGlBuildAtlasImage();
    if (!atlasImage) {
      matrixGlStates.set(canvas, { failed: true });
      return null;
    }
    const atlasTex = matrixGlUploadAtlas(gl, atlasImage);

    const cellTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cellTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 256×1 energy→color LUT (mono → gradient, applied last; LINEAR for AA mono).
    const lutTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const defaultLut = typeof matrixBuildGradientLutRgba === "function"
      ? matrixBuildGradientLutRgba(null)
      : new Uint8Array(256 * 4);
    if (!defaultLut[3]) {
      for (let i = 0; i < 256; i += 1) {
        const o = i * 4;
        defaultLut[o] = 0;
        defaultLut[o + 1] = i;
        defaultLut[o + 2] = 0;
        defaultLut[o + 3] = 255;
      }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, defaultLut);

    state = {
      gl,
      program,
      aPos,
      uniforms,
      buf,
      atlasTex,
      atlasCols: atlasImage.cols,
      atlasRows: atlasImage.rows,
      atlasCellW: atlasImage.cellW,
      atlasCellH: atlasImage.cellH,
      atlasLoFi: false,
      cellTex,
      lutTex,
      lutKey: "",
      cellData: null,
      cellCols: 0,
      cellRows: 0,
      failed: false,
    };

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      matrixGlStates.delete(canvas);
    }, false);
    canvas.addEventListener("webglcontextrestored", () => {
      matrixGlStates.delete(canvas);
    }, false);

    matrixGlStates.set(canvas, state);
    return state;
  } catch (error) {
    console.warn?.("[Matrix Display] WebGL init failed", error);
    matrixGlStates.set(canvas, { failed: true });
    return null;
  }
}

function matrixGlResolveRenderStyle(paramsOrStyle) {
  if (typeof paramsOrStyle === "string") {
    return typeof matrixNormalizeRenderStyle === "function"
      ? matrixNormalizeRenderStyle(paramsOrStyle)
      : (paramsOrStyle === "vector" ? "vector" : "pixel");
  }
  const raw = paramsOrStyle?.renderStyle;
  return typeof matrixNormalizeRenderStyle === "function"
    ? matrixNormalizeRenderStyle(raw)
    : (raw === "vector" ? "vector" : "pixel");
}

/**
 * Shared layout for Matrix Waterfall + Matrix Display.
 *   • Canvas fills the stage (no letterbox blank bars)
 *   • Sharp and Pixel share the SAME buffer size / cell grid (same shapes & area)
 *   • Sharp: LINEAR atlas sample + image-rendering:auto (smooth)
 *   • Pixel: NEAREST atlas sample + image-rendering:pixelated (same image, hard edges)
 * Switching style must not resize the buffer (would wipe the GL surface / look like a full redraw).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} columns
 * @param {number} rows
 * @param {"pixel"|"vector"} [renderStyle]
 * @returns {{ w:number, h:number, style:string, cssW:number, cssH:number, left:number, top:number, pxPerCol:number, pxPerRow:number, loFi:boolean }}
 */
function matrixGlSyncCanvasSize(canvas, columns, rows, renderStyle = "vector") {
  const style = matrixGlResolveRenderStyle(renderStyle);
  const loFi = style === "pixel";
  const cols = Math.max(1, columns | 0);
  const rws = Math.max(1, rows | 0);
  const designW = MATRIX_GL_CELL_W;
  const designH = MATRIX_GL_CELL_H;

  const stage = canvas.parentElement;
  const cssW = Math.max(1, Math.floor(stage?.clientWidth || canvas.clientWidth || cols * designW));
  const cssH = Math.max(1, Math.floor(stage?.clientHeight || canvas.clientHeight || rws * designH));

  canvas.style.display = "block";
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.right = "auto";
  canvas.style.bottom = "auto";
  canvas.style.inset = "auto";
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  // Identical buffer for Sharp and Pixel (dpr×ss supersample).
  const maxPx = 3072;
  const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const ss = 2;
  let w = Math.max(cols, Math.min(maxPx, Math.round(cssW * dpr * ss)));
  let h = Math.max(rws, Math.min(maxPx, Math.round(cssH * dpr * ss)));
  let pxPerCol = Math.max(1, Math.floor(w / cols));
  let pxPerRow = Math.max(1, Math.floor(h / rws));
  const minCell = 14;
  if (cssW * dpr / cols >= minCell && pxPerCol < minCell) {
    const scale = minCell / pxPerCol;
    pxPerCol = minCell;
    pxPerRow = Math.max(1, Math.round(pxPerRow * scale));
  }
  w = pxPerCol * cols;
  h = pxPerRow * rws;
  if (w > maxPx || h > maxPx) {
    const s = Math.min(maxPx / w, maxPx / h, 1);
    pxPerCol = Math.max(1, Math.floor(pxPerCol * s));
    pxPerRow = Math.max(1, Math.floor(pxPerRow * s));
    w = pxPerCol * cols;
    h = pxPerRow * rws;
  }

  // Only filter / CSS scale mode differs — never buffer geometry.
  if (loFi) {
    canvas.style.imageRendering = "pixelated";
    canvas.style.setProperty("image-rendering", "pixelated");
  } else {
    canvas.style.imageRendering = "auto";
    canvas.style.setProperty("image-rendering", "auto");
  }

  // Only assign size when it changes — style-only toggles must not clear the surface.
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return {
    w,
    h,
    style,
    cssW,
    cssH,
    left: 0,
    top: 0,
    pxPerCol,
    pxPerRow,
    loFi,
  };
}

function matrixGlPackCells(state, glState) {
  // Always pack the fixed phosphor buffer (not the logical density grid).
  const columns = state.bufColumns || state.columns;
  const rows = state.bufRows || state.rows;
  const { energy, live, residual } = state;
  const n = columns * rows;
  if (!glState.cellData || glState.cellCols !== columns || glState.cellRows !== rows) {
    glState.cellData = new Uint8Array(n * 4);
    glState.cellCols = columns;
    glState.cellRows = rows;
  }
  const data = glState.cellData;
  const glyphIndex = typeof matrixGlyphIndex === "function" ? matrixGlyphIndex : (ch) => (ch === " " ? 0 : 1);
  for (let i = 0; i < n; i += 1) {
    const o = i << 2;
    data[o] = glyphIndex(live[i] || " ") & 255;
    data[o + 1] = glyphIndex(residual[i] || " ") & 255;
    data[o + 2] = Math.min(255, Math.max(0, (energy[i] * 255) | 0));
    data[o + 3] = 255;
  }
  return data;
}

/** Upload gradient LUT when stops change (stable string key). */
function matrixGlSyncLut(glState, stops) {
  if (!glState?.gl || !glState.lutTex) return { r: 0, g: 0, b: 0 };
  const gl = glState.gl;
  const safeStops = Array.isArray(stops) && stops.length >= 2 ? stops : null;
  const key = safeStops
    ? safeStops.map((s) => `${Number(s?.t).toFixed(3)}:${String(s?.color || "")}`).join("|")
    : "__default__";
  if (key !== glState.lutKey) {
    let data = null;
    try {
      data = typeof matrixBuildGradientLutRgba === "function"
        ? matrixBuildGradientLutRgba(safeStops)
        : null;
    } catch (_) {
      data = null;
    }
    if (!data || data.length < 256 * 4) {
      data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i += 1) {
        const o = i * 4;
        data[o] = 0;
        data[o + 1] = i;
        data[o + 2] = Math.floor(i * 0.2);
        data[o + 3] = 255;
      }
    }
    // Force floor black so a bad gradient can't flash a white plate.
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    data[3] = 255;
    gl.bindTexture(gl.TEXTURE_2D, glState.lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    glState.lutKey = key;
  }
  // Plate = gradient floor (t=0), never pure white
  let floor = { r: 0, g: 0, b: 0 };
  try {
    if (typeof matrixSampleGradientRgb === "function") {
      floor = matrixSampleGradientRgb(safeStops, 0);
    }
  } catch (_) { /* keep black */ }
  if ((floor.r + floor.g + floor.b) > 600) {
    floor = { r: 0, g: 0, b: 0 };
  }
  return floor;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {*} state sim state
 * @param {*} params
 * @param {number} mode 0 info/serial, 1 waterfall (matches prior drawFace convention)
 * @returns {boolean} true if drawn on GPU
 */
function matrixGlDrawFace(canvas, state, params, mode) {
  const glState = matrixGlEnsure(canvas);
  if (!glState?.gl) return false;

  try {
    const gl = glState.gl;
    if (gl.isContextLost?.()) {
      matrixGlStates.delete(canvas);
      return false;
    }
    // Draw fixed phosphor buffer; density only affects deposit stamp size.
    const columns = state.bufColumns || state.columns;
    const rows = state.bufRows || state.rows;
    const renderStyle = matrixGlResolveRenderStyle(params);
    const fit = matrixGlSyncCanvasSize(canvas, columns, rows, renderStyle);
    const { w, h, pxPerCol, pxPerRow, loFi } = fit;
    matrixGlSyncAtlas(glState, pxPerCol, pxPerRow, loFi);
    const data = matrixGlPackCells(state, glState);
    const floor = matrixGlSyncLut(glState, params?.gradientStops);

    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    // Explicit black clear — never leave undefined/white backbuffer.
    gl.clearColor(
      (floor.r || 0) / 255,
      (floor.g || 0) / 255,
      (floor.b || 0) / 255,
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(glState.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, glState.buf);
    gl.enableVertexAttribArray(glState.aPos);
    gl.vertexAttribPointer(glState.aPos, 2, gl.FLOAT, false, 0, 0);

    // Cell data texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glState.cellTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      columns,
      rows,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    gl.uniform1i(glState.uniforms.uCells, 0);

    // Atlas
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glState.atlasTex);
    gl.uniform1i(glState.uniforms.uAtlas, 1);

    // Gradient LUT (mono energy → color) — always bound (unbound samples = white)
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, glState.lutTex);
    gl.uniform1i(glState.uniforms.uLut, 2);

    gl.uniform2f(glState.uniforms.uGrid, columns, rows);
    gl.uniform2f(glState.uniforms.uAtlasSize, glState.atlasCols, glState.atlasRows);
    // 0 brightness = black plate (shader mono*0 → LUT floor). Allow 0; no 0.05 floor.
    {
      const b = Number(params?.brightness);
      gl.uniform1f(glState.uniforms.uBrightness, Number.isFinite(b) ? Math.max(0, b) : 1);
    }
    gl.uniform1f(glState.uniforms.uMode, mode === 1 ? 1 : 0);
    gl.uniform3f(
      glState.uniforms.uPlate,
      (floor.r || 0) / 255,
      (floor.g || 0) / 255,
      (floor.b || 0) / 255,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  } catch (error) {
    console.warn?.("[Matrix Display] WebGL draw failed", error);
    try {
      matrixGlStates.delete(canvas);
    } catch (_) { /* ignore */ }
    return false;
  }
}

/** Engine-off plate — same GPU path, static "ENGINE OFF" stamp (one upload + draw). */
function matrixGlDrawColdPlate(canvas, columns = 96, rows = 64, renderStyle = "pixel", gradientStops = null) {
  const glState = matrixGlEnsure(canvas);
  if (!glState?.gl) return false;
  const gl = glState.gl;
  const cols = Math.max(8, columns | 0);
  const rws = Math.max(8, rows | 0);
  const fit = matrixGlSyncCanvasSize(canvas, cols, rws, renderStyle);
  const { w, h, pxPerCol, pxPerRow, loFi } = fit;
  matrixGlSyncAtlas(glState, pxPerCol, pxPerRow, loFi);
  const floor = matrixGlSyncLut(glState, gradientStops);

  const n = cols * rws;
  if (!glState.coldData || glState.coldData.length !== n * 4) {
    glState.coldData = new Uint8Array(n * 4);
  }
  const data = glState.coldData;
  data.fill(0);
  for (let i = 0; i < n; i += 1) data[(i << 2) + 3] = 255;

  const msg = "ENGINE OFF";
  const glyphIndex = typeof matrixGlyphIndex === "function" ? matrixGlyphIndex : () => 0;
  const startC = Math.max(0, Math.floor((cols - msg.length) * 0.5));
  const row = Math.floor(rws * 0.5);
  for (let i = 0; i < msg.length && startC + i < cols; i += 1) {
    const ch = msg.charAt(i);
    if (ch === " ") continue;
    const o = (row * cols + startC + i) << 2;
    // Residual + energy path (info mode) → dim plate text, not hard live.
    data[o + 1] = glyphIndex(ch) & 255;
    data[o + 2] = 120;
  }

  gl.viewport(0, 0, w, h);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(glState.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, glState.buf);
  gl.enableVertexAttribArray(glState.aPos);
  gl.vertexAttribPointer(glState.aPos, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glState.cellTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rws, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.uniform1i(glState.uniforms.uCells, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, glState.atlasTex);
  gl.uniform1i(glState.uniforms.uAtlas, 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, glState.lutTex);
  gl.uniform1i(glState.uniforms.uLut, 2);

  gl.uniform2f(glState.uniforms.uGrid, cols, rws);
  gl.uniform2f(glState.uniforms.uAtlasSize, glState.atlasCols, glState.atlasRows);
  gl.uniform1f(glState.uniforms.uBrightness, 1);
  gl.uniform1f(glState.uniforms.uMode, 0); // residual path for dim ENGINE OFF
  gl.uniform3f(
    glState.uniforms.uPlate,
    (floor.r || 0) / 255,
    (floor.g || 0) / 255,
    (floor.b || 0) / 255,
  );
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function matrixGlAvailable(canvas) {
  return Boolean(matrixGlEnsure(canvas)?.gl);
}
