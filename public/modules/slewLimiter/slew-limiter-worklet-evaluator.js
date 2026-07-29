NodeLiveAudioProcessor.prototype.createSlewLimiterState = function createSlewLimiterState() {
    return {
      initialized: false,
      out: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.createStereoSlewLimiterState = function createStereoSlewLimiterState() {
    return {
      left: this.createSlewLimiterState(),
      mono: this.createSlewLimiterState(),
      right: this.createSlewLimiterState(),
    };
  };

NodeLiveAudioProcessor.prototype.slewLimiterSample = function slewLimiterSample(state, input, upTime, downTime, rate = sampleRate) {
    if (this.nativeSlewLimiterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeSlewLimiter.soemdsp_slew_limiter_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
          return this.safeFilterNumber(
            this.nativeSlewLimiter.soemdsp_slew_limiter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              Math.max(0, this.safeFilterNumber(upTime, state)),
              Math.max(0, this.safeFilterNumber(downTime, state)),
              safeRate,
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeSlewLimiterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "slew_limiter",
          status: "disabled",
          message: String(error?.message || error || "native Slew Limiter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

