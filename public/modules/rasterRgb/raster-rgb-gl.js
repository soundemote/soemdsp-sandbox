// Raster RGB GPU present (docs/DISPLAY_SHADER_PLAN.md, M3).
//
// The Canvas2D present ran, every frame: a JS loop over every buffer pixel
// (grade LUT + HSL hue rotate), ImageData copy, putImageData, then one or two
// drawImage calls through ctx.filter = blur(Npx) (blur, then additive glow).
// Here the raw rolling buffer (state.pixels, the CPU copy the ingest already
// writes) is uploaded as a texture and the shaders do the per-pixel work:
//   1. Source pass, per face pixel: nearest-neighbour lookup of the buffer
//      texel (drawImage with smoothing off) → grade LUT texture (contrast →
//      brightness → invert, built by nodeGraphRasterRgbGradeLut from
//      nodeGraphRasterRgbGradeChannel01) → HSL hue rotate, a straight GLSL
//      port of nodeGraphRasterRgbHueRotate. Transparent outside the dest
//      rect (Square ratio letterbox).
//   2. Blur / glow: separable Gaussian, premultiplied, outside the image is
//      transparent (what CSS blur() does on a drawImage). Sigma = the CSS
//      radius in face px. Up to SIGMA_DIRECT px the kernel runs at full
//      resolution (taps at ±ceil(3σ), like Skia's GPU blur). Wider sigmas
//      first halve the image with 2×2 box passes, blur at that level with the
//      box + bilinear-upsample variance taken out, and upsample bilinearly
//      in the composite (Skia does the same above sigma 4).
//   3. Composite: plate under the (blurred) image, source-over, then
//      glow · glowLayer added ("lighter" at globalAlpha = Glow). Opaque.
// The hue rotation is HSL (not linear), so it is ported per pixel rather than
// as a colour matrix; a matrix would not match nodeGraphRasterRgbHueRotate.
//
// Device: the shared picture device (public/lib/visual/picture-device.js).
// Its 4096² canvas never resizes: the composite draws into the bottom-left
// cw×ch scissor rect, which is drawImage'd onto the face. Scratch targets are
// grow-only and shared by every Raster RGB face. No new WebGL context.
// Fallback: returns false → raster-rgb-display.js keeps the Canvas2D path.
// The pixel buffer stays on the CPU, so a new / restored context simply
// re-uploads it on the next present.

