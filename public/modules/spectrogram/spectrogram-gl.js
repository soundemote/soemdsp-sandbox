// Spectrogram GPU path (docs/DISPLAY_SHADER_PLAN.md, M1).
//
// The per-pixel work moves into one fragment shader:
//   • Ring history: one texture row per face column holds that column's RAW
//     spectrum bins (4 bins per RGBA float texel). Each emitted pixel column
//     writes one row; uHead says which row is the oldest, so nothing scrolls.
//   • Per-column settings ("permanent ink"): a small meta texture keeps the
//     contrast, brightness, freq scale, band, Nyquist, bin count and colour
//     row that were live when the column was painted. Changing a knob only
//     affects new columns, same as the Canvas2D waterfall.
//   • Colour: 256-wide LUT rows (one per gradient that still has ink on face).
//   • Shader per pixel: ring lookup → Linear / Mel / Bark row→Hz → bilinear
//     bin lerp → x/(1+x) fold → contrast → brightness → LUT. Mirrors
//     spectrogramSpectrumToColumnMags / spectrogramGrade01 /
//     spectrogramCssAtBrightness in spectrogram-display.js.
//
// Device: the shared picture device (public/lib/visual/picture-device.js).
// Its hidden canvas never resizes; we draw into a bottom-left scissor rect and
// drawImage that rect onto the face. No WebGL context per face.
//
// The CPU copy of the ring is kept so a new / restored context re-uploads the
// history, and the Canvas2D fallback can be rebuilt from it.

