NodeLiveAudioProcessor.prototype.createPllState = function createPllState() {
    return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
  };

NodeLiveAudioProcessor.prototype.destroyPllState = function destroyPllState(state) {
    if (!state?.nativeHandle || !this.nativePll?.soemdsp_pll_destroy) return;
    this.nativePll.soemdsp_pll_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  };

NodeLiveAudioProcessor.prototype.pllSample = function pllSample(state, signalIn, cvIn, cvConnected, params, rateHz = sampleRate) {
    const native = this.nativePll;
    if (!this.nativePllReady || !native?.soemdsp_pll_create || !native?.soemdsp_pll_process) {
      return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
    }
    try {
      const safeRate = Math.max(1, nodeGraphFiniteNumber(rateHz, nodeGraphFiniteNumber(sampleRate, 44100)));
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_pll_destroy) {
          native.soemdsp_pll_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_pll_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
      }
      if (!state.nativeHandle) {
        return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
      }
      const range  = Math.max(0, Math.min(2, Math.round(this.safeFilterNumber(params.range,  null) ?? 1)));
      const offset = this.clampValue(this.safeFilterNumber(params.offset, null) ?? 5, 0, 10);
      const type   = Math.max(0, Math.min(2, Math.round(this.safeFilterNumber(params.type,   null) ?? 1)));
      const frequ  = Math.max(0.1, this.safeFilterNumber(params.frequ, null) ?? 10);
      const paramKey = `${range}:${Math.round(offset * 1000)}:${type}:${Math.round(frequ * 1000)}`;
      if (paramKey !== state.nativeParamKey && native.soemdsp_pll_set_params) {
        state.nativeParamKey = paramKey;
        native.soemdsp_pll_set_params(state.nativeHandle, safeRate, range, offset, type, frequ);
      }
      const safeSig = this.safeFilterNumber(signalIn, null) ?? 0;
      const safeCv  = this.clampValue(this.safeFilterNumber(cvIn, null) ?? 0, 0, 1);
      native.soemdsp_pll_process(state.nativeHandle, safeSig, safeCv, cvConnected);
      return {
        "VCO Out": this.safeFilterNumber(native.soemdsp_pll_vco_out?.(state.nativeHandle), null) ?? 0,
        "PC Out":  this.safeFilterNumber(native.soemdsp_pll_pc_out?.(state.nativeHandle),  null) ?? 0,
        "LPF Out": this.safeFilterNumber(native.soemdsp_pll_lpf_out?.(state.nativeHandle), null) ?? 0,
        Locked:    this.safeFilterNumber(native.soemdsp_pll_locked?.(state.nativeHandle),   null) ?? 0,
      };
    } catch {
      this.nativePllReady = false;
      this.destroyPllState(state);
      return { "VCO Out": 0, "PC Out": 0, "LPF Out": 0, Locked: 0 };
    }
  };

