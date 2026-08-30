NodeLiveAudioProcessor.prototype.createChaoticPhaseLockingFilterState = function createChaoticPhaseLockingFilterState() {
    return { feedbackSignal: 0, filterY: [0,0,0,0,0], dcY: [0,0,0,0,0], nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.chaoticPhaseLockingFilterSample = function chaoticPhaseLockingFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeChaoticPhaseLockingFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeChaoticPhaseLockingFilter.soemdsp_chaotic_phase_locking_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeChaoticPhaseLockingFilter.soemdsp_chaotic_phase_locking_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeChaoticPhaseLockingFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chaotic_phase_locking_filter",
          status: "disabled",
          message: String(error?.message || error || "native Chaotic Phaselocking Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

