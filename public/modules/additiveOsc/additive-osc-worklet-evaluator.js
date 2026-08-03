// Realtime worklet evaluator methods for additiveOsc/gpuAdditiveOsc, split
// out of node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's
// prototype. Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.additiveOscWorkletEvaluate(...) via thin arrow
// functions still declared in core.js's buildLiveModuleEvaluators().
const nodeLiveAdditiveHardMaxHarmonics = 1024;

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

NodeLiveAudioProcessor.prototype.additiveWaveformHarmonic = function additiveWaveformHarmonic(waveform, harmonic, modA = 0.5) {
  const n = Math.max(1, Math.floor(Number(harmonic) || 1));
  const h = n;
  const mod = this.clampValue(Number(modA) || 0, 0, 1);
  switch (Math.round(Number(waveform) || 0)) {
    case 0:
      return { amplitude: n === Math.max(1, Math.floor(99 * mod + 1)) ? 1 : 0, phase: 0 };
    case 2:
      return { amplitude: n % 2 === 1 ? 1 / h : 0, phase: mod * 0.5 };
    case 3:
      return { amplitude: n % 2 === 1 ? 1 / (h * h) : 0, phase: n % 4 === 1 ? 0 : 0.5 };
    case 4:
      return { amplitude: n % 2 === 1 ? 1 / h : (1 / h) * (1 - mod), phase: 0 };
    case 5:
      return { amplitude: Math.cos(h * mod * 0.5) / h, phase: 0 };
    case 6:
      {
        const peak = this.clampValue(mod, 0.001, 0.999);
        return { amplitude: (Math.sin(0.5 * h * peak) / (peak * (1 - peak) * h * h)) * 0.2, phase: 0 };
      }
    case 7:
      {
        const octaves = Math.max(2, Math.floor(2 + mod * 11));
        let target = 1;
        while (target < n) {
          target *= octaves;
        }
        return { amplitude: target === n ? 1 / h : 0, phase: 0 };
      }
    case 1:
    default:
      return { amplitude: 1 / h, phase: n % 2 === 1 ? 0.5 : 0 };
  }
};

NodeLiveAudioProcessor.prototype.additiveDampingCurveValue = function additiveDampingCurveValue(value = 0) {
  return this.clampValue(Number(value) || 0, 0, 1);
};

NodeLiveAudioProcessor.prototype.additiveDampingAlgorithmValue = function additiveDampingAlgorithmValue(value = 0) {
  return Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
};

NodeLiveAudioProcessor.prototype.additiveFilterFrequencyValue = function additiveFilterFrequencyValue(value = 20000, rate = this.engineSampleRate || sampleRate || 44100) {
  const nyquist = Math.max(1, (Number(rate) || this.engineSampleRate || sampleRate || 44100) * 0.5);
  return this.clampValue(Number(value) || 20000, 1, nyquist);
};

NodeLiveAudioProcessor.prototype.rationalCurveValue = function rationalCurveValue(value = 0, skew = 0) {
  const t = this.clampValue(Number(value) || 0, 0, 1);
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  const safeSkew = this.clampValue(Number(skew) || 0, -0.999999, 0.999999);
  return this.clampValue(
    ((1 + safeSkew) * t) / (1 - safeSkew + 2 * safeSkew * t),
    0,
    1,
  );
};

NodeLiveAudioProcessor.prototype.additiveHarmonicDamping = function additiveHarmonicDamping(harmonic, frequency, rate, curveValue = 0, algorithm = 0, filterFrequency = 20000) {
  const safeRate = Math.max(1, Number(rate) || this.engineSampleRate || sampleRate || 44100);
  const safeFrequency = Math.max(0, Number(frequency) || 0);
  const safeFilterFrequency = this.additiveFilterFrequencyValue(filterFrequency, safeRate);
  if (safeFilterFrequency <= 0 || safeFrequency <= 0) {
    return 1;
  }
  const ratio = this.clampValue((Math.max(1, Number(harmonic) || 1) * safeFrequency) / safeFilterFrequency, 0, 1);
  return this.additiveDampingAmplitude({
    algorithm,
    curveValue,
    harmonic,
    maxHarmonics: Math.max(1, Math.floor(safeFilterFrequency / Math.max(1, safeFrequency))),
    ratio,
  });
};

