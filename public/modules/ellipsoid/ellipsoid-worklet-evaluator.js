// Realtime worklet evaluator methods for ellipsoid, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.ellipsoidWorkletEvaluate(...) via a thin arrow
// function still declared in core.js's buildLiveModuleEvaluators().
NodeLiveAudioProcessor.prototype.ellipsoidSample = function ellipsoidSample(phase, offset = 0, shape = 0, scale = 1) {
  const phaseRadians = Number(phase) || 0;
  const sinPhase = Math.sin(phaseRadians);
  const cosPhase = Math.cos(phaseRadians);
  const shapeRadians = (Number(shape) || 0) * Math.PI;
  const shapeSin = Math.sin(shapeRadians);
  const shapeCos = Math.cos(shapeRadians);
  const safeOffset = this.clampValue(Number(offset) || 0, -1, 1);
  const safeScale = Math.max(0, Number(scale) || 0);
  const x = safeOffset + cosPhase;
  const y = safeScale * sinPhase;
  const denominator = Math.sqrt((x * x) + (y * y));
  if (denominator <= 1e-12) {
    return 0;
  }
  return this.clampValue(((x * shapeCos) + (y * shapeSin)) / denominator, -1, 1);
};

NodeLiveAudioProcessor.prototype.ellipsoidVectorSample = function ellipsoidVectorSample(
  target,
  phase,
  levelValue = 1,
  offsetX = 0,
  offsetY = 0,
  scaleX = 1,
  scaleY = 1,
  shapeX = 0,
  shapeY = 0,
) {
  const level = Number(levelValue) || 0;
  const x = this.ellipsoidSample(phase, offsetX, shapeX, scaleX) * level;
  const y = this.ellipsoidSample(phase - Math.PI * 0.5, offsetY, shapeY, scaleY) * level;
  const output = target || {};
  output.Out = x;
  output.Mono = x;
  output.X = x;
  output.Y = y;
  output.Wave = x;
  output["Wave Out"] = x;
  return output;
};

NodeLiveAudioProcessor.prototype.nativeEllipsoidVectorSample = function nativeEllipsoidVectorSample(
  target,
  phase,
  levelValue = 1,
  offsetX = 0,
  offsetY = 0,
  scaleX = 1,
  scaleY = 1,
  shapeX = 0,
  shapeY = 0,
) {
  const native = this.nativeEllipsoidReady ? this.nativeEllipsoid : null;
  if (!native?.soemdsp_ellipsoid_sample) {
    return this.ellipsoidVectorSample(
      target,
      phase,
      levelValue,
      offsetX,
      offsetY,
      scaleX,
      scaleY,
      shapeX,
      shapeY,
    );
  }
  // Stateless: call the pure native sample twice (X, then Y a quarter-cycle
  // behind) rather than the old write-global-then-read-getter pattern, so
  // concurrent ellipsoid nodes cannot read each other's leftover state.
  const level = Number(levelValue) || 0;
  const nativePhase = Number(phase) || 0;
  const x = this.clampValue(
    (Number(native.soemdsp_ellipsoid_sample(
      nativePhase,
      Number(offsetX) || 0,
      Number(shapeX) || 0,
      Number(scaleX) || 0,
    )) || 0) * level,
    -1,
    1,
  );
  const y = this.clampValue(
    (Number(native.soemdsp_ellipsoid_sample(
      nativePhase - Math.PI * 0.5,
      Number(offsetY) || 0,
      Number(shapeY) || 0,
      Number(scaleY) || 0,
    )) || 0) * level,
    -1,
    1,
  );
  const output = target || {};
  output.Out = x;
  output.Mono = x;
  output.X = x;
  output.Y = y;
  output.Wave = x;
  output["Wave Out"] = x;
  return output;
};

NodeLiveAudioProcessor.prototype.ellipsoidWorkletEvaluate = function ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
  const phaseOffset = this.phaseRadians(
    this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
  );
  const frequency = this.readEffectiveParameter(node, "frequency", 220, frame, frames, frameValues);
  const pitchInput = this.clampValue(
    this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null),
    -1,
    1,
  );
  const pitchedFrequency = Math.max(0, frequency * (2 ** (pitchInput / 0.1)));
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
  const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
  let ellipsoidFrame = this.ellipsoidOutputFrames.get(nodeId);
  if (!ellipsoidFrame) {
    ellipsoidFrame = { Mono: 0, Out: 0, Wave: 0, "Wave Out": 0, X: 0, Y: 0 };
    this.ellipsoidOutputFrames.set(nodeId, ellipsoidFrame);
  }
  const value = this.nativeEllipsoidVectorSample(
    ellipsoidFrame,
    phase + phaseOffset,
    this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
    this.readEffectiveParameter(node, "offsetX", 0, frame, frames, frameValues),
    this.readEffectiveParameter(node, "offsetY", 0, frame, frames, frameValues),
    this.readEffectiveParameter(node, "scaleX", 1, frame, frames, frameValues),
    this.readEffectiveParameter(node, "scaleY", 1, frame, frames, frameValues),
    this.readEffectiveParameter(node, "shapeX", 0, frame, frames, frameValues),
    this.readEffectiveParameter(node, "shapeY", 0, frame, frames, frameValues),
  );
  this.phases.set(
    nodeId,
    this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
};
