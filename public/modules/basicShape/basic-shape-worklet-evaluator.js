// Realtime worklet: BasicShape naive waves (no AA). Same math as the live evaluator.

NodeLiveAudioProcessor.prototype.basicShapeWrap01 = function basicShapeWrap01(phase01) {
  const p = Number(phase01) || 0;
  return p - Math.floor(p);
};

// Center Square: pulse centered at 0.5; Morph grows edges left/right.
NodeLiveAudioProcessor.prototype.basicShapeCenterSquare = function basicShapeCenterSquare(cycle, morph) {
  const width = Number.isFinite(morph) ? Math.max(0, Math.min(1, morph)) : 0.5;
  if (width <= 0) {
    return -1;
  }
  if (width >= 1) {
    return 1;
  }
  const c = this.basicShapeWrap01(cycle);
  const half = width * 0.5;
  return (c >= (0.5 - half) && c < (0.5 + half)) ? 1 : -1;
};

NodeLiveAudioProcessor.prototype.basicShapeTrisaw = function basicShapeTrisaw(cycle, warp) {
  const w = Number.isFinite(warp) ? Math.max(1e-4, Math.min(1 - 1e-4, warp)) : 0.5;
  if (cycle < w) return 2 * (cycle / w) - 1;
  return 2 * ((1 - cycle) / (1 - w)) - 1;
};

NodeLiveAudioProcessor.prototype.basicShapeNaiveWaves = function basicShapeNaiveWaves(phase01, pulseWidth) {
  const cycle = this.basicShapeWrap01(phase01);
  const sine = Math.sin(cycle * Math.PI * 2);
  const tri = 1 - 4 * Math.abs(cycle - 0.5);
  const saw = 1 - cycle * 2;
  const ramp = cycle * 2 - 1;
  const pw = Number(pulseWidth);
  const width = Number.isFinite(pw) ? Math.max(0, Math.min(1, pw)) : 0.5;
  const square = cycle < width ? 1 : -1;
  const trisaw = this.basicShapeTrisaw(cycle, width);
  const centerSquare = this.basicShapeCenterSquare(cycle, width);
  return { sine, tri, saw, ramp, square, trisaw, centerSquare };
};

// Order: 0 Sine, 1 Tri, 2 Saw, 3 Ramp, 4 Trisaw, 5 Square, 6 CenterSquare
NodeLiveAudioProcessor.prototype.basicShapeSelect = function basicShapeSelect(waves, waveform) {
  const i = Math.max(0, Math.min(6, Math.round(Number(waveform) || 0)));
  if (i === 1) return waves.tri;
  if (i === 2) return waves.saw;
  if (i === 3) return waves.ramp;
  if (i === 4) return waves.trisaw;
  if (i === 5) return waves.square;
  if (i === 6) return waves.centerSquare;
  return waves.sine;
};

NodeLiveAudioProcessor.prototype.basicShapePolarity = function basicShapePolarity(x, polarity) {
  const uni = Math.round(Number(polarity) || 0) >= 1;
  return uni ? (Number(x) + 1) * 0.5 : Number(x);
};

NodeLiveAudioProcessor.prototype.basicShapeWorkletEvaluate = function basicShapeWorkletEvaluate(
  node, nodeId, frame, frames, frameValues, mixInput, safeRate,
) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
  const phaseOffset = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
  const frequency = this.readEffectiveParameter(node, "frequency", 1, frame, frames, frameValues);
  const waveform = this.readEffectiveParameter(node, "waveform", 0, frame, frames, frameValues);
  const pulseWidth = this.readEffectiveParameter(node, "morph", 0.5, frame, frames, frameValues);
  const polarity = this.readEffectiveParameter(node, "polarity", 0, frame, frames, frameValues);
  const amp = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput: (id, port) => this.inputConnections.has(this.inputKey(id, port)),
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
      : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"));
  const motion = Math.max(0, Math.min(3, Math.round(Number(
    this.readEffectiveParameter(node, "motion", 1, frame, frames, frameValues),
  ) || 0)));
  const clockWise = motion === 0 || motion === 2;
  const useSimTime = motion >= 2;
  const dir = clockWise ? -1 : 1;
  const phaseIncrement = useSimTime
    ? 0
    : (dir * pitchedFrequency / safeRate) + incrementInput;
  let samplePhase;
  if (useSimTime) {
    const simSamples = Math.max(0, Number(this.absoluteFrame) || 0);
    samplePhase = dir * ((pitchedFrequency / safeRate) + incrementInput) * simSamples + phaseOffset;
  } else {
    samplePhase = phase + phaseOffset;
  }
  samplePhase -= Math.floor(samplePhase);
  const waves = this.basicShapeNaiveWaves(samplePhase, pulseWidth);
  const pol = (x) => this.basicShapePolarity(x, polarity);
  const selected = pol(this.basicShapeSelect(waves, waveform) * amp);
  let nextPhase = phase + phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  this.phases.set(nodeId, nextPhase);
  return {
    Out: selected,
    Sine: pol(waves.sine * amp),
    Tri: pol(waves.tri * amp),
    Saw: pol(waves.saw * amp),
    Ramp: pol(waves.ramp * amp),
    Trisaw: pol(waves.trisaw * amp),
    Square: pol(waves.square * amp),
    "Center Square": pol(waves.centerSquare * amp),
    Wave: selected,
    "Wave Out": selected,
    __Phase: samplePhase,
  };
};
