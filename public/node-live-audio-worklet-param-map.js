// Parameter DOMAIN ↔ unit map + MOD normalize (Phase F).
// Pure math lives in node-graph-param-surface-helpers.js (loaded in the Blob first).

NodeLiveAudioProcessor.prototype.parameterOutputExists = function parameterOutputExists(node, port) {
  return Boolean(node?.params && Object.hasOwn(node.params, port));
};

NodeLiveAudioProcessor.prototype.normalizeParameterOutputValue = function normalizeParameterOutputValue(value, metadata = {}) {
  if (typeof nodeGraphParamDomainToModOutput === "function") {
    return nodeGraphParamDomainToModOutput(value, metadata);
  }
  return this.parameterValueToNormalizedSignal(value, metadata);
};

/** MOD surface: always bipolar unit [−1, 1]. */
NodeLiveAudioProcessor.prototype.normalizeParameterModulationInput = function normalizeParameterModulationInput(value, metadata = {}) {
  if (typeof nodeGraphParamNormalizeModInput === "function") {
    return nodeGraphParamNormalizeModInput(value, metadata);
  }
  return this.clampValue(Number(value) || 0, -1, 1);
};

NodeLiveAudioProcessor.prototype.parameterSkewExponent = function parameterSkewExponent(metadata = {}) {
  if (typeof nodeGraphParamSkewExponent === "function") {
    return nodeGraphParamSkewExponent(metadata);
  }
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
  if (typeof nodeGraphParamDomainToUnit === "function") {
    return nodeGraphParamDomainToUnit(value, metadata);
  }
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
  if (typeof nodeGraphParamUnitToDomain === "function") {
    return nodeGraphParamUnitToDomain(signal, metadata);
  }
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
