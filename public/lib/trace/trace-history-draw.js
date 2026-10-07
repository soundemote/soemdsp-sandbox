// History-plot Trace drawer (Music Player motion, RGB stroke).
// Clear + redraw the last N seconds. No phosphor residual / burn / brightness.
// Color is RGB (solid, stereo pair, or along-path). Blend is canvas composite.

(function initTraceHistoryDraw(global) {
  const BLENDS = Object.freeze([
    "combine",
    "lighter",
    "screen",
    "source-over",
    "multiply",
    "difference",
    "exclusion",
    "xor",
  ]);

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, nodeGraphFiniteNumber(fallback)));
    }
    return Math.max(0, Math.min(1, n));
  }

  function hexToRgb(hex, fallback = [255, 51, 51]) {
    const text = String(hex || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return [
        parseInt(text.slice(1, 3), 16),
        parseInt(text.slice(3, 5), 16),
        parseInt(text.slice(5, 7), 16),
      ];
    }
    return fallback.slice();
  }

  function rgbCss(rgb, alpha = 1) {
    const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
    const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
    const b = Math.max(0, Math.min(255, Math.round(rgb[2])));
    const a = clamp01(alpha, 1);
    return a >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function normalizeBlend(value, fallback = "source-over") {
    const raw = String(value || "").toLowerCase().trim();
    if (raw === "add") {
      return "lighter";
    }
    if (raw === "over") {
      return "source-over";
    }
    if (BLENDS.includes(raw)) {
      return raw;
    }
    return fallback;
  }

  function thinPoints(points, budget) {
    if (!Array.isArray(points) || !points.length) {
      return [];
    }
    const valid = [];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        valid.push(p);
      }
    }
    const cap = Math.max(8, Math.round(nodeGraphFiniteNumber(budget, 2048)));
    if (valid.length <= cap) {
      return valid;
    }
    const out = [];
    const step = (valid.length - 1) / Math.max(1, cap - 1);
    for (let i = 0; i < cap; i += 1) {
      out.push(valid[Math.min(valid.length - 1, Math.round(i * step))]);
    }
    return out;
  }

  function faceMinSide(canvas) {
    return Math.max(1, Math.min(nodeGraphFiniteNumber(canvas?.width, 1), nodeGraphFiniteNumber(canvas?.height, 1)));
  }

  function strokeSolid(context, points, options = {}) {
    if (!context || !points?.length) {
      return 0;
    }
    const face = Math.max(1, nodeGraphFiniteNumber(options.faceMinSide, 1));
    const size01 = clampAuthoredInkPx(options.size, 2);
    const blur = clamp01(options.blur, 0);
    const brightness = clamp01(options.brightness, 1);
    const color = options.color || "#ff3333";
    const blend = normalizeBlend(options.blend, "source-over");
    const budget = Math.max(8, Math.round(nodeGraphFiniteNumber(options.dotBudget, 2048)));
    const thinned = thinPoints(points, budget);
    const asDots = points.filter((p) => p && Number.isFinite(p.x)).length > budget;
    const fade = clamp01(options.fade, 0);
    if (typeof global.TraceStroke !== "undefined" && global.TraceStroke.draw) {
      return global.TraceStroke.draw(context, asDots ? thinned : points, {
        size: size01,
        blur,
        brightness,
        fade,
        color,
        faceMinSide: face,
        composite: blend === "combine" ? "source-over" : blend,
        lineCap: options.lineCap,
      });
    }
    context.save();
    context.globalCompositeOperation = blend === "combine" ? "source-over" : blend;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = typeof global.TraceStroke?.diameterPx === "function"
      ? global.TraceStroke.diameterPx(face, size01)
      : size01;
    if (!(context.lineWidth > 0)) {
      context.restore();
      return 0;
    }
    context.lineCap = options.lineCap === "butt" ? "butt" : "round";
    context.lineJoin = options.lineCap === "butt" ? "miter" : "round";
    if (asDots || thinned.length < 2) {
      const r = context.lineWidth * 0.5;
      for (const p of thinned) {
        context.beginPath();
        context.arc(p.x, p.y, r, 0, Math.PI * 2);
        context.fill();
      }
    } else if (typeof global.TraceStroke !== "undefined" && global.TraceStroke.draw) {
      global.TraceStroke.draw(context, points, {
        size: size01,
        blur,
        brightness,
        fade,
        color,
        faceMinSide: face,
        composite: context.globalCompositeOperation,
        lineCap: options.lineCap,
      });
    } else {
      context.beginPath();
      context.moveTo(thinned[0].x, thinned[0].y);
      for (let i = 1; i < thinned.length; i += 1) {
        context.lineTo(thinned[i].x, thinned[i].y);
      }
      context.stroke();
    }
    context.restore();
    return thinned.length;
  }

  function strokeGradient(context, points, options = {}) {
    if (!context || !points?.length) {
      return 0;
    }
    const face = Math.max(1, nodeGraphFiniteNumber(options.faceMinSide, 1));
    const size01 = clampAuthoredInkPx(options.size, 2);
    const blur = clamp01(options.blur, 0);
    const blend = normalizeBlend(options.blend, "source-over");
    const budget = Math.max(8, Math.round(nodeGraphFiniteNumber(options.dotBudget, 2048)));
    const thinned = thinPoints(points, budget);
    if (thinned.length < 2) {
      return strokeSolid(context, thinned, { ...options, color: options.colorB || options.colorA || "#d8f4ff" });
    }
    const sample = typeof options.sampleRgb === "function"
      ? options.sampleRgb
      : (t) => {
        const a = hexToRgb(options.colorA || "#143048");
        const b = hexToRgb(options.colorB || "#d8f4ff");
        return [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
      };
    const widthPx = typeof global.TraceStroke?.diameterPx === "function"
      ? global.TraceStroke.diameterPx(face, size01)
      : size01;
    if (!(widthPx > 0)) {
      return 0;
    }
    const last = thinned.length - 1;
    const fade = clamp01(options.fade, 0);
    context.save();
    context.globalCompositeOperation = blend === "combine" ? "source-over" : blend;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = widthPx;
    context.shadowBlur = blur > 0.04 ? widthPx * blur * 1.4 : 0;
    for (let i = 1; i <= last; i += 1) {
      const prev = thinned[i - 1];
      const p = thinned[i];
      const t = last > 0 ? i / last : 1;
      const rgb = sample(t);
      const a = fade <= 0.001 ? 1 : (1 - fade) + fade * t;
      const css = rgbCss(rgb, a);
      context.strokeStyle = css;
      context.shadowColor = blur > 0.04 ? css : "transparent";
      context.beginPath();
      context.moveTo(prev.x, prev.y);
      context.lineTo(p.x, p.y);
      context.stroke();
    }
    context.restore();
    return thinned.length;
  }

  global.TraceHistoryDraw = {
    BLENDS,
    clamp01,
    hexToRgb,
    rgbCss,
    normalizeBlend,
    thinPoints,
    faceMinSide,
    strokeSolid,
    strokeGradient,
  };
})(typeof window !== "undefined" ? window : globalThis);
