NodeLiveAudioProcessor.prototype.createSabrinaReverbState = function createSabrinaReverbState() {
    return {
      nativeHandle: 0,
      nativeParamKey: "",
      nativeSampleRate: 0,
      idleCounter: 0,
      isIdle: false,
      cachedParams: null,
      blockCache: {
        cursor: 0,
        size: 0,
        inL: null,
        inR: null,
        outL: null,
        outR: null,
        memory: null,
      },
    };
  };

NodeLiveAudioProcessor.prototype.resetSabrinaBlockCache = function resetSabrinaBlockCache(state) {
    if (!state?.blockCache) {
      return;
    }
    state.blockCache.cursor = 0;
    state.blockCache.size = 0;
    state.blockCache.inL = null;
    state.blockCache.inR = null;
    state.blockCache.outL = null;
    state.blockCache.outR = null;
    state.blockCache.memory = null;
  };

NodeLiveAudioProcessor.prototype.bindSabrinaBlockViews = function bindSabrinaBlockViews(native, state, blockSize) {
    const memory = native?.memory;
    if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
      return false;
    }
    const cache = state.blockCache || (state.blockCache = {});
    if (
      cache.inL &&
      cache.memory === memory.buffer &&
      cache.size === blockSize
    ) {
      return true;
    }
    const inLPtr = native.soemdsp_sabrina_reverb_block_input_left_ptr?.(state.nativeHandle);
    const inRPtr = native.soemdsp_sabrina_reverb_block_input_right_ptr?.(state.nativeHandle);
    const outLPtr = native.soemdsp_sabrina_reverb_block_output_left_ptr?.(state.nativeHandle);
    const outRPtr = native.soemdsp_sabrina_reverb_block_output_right_ptr?.(state.nativeHandle);
    if (!inLPtr || !inRPtr || !outLPtr || !outRPtr) {
      return false;
    }
    cache.inL = new Float64Array(memory.buffer, inLPtr, blockSize);
    cache.inR = new Float64Array(memory.buffer, inRPtr, blockSize);
    cache.outL = new Float64Array(memory.buffer, outLPtr, blockSize);
    cache.outR = new Float64Array(memory.buffer, outRPtr, blockSize);
    cache.memory = memory.buffer;
    cache.size = blockSize;
    cache.outL.fill(0);
    cache.outR.fill(0);
    return true;
  };

NodeLiveAudioProcessor.prototype.applySabrinaDspBindingIfDirty = function applySabrinaDspBindingIfDirty(native, state, params) {
    if (!native.soemdsp_sabrina_reverb_set_params) {
      return;
    }
    const delaySize = this.clampValue(this.safeFilterNumber(params.delaySize, null), 0, 1);
    const diffusionAmount = this.clampValue(this.safeFilterNumber(params.diffusionAmount, null), 0, 0.98);
    const diffusionSize = this.clampValue(this.safeFilterNumber(params.diffusionSize, null), 0, 1);
    const lfoAmplitude = this.clampValue(this.safeFilterNumber(params.lfoAmplitude, null), 0, 1);
    const lfoBaseSpeed = this.clampValue(this.safeFilterNumber(params.lfoBaseSpeed, null), 0, 1);
    const lfoVariation = this.clampValue(this.safeFilterNumber(params.lfoVariation, null), 0, 1);
    const mix = this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1);
    const recycle = this.clampValue(this.safeFilterNumber(params.recycle, null), 0, 0.98);
    const seed = Math.max(0, Math.min(99999, Math.round(this.safeFilterNumber(params.seed, null) ?? 0)));
    const prev = state.nativeBoundParams;
    const near = (a, b) => Math.abs(a - b) < 1e-7;
    if (
      prev &&
      near(prev.delaySize, delaySize) &&
      near(prev.diffusionAmount, diffusionAmount) &&
      near(prev.diffusionSize, diffusionSize) &&
      near(prev.lfoAmplitude, lfoAmplitude) &&
      near(prev.lfoBaseSpeed, lfoBaseSpeed) &&
      near(prev.lfoVariation, lfoVariation) &&
      near(prev.mix, mix) &&
      near(prev.recycle, recycle) &&
      prev.seed === seed
    ) {
      return;
    }
    state.nativeBoundParams = {
      delaySize,
      diffusionAmount,
      diffusionSize,
      lfoAmplitude,
      lfoBaseSpeed,
      lfoVariation,
      mix,
      recycle,
      seed,
    };
    state.nativeParamKey = `${mix}:${diffusionSize}:${diffusionAmount}:${delaySize}:${recycle}:${lfoAmplitude}:${lfoBaseSpeed}:${lfoVariation}:${seed}`;
    native.soemdsp_sabrina_reverb_set_params(
      state.nativeHandle,
      mix,
      diffusionSize,
      diffusionAmount,
      delaySize,
      recycle,
      lfoAmplitude,
      lfoBaseSpeed,
      lfoVariation,
      seed,
    );
  };

