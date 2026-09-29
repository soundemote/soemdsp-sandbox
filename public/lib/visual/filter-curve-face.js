// Filter-curve face ownership SSOT (display/UI only -- not audio).
//
// True filter modules mount a plate class AND mark faceKind=filterCurve.
// Unrelated faces (Softclipper, BasicShape, envelopes, …) may reuse the plate
// CSS class for layout chrome, but must NOT claim filterCurve ownership.
// The filter drawer paints only owned faces -- never ad-hoc class exclusions.

(function initFilterCurveFace(global) {
  "use strict";

  const FACE_KIND_ATTR = "data-face-kind";
  const FACE_KIND_FILTER = "filterCurve";
  const FACE_PLATE_CLASS = "node-filter-curve-display";
  const FACE_CANVAS_CLASS = "node-filter-curve-canvas";
  const OWNED_SELECTOR = `.${FACE_PLATE_CLASS}[${FACE_KIND_ATTR}="${FACE_KIND_FILTER}"]`;

  /**
   * Mark a section as the filter-curve drawer owner (magnitude / cutoff face).
   * Call only from createNodeGraphFilterCurveDisplay (and filter-only clones).
   * @param {Element} section
   * @returns {Element|null}
   */
  function markFilterCurveOwnedFace(section) {
    if (!section) {
      return null;
    }
    section.classList.add(FACE_PLATE_CLASS);
    section.setAttribute(FACE_KIND_ATTR, FACE_KIND_FILTER);
    if (section.dataset) {
      section.dataset.faceKind = FACE_KIND_FILTER;
    }
    return section;
  }

  /**
   * Plate-only face (layout CSS) that must never be painted by the filter drawer.
   * @param {Element} section
   * @param {string} faceKind e.g. softClipperCurve, basicShape
   * @returns {Element|null}
   */
  function markCurveFacePlate(section, faceKind) {
    if (!section) {
      return null;
    }
    section.classList.add(FACE_PLATE_CLASS);
    const kind = String(faceKind || "").trim();
    if (kind && kind !== FACE_KIND_FILTER) {
      section.setAttribute(FACE_KIND_ATTR, kind);
      if (section.dataset) {
        section.dataset.faceKind = kind;
      }
    } else if (section.getAttribute?.(FACE_KIND_ATTR) === FACE_KIND_FILTER) {
      section.removeAttribute(FACE_KIND_ATTR);
      if (section.dataset) {
        delete section.dataset.faceKind;
      }
    }
    return section;
  }

  function isFilterCurveOwnedFace(el) {
    if (!el) {
      return false;
    }
    const kind = el.getAttribute?.(FACE_KIND_ATTR) || el.dataset?.faceKind || "";
    return kind === FACE_KIND_FILTER;
  }

  function queryFilterCurveOwnedFaces(root) {
    const scope = root && root.querySelectorAll ? root : global.document;
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return [];
    }
    return Array.prototype.slice.call(scope.querySelectorAll(OWNED_SELECTOR));
  }

  function forEachFilterCurveOwnedFace(fn, root) {
    if (typeof fn !== "function") {
      return;
    }
    const faces = queryFilterCurveOwnedFaces(root);
    for (let i = 0; i < faces.length; i += 1) {
      fn(faces[i], i);
    }
  }

  /**
   * UI sync path: force + paint only owned filter faces.
   * paintOwned is usually drawNodeGraphFilterCurveDisplay.
   * afterOwned may redraw pulse/wall faces that share the schedule tick.
   */
  function scheduleFilterCurveOwnedDraw(options) {
    const opts = options || {};
    const mvp = global.nodeGraphMvp;
    if (!mvp) {
      return;
    }
    if (mvp.filterCurveDrawFrame) {
      return;
    }
    const raf = global.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
    mvp.filterCurveDrawFrame = raf(() => {
      mvp.filterCurveDrawFrame = 0;
      forEachFilterCurveOwnedFace((section) => {
        section._filterCurveForceDraw = true;
        if (typeof section._startFaceLoop === "function") {
          section._startFaceLoop();
        }
      });
      const paintOwned = opts.paintOwned || global.drawNodeGraphFilterCurveDisplay;
      if (typeof paintOwned === "function") {
        forEachFilterCurveOwnedFace(paintOwned);
      }
      if (typeof opts.afterOwned === "function") {
        opts.afterOwned();
      }
    });
  }

  function syncFilterCurveOwnedDisplays(options) {
    scheduleFilterCurveOwnedDraw(options);
  }

  const api = Object.freeze({
    FACE_KIND_ATTR,
    FACE_KIND_FILTER,
    FACE_PLATE_CLASS,
    FACE_CANVAS_CLASS,
    OWNED_SELECTOR,
    markFilterCurveOwnedFace,
    markCurveFacePlate,
    isFilterCurveOwnedFace,
    queryFilterCurveOwnedFaces,
    forEachFilterCurveOwnedFace,
    scheduleFilterCurveOwnedDraw,
    syncFilterCurveOwnedDisplays,
  });

  global.FilterCurveFace = api;
  Object.assign(global, {
    markFilterCurveOwnedFace,
    markCurveFacePlate,
    isFilterCurveOwnedFace,
    queryFilterCurveOwnedFaces,
    forEachFilterCurveOwnedFace,
    scheduleFilterCurveOwnedDraw,
    syncFilterCurveOwnedDisplays,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
