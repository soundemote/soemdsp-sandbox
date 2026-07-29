NodeLiveAudioProcessor.prototype.createFlowerChildFilterState = function createFlowerChildFilterState() {
    return {
      phase: 0, phaseOffset: 0, stage1: 0, stage2: 0, selfMod: 0,
      rev3Feedback: 0, rev3Lpf1Y1: 0, rev3Lpf2Y1: 0, dsPhase: 0, dsHeld: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.flowerChildFilterRationalCurve = function flowerChildFilterRationalCurve(p, skew) {
    return ((1 + skew) * p) / (1 - skew + 2 * skew * p);
  };

NodeLiveAudioProcessor.prototype.flowerChildFilterSample = function flowerChildFilterSample(state, input, params, rate = sampleRate) {
    if (this.nativeFlowerChildFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeFlowerChildFilter.soemdsp_flower_child_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativeFlowerChildFilter.soemdsp_flower_child_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, state),
              this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1),
              this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1),
              Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0))),
              Math.max(1, Number(rate) || sampleRate || 44100),
            ),
            state,
          );
        }
      } catch (error) {
        this.nativeFlowerChildFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "flower_child_filter",
          status: "disabled",
          message: String(error?.message || error || "native Flower Child Filter failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

