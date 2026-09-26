// Display length scale — two kinds:
//   Ink: authored CSS px at a reference face min-edge. At draw, scale with
//        the live face min-edge. Workspace zoom is CSS; do not × zoom.
//   Layout fraction: 0..1 of min(faceW, faceH) — padding, radius, inset.
//
// See docs/APP_POLICY.md §15.

(function initDisplayScale(global) {
  "use strict";

  /** Face min-edge (CSS px @ zoom 1) at which authored ink px look “1:1”. */
  const DISPLAY_INK_REFERENCE_PX = 96;

  function displayFaceMinSide(width, height) {
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

  /**
   * @param {number} unit01  0..1 of face min-edge (layout fraction, not ink)
   * @param {number} faceMinSide  min(width, height) in the draw space
   * @returns {number} pixels in the same space as faceMinSide
   */
  function displayScaleToPx(unit01, faceMinSide) {
    const side = Number(faceMinSide);
    if (!(side > 0)) {
      return 0;
    }
    return clampDisplayUnit01(unit01, 0) * side;
  }

  /**
   * Ink at draw: authored CSS px scaled by live face min-edge / reference.
   * Pass faceMinSide at paint. Omit it only when storing/clamping the authored
   * number (no geometry yet). Do not × workspace zoom.
   */
  function displayInkToPx(px, fallback = 0, faceMinSide) {
    const n = Number(px);
    const value = Number.isFinite(n) ? n : Number(fallback);
    const authored = Number.isFinite(value) ? Math.max(0, value) : 0;
    const side = Number(faceMinSide);
    if (!(side > 0) || !(DISPLAY_INK_REFERENCE_PX > 0)) {
      return authored;
    }
    return authored * (side / DISPLAY_INK_REFERENCE_PX);
  }

  const api = {
    DISPLAY_INK_REFERENCE_PX,
    displayFaceMinSide,
    clampDisplayUnit01,
    displayScaleToPx,
    displayInkToPx,
  };

  Object.assign(global, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
