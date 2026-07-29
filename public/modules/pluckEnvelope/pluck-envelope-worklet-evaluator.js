NodeLiveAudioProcessor.prototype.createPluckEnvelopeState = function createPluckEnvelopeState() {
    return {
      autoReleasePhasor: 0,
      currentValue: 0,
      decayIncrement: 0,
      lastRelease: 0,
      lastTrigger: 0,
      phasor: 0,
      releaseIncrement: 0,
      secondsPassed: 0,
      state: "off",
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.exponentialCurve = function exponentialCurve(value, skew) {
    const safeValue = this.clampValue(Number(value) || 0, 0, 1);
    const safeSkew = this.clampValue(Number(skew) || 0, -0.99, 0.99);
    if (safeSkew === 0) {
      return safeValue;
    }
    const c = 0.5 * (safeSkew + 1);
    const a = 2 * Math.log10((1 - c) / c);
    const denom = 1 - Math.exp(a);
    return denom === 0 ? safeValue : (1 - Math.exp(safeValue * a)) / denom;
  };

NodeLiveAudioProcessor.prototype.pluckPrepareForDecay = function pluckPrepareForDecay(state, rate, peak) {
    state.phasor = 0;
    state.autoReleasePhasor = 0;
    state.currentValue = peak;
    state.decayIncrement = (state.currentValue - 1) / Math.max(1, rate) / 50;
  };

NodeLiveAudioProcessor.prototype.pluckEnvelopeSample = function pluckEnvelopeSample(state, trigger, release, params, rate = sampleRate) {
    if (
      this.nativePluckEnvelopeReady &&
      this.nativePluckEnvelope?.soemdsp_pluck_envelope_create &&
      this.nativePluckEnvelope?.soemdsp_pluck_envelope_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePluckEnvelope.soemdsp_pluck_envelope_create();
        }
        if (state.nativeHandle) {
          const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
          const out = this.nativePluckEnvelope.soemdsp_pluck_envelope_sample(
            state.nativeHandle,
            Number(trigger) || 0,
            Number(release) || 0,
            Math.max(0, Number(params.delayTime) || 0),
            Math.max(0, Number(params.attackFeedback) || 0),
            this.clampValue(Number(params.decay) || 0, 0.1, 1),
            this.clampValue(Number(params.decayModStart) || 0, 0.001, 1.8),
            this.clampValue(Number(params.decayModEnd) || 0, 0.01, 3),
            this.clampValue(Number(params.endingDecay) || 0, 0, 1.4),
            this.clampValue(Number(params.decayModCurve) || 0, -1, 1),
            this.clampValue(Number(params.decayModFrequency) || 0, 0, 100),
            Math.max(0, Number(params.autoReleaseTime) || 0),
            this.clampValue(Number(params.releaseFeedback) || 0, 0, 1),
            this.clampValue(Number(params.velocity) || 0, 0, 1),
            this.clampValue(Number(params.velocitySensitivity) || 0, 0, 1),
            this.clampValue(Number(params.level) || 0, 0, 1),
            safeRate,
          );
          return this.safeFilterNumber(out, null);
        }
      } catch (error) {
        this.nativePluckEnvelopeReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pluck_envelope",
          status: "disabled",
          message: String(error?.message || error || "native Pluck Envelope failed"),
        });
      }
    }
    return 0;
  };

