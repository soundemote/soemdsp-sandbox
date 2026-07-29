// Canonical phosphor face drawer (mono energy + LUT).
//
// All retained burn scopes should go through this module. It wraps the shared
// WebGL energy device (node-graph-phosphor-energy-gl.js) with settings helpers
// and a single step/present contract.
//
// Blur UX: 0 = hard disc (~1px AA), 1 = full soft gaussian bleed.
//
// Usage:
//   const face = PhosphorDrawer.ensure(canvas, w, h);
//   PhosphorDrawer.setLut(face, peakRgbBytes, "#000000");
//   PhosphorDrawer.stepDots(face, { decay, pathPoints, radius, brightness, blur, maxDots, burn });
//   PhosphorDrawer.presentTo(face, destCtx, { exposure, width, height, smooth: true });

(function initPhosphorDrawer(global) {
  const DEFAULT_BLUR = 0.35;
  const DEFAULT_BURN = 0.82;
  const DEFAULT_DECAY = 0.12;

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Blur 0..1 (hard→soft). Migrates legacy signed -1..1 values.
   */
  function normalizeBlur(value, fallback = DEFAULT_BLUR) {
    if (typeof global.nodeGraphPhosphorEnergyGlNormalizeBlur === "function") {
      return global.nodeGraphPhosphorEnergyGlNormalizeBlur(value, fallback);
    }
    let v = Number(value);
    if (!Number.isFinite(v)) {
      v = Number(fallback);
    }
    if (!Number.isFinite(v)) {
      return DEFAULT_BLUR;
    }
    if (v < 0) {
      v = (Math.max(-1, v) + 1) * 0.5;
    }
    return Math.max(0, Math.min(1, v));
  }

  /** Deposit gain: smooth low end, no dead band near burn 0. */
  function depositGain(burn, brightness, size01) {
    const b = clamp01(burn, 0);
    const br = Math.max(0, Number(brightness) || 0);
    const s = clamp01(size01, 0);
    const burnShape = Math.pow(b, 0.78);
    return Math.max(0, br * (0.022 + burnShape * 0.1) * (1.12 - s * 0.42));
  }

  /** Soft film exposure — mostly stable so burn doesn’t double-crush. */
  function exposure(burn) {
    return 1.85 + clamp01(burn, 0) * 2.1;
  }

  /** Radius in buffer px: size 0–1 of face min side → diameter = size * minSide. */
  function radiusFromSize(faceMinSide, size01) {
    const side = Math.max(1, Number(faceMinSide) || 1);
    const t = clamp01(size01, 0.08);
    return Math.max(0.35, side * t * 0.5);
  }

  function ensure(hostCanvas, width, height, key = "_phosphorEnergyGl") {
    if (typeof global.nodeGraphPhosphorEnergyGlEnsure !== "function") {
      return null;
    }
    return global.nodeGraphPhosphorEnergyGlEnsure(hostCanvas, width, height, key);
  }

  function setLut(face, peakRgbBytes, backgroundHex = "#000000") {
    if (!face || typeof global.nodeGraphPhosphorEnergyGlSetLutFromPeak !== "function") {
      return false;
    }
    global.nodeGraphPhosphorEnergyGlSetLutFromPeak(face, peakRgbBytes, backgroundHex);
    return true;
  }

  /** Multi-stop LUT from shared gradient editor format [{t,color}]. */
  function setLutStops(face, stops) {
    if (!face || typeof global.nodeGraphPhosphorEnergyGlSetLutFromStops !== "function") {
      return false;
    }
    return Boolean(global.nodeGraphPhosphorEnergyGlSetLutFromStops(face, stops));
  }

  /**
   * One frame: fade + optional bleed + soft/hard dots along pathPoints.
   * options.burn is optional convenience for deposit gain when brightness is raw.
   */
  function stepDots(face, options = {}) {
    if (!face || typeof global.nodeGraphPhosphorEnergyGlStepBeams !== "function") {
      return false;
    }
    const blur = normalizeBlur(options.blur, DEFAULT_BLUR);
    const burn = clamp01(options.burn, DEFAULT_BURN);
    const size01 = clamp01(options.size01, 0.08);
    let brightness = Number(options.brightness);
    if (!Number.isFinite(brightness) || options.useBurnGain) {
      brightness = depositGain(
        burn,
        Number.isFinite(Number(options.dotBrightness))
          ? Number(options.dotBrightness)
          : Number(options.brightness) || 0.92,
        size01,
      );
    }
    return global.nodeGraphPhosphorEnergyGlStepBeams(face, {
      decay: clamp01(options.decay, DEFAULT_DECAY),
      pathPoints: options.pathPoints || null,
      vertices: options.vertices || null,
      radius: Math.max(0.35, Number(options.radius) || 2),
      brightness: Math.max(0, brightness || 0),
      blur,
      mode: "dots",
      maxDots: Math.max(64, Math.min(8192, Math.round(Number(options.maxDots) || 2048))),
      bleed: options.bleed,
      fullEconomy: options.fullEconomy === true
        || options.fullDotEconomy === true
        || options.useFullDotEconomy === true,
    });
  }

  function stepFade(face, options = {}) {
    if (!face || typeof global.nodeGraphPhosphorEnergyGlStep !== "function") {
      return false;
    }
    return global.nodeGraphPhosphorEnergyGlStep(face, {
      decay: clamp01(options.decay, DEFAULT_DECAY),
      depositGain: 0,
      maskCanvas: null,
      bleed: Number.isFinite(Number(options.bleed)) ? Number(options.bleed) : 0.1,
    });
  }

  /**
   * Present energy×LUT into dest 2D context (lighter composite).
   */
  function presentTo(face, destCtx, options = {}) {
    if (!face || !destCtx || typeof global.nodeGraphPhosphorEnergyGlPresent !== "function") {
      return false;
    }
    const width = Math.max(1, Number(options.width) || face.width || 1);
    const height = Math.max(1, Number(options.height) || face.height || 1);
    const trailGain = Number.isFinite(Number(options.trailGain))
      ? Number(options.trailGain)
      : 1;
    let exp = Number(options.exposure);
    if (!Number.isFinite(exp) && options.burn !== undefined) {
      exp = exposure(options.burn);
    }
    if (!Number.isFinite(exp)) {
      exp = exposure(DEFAULT_BURN);
    }
    const ok = global.nodeGraphPhosphorEnergyGlPresent(face, trailGain, { exposure: exp });
    if (!ok) {
      return false;
    }
    destCtx.save();
    destCtx.globalCompositeOperation = options.composite || "lighter";
    destCtx.imageSmoothingEnabled = options.smooth !== false;
    destCtx.drawImage(face.canvas, 0, 0, width, height);
    destCtx.restore();
    return true;
  }

  /**
   * Build a vertical stem path (for hypersaw / voice-bank style scopes).
   * Returns [{x,y}, ...] from (x,y0) to (x,y1) with ~spacing steps.
   */
  function verticalStemPoints(x, y0, y1, spacingPx = 2) {
    const points = [];
    const x0 = Number(x);
    const a = Number(y0);
    const b = Number(y1);
    if (!Number.isFinite(x0) || !Number.isFinite(a) || !Number.isFinite(b)) {
      return points;
    }
    const dist = Math.abs(b - a);
    const step = Math.max(0.5, Number(spacingPx) || 2);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      points.push({ x: x0, y: a + (b - a) * t });
    }
    return points;
  }

  /**
   * Append a segment as dense path points (null break between pieces).
   */
  function appendSegment(out, x0, y0, x1, y1, spacingPx = 2) {
    if (!Array.isArray(out)) {
      return out;
    }
    if (out.length && out[out.length - 1] !== null) {
      out.push(null);
    }
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(0.5, Number(spacingPx) || 2);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      out.push({
        x: x0 + (x1 - x0) * t,
        y: y0 + (y1 - y0) * t,
      });
    }
    return out;
  }

  const api = {
    DEFAULT_BLUR,
    DEFAULT_BURN,
    DEFAULT_DECAY,
    clamp01,
    normalizeBlur,
    depositGain,
    exposure,
    radiusFromSize,
    ensure,
    setLut,
    setLutStops,
    stepDots,
    stepFade,
    presentTo,
    verticalStemPoints,
    appendSegment,
  };

  global.PhosphorDrawer = api;
  // Back-compat aliases used by older call sites during migration.
  global.nodeGraphPhosphorDrawer = api;
})(typeof window !== "undefined" ? window : globalThis);
