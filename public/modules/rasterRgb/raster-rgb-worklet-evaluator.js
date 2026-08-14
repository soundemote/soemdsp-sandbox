NodeLiveAudioProcessor.prototype.createRasterRgbState = function createRasterRgbState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.rasterRgbSample = function rasterRgbSample(mixInput, nodeId, options = {}) {
  const rawR = Number(mixInput(nodeId, "R")) || 0;
  const rawG = Number(mixInput(nodeId, "G")) || 0;
  const rawB = Number(mixInput(nodeId, "B")) || 0;
  const opts = {
    brightness: Number(options.brightness),
    contrast: Number(options.contrast),
    hue: Number(options.hue) || 0,
    invert: Number(options.invert) || 0,
  };
  if (!Number.isFinite(opts.brightness)) opts.brightness = 1;
  if (!Number.isFinite(opts.contrast)) opts.contrast = 1;
  let processed = null;
  if (
    this.nativeRasterRgbReady
    && this.nativeRasterRgb?.soemdsp_raster_rgb_sample
  ) {
    try {
      const state = options.state || this.createRasterRgbState();
      if (!state.nativeHandle && this.nativeRasterRgb.soemdsp_raster_rgb_create) {
        state.nativeHandle = this.nativeRasterRgb.soemdsp_raster_rgb_create();
      }
      if (state.nativeHandle) {
        this.nativeRasterRgb.soemdsp_raster_rgb_sample(
          state.nativeHandle,
          rawR,
          rawG,
          rawB,
          opts.invert,
          opts.contrast,
          opts.brightness,
          opts.hue,
        );
        processed = {
          R: this.nativeRasterRgb.soemdsp_raster_rgb_r(state.nativeHandle),
          G: this.nativeRasterRgb.soemdsp_raster_rgb_g(state.nativeHandle),
          B: this.nativeRasterRgb.soemdsp_raster_rgb_b(state.nativeHandle),
          rgba: this.nativeRasterRgb.soemdsp_raster_rgb_rgba(state.nativeHandle),
        };
      }
    } catch (_error) {
      this.nativeRasterRgbReady = false;
    }
  }
  if (!processed && typeof nodeGraphRasterRgbProcessSample === "function") {
    processed = nodeGraphRasterRgbProcessSample(rawR, rawG, rawB, opts);
  }
  if (!processed) {
    processed = { R: rawR, G: rawG, B: rawB, rgba: (rawR + rawG + rawB) / 3 };
  }
  return processed;
};
