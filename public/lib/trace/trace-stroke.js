// Instant (non-phosphor) TRACE stroke helpers — VECTOR philosophy.
//
// TRACE ≠ PHOSPHOR:
//   • Trace: continuous polyline in face space (layout×dpr). No pixel density.
//   • Phosphor: energy deposits on a density-scaled pixel grid.
// Do not add strip-chart scroll or density knobs here — that drifts concepts.
//
// Not burn: no energy FBO, no decay, no bleed. Clear + redraw each frame.
// Hard stroke by default (blur ignored on stereo; mono paths force blur 0).
// Size = 0–1 face diameter.

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
   * VECTOR polyline stroke (not a pixel/energy stamp).
   * blur 0 → one solid stroke (default Trace UX).
   * options: { size, blur, brightness, color, faceMinSide, rgb, composite }
   * Prefer composite "source-over" + opaque ink for clean vector combines.
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
    // Brightness scales RGB (opaque stroke) — not alpha stacks / lighter glow.
    const gain = Math.min(1, brightness);
    const r = Math.round(rgb[0] * gain);
    const g = Math.round(rgb[1] * gain);
    const b = Math.round(rgb[2] * gain);
    const lineWidth = Math.max(1, diameterPx(face, size01));
    const peakAlpha = 1;

    const visible = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!visible.length) {
      return 0;
    }

    context.save();
    // Vector default: source-over, opaque, GPU antialias (not pixel stamps).
    context.globalCompositeOperation = options.composite || "source-over";
    context.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in context) {
      context.imageSmoothingQuality = "high";
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.shadowBlur = 0;
    context.shadowColor = "transparent";

    // Hard (or nearly): one solid stroke.
    if (blur < 0.04) {
      const color = `rgb(${r}, ${g}, ${b})`;
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

    // Soft edge: concentric strokes, all widths ≤ lineWidth (no expansion).
    // With additive "lighter", intensity at radius fraction t is the sum of
    // alphas of every stroke whose widthFrac >= t. Invert the profile so the
    // visible falloff actually matches edgeProfile() instead of fudging shells.
    //
    //   I(t_k) = Σ_{j: w_j >= t_k} a_j  =  peak * edgeProfile(t_k)
    //   → a_k = I(t_k) - I(t_{k+1})   with t sorted outer→inner (1 → 0)
    const passes = 4;
    // Outer → inner radius fractions (must be strictly decreasing).
    const radii = [];
    for (let i = 0; i < passes; i += 1) {
      radii.push(1 - i / passes); // 1, 0.75, 0.5, 0.25
    }
    // Sample profile just inside each shell outer edge.
    const I = radii.map((t) => peakAlpha * edgeProfile(Math.min(0.999, t * 0.98), blur));
    for (let i = 0; i < passes; i += 1) {
      const nextI = i + 1 < passes ? I[i + 1] : 0;
      const a = Math.max(0, I[i] - nextI);
      if (a < 0.008) {
        continue;
      }
      const w = Math.max(1, lineWidth * radii[i]);
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
    const face = Math.min(
      Math.max(1, destCtx.canvas.width),
      Math.max(1, destCtx.canvas.height),
    );

    // Standard canvas blend modes: sequential hard strokes, user colors.
    if (blend !== "combine") {
      const leftCount = draw(destCtx, leftPoints, {
        ...leftOptions,
        blur: 0,
        faceMinSide: face,
        composite: blend === "source-over" ? "source-over" : blend,
      });
      const rightCount = draw(destCtx, rightPoints, {
        ...rightOptions,
        blur: 0,
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
    leftCtx.fillStyle = "#000";
    rightCtx.fillStyle = "#000";
    leftCtx.fillRect(0, 0, w, h);
    rightCtx.fillRect(0, 0, w, h);

    const leftCount = draw(leftCtx, leftPoints, {
      ...leftOptions,
      blur: 0,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "lighter",
    });
    const rightCount = draw(rightCtx, rightPoints, {
      ...rightOptions,
      blur: 0,
      color: "#ffffff",
      rgb: [255, 255, 255],
      faceMinSide: face,
      composite: "lighter",
    });

    const cL = parseRgb01(stereo.leftColor ?? leftOptions.color ?? leftOptions.rgb, [1, 0, 0]);
    const cR = parseRgb01(stereo.rightColor ?? rightOptions.color ?? rightOptions.rgb, [0, 0, 1]);
    const cM = stereo.meetColor != null && stereo.meetColor !== "" && stereo.meetColor !== "auto"
      ? parseRgb01(stereo.meetColor, meetColorFromPair(cL, cR))
      : meetColorFromPair(cL, cR);

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
    diameterPx,
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
