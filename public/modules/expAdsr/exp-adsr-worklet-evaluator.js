// Exp ADSR — native preferred; pure math fallback (exp-adsr-math.js).

NodeLiveAudioProcessor.prototype.createExpAdsrState = function createExpAdsrState() {
  const base =
    typeof createNodeGraphExpAdsrState === "function"
      ? createNodeGraphExpAdsrState()
      : {
          lastGate: 0,
          out: 0,
          secondsPassed: 0,
          state: "off",
        };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.expAdsrSample = function expAdsrSample(state, gate, params, rate = sampleRate) {
  const live = params || {};
  const resolved = typeof nodeGraphExpAdsrParamsForSample === "function"
    ? nodeGraphExpAdsrParamsForSample(state, gate, live, live.updateOnTrigger)
    : live;
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
          Math.max(0, Number(resolved.delay) || 0),
          Math.max(0, Number(resolved.attack) || 0),
          Math.max(0.000000001, Number(resolved.attackShape) || 0),
          Math.max(0, Number(resolved.decay) || 0),
          this.clampValue(Number(resolved.sustain) || 0, 0, 1),
          Math.max(0, Number(resolved.release) || 0),
          Math.max(0.000000001, Number(resolved.releaseShape) || 0),
          Number(resolved.loop) || 0,
          Number(resolved.level) || 0,
          safeRate,
        );
        // Keep JS lastGate in sync so UpdateOnTrigger rising-edge matches native.
        state.lastGate = Number(gate) || 0;
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
  if (typeof nodeGraphExpAdsrCore === "function") {
    return this.safeFilterNumber(
      nodeGraphExpAdsrCore(state, gate, resolved, Number(rate) > 1 ? Number(rate) : sampleRate),
      null,
    );
  }
  return 0;
};
