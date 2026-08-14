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
      return Math.max(0, Math.min(1, Number(fallback) || 0));
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
    const cap = Math.max(8, Math.round(Number(budget) || 2048));
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
    return Math.max(1, Math.min(Number(canvas?.width) || 1, Number(canvas?.height) || 1));
  }

  function strokeSolid(context, points, options = {}) {
    if (!context || !points?.length) {
      return 0;
    }
    const face = Math.max(1, Number(options.faceMinSide) || 1);
    const size01 = clamp01(options.size, 0.035);
    const blur = clamp01(options.blur, 0);
    const color = options.color || "#ff3333";
    const blend = normalizeBlend(options.blend, "source-over");
    const budget = Math.max(8, Math.round(Number(options.dotBudget) || 2048));
    const thinned = thinPoints(points, budget);
    const asDots = points.filter((p) => p && Number.isFinite(p.x)).length > budget;
    if (typeof global.TraceStroke !== "undefined" && global.TraceStroke.draw) {
      return global.TraceStroke.draw(context, asDots ? thinned : points, {
        size: size01,
        blur,
        brightness: 1,
        color,
        faceMinSide: face,
        composite: blend === "combine" ? "source-over" : blend,
      });
    }
    context.save();
    context.globalCompositeOperation = blend === "combine" ? "source-over" : blend;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.max(1, face * size01);
    context.lineCap = "round";
    context.lineJoin = "round";
    if (asDots || thinned.length < 2) {
      const r = Math.max(0.5, context.lineWidth * 0.5);
      for (const p of thinned) {
        context.beginPath();
        context.arc(p.x, p.y, r, 0, Math.PI * 2);
        context.fill();
      }
    } else if (typeof global.TraceStroke !== "undefined" && global.TraceStroke.draw) {
      global.TraceStroke.draw(context, points, {
        size: size01,
        blur,
        brightness: 1,
        color,
        faceMinSide: face,
        composite: context.globalCompositeOperation,
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
    const face = Math.max(1, Number(options.faceMinSide) || 1);
    const size01 = clamp01(options.size, 0.06);
    const blur = clamp01(options.blur, 0);
    const blend = normalizeBlend(options.blend, "source-over");
    const budget = Math.max(8, Math.round(Number(options.dotBudget) || 2048));
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
      : Math.max(1, face * size01);
    const last = thinned.length - 1;
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
      const css = rgbCss(rgb);
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

  /**
   * Two-color history strokes (Output / stereo Trace).
   * Meet (combine) uses TraceStroke.drawStereo when present.
   * Deposit is always full (brightness 1).
   */
  function strokeStereo(context, leftPoints, rightPoints, leftOptions = {}, rightOptions = {}, stereo = {}) {
    if (!context) {
      return 0;
    }
    const blend = normalizeBlend(stereo.blend, "combine");
    const face = Math.max(1, Number(leftOptions.faceMinSide || rightOptions.faceMinSide) || 1);
    const left = {
      size: leftOptions.size,
      blur: leftOptions.blur,
      brightness: 1,
      color: leftOptions.color || "#ff0000",
      faceMinSide: face,
    };
    const right = {
      size: rightOptions.size,
      blur: rightOptions.blur,
      brightness: 1,
      color: rightOptions.color || "#0000ff",
      faceMinSide: face,
    };
    if (typeof global.TraceStroke !== "undefined" && typeof global.TraceStroke.drawStereo === "function") {
      return global.TraceStroke.drawStereo(
        context,
        leftPoints,
        rightPoints,
        left,
        right,
        {
          blend,
          leftColor: left.color,
          rightColor: right.color,
          meetColor: stereo.meetColor || "auto",
        },
      );
    }
    const composite = blend === "combine" ? "lighter" : blend;
    const a = strokeSolid(context, leftPoints, { ...left, blend: composite, dotBudget: leftOptions.dotBudget });
    const b = strokeSolid(context, rightPoints, { ...right, blend: composite, dotBudget: rightOptions.dotBudget });
    return a + b;
  }

  /**
   * N colored history strokes. Two-layer Meet uses strokeStereo.
   * Three-or-more + combine uses additive (lighter) so R+G+B can mix to white.
   */
  function strokeLayers(context, layers, options = {}) {
    if (!context || !Array.isArray(layers) || !layers.length) {
      return 0;
    }
    const enabled = layers.filter((layer) => layer && layer.enabled !== false && Array.isArray(layer.points));
    if (!enabled.length) {
      return 0;
    }
    const blend = normalizeBlend(options.blend, "source-over");
    if (enabled.length === 2) {
      return strokeStereo(
        context,
        enabled[0].points,
        enabled[1].points,
        {
          size: enabled[0].size ?? options.size,
          blur: enabled[0].blur ?? options.blur,
          color: enabled[0].color,
          faceMinSide: options.faceMinSide,
          dotBudget: options.dotBudget,
        },
        {
          size: enabled[1].size ?? options.size,
          blur: enabled[1].blur ?? options.blur,
          color: enabled[1].color,
          faceMinSide: options.faceMinSide,
          dotBudget: options.dotBudget,
        },
        { blend, meetColor: options.meetColor || "auto" },
      );
    }
    const composite = blend === "combine" ? "lighter" : blend;
    let painted = 0;
    for (const layer of enabled) {
      painted += strokeSolid(context, layer.points, {
        size: layer.size ?? options.size,
        blur: layer.blur ?? options.blur,
        color: layer.color,
        blend: composite,
        dotBudget: options.dotBudget,
        faceMinSide: options.faceMinSide,
      });
    }
    return painted;
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
    strokeStereo,
    strokeLayers,
  };
})(typeof window !== "undefined" ? window : globalThis);
