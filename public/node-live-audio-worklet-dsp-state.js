// Extracted from node-live-audio-worklet-core.js (Phase D — dsp state + samples).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.createEarProtector = function createEarProtector(rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const state = typeof createNodeGraphSpeakerProtector2State === "function"
      ? createNodeGraphSpeakerProtector2State(safeRate)
      : this.createSpeakerProtector2State?.(safeRate);
    return {
      state,
      protect: (left = 0, right = left) => {
        if (typeof nodeGraphSpeakerProtector2Protect === "function" && state) {
          return nodeGraphSpeakerProtector2Protect(state, left, right, safeRate);
        }
        return {
          left: Number(left) || 0,
          right: Number(right) || 0,
          gain: 1,
          muted: false,
          engaged: false,
          mode: "idle",
        };
      },
    };
};

NodeLiveAudioProcessor.prototype.createRaptEllipticDecimatorState = function createRaptEllipticDecimatorState() {
    return nodeLiveRaptEllipticQuarterbandSos.map(() => [0, 0]);
};

NodeLiveAudioProcessor.prototype.resetRaptEllipticDecimator = function resetRaptEllipticDecimator() {
    this.raptEllipticDecimatorLeft = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRight = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRatio = this.oversamplingRatio;
};

NodeLiveAudioProcessor.prototype.processRaptEllipticDecimatorSample = function processRaptEllipticDecimatorSample(input, states) {
    let y = Number(input) || 0;
    for (let section = 0; section < nodeLiveRaptEllipticQuarterbandSos.length; section += 1) {
      const [b0, b1, b2, , a1, a2] = nodeLiveRaptEllipticQuarterbandSos[section];
      const z1 = states[section][0];
      const z2 = states[section][1];
      const sectionOut = b0 * y + z1;
      states[section][0] = b1 * y - a1 * sectionOut + z2;
      states[section][1] = b2 * y - a2 * sectionOut;
      y = sectionOut;
    }
    return y;
};

NodeLiveAudioProcessor.prototype.outputSampleClipped = function outputSampleClipped(value) {
    return this.badValueReason(value) || value < -0.95 || value > 0.95;
};

NodeLiveAudioProcessor.prototype.outputSampleTripsEarProtection = function outputSampleTripsEarProtection(value) {
    if (typeof nodeGraphSpeakerProtector2SampleTrips === "function") {
      return nodeGraphSpeakerProtector2SampleTrips(value);
    }
    const number = Number(value);
    const eps = typeof NODE_GRAPH_NUMERIC_PRECISION === "number" ? NODE_GRAPH_NUMERIC_PRECISION : 1e-7;
    return !Number.isFinite(number) || Math.abs(number) >= 1 + eps;
};

NodeLiveAudioProcessor.prototype.badValueReason = function badValueReason(value) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return "NaN";
    }
    if (!Number.isFinite(number)) {
      return "inf";
    }
    if (Math.abs(number) > 999999999) {
      return "exploded";
    }
    if (number !== 0 && Math.abs(number) < 1.1754943508222875e-38) {
      return "denormal";
    }
    return "";
};

NodeLiveAudioProcessor.prototype.readRuntimeOutput = function readRuntimeOutput(frameValues, nodeId, port = "Out") {
    const output = frameValues?.has(nodeId)
      ? frameValues.get(nodeId)
      : this.nodeOutputs.get(nodeId);
    if (output && typeof output === "object") {
      return Number(output[port] ?? output.Out ?? 0);
    }
    return output === undefined || output === null ? 0 : Number(output);
};

NodeLiveAudioProcessor.prototype.phaseRadians = function phaseRadians(value) {
    return this.wrapValue(Number(value) || 0, 0, 1) * Math.PI * 2;
};

NodeLiveAudioProcessor.prototype.nextNoiseSample = function nextNoiseSample(nodeId) {
    const seed = (Math.imul(1664525, this.noiseSeeds.get(nodeId) || 0x12345678) + 1013904223) >>> 0;
    this.noiseSeeds.set(nodeId, seed);
    return (seed / 0xffffffff) * 2 - 1;
};

NodeLiveAudioProcessor.prototype.currentNoiseSample = function currentNoiseSample(nodeId) {
    if (!this.noiseSeeds.has(nodeId)) {
      return this.nextNoiseSample(nodeId);
    }
    return ((this.noiseSeeds.get(nodeId) || 0) / 0xffffffff) * 2 - 1;
};