(function initRasterRgbGl(global) {
  const SIGMA_DIRECT = 6; // px; above this, blur at a halved level
  const MAX_TAPS_RADIUS = 24; // ceil(3 · SIGMA_DIRECT) + margin
  const MAX_LEVELS = 8;

  const VS = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

  // GL rows count up from the bottom: face row y = uFace.y - 1 - row.
  const SOURCE_FS = `${PRECISION}
uniform sampler2D uRaw;      // bufW × bufH RGBA8, row 0 = top
uniform sampler2D uLut;      // 256 × 1, grade LUT in .r
uniform vec2 uBuf;           // bufW, bufH
uniform vec2 uFace;          // cw, ch
uniform vec4 uDest;          // dx, dy, dw, dh (face px, top-left origin)
uniform float uHue;          // hue shift in cycles, 0 = off

float wrapHue(float n) {
  return n - floor(n);
}

float hslChannel(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

// nodeGraphRasterRgbHueRotate (raster-rgb-math.js).
vec3 hueRotate(vec3 c, float hShift) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  float h = 0.0;
  float s = 0.0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) {
      h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
    } else if (mx == c.g) {
      h = ((c.b - c.r) / d + 2.0) / 6.0;
    } else {
      h = ((c.r - c.g) / d + 4.0) / 6.0;
    }
  }
  h = wrapHue(h + hShift);
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return clamp(vec3(
    hslChannel(p, q, h + 1.0 / 3.0),
    hslChannel(p, q, h),
    hslChannel(p, q, h - 1.0 / 3.0)
  ), 0.0, 1.0);
}

float lut(float v) {
  float i = floor(v * 255.0 + 0.5);
  return texture2D(uLut, vec2((i + 0.5) / 256.0, 0.5)).r;
}

void main() {
  float x = floor(gl_FragCoord.x);
  float y = uFace.y - 1.0 - floor(gl_FragCoord.y);
  if (x < uDest.x || x >= uDest.x + uDest.z || y < uDest.y || y >= uDest.y + uDest.w) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // drawImage, smoothing off: dest pixel centre → floor(source coordinate).
  // Skia picks the lower texel when the centre lands exactly on a texel
  // edge; the small bias reproduces that.
  vec2 t = floor((vec2(x, y) + 0.5 - uDest.xy) * uBuf / uDest.zw - 1.0 / 1024.0);
  t = clamp(t, vec2(0.0), uBuf - 1.0);
  vec3 raw = texture2D(uRaw, (t + 0.5) / uBuf).rgb;
  vec3 c = vec3(lut(raw.r), lut(raw.g), lut(raw.b));
  if (uHue != 0.0) c = hueRotate(c, uHue);
  gl_FragColor = vec4(c, 1.0);
}
`;

  // One separable Gaussian pass, premultiplied RGBA. Taps outside the valid
  // range read as transparent; weights normalise over every tap (CSS / Skia
  // blur). Outputs keep a 1px margin round the level image (the blur of the
  // transparent surround), so the bilinear upsample fades correctly at the
  // face edges instead of clamping to the edge texel.
  const BLUR_FS = `${PRECISION}
uniform sampler2D uTex;
uniform vec2 uTexSize;   // allocated input texture size
uniform float uInOffset; // texel of level pixel 0 in the input (0, or 1 with margin)
uniform vec2 uInMin;     // valid input range in level px [min, max)
uniform vec2 uInMax;
uniform vec2 uAxis;      // (1,0) or (0,1)
uniform float uSigma;    // px at this level
uniform float uRadius;   // taps each side
void main() {
  vec2 p = gl_FragCoord.xy - 1.0; // output has a 1px margin
  float inv2s2 = 1.0 / (2.0 * uSigma * uSigma);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int k = -${MAX_TAPS_RADIUS}; k <= ${MAX_TAPS_RADIUS}; k++) {
    float fk = float(k);
    if (abs(fk) > uRadius) continue;
    float w = exp(-fk * fk * inv2s2);
    wsum += w;
    vec2 q = p + uAxis * fk;
    if (q.x >= uInMin.x && q.y >= uInMin.y && q.x < uInMax.x && q.y < uInMax.y) {
      sum += texture2D(uTex, (q + uInOffset) / uTexSize) * w;
    }
  }
  gl_FragColor = sum / wsum;
}
`;

  // 2×2 box: one bilinear tap on the shared corner of the four source texels.
  const DOWN_FS = `${PRECISION}
uniform sampler2D uTex;
uniform vec2 uTexSize;
void main() {
  gl_FragColor = texture2D(uTex, (floor(gl_FragCoord.xy) * 2.0 + 1.0) / uTexSize);
}
`;

  const COMPOSITE_FS = `${PRECISION}
uniform sampler2D uImage;   // blurred image (or the sharp source)
uniform sampler2D uGlow;
uniform vec2 uImageUv;      // face px → uv: p * uv + off (level scale + margin)
uniform vec2 uImageOff;
uniform vec2 uGlowUv;
uniform vec2 uGlowOff;
uniform float uGlowAlpha;   // 0 = no glow layer
uniform vec3 uPlate;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 img = texture2D(uImage, p * uImageUv + uImageOff);
  vec3 c = img.rgb + uPlate * (1.0 - img.a);
  if (uGlowAlpha > 0.0) {
    c += uGlowAlpha * texture2D(uGlow, p * uGlowUv + uGlowOff).rgb;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

  /** @type {WeakMap<WebGLRenderingContext, object>} */
  const entries = new WeakMap();
  /** Per buffer state: raw + LUT textures (WeakMap: dropped states free them). */
  const stateGpu = new WeakMap();
  const watchedCanvases = new WeakSet();

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (!gl.isContextLost()) {
        console.warn("[raster-rgb-gl] shader compile failed", gl.getShaderInfoLog(shader));
      }
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function link(gl, fsSrc, uniforms) {
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
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
        console.warn("[raster-rgb-gl] program link failed", gl.getProgramInfoLog(program));
      }
      gl.deleteProgram(program);
      return null;
    }
    const u = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(program, name);
    return { program, aPos: gl.getAttribLocation(program, "aPos"), u };
  }

  function entryFor(dev) {
    const gl = dev?.gl;
    if (!gl || gl.isContextLost()) return null;
    let entry = entries.get(gl);
    if (entry) return entry.ok ? entry : null;
    entry = { ok: false };
    entries.set(gl, entry);
    if (dev.canvas && !watchedCanvases.has(dev.canvas)) {
      watchedCanvases.add(dev.canvas);
      dev.canvas.addEventListener("webglcontextrestored", () => {
        entries.delete(gl);
      }, false);
    }
    const source = link(gl, SOURCE_FS, ["uRaw", "uLut", "uBuf", "uFace", "uDest", "uHue"]);
    const blur = link(gl, BLUR_FS, ["uTex", "uTexSize", "uInOffset", "uInMin", "uInMax", "uAxis", "uSigma", "uRadius"]);
    const down = link(gl, DOWN_FS, ["uTex", "uTexSize"]);
    const composite = link(gl, COMPOSITE_FS, [
      "uImage", "uGlow", "uImageUv", "uImageOff", "uGlowUv", "uGlowOff", "uGlowAlpha", "uPlate",
    ]);
    if (!source || !blur || !down || !composite) return null;
    entry.ok = true;
    entry.source = source;
    entry.blur = blur;
    entry.down = down;
    entry.composite = composite;
    entry.maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
    entry.targets = new Map(); // name → { tex, fbo, w, h }
    return entry;
  }

  function makeTexture(gl, filter) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Grow-only RGBA8 render target shared by every face on this context. */
  function target(gl, entry, name, w, h) {
    let t = entry.targets.get(name);
    if (t && t.w >= w && t.h >= h) return t;
    const nw = Math.max(w, t?.w || 0);
    const nh = Math.max(h, t?.h || 0);
    if (nw > entry.maxTex || nh > entry.maxTex) return null;
    if (t) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
      entry.targets.delete(name);
    }
    const tex = makeTexture(gl, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return null;
    }
    t = { tex, fbo, w: nw, h: nh };
    entry.targets.set(name, t);
    return t;
  }

  function lutFor(state, grade) {
    // Same cache key as nodeGraphRasterRgbApplyGrade (shared state fields).
    const key = `${grade.invert}|${grade.contrast}|${grade.brightness}`;
    if (state.gradeLutKey !== key || !state.gradeLut) {
      state.gradeLut = nodeGraphRasterRgbGradeLut(grade);
      state.gradeLutKey = key;
    }
    return { lut: state.gradeLut, key };
  }

  function syncState(gl, state, grade) {
    let g = stateGpu.get(state);
    if (!g || g.gl !== gl) {
      g = { gl, raw: makeTexture(gl, gl.NEAREST), lut: makeTexture(gl, gl.NEAREST), w: 0, h: 0, lutKey: "" };
      stateGpu.set(state, g);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const pix = state.pixels;
    const bytes = pix instanceof Uint8Array ? pix : new Uint8Array(pix.buffer, pix.byteOffset, pix.byteLength);
    gl.bindTexture(gl.TEXTURE_2D, g.raw);
    if (g.w !== state.width || g.h !== state.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, state.width, state.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      g.w = state.width;
      g.h = state.height;
    } else {
      // The ingest writes scattered pixels; one sub-upload of the whole plate.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, state.width, state.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
    const { lut, key } = lutFor(state, grade);
    if (g.lutKey !== key) {
      const rgba = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i += 1) {
        rgba[i * 4] = lut[i];
        rgba[i * 4 + 1] = lut[i];
        rgba[i * 4 + 2] = lut[i];
        rgba[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, g.lut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      g.lutKey = key;
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return g;
  }

  function parsePlate(plate) {
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(String(plate || ""));
    if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
    if (typeof nodeGraphRasterRgbParseHexRgb === "function") {
      const c = nodeGraphRasterRgbParseHexRgb(plate, "#000000");
      return [c[0] / 255, c[1] / 255, c[2] / 255];
    }
    return [0, 0, 0];
  }

  /** Level for a CSS blur sigma: 0 = full res, k = image halved k times. */
  function blurLevel(sigma) {
    let level = 0;
    while (level < MAX_LEVELS && sigma / (1 << level) > SIGMA_DIRECT) level += 1;
    return level;
  }

  function drawQuad(gl, dev, prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, dev.quad);
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function bindTarget(gl, t, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.scissor(0, 0, w, h);
  }

  /**
   * Gaussian with CSS sigma (face px) of the level-0 source. Returns
   * { tex, uv, off }: texture coords = face px · uv + off.
   */
  function gaussian(gl, dev, entry, pyramid, sigma, outName, W0, H0) {
    const level = blurLevel(sigma);
    const scale = 1 << level;
    const lw = W0 / scale;
    const lh = H0 / scale;
    const src = pyramid[level];
    // Box downsample (4^L - 1)/12 + bilinear upsample 4^L/6, in face px².
    const extra = level > 0 ? (scale * scale - 1) / 12 + (scale * scale) / 6 : 0;
    const s = Math.sqrt(Math.max(0, sigma * sigma - extra)) / scale;
    const tmp = target(gl, entry, "tmp", W0 + 2, H0 + 2);
    const out = target(gl, entry, outName, W0 + 2, H0 + 2);
    if (!tmp || !out) return null;
    const prog = entry.blur;
    gl.useProgram(prog.program);
    gl.uniform1i(prog.u.uTex, 0);
    gl.uniform1f(prog.u.uSigma, Math.max(1e-3, s));
    gl.uniform1f(prog.u.uRadius, Math.min(MAX_TAPS_RADIUS, Math.ceil(3 * s)));
    gl.activeTexture(gl.TEXTURE0);
    // Horizontal: level source (no margin) → tmp (1px margin).
    bindTarget(gl, tmp, lw + 2, lh + 2);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform2f(prog.u.uTexSize, src.w, src.h);
    gl.uniform1f(prog.u.uInOffset, 0);
    gl.uniform2f(prog.u.uInMin, 0, 0);
    gl.uniform2f(prog.u.uInMax, lw, lh);
    gl.uniform2f(prog.u.uAxis, 1, 0);
    drawQuad(gl, dev, prog);
    // Vertical: tmp → out (both with margin).
    bindTarget(gl, out, lw + 2, lh + 2);
    gl.bindTexture(gl.TEXTURE_2D, tmp.tex);
    gl.uniform2f(prog.u.uTexSize, tmp.w, tmp.h);
    gl.uniform1f(prog.u.uInOffset, 1);
    gl.uniform2f(prog.u.uInMin, -1, -1);
    gl.uniform2f(prog.u.uInMax, lw + 1, lh + 1);
    gl.uniform2f(prog.u.uAxis, 0, 1);
    drawQuad(gl, dev, prog);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      tex: out.tex,
      uv: [1 / (scale * out.w), 1 / (scale * out.h)],
      off: [1 / out.w, 1 / out.h],
    };
  }

  /** True when this face can present through the shared device. */
  function nodeGraphRasterRgbGlUsable(cw, ch) {
    const dev = typeof nodeGraphPictureDevice === "function" ? nodeGraphPictureDevice() : null;
    if (!dev?.gl || !dev.canvas || dev.gl.isContextLost()) return false;
    if (typeof nodeGraphRasterRgbGradeLut !== "function") return false;
    const entry = entryFor(dev);
    if (!entry) return false;
    return cw >= 1 && ch >= 1 && cw <= dev.canvas.width && ch <= dev.canvas.height
      && cw <= entry.maxTex && ch <= entry.maxTex;
  }

  /**
   * opts: { cw, ch, dx, dy, dw, dh, blurPx, glowPx, plate } — the same numbers
   * the Canvas2D present uses. Returns false when the caller must fall back.
   */
  function nodeGraphRasterRgbGlPresent(state, grade, destCtx, opts) {
    if (!state?.pixels || !destCtx || !opts) return false;
    const cw = opts.cw | 0;
    const ch = opts.ch | 0;
    if (!state.width || !state.height || !nodeGraphRasterRgbGlUsable(cw, ch)) return false;
    const dev = nodeGraphPictureDevice();
    const gl = dev.gl;
    const entry = entryFor(dev);
    if (!entry) return false;
    try {
      // Same tests and the same 2-decimal sigma as the ctx.filter strings.
      const blurOn = opts.blurPx > 0.05;
      const glowOn = grade.glow > 0.001 && opts.glowPx > 0.05;
      const blurSigma = blurOn ? Number(opts.blurPx.toFixed(2)) : 0;
      const glowSigma = glowOn ? Number(opts.glowPx.toFixed(2)) : 0;
      const levels = Math.max(blurOn ? blurLevel(blurSigma) : 0, glowOn ? blurLevel(glowSigma) : 0);
      const unit = 1 << levels;
      // Level-0 region padded to a multiple of 2^levels so every 2×2 box
      // stays inside written (transparent) pixels.
      const W0 = Math.ceil(cw / unit) * unit;
      const H0 = Math.ceil(ch / unit) * unit;
      const g = syncState(gl, state, grade);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.enable(gl.SCISSOR_TEST);

      // 1. Source: grade + hue + nearest placement.
      const src = target(gl, entry, "src", W0, H0);
      if (!src) return false;
      bindTarget(gl, src, W0, H0);
      const sp = entry.source;
      gl.useProgram(sp.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, g.raw);
      gl.uniform1i(sp.u.uRaw, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, g.lut);
      gl.uniform1i(sp.u.uLut, 1);
      gl.uniform2f(sp.u.uBuf, state.width, state.height);
      gl.uniform2f(sp.u.uFace, cw, ch);
      gl.uniform4f(sp.u.uDest, opts.dx, opts.dy, opts.dw, opts.dh);
      const hue = nodeGraphFiniteNumber(grade?.hue);
      const rotate = Math.abs(hue) > 1e-9 && typeof nodeGraphRasterRgbHueRotate === "function";
      gl.uniform1f(sp.u.uHue, rotate ? hue : 0);
      drawQuad(gl, dev, sp);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);

      // 2. Pyramid (only as deep as the widest sigma needs), then blur / glow.
      const pyramid = [src];
      const dp = entry.down;
      for (let k = 1; k <= levels; k += 1) {
        const prev = pyramid[k - 1];
        const t = target(gl, entry, `lvl${k}`, W0 >> k, H0 >> k);
        if (!t) return false;
        bindTarget(gl, t, W0 >> k, H0 >> k);
        gl.useProgram(dp.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, prev.tex);
        gl.uniform1i(dp.u.uTex, 0);
        gl.uniform2f(dp.u.uTexSize, prev.w, prev.h);
        drawQuad(gl, dev, dp);
        pyramid.push(t);
      }
      let image = { tex: src.tex, uv: [1 / src.w, 1 / src.h], off: [0, 0] };
      if (blurOn) {
        image = gaussian(gl, dev, entry, pyramid, blurSigma, "blurOut", W0, H0);
        if (!image) return false;
      }
      let glow = null;
      if (glowOn) {
        glow = gaussian(gl, dev, entry, pyramid, glowSigma, "glowOut", W0, H0);
        if (!glow) return false;
      }

      // 3. Composite into the shared canvas (bottom-left cw×ch).
      bindTarget(gl, null, cw, ch);
      const cp = entry.composite;
      gl.useProgram(cp.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, image.tex);
      gl.uniform1i(cp.u.uImage, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glow ? glow.tex : image.tex);
      gl.uniform1i(cp.u.uGlow, 1);
      gl.uniform2f(cp.u.uImageUv, image.uv[0], image.uv[1]);
      gl.uniform2f(cp.u.uImageOff, image.off[0], image.off[1]);
      gl.uniform2f(cp.u.uGlowUv, glow ? glow.uv[0] : 0, glow ? glow.uv[1] : 0);
      gl.uniform2f(cp.u.uGlowOff, glow ? glow.off[0] : 0, glow ? glow.off[1] : 0);
      gl.uniform1f(cp.u.uGlowAlpha, glow ? grade.glow : 0);
      const plate = parsePlate(opts.plate);
      gl.uniform3f(cp.u.uPlate, plate[0], plate[1], plate[2]);
      drawQuad(gl, dev, cp);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.disable(gl.SCISSOR_TEST);
      if (gl.isContextLost()) return false;

      destCtx.save();
      destCtx.setTransform(1, 0, 0, 1, 0, 0);
      destCtx.globalCompositeOperation = "source-over";
      destCtx.globalAlpha = 1;
      destCtx.filter = "none";
      destCtx.imageSmoothingEnabled = false;
      destCtx.drawImage(dev.canvas, 0, dev.canvas.height - ch, cw, ch, 0, 0, cw, ch);
      destCtx.restore();
      return true;
    } catch (err) {
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!gl.isContextLost()) console.warn("[raster-rgb-gl] present failed, using Canvas2D", err);
      return false;
    }
  }

  global.nodeGraphRasterRgbGlUsable = nodeGraphRasterRgbGlUsable;
  global.nodeGraphRasterRgbGlPresent = nodeGraphRasterRgbGlPresent;
  global.NODE_GRAPH_RASTER_RGB_GL_SOURCE_FS = SOURCE_FS;
  global.NODE_GRAPH_RASTER_RGB_GL_BLUR_FS = BLUR_FS;
})(typeof globalThis !== "undefined" ? globalThis : window);
