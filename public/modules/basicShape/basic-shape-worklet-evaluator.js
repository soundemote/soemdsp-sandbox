// Realtime worklet: BasicShape naive sine / tri / saw / square (no AA).

NodeLiveAudioProcessor.prototype.basicShapeNaiveWaves = function basicShapeNaiveWaves(phase01, pulseWidth) {
  const p = Number(phase01) || 0;
  const cycle = p - Math.floor(p);
  const sine = Math.sin(cycle * Math.PI * 2);
  const tri = 1 - 4 * Math.abs(cycle - 0.5);
  const saw = 1 - cycle * 2;
  const pw = Number(pulseWidth);
  const width = Number.isFinite(pw) ? Math.max(0, Math.min(1, pw)) : 0.5;
  const square = cycle < width ? 1 : -1;
  return { sine, tri, saw, square };
};

NodeLiveAudioProcessor.prototype.basicShapeSelect = function basicShapeSelect(waves, waveform) {
  const i = Math.max(0, Math.min(3, Math.round(Number(waveform) || 0)));
  if (i === 1) return waves.tri;
  if (i === 2) return waves.saw;
  if (i === 3) return waves.square;
  return waves.sine;
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
  const pulseWidth = this.readEffectiveParameter(node, "shape", 0.5, frame, frames, frameValues);
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
  const selected = this.basicShapeSelect(waves, waveform) * amp;
  let nextPhase = phase + phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  this.phases.set(nodeId, nextPhase);
  return {
    Out: selected,
    Saw: waves.saw * amp,
    Sine: waves.sine * amp,
    Square: waves.square * amp,
    Tri: waves.tri * amp,
    "Wave Out": selected,
    __Phase: samplePhase,
  };
};