NodeLiveAudioProcessor.prototype.noiseSeedKey = function noiseSeedKey(nodeId, seedValue, channel = "") {
    const seed = Math.max(0, Math.min(99999, Math.floor(Number(seedValue) || 0)));
    return `${nodeId}${channel ? `:${channel}` : ""}:seed:${seed}`;
};

NodeLiveAudioProcessor.prototype.polyBlep = function polyBlep(phaseCycle, phaseIncrement) {
    const dt = this.clampValue(Math.abs(Number(phaseIncrement) || 0), 1e-6, 0.5);
    if (phaseCycle < dt) {
      const t = phaseCycle / dt;
      return t + t - t * t - 1;
    }
    if (phaseCycle > 1 - dt) {
      const t = (phaseCycle - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
};

NodeLiveAudioProcessor.prototype.polyBlepSquare = function polyBlepSquare(phaseCycle, phaseIncrement) {
    let value = phaseCycle < 0.5 ? 1 : -1;
    value += this.polyBlep(phaseCycle, phaseIncrement);
    value -= this.polyBlep(this.wrapValue(phaseCycle + 0.5, 0, 1), phaseIncrement);
    return value;
};

NodeLiveAudioProcessor.prototype.archimedesSample = function archimedesSample(options = {}) {
    if (
      !this.nativeArchimedesReady
      || !this.nativeArchimedes?.soemdsp_archimedes_create
      || !this.nativeArchimedes?.soemdsp_archimedes_step
    ) {
      throw new Error("native Archimedes Oscillator not ready");
    }
    const state = options.state || this.createArchimedesState();
    const dtShift = this.clampValue(Math.round(Number(options.profile) || 12), 4, 24);
    const freqHz = Math.max(0, Math.round(Number(options.frequency) || 0));
    const ditherBits = Math.max(0, Math.round(Number(options.dither) || 0));
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeArchimedes.soemdsp_archimedes_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Archimedes Oscillator failed to create instance");
    }
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.nativeArchimedes.soemdsp_archimedes_reset(state.nativeHandle);
      this.nativeArchimedes.soemdsp_archimedes_reset_counters(state.nativeHandle);
    }
    state.resetWasHigh = resetHigh;
    this.nativeArchimedes.soemdsp_archimedes_set_profile(state.nativeHandle, dtShift);
    this.nativeArchimedes.soemdsp_archimedes_set_frequency(state.nativeHandle, freqHz);
    this.nativeArchimedes.soemdsp_archimedes_step(state.nativeHandle, ditherBits);
    return {
      sine: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_sine(state.nativeHandle), 0),
      cosine: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_cosine(state.nativeHandle), 0),
      pi: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_extract_pi(state.nativeHandle), 0),
      noiseBelow: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_noise_below?.(state.nativeHandle), 0),
      noiseAbove: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_noise_above?.(state.nativeHandle), 0),
    };
};

NodeLiveAudioProcessor.prototype.createHighpassState = function createHighpassState() {
    return {
      inputBuffer: 0,
      outputBuffer: 0,
    };
};

NodeLiveAudioProcessor.prototype.createLowpassState = function createLowpassState() {
    return {
      outputBuffer: 0,
    };
};

NodeLiveAudioProcessor.prototype.createStereoFilterState = function createStereoFilterState(createFn) {
    return { left: createFn(), mono: createFn(), right: createFn() };
};

NodeLiveAudioProcessor.prototype.createOscResetState = function createOscResetState() {
    return {
      lastReset: 0,
    };
};

NodeLiveAudioProcessor.prototype.createGraphLfoState = function createGraphLfoState() {
    return {
      lastReset: 0,
      // Free-running phasor position in cycles [0, 1). Advanced by rate/sr
      // each sample in Phasor mode so Rate changes only alter slope.
      phase: 0,
      resetFrame: 0,
    };
};

NodeLiveAudioProcessor.prototype.createSamplePlaybackState = function createSamplePlaybackState() {
    return {
      lastGate: 0,
      lastReset: 0,
      lastTrigger: 0,
      phase: 0,
      playing: false,
      rangeKey: "",
      sampleId: "",
    };
};

NodeLiveAudioProcessor.prototype.createArchimedesState = function createArchimedesState() {
    return {
      nativeHandle: 0,
      x: 0,
      y: 1,
      lastSign: 0,
      totalSteps: 0,
      zeroCrossings: 0,
      resetWasHigh: false,
      noiseLow: 0,
    };
};

