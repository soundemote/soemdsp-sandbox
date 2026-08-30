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

NodeLiveAudioProcessor.POLYBLEP_NATIVE_BLOCK_SIZE = 128;
NodeLiveAudioProcessor.POLYBLEP_TAP_OUT = 1;
NodeLiveAudioProcessor.POLYBLEP_TAP_SAW = 2;
NodeLiveAudioProcessor.POLYBLEP_TAP_RAMP = 4;
NodeLiveAudioProcessor.POLYBLEP_TAP_SQUARE = 8;
NodeLiveAudioProcessor.POLYBLEP_TAP_TRI = 16;
NodeLiveAudioProcessor.POLYBLEP_TAP_SINE = 32;

/** Silent vector while native wasm is still loading — never throw (throws kill the AudioWorklet). */
NodeLiveAudioProcessor.prototype.polyBlepSilentVector = function polyBlepSilentVector(into) {
  const v = into || { out: 0, saw: 0, ramp: 0, square: 0, tri: 0, sine: 0 };
  v.out = 0;
  v.saw = 0;
  v.ramp = 0;
  v.square = 0;
  v.tri = 0;
  v.sine = 0;
  return v;
};

NodeLiveAudioProcessor.prototype.polyBlepTapMaskFromPorts = function polyBlepTapMaskFromPorts(neededPorts) {
  if (!neededPorts || !(neededPorts instanceof Set) || neededPorts.size === 0) {
    return 63; // all taps
  }
  let mask = 0;
  if (neededPorts.has("Out") || neededPorts.has("Wave Out") || neededPorts.has("Noise")) {
    mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_OUT;
  }
  if (neededPorts.has("Saw")) mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_SAW;
  if (neededPorts.has("Ramp")) mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_RAMP;
  if (neededPorts.has("Square")) mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_SQUARE;
  if (neededPorts.has("Tri")) mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_TRI;
  if (neededPorts.has("Sine")) mask |= NodeLiveAudioProcessor.POLYBLEP_TAP_SINE;
  return mask || NodeLiveAudioProcessor.POLYBLEP_TAP_OUT;
};

NodeLiveAudioProcessor.prototype.bindPolyBlepBlockViews = function bindPolyBlepBlockViews(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.views && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const views = [];
  for (let tap = 0; tap < 6; tap += 1) {
    const ptr = native.soemdsp_polyblep_block_out_ptr?.(state.nativeHandle, tap);
    if (!ptr) {
      return false;
    }
    views[tap] = new Float64Array(memory.buffer, ptr, blockSize);
  }
  cache.views = views;
  cache.memory = memory.buffer;
  cache.size = blockSize;
  cache.cursor = 0;
  return true;
};

