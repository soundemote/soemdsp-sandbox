// Instant (non-phosphor) trace stroke helpers.
//
// Not burn: no energy FBO, no decay, no bleed. Clear + redraw each frame.
// Softness is Canvas shadowBlur (ch4os soft-brush style): one solid stroke
// with a continuous outer falloff — not a dual core+skirt pass (that ringed).
// Blur 0 = hard, 1 = very soft. Size is 0–1 of face min side (diameter).

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
   * Continuous soft stroke via Canvas shadowBlur (ch4os paint soft-brush style).
   * One solid path + matching soft outer falloff — no dual core/skirt pass
   * (that read as a hard ring between blur and non-blur).
   *
   * blur 0 → hard (shadowBlur 0), blur 1 → very soft wide falloff.
   * options: { size, blur, brightness, color, faceMinSide, rgb, composite }
   */
  function softnessBlurPx(diameter, blur01) {
    const soft = clamp01(blur01, 0);
    if (soft < 0.01) {
      return 0;
    }
    // Map like ch4os hardness→blur: size * (1-hardness) * k, with blur = 1-hardness.
    // Slightly stronger than paint (×1.15) so scope traces read soft at mid blur.
    return Math.max(0, diameter * soft * 1.15);
  }

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
    const lineWidth = Math.max(1, diameter);
    const alpha = Math.min(1, brightness);
    const color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const shadowPx = softnessBlurPx(lineWidth, blur);

    const visible = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!visible.length) {
      return 0;
    }

    context.save();
    context.globalCompositeOperation = options.composite || "lighter";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.fillStyle = color;
    // Solid shape + soft shadow falloff (same continuous soft brush as ch4os).
    if (shadowPx > 0) {
      context.shadowColor = color;
      context.shadowBlur = shadowPx;
    } else {
      context.shadowBlur = 0;
      context.shadowColor = "transparent";
    }

    if (visible.length === 1) {
      const p = visible[0];
      context.beginPath();
      context.arc(p.x, p.y, lineWidth * 0.5, 0, Math.PI * 2);
      context.fill();
    } else {
      strokePath(context, points);
    }

    context.shadowBlur = 0;
    context.shadowColor = "transparent";
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
    draw,
    drawStereoRedBlueGreen,
    budgetPoints,
    pointBudget,
  };
})(typeof window !== "undefined" ? window : globalThis);
