NodeLiveAudioProcessor.prototype.createTriggerDividerState = function createTriggerDividerState() {
    return {
      count: 0,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.triggerDividerSampleJs = function triggerDividerSampleJs(state, trigger, reset, params, rate = sampleRate) {
    const safeTrigger = this.safeFilterNumber(trigger, null);
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const division = Math.max(1, Math.min(64, Math.round(this.safeFilterNumber(params.division, null))));
    const pulseTime = Math.max(0, this.safeFilterNumber(params.pulseTime, null));
    const level = this.safeFilterNumber(params.level, null);
    if (state.lastReset <= threshold && safeReset > threshold) {
      state.count = 0;
      state.remainingSamples = 0;
    }
    if (state.lastTrigger <= threshold && safeTrigger > threshold) {
      state.count = (state.count + 1) % division;
      if (state.count === 0) {
        state.remainingSamples = Math.max(1, Math.round(pulseTime * Math.max(1, rate)));
      }
    }
    state.lastTrigger = safeTrigger;
    state.lastReset = safeReset;
    const output = state.remainingSamples > 0 ? level : 0;
    state.remainingSamples = Math.max(0, state.remainingSamples - 1);
    return this.safeFilterNumber(output, null);
  };

NodeLiveAudioProcessor.prototype.triggerDividerSample = function triggerDividerSample(state, trigger, reset, params, rate = sampleRate) {
    if (this.nativeTriggerDividerReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeTriggerDivider.soemdsp_trigger_divider_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
          return this.safeFilterNumber(
            this.nativeTriggerDivider.soemdsp_trigger_divider_sample(
              state.nativeHandle,
              this.safeFilterNumber(trigger, null),
              this.safeFilterNumber(reset, null),
              this.safeFilterNumber(params.threshold, null),
              Math.max(1, Math.min(64, Math.round(this.safeFilterNumber(params.division, null)))),
              Math.max(0, this.safeFilterNumber(params.pulseTime, null)),
              this.safeFilterNumber(params.level, null),
              safeRate,
            ),
            null,
          );
        }
      } catch (error) {
        this.nativeTriggerDividerReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "trigger_divider",
          status: "disabled",
          message: String(error?.message || error || "native Trigger Divider failed"),
        });
      }
    }
    return this.triggerDividerSampleJs(state, trigger, reset, params, rate);
  };

