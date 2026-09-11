// Face CSS / buffer metrics — resize-only cache (Music Player display contract).
//
// Layout owners (ResizeObserver, settings apply, explicit SyncLayout) write.
// Paint reads the WeakMap cache; cold path syncs once — never clientWidth
// every steady frame. See APP_POLICY §15 paint-vs-layout.

(function initDisplayFaceMetrics(global) {
  "use strict";

  /** @type {WeakMap<Element, { cssW:number, cssH:number, dpr:number, width:number, height:number }>} */
  const faceMetricsCache = new WeakMap();
  /** @type {WeakMap<Element, ResizeObserver>} */
  const faceMetricsObservers = new WeakMap();

  function faceMetricsFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function measureFaceCssBox(section) {
    let cssW = Math.max(0, faceMetricsFinite(section.clientWidth || section.offsetWidth));
    let cssH = Math.max(0, faceMetricsFinite(section.clientHeight || section.offsetHeight));
    if (cssW < 8 || cssH < 8) {
      const stage = section.closest?.("#nodeScreenSoloStage") || section.parentElement;
      if (stage?.id === "nodeScreenSoloStage") {
        const cols = Math.max(1, faceMetricsFinite(stage.style.getPropertyValue("--node-screen-solo-cols"), 1));
        const rows = Math.max(1, faceMetricsFinite(stage.style.getPropertyValue("--node-screen-solo-rows"), 1));
        cssW = Math.max(cssW, Math.floor((stage.clientWidth || global.innerWidth || 0) / cols));
        cssH = Math.max(cssH, Math.floor((stage.clientHeight || global.innerHeight || 0) / rows));
      }
    }
    if (!(cssW > 0) || !(cssH > 0)) {
      const rect = section.getBoundingClientRect?.();
      const zoom = Math.max(
        0.01,
        faceMetricsFinite(global.nodeGraphMvp?.zoom, 1),
      );
      if (rect) {
        if (!(cssW > 0)) {
          cssW = Math.max(1, rect.width / zoom);
        }
        if (!(cssH > 0)) {
          cssH = Math.max(1, rect.height / zoom);
        }
      }
    }
    cssW = Math.max(1, Math.round(cssW));
    cssH = Math.max(1, Math.round(cssH));
    return { cssW, cssH };
  }

  /**
   * SyncLayout — measure face CSS box and cache device-pixel buffer size at density 1.
   * Call from ResizeObserver / settings apply / face switch — not from steady paint.
   * @param {Element} section
   * @returns {{ cssW:number, cssH:number, dpr:number, width:number, height:number, cssWidth:number, cssHeight:number }|null}
   */
  function syncFaceMetrics(section) {
    if (!section) {
      return null;
    }
    const { cssW, cssH } = measureFaceCssBox(section);
    const dpr = Math.max(1, global.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(cssW * dpr));
    const height = Math.max(1, Math.round(cssH * dpr));
    const metrics = {
      cssW,
      cssH,
      cssWidth: cssW,
      cssHeight: cssH,
      dpr,
      width,
      height,
    };
    faceMetricsCache.set(section, metrics);
    if (typeof section._awakeClientWidth === "number" || section.isConnected) {
      section._awakeClientWidth = cssW;
      section._awakeClientHeight = cssH;
    }
    return metrics;
  }

  function ensureFaceMetricsObserver(section) {
    if (!section || faceMetricsObservers.has(section)) {
      return;
    }
    if (typeof ResizeObserver !== "function") {
      syncFaceMetrics(section);
      return;
    }
    const ro = new ResizeObserver(() => {
      if (!section.isConnected) {
        return;
      }
      syncFaceMetrics(section);
    });
    try {
      ro.observe(section);
    } catch (_error) {
      // Ignore observe failures (detached / exotic nodes).
    }
    faceMetricsObservers.set(section, ro);
    syncFaceMetrics(section);
  }

  /**
   * Paint-path metrics. Cache hit returns immediately; cold path SyncLayout once.
   * @param {Element} section
   * @param {{ observe?: boolean, force?: boolean }} [options]
   * @returns {{ cssW:number, cssH:number, dpr:number, width:number, height:number, cssWidth:number, cssHeight:number }|null}
   */
  function ensureFaceMetrics(section, options = {}) {
    if (!section) {
      return null;
    }
    const observe = options.observe !== false;
    if (observe) {
      ensureFaceMetricsObserver(section);
    }
    let metrics = faceMetricsCache.get(section);
    const dpr = Math.max(1, global.devicePixelRatio || 1);
    if (!metrics || options.force || metrics.dpr !== dpr) {
      metrics = syncFaceMetrics(section);
    }
    return metrics || null;
  }

  const api = {
    syncFaceMetrics,
    ensureFaceMetrics,
  };

  Object.assign(global, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
