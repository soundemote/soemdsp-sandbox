// Worklet peel for gain. Math: gain-math.js (same Blob).

NodeLiveAudioProcessor.prototype.gainFrame = function gainFrame(mono, left, right, amount, offset = 0) {
  return nodeGraphGainFrame(mono, left, right, amount, offset);
};

NodeLiveAudioProcessor.prototype.gainFrameDb = function gainFrameDb(mono, left, right, opts) {
  if (this.nativeGainReady && this.nativeGain?.soemdsp_gain_sample) {
    try {
      const masterDb = nodeGraphFiniteNumber(opts?.masterDb);
      const leftDb = nodeGraphFiniteNumber(opts?.leftDb);
      const rightDb = nodeGraphFiniteNumber(opts?.rightDb);
      const monoSum = nodeGraphFiniteNumber(opts?.monoSum);
      const offset = nodeGraphFiniteNumber(opts?.offset);
      const args = [mono, left, right, masterDb, leftDb, rightDb, monoSum, offset];
      return {
        Out: this.safeFilterNumber(this.nativeGain.soemdsp_gain_sample(0, ...args), null) ?? 0,
        Left: this.safeFilterNumber(this.nativeGain.soemdsp_gain_sample(1, ...args), null) ?? 0,
        Right: this.safeFilterNumber(this.nativeGain.soemdsp_gain_sample(2, ...args), null) ?? 0,
      };
    } catch (error) {
      this.nativeGainReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "gain",
        status: "disabled",
        message: String(error?.message || error || "native Gain failed"),
      });
    }
  }
  return nodeGraphGainFrameDb(mono, left, right, opts);
};

// Legacy name used by old worklet dispatch.
NodeLiveAudioProcessor.prototype.gainBiasFrame = function gainBiasFrame(mono, left, right, amount, offset) {
  return this.gainFrame(mono, left, right, amount, offset);
};
