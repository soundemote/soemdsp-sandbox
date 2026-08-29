// Soft Clipper — native/WASM only (APP_POLICY §0 / §2).
// JS hosts graph I/O; C++ owns shaping via process_block. No JS DSP twin.

NodeLiveAudioProcessor.SOFT_CLIPPER_NATIVE_BLOCK_SIZE = 128;

NodeLiveAudioProcessor.prototype.createSoftClipperState = function createSoftClipperState() {
  return {
    nativeHandle: 0,
    cachedParams: null,
    outPorts: { Out: 0, Left: 0, Right: 0 },
    blockCache: {
      cursor: 0,
      size: 0,
      memory: null,
      in0: null,
      in1: null,
      in2: null,
      out0: null,
      out1: null,
      out2: null,
      activeMask: 0, // bit0 mono, bit1 left, bit2 right filled this block
    },
  };
};

NodeLiveAudioProcessor.prototype.destroySoftClipperState = function destroySoftClipperState(state) {
  if (state?.nativeHandle && this.nativeSoftClipper?.soemdsp_soft_clipper_destroy) {
    try {
      this.nativeSoftClipper.soemdsp_soft_clipper_destroy(state.nativeHandle);
    } catch (_) { /* ignore */ }
  }
  if (state) {
    state.nativeHandle = 0;
    state.blockCache = null;
  }
};

NodeLiveAudioProcessor.prototype.bindSoftClipperBlockViews = function bindSoftClipperBlockViews(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.out0 && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const ptrs = [];
  for (let ch = 0; ch < 3; ch += 1) {
    const inPtr = native.soemdsp_soft_clipper_block_input_ptr?.(state.nativeHandle, ch);
    const outPtr = native.soemdsp_soft_clipper_block_output_ptr?.(state.nativeHandle, ch);
    if (!inPtr || !outPtr) {
      return false;
    }
    ptrs[ch] = {
      input: new Float64Array(memory.buffer, inPtr, blockSize),
      output: new Float64Array(memory.buffer, outPtr, blockSize),
    };
  }
  cache.in0 = ptrs[0].input;
  cache.out0 = ptrs[0].output;
  cache.in1 = ptrs[1].input;
  cache.out1 = ptrs[1].output;
  cache.in2 = ptrs[2].input;
  cache.out2 = ptrs[2].output;
  cache.memory = memory.buffer;
  cache.size = blockSize;
  cache.cursor = 0;
  cache.activeMask = 0;
  cache.out0.fill(0);
  cache.out1.fill(0);
  cache.out2.fill(0);
  return true;
};

NodeLiveAudioProcessor.prototype.applySoftClipperNativeParams = function applySoftClipperNativeParams(
  native,
  state,
  center,
  width,
  oversample,
) {
  if (!native?.soemdsp_soft_clipper_set_params || !state?.nativeHandle) {
    return;
  }
  const os = Math.round(Number(oversample));
  const osMode = os >= 2 ? 2 : (os > 0 ? 1 : 0);
  const antialias = osMode > 0 ? 1 : 0;
  native.soemdsp_soft_clipper_set_params(
    state.nativeHandle,
    Number(center) || 0,
    Number(width) || 2,
    antialias,
    osMode,
  );
};

/**
 * Process one channel sample through soft clipper (native block path).
 * Silence if WASM cold — no JS math twin.
 */
NodeLiveAudioProcessor.prototype.nativeSoftClipperSample = function nativeSoftClipperSample(
  input,
  center = 0,
  width = 2,
  state = null,
  oversample = 2,
  channel = 0,
) {
  if (!state) {
    return 0;
  }
  const native = this.nativeSoftClipper;
  const nativeVer = Number(native?.soemdsp_soft_clipper_version?.() || 0);
  if (
    !this.nativeSoftClipperReady
    || nativeVer < 4
    || !native?.soemdsp_soft_clipper_create
    || !native?.soemdsp_soft_clipper_process_block
    || !native?.soemdsp_soft_clipper_set_params
  ) {
    return 0;
  }

  try {
    if (!state.nativeHandle) {
      state.nativeHandle = native.soemdsp_soft_clipper_create();
      state.blockCache = null;
    }
    if (!state.nativeHandle) {
      return 0;
    }

    const ch = channel === 1 ? 1 : (channel === 2 ? 2 : 0);
    const blockSize = Math.min(
      NodeLiveAudioProcessor.SOFT_CLIPPER_NATIVE_BLOCK_SIZE,
      Number(native.soemdsp_soft_clipper_max_block_frames?.()) || 128,
    );

    if (!this.bindSoftClipperBlockViews(native, state, blockSize)) {
      // Per-sample native fallback (still C++, not JS).
      this.applySoftClipperNativeParams(native, state, center, width, oversample);
      const os = Math.round(Number(oversample));
      if (os <= 0) {
        return this.safeFilterNumber(
          native.soemdsp_soft_clipper_sample(Number(input) || 0, Number(center) || 0, Number(width) || 2),
          null,
        );
      }
      return this.safeFilterNumber(
        native.soemdsp_soft_clipper_sample_aa(
          state.nativeHandle,
          ch,
          Number(input) || 0,
          Number(center) || 0,
          Number(width) || 2,
          1,
        ),
        null,
      );
    }

    const cache = state.blockCache;
    const index = cache.cursor;
    const inBuf = ch === 1 ? cache.in1 : (ch === 2 ? cache.in2 : cache.in0);
    const outBuf = ch === 1 ? cache.out1 : (ch === 2 ? cache.out2 : cache.out0);
    const y = outBuf[index] || 0;
    inBuf[index] = Number(input) || 0;
    cache.activeMask |= (1 << ch);

    // Advance cursor only once per sample (mono call is authoritative when stereoProcessPorts runs mono first).
    if (ch === 0) {
      cache.cursor += 1;
      if (cache.cursor >= blockSize) {
        this.applySoftClipperNativeParams(native, state, center, width, oversample);
        if (cache.activeMask & 1) {
          native.soemdsp_soft_clipper_process_block(state.nativeHandle, 0, blockSize);
        }
        if (cache.activeMask & 2) {
          native.soemdsp_soft_clipper_process_block(state.nativeHandle, 1, blockSize);
        }
        if (cache.activeMask & 4) {
          native.soemdsp_soft_clipper_process_block(state.nativeHandle, 2, blockSize);
        }
        cache.cursor = 0;
        cache.activeMask = 0;
      }
    }
    return this.safeFilterNumber(y, null);
  } catch (error) {
    this.nativeSoftClipperReady = false;
    state.nativeHandle = 0;
    state.blockCache = null;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "soft_clipper",
      status: "disabled",
      message: String(error?.message || error || "native Soft Clipper failed"),
    });
    return 0;
  }
};
