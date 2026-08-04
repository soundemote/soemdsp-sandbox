NodeLiveAudioProcessor.prototype.createSabrinaReverbState = function createSabrinaReverbState() {
    return {
      nativeHandle: 0,
      nativeParamKey: "",
      nativeSampleRate: 0,
      idleCounter: 0,
      isIdle: false,
    };
  };

NodeLiveAudioProcessor.prototype.applySabrinaDspBindingIfDirty = function applySabrinaDspBindingIfDirty(native, state, params) {
    const safeParams = {
      delaySize: this.clampValue(this.safeFilterNumber(params.delaySize, null), 0, 1),
      diffusionAmount: this.clampValue(this.safeFilterNumber(params.diffusionAmount, null), 0, 0.98),
      diffusionSize: this.clampValue(this.safeFilterNumber(params.diffusionSize, null), 0, 1),
      lfoAmplitude: this.clampValue(this.safeFilterNumber(params.lfoAmplitude, null), 0, 1),
      lfoBaseSpeed: this.clampValue(this.safeFilterNumber(params.lfoBaseSpeed, null), 0, 1),
      lfoVariation: this.clampValue(this.safeFilterNumber(params.lfoVariation, null), 0, 1),
      mix: this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1),
      recycle: this.clampValue(this.safeFilterNumber(params.recycle, null), 0, 0.98),
      seed: Math.max(0, Math.min(99999, Math.round(this.safeFilterNumber(params.seed, null) ?? 0))),
    };
    const paramKey = [
      safeParams.mix,
      safeParams.diffusionSize,
      safeParams.diffusionAmount,
      safeParams.delaySize,
      safeParams.recycle,
      safeParams.lfoAmplitude,
      safeParams.lfoBaseSpeed,
      safeParams.lfoVariation,
    ].map((value) => Math.round(value * 1000000)).join(":") + `:${safeParams.seed}`;
    if (paramKey === state.nativeParamKey || !native.soemdsp_sabrina_reverb_set_params) {
      return;
    }
    state.nativeParamKey = paramKey;
    native.soemdsp_sabrina_reverb_set_params(
      state.nativeHandle,
      safeParams.mix,
      safeParams.diffusionSize,
      safeParams.diffusionAmount,
      safeParams.delaySize,
      safeParams.recycle,
      safeParams.lfoAmplitude,
      safeParams.lfoBaseSpeed,
      safeParams.lfoVariation,
      safeParams.seed,
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
        state.idleCounter = 0;
        state.isIdle = false;
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
      this.applySabrinaDspBindingIfDirty(native, state, params);
      const dryLeft = this.safeFilterNumber(leftInput, null);
      const dryRight = this.safeFilterNumber(rightInput, null);
      const inputActive = Math.abs(dryLeft) >= 0.000001 || Math.abs(dryRight) >= 0.000001;
      if (inputActive) {
        state.isIdle = false;
        state.idleCounter = 0;
      }
      // Bypass mode: reverb is idle, pass dry signal straight through all outputs
      if (state.isIdle) {
        // Dry L/R then Wet L/R (legacy Mix/Left Dry via outputAliases).
        return { "Dry L": dryLeft, "Dry R": dryRight, "Wet L": dryLeft, "Wet R": dryRight };
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
      return { "Dry L": dryLeft, "Dry R": dryRight, "Wet L": mixLeft, "Wet R": mixRight };
    } catch (error) {
      this.nativeSabrinaReverbReady = false;
      if (state.nativeHandle && native.soemdsp_sabrina_reverb_destroy) {
        native.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
      }
      state.nativeHandle = 0;
      state.nativeParamKey = "";
      state.idleCounter = 0;
      state.isIdle = false;
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
    return { "Dry L": dryLeft, "Dry R": dryRight, "Wet L": dryLeft, "Wet R": dryRight };
  };