NodeLiveAudioProcessor.prototype.nativeSabrinaReverbSample = function nativeSabrinaReverbSample(state, leftInput, rightInput, params, rateHz = sampleRate, frame = 0) {
    const native = this.nativeSabrinaReverb;
    if (
      !this.nativeSabrinaReverbReady ||
      !native?.soemdsp_sabrina_reverb_create ||
      !native?.soemdsp_sabrina_reverb_process
    ) {
      return null;
    }
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
          native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_sabrina_reverb_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
        state.nativeBoundParams = null;
        state.idleCounter = 0;
        state.isIdle = false;
        this.resetSabrinaBlockCache(state);
        // Force-apply params on handle creation: the native reverb initializes
        // with hardcoded defaults, and if the WASM exports load in two steps
        // (create before set_params), the normal paramKey check can miss the
        // first opportunity. Force-apply now so the reverb always starts with
        // the patch's actual parameter values.
        if (state.nativeHandle && native.soemdsp_sabrina_reverb_set_params) {
          this.applySabrinaDspBindingIfDirty(native, state, params);
        }
      }
      if (!state.nativeHandle) {
        return null;
      }
      // Params are resolved once per worklet quantum. Skip the 8-clamp
      // dirty walk on the other 127 samples unless nothing is bound yet.
      if (frame === 0 || !state.nativeBoundParams) {
        this.applySabrinaDspBindingIfDirty(native, state, params);
      }
      const dryLeft = this.safeFilterNumber(leftInput, null);
      const dryRight = this.safeFilterNumber(rightInput, null);
      const inputActive = Math.abs(dryLeft) >= 0.000001 || Math.abs(dryRight) >= 0.000001;
      if (inputActive) {
        state.isIdle = false;
        state.idleCounter = 0;
      }
      // Bypass mode: reverb is idle, pass dry signal straight through all outputs
      if (state.isIdle) {
        // Dry = pure input; Mix = dry/wet blend (no wet-only outs).
        return { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": dryLeft, "Mix R": dryRight };
      }
      const blockSize = NodeLiveAudioProcessor.SABRINA_NATIVE_BLOCK_SIZE;
      if (
        native.soemdsp_sabrina_reverb_process_block &&
        this.bindSabrinaBlockViews(native, state, blockSize)
      ) {
        const cache = state.blockCache;
        const index = cache.cursor;
        const mixLeft = this.safeFilterNumber(cache.outL[index], null);
        const mixRight = this.safeFilterNumber(cache.outR[index], null);
        cache.inL[index] = dryLeft;
        cache.inR[index] = dryRight;
        cache.cursor += 1;
        if (cache.cursor >= blockSize) {
          native.soemdsp_sabrina_reverb_process_block(state.nativeHandle, blockSize, 1);
          cache.cursor = 0;
        }
        const outputPeak = Math.max(Math.abs(mixLeft), Math.abs(mixRight));
        if (outputPeak < 0.000001) {
          state.idleCounter += 1;
          if (state.idleCounter >= safeRate) {
            state.isIdle = true;
          }
        } else {
          state.idleCounter = 0;
        }
        return { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": mixLeft, "Mix R": mixRight };
      }
      native.soemdsp_sabrina_reverb_process(state.nativeHandle, dryLeft, dryRight);
      const mixLeft = this.safeFilterNumber(native.soemdsp_sabrina_reverb_left?.(state.nativeHandle), null);
      const mixRight = this.safeFilterNumber(native.soemdsp_sabrina_reverb_right?.(state.nativeHandle), null);
      const outputPeak = Math.max(Math.abs(mixLeft), Math.abs(mixRight));
      if (outputPeak < 0.000001) {
        state.idleCounter += 1;
        if (state.idleCounter >= safeRate) {
          state.isIdle = true;
        }
      } else {
        state.idleCounter = 0;
      }
      return { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": mixLeft, "Mix R": mixRight };
    } catch (error) {
      this.nativeSabrinaReverbReady = false;
      if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
        native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
      }
      state.nativeHandle = 0;
      state.nativeParamKey = "";
      state.nativeBoundParams = null;
      state.idleCounter = 0;
      state.isIdle = false;
      this.resetSabrinaBlockCache(state);
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sabrina_reverb",
        status: "disabled",
        message: String(error?.message || error || "native Sabrina failed"),
      });
      return null;
    }
  };

NodeLiveAudioProcessor.prototype.sabrinaReverbSample = function sabrinaReverbSample(state, leftInput, rightInput, params, rateHz = sampleRate, frame = 0) {
    const dryLeft = this.safeFilterNumber(leftInput, null);
    const dryRight = this.safeFilterNumber(rightInput, null);
    const nativeOutput = this.nativeSabrinaReverbSample(state, leftInput, rightInput, params, rateHz, frame);
    if (nativeOutput) {
      return nativeOutput;
    }
    return { "Dry L": dryLeft, "Dry R": dryRight, "Mix L": dryLeft, "Mix R": dryRight };
  };

