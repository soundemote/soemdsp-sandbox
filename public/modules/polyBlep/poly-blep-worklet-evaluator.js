// Realtime worklet evaluator for polyBlep / blit / basic osc.
// Native-only — no JS oscillator / BLIT sample fallbacks.

NodeLiveAudioProcessor.prototype.oscillatorSample = function oscillatorSample(nodeId, phase, phaseIncrement, waveform) {
  if (
    !this.nativeBasicOscillatorReady
    || !this.nativeBasicOscillator?.soemdsp_basic_oscillator_create
    || !this.nativeBasicOscillator?.soemdsp_basic_oscillator_sample
  ) {
    return 0;
  }
  try {
    let handle = this.basicOscillatorNativeHandles.get(nodeId);
    if (!handle) {
      handle = this.nativeBasicOscillator.soemdsp_basic_oscillator_create();
      if (handle) {
        this.basicOscillatorNativeHandles.set(nodeId, handle);
      }
    }
    if (!handle) {
      return 0;
    }
    return this.nativeBasicOscillator.soemdsp_basic_oscillator_sample(
      handle,
      Number(phase) || 0,
      Number(phaseIncrement) || 0,
      Math.round(Number(waveform) || 0),
    );
  } catch (_error) {
    this.nativeBasicOscillatorReady = false;
    return 0;
  }
};

/** Silent vector while native wasm is still loading — never throw (throws kill the AudioWorklet). */
NodeLiveAudioProcessor.prototype.polyBlepSilentVector = function polyBlepSilentVector() {
  return { out: 0, saw: 0, ramp: 0, square: 0, tri: 0, sine: 0 };
};

NodeLiveAudioProcessor.prototype.polyBlepNativeVectorSample = function polyBlepNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge, morph = 0.5, neededPorts = null) {
  // Must not throw: process() runs as soon as the node is connected, often
  // before setNativeModuleWasm finishes instantiating. A throw becomes
  // onprocessorerror → muted host + dead scopes.
  if (!this.nativePolyBlepReady || !this.nativePolyBlep?.soemdsp_polyblep_create) {
    return this.polyBlepSilentVector();
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativePolyBlep.soemdsp_polyblep_create();
    }
    if (!state.nativeHandle) {
      return this.polyBlepSilentVector();
    }
    if (resetEdge) {
      this.nativePolyBlep.soemdsp_polyblep_reset?.(state.nativeHandle);
    }
    const morphVal = Number(morph);
    this.nativePolyBlep.soemdsp_polyblep_sample(
      state.nativeHandle,
      Number(phase) || 0,
      Number(phaseIncrement) || 0,
      Math.round(Number(waveform) || 0),
      Number(level) || 0,
      Number.isFinite(morphVal) ? morphVal : 0.5,
    );
    // Only cross WASM for taps that are actually cabled (was 6 getters every sample).
    const need = (portAliases) => {
      if (!neededPorts || !(neededPorts instanceof Set) || neededPorts.size === 0) {
        return true;
      }
      for (let i = 0; i < portAliases.length; i += 1) {
        if (neededPorts.has(portAliases[i])) {
          return true;
        }
      }
      return false;
    };
    const handle = state.nativeHandle;
    const out = need(["Out", "Wave Out", "Noise"])
      ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_out(handle), null)
      : 0;
    return {
      out,
      saw: need(["Saw"]) ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_saw(handle), null) : 0,
      ramp: need(["Ramp"]) ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_ramp(handle), null) : 0,
      square: need(["Square"]) ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_square(handle), null) : 0,
      tri: need(["Tri"]) ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_tri(handle), null) : 0,
      sine: need(["Sine"]) ? this.safeFilterNumber(this.nativePolyBlep.soemdsp_polyblep_sine(handle), null) : 0,
    };
  } catch (_error) {
    this.nativePolyBlepReady = false;
    return this.polyBlepSilentVector();
  }
};

