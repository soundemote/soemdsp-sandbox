// Realtime worklet: RoundShape (ellipsoid) + full Ellipsoid osc (ellipsoidOsc).
// Limit AA always on — no Auto/None mode switch.

NodeLiveAudioProcessor.prototype.ellipsoidSineToSquare = function ellipsoidSineToSquare(
  phaseCycles,
  shape = 0,
  frequencyHz = 0,
  sampleRate = 44100,
  mode = 1, // ignored
  phaseIncCycles = 0,
) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const angle = (Number(phaseCycles) || 0) * Math.PI * 2;
  const sinPhase = Math.sin(angle);
  const cosPhase = Math.cos(angle);
  let c = 1 - this.clampValue(Number(shape) || 0, 0, 1);
  const cMin = this.clampValue((Math.PI * 2 * f) / sr, 0, 1);
  if (c < cMin) c = cMin;
  const xx = (cosPhase * cosPhase) + (sinPhase * c) * (sinPhase * c);
  if (xx <= 1e-24) {
    if (cosPhase > 0) return 1;
    if (cosPhase < 0) return -1;
    return 0;
  }
  const out = cosPhase / Math.sqrt(xx);
  return Number.isFinite(out) ? out : 0;
};

// Full multi-param sample with Limit scale floor.
NodeLiveAudioProcessor.prototype.ellipsoidSample = function ellipsoidSample(
  phase,
  offset = 0,
  shape = 0,
  scale = 1,
  frequencyHz = 0,
  sampleRate = 44100,
) {
  const phaseRadians = Number(phase) || 0;
  const sinPhase = Math.sin(phaseRadians);
  const cosPhase = Math.cos(phaseRadians);
  const shapeRadians = (Number(shape) || 0) * Math.PI;
  const shapeSin = Math.sin(shapeRadians);
  const shapeCos = Math.cos(shapeRadians);
  const safeOffset = Number(offset) || 0;
  let safeScale = Math.max(0, Number(scale) || 0);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const f = Math.max(0, Number(frequencyHz) || 0);
  const scaleFloor = this.clampValue((Math.PI * 2 * f) / sr, 0, 1);
  if (safeScale < scaleFloor) safeScale = scaleFloor;
  const ax = safeOffset + cosPhase;
  const ay = safeScale * sinPhase;
  const denominator = Math.sqrt((ax * ax) + (ay * ay));
  if (denominator <= 1e-12) return 0;
  const out = ((ax * shapeCos) + (ay * shapeSin)) / denominator;
  return Number.isFinite(out) ? out : 0;
};

NodeLiveAudioProcessor.prototype.ellipsoidVectorSample = function ellipsoidVectorSample(
  target,
  phaseCycles,
  levelValue = 1,
  shape = 0,
  frequencyHz = 0,
  sampleRate = 44100,
  mode = 1,
  phaseInc = 0,
) {
  const level = Number(levelValue) || 0;
  const morph = this.clampValue(Number(shape) || 0, 0, 1);
  const phase = Number(phaseCycles) || 0;
  const biX = this.ellipsoidSineToSquare(phase, morph, frequencyHz, sampleRate) * level;
  const biY = this.ellipsoidSineToSquare(phase - 0.25, morph, frequencyHz, sampleRate) * level;
  // Uni 0…1 when level=1 bipolar −1…1: (bi + level) / 2 maps −A…A → 0…A
  const uniX = 0.5 * (biX + level);
  const uniY = 0.5 * (biY + level);
  const output = target || {};
  output["Bi X"] = biX;
  output["Bi Y"] = biY;
  output["Uni X"] = uniX;
  output["Uni Y"] = uniY;
  output.X = biX;
  output.Y = biY;
  return output;
};

NodeLiveAudioProcessor.prototype.nativeEllipsoidVectorSample = function nativeEllipsoidVectorSample(
  target,
  phaseCycles,
  levelValue = 1,
  shape = 0,
  frequencyHz = 0,
  sampleRate = 44100,
  mode = 1,
  phaseInc = 0,
) {
  const native = this.nativeEllipsoidReady ? this.nativeEllipsoid : null;
  const morph = this.clampValue(Number(shape) || 0, 0, 1);
  const phase = Number(phaseCycles) || 0;
  const level = Number(levelValue) || 0;
  const f = Math.max(0, Number(frequencyHz) || 0);
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const m = 1; // Limit always
  const inc = Number(phaseInc) || 0;

  const sampleAt = (p) => {
    if (native?.soemdsp_ellipsoid_sine_to_square_mode) {
      return Number(native.soemdsp_ellipsoid_sine_to_square_mode(p, morph, f, sr, m, inc)) || 0;
    }
    if (native?.soemdsp_ellipsoid_sine_to_square_aa) {
      return Number(native.soemdsp_ellipsoid_sine_to_square_aa(p, morph, f, sr, 1)) || 0;
    }
    return this.ellipsoidSineToSquare(p, morph, f, sr);
  };

  const biX = sampleAt(phase) * level;
  const biY = sampleAt(phase - 0.25) * level;
  const uniX = 0.5 * (biX + level);
  const uniY = 0.5 * (biY + level);
  const output = target || {};
  output["Bi X"] = biX;
  output["Bi Y"] = biY;
  output["Uni X"] = uniX;
  output["Uni Y"] = uniY;
  output.X = biX;
  output.Y = biY;
  return output;
};

