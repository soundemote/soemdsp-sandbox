// Realtime worklet evaluator methods for randomWalk, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.randomWalkSample(...) directly.
//
// onePoleLowpassSample/createLowpassState stay in core.js: confirmed
// shared with other modules' filter paths. nextSeededBipolar/
// resetSeededState/seededKey/stableSeed stay in core.js too: shared
// seeded-PRNG infrastructure backing multiple unrelated modules.
NodeLiveAudioProcessor.prototype.randomWalkSample = function randomWalkSample(state, params, rate = sampleRate, nodeId = "") {
  if (
    this.nativeRandomWalkReady &&
    this.nativeRandomWalk?.soemdsp_random_walk_create &&
    this.nativeRandomWalk?.soemdsp_random_walk_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeRandomWalk.soemdsp_random_walk_create();
      }
      if (state.nativeHandle) {
        const key = this.seededKey(nodeId, params.seed, "randomWalk");
        if (state.nativeSeedKey !== key) {
          state.nativeSeedKey = key;
          this.nativeRandomWalk.soemdsp_random_walk_reset_seed(state.nativeHandle, this.stableSeed(key));
        }
        const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
        const method = Math.max(0, Math.min(3, Math.round(Number(params.method) || 0)));
        const out = this.nativeRandomWalk.soemdsp_random_walk_sample(
          state.nativeHandle,
          method,
          Math.max(0, Number(params.frequency) || 0),
          Math.max(0, Number(params.jitter) || 0),
          Number(params.level) || 0,
          safeRate,
        );
        return this.safeFilterNumber(out, null);
      }
    } catch (error) {
      this.nativeRandomWalkReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "random_walk",
        status: "disabled",
        message: String(error?.message || error || "native Random Walk failed"),
      });
    }
  }
  // JS path: pure math (random-walk-math.js).
  if (typeof nodeGraphRandomWalkCore === "function") {
    return this.safeFilterNumber(
      nodeGraphRandomWalkCore(state, params || {}, rate, nodeId),
      null,
    );
  }
  return 0;
};

NodeLiveAudioProcessor.prototype.createRandomWalkState = function createRandomWalkState() {
  return {
    lowpass: this.createLowpassState(),
    out: 0,
    seed: 0,
    seedKey: "",
    nativeHandle: 0,
    nativeSeedKey: "",
  };
};
