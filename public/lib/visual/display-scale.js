// Display length scale — app-wide SSOT for canvas / face geometry.
//
// Every face-relative length is stored as 0..1 of min(faceW, faceH) in the
// coordinate space being drawn (CSS for DOM chrome, device pixels for canvas).
// Resolve at draw: px = unit01 * min(width, height)
//
// See docs/APP_POLICY.md §15.

(function initDisplayScale(global) {
  "use strict";

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
   * @param {number} unit01  0..1 of face min-edge
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

  const api = {
    displayFaceMinSide,
    clampDisplayUnit01,
    displayScaleToPx,
  };

  Object.assign(global, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