NodeLiveAudioProcessor.prototype.ellipsoidWorkletEvaluate = function ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
  const phaseOffset = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
  const isFullOsc = node?.type === "ellipsoidOsc";
  const frequency = this.readEffectiveParameter(
    node,
    "frequency",
    isFullOsc ? 100 : 1,
    frame,
    frames,
    frameValues,
  );
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput: typeof hasInput === "function" ? hasInput : (id, port) => this.inputConnections.has(this.inputKey(id, port)),
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
  let ellipsoidFrame = this.ellipsoidOutputFrames.get(nodeId);
  if (!ellipsoidFrame) {
    ellipsoidFrame = {
      "Uni X": 0, "Uni Y": 0, "Bi X": 0, "Bi Y": 0, X: 0, Y: 0,
      Mono: 0, Out: 0, Wave: 0, "Wave Out": 0,
    };
    this.ellipsoidOutputFrames.set(nodeId, ellipsoidFrame);
  }
  let samplePhase;
  if (useSimTime) {
    const simSamples = Math.max(0, Number(this.absoluteFrame) || 0);
    samplePhase = dir * ((pitchedFrequency / safeRate) + incrementInput) * simSamples + phaseOffset;
  } else {
    samplePhase = phase + phaseOffset;
  }
  samplePhase -= Math.floor(samplePhase);
  const amp = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
  let value;
  if (isFullOsc) {
    const phaseRadians = samplePhase * Math.PI * 2;
    const native = this.nativeEllipsoidReady ? this.nativeEllipsoid : null;
    const sampleLegacy = (p, offset, shape, scale) => {
      if (native?.soemdsp_ellipsoid_sample_aa) {
        return Number(native.soemdsp_ellipsoid_sample_aa(
          p, offset, shape, scale, pitchedFrequency, safeRate,
        )) || 0;
      }
      if (native?.soemdsp_ellipsoid_sample) {
        // Fallback without export: JS Limit path
        return this.ellipsoidSample(p, offset, shape, scale, pitchedFrequency, safeRate);
      }
      return this.ellipsoidSample(p, offset, shape, scale, pitchedFrequency, safeRate);
    };
    const x = sampleLegacy(
      phaseRadians,
      this.readEffectiveParameter(node, "offsetX", 0, frame, frames, frameValues),
      this.readEffectiveParameter(node, "shapeX", 0, frame, frames, frameValues),
      this.readEffectiveParameter(node, "scaleX", 1, frame, frames, frameValues),
    ) * amp;
    const y = sampleLegacy(
      phaseRadians - Math.PI * 0.5,
      this.readEffectiveParameter(node, "offsetY", 0, frame, frames, frameValues),
      this.readEffectiveParameter(node, "shapeY", 0, frame, frames, frameValues),
      this.readEffectiveParameter(node, "scaleY", 1, frame, frames, frameValues),
    ) * amp;
    ellipsoidFrame.Out = x;
    ellipsoidFrame.Mono = x;
    ellipsoidFrame.X = x;
    ellipsoidFrame.Y = y;
    ellipsoidFrame.Wave = x;
    ellipsoidFrame["Wave Out"] = x;
    value = ellipsoidFrame;
  } else {
    const shape = this.clampValue(
      this.readEffectiveParameter(node, "shape", 0, frame, frames, frameValues),
      0,
      1,
    );
    value = this.nativeEllipsoidVectorSample(
      ellipsoidFrame,
      samplePhase,
      amp,
      shape,
      pitchedFrequency,
      safeRate,
      1,
      phaseIncrement,
    );
  }
  let nextPhase = phase + phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  this.phases.set(nodeId, nextPhase);
  if (value && typeof value === "object") {
    value.__Phase = samplePhase;
  }
  return value;
};
