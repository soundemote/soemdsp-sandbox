NodeLiveAudioProcessor.prototype.sweepFrequencyHz = function sweepFrequencyHz(hz, semitones) {
    if (typeof nodeGraphSweepFrequencyHz === "function") {
      return nodeGraphSweepFrequencyHz(hz, semitones);
    }
    const f = Number(hz);
    if (!Number.isFinite(f) || f <= 0) {
      return 0;
    }
    const st = Number(semitones);
    if (!Number.isFinite(st) || st === 0) {
      return f;
    }
    const out = f * (2 ** (st / 12));
    return Number.isFinite(out) && out > 0 ? out : 0;
  };

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

