// Sinc: sinc(x) = sin(πx)/(πx) oscillator.
// Phase runs -0.5..0.5 centered, producing a sinc pulse at each cycle center.

NodeLiveAudioProcessor.prototype.createSincState = function createSincState() {
  return {};
};

NodeLiveAudioProcessor.prototype.sincSample = function sincSample(state, params, nodeId) {
  const freq = Math.max(0, this.safeFilterNumber(params.freq, 100) ?? 100);
  const phaseShift = this.safeFilterNumber(params.phase, 0) ?? 0;
  const rate = this.effectiveSampleRate();
  const step = freq / rate;

  let phase = (state._phase ?? 0) + step;
  if (phase >= 1) phase -= Math.floor(phase);
  state._phase = phase;

  // Phase from -0.5 to 0.5 centered (sinc peak at 0)
  const x = (phase + phaseShift - 0.5) * Math.PI;
  const value = Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;

  return { Out: this.clampValue(value, -1, 1) };
};