NodeLiveAudioProcessor.prototype.additiveDampingAmplitude = function additiveDampingAmplitude({
  algorithm = 0,
  curveValue = 0,
  harmonic = 1,
  maxHarmonics = 1,
  ratio = 0,
} = {}) {
  const curve = this.additiveDampingCurveValue(curveValue);
  const mode = this.additiveDampingAlgorithmValue(algorithm);
  const t = this.clampValue(Number(ratio) || 0, 0, 1);
  if (t <= 0) {
    return 1;
  }
  if (t >= 1) {
    return 0;
  }
  if (mode === 1) {
    return this.clampValue((1 - t) ** (1 + curve * 7), 0, 1);
  }
  if (mode === 2) {
    const amount = 0.5 + curve * 12;
    const end = Math.exp(-amount);
    return this.clampValue((Math.exp(-t * amount) - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  if (mode === 3) {
    const cutoff = this.clampValue(0.95 - curve * 0.82, 0.08, 0.95);
    const order = 1 + Math.round(curve * 5);
    const raw = 1 / Math.sqrt(1 + (t / cutoff) ** (2 * order));
    const end = 1 / Math.sqrt(1 + (1 / cutoff) ** (2 * order));
    return this.clampValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  if (mode === 4) {
    const knee = this.clampValue(0.78 - curve * 0.68, 0.04, 0.78);
    if (t <= knee) {
      return 1;
    }
    const local = (t - knee) / Math.max(0.0001, 1 - knee);
    return this.clampValue((1 - local) ** (1 + curve * 7), 0, 1);
  }
  if (mode === 5) {
    const tilt = curve * 4;
    if (tilt <= 0) {
      return 1 - t;
    }
    const h = Math.max(1, Number(harmonic) || 1);
    const maxH = Math.max(h, Number(maxHarmonics) || h);
    const raw = 1 / (h ** tilt);
    const end = 1 / (maxH ** tilt);
    return this.clampValue((raw - end) / Math.max(0.0001, 1 - end), 0, 1);
  }
  return this.clampValue(1 - this.rationalCurveValue(t, curve), 0, 1);
};

NodeLiveAudioProcessor.prototype.additiveHarmonicCurveAmount = function additiveHarmonicCurveAmount({
  algorithm = 0,
  curveValue = 0,
  harmonic = 1,
  maxHarmonics = 1,
  ratio = 0,
} = {}) {
  return this.clampValue(1 - this.additiveDampingAmplitude({
    algorithm,
    curveValue,
    harmonic,
    maxHarmonics,
    ratio,
  }), 0, 1);
};

NodeLiveAudioProcessor.prototype.additiveOscillatorSample = function additiveOscillatorSample(phase, params = {}, rate = this.engineSampleRate || sampleRate) {
  if (
    !params.hasGraphInput &&
    this.nativeAdditiveOscReady &&
    this.nativeAdditiveOsc?.soemdsp_additive_osc_sample
  ) {
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
        this.clampValue(Number(params.level) || 0, 0, 1),
        Number(params.dampingFilterFrequency) || 20000,
        safeRateValue,
      );
    } catch (error) {
      this.nativeAdditiveOscReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "additive_osc",
        status: "disabled",
        message: String(error?.message || error || "native Additive Osc failed"),
      });
    }
  }
  return 0;
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
        : Math.max(0, frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)))),
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
        dampingGraphValueAt: (x) => graphInputValue(nodeId, "Damping Graph", x, 1),
        hasGraphInput,
        harmonics: this.readEffectiveParameter(node, "harmonics", 32, frame, frames, frameValues),
        harmonicPhaseAdd: this.readEffectiveParameter(node, "harmonicPhaseAdd", 0, frame, frames, frameValues),
        harmonicPhaseMultiply: this.readEffectiveParameter(node, "harmonicPhaseMultiply", 0, frame, frames, frameValues),
        level: this.readEffectiveParameter(node, "level", 0.35, frame, frames, frameValues),
        modA: this.readEffectiveParameter(node, "modA", 0.5, frame, frames, frameValues),
        phaseGraphValueAt: (x) => graphInputValue(nodeId, "Phase Graph", x, 0),
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

