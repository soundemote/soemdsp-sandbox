// App-wide stamp shape vocabulary (Dot family first; other faces can opt in).
// shape = discrete silhouette; shapeParam = 0…1 continuous control (meaning per shape).

(function initTraceShape(global) {
  const TRACE_STAMP_SHAPE_IDS = Object.freeze([
    "circle",
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
    pill: Object.freeze({
      label: "Stretch",
      title: "Stretch along the long face axis. 0 = 1:1, 1 = capsule filling the face.",
    }),
    squircle: Object.freeze({
      label: "Corners",
      title: "Corner boxiness. 0 = circle/ellipse, 1 = square/rectangle.",
    }),
    ngon: Object.freeze({
      label: "Sides",
      title: "Polygon side count. 0 ≈ triangle, 1 ≈ 12-gon.",
    }),
    star: Object.freeze({
      label: "Points",
      title: "Star point count. 0 ≈ 3 points, 1 ≈ 12 points.",
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
      title: "Petal count. 0 ≈ 3 petals, 1 ≈ 8 petals.",
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
    if (id === "pill") {
      return { pill: p, squircle: 0 };
    }
    if (id === "squircle") {
      return { pill: 0, squircle: p };
    }
    return { pill: 0, squircle: 0 };
  }

  /**
   * Migrate pre-shape patches. Exclusive dropdown: larger axis wins when both set.
   */
  function migratePillSquircleToShape(pill01, squircle01) {
    const pill = clamp01(pill01, 0);
    const squircle = clamp01(squircle01, 0);
    if (pill <= 1e-4 && squircle <= 1e-4) {
      return { shape: "circle", shapeParam: 0.5 };
    }
    if (pill >= squircle) {
      return { shape: "pill", shapeParam: pill };
    }
    return { shape: "squircle", shapeParam: squircle };
  }

  /** Discrete counts from 0…1 (inclusive ends). */
  function traceStampParamToCount(param01, minCount, maxCount) {
    const lo = Math.max(2, Math.floor(Number(minCount) || 3));
    const hi = Math.max(lo, Math.floor(Number(maxCount) || lo));
    const t = clamp01(param01, 0);
    return Math.round(lo + t * (hi - lo));
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
})(typeof window !== "undefined" ? window : globalThis);