NodeLiveAudioProcessor.prototype.polyBlepNativeVectorSample = function polyBlepNativeVectorSample(
  state,
  phase,
  phaseIncrement,
  waveform,
  level,
  resetEdge,
  morph = 0.5,
  neededPorts = null,
  useBlock = false,
) {
  // Must not throw: process() runs as soon as the node is connected, often
  // before setNativeModuleWasm finishes instantiating. A throw becomes
  // onprocessorerror → muted host + dead scopes.
  const outVec = state.outVec || (state.outVec = { out: 0, saw: 0, ramp: 0, square: 0, tri: 0, sine: 0 });
  if (!this.nativePolyBlepReady || !this.nativePolyBlep?.soemdsp_polyblep_create) {
    return this.polyBlepSilentVector(outVec);
  }
  try {
    const native = this.nativePolyBlep;
    if (!state.nativeHandle) {
      state.nativeHandle = native.soemdsp_polyblep_create();
      state.blockCache = null;
    }
    if (!state.nativeHandle) {
      return this.polyBlepSilentVector(outVec);
    }
    if (resetEdge) {
      native.soemdsp_polyblep_reset?.(state.nativeHandle);
      if (state.blockCache) {
        state.blockCache.cursor = 0;
      }
    }
    const morphVal = Number.isFinite(Number(morph)) ? Number(morph) : 0.5;
    const tapMask = this.polyBlepTapMaskFromPorts(neededPorts);
    const nativeVer = Number(native.soemdsp_polyblep_version?.() || 0);
    const blockSize = Math.min(
      NodeLiveAudioProcessor.POLYBLEP_NATIVE_BLOCK_SIZE,
      Number(native.soemdsp_polyblep_max_block_frames?.()) || 128,
    );

    if (
      useBlock
      && nativeVer >= 5
      && native.soemdsp_polyblep_process_block
      && this.bindPolyBlepBlockViews(native, state, blockSize)
    ) {
      const cache = state.blockCache;
      const index = cache.cursor;
      outVec.out = (tapMask & 1) ? (cache.views[0][index] || 0) : 0;
      outVec.saw = (tapMask & 2) ? (cache.views[1][index] || 0) : 0;
      outVec.ramp = (tapMask & 4) ? (cache.views[2][index] || 0) : 0;
      outVec.square = (tapMask & 8) ? (cache.views[3][index] || 0) : 0;
      outVec.tri = (tapMask & 16) ? (cache.views[4][index] || 0) : 0;
      outVec.sine = (tapMask & 32) ? (cache.views[5][index] || 0) : 0;
      cache.cursor += 1;
      if (cache.cursor >= blockSize) {
        // Generate the *next* block starting at the phase after this sample.
        const phaseStep = Math.PI * 2 * (Number(phaseIncrement) || 0);
        const nextPhase0 = (Number(phase) || 0) + phaseStep;
        native.soemdsp_polyblep_process_block(
          state.nativeHandle,
          blockSize,
          nextPhase0,
          Number(phaseIncrement) || 0,
          Math.round(Number(waveform) || 0),
          Number(level) || 0,
          morphVal,
          tapMask,
        );
        cache.cursor = 0;
      }
      return outVec;
    }

    if (native.soemdsp_polyblep_sample_masked) {
      native.soemdsp_polyblep_sample_masked(
        state.nativeHandle,
        Number(phase) || 0,
        Number(phaseIncrement) || 0,
        Math.round(Number(waveform) || 0),
        Number(level) || 0,
        morphVal,
        tapMask,
      );
    } else {
      native.soemdsp_polyblep_sample(
        state.nativeHandle,
        Number(phase) || 0,
        Number(phaseIncrement) || 0,
        Math.round(Number(waveform) || 0),
        Number(level) || 0,
        morphVal,
      );
    }
    const handle = state.nativeHandle;
    outVec.out = (tapMask & 1) ? this.safeFilterNumber(native.soemdsp_polyblep_out(handle), null) : 0;
    outVec.saw = (tapMask & 2) ? this.safeFilterNumber(native.soemdsp_polyblep_saw(handle), null) : 0;
    outVec.ramp = (tapMask & 4) ? this.safeFilterNumber(native.soemdsp_polyblep_ramp(handle), null) : 0;
    outVec.square = (tapMask & 8) ? this.safeFilterNumber(native.soemdsp_polyblep_square(handle), null) : 0;
    outVec.tri = (tapMask & 16) ? this.safeFilterNumber(native.soemdsp_polyblep_tri(handle), null) : 0;
    outVec.sine = (tapMask & 32) ? this.safeFilterNumber(native.soemdsp_polyblep_sine(handle), null) : 0;
    return outVec;
  } catch (_error) {
    this.nativePolyBlepReady = false;
    return this.polyBlepSilentVector(outVec);
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
    { phase: 0, frequency: 220, waveform: 0, amplitude: 1, morph: 0.5 },
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
  const morph = controls.morph;

  // Native-only DSP (APP_POLICY §2 / §5): hosts call one core; no JS twin.
  // polyBlep/blit → vector native module; osc (LFO) → basic_oscillator per tap.
  // Missing WASM → silence (never throw — kills the worklet).
  let value;
  if (node?.type === "polyBlep") {
    const neededPorts = this.nodeUsedOutputPorts?.get(nodeId) || null;
    // Block path when pitch/increment are Control-stable (no audio-rate wire).
    const useBlock = !hasPitch && !(Math.abs(incrementInput) > 1e-12);
    const nativeVector = this.polyBlepNativeVectorSample(
      controlState,
      phase + phaseOffset,
      phaseIncrement,
      waveform,
      level,
      resetEdge,
      morph,
      neededPorts,
      useBlock,
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
