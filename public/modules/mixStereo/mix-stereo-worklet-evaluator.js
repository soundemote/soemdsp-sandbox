// Worklet peel for MixStereo. Math: mix-stereo-math.js (same Blob).

NodeLiveAudioProcessor.prototype.mixStereoFrame = function mixStereoFrame(inputs, params) {
  if (this.nativeMixStereoReady && this.nativeMixStereo?.soemdsp_mix_stereo_sample) {
    try {
      const src = inputs && typeof inputs === "object" ? inputs : {};
      const p = params && typeof params === "object" ? params : {};
      const args = [
        nodeGraphFiniteNumber(src.L1), nodeGraphFiniteNumber(src.R1),
        nodeGraphFiniteNumber(src.L2), nodeGraphFiniteNumber(src.R2),
        nodeGraphFiniteNumber(src.L3), nodeGraphFiniteNumber(src.R3),
        nodeGraphFiniteNumber(src.L4), nodeGraphFiniteNumber(src.R4),
        0, // legacy mono-in slot (unused)
        nodeGraphFiniteNumber(p.volume1), nodeGraphFiniteNumber(p.pan1),
        nodeGraphFiniteNumber(p.volume2), nodeGraphFiniteNumber(p.pan2),
        nodeGraphFiniteNumber(p.volume3), nodeGraphFiniteNumber(p.pan3),
        nodeGraphFiniteNumber(p.volume4), nodeGraphFiniteNumber(p.pan4),
        nodeGraphFiniteNumber(p.amplitude),
      ];
      return {
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