(function initSpectrogramGl(global) {
  const LUT_ROWS = 16;
  const META_FLOATS = 8; // 2 RGBA texels per column

  const VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uRing;   // RGBA float, 4 raw bins per texel, one row per column
uniform sampler2D uMeta;   // RGBA float, 2 texels per column
uniform sampler2D uLut;    // RGBA8, 256 x uLutRows
uniform vec2 uSize;        // buffer W (= ring rows), H
uniform float uHead;       // ring row of the oldest (leftmost) column
uniform float uSub;        // leftover hop-time in buffer pixels [0,1)
uniform vec3 uPlate;       // brightness-0 LUT (right sliver while uSub > 0)
uniform float uRingTexW;   // texels per ring row
uniform float uLutRows;

const float LN10 = 2.302585092994046;

float binAt(float rowV, float b) {
  float texel = floor(b / 4.0);
  float lane = b - texel * 4.0;
  vec4 v = texture2D(uRing, vec2((texel + 0.5) / uRingTexW, rowV));
  vec4 pick = step(abs(vec4(lane) - vec4(0.0, 1.0, 2.0, 3.0)), vec4(0.5));
  return dot(v, pick);
}

float hzToMel(float hz) { return 2595.0 * (log(1.0 + max(0.0, hz) / 700.0) / LN10); }
float melToHz(float mel) { return 700.0 * (exp((mel / 2595.0) * LN10) - 1.0); }
float hzToBark(float hz) {
  float x = max(0.0, hz) / 600.0;
  return 6.0 * log(x + sqrt(x * x + 1.0));
}
float barkToHz(float bark) {
  float x = bark / 6.0;
  return 600.0 * 0.5 * (exp(x) - exp(-x));
}

float powPos(float x, float e) { return x <= 0.0 ? 0.0 : pow(x, e); }

// spectrogramGrade01 → nodeGraphRasterRgbGradeChannel01 (invert 0).
float grade01(float x, float contrast, float brightness) {
  // Brightness 0 deposits the gradient at 0 (spectrogramScrollPaintPixels).
  if (brightness == 0.0) return 0.0;
  float t = x > 0.0 ? x / (1.0 + x) : 0.0;
  t = clamp(t, 0.0, 1.0);
  float y;
  if (contrast == 0.0) {
    y = 0.5;
  } else {
    float mag = abs(contrast);
    y = t;
    if (abs(mag - 1.0) >= 1e-4) {
      y = t < 0.5
        ? 0.5 * powPos(2.0 * t, mag)
        : 1.0 - 0.5 * powPos(2.0 * (1.0 - t), mag);
    }
    if (contrast < 0.0) y = 1.0 - y;
  }
  y = clamp(y, 0.0, 1.0) * abs(brightness);
  if (y > 1.0) y = 1.0;
  if (brightness < 0.0) y = 1.0 - y;
  return clamp(y, 0.0, 1.0);
}

void main() {
  // Same leftover-time scroll as Instant Waterfall uSub: hop duration stays
  // in seconds; the remainder of one buffer pixel slides the plate left.
  float x = gl_FragCoord.x + uSub;
  if (x >= uSize.x) {
    gl_FragColor = vec4(uPlate, 1.0);
    return;
  }
  float px = floor(x);
  // GL rows count up from the bottom; face row 0 is the top.
  float yTop = uSize.y - 1.0 - floor(gl_FragCoord.y);
  float row = mod(px + uHead, uSize.x);
  float rowV = (row + 0.5) / uSize.x;
  vec4 m0 = texture2D(uMeta, vec2(0.25, rowV));
  vec4 m1 = texture2D(uMeta, vec2(0.75, rowV));
  float contrast = m0.x;
  float brightness = m0.y;
  float scale = m0.z;
  float bins = m0.w;
  float lo = m1.x;
  float hi = m1.y;
  float nyq = m1.z;
  float lutRow = m1.w;

  float mag = 0.0;
  if (bins >= 1.0) {
    // spectrogramRowTToHz: t=0 top → Max freq.
    float t = yTop / max(1.0, uSize.y - 1.0);
    float u = clamp(1.0 - t, 0.0, 1.0);
    float hz;
    if (scale > 0.5 && scale < 1.5) {
      float a = hzToMel(lo);
      float b = hzToMel(hi);
      hz = melToHz(a + u * (b - a));
    } else if (scale >= 1.5) {
      float a = hzToBark(lo);
      float b = hzToBark(hi);
      hz = barkToHz(a + u * (b - a));
    } else {
      hz = lo + u * (hi - lo);
    }
    // spectrogramHzToLinearBin + bilinear bin blend.
    float lb = max(1.0, bins);
    float binF = clamp(max(0.0, hz) / max(1e-9, nyq) * (lb - 1.0), 0.0, lb - 1.0);
    float b0 = clamp(floor(binF), 0.0, lb - 1.0);
    float b1 = min(lb - 1.0, b0 + 1.0);
    float bf = binF - b0;
    mag = binAt(rowV, b0) * (1.0 - bf) + binAt(rowV, b1) * bf;
  }
  float v = grade01(mag, contrast, brightness);
  // spectrogramCssAtBrightness: floor(u * 255 + 1e-6).
  float li = clamp(floor(v * 255.0 + 1e-6), 0.0, 255.0);
  vec3 rgb = texture2D(uLut, vec2((li + 0.5) / 256.0, (lutRow + 0.5) / uLutRows)).rgb;
  gl_FragColor = vec4(rgb, 1.0);
}
`;

  /** @type {WeakMap<WebGLRenderingContext, object>} */
  const programs = new WeakMap();
  const watchedCanvases = new WeakSet();

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("[spectrogram-gl] shader compile failed", gl.getShaderInfoLog(shader));
      }
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function programFor(dev) {
    const gl = dev?.gl;
    if (!gl || gl.isContextLost()) return null;
    let entry = programs.get(gl);
    if (entry) return entry.ok ? entry : null;
    entry = { ok: false };
    programs.set(gl, entry);
    if (dev.canvas && !watchedCanvases.has(dev.canvas)) {
      watchedCanvases.add(dev.canvas);
      // Restored context: every texture/program is gone. Drop the cache so
      // rings rebuild from their CPU copy.
      dev.canvas.addEventListener("webglcontextrestored", () => {
        programs.delete(gl);
      }, false);
    }
    const floatExt = gl.getExtension("OES_texture_float");
    const hp = gl.getShaderPrecisionFormat
      ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
      : null;
    if (!floatExt || !hp || !(hp.precision >= 16)) {
      return null;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("[spectrogram-gl] program link failed", gl.getProgramInfoLog(program));
      }
      gl.deleteProgram(program);
      return null;
    }
    entry.ok = true;
    entry.program = program;
    entry.aPos = gl.getAttribLocation(program, "aPos");
    entry.maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
    entry.u = {
      uRing: gl.getUniformLocation(program, "uRing"),
      uMeta: gl.getUniformLocation(program, "uMeta"),
      uLut: gl.getUniformLocation(program, "uLut"),
      uSize: gl.getUniformLocation(program, "uSize"),
      uHead: gl.getUniformLocation(program, "uHead"),
      uSub: gl.getUniformLocation(program, "uSub"),
      uPlate: gl.getUniformLocation(program, "uPlate"),
      uRingTexW: gl.getUniformLocation(program, "uRingTexW"),
      uLutRows: gl.getUniformLocation(program, "uLutRows"),
    };
    return entry;
  }

  function pictureDevice() {
    return typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
  }

  // ---------------------------------------------------------------- ring (CPU)

  function writeLutRow(ring, row, lutRgb) {
    const o = row * 256 * 4;
    for (let i = 0; i < 256; i += 1) {
      const s = i * 3;
      const d = o + i * 4;
      ring.lut[d] = lutRgb && lutRgb.length > s ? lutRgb[s] : 0;
      ring.lut[d + 1] = lutRgb && lutRgb.length > s + 1 ? lutRgb[s + 1] : 0;
      ring.lut[d + 2] = lutRgb && lutRgb.length > s + 2 ? lutRgb[s + 2] : 0;
      ring.lut[d + 3] = 255;
    }
    ring.lutSrc[row] = lutRgb || null;
    ring.lutDirty = true;
  }

  function lutRowMatches(ring, row, lutRgb) {
    if (ring.lutSrc[row] && ring.lutSrc[row] === lutRgb) return true;
    if (!lutRgb || lutRgb.length < 768) return false;
    const o = row * 256 * 4;
    for (let i = 0; i < 256; i += 1) {
      const s = i * 3;
      const d = o + i * 4;
      if (ring.lut[d] !== lutRgb[s] || ring.lut[d + 1] !== lutRgb[s + 1] || ring.lut[d + 2] !== lutRgb[s + 2]) {
        return false;
      }
    }
    ring.lutSrc[row] = lutRgb;
    return true;
  }

  /** Empty ring: every column is "brightness 0" on LUT row 0 (the empty plate). */
  function spectrogramGlRingCreate(width, lutRgb) {
    const w = Math.max(1, width | 0);
    const ring = {
      w,
      stride: 4, // floats per row (multiple of 4)
      mags: new Float32Array(w * 4),
      meta: new Float32Array(w * META_FLOATS),
      head: 0, // next row to write = oldest column (leftmost)
      dirtyFrom: 0,
      dirtyCount: w,
      lut: new Uint8Array(256 * 4 * LUT_ROWS),
      lutSrc: new Array(LUT_ROWS).fill(null),
      lutRow: 0,
      lutDirty: true,
      pending: new Float32Array(4),
      pendingBins: 0,
      pendingValid: false,
      gpu: null,
    };
    writeLutRow(ring, 0, lutRgb);
    return ring;
  }

  function markAllDirty(ring) {
    ring.dirtyFrom = 0;
    ring.dirtyCount = ring.w;
  }

  function ensureStride(ring, bins) {
    const need = Math.max(4, Math.ceil(Math.max(1, bins | 0) / 4) * 4);
    if (need <= ring.stride) return;
    const old = ring.mags;
    const oldStride = ring.stride;
    const next = new Float32Array(ring.w * need);
    for (let r = 0; r < ring.w; r += 1) {
      next.set(old.subarray(r * oldStride, (r + 1) * oldStride), r * need);
    }
    ring.mags = next;
    ring.stride = need;
    const pending = new Float32Array(need);
    pending.set(ring.pending.subarray(0, Math.min(ring.pending.length, need)));
    ring.pending = pending;
    markAllDirty(ring);
  }

  /** Max-pool one raw spectrum into the column waiting for the next whole pixel. */
  function spectrogramGlRingPool(ring, spectrum, spectrumBins) {
    const bins = Math.max(0, spectrumBins | 0);
    if (!ring || !spectrum || bins < 1) return;
    ensureStride(ring, bins);
    const p = ring.pending;
    if (!ring.pendingValid || ring.pendingBins !== bins) {
      p.fill(0);
      for (let b = 0; b < bins; b += 1) {
        const v = Number(spectrum[b]);
        p[b] = Number.isFinite(v) ? v : 0;
      }
      ring.pendingBins = bins;
      ring.pendingValid = true;
      return;
    }
    for (let b = 0; b < bins; b += 1) {
      const v = Number(spectrum[b]);
      const x = Number.isFinite(v) ? v : 0;
      if (x > p[b]) p[b] = x;
    }
  }

  /** LUT row for new ink. Reuses a matching row, else an unreferenced one. */
  function lutRowFor(ring, lutRgb) {
    const cur = ring.lutRow;
    if (lutRowMatches(ring, cur, lutRgb)) return cur;
    for (let r = 0; r < LUT_ROWS; r += 1) {
      if (r !== cur && lutRowMatches(ring, r, lutRgb)) {
        ring.lutRow = r;
        return r;
      }
    }
    const used = new Uint8Array(LUT_ROWS);
    used[cur] = 1;
    for (let c = 0; c < ring.w; c += 1) {
      const r = ring.meta[c * META_FLOATS + 7] | 0;
      if (r >= 0 && r < LUT_ROWS) used[r] = 1;
    }
    let row = -1;
    for (let k = 1; k < LUT_ROWS; k += 1) {
      const r = (cur + k) % LUT_ROWS;
      if (!used[r]) {
        row = r;
        break;
      }
    }
    // Every row still has ink (fast gradient drags): overwrite the newest one,
    // which only recolours the most recent columns.
    if (row < 0) row = cur;
    writeLutRow(ring, row, lutRgb);
    ring.lutRow = row;
    return row;
  }

  /**
   * Emit n identical columns from the pending pool (same as the Canvas2D
   * scroll-and-paint). params: contrast, brightness, freqScale, minFreq,
   * maxFreq (already band-resolved), nyquist, lutRgb.
   */
  function spectrogramGlRingWrite(ring, nPixels, params) {
    if (!ring || !ring.pendingValid) return;
    const n = Math.min(ring.w, Math.max(0, Math.floor(nPixels)));
    if (n < 1) return;
    const p = params || {};
    const row = lutRowFor(ring, p.lutRgb);
    const contrastRaw = Number(p.contrast);
    const brightnessRaw = Number(p.brightness);
    // Missing / NaN only. Explicit 0 stays 0.
    const contrast = Number.isFinite(contrastRaw) ? contrastRaw : 1;
    const brightness = Number.isFinite(brightnessRaw) ? brightnessRaw : 0;
    const scale = Math.max(0, Math.min(2, Math.round(nodeGraphFiniteNumber(p.freqScale))));
    const lo = nodeGraphFiniteNumber(p.minFreq, 20);
    const hi = nodeGraphFiniteNumber(p.maxFreq, 20000);
    const nyq = nodeGraphFiniteNumber(p.nyquist, 22050);
    const stride = ring.stride;
    const src = ring.pending.subarray(0, stride);
    for (let k = 0; k < n; k += 1) {
      const r = (ring.head + k) % ring.w;
      ring.mags.set(src, r * stride);
      const m = r * META_FLOATS;
      ring.meta[m] = contrast;
      ring.meta[m + 1] = brightness;
      ring.meta[m + 2] = scale;
      ring.meta[m + 3] = ring.pendingBins;
      ring.meta[m + 4] = lo;
      ring.meta[m + 5] = hi;
      ring.meta[m + 6] = nyq;
      ring.meta[m + 7] = row;
    }
    if (ring.dirtyCount <= 0) {
      ring.dirtyFrom = ring.head;
      ring.dirtyCount = 0;
    }
    ring.dirtyCount = Math.min(ring.w, ring.dirtyCount + n);
    ring.head = (ring.head + n) % ring.w;
    ring.pendingValid = false;
    ring.pending.fill(0);
  }

  /**
   * New face width: resample history in time (pixel-centre aligned, like the
   * Canvas2D bilinear stretch). Height needs nothing — the shader maps bins.
   */
  function spectrogramGlRingResize(ring, width) {
    const w = Math.max(1, width | 0);
    if (!ring || ring.w === w) return ring;
    const oldW = ring.w;
    const stride = ring.stride;
    const mags = new Float32Array(w * stride);
    const meta = new Float32Array(w * META_FLOATS);
    for (let j = 0; j < w; j += 1) {
      const s = Math.max(0, Math.min(oldW - 1, ((j + 0.5) * oldW) / w - 0.5));
      const i0 = Math.floor(s);
      const i1 = Math.min(oldW - 1, i0 + 1);
      const f = s - i0;
      const r0 = (ring.head + i0) % oldW;
      const r1 = (ring.head + i1) % oldW;
      const near = f < 0.5 ? r0 : r1;
      meta.set(ring.meta.subarray(near * META_FLOATS, (near + 1) * META_FLOATS), j * META_FLOATS);
      const sameBins = ring.meta[r0 * META_FLOATS + 3] === ring.meta[r1 * META_FLOATS + 3];
      const o = j * stride;
      if (sameBins && f > 0) {
        for (let b = 0; b < stride; b += 1) {
          mags[o + b] = ring.mags[r0 * stride + b] * (1 - f) + ring.mags[r1 * stride + b] * f;
        }
      } else {
        mags.set(ring.mags.subarray(near * stride, (near + 1) * stride), o);
      }
    }
    ring.w = w;
    ring.mags = mags;
    ring.meta = meta;
    ring.head = 0; // chronological layout: row 0 is the oldest column
    markAllDirty(ring);
    return ring;
  }

  // ---------------------------------------------------------------- GPU

  function makeTexture(gl) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function releaseGpu(ring) {
    const g = ring?.gpu;
    if (!g) return;
    ring.gpu = null;
    const gl = g.gl;
    if (!gl || gl.isContextLost()) return;
    if (g.ringTex) gl.deleteTexture(g.ringTex);
    if (g.metaTex) gl.deleteTexture(g.metaTex);
    if (g.lutTex) gl.deleteTexture(g.lutTex);
  }

  function uploadRows(gl, g, ring, r0, n) {
    if (n < 1) return;
    const stride = ring.stride;
    gl.bindTexture(gl.TEXTURE_2D, g.ringTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, r0, stride / 4, n, gl.RGBA, gl.FLOAT,
      ring.mags.subarray(r0 * stride, (r0 + n) * stride),
    );
    gl.bindTexture(gl.TEXTURE_2D, g.metaTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, r0, 2, n, gl.RGBA, gl.FLOAT,
      ring.meta.subarray(r0 * META_FLOATS, (r0 + n) * META_FLOATS),
    );
  }

  function syncGpu(ring, gl, entry) {
    let g = ring.gpu;
    if (!g || g.gl !== gl || g.entry !== entry) {
      releaseGpu(ring);
      g = {
        gl,
        entry,
        ringTex: makeTexture(gl),
        metaTex: makeTexture(gl),
        lutTex: makeTexture(gl),
        texW: 0,
        texH: 0,
      };
      ring.gpu = g;
      ring.lutDirty = true;
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const texW = ring.stride / 4;
    if (g.texW !== texW || g.texH !== ring.w) {
      gl.bindTexture(gl.TEXTURE_2D, g.ringTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, ring.w, 0, gl.RGBA, gl.FLOAT, ring.mags);
      gl.bindTexture(gl.TEXTURE_2D, g.metaTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, ring.w, 0, gl.RGBA, gl.FLOAT, ring.meta);
      g.texW = texW;
      g.texH = ring.w;
      ring.dirtyCount = 0;
    } else if (ring.dirtyCount > 0) {
      const count = Math.min(ring.w, ring.dirtyCount);
      if (count >= ring.w) {
        uploadRows(gl, g, ring, 0, ring.w);
      } else {
        const from = ((ring.dirtyFrom % ring.w) + ring.w) % ring.w;
        const first = Math.min(count, ring.w - from);
        uploadRows(gl, g, ring, from, first);
        uploadRows(gl, g, ring, 0, count - first);
      }
      ring.dirtyCount = 0;
    }
    if (ring.lutDirty) {
      gl.bindTexture(gl.TEXTURE_2D, g.lutTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, LUT_ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, ring.lut);
      ring.lutDirty = false;
    }
    return g;
  }

  /** True when this face can draw through the shared device this frame. */
  function spectrogramGlUsable(ring, bufW, bufH) {
    if (!ring) return false;
    const dev = pictureDevice();
    if (!dev?.gl || !dev.canvas || dev.gl.isContextLost()) return false;
    const entry = programFor(dev);
    if (!entry) return false;
    const w = bufW | 0;
    const h = bufH | 0;
    if (w < 1 || h < 1 || w > dev.canvas.width || h > dev.canvas.height) return false;
    if (w > entry.maxTex || ring.stride / 4 > entry.maxTex) return false;
    return true;
  }

  /**
   * Shade the ring into the shared canvas (bottom-left w×h, scissored) and
   * copy that rect onto the face. Returns false when the caller must use the
   * Canvas2D path instead.
   */
  function spectrogramGlRingPresent(ring, bufW, bufH, destCtx, destW, destH, subPx, plateRgb) {
    if (!ring || !destCtx) return false;
    const w = bufW | 0;
    const h = bufH | 0;
    if (ring.w !== w || !spectrogramGlUsable(ring, w, h)) return false;
    const dev = pictureDevice();
    const gl = dev.gl;
    const entry = programFor(dev);
    if (!entry) return false;
    const g = syncGpu(ring, gl, entry);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.scissor(0, 0, w, h);
    gl.enable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(entry.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, dev.quad);
    gl.enableVertexAttribArray(entry.aPos);
    gl.vertexAttribPointer(entry.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.ringTex);
    gl.uniform1i(entry.u.uRing, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, g.metaTex);
    gl.uniform1i(entry.u.uMeta, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, g.lutTex);
    gl.uniform1i(entry.u.uLut, 2);
    gl.uniform2f(entry.u.uSize, w, h);
    gl.uniform1f(entry.u.uHead, ring.head);
    const sub = Number(subPx);
    gl.uniform1f(entry.u.uSub, Number.isFinite(sub) && sub > 0 ? Math.min(0.999, sub) : 0);
    const pr = plateRgb && plateRgb.length >= 3 ? plateRgb : [0, 0, 0];
    gl.uniform3f(
      entry.u.uPlate,
      nodeGraphFiniteNumber(pr[0]),
      nodeGraphFiniteNumber(pr[1]),
      nodeGraphFiniteNumber(pr[2]),
    );
    gl.uniform1f(entry.u.uRingTexW, ring.stride / 4);
    gl.uniform1f(entry.u.uLutRows, LUT_ROWS);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (gl.isContextLost()) return false;

    const dw = Math.max(1, destW | 0);
    const dh = Math.max(1, destH | 0);
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.globalCompositeOperation = "source-over";
    destCtx.globalAlpha = 1;
    // Same scaling rule as spectrogramPresent: 1:1 crisp, else smooth.
    const exact = w === dw && h === dh;
    destCtx.imageSmoothingEnabled = !exact;
    if ("imageSmoothingQuality" in destCtx) destCtx.imageSmoothingQuality = exact ? "low" : "medium";
    destCtx.drawImage(dev.canvas, 0, dev.canvas.height - h, w, h, 0, 0, dw, dh);
    return true;
  }

  function spectrogramGlRingRelease(ring) {
    releaseGpu(ring);
  }

  global.SPECTROGRAM_GL_LUT_ROWS = LUT_ROWS;
  global.SPECTROGRAM_GL_FRAGMENT_SHADER = FS;
  global.spectrogramGlRingCreate = spectrogramGlRingCreate;
  global.spectrogramGlRingPool = spectrogramGlRingPool;
  global.spectrogramGlRingWrite = spectrogramGlRingWrite;
  global.spectrogramGlRingResize = spectrogramGlRingResize;
  global.spectrogramGlUsable = spectrogramGlUsable;
  global.spectrogramGlRingPresent = spectrogramGlRingPresent;
  global.spectrogramGlRingRelease = spectrogramGlRingRelease;
})(typeof globalThis !== "undefined" ? globalThis : window);
