NodeLiveAudioProcessor.prototype.createRasterRgbState = function createRasterRgbState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.rasterRgbSample = function rasterRgbSample(mixInput, nodeId, options = {}) {
  const rawR = nodeGraphFiniteNumber(mixInput(nodeId, "R"));
  const rawG = nodeGraphFiniteNumber(mixInput(nodeId, "G"));
  const rawB = nodeGraphFiniteNumber(mixInput(nodeId, "B"));
  const opts = {
    brightness: Number(options.brightness),
    contrast: Number(options.contrast),
    hue: nodeGraphFiniteNumber(options.hue),
    invert: nodeGraphFiniteNumber(options.invert),
  };
  if (!Number.isFinite(opts.brightness)) opts.brightness = 1;
  if (!Number.isFinite(opts.contrast)) opts.contrast = 1;
  let processed = null;
  const nativeGradeVersion = nodeGraphFiniteNumber(this.nativeRasterRgb?.soemdsp_raster_rgb_version?.());
  if (
    this.nativeRasterRgbReady
    && this.nativeRasterRgb?.soemdsp_raster_rgb_sample
    && nativeGradeVersion >= 2
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
