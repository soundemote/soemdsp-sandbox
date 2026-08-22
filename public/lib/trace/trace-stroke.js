// Instant (non-phosphor) TRACE stroke helpers — VECTOR philosophy.
//
// TRACE ≠ PHOSPHOR:
//   • Trace: continuous polyline in face space (layout×dpr). No pixel density.
//   • Phosphor: energy deposits on a density-scaled pixel grid.
// Do not add strip-chart scroll or density knobs here — that drifts concepts.
//
// Not burn: no energy FBO, no decay, no bleed. Clear + redraw each frame.
// History plot: brightness scales ink. Blur is stroke softness.
// Size = 0–1 of face min side: 0 → 1px, 1 → full side (exponential).

(function initTraceStroke(global) {
  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  function normalizeBlur(value, fallback = 0.2) {
    if (typeof global.PhosphorDrawer?.normalizeBlur === "function") {
      return global.PhosphorDrawer.normalizeBlur(value, fallback);
    }
    let v = Number(value);
    if (!Number.isFinite(v)) {
      v = Number(fallback);
    }
    if (!Number.isFinite(v)) {
      return 0.2;
    }
    if (v < 0) {
      v = (Math.max(-1, v) + 1) * 0.5;
    }
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Diameter in buffer px — linear size × face min side.
   * Size 0 → 0 (trace vanishes). No 1px floor (sub-pixel is allowed).
   * Phosphor stamps keep their own 1px floor; do not share that helper.
   */
  function diameterPx(faceMinSide, size01) {
    const side = Math.max(1, Number(faceMinSide) || 1);
    return side * clamp01(size01, 0);
  }

  function radiusPx(faceMinSide, size01) {
    return diameterPx(faceMinSide, size01) * 0.5;
  }

  /**
   * Radial intensity at distance fraction t from centerline (0 center → 1 edge).
   *
   * Curve: raised cosine (half Hann) after a hardness knee —
   *   t <= knee:  1
   *   t in (knee, 1]:  0.5 + 0.5·cos(π·u)  with u = (t-knee)/(1-knee)
   *   → falls 1→0 with continuous first derivative (no step/ring).
   *
   * blur 0 → knee≈1 (hard brick). blur 1 → knee≈0 (soft from center).
   */
  function edgeProfile(t, blur01) {
    const soft = clamp01(blur01, 0);
    const x = clamp01(t, 0);
    if (soft < 0.02) {
      return x < 0.999 ? 1 : 0;
    }
    const knee = (1 - soft) * 0.85;
    if (x <= knee) {
      return 1;
    }
    const u = (x - knee) / Math.max(1e-6, 1 - knee);
    return 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
  }

  /**
   * Draw a multi-piece path (null breaks). Uses existing smooth-path helper if present.
   */
  function strokePath(context, points) {
    if (!context || !Array.isArray(points) || !points.length) {
      return 0;
    }
    let pieces = 0;
    // Instant Trace is a polyline. Quadratic smoothing bows low-frequency
    // 1D/stereo traces into blobs; never use the phosphor smooth-path helper.
    let drawing = false;
    let segmentStart = -1;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        drawing = false;
        segmentStart = -1;
        continue;
      }
      if (!drawing) {
        context.beginPath();
        context.moveTo(p.x, p.y);
        drawing = true;
        segmentStart = i;
        pieces += 1;
      } else {
        context.lineTo(p.x, p.y);
      }
      const next = points[i + 1];
      if (!next || !Number.isFinite(next?.x) || !Number.isFinite(next?.y)) {
        // 1-point segments: stroke() is invisible — draw a dot instead.
        if (segmentStart === i) {
          const w = Math.max(0, Number(context.lineWidth) || 0);
          if (w <= 0) {
            drawing = false;
            segmentStart = -1;
            continue;
          }
          context.beginPath();
          context.arc(p.x, p.y, w * 0.5, 0, Math.PI * 2);
          context.fillStyle = context.strokeStyle;
          context.fill();
        } else {
          context.stroke();
        }
        drawing = false;
        segmentStart = -1;
      }
    }
    if (drawing) {
      context.stroke();
    }
    return pieces;
  }

  /**
   * History fade along the polyline. t=0 oldest, t=1 newest.
   * fade 0 = even ink. fade 1 = oldest gone, newest full.
   * Power ease: linear left the back half of a circle sitting near 50%.
   */
  function fadeWeight(t, fade01) {
    const f = clamp01(fade01, 0);
    if (f <= 0.001) {
      return 1;
    }
    const u = clamp01(t, 0);
    const k = 1 + f * 2.2;
    return (1 - f) + f * Math.pow(u, k);
  }

  function paintStrokePiece(context, pts, r, g, b, alpha, lineWidth, blur, additive) {
    if (!pts?.length || !(lineWidth > 0) || !(alpha > 0.004)) {
      return;
    }
    const finite = pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!finite.length) {
      return;
    }
    if (blur < 0.04) {
      const color = additive
        ? `rgb(${Math.round(r * alpha)}, ${Math.round(g * alpha)}, ${Math.round(b * alpha)})`
        : `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
      context.lineWidth = lineWidth;
      context.strokeStyle = color;
      context.fillStyle = color;
      if (finite.length === 1) {
        if (context.lineCap === "butt") {
          return;
        }
        context.beginPath();
        context.arc(finite[0].x, finite[0].y, lineWidth * 0.5, 0, Math.PI * 2);
        context.fill();
      } else {
        strokePath(context, pts);
      }
      return;
    }
    const expand = lineWidth * blur * 2;
    const passes = 7;
    const I = [];
    const widths = [];
    for (let i = 0; i < passes; i += 1) {
      const t = 1 - i / (passes - 1);
      widths.push(lineWidth + expand * t);
      I.push(t <= 0 ? 1 : edgeProfile(Math.min(0.999, t), 1));
    }
    for (let i = 0; i < passes; i += 1) {
      const a = (additive
        ? Math.max(0, I[i] - (i > 0 ? I[i - 1] : 0))
        : I[i]) * alpha;
      if (a < 0.008) {
        continue;
      }
      const w = widths[i];
      if (!(w > 0)) {
        continue;
      }
      const color = `rgba(${r}, ${g}, ${b}, ${Math.min(1, a)})`;
      context.lineWidth = w;
      context.strokeStyle = color;
      context.fillStyle = color;
      if (finite.length === 1) {
        context.beginPath();
        context.arc(finite[0].x, finite[0].y, w * 0.5, 0, Math.PI * 2);
        context.fill();
      } else {
        strokePath(context, pts);
      }
    }
  }

  let fadeGl = null;

  const FADE_VERT = `
    precision highp float;
    attribute vec2 aStart;
    attribute vec2 aEnd;
    attribute float aCorner;
    attribute float aAge0;
    attribute float aAge1;
    uniform vec2 uCanvasSize;
    uniform float uRadius;
    uniform float uBlur;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vAge0;
    varying float vAge1;
    void main() {
      vec2 segment = aEnd - aStart;
      float segmentLength = max(length(segment), 0.0001);
      vec2 tangent = segment / segmentLength;
      vec2 normal = vec2(-tangent.y, tangent.x);
      float side = (aCorner == 0.0 || aCorner == 2.0) ? 1.0 : -1.0;
      float endpointMix = aCorner < 2.0 ? 0.0 : 1.0;
      float cap = aCorner < 2.0 ? -1.0 : 1.0;
      float pad = max(uRadius * mix(1.15, 3.2, clamp(uBlur, 0.0, 1.0)), 1.25);
      float capPad = 1.25;
      vec2 endpoint = mix(aStart, aEnd, endpointMix);
      vec2 position = endpoint + normal * side * pad + tangent * cap * capPad;
      vStart = aStart;
      vEnd = aEnd;
      vPosition = position;
      vAge0 = aAge0;
      vAge1 = aAge1;
      vec2 clip = vec2(
        (position.x / uCanvasSize.x) * 2.0 - 1.0,
        1.0 - (position.y / uCanvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const FADE_FRAG = `
    precision highp float;
    uniform vec3 uColor;
    uniform float uRadius;
    uniform float uBlur;
    uniform float uFade;
    varying vec2 vStart;
    varying vec2 vEnd;
    varying vec2 vPosition;
    varying float vAge0;
    varying float vAge1;
    float fadeWeightGl(float t, float f) {
      if (f <= 0.001) {
        return 1.0;
      }
      float u = clamp(t, 0.0, 1.0);
      float k = 1.0 + f * 2.2;
      return (1.0 - f) + f * pow(u, k);
    }
    void main() {
      vec2 segment = vEnd - vStart;
      float len2 = max(dot(segment, segment), 0.0001);
      float along = clamp(dot(vPosition - vStart, segment) / len2, 0.0, 1.0);
      vec2 closest = vStart + segment * along;
      float radius = max(uRadius, 0.35);
      float nd = length(vPosition - closest) / radius;
      if (nd > 6.0) {
        discard;
      }
      float blur = clamp(uBlur, 0.0, 1.0);
      float edgeFromBlur = mix(0.02, 1.15, blur);
      float edgeFromPixel = 0.85 / max(radius, 0.5);
      float edgeWidth = max(edgeFromBlur, min(0.55, edgeFromPixel));
      float core = clamp(1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, nd), 0.0, 1.0);
      float fade = fadeWeightGl(mix(vAge0, vAge1, along), uFade);
      float a = core * fade;
      if (a < 0.004) {
        discard;
      }
      gl_FragColor = vec4(uColor * a, a);
    }
  `;

  function compileFadeShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function getFadeGlDevice() {
    if (fadeGl?.gl && !fadeGl.gl.isContextLost()) {
      return fadeGl;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      fadeGl = null;
      return null;
    }
    const vs = compileFadeShader(gl, gl.VERTEX_SHADER, FADE_VERT);
    const fs = compileFadeShader(gl, gl.FRAGMENT_SHADER, FADE_FRAG);
    if (!vs || !fs) {
      return null;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    const buffer = gl.createBuffer();
    fadeGl = {
      canvas,
      gl,
      program,
      buffer,
      aStart: gl.getAttribLocation(program, "aStart"),
      aEnd: gl.getAttribLocation(program, "aEnd"),
      aCorner: gl.getAttribLocation(program, "aCorner"),
      aAge0: gl.getAttribLocation(program, "aAge0"),
      aAge1: gl.getAttribLocation(program, "aAge1"),
      uCanvasSize: gl.getUniformLocation(program, "uCanvasSize"),
      uRadius: gl.getUniformLocation(program, "uRadius"),
      uBlur: gl.getUniformLocation(program, "uBlur"),
      uFade: gl.getUniformLocation(program, "uFade"),
      uColor: gl.getUniformLocation(program, "uColor"),
    };
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      fadeGl = null;
    }, false);
    return fadeGl;
  }

  function buildFadeRibbon(points, realTotal) {
    const floats = [];
    const corners = [0, 1, 2, 1, 3, 2];
    let realIndex = 0;
    let prev = null;
    let prevT = 0;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        prev = null;
        continue;
      }
      const t = realTotal > 1 ? realIndex / (realTotal - 1) : 1;
      if (prev) {
        for (let c = 0; c < corners.length; c += 1) {
          floats.push(prev.x, prev.y, p.x, p.y, corners[c], prevT, t);
        }
      }
      prev = p;
      prevT = t;
      realIndex += 1;
    }
    return floats;
  }

  function drawFadeRibbon(context, points, r, g, b, lineWidth, blur, fade, additive) {
    const dest = context?.canvas;
    const width = Math.max(1, dest?.width || 0);
    const height = Math.max(1, dest?.height || 0);
    if (!dest || width < 2 || height < 2) {
      return false;
    }
    const device = getFadeGlDevice();
    if (!device?.gl) {
      return false;
    }
    const visible = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (visible.length < 2) {
      return false;
    }
    const floats = buildFadeRibbon(points, visible.length);
    if (floats.length < 14) {
      return false;
    }
    const gl = device.gl;
    const canvas = device.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (additive) {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.useProgram(device.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, device.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(floats), gl.STREAM_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(device.aStart);
    gl.vertexAttribPointer(device.aStart, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(device.aEnd);
    gl.vertexAttribPointer(device.aEnd, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(device.aCorner);
    gl.vertexAttribPointer(device.aCorner, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(device.aAge0);
    gl.vertexAttribPointer(device.aAge0, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(device.aAge1);
    gl.vertexAttribPointer(device.aAge1, 1, gl.FLOAT, false, stride, 24);
    gl.uniform2f(device.uCanvasSize, width, height);
    gl.uniform1f(device.uRadius, Math.max(0.35, lineWidth * 0.5));
    gl.uniform1f(device.uBlur, blur);
    gl.uniform1f(device.uFade, fade);
    gl.uniform3f(device.uColor, r / 255, g / 255, b / 255);
    gl.drawArrays(gl.TRIANGLES, 0, floats.length / 7);
    gl.disable(gl.BLEND);
    context.drawImage(canvas, 0, 0, width, height);
    return true;
  }

  /**
   * VECTOR polyline stroke (not a pixel/energy stamp).
   * blur 0 → one hard stroke at Size.
   * blur > 0 → same core plus a soft halo that fattens outward (not into Size).
   * fade 0…1 fades ink along history (oldest → newest).
   * options: { size, blur, brightness, fade, color, faceMinSide, rgb, composite }
   * Prefer composite "source-over" + opaque ink for clean vector combines.
   */
  function draw(context, points, options = {}) {
    if (!context || !Array.isArray(points) || !points.length) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || 1);
    const size01 = clamp01(options.size, 0);
    const blur = normalizeBlur(options.blur, 0.2);
    const brightness = Math.max(0, Number(options.brightness) || 0);
    const fade = clamp01(options.fade, 0);
    if (brightness <= 0 || size01 <= 0) {
      return 0;
    }

    let rgb = options.rgb;
    if (!Array.isArray(rgb) || rgb.length < 3) {
      const hex = String(options.color || "#75ebff").trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        rgb = [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        ];
      } else {
        rgb = [117, 235, 255];
      }
    }
    // Brightness is 0…1 exactly (UI + settings). No 0…2→half remap here.
    const gain = Math.max(0, Math.min(1, brightness));
    const r = Math.round(rgb[0] * gain);
    const g = Math.round(rgb[1] * gain);
    const b = Math.round(rgb[2] * gain);
    const lineWidth = diameterPx(face, size01);
    if (!(lineWidth > 0)) {
      return 0;
    }

    const visible = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!visible.length) {
      return 0;
    }

    context.save();
    // Stroke in buffer pixels. Smoothing here only hurts when the face
    // bitmap is later scaled — leave AA to the path rasterizer.
    context.globalCompositeOperation = options.composite || "source-over";
    context.imageSmoothingEnabled = false;
    context.lineCap = options.lineCap === "butt" ? "butt" : "round";
    context.lineJoin = options.lineCap === "butt" ? "miter" : "round";
    context.miterLimit = 2;
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    const additive = String(context.globalCompositeOperation || "") === "lighter";

    if (fade <= 0.02 || visible.length < 3) {
      paintStrokePiece(context, points, r, g, b, 1, lineWidth, blur, additive);
      context.restore();
      return visible.length;
    }

    if (drawFadeRibbon(context, points, r, g, b, lineWidth, blur, fade, additive)) {
      context.restore();
      return visible.length;
    }

    const realTotal = visible.length;
    const chunks = Math.min(48, Math.max(12, Math.round(Math.sqrt(realTotal) * 1.6)));
    let realIndex = 0;
    let piece = [];
    let pieceT0 = 0;
    let pieceT1 = 0;
    let bucket = -1;
    const flush = () => {
      if (!piece.length) {
        return;
      }
      const tMid = (pieceT0 + pieceT1) * 0.5;
      paintStrokePiece(context, piece, r, g, b, fadeWeight(tMid, fade), lineWidth, blur, additive);
      const tail = piece[piece.length - 1];
      piece = tail && Number.isFinite(tail.x) ? [tail] : [];
      pieceT0 = pieceT1;
    };
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        flush();
        piece = [];
        bucket = -1;
        continue;
      }
      const t = realTotal > 1 ? realIndex / (realTotal - 1) : 1;
      const nextBucket = Math.min(chunks - 1, Math.floor(t * chunks + 1e-9));
      if (bucket >= 0 && nextBucket !== bucket) {
        flush();
      }
      if (!piece.length) {
        pieceT0 = t;
      }
      bucket = nextBucket;
      piece.push(p);
      pieceT1 = t;
      realIndex += 1;
    }
    flush();

    context.restore();
    return visible.length;
  }

  /**
   * Cap control points for a path budget (even subsample). Pieces (null breaks) preserved.
   */
  function budgetPoints(points, maxPoints) {
    const src = Array.isArray(points) ? points : [];
    const cap = Math.max(16, Math.floor(Number(maxPoints) || 2048));
    if (src.length <= cap) {
      return src;
    }
    // Count real points; if under cap, return as-is.
    let real = 0;
    for (let i = 0; i < src.length; i += 1) {
      if (src[i]) real += 1;
    }
    if (real <= cap) {
      return src;
    }
    // Even pick of real points, keep null breaks when neighbors are kept.
    const step = real / cap;
    const out = [];
    let realIndex = 0;
    let nextKeep = 0;
    let kept = 0;
    for (let i = 0; i < src.length && kept < cap; i += 1) {
      const p = src[i];
      if (!p) {
        if (out.length && out[out.length - 1] !== null) {
          out.push(null);
        }
        continue;
      }
      if (realIndex + 1e-6 >= nextKeep) {
        out.push(p);
        kept += 1;
        nextKeep += step;
      }
      realIndex += 1;
    }
    // Always keep last real point of source
    const last = [...src].reverse().find((p) => p);
    if (last && (out.length === 0 || out[out.length - 1] !== last)) {
      if (out.length && out[out.length - 1] === null) {
        out.pop();
      }
      out.push(last);
    }
    return out;
  }

  /** Suggest max control points from face area. */
  function pointBudget(faceWidth, faceHeight, userBudget) {
    const area = Math.max(1, (Number(faceWidth) || 1) * (Number(faceHeight) || 1));
    const auto = Math.max(256, Math.min(4096, Math.floor(Math.sqrt(area) * 8)));
    const user = Math.floor(Number(userBudget) || 0);
    if (user >= 1) {
      return Math.max(1, Math.min(8192, user));
    }
    return auto;
  }

  function parseRgb01(colorOrRgb, fallback = [1, 0, 0]) {
    if (Array.isArray(colorOrRgb) && colorOrRgb.length >= 3) {
      const a = Number(colorOrRgb[0]);
      const b = Number(colorOrRgb[1]);
      const c = Number(colorOrRgb[2]);
      if (a > 1 || b > 1 || c > 1) {
        return [
          clamp01(a / 255, fallback[0]),
          clamp01(b / 255, fallback[1]),
          clamp01(c / 255, fallback[2]),
        ];
      }
      return [clamp01(a, fallback[0]), clamp01(b, fallback[1]), clamp01(c, fallback[2])];
    }
    const hex = String(colorOrRgb || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ];
    }
    return fallback.slice();
  }

  /**
   * Meet color for combine mode.
   *
   * Base (classic): C_M = max(0, 1 − C_L − C_R) per channel
   *   → red + blue = green, yellow + cyan = blue, etc.
   *
   * When the complement collapses (e.g. white + blue → black), a hard
   * white fallback used to pop in only at pure white — near-white still
   * painted a black meet stroke. Soft-mix toward screen(C_L, C_R) so the
   * meet never jumps black→white and stays bright when channels cover RGB.
   */
  function meetColorFromPair(leftRgb01, rightRgb01) {
    const cL = parseRgb01(leftRgb01, [1, 0, 0]);
    const cR = parseRgb01(rightRgb01, [0, 0, 1]);
    const comp = [
      Math.max(0, 1 - cL[0] - cR[0]),
      Math.max(0, 1 - cL[1] - cR[1]),
      Math.max(0, 1 - cL[2] - cR[2]),
    ];
    // Screen of the pair — bright continuous fallback when complement is dark.
    const scr = [
      1 - (1 - cL[0]) * (1 - cR[0]),
      1 - (1 - cL[1]) * (1 - cR[1]),
      1 - (1 - cL[2]) * (1 - cR[2]),
    ];
    const luma = 0.2126 * comp[0] + 0.7152 * comp[1] + 0.0722 * comp[2];
    // Keep full classic complement until it dims; ease to screen below ~0.22 luma.
    const T = 0.22;
    let w = luma <= 0 ? 0 : luma >= T ? 1 : luma / T;
    w = w * w * (3 - 2 * w); // smoothstep
    return [
      clamp01(comp[0] * w + scr[0] * (1 - w), 0),
      clamp01(comp[1] * w + scr[1] * (1 - w), 0),
      clamp01(comp[2] * w + scr[2] * (1 - w), 0),
    ];
  }

  const STEREO_BLEND_MODES = Object.freeze([
    "combine",
    "lighter",
    "screen",
    "source-over",
    "multiply",
    "difference",
    "exclusion",
    "xor",
  ]);

  function normalizeStereoBlend(mode) {
    const m = String(mode || "combine").toLowerCase().trim();
    return STEREO_BLEND_MODES.includes(m) ? m : "combine";
  }

  /**
   * Output stereo dual-trace.
   *
   * blend "combine" (default / Meet UI):
   *   m = min(L, R)
   *   pixel = (L-m)·C_left + (R-m)·C_right + m·C_meet
   * With C_left=red, C_right=blue, C_meet=green this is the original R/B→G.
   * C_meet defaults to max(0, 1-C_L-C_R) per channel (complement).
   * Caller fills plate under transparent holes (destination-over).
   *
   * Other blends: draw Left then Right with that Canvas composite mode
   * (plate must already be filled by the caller).
   * Trace blur is ignored (always hard stroke).
   */
  function drawStereo(destCtx, leftPoints, rightPoints, leftOptions = {}, rightOptions = {}, stereo = {}) {
    if (!destCtx?.canvas) {
      return 0;
    }
    const blend = normalizeStereoBlend(stereo.blend);
    const faceFromOpts = Math.max(
      1,
      Number(leftOptions.faceMinSide) || Number(rightOptions.faceMinSide) || 0,
    );
    const face = faceFromOpts > 1
      ? faceFromOpts
      : Math.min(
        Math.max(1, destCtx.canvas.width),
        Math.max(1, destCtx.canvas.height),
      );

    // Standard canvas blend modes: sequential strokes, user colors.
    if (blend !== "combine") {
      const leftCount = draw(destCtx, leftPoints, {
        ...leftOptions,
        faceMinSide: face,
        composite: blend === "source-over" ? "source-over" : blend,
      });
      const rightCount = draw(destCtx, rightPoints, {
        ...rightOptions,
        faceMinSide: face,
        composite: blend === "source-over" ? "source-over" : blend,
      });
      return leftCount + rightCount;
    }

    // --- combine equation (mask + recolor) ---
    const canvas = destCtx.canvas;
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    if (!canvas._traceStereoScratchL) {
      canvas._traceStereoScratchL = document.createElement("canvas");
      canvas._traceStereoScratchR = document.createElement("canvas");
    }
    const leftCanvas = canvas._traceStereoScratchL;
    const rightCanvas = canvas._traceStereoScratchR;
    if (leftCanvas.width !== w || leftCanvas.height !== h) {
      leftCanvas.width = w;
      leftCanvas.height = h;
    }
    if (rightCanvas.width !== w || rightCanvas.height !== h) {
      rightCanvas.width = w;
      rightCanvas.height = h;
    }
    const leftCtx = leftCanvas.getContext("2d", { willReadFrequently: true });
    const rightCtx = rightCanvas.getContext("2d", { willReadFrequently: true });
    if (!leftCtx || !rightCtx) {
      return 0;
    }

    leftCtx.setTransform(1, 0, 0, 1, 0, 0);
    rightCtx.setTransform(1, 0, 0, 1, 0, 0);
    leftCtx.clearRect(0, 0, w, h);
    rightCtx.clearRect(0, 0, w, h);
    // Transparent masks (not opaque black). Black fill + putImageData made a
    // halo around every scroll stamp. Classic Meet: hard white ink, blur off.
    const cap = stereo.lineCap === "butt" ? "butt" : "round";
    const leftCount = draw(leftCtx, leftPoints, {
      ...leftOptions,
      blur: 0,
      brightness: 1,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "source-over",
      lineCap: cap,
    });
    const rightCount = draw(rightCtx, rightPoints, {
      ...rightOptions,
      blur: 0,
      brightness: 1,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "source-over",
      lineCap: cap,
    });

    const gainL = clamp01(leftOptions.brightness, 1);
    const gainR = clamp01(rightOptions.brightness, 1);
    const cLraw = parseRgb01(stereo.leftColor ?? leftOptions.color ?? leftOptions.rgb, [1, 0, 0]);
    const cRraw = parseRgb01(stereo.rightColor ?? rightOptions.color ?? rightOptions.rgb, [0, 0, 1]);
    const cL = [cLraw[0] * gainL, cLraw[1] * gainL, cLraw[2] * gainL];
    const cR = [cRraw[0] * gainR, cRraw[1] * gainR, cRraw[2] * gainR];
    const meetGain = Math.max(gainL, gainR);
    const cMraw = stereo.meetColor != null && stereo.meetColor !== "" && stereo.meetColor !== "auto"
      ? parseRgb01(stereo.meetColor, meetColorFromPair(cLraw, cRraw))
      : meetColorFromPair(cLraw, cRraw);
    const cM = [cMraw[0] * meetGain, cMraw[1] * meetGain, cMraw[2] * meetGain];

    const leftData = leftCtx.getImageData(0, 0, w, h);
    const rightData = rightCtx.getImageData(0, 0, w, h);
    const out = destCtx.createImageData(w, h);
    const ld = leftData.data;
    const rd = rightData.data;
    const od = out.data;
    for (let i = 0; i < od.length; i += 4) {
      const L = Math.max(ld[i], ld[i + 1], ld[i + 2]) / 255;
      const Rch = Math.max(rd[i], rd[i + 1], rd[i + 2]) / 255;
      const m = L < Rch ? L : Rch;
      const leftOnly = L - m;
      const rightOnly = Rch - m;
      od[i] = Math.round(Math.min(1, leftOnly * cL[0] + rightOnly * cR[0] + m * cM[0]) * 255);
      od[i + 1] = Math.round(Math.min(1, leftOnly * cL[1] + rightOnly * cR[1] + m * cM[1]) * 255);
      od[i + 2] = Math.round(Math.min(1, leftOnly * cL[2] + rightOnly * cR[2] + m * cM[2]) * 255);
      od[i + 3] = Math.round(Math.min(1, Math.max(L, Rch)) * 255);
    }
    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.globalCompositeOperation = "source-over";
    destCtx.putImageData(out, 0, 0);
    destCtx.restore();
    return leftCount + rightCount;
  }

  // Back-compat alias
  function drawStereoRedBlueGreen(destCtx, leftPoints, rightPoints, leftOptions, rightOptions) {
    return drawStereo(destCtx, leftPoints, rightPoints, leftOptions, rightOptions, {
      blend: "combine",
      leftColor: [1, 0, 0],
      rightColor: [0, 0, 1],
      meetColor: "auto",
    });
  }

  global.TraceStroke = {
    clamp01,
    normalizeBlur,
    fadeWeight,
    diameterPx,
    radiusPx,
    edgeProfile,
    draw,
    drawStereo,
    drawStereoRedBlueGreen,
    normalizeStereoBlend,
    STEREO_BLEND_MODES,
    meetColorFromPair,
    parseRgb01,
    budgetPoints,
    pointBudget,
  };
})(typeof window !== "undefined" ? window : globalThis);
