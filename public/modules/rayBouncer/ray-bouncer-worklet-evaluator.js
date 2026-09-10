// Realtime worklet methods for rayBouncer — native WASM only (no JS DSP mirror).
// Silent until soemdsp_ray_bouncer_* exports are ready on the worklet.

NodeLiveAudioProcessor.prototype.createRayBouncerState = function createRayBouncerState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.destroyRayBouncerNativeState = function destroyRayBouncerNativeState(state) {
  if (state?.nativeHandle && this.nativeRayBouncer?.soemdsp_ray_bouncer_destroy) {
    this.nativeRayBouncer.soemdsp_ray_bouncer_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.rayBouncerSample = function rayBouncerSample(state, options = {}) {
  if (
    !this.nativeRayBouncerReady ||
    !this.nativeRayBouncer?.soemdsp_ray_bouncer_create ||
    !this.nativeRayBouncer?.soemdsp_ray_bouncer_sample
  ) {
    return { x: 0, y: 0 };
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeRayBouncer.soemdsp_ray_bouncer_create();
    }
    if (!state.nativeHandle) {
      return { x: 0, y: 0 };
    }
    const sampleRateValue = Math.max(1, nodeGraphFiniteNumber(options.sampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
    this.nativeRayBouncer.soemdsp_ray_bouncer_sample(
      state.nativeHandle,
      Number(options.reset) > 0.5 ? 1 : 0,
      Math.max(0, nodeGraphFiniteNumber(options.frequency)),
      Number.isFinite(Number(options.launchAngle)) ? Number(options.launchAngle) : 30,
      nodeGraphFiniteNumber(options.startX),
      nodeGraphFiniteNumber(options.startY),
      Math.max(0.01, nodeGraphFiniteNumber(options.size, 1)),
      Math.max(0.05, nodeGraphFiniteNumber(options.aspect, 1)),
      Number.isFinite(Number(options.rotate)) ? Number(options.rotate) : 0,
      nodeGraphFiniteNumber(options.centerX),
      nodeGraphFiniteNumber(options.centerY),
      Math.max(0, nodeGraphFiniteNumber(options.maxDistance)),
      this.clampValue(nodeGraphFiniteNumber(options.bend), -4, 4),
      this.clampValue(nodeGraphFiniteNumber(options.xToY), -4, 4),
      this.clampValue(nodeGraphFiniteNumber(options.yToX), -4, 4),
      sampleRateValue,
    );
    return {
      x: this.safeFilterNumber(this.nativeRayBouncer.soemdsp_ray_bouncer_x(state.nativeHandle), null) ?? 0,
      y: this.safeFilterNumber(this.nativeRayBouncer.soemdsp_ray_bouncer_y(state.nativeHandle), null) ?? 0,
    };
  } catch (error) {
    this.nativeRayBouncerReady = false;
    this.destroyRayBouncerNativeState(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "ray_bouncer",
      status: "disabled",
      message: String(error?.message || error || "native Ray Bouncer failed"),
    });
    return { x: 0, y: 0 };
  }
};
