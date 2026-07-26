// Realtime worklet evaluator methods for osc/polyBlep/blit, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.polyBlepOscillatorWorkletEvaluate(...) via thin
// arrow functions still declared in core.js's buildLiveModuleEvaluators().
// polyBlep/polyBlepSquare (the raw bandlimited-step functions) stay in
// core.js -- confirmed shared with another, unrelated registry entry.
NodeLiveAudioProcessor.prototype.oscillatorSample = function oscillatorSample(nodeId, phase, phaseIncrement, waveform) {
  if (
    this.nativeBasicOscillatorReady &&
    this.nativeBasicOscillator?.soemdsp_basic_oscillator_create &&
    this.nativeBasicOscillator?.soemdsp_basic_oscillator_sample
  ) {
    try {
      let handle = this.basicOscillatorNativeHandles.get(nodeId);
      if (!handle) {
        handle = this.nativeBasicOscillator.soemdsp_basic_oscillator_create();
        if (handle) {
          this.basicOscillatorNativeHandles.set(nodeId, handle);
        }
      }
      if (handle) {
        return this.nativeBasicOscillator.soemdsp_basic_oscillator_sample(
          handle,
          Number(phase) || 0,
          Number(phaseIncrement) || 0,
          Math.round(Number(waveform) || 0),
        );
      }
    } catch (error) {
      this.nativeBasicOscillatorReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "basic_oscillator",
        status: "disabled",
        message: String(error?.message || error || "native Basic Oscillator failed"),
      });
    }
  }
  return this.oscillatorSampleJs(nodeId, phase, phaseIncrement, waveform);
};

// Naive LFO waveshapes matching native_modules/basic_oscillator (no
// polyBLEP / anti-aliasing). Discontinuities and triangle corners are raw.
NodeLiveAudioProcessor.prototype.oscillatorSampleJs = function oscillatorSampleJs(nodeId, phase, phaseIncrement, waveform) {
  const phaseDelta = Number(phaseIncrement) || 0;
  const phaseStopped = Math.abs(phaseDelta) <= 1e-12;
  if (phaseStopped && this.oscillatorStoppedSamples.has(nodeId)) {
    return this.oscillatorStoppedSamples.get(nodeId) || 0;
  }
  const phaseCycle = this.wrapValue(phase / (Math.PI * 2), 0, 1);

  let sample = 0;
  switch (Math.round(Number(waveform) || 0)) {
    case 1: // Ramp
      sample = -1 + phaseCycle * 2;
      break;
    case 2: // Square
      sample = phaseCycle < 0.5 ? 1 : -1;
      break;
    case 3: // Triangle
      sample = 1 - 4 * Math.abs(phaseCycle - 0.5);
      break;
    case 4: // Sine
      sample = Math.sin(phase);
      break;
    case 5: // Noise
      sample = phaseStopped ? this.currentNoiseSample(nodeId) : this.nextNoiseSample(nodeId);
      break;
    case 0: // Saw
    default:
      sample = 1 - phaseCycle * 2;
      break;
  }

  if (phaseStopped) {
    this.oscillatorStoppedSamples.set(nodeId, sample);
  } else {
    this.oscillatorStoppedSamples.delete(nodeId);
  }
  return sample;
};

NodeLiveAudioProcessor.prototype.polyBlepNativeVectorSample = function polyBlepNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
  if (!this.nativePolyBlepReady) {
    return null;
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativePolyBlep.soemdsp_polyblep_create();
    }
    if (!state.nativeHandle) {
      return null;
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
  } catch (error) {
    this.nativePolyBlepReady = false;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "polyblep",
      status: "disabled",
      message: String(error?.message || error || "native PolyBLEP failed"),
    });
    return null;
  }
};

NodeLiveAudioProcessor.prototype.blitNativeVectorSample = function blitNativeVectorSample(state, phase, phaseIncrement, waveform, level, resetEdge) {
  if (!this.nativeBlitReady) {
    return null;
  }
  try {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeBlit.soemdsp_blit_create();
    }
    if (!state.nativeHandle) {
      return null;
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
  } catch (error) {
    this.nativeBlitReady = false;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "blit",
      status: "disabled",
      message: String(error?.message || error || "native BLIT failed"),
    });
    return null;
  }
};

