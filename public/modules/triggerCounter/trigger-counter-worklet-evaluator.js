NodeLiveAudioProcessor.prototype.createTriggerCounterState = function createTriggerCounterState() {
    return {
      count: 0,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.triggerCounterSample = function triggerCounterSample(state, trigger, reset, params, rate = sampleRate) {
    if (this.nativeTriggerCounterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeTriggerCounter.soemdsp_trigger_counter_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
          const pulse = this.nativeTriggerCounter.soemdsp_trigger_counter_sample(
            state.nativeHandle,
            this.safeFilterNumber(trigger, null),
            this.safeFilterNumber(reset, null),
            this.safeFilterNumber(params.threshold, null),
            Math.max(1, this.safeFilterNumber(params.countMax, null)),
            Math.max(0, this.safeFilterNumber(params.increment, null)),
            Math.max(0, this.safeFilterNumber(params.pulseTime, null)),
            this.safeFilterNumber(params.level, null),
            safeRate,
          );
          return {
            Count: this.safeFilterNumber(this.nativeTriggerCounter.soemdsp_trigger_counter_count(state.nativeHandle), null),
            Pulse: this.safeFilterNumber(pulse, null),
          };
        }
      } catch (error) {
        this.nativeTriggerCounterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "trigger_counter",
          status: "disabled",
          message: String(error?.message || error || "native Trigger Counter failed"),
        });
      }
    }
    return { Count: 0, Pulse: 0 };
  };

