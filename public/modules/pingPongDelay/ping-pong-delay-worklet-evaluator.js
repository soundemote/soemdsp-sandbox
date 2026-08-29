// Worklet Ping Pong Delay — native/WASM only (APP_POLICY §2).
// JS hosts the graph; C++ owns per-sample DSP via process_block.

NodeLiveAudioProcessor.PING_PONG_NATIVE_BLOCK_SIZE = 128;

NodeLiveAudioProcessor.prototype.createPingPongDelayState = function createPingPongDelayState() {
  return {
    nativeHandle: 0,
    cachedParams: null,
    outPorts: { Left: 0, Right: 0 },
    blockCache: {
      cursor: 0,
      size: 0,
      input: null,
      outL: null,
      outR: null,
      memory: null,
    },
  };
};

NodeLiveAudioProcessor.prototype.resetPingPongBlockCache = function resetPingPongBlockCache(state) {
  if (!state?.blockCache) {
    return;
  }
  state.blockCache.cursor = 0;
  state.blockCache.size = 0;
  state.blockCache.input = null;
  state.blockCache.outL = null;
  state.blockCache.outR = null;
  state.blockCache.memory = null;
};

NodeLiveAudioProcessor.prototype.bindPingPongBlockViews = function bindPingPongBlockViews(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.input && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const inPtr = native.soemdsp_ping_pong_delay_block_input_ptr?.(state.nativeHandle);
  const outLPtr = native.soemdsp_ping_pong_delay_block_output_left_ptr?.(state.nativeHandle);
  const outRPtr = native.soemdsp_ping_pong_delay_block_output_right_ptr?.(state.nativeHandle);
  if (!inPtr || !outLPtr || !outRPtr) {
    return false;
  }
  cache.input = new Float64Array(memory.buffer, inPtr, blockSize);
  cache.outL = new Float64Array(memory.buffer, outLPtr, blockSize);
  cache.outR = new Float64Array(memory.buffer, outRPtr, blockSize);
  cache.memory = memory.buffer;
  cache.size = blockSize;
  cache.outL.fill(0);
  cache.outR.fill(0);
  cache.cursor = 0;
  return true;
};

NodeLiveAudioProcessor.prototype.invalidateAllNativeBlockViews = function invalidateAllNativeBlockViews() {
  // memory.grow replaces the wasm ArrayBuffer — every Float64Array view dies.
  const clear = (state) => {
    if (!state?.blockCache) {
      return;
    }
    state.blockCache.input = null;
    state.blockCache.output = null;
    state.blockCache.outL = null;
    state.blockCache.outR = null;
    state.blockCache.inL = null;
    state.blockCache.inR = null;
    state.blockCache.memory = null;
    state.blockCache.size = 0;
    // Keep cursor — rebind recreates views; cursor still indexes the native side.
  };
  for (const state of this.pingPongDelayStates?.values?.() || []) {
    clear(state);
  }
  for (const state of this.reverbEffectStates?.values?.() || []) {
    clear(state);
  }
  for (const stereo of this.ladderFilterStates?.values?.() || []) {
    clear(stereo?.mono);
    clear(stereo?.left);
    clear(stereo?.right);
  }
  for (const state of this.polyBlepStates?.values?.() || []) {
    if (state?.blockCache) {
      state.blockCache.views = null;
      state.blockCache.memory = null;
      state.blockCache.size = 0;
    }
  }
  for (const state of this.softClipperStates?.values?.() || []) {
    clear(state);
  }
};

NodeLiveAudioProcessor.prototype.applyPingPongNativeParams = function applyPingPongNativeParams(native, state, params, safeRate) {
  if (!native?.soemdsp_ping_pong_delay_set_params || !state?.nativeHandle) {
    return;
  }
  const genBefore = Number(native.soemdsp_ping_pong_delay_memory_generation?.() || 0);
  native.soemdsp_ping_pong_delay_set_params(
    state.nativeHandle,
    Number(params.feedback) || 0,
    Number(params.mix) || 0,
    Number(params.level) || 0,
    Number(params.timeNumerator) || 0,
    Number(params.timeDenominator) || 1,
    Number(params.timingMode) || 0,
    Math.max(0, Number(params.offsetMs) || 0),
    Math.round(Number(params.lfoStyle) || 0),
    Number(params.lfoRate) || 0,
    Number(params.lfoVariation) || 0,
    Number(params.saturate) || 1,
    Number(params.lpfFrequency) || 8000,
    Number(params.hpfFrequency) || 20,
    Math.max(1, Number(this.timing?.tempoBpm) || 120),
    Math.max(1, Number(safeRate) || 44100),
  );
  const genAfter = Number(native.soemdsp_ping_pong_delay_memory_generation?.() || 0);
  if (genAfter !== genBefore) {
    this.invalidateAllNativeBlockViews();
  }
};

