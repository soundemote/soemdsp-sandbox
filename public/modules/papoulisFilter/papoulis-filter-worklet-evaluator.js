NodeLiveAudioProcessor.prototype.createPapoulisFilterState = function createPapoulisFilterState() {
    return {
      poleX1: 0,
      poleY1: 0,
      biquadX1: 0,
      biquadX2: 0,
      biquadY1: 0,
      biquadY2: 0,
      coeffs: null,
      cutoffHz: NaN,
      sampleRate: NaN,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.papoulisFilterDesign = function papoulisFilterDesign(cutoffHz, rate) {
    const wc = 2 * Math.PI * Math.max(0, cutoffHz);
    const k = 2 * rate;
    const p = 0.6203 * wc;
    const poleA0 = k + p;
    const a1s = 0.6904 * wc;
    const a0s = 0.9308 * wc * wc;
    const biquadA0 = k * k + a1s * k + a0s;
    return {
      pole: { b0: p / poleA0, b1: p / poleA0, a1: (p - k) / poleA0 },
      biquad: {
        b0: a0s / biquadA0,
        b1: (2 * a0s) / biquadA0,
        b2: a0s / biquadA0,
        a1: (2 * a0s - 2 * k * k) / biquadA0,
        a2: (k * k - a1s * k + a0s) / biquadA0,
      },
    };
  };

NodeLiveAudioProcessor.prototype.papoulisFilterSampleJs = function papoulisFilterSampleJs(state, input, cutoffHz, rate) {
    const safeCutoff = Math.max(0.01, Math.min(rate * 0.49, Number(cutoffHz) || 0));
    if (state.cutoffHz !== safeCutoff || state.sampleRate !== rate) {
      state.coeffs = this.papoulisFilterDesign(safeCutoff, rate);
      state.cutoffHz = safeCutoff;
      state.sampleRate = rate;
    }
    const x = Number(input) || 0;
    const { pole, biquad } = state.coeffs;
    const poleOut = pole.b0 * x + pole.b1 * state.poleX1 - pole.a1 * state.poleY1;
    state.poleX1 = x;
    state.poleY1 = poleOut;
    const biquadOut = biquad.b0 * poleOut + biquad.b1 * state.biquadX1 + biquad.b2 * state.biquadX2
      - biquad.a1 * state.biquadY1 - biquad.a2 * state.biquadY2;
    state.biquadX2 = state.biquadX1;
    state.biquadX1 = poleOut;
    state.biquadY2 = state.biquadY1;
    state.biquadY1 = biquadOut;
    return biquadOut;
  };

NodeLiveAudioProcessor.prototype.papoulisFilterSample = function papoulisFilterSample(state, input, cutoffHz, rate) {
    if (this.nativePapoulisFilterReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePapoulisFilter.soemdsp_papoulis_filter_create();
        }
        if (state.nativeHandle) {
          return this.safeFilterNumber(
            this.nativePapoulisFilter.soemdsp_papoulis_filter_sample(
              state.nativeHandle,
              this.safeFilterNumber(input, null),
              this.safeFilterNumber(cutoffHz, null),
              this.safeFilterNumber(rate, null),
            ),
            null,
          );
        }
      } catch (error) {
        this.nativePapoulisFilterReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "papoulis_filter",
          status: "disabled",
          message: String(error?.message || error || "native Papoulis Filter failed"),
        });
      }
    }
    return this.papoulisFilterSampleJs(state, input, cutoffHz, rate);
  };

