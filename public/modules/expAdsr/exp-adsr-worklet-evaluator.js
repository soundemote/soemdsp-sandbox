NodeLiveAudioProcessor.prototype.createExpAdsrState = function createExpAdsrState() {
    return {
      lastGate: 0,
      out: 0,
      secondsPassed: 0,
      state: "off",
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.expAdsrSample = function expAdsrSample(state, gate, params, rate = sampleRate) {
    if (
      this.nativeExpAdsrReady &&
      this.nativeExpAdsr?.soemdsp_exp_adsr_create &&
      this.nativeExpAdsr?.soemdsp_exp_adsr_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeExpAdsr.soemdsp_exp_adsr_create();
        }
        if (state.nativeHandle) {
          const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
          const out = this.nativeExpAdsr.soemdsp_exp_adsr_sample(
            state.nativeHandle,
            Number(gate) || 0,
            Math.max(0, Number(params.delay) || 0),
            Math.max(0, Number(params.attack) || 0),
            Math.max(0.000000001, Number(params.attackShape) || 0),
            Math.max(0, Number(params.decay) || 0),
            this.clampValue(Number(params.sustain) || 0, 0, 1),
            Math.max(0, Number(params.release) || 0),
            Math.max(0.000000001, Number(params.releaseShape) || 0),
            Number(params.loop) || 0,
            Number(params.level) || 0,
            safeRate,
          );
          return this.safeFilterNumber(out, null);
        }
      } catch (error) {
        this.nativeExpAdsrReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "exp_adsr",
          status: "disabled",
          message: String(error?.message || error || "native Exp ADSR failed"),
        });
      }
    }
    return 0;
  };