NodeLiveAudioProcessor.prototype.blitNativeVectorSample = function blitNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
  if (!this.nativeBlitReady || !this.nativeBlit?.soemdsp_blit_create) {
    return this.polyBlepSilentVector();
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeBlit.soemdsp_blit_create();
    }
    if (!state.nativeHandle) {
      return this.polyBlepSilentVector();
    }
    if (resetEdge) {
      this.nativeBlit.soemdsp_blit_reset?.(state.nativeHandle);
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
  } catch (_error) {
    this.nativeBlitReady = false;
    return this.polyBlepSilentVector();
  }
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
  let controlState;
  if (node?.type === "polyBlep") {
    controlState = this.polyBlepStates.get(nodeId) || this.createPolyBlepState();
    this.polyBlepStates.set(nodeId, controlState);
  } else if (node?.type === "blit") {
    controlState = this.blitStates.get(nodeId) || this.createBlitState();
    this.blitStates.set(nodeId, controlState);
  } else {
    if (!this.oscControlStates) {
      this.oscControlStates = new Map();
    }
    controlState = this.oscControlStates.get(nodeId) || {};
    this.oscControlStates.set(nodeId, controlState);
  }
  const { params: controls } = this.resolveModuleControlParams(
    node,
    controlState,
    { phase: 0, frequency: 220, waveform: 0, amplitude: 1, shape: 0.5 },
    frame,
    frames,
    frameValues,
  );
  const phaseOffset = this.phaseRadians(controls.phase);
  const frequency = controls.frequency;
  const waveform = controls.waveform;
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
  const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
  const referenceVoltage = referenceMidiNote / 120;
  const hasPitch = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
  const pitchCv = hasPitch
    ? this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null)
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput: typeof hasInput === "function" ? hasInput : (id, port) => this.inputConnections.has(this.inputKey(id, port)),
      mixInput,
      nodeId,
    })
    : this.resolveFrequencyHz(
      (typeof nodeGraphPitchedFrequency === "function"
        ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
        : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1))),
    );
  const phaseIncrement = (effectiveFrequency / safeRate) + incrementInput;
  const level = controls.amplitude;
  const morph = controls.shape;

  // Native-only DSP (APP_POLICY §2 / §5): hosts call one core; no JS twin.
  // polyBlep/blit → vector native module; osc (LFO) → basic_oscillator per tap.
  // Missing WASM → silence (never throw — kills the worklet).
  let value;
  if (node?.type === "polyBlep") {
    const neededPorts = this.nodeUsedOutputPorts?.get(nodeId) || null;
    const nativeVector = this.polyBlepNativeVectorSample(
      controlState,
      phase + phaseOffset,
      phaseIncrement,
      waveform,
      level,
      resetEdge,
      morph,
      neededPorts,
    );
    value = {
      Out: nativeVector.out,
      Saw: nativeVector.saw,
      Ramp: nativeVector.ramp,
      Square: nativeVector.square,
      Tri: nativeVector.tri,
      Sine: nativeVector.sine,
      "Wave Out": nativeVector.out,
      Noise: nativeVector.out,
    };
  } else if (node?.type === "blit") {
    const nativeVector = this.blitNativeVectorSample(
      controlState,
      phase + phaseOffset,
      phaseIncrement,
      waveform,
      level,
      resetEdge,
    );
    value = {
      Out: nativeVector.out,
      Saw: nativeVector.saw,
      Ramp: nativeVector.ramp,
      Square: nativeVector.square,
      Tri: nativeVector.tri,
      Sine: nativeVector.sine,
      "Wave Out": nativeVector.out,
      Noise: nativeVector.out,
    };
  } else {
    // osc (LFO) and any unexpected sibling routed here: basic_oscillator native.
    const ph = phase + phaseOffset;
    const sample = (tapId, wf) => this.oscillatorSample(tapId, ph, phaseIncrement, wf) * level;
    const selected = sample(nodeId, waveform);
    value = {
      Out: selected,
      Saw: sample(`${nodeId}:saw`, 0),
      Ramp: sample(`${nodeId}:ramp`, 1),
      Square: sample(`${nodeId}:square`, 2),
      Tri: sample(`${nodeId}:tri`, 3),
      Sine: sample(`${nodeId}:sine`, 4),
      "Wave Out": selected,
      Noise: selected,
    };
  }

  this.phases.set(
    nodeId,
    this.wrapValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
};
