NodeLiveAudioProcessor.prototype.transportDivisionFactor = function transportDivisionFactor(divisions) {
    const division = Math.round(Number(divisions) || 0);
    if (division > 0) {
      return division + 1;
    }
    if (division < 0) {
      return 1 / (Math.abs(division) + 1);
    }
    return 1;
  };

NodeLiveAudioProcessor.prototype.createTransportState = function createTransportState() {
    return {
      elapsedSamples: 0,
      phase: 0,
    };
  };

NodeLiveAudioProcessor.prototype.transportSample = function transportSample(state, params, rateHz = sampleRate) {
    const rate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const tempoBpm = Math.max(1, Number(this.timing?.tempoBpm) || 120);
    const frequency = (tempoBpm / 60) * this.transportDivisionFactor(params.divisions);
    const amplitude = this.clampValue(this.safeFilterNumber(params.amplitude, null), 0, 1);
    state.phase = frequency > 0 ? this.wrapValue(state.phase + frequency / rate, 0, 1) : state.phase;
    state.elapsedSamples += 1;
    const high = state.phase < 0.5;
    return {
      "-1..1": high ? amplitude : -amplitude,
      "0..1": high ? amplitude : 0,
    };
  };

