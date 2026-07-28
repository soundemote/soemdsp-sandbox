// Instant (non-phosphor) trace stroke helpers.
//
// Not burn: no energy FBO, no decay, no bleed. Clear + redraw each frame.
// Softness is a cheap radial profile *inside* the existing line width
// (concentric passes) — never expands the footprint / shadowBlur skirt
// (that got clipped and read as inner glow). Blur 0 = single hard stroke
// (looks great alone); blur 1 = mild edge softening. Size = 0–1 face diameter.

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

  /** Diameter in px from size 0–1 of face min side. */
  function diameterPx(faceMinSide, size01) {
    const side = Math.max(1, Number(faceMinSide) || 1);
    const t = clamp01(size01, 0.08);
    return Math.max(1, side * t);
  }

  /**
   * Soft-edge profile: t in 0..1 from center (0) to outer edge (1).
   * blur 0 → hard disc (1 until edge). blur 1 → smooth cosine falloff.
   * Returns relative opacity weight at radius fraction t.
   */
  function edgeProfile(t, blur01) {
    const soft = clamp01(blur01, 0);
    const x = clamp01(t, 0);
    if (soft < 0.02) {
      return x < 1 ? 1 : 0;
    }
    // Hardness residual: how late the falloff starts (1 = hard edge, 0 = soft from center).
    const hard = 1 - soft;
    const knee = hard * 0.72; // stay bright until near edge when hard
    if (x <= knee) {
      return 1;
    }
    const u = (x - knee) / Math.max(1e-6, 1 - knee); // 0..1 over soft band
    // Smoothstep-ish cosine: continuous derivative, no ring.
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
    if (typeof global.drawNodeGraphScopeCanvasSmoothPath === "function") {
      context.beginPath();
      global.drawNodeGraphScopeCanvasSmoothPath(context, points);
      context.stroke();
      pieces = 1;
      return pieces;
    }
    let drawing = false;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        context.beginPath();
        context.moveTo(p.x, p.y);
        drawing = true;
        pieces += 1;
      } else {
        context.lineTo(p.x, p.y);
      }
      const next = points[i + 1];
      if (!next || !Number.isFinite(next?.x)) {
        context.stroke();
        drawing = false;
      }
    }
    if (drawing) {
      context.stroke();
    }
    return pieces;
  }

  /**
   * Efficient soft-edge stroke *inside* size (no footprint expansion).
   * blur 0 → one solid stroke (the good hard look).
   * blur > 0 → a few concentric passes approximating edgeProfile() falloff.
   * options: { size, blur, brightness, color, faceMinSide, rgb, composite }
   */
  function draw(context, points, options = {}) {
    if (!context || !Array.isArray(points) || !points.length) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || 1);
    const size01 = clamp01(options.size, 0.08);
    const blur = normalizeBlur(options.blur, 0.2);
    const brightness = Math.max(0, Number(options.brightness) || 0);
    if (size01 <= 0 || brightness <= 0) {
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
    const [r, g, b] = rgb;
    const lineWidth = Math.max(1, diameterPx(face, size01));
    const peakAlpha = Math.min(1, brightness);

    const visible = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!visible.length) {
      return 0;
    }

    context.save();
    context.globalCompositeOperation = options.composite || "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowBlur = 0;
    context.shadowColor = "transparent";

    // Hard (or nearly): one stroke — the look that already works.
    if (blur < 0.04) {
      const color = `rgba(${r}, ${g}, ${b}, ${peakAlpha})`;
      context.lineWidth = lineWidth;
      context.strokeStyle = color;
      context.fillStyle = color;
      if (visible.length === 1) {
        context.beginPath();
        context.arc(visible[0].x, visible[0].y, lineWidth * 0.5, 0, Math.PI * 2);
        context.fill();
      } else {
        strokePath(context, points);
      }
      context.restore();
      return visible.length;
    }

    // Soft edge: 3 concentric passes, all widths ≤ lineWidth (no expansion).
    // Outer shell first (wide, dim), then mid, then core — alpha diffs ≈ profile.
    const passes = 3;
    let prevProfile = 0;
    for (let i = 0; i < passes; i += 1) {
      // Radius fraction of this shell (outer → inner): 1, ~0.66, ~0.33
      const tOuter = 1 - i / passes;
      const tInner = 1 - (i + 1) / passes;
      // Shell weight ≈ average profile across the band (center-weighted).
      const pMid = edgeProfile((tOuter + tInner) * 0.5, blur);
      const shell = Math.max(0, pMid - prevProfile * 0.15);
      prevProfile = pMid;
      const widthFrac = Math.max(0.28, tOuter); // stay within full size
      const w = Math.max(1, lineWidth * widthFrac);
      // Mild alpha: keep soft as a cherry, not a fog bank.
      const a = peakAlpha * (0.22 + 0.78 * shell) * (0.55 + 0.45 * (1 - blur * 0.35));
      if (a < 0.01) {
        continue;
      }
      const color = `rgba(${r}, ${g}, ${b}, ${Math.min(1, a)})`;
      context.lineWidth = w;
      context.strokeStyle = color;
      context.fillStyle = color;
      if (visible.length === 1) {
        context.beginPath();
        context.arc(visible[0].x, visible[0].y, w * 0.5, 0, Math.PI * 2);
        context.fill();
      } else {
        strokePath(context, points);
      }
    }

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
    if (user >= 64) {
      return Math.max(64, Math.min(8192, user));
    }
    return auto;
  }

  /**
   * Output stereo: Left / Right as mono masks, then recolor so
   *   left-only  → red
   *   right-only → blue
   *   both (meet) → green
   *
   * Formula per pixel (L,R in 0..1 luminance):
   *   m = min(L, R)
   *   rgb = (L - m, m, R - m)
   * So full L+R → pure green, not additive magenta.
   */
  function drawStereoRedBlueGreen(destCtx, leftPoints, rightPoints, leftOptions = {}, rightOptions = {}) {
    if (!destCtx?.canvas) {
      return 0;
    }
    const canvas = destCtx.canvas;
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    const face = Math.min(w, h);

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
    leftCtx.fillStyle = "#000";
    rightCtx.fillStyle = "#000";
    leftCtx.fillRect(0, 0, w, h);
    rightCtx.fillRect(0, 0, w, h);

    // White mono energy stamps — color is applied only in the combine step.
    const leftCount = draw(leftCtx, leftPoints, {
      ...leftOptions,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "lighter",
    });
    const rightCount = draw(rightCtx, rightPoints, {
      ...rightOptions,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "lighter",
    });

    const leftData = leftCtx.getImageData(0, 0, w, h);
    const rightData = rightCtx.getImageData(0, 0, w, h);
    const out = destCtx.createImageData(w, h);
    const ld = leftData.data;
    const rd = rightData.data;
    const od = out.data;
    for (let i = 0; i < od.length; i += 4) {
      // Luminance from white stamp (any channel; take max for soft skirts).
      const L = Math.max(ld[i], ld[i + 1], ld[i + 2]) / 255;
      const Rch = Math.max(rd[i], rd[i + 1], rd[i + 2]) / 255;
      const m = L < Rch ? L : Rch;
      od[i] = Math.round((L - m) * 255);
      od[i + 1] = Math.round(m * 255);
      od[i + 2] = Math.round((Rch - m) * 255);
      od[i + 3] = Math.round(Math.min(1, Math.max(L, Rch)) * 255);
    }
    destCtx.save();
    destCtx.setTransform(1, 0, 0, 1, 0, 0);
    destCtx.globalCompositeOperation = "source-over";
    destCtx.putImageData(out, 0, 0);
    destCtx.restore();
    return leftCount + rightCount;
  }

  global.TraceStroke = {
    clamp01,
    normalizeBlur,
    diameterPx,
    edgeProfile,
    draw,
    drawStereoRedBlueGreen,
    budgetPoints,
    pointBudget,
  };
})(typeof window !== "undefined" ? window : globalThis);
