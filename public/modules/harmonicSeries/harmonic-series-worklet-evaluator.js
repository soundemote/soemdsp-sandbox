// Harmonic Series — native preferred; pure math fallback (harmonic-series-math.js).

NodeLiveAudioProcessor.prototype.harmonicSeriesSample = function harmonicSeriesSample(
  baseHz,
  harmonic,
  offset,
) {
  if (this.nativeHarmonicSeriesReady && this.nativeHarmonicSeries?.soemdsp_harmonic_series_sample) {
    try {
      return this.safeFilterNumber(
        this.nativeHarmonicSeries.soemdsp_harmonic_series_sample(
          Number(baseHz) || 0,
          Number(harmonic) || 0,
          Number(offset) || 0,
        ),
        null,
      );
    } catch (error) {
      this.nativeHarmonicSeriesReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "harmonic_series",
        status: "disabled",
        message: String(error?.message || error || "native Harmonic Series failed"),
      });
    }
  }
  if (typeof nodeGraphHarmonicSeriesSample === "function") {
    const out = nodeGraphHarmonicSeriesSample(baseHz, harmonic, offset);
    return this.safeFilterNumber(out?.f, null);
  }
  return 0;
};

NodeLiveAudioProcessor.prototype.harmonicSeriesWorkletEvaluate = function harmonicSeriesWorkletEvaluate(
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
) {
  const harmonic = this.readEffectiveParameter(node, "harmonic", 0, frame, frames, frameValues);
  const offset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
  const knobHz = this.readEffectiveParameter(node, "frequency", 100, frame, frames, frameValues);
  const baseHz = typeof nodeGraphFrequencyHzFromKnobOrF === "function"
    ? nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId)
    : this.frequencyHzFromKnobOrF(knobHz, mixInput, nodeId);
  return {
    f: this.harmonicSeriesSample(baseHz, harmonic, offset),
    f0: this.safeFilterNumber(baseHz, null),
  };
};
