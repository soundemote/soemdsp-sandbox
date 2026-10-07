// Number Readout / Value LCD / Pitch digits — DSEG (and mono) SDF glyph atlas
// on the shared picture device. Glow = exp(-d²/σ²), core = smoothstep.
// Inner shadow = rounded-box SDF (same family as room dimmer). Canvas2D
// fillText / shadowBlur / ctx.filter kept as fallback when GL is unavailable.

(function initNumberReadoutGl(global) {
  const REV = 1;
  const ATLAS_CELL_W = 64;
  const ATLAS_CELL_H = 96;
  const ATLAS_COLS = 8;
  const SDF_SPREAD = 10; // atlas px; half-range encoded around 0.5
  const DSEG_FONT = '"DSEG7 Classic", "Consolas", monospace';
  const MONO_FONT = '"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace';
  // Closed sets — bake once. Pitch note names use mono; Hz/MIDI use DSEG.
  const DSEG_GLYPHS = "0123456789-.";
  const MONO_GLYPHS = "ABCDEFGabcdefg#0123456789-.";

  let shared = null;

  const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  // One glyph stamp: SDF atlas → soft core + optional Gaussian glow.
  const DIGIT_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform vec4 uAtlasRect; // xy = tile origin UV, zw = tile size UV
uniform float uSpread;   // SDF spread in *screen* px (atlas spread * scale)
uniform float uSigma;    // glow sigma in screen px (0 = core only)
uniform vec4 uColor;     // premultiplied-ready rgba (rgb * a, a)
uniform float uEnergy;   // 1 = soft energy (glow under core), 0 = crisp core on top

float sampleSdf(vec2 localUv) {
  // localUv 0..1 in glyph quad (y up in GL frag after we flip)
  vec2 uv = uAtlasRect.xy + localUv * uAtlasRect.zw;
  return texture2D(uAtlas, uv).r;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag - uCenter;
  vec2 halfPx = max(uHalf, vec2(0.5));
  // Pad quad so glow has room; discard far outside.
  vec2 pad = halfPx + vec2(max(uSigma * 3.0, uSpread) + 1.0);
  if (abs(p.x) > pad.x || abs(p.y) > pad.y) discard;

  // Map into glyph cell UV (y: GL up → atlas top-down bake).
  vec2 local = p / halfPx; // -1..1 at ink box
  vec2 luv = local * 0.5 + 0.5;
  // Soft edge: allow sampling slightly outside cell for glow/AA.
  float sdf = sampleSdf(clamp(luv, vec2(0.0), vec2(1.0)));
  // Encoded: 0.5 = edge, >0.5 outside, <0.5 inside. d in screen px.
  float d = (sdf - 0.5) * uSpread;

  float aa = max(0.75, uSpread * 0.04);
  float core = 1.0 - smoothstep(-aa, aa, d);

  float glow = 0.0;
  if (uSigma > 0.001) {
    float sig = max(uSigma, 0.001);
    // Outside + soft fringe: Gaussian of distance to edge.
    float dd = max(d, 0.0);
    glow = exp(-(dd * dd) / (sig * sig));
    // Slight inside bleed so soft energy deposits do not hollow out.
    if (uEnergy > 0.5) {
      float di = max(-d, 0.0);
      glow = max(glow, exp(-(di * di) / ((sig * 0.55) * (sig * 0.55))) * 0.55);
    }
  }

  float cov;
  if (uSigma > 0.001 && uEnergy < 0.5) {
    // Lit path: glow halo + opaque core on top (matches fillText + shadowBlur + core).
    cov = max(glow, core);
  } else if (uSigma > 0.001) {
    cov = max(glow, core * 0.92);
  } else {
    cov = core;
  }
  if (cov < 0.001) discard;
  gl_FragColor = vec4(uColor.rgb * cov, uColor.a * cov);
}
`;

  // Face inset shadow from rounded-box SDF (no ctx.filter).
  const SHADOW_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uResolution;
uniform vec2 uFaceMin;
uniform vec2 uFaceSize;
uniform vec2 uOffset;
uniform float uReach;
uniform float uBlur;
uniform float uAlpha;
uniform float uRound;

float sdRoundBox(vec2 p, vec2 b, float r) {
  float rad = clamp(r, 0.0, min(b.x, b.y));
  vec2 q = abs(p) - b + vec2(rad);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // Clip to face
  if (frag.x < uFaceMin.x || frag.y < uFaceMin.y
      || frag.x >= uFaceMin.x + uFaceSize.x
      || frag.y >= uFaceMin.y + uFaceSize.y) discard;

  vec2 center = uFaceMin + uFaceSize * 0.5 + uOffset;
  vec2 halfPx = max(uFaceSize * 0.5, vec2(1e-3));
  // Hole = face rect shifted by offset (same as destination-out punch).
  float d = sdRoundBox(frag - center, halfPx, uRound);
  // Outside hole → shadow. Soft Gaussian-ish via smoothstep + optional blur width.
  float feather = max(uBlur, 0.6);
  float outside = smoothstep(-feather, feather, d);
  float a = clamp(outside * uAlpha, 0.0, 1.0);
  // Reach taper: deeper shadows fall off toward face center (matches soft veil).
  float reach = max(uReach, 1.0);
  float inward = clamp((-d) / reach, 0.0, 1.0);
  // Outside stays full; inside fades with distance from rim.
  float taper = d >= 0.0 ? 1.0 : (1.0 - inward);
  a *= taper;
  if (a < 0.001) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(sh) || 'compile failed';
      console.warn('[number-readout-gl]', err);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(p) || 'link failed';
      console.warn('[number-readout-gl]', err);
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  function isDsegFamily(fontFamily) {
    return /DSEG/i.test(String(fontFamily || ""));
  }

  function glyphSetFor(fontFamily) {
    return isDsegFamily(fontFamily) ? DSEG_GLYPHS : MONO_GLYPHS;
  }

  function fontStackFor(fontFamily) {
    return isDsegFamily(fontFamily) ? DSEG_FONT : MONO_FONT;
  }

  /** 1D squared EDT on a row/col (Felzenszwalb & Huttenlocher). */
  function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -1e20;
    z[1] = 1e20;
    for (let q = 1; q < n; q += 1) {
      let s;
      for (;;) {
        const r = v[k];
        s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
        if (s > z[k]) break;
        k -= 1;
        if (k < 0) {
          k = 0;
          break;
        }
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = 1e20;
    }
    k = 0;
    for (let q = 0; q < n; q += 1) {
      while (z[k + 1] < q) k += 1;
      const r = v[k];
      const dist = q - r;
      d[q] = dist * dist + f[r];
    }
  }

  function edt2d(bin, w, h) {
    // bin: 0 = inside (ink), 1 = outside. Returns float distance field (outside positive).
    const n = Math.max(w, h);
    const f = new Float32Array(n);
    const d = new Float32Array(n);
    const v = new Int32Array(n);
    const z = new Float32Array(n + 1);
    const grid = new Float32Array(w * h);
    const INF = 1e12;
    for (let i = 0; i < w * h; i += 1) {
      grid[i] = bin[i] ? INF : 0;
    }
    // Columns
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < h; y += 1) f[y] = grid[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y += 1) grid[y * w + x] = d[y];
    }
    // Rows
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) f[x] = grid[y * w + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x += 1) grid[y * w + x] = d[x];
    }
    for (let i = 0; i < grid.length; i += 1) {
      grid[i] = Math.sqrt(grid[i]);
    }
    return grid;
  }

  function buildSdfAtlas(glyphs, fontStack) {
    const count = glyphs.length;
    const cols = ATLAS_COLS;
    const rows = Math.max(1, Math.ceil(count / cols));
    const cw = ATLAS_CELL_W;
    const ch = ATLAS_CELL_H;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cw;
    canvas.height = rows * ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontPx = Math.max(6, Math.floor(ch * 0.72));
    ctx.font = `700 ${fontPx}px ${fontStack}`;

    // Temp mask per cell
    const cellCanvas = document.createElement("canvas");
    cellCanvas.width = cw;
    cellCanvas.height = ch;
    const cctx = cellCanvas.getContext("2d", { willReadFrequently: true });
    if (!cctx) return null;

    const out = ctx.createImageData(canvas.width, canvas.height);
    const outData = out.data;
    const indexOf = Object.create(null);

    for (let i = 0; i < count; i += 1) {
      const g = glyphs[i];
      indexOf[g] = i;
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      cctx.clearRect(0, 0, cw, ch);
      cctx.fillStyle = "#fff";
      cctx.textAlign = "center";
      cctx.textBaseline = "middle";
      cctx.font = `700 ${fontPx}px ${fontStack}`;
      if (g && g !== " ") {
        cctx.fillText(g, cw * 0.5, ch * 0.54);
      }
      const img = cctx.getImageData(0, 0, cw, ch);
      const binOut = new Uint8Array(cw * ch);
      const binIn = new Uint8Array(cw * ch);
      for (let p = 0; p < cw * ch; p += 1) {
        const a = img.data[p * 4 + 3] > 128 || img.data[p * 4] > 128 ? 1 : 0;
        binOut[p] = a ? 0 : 1; // 0 distance seed at ink for outside-field
        binIn[p] = a ? 1 : 0;  // seed at empty for inside-field
      }
      const outside = edt2d(binOut, cw, ch);
      const inside = edt2d(binIn, cw, ch);
      const ox = gx * cw;
      const oy = gy * ch;
      for (let y = 0; y < ch; y += 1) {
        for (let x = 0; x < cw; x += 1) {
          const p = y * cw + x;
          const ink = binOut[p] === 0;
          const dist = ink ? -inside[p] : outside[p];
          const enc = Math.max(0, Math.min(255,
            Math.round((dist / SDF_SPREAD) * 127.5 + 127.5)));
          const o = ((oy + y) * canvas.width + (ox + x)) * 4;
          outData[o] = enc;
          outData[o + 1] = enc;
          outData[o + 2] = enc;
          outData[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    return {
      canvas,
      cols,
      rows,
      count,
      cellW: cw,
      cellH: ch,
      glyphs,
      indexOf,
      spread: SDF_SPREAD,
    };
  }

  function uploadAtlas(gl, atlasImage, existingTex) {
    const tex = existingTex || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImage.canvas);
    return tex;
  }

  function getShared() {
    if (shared?.gl && !shared.gl.isContextLost() && shared.rev === REV) return shared;
    shared = null;
    const picture = typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
    if (!picture?.gl) return null;
    const gl = picture.gl;
    const digitProg = link(gl, VERT, DIGIT_FRAG);
    const shadowProg = link(gl, VERT, SHADOW_FRAG);
    if (!digitProg || !shadowProg) return null;

    const dsegAtlas = buildSdfAtlas(DSEG_GLYPHS, DSEG_FONT);
    const monoAtlas = buildSdfAtlas(MONO_GLYPHS, MONO_FONT);
    if (!dsegAtlas || !monoAtlas) return null;

    const dsegTex = uploadAtlas(gl, dsegAtlas, null);
    const monoTex = uploadAtlas(gl, monoAtlas, null);

    shared = {
      rev: REV,
      gl,
      canvas: picture.canvas,
      quad: picture.quad,
      digitProg,
      shadowProg,
      dsegAtlas,
      monoAtlas,
      dsegTex,
      monoTex,
      digit: {
        aPos: gl.getAttribLocation(digitProg, "aPos"),
        uAtlas: gl.getUniformLocation(digitProg, "uAtlas"),
        uResolution: gl.getUniformLocation(digitProg, "uResolution"),
        uCenter: gl.getUniformLocation(digitProg, "uCenter"),
        uHalf: gl.getUniformLocation(digitProg, "uHalf"),
        uAtlasRect: gl.getUniformLocation(digitProg, "uAtlasRect"),
        uSpread: gl.getUniformLocation(digitProg, "uSpread"),
        uSigma: gl.getUniformLocation(digitProg, "uSigma"),
        uColor: gl.getUniformLocation(digitProg, "uColor"),
        uEnergy: gl.getUniformLocation(digitProg, "uEnergy"),
      },
      shadow: {
        aPos: gl.getAttribLocation(shadowProg, "aPos"),
        uResolution: gl.getUniformLocation(shadowProg, "uResolution"),
        uFaceMin: gl.getUniformLocation(shadowProg, "uFaceMin"),
        uFaceSize: gl.getUniformLocation(shadowProg, "uFaceSize"),
        uOffset: gl.getUniformLocation(shadowProg, "uOffset"),
        uReach: gl.getUniformLocation(shadowProg, "uReach"),
        uBlur: gl.getUniformLocation(shadowProg, "uBlur"),
        uAlpha: gl.getUniformLocation(shadowProg, "uAlpha"),
        uRound: gl.getUniformLocation(shadowProg, "uRound"),
      },
    };
    return shared;
  }

  function atlasForFont(device, fontFamily) {
    if (isDsegFamily(fontFamily)) {
      return { atlas: device.dsegAtlas, tex: device.dsegTex };
    }
    return { atlas: device.monoAtlas, tex: device.monoTex };
  }

  function glyphIndex(atlas, ch) {
    if (!ch || ch === " " || ch === "!") return -1;
    const i = atlas.indexOf[ch];
    return i == null ? -1 : i;
  }

  /**
   * Draw digit string via SDF atlas into destCtx. Returns false → Canvas2D fallback.
   */
  function drawDigits(context, opts) {
    const device = getShared();
    if (!device || !context) return false;
    const {
      text,
      centerX,
      centerY,
      fontFamily,
      fontSize,
      cellW: cellWIn,
      rgb,
      alpha,
      glow = 0,
      softBlurPx = 0,
      plate = false,
      energy = false,
    } = opts || {};
    const raw = String(text || "");
    if (!raw || !(fontSize > 0.25)) return false;

    const { atlas, tex } = atlasForFont(device, fontFamily);
    const gl = device.gl;
    const ink = energy ? [255, 255, 255] : rgb;
    if (!ink || ink.length < 3) return false;
    const a = Math.max(0, Math.min(1, Number(alpha)));
    if (!(a > 0)) return true; // nothing to draw, but GL "handled" it

    // Probe cell width if missing — must not call fillText on hot path when we
    // already know cellW; when unknown, approximate from fontSize (DSEG ~0.6em).
    const cellW = Math.max(1, Number(cellWIn) || fontSize * 0.62);
    let cellCount = 0;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] !== ".") cellCount += 1;
    }
    cellCount = Math.max(1, cellCount);
    let penX = centerX - (cellCount * cellW) * 0.5 + cellW * 0.5;

    const blurPx = Math.max(
      0,
      Number(softBlurPx) || (glow > 0.001 ? fontSize * (0.08 + glow * 0.55) : 0),
    );
    const halfW = cellW * 0.5;
    const halfH = fontSize * 0.55;
    const pad = Math.ceil(Math.max(blurPx * 3, atlas.spread * (fontSize / atlas.cellH)) + 2);

    // Collect stamp list first to compute bbox.
    const stamps = [];
    let cursor = penX;
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (ch === ".") {
        stamps.push({ ch: ".", x: cursor - cellW * 0.5 });
        continue;
      }
      let glyph = ch;
      if (plate) {
        glyph = (ch === "-" || ch === " ") ? "-" : "8";
      } else if (ch === " " || ch === "!") {
        cursor += cellW;
        continue;
      }
      stamps.push({ ch: glyph, x: cursor });
      cursor += cellW;
    }
    if (!stamps.length) return true;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = centerY - halfH - pad;
    let maxY = centerY + halfH + pad;
    for (const s of stamps) {
      minX = Math.min(minX, s.x - halfW - pad);
      maxX = Math.max(maxX, s.x + halfW + pad);
    }
    minX = Math.floor(minX);
    maxX = Math.ceil(maxX);
    minY = Math.floor(minY);
    maxY = Math.ceil(maxY);
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    if (bw > device.canvas.width || bh > device.canvas.height) return false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.scissor(0, 0, bw, bh);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(device.digitProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, device.quad);
    gl.enableVertexAttribArray(device.digit.aPos);
    gl.vertexAttribPointer(device.digit.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(device.digit.uAtlas, 0);
    gl.uniform2f(device.digit.uResolution, bw, bh);

    const screenSpread = atlas.spread * (fontSize / atlas.cellH);
    gl.uniform1f(device.digit.uSpread, Math.max(1, screenSpread));
    gl.uniform1f(device.digit.uSigma, blurPx);
    gl.uniform1f(device.digit.uEnergy, energy ? 1 : 0);
    const cr = ink[0] / 255;
    const cg = ink[1] / 255;
    const cb = ink[2] / 255;
    gl.uniform4f(device.digit.uColor, cr * a, cg * a, cb * a, a);

    for (const s of stamps) {
      const gi = glyphIndex(atlas, s.ch);
      if (gi < 0) continue;
      const col = gi % atlas.cols;
      const row = Math.floor(gi / atlas.cols);
      const u0 = col / atlas.cols;
      const v0 = row / atlas.rows;
      const u1 = 1 / atlas.cols;
      const v1 = 1 / atlas.rows;
      gl.uniform4f(device.digit.uAtlasRect, u0, v0, u1, v1);
      // Local centre in scissor (GL y up).
      const lx = s.x - minX;
      const ly = (bh - 1) - (centerY - minY);
      gl.uniform2f(device.digit.uCenter, lx, ly);
      gl.uniform2f(device.digit.uHalf, halfW, halfH);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    try {
      const srcY = Math.max(0, device.canvas.height - bh);
      const prevComp = context.globalCompositeOperation;
      const op = String(opts.composite || "source-over").trim() || "source-over";
      if (op !== "source-over") context.globalCompositeOperation = op;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.imageSmoothingEnabled = true;
      context.drawImage(device.canvas, 0, srcY, bw, bh, minX, minY, bw, bh);
      context.globalCompositeOperation = prevComp;
    } catch (_e) {
      return false;
    }
    return true;
  }

  /**
   * LCD inset glass shadow via rounded-box SDF. Returns false → Canvas2D fallback.
   */
  function drawInnerShadow(context, left, top, width, height, distance01, sharpness01, offsetX01, offsetY01) {
    const device = getShared();
    if (!device || !context || !(width > 2) || !(height > 2)) return false;
    const dist = Math.max(0, Math.min(1, Number(distance01) || 0));
    if (dist <= 0.001) return true;
    const sharp = Math.max(0, Math.min(1, Number(sharpness01) || 0));
    const ox01 = Math.max(-1, Math.min(1, Number(offsetX01) || 0));
    const oy01 = Math.max(-1, Math.min(1, Number(offsetY01) || 0));
    const minSide = Math.min(width, height);
    const reach = Math.max(1, dist * minSide * 0.42);
    const hardEase = (() => {
      const x = sharp;
      return x * x * (3 - 2 * x);
    })();
    const softFrac = (1 - hardEase) * (1 - hardEase);
    const maxBlurPx = reach * 1.35;
    const blurPx = maxBlurPx * softFrac;
    const softBase = Math.min(0.55, 0.18 + dist * 0.28);
    const alpha = softBase + (1 - softBase) * hardEase;
    const maxOff = reach * 0.9;
    const offX = ox01 * maxOff;
    const offY = oy01 * maxOff;

    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    const pad = Math.ceil(Math.max(blurPx * 2, 2) + Math.max(Math.abs(offX), Math.abs(offY)) + 2);
    const bw = w + pad * 2;
    const bh = h + pad * 2;
    if (bw > device.canvas.width || bh > device.canvas.height) return false;

    const gl = device.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.scissor(0, 0, bw, bh);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(device.shadowProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, device.quad);
    gl.enableVertexAttribArray(device.shadow.aPos);
    gl.vertexAttribPointer(device.shadow.aPos, 2, gl.FLOAT, false, 0, 0);

    // Face sits at (pad,pad) in local scissor; GL y-up flips offset Y.
    gl.uniform2f(device.shadow.uResolution, bw, bh);
    gl.uniform2f(device.shadow.uFaceMin, pad, pad);
    gl.uniform2f(device.shadow.uFaceSize, w, h);
    gl.uniform2f(device.shadow.uOffset, offX, -offY);
    gl.uniform1f(device.shadow.uReach, reach);
    gl.uniform1f(device.shadow.uBlur, Math.max(blurPx, sharp >= 0.999 ? 0.35 : blurPx));
    gl.uniform1f(device.shadow.uAlpha, alpha);
    gl.uniform1f(device.shadow.uRound, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    try {
      const srcY = Math.max(0, device.canvas.height - bh);
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.beginPath();
      context.rect(left, top, width, height);
      context.clip();
      context.drawImage(device.canvas, 0, srcY, bw, bh, left - pad, top - pad, bw, bh);
      context.restore();
    } catch (_e) {
      return false;
    }
    return true;
  }

  global.NumberReadoutGl = {
    drawDigits,
    drawInnerShadow,
    available: () => Boolean(getShared()),
    rev: REV,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
