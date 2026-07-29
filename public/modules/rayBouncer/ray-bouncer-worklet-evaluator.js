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
    const sampleRateValue = Math.max(1, Number(options.sampleRate) || sampleRate || 44100);
    this.nativeRayBouncer.soemdsp_ray_bouncer_sample(
      state.nativeHandle,
      Number(options.reset) > 0.5 ? 1 : 0,
      Math.max(0, Number(options.frequency) || 0),
      Number.isFinite(Number(options.launchAngle)) ? Number(options.launchAngle) : 30,
      Number(options.startX) || 0,
      Number(options.startY) || 0,
      Math.max(0.01, Number(options.size) || 1),
      Math.max(0.05, Number(options.aspect) || 1),
      Number.isFinite(Number(options.rotate)) ? Number(options.rotate) : 0,
      Number(options.centerX) || 0,
      Number(options.centerY) || 0,
      Math.max(0, Number(options.maxDistance) || 0),
      this.clampValue(Number(options.bend) || 0, -4, 4),
      this.clampValue(Number(options.xToY) || 0, -4, 4),
      this.clampValue(Number(options.yToX) || 0, -4, 4),
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
