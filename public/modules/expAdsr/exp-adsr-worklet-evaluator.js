// Exp ADSR — native preferred; pure math fallback (exp-adsr-math.js).

NodeLiveAudioProcessor.prototype.createExpAdsrState = function createExpAdsrState() {
  const base =
    typeof createNodeGraphExpAdsrState === "function"
      ? createNodeGraphExpAdsrState()
      : {
          lastGate: 0,
          out: 0,
          stageElapsed: 0,
          stageStart: 0,
          stageEnd: 0,
          stageDuration: 0,
          state: "off",
          releasePending: false,
          latchedParams: null,
        };
  base.nativeHandle = 0;
  return base;
};

NodeLiveAudioProcessor.prototype.expAdsrSample = function expAdsrSample(state, gate, params, rate = sampleRate) {
  const live = params || {};
  const updateOnTrigger = live.updateOnTrigger;
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
          Math.max(0, Number(live.delay) || 0),
          Math.max(0, Number(live.attack) || 0),
          this.clampValue(Number(live.attackShape) || 0, -1, 1),
          Math.max(0, Number(live.decay) || 0),
          this.clampValue(Number(live.sustain) || 0, 0, 1),
          Math.max(0, Number(live.release) || 0),
          this.clampValue(Number(live.releaseShape) || 0, -1, 1),
          Number(live.loop) || 0,
          Number(live.level) || 0,
          Number(updateOnTrigger) || 0,
          safeRate,
        );
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
      nodeGraphExpAdsrCore(
        state,
        gate,
        live,
        Number(rate) > 1 ? Number(rate) : sampleRate,
        updateOnTrigger,
      ),
      null,
    );
  }
  return 0;
};
