NodeLiveAudioProcessor.prototype.createDelayEffectState = function createDelayEffectState() {
    return {
      buffer: new Float32Array(1),
      bufferSize: 1,
      lfoPhase: 0,
      lfoVariationState: 0,
      position: 0,
      wet: 0,
      nativeHandle: 0,
      nativeSeed: 0,
      nativeSeedKey: "",
    };
  };

NodeLiveAudioProcessor.prototype.createStereoDelayEffectState = function createStereoDelayEffectState() {
    return {
      left: this.createDelayEffectState(),
      mono: this.createDelayEffectState(),
      right: this.createDelayEffectState(),
    };
  };

NodeLiveAudioProcessor.prototype.delayParabolSample = function delayParabolSample(phase) {
    const wrapped = phase - Math.floor(phase);
    return wrapped < 0.5 ? wrapped * 4 - 1 : 3 - wrapped * 4;
  };

NodeLiveAudioProcessor.prototype.delayEffectSample = function delayEffectSample(state, input, params, rateHz = sampleRate, nodeId = "") {
    if (
      this.nativeDelayEffectReady &&
      this.nativeDelayEffect?.soemdsp_delay_effect_create &&
      this.nativeDelayEffect?.soemdsp_delay_effect_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeDelayEffect.soemdsp_delay_effect_create();
        }
        if (state.nativeHandle) {
          const seedKey = `${nodeId}:delayVariation`;
          if (state.nativeSeedKey !== seedKey) {
            state.nativeSeedKey = seedKey;
            state.nativeSeed = this.stableSeed(seedKey);
          }
          const safeRateValue = Math.max(1, Number(rateHz) || 44100);
          const modeValue = Math.round(this.safeFilterNumber(params.mode, null)) >= 1 ? 1 : 0;
          this.nativeDelayEffect.soemdsp_delay_effect_sample(
            state.nativeHandle,
            Number(input) || 0,
            this.clampValue(Number(params.time) || 0, 0.001, 4.25),
            this.clampValue(Number(params.feedback) || 0, 0, 0.95),
            this.clampValue(Number(params.mix) || 0, 0, 1),
            this.clampValue(Number(params.level) || 0, 0, 2),
            this.clampValue(Number(params.modAmount) || 0, 0, 0.5),
            this.clampValue(Number(params.modRate) || 0, 0, 90),
            this.clampValue(Number(params.modVariation) || 0, 0, 1),
            modeValue,
            state.nativeSeed >>> 0,
            safeRateValue,
          );
          return {
            Out: this.nativeDelayEffect.soemdsp_delay_effect_out(state.nativeHandle),
            Wet: this.nativeDelayEffect.soemdsp_delay_effect_wet(state.nativeHandle),
          };
        }
      } catch (error) {
        this.nativeDelayEffectReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "delay_effect",
          status: "disabled",
          message: String(error?.message || error || "native Delay Effect failed"),
        });
      }
    }
    return { Out: 0, Wet: 0 };
  };

