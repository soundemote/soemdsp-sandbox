// FaceScale — layout CSS box is the only size signal.
// minSide is min(metrics.cssW, metrics.cssH). Never canvas.width (dpr),
// never getBoundingClientRect (zoom). Workspace zoom is a CSS camera.
// See docs/APP_POLICY.md §15 and docs/DISPLAY_SCALE_REWRITE.md.

(function initDisplayScale(global) {
  "use strict";

  const FACE_INK_REF_PX = 96;

  function faceMinSide(width, height) {
    const w = Number(width);
    const h = Number(height);
    const ww = Number.isFinite(w) ? w : 0;
    const hh = Number.isFinite(h) ? h : 0;
    return Math.max(0, Math.min(ww, hh));
  }

  function clampDisplayUnit01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      const fb = Number(fallback);
      return Number.isFinite(fb) ? Math.max(0, Math.min(1, fb)) : 0;
    }
    return Math.max(0, Math.min(1, n));
  }

  function clampAuthoredInkPx(authoredPx, fallback = 0) {
    const n = Number(authoredPx);
    if (Number.isFinite(n)) {
      return Math.max(0, n);
    }
    const fb = Number(fallback);
    return Number.isFinite(fb) ? Math.max(0, fb) : 0;
  }

  function faceInkPx(authoredPx, minSide) {
    const authored = clampAuthoredInkPx(authoredPx, 0);
    const side = Number(minSide);
    if (!(side > 0) || !(FACE_INK_REF_PX > 0)) {
      return 0;
    }
    return authored * (side / FACE_INK_REF_PX);
  }

  function faceFracPx(unit01, minSide) {
    const side = Number(minSide);
    if (!(side > 0)) {
      return 0;
    }
    return clampDisplayUnit01(unit01, 0) * side;
  }

  const api = {
    FACE_INK_REF_PX,
    faceMinSide,
    clampDisplayUnit01,
    clampAuthoredInkPx,
    faceInkPx,
    faceFracPx,
  };

  Object.assign(global, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
