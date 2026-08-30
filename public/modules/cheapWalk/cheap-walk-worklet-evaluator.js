// Realtime worklet methods for cheapWalk (prototype + evaluators-sources dispatch).
NodeLiveAudioProcessor.prototype.createCheapWalkState = function createCheapWalkState(seed = 1) {
  const base = typeof createNodeGraphCheapWalkState === "function"
    ? createNodeGraphCheapWalkState(seed)
    : { x: 0, seed: (seed >>> 0) || 1, lastSeed: seed };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.cheapWalkSample = function cheapWalkSample(state, params, rate) {
  if (this.nativeCheapWalkReady && this.nativeCheapWalk?.soemdsp_cheap_walk_sample) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeCheapWalk.soemdsp_cheap_walk_create();
      }
      if (state.nativeHandle) {
        return this.nativeCheapWalk.soemdsp_cheap_walk_sample(
          state.nativeHandle,
          Number(params.rate) || 0,
          Number(params.amplitude) || 0,
          Number(params.seed) || 1,
          Math.max(1, Number(rate) || sampleRate || 44100),
        );
      }
    } catch (error) {
      this.nativeCheapWalkReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "cheap_walk",
        status: "disabled",
        message: String(error?.message || error || "native Cheap Walk failed"),
      });
    }
  }
  return typeof nodeGraphCheapWalkCore === "function"
    ? nodeGraphCheapWalkCore(state, params, rate)
    : 0;
};
