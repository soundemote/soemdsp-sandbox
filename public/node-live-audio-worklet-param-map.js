// Extracted from node-live-audio-worklet-core.js (Phase D — parameter normalize map).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.parameterOutputExists = function parameterOutputExists(node, port) {
    return Boolean(node?.params && Object.hasOwn(node.params, port));
};

NodeLiveAudioProcessor.prototype.normalizeParameterOutputValue = function normalizeParameterOutputValue(value, metadata = {}) {
    return this.parameterValueToNormalizedSignal(value, metadata);
};

NodeLiveAudioProcessor.prototype.normalizeParameterModulationInput = function normalizeParameterModulationInput(value, metadata = {}) {
    const number = Number(value) || 0;
    // Frequency parameters accept bipolar modulation [-1, 1] so through-zero
    // FM is possible (set frequency to 0, modulate with an oscillator, and the
    // pitch sweeps both positive and negative). All other parameters use [0, 1].
    return metadata?.kind === "frequency"
      ? this.clampValue(number, -1, 1)
      : this.clampValue(number, 0, 1);
};

NodeLiveAudioProcessor.prototype.parameterSkewExponent = function parameterSkewExponent(metadata = {}) {
    if (!metadata.nonlinearSlider) {
      return 1;
    }
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const mid = Number(metadata.mid);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(mid)) {
      return 1;
    }
    const normalizedMid = this.clampValue((mid - min) / range, 0.000001, 0.999999);
    return Math.log(normalizedMid) / Math.log(0.5);
};

NodeLiveAudioProcessor.prototype.parameterValueToNormalizedSignal = function parameterValueToNormalizedSignal(value, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return 0;
    }
    const bounded = metadata.wraparound
      ? this.wrapValue(Number(value) || 0, min, max)
      : this.clampValue(Number(value) || 0, min, max);
    const normalizedValue = this.clampValue((bounded - min) / range, 0, 1);
    return this.clampValue(normalizedValue ** (1 / this.parameterSkewExponent(metadata)), 0, 1);
};

NodeLiveAudioProcessor.prototype.normalizedSignalToParameterValue = function normalizedSignalToParameterValue(signal, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return Number.isFinite(min) ? min : 0;
    }
    const normalizedSignal = metadata.wraparound
      ? this.wrapValue(Number(signal) || 0, 0, 1)
      : this.clampValue(Number(signal) || 0, 0, 1);
    const normalizedValue = normalizedSignal ** this.parameterSkewExponent(metadata);
    return this.applyParameterBounds(min + range * normalizedValue, metadata);
};

