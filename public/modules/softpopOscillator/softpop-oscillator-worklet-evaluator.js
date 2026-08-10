// Softpop Oscillator + Bandpass pitch CV — worklet methods.

NodeLiveAudioProcessor.prototype.createSoftpopOscillatorState = function createSoftpopOscillatorState() {
  if (typeof createNodeGraphSoftpopOscillatorState === "function") {
    return createNodeGraphSoftpopOscillatorState();
  }
  return {
    left: {
      noise: this.createNoiseGeneratorChannelState(),
      filter: this.createBandpassState ? this.createBandpassState() : { z1: 0, z2: 0 },
    },
    right: {
      noise: this.createNoiseGeneratorChannelState(),
      filter: this.createBandpassState ? this.createBandpassState() : { z1: 0, z2: 0 },
    },
    lastReset: false,
    generation: 0,
    lastSeed: NaN,
  };
};

NodeLiveAudioProcessor.prototype.softpopOscillatorSample = function softpopOscillatorSample(
  state,
  params,
  rate = sampleRate,
  nodeId = "softpop",
) {
  if (typeof nodeGraphSoftpopOscillatorSample === "function") {
    return nodeGraphSoftpopOscillatorSample(state, params, rate, nodeId);
  }
  // Fallback path if math chunk missing
  const level = Number(params?.amplitude) || 0;
  this.resetSeededState?.(state.left.noise, `${nodeId}:L`, params?.seed || 1, "softpop");
  this.resetSeededState?.(state.right.noise, `${nodeId}:R`, params?.seed || 1, "softpop");
  const nL = this.nextSeededGaussian?.(state.left.noise) ?? 0;
  const nR = this.nextSeededGaussian?.(state.right.noise) ?? 0;
  const yL = this.bandpassSample(state.left.filter, nL, params?.frequency ?? 1000, params?.q ?? 4, rate);
  const yR = this.bandpassSample(state.right.filter, nR, params?.frequency ?? 1000, params?.q ?? 4, rate);
  return {
    Left: yL * level,
    Right: yR * level,
    Out: (yL + yR) * 0.5 * level,
  };
};

NodeLiveAudioProcessor.prototype.resolveSoftpopOrBandpassHz = function resolveSoftpopOrBandpassHz(
  node,
  nodeId,
  baseHz,
  frame,
  frames,
  frameValues,
  mixInput,
) {
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
    : referenceVoltage;
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    return Math.max(0, nodeGraphParamResolveOscPitchHz({
      baseHz,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
    }));
  }
  return Math.max(0, Number(baseHz) || 0);
};