/**
 * One output sample. Collects into a native block; one WASM process_block per quantum.
 * Silence if native cold (no JS DSP twin — APP_POLICY §2).
 */
NodeLiveAudioProcessor.prototype.pingPongDelaySample = function pingPongDelaySample(state, input, params, rateHz = sampleRate) {
  const native = this.nativePingPongDelay;
  const nativeVer = Number(native?.soemdsp_ping_pong_delay_version?.() || 0);
  if (
    !this.nativePingPongDelayReady
    || nativeVer < 3
    || !native?.soemdsp_ping_pong_delay_create
    || !native?.soemdsp_ping_pong_delay_process_block
    || !native?.soemdsp_ping_pong_delay_set_params
  ) {
    const silent = state.outPorts || (state.outPorts = { Left: 0, Right: 0 });
    silent.Left = 0;
    silent.Right = 0;
    return silent;
  }

  try {
    if (!state.nativeHandle) {
      state.nativeHandle = native.soemdsp_ping_pong_delay_create();
      this.resetPingPongBlockCache(state);
    }
    if (!state.nativeHandle) {
      const silent = state.outPorts || (state.outPorts = { Left: 0, Right: 0 });
      silent.Left = 0;
      silent.Right = 0;
      return silent;
    }

    const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const blockSize = Math.min(
      NodeLiveAudioProcessor.PING_PONG_NATIVE_BLOCK_SIZE,
      Number(native.soemdsp_ping_pong_delay_max_block_frames?.()) || 128,
    );

    if (!this.bindPingPongBlockViews(native, state, blockSize)) {
      // Fallback: single-sample native export (still C++, not JS).
      this.applyPingPongNativeParams(native, state, params, safeRate);
      const left = native.soemdsp_ping_pong_delay_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, null),
        Number(params.feedback) || 0,
        Number(params.mix) || 0,
        Number(params.level) || 0,
        Number(params.timeNumerator) || 0,
        Number(params.timeDenominator) || 1,
        Number(params.timingMode) || 0,
        Math.max(0, Number(params.offsetMs) || 0),
        Math.round(Number(params.lfoStyle) || 0),
        Number(params.lfoRate) || 0,
        Number(params.lfoVariation) || 0,
        Number(params.saturate) || 1,
        Number(params.lpfFrequency) || 8000,
        Number(params.hpfFrequency) || 20,
        Math.max(1, Number(this.timing?.tempoBpm) || 120),
        safeRate,
      );
      const out = state.outPorts || (state.outPorts = { Left: 0, Right: 0 });
      out.Left = this.safeFilterNumber(left, null);
      out.Right = this.safeFilterNumber(native.soemdsp_ping_pong_delay_right(state.nativeHandle), null);
      return out;
    }

    const cache = state.blockCache;
    const index = cache.cursor;
    const outL = cache.outL[index] || 0;
    const outR = cache.outR[index] || 0;
    cache.input[index] = this.safeFilterNumber(input, null);
    cache.cursor += 1;

    if (cache.cursor >= blockSize) {
      this.applyPingPongNativeParams(native, state, params, safeRate);
      native.soemdsp_ping_pong_delay_process_block(state.nativeHandle, blockSize);
      cache.cursor = 0;
    }

    const out = state.outPorts || (state.outPorts = { Left: 0, Right: 0 });
    out.Left = outL;
    out.Right = outR;
    return out;
  } catch (error) {
    this.nativePingPongDelayReady = false;
    state.nativeHandle = 0;
    this.resetPingPongBlockCache(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "ping_pong_delay",
      status: "disabled",
      message: String(error?.message || error || "native Ping Pong Delay failed"),
    });
    const silent = state.outPorts || (state.outPorts = { Left: 0, Right: 0 });
    silent.Left = 0;
    silent.Right = 0;
    return silent;
  }
};
