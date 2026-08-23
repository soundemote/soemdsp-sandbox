// Smoothstep disc sprite + plausible-brightness gradient.
// Alpha stamp is cached per (radius, blur). Color is a cheap radial walk
// of the brightness cone (or any 0…1 LUT): core = amount, fringe → hue → black.

(function initTraceDotSprite(global) {
  const MAX_CACHE = 48;
  const MAX_RADIUS = 512;
  /** @type {Map<string, { canvas: HTMLCanvasElement, size: number, radius: number, blur: number }>} */
  const cache = new Map();
  let tintScratch = null;

  function clamp01(n, fallback = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, v));
  }

  function hermite(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function innerOuter(radius, blur01) {
    const R = Math.max(0.5, Number(radius) || 0.5);
    // Slider is steep if used linearly — square it so 0.5 is still a tight disc.
    const b = clamp01(blur01, 0);
    const b2 = b * b;
    const inner = Math.max(0, R * (1 - b2 * 0.88) - (b2 < 0.004 ? 0.65 : 0));
    const outer = R * (1 + b2 * 1.65) + Math.max(1, 1.1 - b2);
    return { inner, outer };
  }

  function cacheKey(radius, blur01) {
    const r = Math.round(Math.max(1, Math.min(MAX_RADIUS, Number(radius) || 1)) * 4) / 4;
    const b = Math.round(clamp01(blur01, 0) * 64) / 64;
    return `${r.toFixed(2)}:${b.toFixed(4)}`;
  }

  function bake(radius, blur01) {
    const { inner, outer } = innerOuter(radius, blur01);
    const pad = Math.max(1, Math.ceil(outer + 1.5));
    const size = pad * 2 + 1;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) {
      return null;
    }
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const cx = pad;
    const cy = pad;
    const span = Math.max(1e-6, outer - inner);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const rr = Math.sqrt(dx * dx + dy * dy);
        const a = 1 - hermite((rr - inner) / span);
        const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
        const o = (y * size + x) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = v;
      }
    }
    ctx.putImageData(image, 0, 0);
    return { canvas, size, radius: Number(radius) || 1, blur: clamp01(blur01, 0) };
  }

  function ensure(radius, blur01) {
    const key = cacheKey(radius, blur01);
    let entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
      return entry;
    }
    const r = Math.max(1, Math.min(MAX_RADIUS, Number(radius) || 1));
    entry = bake(r, blur01);
    if (!entry) {
      return null;
    }
    cache.set(key, entry);
    while (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    return entry;
  }

  function coneColor(hueDeg, brightness01, alpha01) {
    if (typeof global.nodeGraphHueBrightnessCss === "function") {
      return global.nodeGraphHueBrightnessCss(hueDeg, brightness01, alpha01);
    }
    return "#ffffff";
  }

  function resolveColorAt(style) {
    if (typeof style?.colorAt === "function") {
      return style.colorAt;
    }
    const hue = Number(style?.hue);
    if (Number.isFinite(hue)) {
      return (b) => coneColor(hue, b, b <= 0.002 ? 0 : 1);
    }
    const flat = style?.color || (typeof style === "string" ? style : "#ffffff");
    return (b) => (b <= 0.002 ? "rgba(0,0,0,0)" : flat);
  }

  function paintGradient(ctx, sprite, amount, colorAt) {
    const n = sprite.size;
    const cx = n * 0.5;
    const cy = n * 0.5;
    const { inner, outer } = innerOuter(sprite.radius, sprite.blur);
    const r0 = Math.max(0, inner);
    const r1 = Math.max(r0 + 0.75, outer);
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    const a = clamp01(amount, 0);
    g.addColorStop(0, colorAt(a));
    // Hue lives at 0.5 on the cone. When the core is past hue (white-ish),
    // park a stop in the blur skirt so the fringe is actually hued.
    if (a > 0.51) {
      const t = Math.max(0.04, Math.min(0.96, 1 - 0.5 / a));
      g.addColorStop(t, colorAt(0.5));
    } else if (a > 0.08) {
      g.addColorStop(0.45, colorAt(a * 0.45));
    }
    g.addColorStop(1, colorAt(0));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(sprite.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function tintScratchCtx(sprite) {
    const n = sprite.size;
    if (!tintScratch || tintScratch.width !== n || tintScratch.height !== n) {
      tintScratch = document.createElement("canvas");
      tintScratch.width = n;
      tintScratch.height = n;
    }
    return tintScratch.getContext("2d");
  }

  /**
   * @param {CanvasRenderingContext2D} context
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} blur01
   * @param {string|{hue?:number,amount?:number,color?:string,colorAt?:function}|undefined} style
   * @param {number} [alpha01]
   */
  function draw(context, cx, cy, radius, blur01, style, alpha01 = 1) {
    if (!context) {
      return false;
    }
    const a = clamp01(alpha01, 1);
    if (a <= 0.001 || !(Number(radius) > 0.05)) {
      return false;
    }
    const sprite = ensure(radius, blur01);
    if (!sprite) {
      return false;
    }
    const opts = style && typeof style === "object" ? style : { color: style };
    const amount = clamp01(opts.amount, 1);
    if (amount <= 0.001 && typeof opts.colorAt !== "function" && !opts.color) {
      return false;
    }
    const ctx = tintScratchCtx(sprite);
    if (!ctx) {
      return false;
    }
    paintGradient(ctx, sprite, amount, resolveColorAt(opts));
    const half = sprite.size * 0.5;
    const prev = context.globalAlpha;
    context.globalAlpha = a;
    context.imageSmoothingEnabled = true;
    try {
      context.drawImage(tintScratch, Number(cx) - half, Number(cy) - half);
    } catch (error) {
      context.globalAlpha = prev;
      return false;
    }
    context.globalAlpha = prev;
    return true;
  }

  function clearCache() {
    cache.clear();
  }

  global.TraceDotSprite = {
    ensure,
    draw,
    innerOuter,
    clearCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
