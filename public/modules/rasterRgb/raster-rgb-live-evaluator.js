// Offline / render-time Raster RGB. Native preferred; JS math fallback.

nodeGraphLiveModuleEvaluators.rasterRgb = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
}) => {
  const read = (key, fallback) =>
    (typeof readNodeGraphLiveEffectiveParam === "function"
      ? readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues)
      : Number(node?.params?.[key] ?? fallback));
  const rawR = mixInput(nodeId, "R");
  const rawG = mixInput(nodeId, "G");
  const rawB = mixInput(nodeId, "B");
  const opts = {
    brightness: read("brightness", 1),
    contrast: read("contrast", 1),
    hue: read("hue", 0),
    invert: read("invert", 0),
  };
  let processed;
  const wasm = runtime?.nativeRasterRgb || runtime?.nativeModules?.raster_rgb;
  if (wasm?.soemdsp_raster_rgb_sample) {
    if (!runtime.rasterRgbNativeHandles) runtime.rasterRgbNativeHandles = new Map();
    let handle = runtime.rasterRgbNativeHandles.get(nodeId) || 0;
    if (!handle && wasm.soemdsp_raster_rgb_create) {
      handle = wasm.soemdsp_raster_rgb_create();
      if (handle) runtime.rasterRgbNativeHandles.set(nodeId, handle);
    }
    if (handle) {
      wasm.soemdsp_raster_rgb_sample(
        handle,
        rawR,
        rawG,
        rawB,
        opts.invert,
        opts.contrast,
        opts.brightness,
        opts.hue,
      );
      processed = {
        R: wasm.soemdsp_raster_rgb_r(handle),
        G: wasm.soemdsp_raster_rgb_g(handle),
        B: wasm.soemdsp_raster_rgb_b(handle),
        rgba: wasm.soemdsp_raster_rgb_rgba(handle),
      };
    }
  }
  if (!processed && typeof nodeGraphRasterRgbProcessSample === "function") {
    processed = nodeGraphRasterRgbProcessSample(rawR, rawG, rawB, opts);
  }
  return processed || { R: 0, G: 0, B: 0, rgba: 0 };
};
