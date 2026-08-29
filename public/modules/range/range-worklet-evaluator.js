// Worklet peel for range (full product). Efficient path uses graph_engine.

NodeLiveAudioProcessor.prototype.rangeFrame = function rangeFrame(
  input,
  inLow,
  inHigh,
  outLow,
  outHigh,
) {
  if (this.nativeRangeReady && this.nativeRange?.soemdsp_range_sample) {
    try {
      return {
        Out: this.safeFilterNumber(
          this.nativeRange.soemdsp_range_sample(
            0,
            input,
            inLow,
            inHigh,
            outLow,
            outHigh,
          ),
          null,
        ) ?? 0,
      };
    } catch (error) {
      this.nativeRangeReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "range",
        status: "disabled",
        message: String(error?.message || error || "native Range failed"),
      });
    }
  }
  if (typeof nodeGraphRangeFrame === "function") {
    return nodeGraphRangeFrame(input, inLow, inHigh, outLow, outHigh);
  }
  return { Out: 0 };
};
