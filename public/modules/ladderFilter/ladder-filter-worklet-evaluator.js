// Ladder Filter — native/WASM only (APP_POLICY §2).
// JS hosts graph I/O; C++ owns the ladder via process_block.

NodeLiveAudioProcessor.LADDER_NATIVE_BLOCK_SIZE = 128;

NodeLiveAudioProcessor.prototype.createLadderFilterState = function createLadderFilterState() {
  return {
    nativeHandle: 0,
    blockCache: {
      cursor: 0,
      size: 0,
      input: null,
      output: null,
      memory: null,
    },
  };
};

NodeLiveAudioProcessor.prototype.resetLadderBlockCache = function resetLadderBlockCache(state) {
  if (!state?.blockCache) {
    return;
  }
  state.blockCache.cursor = 0;
  state.blockCache.size = 0;
  state.blockCache.input = null;
  state.blockCache.output = null;
  state.blockCache.memory = null;
};

NodeLiveAudioProcessor.prototype.bindLadderBlockViews = function bindLadderBlockViews(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.input && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const inPtr = native.soemdsp_ladder_filter_block_input_ptr?.(state.nativeHandle);
  const outPtr = native.soemdsp_ladder_filter_block_output_ptr?.(state.nativeHandle);
  if (!inPtr || !outPtr) {
    return false;
  }
  cache.input = new Float64Array(memory.buffer, inPtr, blockSize);
  cache.output = new Float64Array(memory.buffer, outPtr, blockSize);
  cache.memory = memory.buffer;
  cache.size = blockSize;
  cache.output.fill(0);
  cache.cursor = 0;
  return true;
};

NodeLiveAudioProcessor.prototype.applyLadderNativeParams = function applyLadderNativeParams(native, state, params, rate) {
  if (!native?.soemdsp_ladder_filter_set_params || !state?.nativeHandle) {
    return;
  }
  native.soemdsp_ladder_filter_set_params(
    state.nativeHandle,
    Math.max(0, this.safeFilterNumber(params.frequency, state)),
    this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 0.999),
    Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0))),
    Math.max(1, Math.min(4, Math.round(Number(params.stages) || 4))),
    Math.max(1, Number(rate) || sampleRate || 44100),
  );
};

/**
 * One channel sample. Collects into native block; one WASM process_block per quantum.
 * Silence if native cold — no JS ladder twin (APP_POLICY §2).
 */
NodeLiveAudioProcessor.prototype.ladderFilterSample = function ladderFilterSample(state, input, params, rate = sampleRate) {
  const native = this.nativeLadderFilter;
  const nativeVer = Number(native?.soemdsp_ladder_filter_version?.() || 0);
  if (
    !this.nativeLadderFilterReady
    || nativeVer < 2
    || !native?.soemdsp_ladder_filter_create
    || !native?.soemdsp_ladder_filter_process_block
    || !native?.soemdsp_ladder_filter_set_params
  ) {
    return 0;
  }

  try {
    if (!state.nativeHandle) {
      state.nativeHandle = native.soemdsp_ladder_filter_create();
      this.resetLadderBlockCache(state);
    }
    if (!state.nativeHandle) {
      return 0;
    }

    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const blockSize = Math.min(
      NodeLiveAudioProcessor.LADDER_NATIVE_BLOCK_SIZE,
      Number(native.soemdsp_ladder_filter_max_block_frames?.()) || 128,
    );

    if (!this.bindLadderBlockViews(native, state, blockSize)) {
      this.applyLadderNativeParams(native, state, params, safeRate);
      return this.safeFilterNumber(
        native.soemdsp_ladder_filter_sample(
          state.nativeHandle,
          this.safeFilterNumber(input, state),
          Math.max(0, this.safeFilterNumber(params.frequency, state)),
          this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 0.999),
          Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0))),
          Math.max(1, Math.min(4, Math.round(Number(params.stages) || 4))),
          safeRate,
        ),
        state,
      );
    }

    const cache = state.blockCache;
    const index = cache.cursor;
    const out = cache.output[index] || 0;
    cache.input[index] = this.safeFilterNumber(input, state);
    cache.cursor += 1;
    if (cache.cursor >= blockSize) {
      this.applyLadderNativeParams(native, state, params, safeRate);
      native.soemdsp_ladder_filter_process_block(state.nativeHandle, blockSize);
      cache.cursor = 0;
    }
    return this.safeFilterNumber(out, state);
  } catch (error) {
    this.nativeLadderFilterReady = false;
    state.nativeHandle = 0;
    this.resetLadderBlockCache(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "ladder_filter",
      status: "disabled",
      message: String(error?.message || error || "native Ladder Filter failed"),
    });
    return 0;
  }
};
