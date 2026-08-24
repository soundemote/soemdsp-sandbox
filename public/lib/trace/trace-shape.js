// App-wide stamp shape vocabulary (Dot family first; other faces can opt in).
// shape = discrete silhouette; shapeParam = 0…1 continuous control (meaning per shape).
// Pill matches Music Player / AsciiScope plate chrome: rounded square (CSS corner-shape: round
// + border-radius). Oval is the axis-stretch ellipse. Squircle is superellipse boxiness.

(function initTraceShape(global) {
  const TRACE_STAMP_SHAPE_IDS = Object.freeze([
    "circle",
    "oval",
    "pill",
    "squircle",
    "ngon",
    "star",
    "heart",
    "trapezoid",
    "diamond",
    "cross",
    "ring",
    "teardrop",
    "flower",
  ]);

  const TRACE_STAMP_SHAPES = Object.freeze(
    TRACE_STAMP_SHAPE_IDS.map((id) => Object.freeze({
      id,
      label: ({
        circle: "Circle",
        oval: "Oval",
        pill: "Pill",
        squircle: "Squircle",
        ngon: "N-gon",
        star: "Star",
        heart: "Heart",
        trapezoid: "Trapezoid",
        diamond: "Diamond",
        cross: "Cross",
        ring: "Ring",
        teardrop: "Teardrop",
        flower: "Flower",
      })[id] || id,
    })),
  );

  const PARAM_META = Object.freeze({
    circle: Object.freeze({ label: "Shape", title: "Circle has no shape parameter." }),
    oval: Object.freeze({
      label: "Stretch",
      title: "Ellipse stretch along the long face axis. 0 = circle, 1 = max oval filling the face.",
    }),
    // Same Rounding axis as Music Player / AsciiScope plate chrome:
    // 0 = square, 1 = full round. Pill vs Squircle is only the corner curve.
    pill: Object.freeze({
      label: "Rounding",
      title: "Corner rounding 0…1 (Music Player). 0 = square, 1 = full capsule/circle. Pill = circular corner arcs.",
    }),
    squircle: Object.freeze({
      label: "Rounding",
      title: "Corner rounding 0…1 (Music Player). 0 = square, 1 = full round. Squircle = superellipse corners.",
    }),
    ngon: Object.freeze({
      label: "Sides",
      title: "Polygon side count. 0 = triangle (3), 1 = 12-gon.",
    }),
    star: Object.freeze({
      label: "Points",
      title: "Star point count. 0 = 3 points, 1 = 12 points.",
    }),
    heart: Object.freeze({
      label: "Plump",
      title: "Heart plumpness. 0 = narrow, 1 = wide.",
    }),
    trapezoid: Object.freeze({
      label: "Ratio",
      title: "Top vs bottom width. 0 ≈ triangle, 1 ≈ rectangle.",
    }),
    diamond: Object.freeze({
      label: "Point",
      title: "Diamond pointiness. 0 = soft rhombus, 1 = sharp diamond.",
    }),
    cross: Object.freeze({
      label: "Thickness",
      title: "Cross arm thickness. 0 = thin plus, 1 = thick cross.",
    }),
    ring: Object.freeze({
      label: "Hole",
      title: "Ring hole size. 0 = nearly solid, 1 = thin ring.",
    }),
    teardrop: Object.freeze({
      label: "Taper",
      title: "Tip sharpness. 0 = blunt drop, 1 = sharp tip.",
    }),
    flower: Object.freeze({
      label: "Petals",
      title: "Petal count. 0 = 3 petals, 1 = 8 petals.",
    }),
  });

  function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return Math.max(0, Math.min(1, Number(fallback) || 0));
    }
    return Math.max(0, Math.min(1, n));
  }

  function normalizeTraceStampShape(value, fallback = "circle") {
    const raw = String(value || "").trim().toLowerCase();
    // Legacy: pre-oval "pill" meant axis stretch — callers that still pass stretch
    // semantics should migrate via migratePillSquircleToShape, not here.
    if (TRACE_STAMP_SHAPE_IDS.includes(raw)) {
      return raw;
    }
    const fb = String(fallback || "circle").trim().toLowerCase();
    return TRACE_STAMP_SHAPE_IDS.includes(fb) ? fb : "circle";
  }

  function traceStampShapeParamMeta(shape) {
    const id = normalizeTraceStampShape(shape);
    return PARAM_META[id] || PARAM_META.circle;
  }

  function traceStampShapeParamLabel(shape) {
    return traceStampShapeParamMeta(shape).label;
  }

  function traceStampShapeUsesParam(shape) {
    return normalizeTraceStampShape(shape) !== "circle";
  }

  /** Map discrete shape + param onto legacy pill/squircle axes (transition). */
  function deriveLegacyPillSquircle(shape, shapeParam) {
    const id = normalizeTraceStampShape(shape);
    const p = clamp01(shapeParam, 0.5);
    // Legacy stretch axis was named "pill"; oval owns that now.
    if (id === "oval") {
      return { pill: p, squircle: 0 };
    }
    if (id === "squircle") {
      // Legacy squircle axis was inverted (0=circle, 1=boxy).
      return { pill: 0, squircle: 1 - p };
    }
    if (id === "pill") {
      // New pill rounding has no legacy twin; leave stretch/squircle axes clear.
      return { pill: 0, squircle: 0 };
    }
    return { pill: 0, squircle: 0 };
  }

  /**
   * Migrate pre-shape patches.
   * Old `pill` slider was axis stretch → Oval (not Music Player Pill).
   * Old `squircle` was inverted (0=circle, 1=boxy) vs Music Player Rounding
   * (0=square, 1=round) — invert when mapping onto shapeParam.
   */
  function migratePillSquircleToShape(pill01, squircle01) {
    const pill = clamp01(pill01, 0);
    const squircle = clamp01(squircle01, 0);
    if (pill <= 1e-4 && squircle <= 1e-4) {
      return { shape: "circle", shapeParam: 0.5 };
    }
    if (pill >= squircle) {
      return { shape: "oval", shapeParam: pill };
    }
    return { shape: "squircle", shapeParam: 1 - squircle };
  }

  /** Discrete counts from 0…1. 0 always maps to minCount (ngon: triangle). */
  function traceStampParamToCount(param01, minCount, maxCount) {
    const lo = Math.max(3, Math.floor(Number(minCount) || 3));
    const hi = Math.max(lo, Math.floor(Number(maxCount) || lo));
    const t = clamp01(param01, 0);
    if (t <= 1e-9) {
      return lo;
    }
    if (t >= 1 - 1e-9) {
      return hi;
    }
    return Math.round(lo + t * (hi - lo));
  }

  // ── Heart SSOT (Dot stamps + Shape module face/outline) ──────────────────
  // Classic parametric heart in unit space (−1…1). Plump widens lobes.
  const heartPolyCache = new Map();

  function traceStampHeartUnitPolyline(plump01) {
    const plump = 0.75 + clamp01(plump01, 0.5) * 0.55;
    const key = Math.round(plump * 64);
    let poly = heartPolyCache.get(key);
    if (poly) {
      return poly;
    }
    const steps = 96;
    poly = new Float64Array(steps * 2);
    for (let i = 0; i < steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      poly[i * 2] = (x / 18) * plump;
      poly[i * 2 + 1] = -y / 18;
    }
    heartPolyCache.set(key, poly);
    return poly;
  }

  function distToSegment2(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    const dx = px - qx;
    const dy = py - qy;
    return dx * dx + dy * dy;
  }

  function pointInClosedPolyline(px, py, poly) {
    let inside = false;
    const n = poly.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const xi = poly[i * 2];
      const yi = poly[i * 2 + 1];
      const xj = poly[j * 2];
      const yj = poly[j * 2 + 1];
      if ((yi > py) !== (yj > py)
        && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-30) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Signed distance (px) to the canonical heart. Outside > 0 (matches disc SDFs).
   * dx/dy are pixel offsets from center; rx/ry half-extents.
   */
  function traceStampHeartSdf(dx, dy, rx, ry, plump01) {
    const hx = Math.max(1e-6, Number(rx) || 1);
    const hy = Math.max(1e-6, Number(ry) || 1);
    const ux = dx / hx;
    const uy = dy / hy;
    const poly = traceStampHeartUnitPolyline(plump01);
    const n = poly.length / 2;
    let best = Infinity;
    for (let i = 0; i < n; i += 1) {
      const i1 = (i + 1) % n;
      const d2 = distToSegment2(
        ux, uy,
        poly[i * 2], poly[i * 2 + 1],
        poly[i1 * 2], poly[i1 * 2 + 1],
      );
      if (d2 < best) {
        best = d2;
      }
    }
    const distUnit = Math.sqrt(Math.max(0, best));
    const scale = Math.min(hx, hy);
    const inside = pointInClosedPolyline(ux, uy, poly);
    return (inside ? -distUnit : distUnit) * scale;
  }

  global.TRACE_STAMP_SHAPE_IDS = TRACE_STAMP_SHAPE_IDS;
  global.TRACE_STAMP_SHAPES = TRACE_STAMP_SHAPES;
  global.normalizeTraceStampShape = normalizeTraceStampShape;
  global.traceStampShapeParamMeta = traceStampShapeParamMeta;
  global.traceStampShapeParamLabel = traceStampShapeParamLabel;
  global.traceStampShapeUsesParam = traceStampShapeUsesParam;
  global.deriveLegacyPillSquircle = deriveLegacyPillSquircle;
  global.migratePillSquircleToShape = migratePillSquircleToShape;
  global.traceStampParamToCount = traceStampParamToCount;
  global.traceStampHeartUnitPolyline = traceStampHeartUnitPolyline;
  global.traceStampHeartSdf = traceStampHeartSdf;
})(typeof window !== "undefined" ? window : globalThis);
