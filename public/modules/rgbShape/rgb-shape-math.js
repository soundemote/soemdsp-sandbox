// Shared Shape silhouette helpers (face paint + X/Y outline audio).
// Unit box ≈ −1…+1. Phase 0…1 walks the perimeter (arc-length parameterized).

(function initRgbShapeMath(global) {
  function clamp01(n, fallback = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) {
      return fallback;
    }
    return Math.max(0, Math.min(1, v));
  }

  function clamp(n, lo, hi, fallback = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) {
      return fallback;
    }
    return Math.max(lo, Math.min(hi, v));
  }

  function shapeIdFromIndex(index) {
    const ids = global.TRACE_STAMP_SHAPE_IDS;
    if (Array.isArray(ids) && ids.length) {
      const i = Math.max(0, Math.min(ids.length - 1, Math.round(Number(index) || 0)));
      return ids[i];
    }
    return "circle";
  }

  function shapeChoices() {
    if (typeof global.TRACE_STAMP_SHAPES !== "undefined" && Array.isArray(global.TRACE_STAMP_SHAPES)) {
      return global.TRACE_STAMP_SHAPES.map((entry) => entry.label);
    }
    return ["Circle", "Oval", "Pill", "Squircle", "N-gon", "Star", "Heart", "Trapezoid", "Diamond", "Cross", "Ring", "Teardrop", "Flower"];
  }

  function paramToCount(param01, minCount, maxCount) {
    if (typeof global.traceStampParamToCount === "function") {
      return global.traceStampParamToCount(param01, minCount, maxCount);
    }
    const lo = Math.max(3, Math.floor(minCount));
    const hi = Math.max(lo, Math.floor(maxCount));
    const t = clamp01(param01, 0);
    if (t <= 1e-9) {
      return lo;
    }
    if (t >= 1 - 1e-9) {
      return hi;
    }
    return Math.round(lo + t * (hi - lo));
  }

  /** Closed polyline in unit space (−1…1). */
  function buildOutlinePolyline(shapeId, shapeParam) {
    const id = String(shapeId || "circle");
    const p = clamp01(shapeParam, 0.5);
    const pts = [];
    const push = (x, y) => {
      pts.push(x, y);
    };

    if (id === "circle" || id === "oval") {
      const n = 64;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        push(Math.cos(a), Math.sin(a));
      }
      return pts;
    }

    if (id === "pill" || id === "squircle") {
      // Rounded / superellipse box. p=0 sharp box, p=1 full round.
      const nExp = id === "squircle"
        ? (4 + (1 - p) * (1 - p) * 20)
        : 2;
      const corner = id === "pill" ? p : 1;
      if (id === "pill" && corner <= 1e-4) {
        push(-1, -1); push(1, -1); push(1, 1); push(-1, 1);
        return pts;
      }
      const steps = 64;
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        if (id === "pill") {
          // Morph box → circle via rounded-rect approximation on the unit circle ray.
          const bx = Math.max(-1, Math.min(1, c === 0 ? 0 : Math.sign(c)));
          const by = Math.max(-1, Math.min(1, s === 0 ? 0 : Math.sign(s)));
          // Intersect ray with unit square, then blend toward circle.
          const tx = Math.abs(c) < 1e-9 ? 1e9 : 1 / Math.abs(c);
          const ty = Math.abs(s) < 1e-9 ? 1e9 : 1 / Math.abs(s);
          const tBox = Math.min(tx, ty);
          const xBox = c * tBox;
          const yBox = s * tBox;
          push(xBox * (1 - corner) + c * corner, yBox * (1 - corner) + s * corner);
        } else {
          const ax = Math.abs(c);
          const ay = Math.abs(s);
          const denom = Math.pow(ax, nExp) + Math.pow(ay, nExp);
          const r = denom > 1e-12 ? Math.pow(denom, -1 / nExp) : 1;
          push(c * r, s * r);
        }
      }
      return pts;
    }

    if (id === "ngon") {
      const sides = paramToCount(p, 3, 12);
      for (let i = 0; i < sides; i += 1) {
        const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
        push(Math.cos(a), Math.sin(a));
      }
      return pts;
    }

    if (id === "star") {
      const points = paramToCount(p, 3, 12);
      const inner = 0.42;
      for (let i = 0; i < points * 2; i += 1) {
        const r = i % 2 === 0 ? 1 : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        push(Math.cos(a) * r, Math.sin(a) * r);
      }
      return pts;
    }

    if (id === "diamond") {
      const soft = 1.05 + (1 - p) * 1.6;
      const steps = 64;
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const denom = Math.pow(Math.abs(c), soft) + Math.pow(Math.abs(s), soft);
        const r = denom > 1e-12 ? Math.pow(denom, -1 / soft) : 1;
        push(c * r, s * r);
      }
      return pts;
    }

    if (id === "heart") {
      // SSOT polyline from trace-shape.js (shared with Dot TraceDotSprite bake).
      if (typeof global.traceStampHeartUnitPolyline === "function") {
        const poly = global.traceStampHeartUnitPolyline(p);
        for (let i = 0; i < poly.length; i += 2) {
          push(poly[i], poly[i + 1]);
        }
        return pts;
      }
      const plump = 0.75 + p * 0.55;
      const steps = 96;
      for (let i = 0; i < steps; i += 1) {
        const t = (i / steps) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        push((x / 18) * plump, -y / 18);
      }
      return pts;
    }

    if (id === "trapezoid") {
      const top = 0.08 + p * 0.92;
      push(-1, 1); push(1, 1); push(top, -1); push(-top, -1);
      return pts;
    }

    if (id === "cross") {
      const t = 0.12 + p * 0.55;
      push(-t, -1); push(t, -1); push(t, -t); push(1, -t); push(1, t);
      push(t, t); push(t, 1); push(-t, 1); push(-t, t); push(-1, t);
      push(-1, -t); push(-t, -t);
      return pts;
    }

    if (id === "ring") {
      // Outer perimeter only (audio path); face fill handles the hole separately.
      const n = 64;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        push(Math.cos(a), Math.sin(a));
      }
      return pts;
    }

    if (id === "teardrop") {
      const taper = p;
      const steps = 64;
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const bulge = 0.55 + (1 - taper) * 0.35;
        const tip = 0.35 + taper * 0.55;
        const r = a > 0
          ? bulge + (1 - bulge) * Math.cos(a) * 0.35
          : tip + (1 - tip) * Math.cos(a) * 0.15;
        push(Math.sin(a) * Math.max(0.2, r), -Math.cos(a) * Math.max(0.2, r));
      }
      return pts;
    }

    if (id === "flower") {
      const petals = paramToCount(p, 3, 8);
      const steps = 96;
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const wave = 0.55 + 0.45 * Math.cos(a * petals);
        push(Math.cos(a) * wave, Math.sin(a) * wave);
      }
      return pts;
    }

    // Fallback circle
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * Math.PI * 2 - Math.PI / 2;
      push(Math.cos(a), Math.sin(a));
    }
    return pts;
  }

  const outlineCache = new Map();

  function cachedOutline(shapeId, shapeParam) {
    const p = Math.round(clamp01(shapeParam, 0.5) * 32) / 32;
    const key = `${shapeId}:${p}`;
    let entry = outlineCache.get(key);
    if (entry) {
      return entry;
    }
    const poly = buildOutlinePolyline(shapeId, p);
    // Cumulative arc length
    const n = poly.length / 2;
    const cum = new Float64Array(n + 1);
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      const i1 = (i + 1) % n;
      const dx = poly[i1 * 2] - poly[i * 2];
      const dy = poly[i1 * 2 + 1] - poly[i * 2 + 1];
      total += Math.hypot(dx, dy);
      cum[i + 1] = total;
    }
    entry = { poly, cum, total: Math.max(1e-9, total), n };
    outlineCache.set(key, entry);
    if (outlineCache.size > 64) {
      const first = outlineCache.keys().next().value;
      outlineCache.delete(first);
    }
    return entry;
  }

  /**
   * Point on silhouette at phase 0…1 → { x, y } in −1…1.
   */
  function outlinePoint(shapeIdOrIndex, shapeParam, phase01) {
    const id = typeof shapeIdOrIndex === "number" || /^\d+$/.test(String(shapeIdOrIndex))
      ? shapeIdFromIndex(shapeIdOrIndex)
      : (typeof global.normalizeTraceStampShape === "function"
        ? global.normalizeTraceStampShape(shapeIdOrIndex)
        : String(shapeIdOrIndex || "circle"));
    const entry = cachedOutline(id, shapeParam);
    const t = ((Number(phase01) || 0) % 1 + 1) % 1;
    const target = t * entry.total;
    let lo = 0;
    let hi = entry.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entry.cum[mid] < target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const i = Math.max(1, lo);
    const i0 = i - 1;
    const i1 = i % entry.n;
    const seg = entry.cum[i] - entry.cum[i0];
    const u = seg > 1e-9 ? (target - entry.cum[i0]) / seg : 0;
    const x0 = entry.poly[i0 * 2];
    const y0 = entry.poly[i0 * 2 + 1];
    const x1 = entry.poly[i1 * 2];
    const y1 = entry.poly[i1 * 2 + 1];
    return {
      x: x0 + (x1 - x0) * u,
      y: y0 + (y1 - y0) * u,
      shapeId: id,
    };
  }

  /** Canvas path for filled silhouette (same family as outline). */
  function fillPath(ctx, shapeIdOrIndex, shapeParam, cx, cy, halfW, halfH) {
    if (!ctx) {
      return;
    }
    const id = typeof shapeIdOrIndex === "number" || /^\d+$/.test(String(shapeIdOrIndex))
      ? shapeIdFromIndex(shapeIdOrIndex)
      : (typeof global.normalizeTraceStampShape === "function"
        ? global.normalizeTraceStampShape(shapeIdOrIndex)
        : String(shapeIdOrIndex || "circle"));
    const p = clamp01(shapeParam, 0.5);
    const poly = buildOutlinePolyline(id, p);
    ctx.beginPath();
    for (let i = 0; i < poly.length; i += 2) {
      const x = cx + poly[i] * halfW;
      const y = cy + poly[i + 1] * halfH;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    if (id === "ring") {
      const hole = 0.08 + p * 0.78;
      ctx.moveTo(cx + halfW * hole, cy);
      ctx.arc(cx, cy, Math.min(halfW, halfH) * hole, 0, Math.PI * 2, true);
    }
  }

  global.RgbShapeMath = {
    clamp,
    clamp01,
    shapeIdFromIndex,
    shapeChoices,
    outlinePoint,
    fillPath,
    buildOutlinePolyline,
  };
})(typeof window !== "undefined" ? window : globalThis);
