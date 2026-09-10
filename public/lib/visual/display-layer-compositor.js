// DisplayLayerCompositor — live multi-layer blit (additive stack).
// Shared by Metamodule shell mirrors and (later) the Canvas module.
// APP_POLICY / VISUALIZER_SERIES: blit face canvases only — no readback,
// no second sim, no per-layer WebGL contexts.

(function initDisplayLayerCompositor(global) {
  "use strict";

  /**
   * @typedef {object} DisplayLayer
   * @property {string} [id]
   * @property {CanvasImageSource|null} [source]  canvas / video / ImageBitmap
   * @property {number} [order]
   * @property {"lighter"|"source-over"|"copy"} [blend]
   * @property {number} [opacity]  0..1
   * @property {"contain"|"cover"|"stretch"} [fit]
   */

  /**
   * @param {HTMLCanvasElement} presentCanvas
   * @param {object} [options]
   */
  function createDisplayLayerCompositor(presentCanvas, options = {}) {
    if (!(presentCanvas instanceof HTMLCanvasElement)) {
      throw new Error("createDisplayLayerCompositor requires an HTMLCanvasElement");
    }
    /** @type {DisplayLayer[]} */
    let layers = [];
    let background = options.background != null ? String(options.background) : "#000000";
    let defaultBlend = options.blend === "source-over" ? "source-over" : "lighter";
    let defaultFit = options.fit === "cover" || options.fit === "stretch" ? options.fit : "contain";

    function setLayers(nextLayers) {
      layers = Array.isArray(nextLayers) ? nextLayers.slice() : [];
      layers.sort((a, b) => (nodeGraphFiniteNumber(a?.order)) - (nodeGraphFiniteNumber(b?.order)));
    }

    function setBackground(value) {
      background = value != null ? String(value) : "#000000";
    }

    /**
     * Resize backing store to layout CSS box × devicePixelRatio (integer pixels).
     * Pass layout sizes (clientWidth/offsetWidth), never getBoundingClientRect —
     * workspace zoom multiplies screen rects and would leave black gaps / clip.
     * @param {number} cssWidth
     * @param {number} cssHeight
     * @param {number} [pixelRatio]
     * @param {{ fillParent?: boolean }} [resizeOptions] fillParent → style 100%
     *   (CSS scales the fixed bitmap); otherwise absolute CSS px.
     * @returns {boolean} resized
     */
    function resize(cssWidth, cssHeight, pixelRatio = 1, resizeOptions = {}) {
      const dpr = Math.max(1, nodeGraphFiniteNumber(pixelRatio, 1));
      const cssW = Math.max(1, Math.round(nodeGraphFiniteNumber(cssWidth, 1)));
      const cssH = Math.max(1, Math.round(nodeGraphFiniteNumber(cssHeight, 1)));
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      let resized = false;
      if (presentCanvas.width !== w) {
        presentCanvas.width = w;
        resized = true;
      }
      if (presentCanvas.height !== h) {
        presentCanvas.height = h;
        resized = true;
      }
      if (resizeOptions?.fillParent) {
        if (presentCanvas.style.width !== "100%") {
          presentCanvas.style.width = "100%";
        }
        if (presentCanvas.style.height !== "100%") {
          presentCanvas.style.height = "100%";
        }
      } else {
        if (presentCanvas.style.width !== `${cssW}px`) {
          presentCanvas.style.width = `${cssW}px`;
        }
        if (presentCanvas.style.height !== `${cssH}px`) {
          presentCanvas.style.height = `${cssH}px`;
        }
      }
      return resized;
    }

    function sourceSize(source) {
      if (!source) return { w: 0, h: 0 };
      const w = nodeGraphFiniteNumber(source.videoWidth || source.naturalWidth || source.width);
      const h = nodeGraphFiniteNumber(source.videoHeight || source.naturalHeight || source.height);
      return { w, h };
    }

    function destRect(fit, srcW, srcH, dstW, dstH) {
      if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) {
        return { dx: 0, dy: 0, dw: dstW, dh: dstH };
      }
      if (fit === "stretch") {
        return { dx: 0, dy: 0, dw: dstW, dh: dstH };
      }
      const scale = fit === "cover"
        ? Math.max(dstW / srcW, dstH / srcH)
        : Math.min(dstW / srcW, dstH / srcH);
      const dw = Math.max(1, Math.round(srcW * scale));
      const dh = Math.max(1, Math.round(srcH * scale));
      const dx = Math.floor((dstW - dw) * 0.5);
      const dy = Math.floor((dstH - dh) * 0.5);
      return { dx, dy, dw, dh };
    }

    /**
     * Paint all layers onto the present canvas.
     * @returns {number} layers drawn
     */
    function paint() {
      const ctx = presentCanvas.getContext("2d");
      if (!ctx) return 0;
      const dstW = presentCanvas.width | 0;
      const dstH = presentCanvas.height | 0;
      if (!(dstW > 0) || !(dstH > 0)) return 0;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, dstW, dstH);

      let drawn = 0;
      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        const source = layer?.source;
        if (!source) continue;
        const { w: srcW, h: srcH } = sourceSize(source);
        if (!(srcW > 0) || !(srcH > 0)) continue;
        const fit = layer.fit || defaultFit;
        const blend = layer.blend || defaultBlend;
        const opacity = Math.max(0, Math.min(1, Number(layer.opacity)));
        const alpha = Number.isFinite(opacity) ? opacity : 1;
        if (!(alpha > 0)) continue;
        const { dx, dy, dw, dh } = destRect(fit, srcW, srcH, dstW, dstH);
        ctx.globalCompositeOperation = blend;
        ctx.globalAlpha = alpha;
        try {
          ctx.drawImage(source, 0, 0, srcW, srcH, dx, dy, dw, dh);
          drawn += 1;
        } catch (_err) {
          // Cross-origin / detached canvas — skip layer.
        }
      }
      ctx.restore();
      return drawn;
    }

    return {
      canvas: presentCanvas,
      setLayers,
      setBackground,
      resize,
      paint,
      getLayers: () => layers.slice(),
    };
  }

  global.createDisplayLayerCompositor = createDisplayLayerCompositor;
})(typeof globalThis !== "undefined" ? globalThis : window);