// JS fallback mirroring native_modules/blit/blit.cpp (v5): the actual
// Stilson & Smith closed-form BLIT algorithm, following the structure of
// the Synthesis ToolKit's (STK) BlitSaw/BlitSquare classes -- an integer
// odd harmonic count (no exp()/pow() rolloff parameter), DC removed by
// subtracting the impulse's known average (1/period), and a fixed fast
// leak (0.995, per STK) rather than a near-true-integrator gain. Square
// is two saws a half-cycle apart, subtracted (per the original paper).
// Triangle leaky-integrates that square through a gentle frequency-
// tracking one-pole. Each tap (Saw/Ramp/Square/Tri/Sine) keeps its own
// filter state, keyed by the sub-id the caller passes in.
NodeLiveAudioProcessor.prototype.blitSawUpdate = function blitSawUpdate(state, periodSamples) {
  const p = periodSamples;
  const maxHarmonics = Math.floor(0.5 * p);
  const m = 2 * maxHarmonics + 1;
  const a = m / p;
  const c2 = 1.0 / p;

  const denom = Math.sin(state.phase);
  let tmp;
  if (denom > -1e-9 && denom < 1e-9) {
    tmp = a;
  } else {
    tmp = Math.sin(m * state.phase) / (p * denom);
  }
  tmp += state.state - c2;
  state.state = tmp * state.leak;

  state.phase += Math.PI / p;
  state.phase = this.wrapValue(state.phase, 0, Math.PI);

  return tmp;
};

NodeLiveAudioProcessor.prototype.blitJsState = function blitJsState(key) {
  let state = this.blitJsIntegrators.get(key);
  if (!state) {
    state = {
      sawA: { phase: 0, state: 0, leak: 0.995 },
      sawB: { phase: Math.PI * 0.5, state: 0, leak: 0.995 },
      triState: 0,
    };
    this.blitJsIntegrators.set(key, state);
  }
  return state;
};

NodeLiveAudioProcessor.prototype.blitOscillatorSample = function blitOscillatorSample(key, phase, phaseIncrement, waveform) {
  const BLIT_SAW_GAIN = 1.6;
  const BLIT_TRI_GAIN = 2.0;

  // phaseIncrement is cycles-per-sample directly (matches every other
  // oscillator's convention here, e.g. polyBlepOscillatorSample) -- not
  // radians-per-sample, so no /(2*pi) conversion belongs here.
  const state = this.blitJsState(key);
  const dt = this.clampValue(Math.abs(Number(phaseIncrement) || 0), 1e-6, 0.5);
  const periodSamples = 1.0 / dt;
  const sawARaw = this.blitSawUpdate(state.sawA, periodSamples) * BLIT_SAW_GAIN;
  const sawBRaw = this.blitSawUpdate(state.sawB, periodSamples) * BLIT_SAW_GAIN;

  switch (Math.round(Number(waveform) || 0)) {
    case 1:
      return -this.clampValue(sawARaw, -1.0, 1.0);
    case 2:
      return this.clampValue(sawARaw - sawBRaw, -1.0, 1.0);
    case 3: {
      const sqOut = this.clampValue(sawARaw - sawBRaw, -1.0, 1.0);
      state.triState += dt * BLIT_TRI_GAIN * (sqOut - state.triState);
      return this.clampValue(state.triState, -1.0, 1.0);
    }
    case 4:
      return Math.sin(phase);
    case 0:
    default:
      return this.clampValue(sawARaw, -1.0, 1.0);
  }
};

NodeLiveAudioProcessor.prototype.createPolyBlepState = function createPolyBlepState() {
  return {
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.createBlitState = function createBlitState() {
  return {
    nativeHandle: 0,
  };
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
  const frequency = this.readEffectiveParameter(
    node,
    "frequency",
    220,
    frame,
    frames,
    frameValues,
  );
  const waveform = this.readEffectiveParameter(
    node,
    "waveform",
    0,
    frame,
    frames,
    frameValues,
  );
  const incrementInput = this.safeFilterNumber(mixInput(nodeId, "Increment"), null);
  const pitchInput = this.clampValue(
    this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null),
    -1,
    1,
  );
  const pitchedFrequency = frequency * (2 ** (pitchInput / 0.1));
  const phaseIncrement = (pitchedFrequency / safeRate) + incrementInput;
  const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
  let nativeVector = null;
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
  }
  let value;
  if (nativeVector) {
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
    const sampleOscillator = (sampleNodeId, sampleWaveform) => {
      if (node?.type === "blit") {
        return this.blitOscillatorSample(sampleNodeId, phase + phaseOffset, phaseIncrement, sampleWaveform);
      }
      return this.oscillatorSample(sampleNodeId, phase + phaseOffset, phaseIncrement, sampleWaveform);
    };
    const selected = sampleOscillator(nodeId, waveform) * level;
    value = {
      Out: selected,
      Saw: sampleOscillator(`${nodeId}:saw`, 0) * level,
      Ramp: sampleOscillator(`${nodeId}:ramp`, 1) * level,
      Square: sampleOscillator(`${nodeId}:square`, 2) * level,
      Tri: sampleOscillator(`${nodeId}:tri`, 3) * level,
      Sine: sampleOscillator(`${nodeId}:sine`, 4) * level,
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
