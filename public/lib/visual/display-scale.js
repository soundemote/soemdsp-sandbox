// Display length scale — app-wide SSOT for canvas / face geometry.
//
// Policy: every face-relative length is stored as 0..1 of min(faceW, faceH)
// in the coordinate space being drawn (CSS px for DOM chrome, device px for
// canvas). No percent, rem, or absolute px in settings. Resolve at draw:
//   px = unit01 * min(width, height)
//
// See docs/APP_POLICY.md § Display length scale (0–1 of face min-edge).

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
   * @param {number} [fallbackPx=0]
   * @returns {number} pixels in the same space as faceMinSide
   */
  function displayScaleToPx(unit01, faceMinSide, fallbackPx = 0) {
    const side = Number(faceMinSide);
    if (!(side > 0)) {
      const fb = Number(fallbackPx);
      return Number.isFinite(fb) ? Math.max(0, fb) : 0;
    }
    return clampDisplayUnit01(unit01, 0) * side;
  }

  /**
   * Reference face used only to pick defaults that match old CSS-px looks.
   * Not a runtime scale factor — draw always uses the live face min-edge.
   */
  const DISPLAY_SCALE_REF_FACE_CSS_PX = 256;

  function displayScaleFromRefCssPx(cssPx) {
    const px = Number(cssPx);
    if (!Number.isFinite(px) || !(DISPLAY_SCALE_REF_FACE_CSS_PX > 0)) {
      return 0;
    }
    return clampDisplayUnit01(px / DISPLAY_SCALE_REF_FACE_CSS_PX, 0);
  }

  const api = {
    displayFaceMinSide,
    clampDisplayUnit01,
    displayScaleToPx,
    displayScaleFromRefCssPx,
    DISPLAY_SCALE_REF_FACE_CSS_PX,
  };

  Object.assign(global, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
