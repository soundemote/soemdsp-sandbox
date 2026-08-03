// Realtime worklet evaluator for polyBlep / blit / basic osc.
// Native-only — no JS oscillator / BLIT sample fallbacks.

NodeLiveAudioProcessor.prototype.oscillatorSample = function oscillatorSample(nodeId, phase, phaseIncrement, waveform) {
  if (
    !this.nativeBasicOscillatorReady
    || !this.nativeBasicOscillator?.soemdsp_basic_oscillator_create
    || !this.nativeBasicOscillator?.soemdsp_basic_oscillator_sample
  ) {
    throw new Error("native Basic Oscillator not ready");
  }
  let handle = this.basicOscillatorNativeHandles.get(nodeId);
  if (!handle) {
    handle = this.nativeBasicOscillator.soemdsp_basic_oscillator_create();
    if (handle) {
      this.basicOscillatorNativeHandles.set(nodeId, handle);
    }
  }
  if (!handle) {
    throw new Error("native Basic Oscillator failed to create instance");
  }
  return this.nativeBasicOscillator.soemdsp_basic_oscillator_sample(
    handle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
  );
};

NodeLiveAudioProcessor.prototype.polyBlepNativeVectorSample = function polyBlepNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
  if (!this.nativePolyBlepReady || !this.nativePolyBlep?.soemdsp_polyblep_create) {
    throw new Error("native PolyBLEP not ready");
  }
  if (!state.nativeHandle) {
    state.nativeHandle = this.nativePolyBlep.soemdsp_polyblep_create();
  }
  if (!state.nativeHandle) {
    throw new Error("native PolyBLEP failed to create instance");
  }
  if (resetEdge) {
    this.nativePolyBlep.soemdsp_polyblep_reset(state.nativeHandle);
  }
  this.nativePolyBlep.soemdsp_polyblep_sample(
    state.nativeHandle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
    Number(level) || 0,
  );
  return {
    out: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_out(state.nativeHandle), null),
    saw: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_saw(state.nativeHandle), null),
    ramp: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_ramp(state.nativeHandle), null),
    square: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_square(state.nativeHandle), null),
    tri: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_tri(state.nativeHandle), null),
    sine: this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_sine(state.nativeHandle), null),
  };
};

NodeLiveAudioProcessor.prototype.blitNativeVectorSample = function blitNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
  if (!this.nativeBlitReady || !this.nativeBlit?.soemdsp_blit_create) {
    throw new Error("native BLIT not ready");
  }
  if (!state.nativeHandle) {
    state.nativeHandle = this.nativeBlit.soemdsp_blit_create();
  }
  if (!state.nativeHandle) {
    throw new Error("native BLIT failed to create instance");
  }
  if (resetEdge) {
    this.nativeBlit.soemdsp_blit_reset(state.nativeHandle);
  }
  this.nativeBlit.soemdsp_blit_sample(
    state.nativeHandle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
    Number(level) || 0,
  );
  return {
    out: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_out(state.nativeHandle), null),
    saw: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_saw(state.nativeHandle), null),
    ramp: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_ramp(state.nativeHandle), null),
    square: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_square(state.nativeHandle), null),
    tri: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_tri(state.nativeHandle), null),
    sine: this.safeFilterNumber(this.nativeBlit.soemdsp_blit_sine(state.nativeHandle), null),
  };
};

NodeLiveAudioProcessor.prototype.createPolyBlepState = function createPolyBlepState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.createBlitState = function createBlitState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.polyBlepOscillatorWorkletEvaluate = function polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate) {
  const resetState = this.oscResetStates.get(nodeId) || this.createOscResetState();
  this.oscResetStates.set(nodeId, resetState);
  const resetValue = this.safeFilterNumber(mixInput(nodeId, "Reset"), resetState);
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : this.phases.get(nodeId) || 0;
  if (resetEdge) {
    this.triangleStates.set(nodeId, 0);
  }
  const phaseOffset = this.phaseRadians(
    this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
  );
  const frequency = this.readEffectiveParameter(node, "frequency", 220, frame, frames, frameValues);
  const waveform = this.readEffectiveParameter(node, "waveform", 0, frame, frames, frameValues);
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
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
  const phaseIncrement = (effectiveFrequency / safeRate) + incrementInput;
  const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);

  let nativeVector;
  if (node?.type === "polyBlep") {
    const polyBlepState = this.polyBlepStates.get(nodeId) || this.createPolyBlepState();
    this.polyBlepStates.set(nodeId, polyBlepState);
    nativeVector = this.polyBlepNativeVectorSample(
      polyBlepState,
      phase + phaseOffset,
      phaseIncrement,
      waveform,
      level,
      resetEdge,
    );
  } else if (node?.type === "blit") {
    const blitState = this.blitStates.get(nodeId) || this.createBlitState();
    this.blitStates.set(nodeId, blitState);
    nativeVector = this.blitNativeVectorSample(
      blitState,
      phase + phaseOffset,
      phaseIncrement,
      waveform,
      level,
      resetEdge,
    );
  } else {
    throw new Error(`polyBlep worklet: unexpected type ${node?.type || "?"}`);
  }

  this.phases.set(
    nodeId,
    this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return {
    Out: nativeVector.out,
    Saw: nativeVector.saw,
    Ramp: nativeVector.ramp,
    Square: nativeVector.square,
    Tri: nativeVector.tri,
    Sine: nativeVector.sine,
    "Wave Out": nativeVector.out,
    Noise: nativeVector.out,
  };
};
