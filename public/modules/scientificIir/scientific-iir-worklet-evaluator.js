// Worklet: classical scientific IIR (native preferred) + dedicated bandpass (EQ SVF Peak).

const nodeGraphScientificIirNativeSpecs = Object.freeze([
  { type: "butterworth", kind: 0, snake: "butterworth", create: "soemdsp_butterworth_create", sample: "soemdsp_butterworth_sample", destroy: "soemdsp_butterworth_destroy" },
  { type: "linkwitzRiley", kind: 1, snake: "linkwitz_riley", create: "soemdsp_linkwitz_riley_create", sample: "soemdsp_linkwitz_riley_sample", destroy: "soemdsp_linkwitz_riley_destroy" },
  { type: "bessel", kind: 2, snake: "bessel", create: "soemdsp_bessel_create", sample: "soemdsp_bessel_sample", destroy: "soemdsp_bessel_destroy" },
  { type: "chebyshev", kind: 3, snake: "chebyshev", create: "soemdsp_chebyshev_create", sample: "soemdsp_chebyshev_sample", destroy: "soemdsp_chebyshev_destroy" },
  { type: "elliptic", kind: 4, snake: "elliptic", create: "soemdsp_elliptic_create", sample: "soemdsp_elliptic_sample", destroy: "soemdsp_elliptic_destroy" },
]);

NodeLiveAudioProcessor.prototype.createScientificIirState = function createScientificIirState() {
  if (typeof createNodeGraphScientificIirState === "function") {
    return createNodeGraphScientificIirState();
  }
  return { sections: [], nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.createStereoScientificIirState = function createStereoScientificIirState() {
  return this.createStereoFilterState(() => this.createScientificIirState());
};

NodeLiveAudioProcessor.prototype.scientificIirNativeApi = function scientificIirNativeApi(type) {
  const readyKey = `native${type[0].toUpperCase()}${type.slice(1)}Ready`;
  const apiKey = `native${type[0].toUpperCase()}${type.slice(1)}`;
  if (!this[readyKey] || !this[apiKey]) return null;
  return this[apiKey];
};

NodeLiveAudioProcessor.prototype.scientificIirSample = function scientificIirSample(
  type,
  kind,
  state,
  input,
  mode,
  frequency,
  order,
  bandwidth,
  ripple,
  rate = sampleRate,
) {
  const spec = nodeGraphScientificIirNativeSpecs.find((s) => s.type === type);
  const api = this.scientificIirNativeApi(type);
  if (api && spec) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = api[spec.create]();
      }
      if (state.nativeHandle) {
        return this.safeFilterNumber(
          api[spec.sample](
            state.nativeHandle,
            this.safeFilterNumber(input, state),
            Math.max(0, Math.min(3, Math.round(Number(mode) || 0))),
            Math.max(0, Number(frequency) || 0),
            Math.round(Number(order) || 4),
            Math.max(0.05, Number(bandwidth) || 1),
            Math.max(0.01, Number(ripple) || 1),
            Math.max(1, Number(rate) || sampleRate || 44100),
          ),
          state,
        );
      }
    } catch (error) {
      const readyKey = `native${type[0].toUpperCase()}${type.slice(1)}Ready`;
      this[readyKey] = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: spec.snake,
        status: "disabled",
        message: String(error?.message || error || `native ${type} failed`),
      });
    }
  }
  if (typeof nodeGraphScientificIirSample === "function") {
    return this.safeFilterNumber(
      nodeGraphScientificIirSample(state, input, kind, mode, frequency, order, bandwidth, ripple, rate),
      state,
    );
  }
  return this.safeFilterNumber(input, state) ?? 0;
};

NodeLiveAudioProcessor.prototype.destroyScientificIirNativeState = function destroyScientificIirNativeState(type, state) {
  if (!state?.nativeHandle) return;
  const spec = nodeGraphScientificIirNativeSpecs.find((s) => s.type === type);
  const api = this.scientificIirNativeApi(type);
  if (api && spec && api[spec.destroy]) {
    try {
      api[spec.destroy](state.nativeHandle);
    } catch (_) {
      /* ignore */
    }
  }
  state.nativeHandle = 0;
};

// Bandpass: EQ SVF Bandpass Peak (mode 4) — true resonant 2-pole, constant 0 dB peak.
NodeLiveAudioProcessor.prototype.createBandpassState = function createBandpassState() {
  if (typeof createNodeGraphEqFilterState === "function") {
    return createNodeGraphEqFilterState();
  }
  return { z1: 0, z2: 0 };
};

