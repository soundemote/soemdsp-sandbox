// Shared Gaussian beam stamps for fixed-grid phosphor faces.
//
// With layout-stable face backing (clientWidth × dpr), the beam radius in
// buffer pixels is also stable under workspace zoom. That means a true
// exp(-r²/2σ²) kernel can be baked once into a small texture and reused:
//   stamp = drawImage(kernel, x - r, y - r) with lighter + intensity
// instead of createRadialGradient / fill per hit (expensive and only
// roughly gaussian).
//
// API:
//   nodeGraphPhosphorGaussianStamp(ctx, x, y, radiusPx, intensity)
//   nodeGraphPhosphorGaussianSegment(ctx, x0, y0, x1, y1, radiusPx, intensity)
//   nodeGraphPhosphorGaussianRadiusFromThickness(sizePx, thickness01)
//   nodeGraphPhosphorGaussianClearCache()

(function initNodeGraphPhosphorGaussianDrawer(global) {
  const MAX_KERNELS = 48;
  const MAX_RADIUS = 64;
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
    // ~0.6%–3.4% of face diagonal-ish (min side); never thinner than ~1.25px.
    return Math.max(1.25, size * (0.006 + t * 0.028));
  }

  function kernelKey(radiusPx) {
    // Quantize so nearby thicknesses share one baked texture.
    // 0.25px steps keep the cache small without visible steps on a soft blob.
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
    // Normalize peak to 1 (center sample).
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const g = Math.exp(-(dx * dx + dy * dy) * inv2s2);
        const o = (y * size + x) * 4;
        // Premultiplied-style white: RGB carries intensity for "lighter" composite.
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
      // LRU-ish: re-insert to end.
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
    // Cap so many overlapping stamps still leave headroom for lighter sum.
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
   * Soft gaussian ribbon between two points: stamps along the segment with
   * spacing ~0.4σ so the continuous beam looks smooth without gaps.
   * intensity is total energy for the segment (dwell should already be baked in).
   */
  function segment(ctx, x0, y0, x1, y1, radiusPx, intensity) {
    if (!ctx) {
      return 0;
    }
    const a = Math.max(0, Number(intensity) || 0);
    if (a < 0.0015) {
      return 0;
    }
    const kernel = getKernel(radiusPx);
    if (!kernel) {
      return 0;
    }
    const dx = Number(x1) - Number(x0);
    const dy = Number(y1) - Number(y0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return 0;
    }
    const dist = Math.hypot(dx, dy);
    // Spacing tied to baked σ so the texture, not an ad-hoc arc, owns the shape.
    const step = Math.max(0.65, kernel.sigma * 0.42);
    if (dist < 1e-4) {
      stamp(ctx, x0, y0, radiusPx, a);
      return 1;
    }
    const count = Math.min(96, Math.max(1, Math.ceil(dist / step)));
    // Per-stamp share of segment energy (slight boost so continuous look matches dots).
    const per = (a / count) * 1.08;
    for (let i = 1; i <= count; i += 1) {
      const t = i / count;
      stamp(ctx, Number(x0) + dx * t, Number(y0) + dy * t, radiusPx, per);
    }
    return count;
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
