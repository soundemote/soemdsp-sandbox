// Realtime worklet methods for cheapWalk (prototype + evaluators-sources dispatch).
NodeLiveAudioProcessor.prototype.createCheapWalkState = function createCheapWalkState(seed = 1) {
  const base = typeof createNodeGraphCheapWalkState === "function"
    ? createNodeGraphCheapWalkState(seed)
    : { left: { x: 0, seed: 1 }, right: { x: 0, seed: 1 }, lastSeed: seed };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.cheapWalkSampleStereo = function cheapWalkSampleStereo(state, params, rate) {
  if (this.nativeCheapWalkReady && this.nativeCheapWalk?.soemdsp_cheap_walk_sample_stereo) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeCheapWalk.soemdsp_cheap_walk_create();
      }
      if (state.nativeHandle) {
        // WASM can't return two doubles easily via one call without memory —
        // prefer JS stereo core when stereo export missing; when present, host
        // may still use graph_engine path. Fall through to JS if no heap helpers.
        if (typeof this.nativeCheapWalk.soemdsp_cheap_walk_sample_stereo === "function"
          && this.nativeCheapWalk.memory?.buffer
          && typeof this._cheapWalkStereoScratch === "object") {
          // Graph engine owns stereo native path; worklet JS twin uses math.
        }
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
  if (typeof nodeGraphCheapWalkCoreStereo === "function") {
    return nodeGraphCheapWalkCoreStereo(state, params, rate);
  }
  const y = typeof nodeGraphCheapWalkCore === "function"
    ? nodeGraphCheapWalkCore(state, params, rate)
    : 0;
  return { Left: y, Right: y };
};

NodeLiveAudioProcessor.prototype.cheapWalkSample = function cheapWalkSample(state, params, rate) {
  return this.cheapWalkSampleStereo(state, params, rate).Left;
};
