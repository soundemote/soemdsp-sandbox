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
    return this.safeFilterNumber(input, state) ?? 0;
  };

