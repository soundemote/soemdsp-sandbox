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

  /**
   * Peak stamp energy from Bright (and Size).
   *
   * Residual model (phosphor-residual.js):
   *   Bright → peak deposit / present light
   *   Trail  → hot residual length (1 ≈ freeze)
   *   Ghost  → dim scorched floor hang — NOT deposit
   *
   * Call forms:
   *   depositGain(brightness, size01)
   *   depositGain(ignoredBurn, brightness, size01)  // legacy; burn ignored
   *
   * Ghost must never starve Bright: Bright 1 deposits a solid tip that
   * accumulates to full film white under Trail≈1 as hits stack.
   */
  function depositGain(a, b, c) {
    let brightness;
    let size01;
    if (arguments.length >= 3 && c !== undefined) {
      // Legacy (burn, brightness, size01) — Ghost/burn is residual, not ink.
      brightness = b;
      size01 = c;
    } else {
      brightness = a;
      size01 = b;
    }
    const br = Math.max(0, Number(brightness) || 0);
    if (br <= 1e-8) {
      return 0;
    }
    const s = clamp01(size01, 0);
    // 1px stamps (size 0) need slightly more ink to read; large discs a touch less.
    const sizeFactor = 1.12 - s * 0.32;
    // Soft low end so Bright 0.05 still ticks; Bright 1 ≈ solid tip.
    const shape = Math.pow(Math.min(br, 2), 0.88);
    // ~0.48 at Bright 1 / Size 0 — first hit clearly visible; a few revisits → white.
    return Math.max(0, shape * 0.48 * sizeFactor);
  }

  /**
   * Soft film exposure for present — driven by Bright (peak light), not Ghost.
   * Bright 0 stays dim-readable; Bright 1 opens the film so freeze-collect can white.
   */
  function exposure(bright01) {
    return 1.55 + clamp01(bright01, 0) * 2.55;
  }

  // Size 0–1 linear diameter map: diameter = size * faceMinSide.
  // Floor: size 0 → 1 buffer pixel (radius 0.5). Soft blur still AA's the edge.
  const MIN_DIAMETER_PX = 1;
  const MIN_RADIUS_PX = MIN_DIAMETER_PX * 0.5;

  /** Diameter in buffer px: size 0–1 of face min side (1px floor at size 0). */
  function diameterFromSize(faceMinSide, size01) {
    const side = Math.max(1, Number(faceMinSide) || 1);
    const t = clamp01(size01, 0);
    return Math.max(MIN_DIAMETER_PX, side * t);
  }

  /** Radius in buffer px: half of diameterFromSize (0.5px floor at size 0). */
  function radiusFromSize(faceMinSide, size01) {
    return Math.max(MIN_RADIUS_PX, diameterFromSize(faceMinSide, size01) * 0.5);
  }

  // Canonical names used across paint-helpers / TraceStroke.
  const size01ToDiameterPx = diameterFromSize;
  const size01ToRadiusPx = radiusFromSize;

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
   * Deposit from Bright (options.brightness or options.dotBrightness).
   * Trail/Ghost residual via options.trail / options.ghost (or decay legacy).
   */
  function stepDots(face, options = {}) {
    if (!face || typeof global.nodeGraphPhosphorEnergyGlStepBeams !== "function") {
      return false;
    }
    const blur = normalizeBlur(options.blur, DEFAULT_BLUR);
    const size01 = clamp01(options.size01, 0.08);
    let brightness = Number(options.brightness);
    // If caller passed raw Bright (useDepositGain / missing pre-shaped gain), map it.
    if (!Number.isFinite(brightness) || options.useDepositGain || options.useBurnGain) {
      const rawBright = Number.isFinite(Number(options.dotBrightness))
        ? Number(options.dotBrightness)
        : (Number.isFinite(Number(options.brightness)) ? Number(options.brightness) : 0.92);
      brightness = depositGain(rawBright, size01);
    }
    const radiusRaw = Number(options.radius);
    const radius = Number.isFinite(radiusRaw) && radiusRaw > 0
      ? Math.max(MIN_RADIUS_PX, radiusRaw)
      : (Number.isFinite(Number(options.size01))
        ? radiusFromSize(Math.max(1, Number(options.faceMinSide) || 256), size01)
        : Math.max(MIN_RADIUS_PX, 2));
    // Site path: always dots for soft circular hits (segments only if forced).
    const mode = String(options.mode || "dots").toLowerCase() === "segments"
      ? "segments"
      : "dots";
    // Hard stamps freeze crisp — never invent thrifty seepage.
    let bleed = options.bleed;
    if (bleed === undefined && blur <= 0.001) {
      bleed = 0;
    }
    return global.nodeGraphPhosphorEnergyGlStepBeams(face, {
      decay: options.decay != null ? clamp01(options.decay, DEFAULT_DECAY) : undefined,
      trail: options.trail,
      ghost: options.ghost,
      pathPoints: options.pathPoints || null,
      vertices: options.vertices || null,
      radius: Math.max(0.35, radius),
      brightness: Math.max(0, brightness || 0),
      blur,
      mode,
      maxDots: Math.max(64, Math.min(8192, Math.round(Number(options.maxDots) || 2048))),
      bleed,
      fullEconomy: options.fullEconomy === true
        || options.fullDotEconomy === true
        || options.useFullDotEconomy === true
        || options.fullEconomy === 1
        || options.fullDotEconomy === 1,
      fullDotEconomy: options.fullDotEconomy === true
        || options.fullEconomy === true
        || options.useFullDotEconomy === true,
      dotsOnly: options.dotsOnly === true || options.verticesOnly === true,
      verticesOnly: options.dotsOnly === true || options.verticesOnly === true,
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
   * Present energy×LUT into dest 2D context.
   * Default composite is source-over: mono energy is already additive; the LUT
   * paints face color (any gradient, including white→black). "lighter" would
   * only add RGB and make dark peaks invisible.
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
    destCtx.globalCompositeOperation = options.composite || "source-over";
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
    MIN_DIAMETER_PX,
    MIN_RADIUS_PX,
    clamp01,
    normalizeBlur,
    depositGain,
    exposure,
    diameterFromSize,
    radiusFromSize,
    size01ToDiameterPx,
    size01ToRadiusPx,
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
