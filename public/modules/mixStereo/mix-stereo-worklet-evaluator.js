// Worklet peel for MixStereo. Math: mix-stereo-math.js (same Blob).

NodeLiveAudioProcessor.prototype.mixStereoFrame = function mixStereoFrame(inputs, params) {
  if (this.nativeMixStereoReady && this.nativeMixStereo?.soemdsp_mix_stereo_sample) {
    try {
      const src = inputs && typeof inputs === "object" ? inputs : {};
      const p = params && typeof params === "object" ? params : {};
      const args = [
        Number(src.L1) || 0, Number(src.R1) || 0,
        Number(src.L2) || 0, Number(src.R2) || 0,
        Number(src.L3) || 0, Number(src.R3) || 0,
        Number(src.L4) || 0, Number(src.R4) || 0,
        Number(src.Mono) || 0,
        Number(p.volume1) || 0, Number(p.pan1) || 0,
        Number(p.volume2) || 0, Number(p.pan2) || 0,
        Number(p.volume3) || 0, Number(p.pan3) || 0,
        Number(p.volume4) || 0, Number(p.pan4) || 0,
        Number(p.amplitude) || 0,
      ];
      return {
        Mono: this.safeFilterNumber(this.nativeMixStereo.soemdsp_mix_stereo_sample(0, ...args), null) ?? 0,
        Left: this.safeFilterNumber(this.nativeMixStereo.soemdsp_mix_stereo_sample(1, ...args), null) ?? 0,
        Right: this.safeFilterNumber(this.nativeMixStereo.soemdsp_mix_stereo_sample(2, ...args), null) ?? 0,
      };
    } catch (error) {
      this.nativeMixStereoReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "mix_stereo",
        status: "disabled",
        message: String(error?.message || error || "native MixStereo failed"),
      });
    }
  }
  if (typeof nodeGraphMixStereoFrame === "function") {
    return nodeGraphMixStereoFrame(inputs, params);
  }
  return { Left: 0, Right: 0 };
};
