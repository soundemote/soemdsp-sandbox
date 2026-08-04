// Realtime worklet evaluator for additiveOsc / gpuAdditiveOsc.
// Native-only audio (APP_POLICY §2/§5). Silence if WASM cold or graph CV
// forces the non-native path. GPU additive still streams pre-rendered chunks.

NodeLiveAudioProcessor.prototype.readGpuAdditiveQueuedSample = function readGpuAdditiveQueuedSample(nodeId) {
  const queue = this.gpuAdditiveQueues.get(nodeId);
  if (!queue?.chunks?.length) {
    this.gpuAdditiveUnderruns += 1;
    if (queue && Number.isFinite(queue.lastSample) && queue.heldSamples < 2048) {
      queue.heldSamples += 1;
      if (queue.heldSamples > 128) {
        queue.heldGain = Math.max(0, (Number(queue.heldGain) || 1) * 0.9975);
      } else {
        queue.heldGain = 1;
      }
      return queue.lastSample * queue.heldGain;
    }
    return null;
  }
  const chunk = queue.chunks[0];
  const sample = Number(chunk[queue.readIndex]) || 0;
  queue.heldGain = 1;
  queue.lastSample = sample;
  queue.heldSamples = 0;
  queue.readIndex += 1;
  if (queue.readIndex >= chunk.length) {
    queue.chunks.shift();
    queue.readIndex = 0;
  }
  return sample;
};

NodeLiveAudioProcessor.prototype.additiveOscillatorSample = function additiveOscillatorSample(phase, params = {}, rate = this.engineSampleRate || sampleRate) {
  if (
    params.hasGraphInput
    || !this.nativeAdditiveOscReady
    || !this.nativeAdditiveOsc?.soemdsp_additive_osc_sample
  ) {
    return 0;
  }
  try {
    const safeRateValue = Math.max(1, Number(rate) || this.engineSampleRate || sampleRate || 44100);
    return this.nativeAdditiveOsc.soemdsp_additive_osc_sample(
      Number(phase) || 0,
      Math.max(0, Number(params.frequency) || 0),
      Math.max(1, Math.min(1024, Math.round(Number(params.harmonics) || 32))),
      Math.round(Number(params.waveform) || 0),
      this.clampValue(Number(params.modA) || 0, 0, 1),
      this.clampValue(Number(params.harmonicPhaseAdd) || 0, 0, 1),
      this.clampValue(Number(params.harmonicPhaseMultiply) || 0, 0, 4),
      this.clampValue(Number(params.amplitude) || 0, 0, 1),
      Number(params.dampingFilterFrequency) || 20000,
      safeRateValue,
    );
  } catch (_error) {
    this.nativeAdditiveOscReady = false;
    return 0;
  }
};

NodeLiveAudioProcessor.prototype.additiveOscWorkletEvaluate = function additiveOscWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, graphInputValue) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
  const phaseOffset = this.phaseRadians(
    this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
  );
  const frequency = this.readEffectiveParameter(
    node,
    "frequency",
    220,
    frame,
    frames,
    frameValues,
  );
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
    : referenceVoltage;
  const fHz = this.readFInputHz(mixInput, nodeId);
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    })
    : this.resolveFrequencyHz(
      (typeof nodeGraphPitchedFrequency === "function"
        ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
        : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
      fHz,
    );
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
  const phaseIncrement = (effectiveFrequency / safeRate) + incrementInput;
  const hasGraphInput = (
    (this.graphInputConnections.get(this.graphInputKey(nodeId, "Damping Graph")) || []).length > 0 ||
    (this.graphInputConnections.get(this.graphInputKey(nodeId, "Phase Graph")) || []).length > 0
  );
  const queuedAdditiveSample = node?.type === "gpuAdditiveOsc" && !hasGraphInput
    ? this.readGpuAdditiveQueuedSample(nodeId)
    : null;
  const additiveSample = queuedAdditiveSample !== null
    ? queuedAdditiveSample
    : this.additiveOscillatorSample(
      phase + phaseOffset,
      {
        frequency: effectiveFrequency,
        dampingFilterFrequency: this.readEffectiveParameter(node, "dampingFilterFrequency", 20000, frame, frames, frameValues),
        hasGraphInput,
        harmonics: this.readEffectiveParameter(node, "harmonics", 32, frame, frames, frameValues),
        harmonicPhaseAdd: this.readEffectiveParameter(node, "harmonicPhaseAdd", 0, frame, frames, frameValues),
        harmonicPhaseMultiply: this.readEffectiveParameter(node, "harmonicPhaseMultiply", 0, frame, frames, frameValues),
        level: this.readEffectiveParameter(node, "amplitude", 0.35, frame, frames, frameValues),
        modA: this.readEffectiveParameter(node, "modA", 0.5, frame, frames, frameValues),
        waveform: this.readEffectiveParameter(node, "waveform", 1, frame, frames, frameValues),
      },
      safeRate,
    );
  const value = { Out: additiveSample };
  this.phases.set(
    nodeId,
    this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
};
