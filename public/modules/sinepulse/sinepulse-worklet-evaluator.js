// Sinepulse — worklet.

NodeLiveAudioProcessor.prototype.createSinepulseState = function createSinepulseState() {
  if (typeof createNodeGraphSinepulseState === "function") {
    return createNodeGraphSinepulseState();
  }
  return { tooth: 0, phase: 0, lastReset: 0 };
};

NodeLiveAudioProcessor.prototype.sinepulseSample = function sinepulseSample(
  state,
  frequencyHz,
  frequencyHigh,
  frequencyLow,
  shift01,
  sweep,
  direction,
  freqCurve,
  ampCurve,
  phaseOffset,
  amplitude,
  increment,
  resetGate,
  rate = sampleRate,
) {
  if (typeof nodeGraphSinepulseSample === "function") {
    const out = nodeGraphSinepulseSample(
      state,
      frequencyHz,
      frequencyHigh,
      frequencyLow,
      shift01,
      sweep,
      direction,
      freqCurve,
      ampCurve,
      phaseOffset,
      amplitude,
      increment,
      resetGate,
      rate,
    );
    if (out && typeof out === "object") {
      return {
        Out: this.safeFilterNumber(out.Out, null) ?? 0,
        f: this.safeFilterNumber(out.f, null) ?? 0,
        Amp: this.safeFilterNumber(out.Amp, null) ?? 0,
        Freq: this.safeFilterNumber(out.Freq, null) ?? 0,
      };
    }
    const y = this.safeFilterNumber(out, null) ?? 0;
    return { Out: y, f: 0, Amp: 0, Freq: 0 };
  }
  return { Out: 0, f: 0, Amp: 0, Freq: 0 };
};
