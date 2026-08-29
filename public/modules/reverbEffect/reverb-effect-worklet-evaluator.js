NodeLiveAudioProcessor.prototype.createSabrinaReverbState = function createSabrinaReverbState() {
    return {
      nativeHandle: 0,
      nativeParamKey: "",
      nativeSampleRate: 0,
      isIdle: true,
      idleClock: 0,
      idleIncrement: 0,
      cachedParams: null,
      out: { "Dry L": 0, "Dry R": 0, "Mix L": 0, "Mix R": 0 },
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
    const near = (a, b) => (typeof nodeGraphIsNear === "function"
      ? nodeGraphIsNear(a, b)
      : Math.abs(a - b) < (typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7));
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

// soemdsp::dynamics::SilenceDetector — clock 0→1 in 1s (timeToIncrement(1)),
// level = Planck (NODE_GRAPH_PLANCK / 1e-7). Reverb::runWithIdleDetection
// feeds in+fb+wet+dry.
NodeLiveAudioProcessor.prototype.sabrinaSilenceDetectorRun = function sabrinaSilenceDetectorRun(state, level) {
    const planck = typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7;
    const absIn = level < 0 ? -level : level;
    state.idleClock += state.idleIncrement;
    if (absIn >= planck) {
      state.isIdle = false;
      state.idleClock = 0;
    } else if (state.idleClock > 1) {
      state.isIdle = true;
    }
    return state.isIdle;
  };

NodeLiveAudioProcessor.prototype.sabrinaWriteOut = function sabrinaWriteOut(state, dryLeft, dryRight, mixLeft, mixRight) {
    const out = state.out || (state.out = { "Dry L": 0, "Dry R": 0, "Mix L": 0, "Mix R": 0 });
    out["Dry L"] = dryLeft;
    out["Dry R"] = dryRight;
    out["Mix L"] = mixLeft;
    out["Mix R"] = mixRight;
    return out;
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
    const dryLeft = Number.isFinite(leftInput) ? leftInput : 0;
    const dryRight = Number.isFinite(rightInput) ? rightInput : dryLeft;
    const heldMixL = Number(state.out?.["Mix L"]) || 0;
    const heldMixR = Number(state.out?.["Mix R"]) || 0;
    const heldWet = Number(state.lastWet) || 0;
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.idleIncrement || state.nativeSampleRate !== safeRate) {
        state.idleIncrement = 1 / safeRate;
      }
      // Idle fast-path only when dry input is truly silent. The C++ idle
      // clock is ~1s — taking this shortcut while dry is live desyncs the
      // process_block cursor and clicks in a ~1s rhythm.
      const blockPending = (state.blockCache?.cursor || 0) > 0;
      const drySilent = Math.abs(dryLeft) < 1e-7 && Math.abs(dryRight) < 1e-7;
      if (state.isIdle && state.nativeHandle && !blockPending && drySilent) {
        this.sabrinaSilenceDetectorRun(
          state,
          dryLeft + dryRight + heldMixL + heldMixR + heldWet,
        );
        if (state.isIdle) {
          return this.sabrinaWriteOut(state, dryLeft, dryRight, heldMixL, heldMixR);
        }
      }
      if (state._wasIdle && !state.isIdle) {
        // Waking: drop partial block so we don't mix stale outs with new DSP.
        if (state.blockCache) {
          state.blockCache.cursor = 0;
        }
      }
      state._wasIdle = Boolean(state.isIdle);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
          native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_sabrina_reverb_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
        state.nativeBoundParams = null;
        state.isIdle = true;
        state.idleClock = 0;
        state.idleIncrement = 1 / safeRate;
        state.lastWet = 0;
        this.resetSabrinaBlockCache(state);
        if (state.nativeHandle && native.soemdsp_sabrina_reverb_set_params) {
          this.applySabrinaDspBindingIfDirty(native, state, params);
        }
      }
      if (!state.nativeHandle) {
        return null;
      }
      if (frame === 0 || !state.nativeBoundParams) {
        this.applySabrinaDspBindingIfDirty(native, state, params);
      }
      const blockSize = NodeLiveAudioProcessor.SABRINA_NATIVE_BLOCK_SIZE;
      if (
        native.soemdsp_sabrina_reverb_process_block &&
        this.bindSabrinaBlockViews(native, state, blockSize)
      ) {
        const cache = state.blockCache;
        const index = cache.cursor;
        const mixLeft = cache.outL[index] || 0;
        const mixRight = cache.outR[index] || 0;
        cache.inL[index] = dryLeft;
        cache.inR[index] = dryRight;
        cache.cursor += 1;
        if (cache.cursor >= blockSize) {
          native.soemdsp_sabrina_reverb_process_block(state.nativeHandle, blockSize, 1);
          cache.cursor = 0;
          const wetL = Number(native.soemdsp_sabrina_reverb_wet_left?.(state.nativeHandle)) || 0;
          const wetR = Number(native.soemdsp_sabrina_reverb_wet_right?.(state.nativeHandle)) || 0;
          state.lastWet = wetL + wetR;
          if (native.soemdsp_sabrina_reverb_is_idle) {
            state.isIdle = native.soemdsp_sabrina_reverb_is_idle(state.nativeHandle) === 1;
            if (state.isIdle) {
              state.idleClock = 1;
            }
          }
        }
        return this.sabrinaWriteOut(state, dryLeft, dryRight, mixLeft, mixRight);
      }
      native.soemdsp_sabrina_reverb_process(state.nativeHandle, dryLeft, dryRight);
      const mixLeft = Number(native.soemdsp_sabrina_reverb_left?.(state.nativeHandle)) || 0;
      const mixRight = Number(native.soemdsp_sabrina_reverb_right?.(state.nativeHandle)) || 0;
      const wetL = Number(native.soemdsp_sabrina_reverb_wet_left?.(state.nativeHandle)) || 0;
      const wetR = Number(native.soemdsp_sabrina_reverb_wet_right?.(state.nativeHandle)) || 0;
      state.lastWet = wetL + wetR;
      if (native.soemdsp_sabrina_reverb_is_idle) {
        state.isIdle = native.soemdsp_sabrina_reverb_is_idle(state.nativeHandle) === 1;
        if (state.isIdle) {
          state.idleClock = 1;
        }
      }
      return this.sabrinaWriteOut(state, dryLeft, dryRight, mixLeft, mixRight);
    } catch (error) {
      this.nativeSabrinaReverbReady = false;
      if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
        native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
      }
      state.nativeHandle = 0;
      state.nativeParamKey = "";
      state.nativeBoundParams = null;
      state.isIdle = true;
      state.idleClock = 0;
      state.lastWet = 0;
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
    const nativeOutput = this.nativeSabrinaReverbSample(state, leftInput, rightInput, params, rateHz, frame);
    if (nativeOutput) {
      return nativeOutput;
    }
    const dryLeft = Number.isFinite(leftInput) ? leftInput : 0;
    const dryRight = Number.isFinite(rightInput) ? rightInput : dryLeft;
    return this.sabrinaWriteOut(state, dryLeft, dryRight, dryLeft, dryRight);
  };

