NodeLiveAudioProcessor.prototype.createFlowerChildEnvelopeFollowerState = function createFlowerChildEnvelopeFollowerState() {
    return {
      currentSlewedValue: 0,
      holdCounter: 0,
      out: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.flowerChildEnvelopeFollowerSample = function flowerChildEnvelopeFollowerSample(state, input, params, rate = sampleRate) {
    if (this.nativeFlowerChildEnvelopeFollowerReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeFlowerChildEnvelopeFollower.soemdsp_flower_child_envelope_follower_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
          state.out = this.safeFilterNumber(
            this.nativeFlowerChildEnvelopeFollower.soemdsp_flower_child_envelope_follower_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, null),
              this.safeFilterNumber(params.attack, null),
              this.safeFilterNumber(params.hold, null),
              this.safeFilterNumber(params.decay, null),
              safeRate,
            ),
            null,
          );
          return state.out;
        }
      } catch (error) {
        this.nativeFlowerChildEnvelopeFollowerReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "flower_child_envelope_follower",
          status: "disabled",
          message: String(error?.message || error || "native Flower Child Envelope Follower failed"),
        });
      }
    }
    return this.safeFilterNumber(input, state) ?? 0;
  };

