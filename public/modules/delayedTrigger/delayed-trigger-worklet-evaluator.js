NodeLiveAudioProcessor.prototype.createDelayedTriggerState = function createDelayedTriggerState() {
    return {
      hasTriggered: true,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
      running: false,
      waitSamples: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.delayedTriggerSample = function delayedTriggerSample(state, trigger, reset, params, rateHz = sampleRate) {
    if (this.nativeDelayedTriggerReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeDelayedTrigger.soemdsp_delayed_trigger_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
          return this.safeFilterNumber(
            this.nativeDelayedTrigger.soemdsp_delayed_trigger_sample(
              state.nativeHandle,
              this.safeFilterNumber(trigger, null),
              this.safeFilterNumber(reset, null),
              this.safeFilterNumber(params.threshold, null),
              Math.max(0, this.safeFilterNumber(params.delay, null)),
              Math.max(0, this.safeFilterNumber(params.pulseTime, null)),
              this.safeFilterNumber(params.level, null),
              safeRate,
            ),
            null,
          );
        }
      } catch (error) {
        this.nativeDelayedTriggerReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "delayed_trigger",
          status: "disabled",
          message: String(error?.message || error || "native Delayed Trigger failed"),
        });
      }
    }
    return 0;
  };

