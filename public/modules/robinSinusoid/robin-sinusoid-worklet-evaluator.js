// RobinSinusoid — native recursive sine. JS math stays in robin-sinusoid-math.js
// for offline/render; the worklet is native-only.

NodeLiveAudioProcessor.prototype.createRobinSinusoidState = function createRobinSinusoidState() {
  return {
    nativeHandle: 0,
    resetPrev: 0,
    blockCache: { cursor: 0, size: 0, out: null, memory: null },
  };
};

NodeLiveAudioProcessor.prototype.destroyRobinSinusoidNativeState = function destroyRobinSinusoidNativeState(state) {
  if (state?.blockCache) {
    state.blockCache.cursor = 0;
    state.blockCache.size = 0;
    state.blockCache.out = null;
    state.blockCache.memory = null;
  }
  if (state?.nativeHandle && this.nativeRobinSinusoid?.soemdsp_robin_sinusoid_destroy) {
    this.nativeRobinSinusoid.soemdsp_robin_sinusoid_destroy(state.nativeHandle);
  }
  if (state) {
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.bindRobinSinusoidBlockView = function bindRobinSinusoidBlockView(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.out && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const ptr = native.soemdsp_robin_sinusoid_block_output_ptr?.(state.nativeHandle);
  if (!ptr) {
    return false;
  }
  cache.out = new Float64Array(memory.buffer, ptr, blockSize);
  cache.memory = memory.buffer;
  cache.size = blockSize;
  return true;
};

NodeLiveAudioProcessor.prototype.robinSinusoidSample = function robinSinusoidSample(
  state,
  frequencyHz,
  amplitude,
  sampleRate,
  startPhaseRadians,
  reset,
  useBlock = false,
) {
  const native = this.nativeRobinSinusoid;
  if (
    !this.nativeRobinSinusoidReady ||
    !native?.soemdsp_robin_sinusoid_create ||
    !native?.soemdsp_robin_sinusoid_sample
  ) {
    return 0;
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = native.soemdsp_robin_sinusoid_create() || 0;
      if (state.blockCache) {
        state.blockCache.cursor = 0;
        state.blockCache.size = 0;
        state.blockCache.out = null;
        state.blockCache.memory = null;
      }
    }
    if (!state.nativeHandle) {
      return 0;
    }
    const safeRate = Math.max(1, Number(sampleRate) || sampleRate || 44100);
    const freq = Number(frequencyHz);
    const amp = Number(amplitude);
    const phase = Number(startPhaseRadians) || 0;
    const resetFlag = reset ? 1 : 0;
    const blockSize = NodeLiveAudioProcessor.ROBIN_SINUSOID_NATIVE_BLOCK_SIZE;
    if (
      useBlock &&
      native.soemdsp_robin_sinusoid_process_block &&
      this.bindRobinSinusoidBlockView(native, state, blockSize)
    ) {
      const cache = state.blockCache;
      if (resetFlag || cache.cursor >= cache.size) {
        native.soemdsp_robin_sinusoid_process_block(
          state.nativeHandle,
          freq,
          amp,
          safeRate,
          phase,
          resetFlag,
          blockSize,
        );
        cache.cursor = 0;
      }
      const index = cache.cursor;
      cache.cursor += 1;
      return this.safeFilterNumber(cache.out[index], state);
    }
    return this.safeFilterNumber(
      native.soemdsp_robin_sinusoid_sample(
        state.nativeHandle,
        freq,
        amp,
        safeRate,
        phase,
        resetFlag,
      ),
      state,
    );
  } catch (error) {
    this.nativeRobinSinusoidReady = false;
    this.destroyRobinSinusoidNativeState(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "robin_sinusoid",
      status: "disabled",
      message: String(error?.message || error || "native RobinSinusoid failed"),
    });
    return 0;
  }
};