NodeLiveAudioProcessor.prototype.resetArchimedesState = function resetArchimedesState(state) {
    state.x = 0;
    state.y = 1;
    state.lastSign = 0;
    state.totalSteps = 0;
    state.zeroCrossings = 0;
};

NodeLiveAudioProcessor.prototype.createNoiseGeneratorChannelState = function createNoiseGeneratorChannelState() {
    return { brown: 0, gaussianSpare: null, pink: [0, 0, 0, 0, 0, 0, 0], seed: 0, seedKey: "" };
};

NodeLiveAudioProcessor.prototype.bindPapoulisParameterSmootherNativeHost = function bindPapoulisParameterSmootherNativeHost() {
    if (typeof nodeGraphSetPapoulisParameterSmootherNativeHost !== "function") {
      return;
    }
    if (!this.nativePapoulisFilterReady || !this.nativePapoulisFilter) {
      nodeGraphSetPapoulisParameterSmootherNativeHost(null);
      return;
    }
    const native = this.nativePapoulisFilter;
    const hasSnapExport = typeof native.soemdsp_papoulis_filter_snap === "function";
    nodeGraphSetPapoulisParameterSmootherNativeHost({
      ready: true,
      hasSnapExport,
      create() {
        return native.soemdsp_papoulis_filter_create() || 0;
      },
      sample(handle, input, cutoffHz, rate) {
        return native.soemdsp_papoulis_filter_sample(handle, input, cutoffHz, rate);
      },
      snap(handle, value) {
        if (hasSnapExport) {
          native.soemdsp_papoulis_filter_snap(handle, value);
          return;
        }
        // Legacy wasm without snap: destroy so next sample recreates.
        if (handle && native.soemdsp_papoulis_filter_destroy) {
          native.soemdsp_papoulis_filter_destroy(handle);
        }
      },
      destroy(handle) {
        if (handle && native.soemdsp_papoulis_filter_destroy) {
          native.soemdsp_papoulis_filter_destroy(handle);
        }
      },
    });
};

NodeLiveAudioProcessor.prototype.safeFilterNumber = function safeFilterNumber(value, state) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (!reason) {
      return number;
    }
    if (state) {
      state.inputBuffer = 0;
      state.outputBuffer = 0;
    }
    this.badNumberCount += 1;
    if (!this.lastBadValueNodeId) {
      this.lastBadValueReason = reason;
      this.lastBadValueSource = "";
    }
    return 0;
};

NodeLiveAudioProcessor.prototype.sampleChannelAt = function sampleChannelAt(sample, channelIndex, frameIndex) {
    const channel = sample?.channelData?.[channelIndex] || sample?.samples;
    if (typeof nodeGraphSampleReadHermite === "function") {
      return nodeGraphSampleReadHermite(channel, frameIndex);
    }
    if (!channel?.length) {
      return 0;
    }
    const maxIndex = channel.length - 1;
    const index = this.clampValue(Number(frameIndex) || 0, 0, maxIndex);
    const low = Math.floor(index);
    const high = Math.min(maxIndex, low + 1);
    const frac = index - low;
    return (Number(channel[low]) || 0) + ((Number(channel[high]) || 0) - (Number(channel[low]) || 0)) * frac;
};

NodeLiveAudioProcessor.prototype.sampleStereoAt = function sampleStereoAt(sample, frameIndex) {
    const left = this.sampleChannelAt(sample, 0, frameIndex);
    const right = sample?.channelData?.length > 1
      ? this.sampleChannelAt(sample, 1, frameIndex)
      : left;
    return {
      Left: left,
      Mono: (left + right) * 0.5,
      Out: (left + right) * 0.5,
      Right: right,
    };
};

NodeLiveAudioProcessor.prototype.normalizePatchTiming = function normalizePatchTiming(timing = {}) {
    const source = timing && typeof timing === "object" ? timing : {};
    return {
      tempoBpm: Math.max(1, Math.round(Number(source.tempoBpm) || 120)),
      timeSignatureDenominator: Math.max(1, Math.round(Number(source.timeSignatureDenominator) || 4)),
      timeSignatureNumerator: Math.max(1, Math.round(Number(source.timeSignatureNumerator) || 4)),
    };
};

