// Instant (non-phosphor) trace stroke helpers.
//
// Not burn: no energy FBO, no decay, no bleed. Clear + redraw each frame.
// Blur UX matches burn stamps: 0 = hard edge, 1 = soft outer skirt.
// Size is 0–1 of face min side (diameter).

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
   * Hard-core + soft-skirt instant stroke (no persistence).
   * options: { size, blur, brightness, color, faceMinSide, rgb }
   * color: #rrggbb; or pass rgb: [r,g,b] 0–255
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
    const diameter = diameterPx(face, size01);
    const coreWidth = Math.max(1, diameter);
    // Soft skirt only grows with blur — hard end stays a clean stroke.
    const skirtWidth = coreWidth * (1 + blur * 2.8);
    const coreAlpha = Math.min(1, brightness);
    const skirtAlpha = Math.min(1, brightness * (0.12 + blur * 0.38));

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

    if (visible.length === 1) {
      const p = visible[0];
      if (blur > 0.02 && skirtAlpha > 0.01) {
        context.beginPath();
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${skirtAlpha})`;
        context.arc(p.x, p.y, skirtWidth * 0.5, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${coreAlpha})`;
      context.arc(p.x, p.y, coreWidth * 0.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return 1;
    }

    // Soft outer skirt (skip when nearly hard — cheaper + cleaner).
    if (blur > 0.02 && skirtAlpha > 0.01 && skirtWidth > coreWidth + 0.25) {
      context.lineWidth = skirtWidth;
      context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${skirtAlpha})`;
      strokePath(context, points);
    }

    // Hard-ish core
    context.lineWidth = coreWidth;
    context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${coreAlpha})`;
    strokePath(context, points);

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

  global.TraceStroke = {
    clamp01,
    normalizeBlur,
    diameterPx,
    draw,
    budgetPoints,
    pointBudget,
  };
})(typeof window !== "undefined" ? window : globalThis);