NodeLiveAudioProcessor.prototype.createStereoBandpassState = function createStereoBandpassState() {
  return this.createStereoFilterState(() => this.createBandpassState());
};

NodeLiveAudioProcessor.prototype.bandpassSample = function bandpassSample(state, input, frequency, q, rate = sampleRate) {
  if (typeof nodeGraphEqFilterSample === "function") {
    return this.safeFilterNumber(
      nodeGraphEqFilterSample(state, this.safeFilterNumber(input, state), 4, frequency, q, 0, rate),
      state,
    );
  }
  return this.safeFilterNumber(input, state) ?? 0;
};

NodeLiveAudioProcessor.prototype.createAllpassState = function createAllpassState() {
  if (typeof createNodeGraphEqFilterState === "function") {
    return createNodeGraphEqFilterState();
  }
  return { z1: 0, z2: 0 };
};

NodeLiveAudioProcessor.prototype.createStereoAllpassState = function createStereoAllpassState() {
  return this.createStereoFilterState(() => this.createAllpassState());
};

NodeLiveAudioProcessor.prototype.allpassSample = function allpassSample(state, input, frequency, q, rate = sampleRate) {
  if (typeof nodeGraphEqFilterSample === "function") {
    return this.safeFilterNumber(
      nodeGraphEqFilterSample(state, this.safeFilterNumber(input, state), 6, frequency, q, 0, rate),
      state,
    );
  }
  return this.safeFilterNumber(input, state) ?? 0;
};

// UC placeholders
NodeLiveAudioProcessor.prototype.formantFilterSample = function formantFilterSample(_state, input) {
  return this.safeFilterNumber(input, null) ?? 0;
};

NodeLiveAudioProcessor.prototype.binaryClockSample = function binaryClockSample() {
  return { Out: 0, Bit0: 0, Bit1: 0, Bit2: 0, Bit3: 0, Gate: 0 };
};

NodeLiveAudioProcessor.prototype.thereminSample = function thereminSample() {
  return { Out: 0, Pitch: 0, Volume: 0 };
};

NodeLiveAudioProcessor.prototype.oscSample = function oscSample() {
  return { Out: 0, X: 0, Y: 0, Gate: 0 };
};

// UC electro drum voices (silent placeholders)
NodeLiveAudioProcessor.prototype.electroKickSample = function electroKickSample() {
  return { Out: 0 };
};

NodeLiveAudioProcessor.prototype.electroSnareSample = function electroSnareSample() {
  return { Out: 0 };
};

NodeLiveAudioProcessor.prototype.electroHatSample = function electroHatSample() {
  return { Out: 0 };
};

// UC multi-frame wavetable oscillators (silent placeholders)
NodeLiveAudioProcessor.prototype.wavetable2dSample = function wavetable2dSample() {
  return { Out: 0 };
};

NodeLiveAudioProcessor.prototype.wavetable3dSample = function wavetable3dSample() {
  return { Out: 0 };
};

// UC RGB pixel-grid experiments (silent placeholder)
NodeLiveAudioProcessor.prototype.pixelGridSample = function pixelGridSample() {
  return {};
};

// UC Flex Grid (silent multi-out placeholder)
NodeLiveAudioProcessor.prototype.flexGridSample = function flexGridSample() {
  return { Out: 0, X: 0, Y: 0 };
};

// UC Chaosfly (silent chaos placeholder)
NodeLiveAudioProcessor.prototype.chaosflySample = function chaosflySample() {
  return { Out: 0, X: 0, Y: 0, Z: 0 };
};

// UC Drummer (silent Sequence placeholder)
NodeLiveAudioProcessor.prototype.drummerSample = function drummerSample() {
  return { Out: 0, Kick: 0, Snare: 0, Hat: 0, Gate: 0 };
};

// UC Arp (silent Musical placeholder)
NodeLiveAudioProcessor.prototype.arpSample = function arpSample() {
  return { Out: 0, Pitch: 0, Gate: 0 };
};

// UC GM sample voices (silent Sample Player placeholders)
NodeLiveAudioProcessor.prototype.ePianoSample = function ePianoSample() {
  return { Out: 0 };
};

NodeLiveAudioProcessor.prototype.percussionSample = function percussionSample() {
  return { Out: 0 };
};
