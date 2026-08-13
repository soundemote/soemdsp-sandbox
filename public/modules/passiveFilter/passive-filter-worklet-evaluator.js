NodeLiveAudioProcessor.prototype.createPassiveFilterState = function createPassiveFilterState() {
    return { nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.passiveFilterSample = function passiveFilterSample(state, input, mode, lowFrequency, highFrequency, rate) {
    if (!this.nativePassiveFilterReady) {
      return 0;
    }
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativePassiveFilter.soemdsp_passive_filter_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Passive Filter failed to create instance");
    }
    return this.safeFilterNumber(
      this.nativePassiveFilter.soemdsp_passive_filter_sample(
        state.nativeHandle,
        this.safeFilterNumber(input, state),
        Math.round(Number(mode)) || 0,
        Number(lowFrequency) || 0,
        Number(highFrequency) || 0,
        Math.max(1, Number(rate) || sampleRate || 44100),
      ),
      state,
    );
  };

