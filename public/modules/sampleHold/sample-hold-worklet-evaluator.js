NodeLiveAudioProcessor.prototype.createSampleHoldState = function createSampleHoldState() {
    return {
      clockPhase: 0,
      held: 0,
      lastTrigger: 0,
      noise: this.createNoiseGeneratorChannelState(),
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.createStereoSampleHoldState = function createStereoSampleHoldState() {
    return {
      left: this.createSampleHoldState(),
      mono: this.createSampleHoldState(),
      right: this.createSampleHoldState(),
    };
  };

NodeLiveAudioProcessor.prototype.sampleHoldSampleJs = function sampleHoldSampleJs(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, nodeId) {
    this.resetSeededState(state.noise, nodeId, 0, "sampleHoldNoise");
    const safeInput = hasInConnected
      ? this.safeFilterNumber(input, null)
      : this.nextSeededBipolar(state.noise);
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeThreshold = this.safeFilterNumber(threshold, null);
    const safeFreq = Math.max(0, Number(sampleFrequency) || 0);
    const safeRate = Math.max(1, Number(sampleRate) || 44100);
    let internalFire = false;
    if (safeFreq > 0) {
      state.clockPhase += safeFreq / safeRate;
      if (state.clockPhase >= 1) {
        state.clockPhase -= Math.floor(state.clockPhase);
        internalFire = true;
      }
    }
    if ((state.lastTrigger <= safeThreshold && safeTrigger > safeThreshold) || internalFire) {
      state.held = safeInput;
    }
    state.lastTrigger = safeTrigger;
    return this.safeFilterNumber(state.held, null);
  };

NodeLiveAudioProcessor.prototype.sampleHoldSample = function sampleHoldSample(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, nodeId) {
    if (this.nativeSampleHoldReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeSampleHold.soemdsp_sample_hold_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(sampleRate) || 44100);
          const seedKey = this.seededKey(nodeId, 0, "sampleHoldNoise");
          const seedInt = this.stableSeed(seedKey) | 0;
          return this.safeFilterNumber(
            this.nativeSampleHold.soemdsp_sample_hold_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, null),
              this.safeFilterNumber(trigger, null),
              this.safeFilterNumber(threshold, null),
              Math.max(0, Number(sampleFrequency) || 0),
              safeRate,
              hasInConnected ? 1 : 0,
              seedInt,
            ),
            null,
          );
        }
      } catch (error) {
        this.nativeSampleHoldReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sample_hold",
          status: "disabled",
          message: String(error?.message || error || "native Sample & Hold failed"),
        });
      }
    }
    return this.sampleHoldSampleJs(state, input, trigger, threshold, sampleFrequency, sampleRate, hasInConnected, nodeId);
  };

