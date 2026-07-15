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

NodeLiveAudioProcessor.prototype.delayedTriggerSampleJs = function delayedTriggerSampleJs(state, trigger, reset, params, rateHz = sampleRate) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const delay = Math.max(0, this.safeFilterNumber(params.delay, null));
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, null));
    const level = this.safeFilterNumber(params.level, null);
    const rate = Math.max(1, rateHz || sampleRate || 44100);

    if (state.lastReset <= threshold && safeReset > threshold) {
      state.hasTriggered = true;
      state.remainingSamples = 0;
      state.running = false;
      state.waitSamples = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.hasTriggered = false;
      state.remainingSamples = 0;
      state.running = true;
      state.waitSamples = Math.max(0, Math.round(delay * rate));
    }

    if (state.running && !state.hasTriggered) {
      if (state.waitSamples <= 0) {
        state.hasTriggered = true;
        state.running = false;
        state.remainingSamples = Math.max(1, Math.round(pulseTime * rate));
      } else {
        state.waitSamples -= 1;
      }
    }

    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    const output = state.remainingSamples > 0 ? level : 0;
    state.remainingSamples = Math.max(0, state.remainingSamples - 1);
    return this.safeFilterNumber(output, null);
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
    return this.delayedTriggerSampleJs(state, trigger, reset, params, rateHz);
  };

