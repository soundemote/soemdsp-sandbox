// Shared Gaussian beam stamps for fixed-grid phosphor faces.
//
// With layout-stable face backing (clientWidth × dpr × density), beam radius in
// buffer pixels is stable under workspace zoom. A true exp(-r²/2σ²) kernel is
// baked once into a small texture and reused.
//
// Line drawing matches the spirit of scope2d / Lorenz burn beams: continuous
// ribbons with a gaussian cross-section (distance-to-segment), not sparse
// dotted trails. Implementation: dense kernel stamps at ~0.3σ with constant
// peak intensity (not total-energy / count — that thinned long segments and
// left elongated gaps when stamp count was capped).
//
// API:
//   nodeGraphPhosphorGaussianStamp(ctx, x, y, radiusPx, intensity)
//   nodeGraphPhosphorGaussianSegment(ctx, x0, y0, x1, y1, radiusPx, intensity)
//   nodeGraphPhosphorGaussianRadiusFromThickness(sizePx, thickness01)
//   nodeGraphPhosphorGaussianClearCache()

(function initNodeGraphPhosphorGaussianDrawer(global) {
  const MAX_KERNELS = 48;
  const MAX_RADIUS = 96;
  // Hard safety for pathological segments; step is forced so spacing never
  // exceeds ~0.45σ (continuous tube). scope2d draws one quad per segment —
  // we approximate that with dense stamps, not a low stamp cap.
  const MAX_STAMPS_PER_SEGMENT = 4096;
  /** @type {Map<string, { canvas: HTMLCanvasElement, size: number, sigma: number, radius: number }>} */
  const kernelCache = new Map();

  function clampRadius(radiusPx) {
    const r = Number(radiusPx);
    if (!Number.isFinite(r) || r <= 0) {
      return 1.25;
    }
    return Math.max(0.75, Math.min(MAX_RADIUS, r));
  }

  /**
   * Map 0–1 thickness (and face size) to a soft beam radius in buffer pixels.
   * Fixed grid → radius is stable while zooming.
   */
  function radiusFromThickness(sizePx, thickness01 = 0.14) {
    const size = Math.max(1, Number(sizePx) || 1);
    const t = Math.max(0, Math.min(1, Number(thickness01) || 0));
    // ~0.6%–3.4% of face min side; never thinner than ~1.25px.
    return Math.max(1.25, size * (0.006 + t * 0.028));
  }

  function kernelKey(radiusPx) {
    // Quantize so nearby thicknesses share one baked texture.
    return (Math.round(clampRadius(radiusPx) * 4) / 4).toFixed(2);
  }

  /**
   * Bake a radial gaussian into RGBA (white × g, alpha = g).
   * Support = ceil(radius); σ ≈ radius / 2.6 so intensity is ~1% at the rim.
   */
  function bakeKernel(radiusPx) {
    const radius = clampRadius(radiusPx);
    const sigma = Math.max(0.4, radius / 2.6);
    const support = Math.max(1, Math.ceil(radius));
    const size = support * 2 + 1;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) {
      return null;
    }
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const cx = support;
    const cy = support;
    const inv2s2 = 1 / (2 * sigma * sigma);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const g = Math.exp(-(dx * dx + dy * dy) * inv2s2);
        const o = (y * size + x) * 4;
        const v = Math.round(Math.max(0, Math.min(1, g)) * 255);
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = v;
      }
    }
    ctx.putImageData(image, 0, 0);
    return { canvas, size, sigma, radius };
  }

  function getKernel(radiusPx) {
    const key = kernelKey(radiusPx);
    let entry = kernelCache.get(key);
    if (entry) {
      kernelCache.delete(key);
      kernelCache.set(key, entry);
      return entry;
    }
    entry = bakeKernel(Number(key));
    if (!entry) {
      return null;
    }
    kernelCache.set(key, entry);
    while (kernelCache.size > MAX_KERNELS) {
      const oldest = kernelCache.keys().next().value;
      kernelCache.delete(oldest);
    }
    return entry;
  }

  /**
   * Stamp one soft beam hit at (x, y). intensity 0–1+ scales the deposit.
   * Expects destination composite "lighter" for additive energy.
   */
  function stamp(ctx, x, y, radiusPx, intensity) {
    if (!ctx) {
      return false;
    }
    const a = Math.max(0, Number(intensity) || 0);
    if (a < 0.0015) {
      return false;
    }
    const kernel = getKernel(radiusPx);
    if (!kernel) {
      return false;
    }
    const half = kernel.size * 0.5;
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return false;
    }
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.min(1, a);
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.drawImage(kernel.canvas, px - half, py - half);
    } catch (error) {
      ctx.globalAlpha = prevAlpha;
      return false;
    }
    ctx.globalAlpha = prevAlpha;
    return true;
  }

  /**
   * Continuous soft beam between two points — same idea as scope2d/Lorenz
   * segment quads (gaussian distance-to-segment), approximated by dense
   * circular stamps.
   *
   * intensity = peak brightness along the centerline (like uBrightness), NOT
   * total energy to split. Dividing by stamp count made long spans faint and
   * a hard stamp cap left elongated gaps.
   */
  function segment(ctx, x0, y0, x1, y1, radiusPx, intensity) {
    if (!ctx) {
      return 0;
    }
    const peak = Math.max(0, Math.min(1.5, Number(intensity) || 0));
    if (peak < 0.0015) {
      return 0;
    }
    const kernel = getKernel(radiusPx);
    if (!kernel) {
      return 0;
    }
    const ax = Number(x0);
    const ay = Number(y0);
    const bx = Number(x1);
    const by = Number(y1);
    if (![ax, ay, bx, by].every(Number.isFinite)) {
      return 0;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) {
      stamp(ctx, ax, ay, radiusPx, peak);
      return 1;
    }

    // Spacing tight enough that stamps fuse into a continuous tube (Lorenz-
    // continuous look). Never let a stamp-count cap widen spacing past ~0.45σ.
    const sigma = kernel.sigma;
    let step = Math.max(0.28, sigma * 0.3);
    let count = Math.max(1, Math.ceil(dist / step));
    if (count > MAX_STAMPS_PER_SEGMENT) {
      count = MAX_STAMPS_PER_SEGMENT;
      step = dist / count;
    }
    // Overlapping gaussians sum above peak; scale so centerline stays near `peak`.
    // At ~0.3σ spacing the additive stack is roughly ~1.7–2.2× a single stamp.
    const per = peak * 0.52;

    // Walk inclusive of the end point so segments join cleanly.
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      stamp(ctx, ax + dx * t, ay + dy * t, radiusPx, per);
    }
    return count + 1;
  }

  function clearCache() {
    kernelCache.clear();
  }

  global.nodeGraphPhosphorGaussianStamp = stamp;
  global.nodeGraphPhosphorGaussianSegment = segment;
  global.nodeGraphPhosphorGaussianRadiusFromThickness = radiusFromThickness;
  global.nodeGraphPhosphorGaussianClearCache = clearCache;
  global.nodeGraphPhosphorGaussianGetKernel = getKernel;
})(typeof window !== "undefined" ? window : globalThis);
