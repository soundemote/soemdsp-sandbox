// Realtime worklet: Shape outline → X/Y audio (phase walks perimeter).

NodeLiveAudioProcessor.prototype.rgbShapeWorkletEvaluate = function rgbShapeWorkletEvaluate(
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
  const amp = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
  const shape = this.readEffectiveParameter(node, "shape", 0, frame, frames, frameValues);
  const shapeParam = this.readEffectiveParameter(node, "shapeParam", 0.5, frame, frames, frameValues);
  const size = this.readEffectiveParameter(node, "size", 1, frame, frames, frameValues);
  const width = this.readEffectiveParameter(node, "width", 1, frame, frames, frameValues);
  const height = this.readEffectiveParameter(node, "height", 1, frame, frames, frameValues);
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

  let point = { x: 0, y: 0 };
  if (typeof RgbShapeMath !== "undefined" && typeof RgbShapeMath.outlinePoint === "function") {
    point = RgbShapeMath.outlinePoint(shape, shapeParam, samplePhase);
  } else {
    const a = samplePhase * Math.PI * 2 - Math.PI / 2;
    point = { x: Math.cos(a), y: Math.sin(a) };
  }
  // Size/Width/Height scale the outline into bipolar audio (−amp…amp).
  const sx = Math.max(0, Number(size) || 0) * Math.max(0, Number(width) || 0);
  const sy = Math.max(0, Number(size) || 0) * Math.max(0, Number(height) || 0);
  const level = Number(amp) || 0;
  const xOut = (Number(point.x) || 0) * sx * level;
  const yOut = (Number(point.y) || 0) * sy * level;

  let nextPhase = phase + phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  this.phases.set(nodeId, nextPhase);

  return {
    X: xOut,
    Y: yOut,
    rgba: 0,
    __Phase: samplePhase,
  };
};
