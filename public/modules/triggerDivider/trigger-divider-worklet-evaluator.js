NodeLiveAudioProcessor.prototype.createTriggerDividerState = function createTriggerDividerState() {
    return {
      count: 0,
      lastReset: 0,
      lastTrigger: 0,
      remainingSamples: 0,
      nativeHandle: 0,
    };
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
    // JS path: pure math (trigger-divider-math.js).
    if (typeof nodeGraphTriggerDividerCore === "function") {
      return this.safeFilterNumber(
        nodeGraphTriggerDividerCore(
          state,
          this.safeFilterNumber(trigger, null),
          this.safeFilterNumber(reset, null),
          params || {},
          rate,
        ),
        null,
      );
    }
    return 0;
  };

