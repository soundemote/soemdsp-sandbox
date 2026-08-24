// Smoothstep stamp + plausible-brightness gradient.
// Alpha is cached per (shape, shapeParam, rx, ry, blur). Color is a cheap radial
// walk of the brightness cone (or any 0…1 LUT): core = amount, fringe → hue → black.

(function initTraceDotSprite(global) {
  const MAX_CACHE = 96;
  const MAX_RADIUS = 512;
  /** @type {Map<string, object>} */
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

  function quant(n, step) {
    return Math.round(n / step) * step;
  }

  function normalizeShape(value) {
    if (typeof global.normalizeTraceStampShape === "function") {
      return global.normalizeTraceStampShape(value);
    }
    const raw = String(value || "circle").toLowerCase();
    return raw || "circle";
  }

  function paramToCount(param01, minCount, maxCount) {
    if (typeof global.traceStampParamToCount === "function") {
      return global.traceStampParamToCount(param01, minCount, maxCount);
    }
    const lo = Math.max(2, Math.floor(minCount));
    const hi = Math.max(lo, Math.floor(maxCount));
    return Math.round(lo + clamp01(param01, 0) * (hi - lo));
  }

  /**
   * Music Player Rounding on Squircle: 0 = sharp box, 1 = full soft squircle.
   * (Previously inverted: 0=circle, 1=boxy.)
   */
  function squircleNFromRounding(rounding01) {
    const p = clamp01(rounding01, 0);
    // p=0 → very boxy; p=1 → iOS-ish squircle (n≈4), not a pure circle.
    const boxy = 28;
    const soft = 4;
    const t = p * p;
    return boxy + (soft - boxy) * t;
  }

  function innerOuter(radius, blur01) {
    const R = Math.max(0.5, Number(radius) || 0.5);
    const b = clamp01(blur01, 0);
    const b2 = b * b;
    const inner = Math.max(0, R * (1 - b2 * 0.88) - (b2 < 0.004 ? 0.65 : 0));
    const outer = R * (1 + b2 * 1.65) + Math.max(1, 1.1 - b2);
    return { inner, outer };
  }

  function sdfSuperellipse(dx, dy, rx, ry, n) {
    const ax = Math.abs(dx) / Math.max(1e-6, rx);
    const ay = Math.abs(dy) / Math.max(1e-6, ry);
    const p = Math.pow(ax, n) + Math.pow(ay, n);
    const r = Math.pow(Math.max(p, 0), 1 / n);
    return (r - 1) * Math.min(rx, ry);
  }

  function sdfCircle(dx, dy, r) {
    return Math.hypot(dx, dy) - r;
  }

  function sdfBox(dx, dy, hx, hy) {
    const qx = Math.abs(dx) - hx;
    const qy = Math.abs(dy) - hy;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0);
  }

  /** Music Player Pill: rounded rectangle (circular corner arcs / CSS corner-shape: round). */
  function sdfRoundedBox(dx, dy, hx, hy, cornerR) {
    const r = Math.max(0, Math.min(cornerR, Math.min(hx, hy)));
    return sdfBox(dx, dy, Math.max(0, hx - r), Math.max(0, hy - r)) - r;
  }

  function sdfPolygon(dx, dy, radius, sides, rot = -Math.PI / 2) {
    const n = Math.max(3, Math.round(Number(sides) || 3));
    const ang = Math.atan2(dy, dx) - rot;
    const sector = (Math.PI * 2) / n;
    const a = ((ang % sector) + sector) % sector - sector * 0.5;
    const r = Math.hypot(dx, dy);
    const edge = radius * Math.cos(Math.PI / n);
    return r * Math.cos(a) - edge;
  }

  function sdfStar(dx, dy, radius, points, innerRatio) {
    const n = Math.max(3, points | 0);
    const ang = Math.atan2(dy, dx) + Math.PI / 2;
    const sector = Math.PI / n;
    const a = Math.abs(((ang % (sector * 2)) + sector * 2) % (sector * 2) - sector);
    const r = Math.hypot(dx, dy);
    const t = a / sector;
    const rim = radius * (1 - t) + radius * innerRatio * t;
    return r - rim;
  }

  function sdfHeart(dx, dy, radius, plump01) {
    const p = 0.75 + clamp01(plump01, 0.5) * 0.55;
    const x = dx / Math.max(1e-6, radius);
    const y = -dy / Math.max(1e-6, radius);
    const x2 = x * x;
    const y2 = y * y;
    // Soft algebraic heart; plump scales x.
    const sx = x / p;
    const sx2 = sx * sx;
    const a = sx2 + y2 - 1;
    const val = a * a * a - sx2 * y2 * y;
    // Convert implicit field to approx distance in px.
    return val * radius * 0.55;
  }

  function sdfTrapezoid(dx, dy, rx, ry, ratio01) {
    const top = Math.max(0.05, rx * (0.08 + clamp01(ratio01, 0.5) * 0.92));
    const bottom = rx;
    const t = (dy + ry) / Math.max(1e-6, ry * 2);
    const half = bottom + (top - bottom) * Math.max(0, Math.min(1, t));
    return sdfBox(dx, dy, half, ry);
  }

  function sdfDiamond(dx, dy, rx, ry, point01) {
    const p = clamp01(point01, 0.5);
    const n = 1.05 + (1 - p) * 1.6;
    return sdfSuperellipse(dx, dy, rx, ry, n);
  }

  function sdfCross(dx, dy, rx, ry, thick01) {
    const t = 0.12 + clamp01(thick01, 0.5) * 0.55;
    const hx = rx;
    const hy = ry * t;
    const vx = rx * t;
    const vy = ry;
    return Math.min(sdfBox(dx, dy, hx, hy), sdfBox(dx, dy, vx, vy));
  }

  function sdfRing(dx, dy, radius, hole01) {
    const outer = radius;
    const inner = radius * (0.08 + clamp01(hole01, 0.5) * 0.78);
    const d = Math.hypot(dx, dy);
    return Math.max(d - outer, inner - d);
  }

  function sdfTeardrop(dx, dy, radius, taper01) {
    const t = clamp01(taper01, 0.5);
    const bulb = sdfCircle(dx, dy + radius * 0.18, radius * (0.72 - t * 0.12));
    const tipY = -radius * (0.55 + t * 0.4);
    const tipR = radius * (0.22 + (1 - t) * 0.18);
    const tip = sdfCircle(dx, dy - tipY * 0.15, tipR);
    // Cone-ish blend toward tip.
    const ang = Math.atan2(dx, -(dy + radius * 0.05));
    const cone = Math.abs(ang) * radius * (0.55 - t * 0.2) - (radius * 0.35 - dy * 0.2);
    return Math.min(bulb, Math.max(tip, cone));
  }

  function sdfFlower(dx, dy, radius, petalsParam) {
    const petals = paramToCount(petalsParam, 3, 8);
    const ang = Math.atan2(dy, dx);
    const r = Math.hypot(dx, dy);
    const wave = 0.55 + 0.45 * Math.cos(ang * petals);
    return r - radius * wave;
  }

  function sdfForShape(dx, dy, rx, ry, shape, shapeParam) {
    const id = normalizeShape(shape);
    const p = clamp01(shapeParam, 0);
    const r = Math.min(rx, ry);
    switch (id) {
      case "oval":
        // Ellipse — stretch comes from rx/ry extents.
        return sdfSuperellipse(dx, dy, rx, ry, 2);
      case "pill": {
        // Music Player Pill + Rounding: 0 = square, 1 = full round (circle when rx≈ry).
        if (p <= 1e-4) {
          return sdfBox(dx, dy, rx, ry);
        }
        return sdfRoundedBox(dx, dy, rx, ry, r * p);
      }
      case "squircle": {
        // Music Player Squircle + Rounding: same 0=square…1=round axis as Pill.
        if (p <= 1e-4) {
          return sdfBox(dx, dy, rx, ry);
        }
        return sdfSuperellipse(dx, dy, rx, ry, squircleNFromRounding(p));
      }
      case "ngon":
        return sdfPolygon(dx, dy, r, paramToCount(p, 3, 12));
      case "star":
        return sdfStar(dx, dy, r, paramToCount(p, 3, 12), 0.42);
      case "heart":
        return sdfHeart(dx, dy, r, p);
      case "trapezoid":
        return sdfTrapezoid(dx, dy, rx, ry, p);
      case "diamond":
        return sdfDiamond(dx, dy, rx, ry, p);
      case "cross":
        return sdfCross(dx, dy, rx, ry, p);
      case "ring":
        return sdfRing(dx, dy, r, p);
      case "teardrop":
        return sdfTeardrop(dx, dy, r, p);
      case "flower":
        return sdfFlower(dx, dy, r, p);
      case "circle":
      default:
        return sdfSuperellipse(dx, dy, rx, ry, 2);
    }
  }

  function cacheKey(rx, ry, blur01, shape, shapeParam) {
    const x = quant(Math.max(1, Math.min(MAX_RADIUS, rx)), 0.25);
    const y = quant(Math.max(1, Math.min(MAX_RADIUS, ry)), 0.25);
    const b = quant(clamp01(blur01, 0), 1 / 64);
    const s = normalizeShape(shape);
    const p = quant(clamp01(shapeParam, 0.5), 1 / 32);
    return `${s}:${p.toFixed(4)}:${x.toFixed(2)}:${y.toFixed(2)}:${b.toFixed(4)}`;
  }

  function bake(rx, ry, blur01, shape, shapeParam) {
    const charR = Math.min(rx, ry);
    const { inner, outer } = innerOuter(charR, blur01);
    const extra = Math.max(0, outer - charR);
    const halfW = Math.ceil(rx + extra + 1.5);
    const halfH = Math.ceil(ry + extra + 1.5);
    const width = halfW * 2 + 1;
    const height = halfH * 2 + 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) {
      return null;
    }
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const cx = halfW;
    const cy = halfH;
    const span = Math.max(1e-6, outer - inner);
    const id = normalizeShape(shape);
    const param = clamp01(shapeParam, 0.5);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dist = sdfForShape(x - cx, y - cy, rx, ry, id, param);
        const a = 1 - hermite((dist - (inner - charR)) / span);
        const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
        const o = (y * width + x) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = v;
      }
    }
    ctx.putImageData(image, 0, 0);
    return {
      canvas,
      width,
      height,
      size: Math.max(width, height),
      rx,
      ry,
      radius: charR,
      blur: clamp01(blur01, 0),
      shape: id,
      shapeParam: param,
      squircle: id === "squircle" ? param : 0,
    };
  }

  function ensure(rx, ry, blur01, shape, shapeParam) {
    const key = cacheKey(rx, ry, blur01, shape, shapeParam);
    let entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
      return entry;
    }
    const x = Math.max(1, Math.min(MAX_RADIUS, Number(rx) || 1));
    const y = Math.max(1, Math.min(MAX_RADIUS, Number(ry) || 1));
    entry = bake(x, y, blur01, shape, shapeParam);
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

  function paintGradient(ctx, sprite, amount, colorAt, flat) {
    const w = sprite.width;
    const h = sprite.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const a = clamp01(amount, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    if (flat) {
      ctx.fillStyle = colorAt(a);
      ctx.fillRect(0, 0, w, h);
    } else {
      const { inner, outer } = innerOuter(sprite.radius, sprite.blur);
      const r0 = Math.max(0, inner);
      const r1 = Math.max(r0 + 0.75, outer);
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      g.addColorStop(0, colorAt(a));
      if (a > 0.51) {
        const t = Math.max(0.04, Math.min(0.96, 1 - 0.5 / a));
        g.addColorStop(t, colorAt(0.5));
      } else if (a > 0.08) {
        g.addColorStop(0.45, colorAt(a * 0.45));
      }
      g.addColorStop(1, colorAt(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(sprite.canvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function tintScratchCtx(sprite) {
    const w = sprite.width;
    const h = sprite.height;
    if (!tintScratch || tintScratch.width !== w || tintScratch.height !== h) {
      tintScratch = document.createElement("canvas");
      tintScratch.width = w;
      tintScratch.height = h;
    }
    return tintScratch.getContext("2d");
  }

  function resolveShapeOpts(style) {
    const opts = style && typeof style === "object" ? style : {};
    let shape = opts.shape;
    let shapeParam = opts.shapeParam;
    if (shape == null || shape === "") {
      // Legacy dual sliders → exclusive shape.
      if (typeof global.migratePillSquircleToShape === "function") {
        const migrated = global.migratePillSquircleToShape(opts.pill, opts.squircle);
        shape = migrated.shape;
        shapeParam = migrated.shapeParam;
      } else {
        const pill = clamp01(opts.pill, 0);
        const squircle = clamp01(opts.squircle, 0);
        if (pill <= 1e-4 && squircle <= 1e-4) {
          shape = "circle";
          shapeParam = 0.5;
        } else if (pill >= squircle) {
          shape = "pill";
          shapeParam = pill;
        } else {
          shape = "squircle";
          shapeParam = squircle;
        }
      }
    }
    return {
      shape: normalizeShape(shape),
      shapeParam: clamp01(shapeParam, 0.5),
    };
  }

  function resolveExtents(radius, style) {
    const opts = style && typeof style === "object" ? style : {};
    const r = Math.max(0.5, Number(radius) || 0.5);
    const { shape, shapeParam } = resolveShapeOpts(opts);
    const rxIn = Number(opts.rx);
    const ryIn = Number(opts.ry);
    if (rxIn > 0.05 && ryIn > 0.05) {
      return { rx: rxIn, ry: ryIn, shape, shapeParam };
    }
    // Oval stretch along the long axis. Pill stays square extents (rounded box).
    const stretch = shape === "oval" ? shapeParam : 0;
    return {
      rx: r * (1 + stretch * 2),
      ry: r,
      shape,
      shapeParam,
    };
  }

  /**
   * @param {CanvasRenderingContext2D} context
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} blur01
   * @param {string|{hue?:number,amount?:number,color?:string,colorAt?:function,shape?:string,shapeParam?:number,pill?:number,squircle?:number,rx?:number,ry?:number}|undefined} style
   * @param {number} [alpha01]
   */
  function draw(context, cx, cy, radius, blur01, style, alpha01 = 1) {
    if (!context) {
      return false;
    }
    const a = clamp01(alpha01, 1);
    const extents = resolveExtents(radius, style);
    if (a <= 0.001 || !(extents.rx > 0.05) || !(extents.ry > 0.05)) {
      return false;
    }
    const sprite = ensure(extents.rx, extents.ry, blur01, extents.shape, extents.shapeParam);
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
    const flat = Boolean(opts.flat)
      || (Boolean(opts.color) && !Number.isFinite(Number(opts.hue)) && typeof opts.colorAt !== "function");
    paintGradient(ctx, sprite, amount, resolveColorAt(opts), flat);
    const prev = context.globalAlpha;
    context.globalAlpha = prev * a;
    context.imageSmoothingEnabled = true;
    try {
      context.drawImage(
        tintScratch,
        Number(cx) - sprite.width * 0.5,
        Number(cy) - sprite.height * 0.5,
      );
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
    ensure: (radius, blur01, shapeOrSquircle = "circle", shapeParam = 0.5) => {
      // Back-compat: numeric 3rd arg was squircle01.
      if (typeof shapeOrSquircle === "number") {
        return ensure(radius, radius, blur01, "squircle", shapeOrSquircle);
      }
      return ensure(radius, radius, blur01, shapeOrSquircle, shapeParam);
    },
    draw,
    innerOuter,
    extents: resolveExtents,
    clearCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
