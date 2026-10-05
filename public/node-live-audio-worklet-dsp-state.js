// Extracted from node-live-audio-worklet-core.js (Phase D — dsp state + samples).
// Load after core class, before registerProcessor.

/** Apply oversamplingFactor / engineSampleRate from a plan or connection message.
 *  Updates process() ratio, resets native Rapt-elliptic decimator on ratio change, and
 *  pushes engine rate into the live native graph without clearing topology.
 *  @returns {boolean} true when ratio or engine rate changed
 */
NodeLiveAudioProcessor.prototype.applyOversamplingFromMessage = function applyOversamplingFromMessage(message = {}) {
    const prevRatio = this.oversamplingRatio;
    const prevEngine = this.engineSampleRate;
    if (Number.isFinite(Number(message.sampleRate)) && Number(message.sampleRate) > 0) {
      this.hostSampleRate = Math.max(1, Number(message.sampleRate));
    }
    const rawFactor = Math.round(Number(
      message.oversamplingFactor ?? message.oversamplingRatio ?? this.oversamplingRatio ?? 1,
    ));
    const factor = (rawFactor === 2 || rawFactor === 4) ? rawFactor : 1;
    this.oversamplingRatio = factor;
    this.oversamplingFactor = factor;
    const engineFromMsg = Number(message.engineSampleRate);
    const host = Math.max(1, nodeGraphFiniteNumber(this.hostSampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
    this.engineSampleRate = Number.isFinite(engineFromMsg) && engineFromMsg > 0
      ? engineFromMsg
      : host * factor;
    if (this.nativeRaptDecimatorRatio !== this.oversamplingRatio) {
      this.resetNativeRaptDecimators?.();
      this.nativeRaptDecimatorRatio = this.oversamplingRatio;
    }
    const changed = prevRatio !== this.oversamplingRatio || prevEngine !== this.engineSampleRate;
    if (changed && typeof this.applyNativeGraphSampleRate === "function") {
      this.applyNativeGraphSampleRate();
    }
    return changed;
};

NodeLiveAudioProcessor.prototype.outputSampleClipped = function outputSampleClipped(value) {
    return this.badValueReason(value) || value < -0.95 || value > 0.95;
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
    return this.wrapValue(nodeGraphFiniteNumber(value), 0, 1) * Math.PI * 2;
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
    const seed = Math.max(0, Math.min(99999, Math.floor(nodeGraphFiniteNumber(seedValue))));
    return `${nodeId}${channel ? `:${channel}` : ""}:seed:${seed}`;
};

NodeLiveAudioProcessor.prototype.polyBlep = function polyBlep(phaseCycle, phaseIncrement) {
    const dt = this.clampValue(Math.abs(nodeGraphFiniteNumber(phaseIncrement)), 1e-6, 0.5);
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
    const dtShift = this.clampValue(Math.round(nodeGraphFiniteNumber(options.profile, 12)), 4, 24);
    const freqHz = Math.max(0, Math.round(nodeGraphFiniteNumber(options.frequency)));
    const ditherBits = Math.max(0, Math.round(nodeGraphFiniteNumber(options.dither)));
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

// Sample & Hold lane bundle (Efficient Live DSP is native graph; setPlan still
// allocates these for destroy/clear bookkeeping after the JS evaluator retired).
NodeLiveAudioProcessor.prototype.createSampleHoldState = function createSampleHoldState() {
  return {
    clockPhase: 0,
    held: 0,
    from: 0,
    out: 0,
    samplesInSegment: 0,
    segmentSamples: 1,
    lastIntervalSamples: 0,
    samplesSinceFire: 0,
    lastTrigger: 0,
    pendingFireSamples: 0,
    noise: typeof this.createNoiseGeneratorChannelState === "function"
      ? this.createNoiseGeneratorChannelState()
      : { seed: 1 },
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.createStereoSampleHoldState = function createStereoSampleHoldState() {
  return {
    ext: this.createSampleHoldState(),
    left: this.createSampleHoldState(),
    right: this.createSampleHoldState(),
  };
};

// Mono-only patches must not pay for three independent channel instances.
// Always run Out; run Left/Right only when those jacks are wired.
// Reuse one port object per nodeId — new {Out,Left,Right} every sample was GC fuel.
NodeLiveAudioProcessor.prototype.stereoProcessPorts = function stereoProcessPorts(nodeId, hasInput, outM, processLeft, processRight) {
  const hasL = typeof hasInput === "function" && hasInput(nodeId, "Left");
  const hasR = typeof hasInput === "function" && hasInput(nodeId, "Right");
  const bucket = this._stereoPortBucket || (this._stereoPortBucket = new Map());
  let out = bucket.get(nodeId);
  if (!out) {
    out = { Out: 0, Left: 0, Right: 0 };
    bucket.set(nodeId, out);
  }
  out.Out = outM;
  if (!hasL && !hasR) {
    out.Left = outM;
    out.Right = outM;
    return out;
  }
  out.Left = hasL ? processLeft() : outM;
  out.Right = hasR ? processRight() : outM;
  return out;
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

NodeLiveAudioProcessor.prototype.sampleChannelAt = function sampleChannelAt(sample, channelIndex, frameIndex, interpolation) {
    const channel = sample?.channelData?.[channelIndex] || sample?.samples;
    const hermite = interpolation !== "linear";
    if (hermite && typeof nodeGraphSampleReadHermite === "function") {
      return nodeGraphSampleReadHermite(channel, frameIndex);
    }
    if (typeof nodeGraphSampleReadLinear === "function") {
      return nodeGraphSampleReadLinear(channel, frameIndex);
    }
    if (!channel?.length) {
      return 0;
    }
    const maxIndex = channel.length - 1;
    const index = this.clampValue(nodeGraphFiniteNumber(frameIndex), 0, maxIndex);
    const low = Math.floor(index);
    const high = Math.min(maxIndex, low + 1);
    const frac = index - low;
    return (nodeGraphFiniteNumber(channel[low])) + ((nodeGraphFiniteNumber(channel[high])) - (nodeGraphFiniteNumber(channel[low]))) * frac;
};

NodeLiveAudioProcessor.prototype.sampleStereoAt = function sampleStereoAt(sample, frameIndex, interpolation) {
    const left = this.sampleChannelAt(sample, 0, frameIndex, interpolation);
    const right = sample?.channelData?.length > 1
      ? this.sampleChannelAt(sample, 1, frameIndex, interpolation)
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
      tempoBpm: Math.max(1, Math.round(nodeGraphFiniteNumber(source.tempoBpm, 120))),
      timeSignatureDenominator: Math.max(1, Math.round(nodeGraphFiniteNumber(source.timeSignatureDenominator, 4))),
      timeSignatureNumerator: Math.max(1, Math.round(nodeGraphFiniteNumber(source.timeSignatureNumerator, 4))),
    };
};



/** Pitch Detector state stub (DSP is native graph type 191). */
NodeLiveAudioProcessor.prototype.createHelmholtzState = function createHelmholtzState() {
  return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
};

NodeLiveAudioProcessor.prototype.destroyHelmholtzState = function destroyHelmholtzState(state) {
  if (!state?.nativeHandle || !this.nativeHelmholtz?.soemdsp_helmholtz_destroy) return;
  try {
    this.nativeHelmholtz.soemdsp_helmholtz_destroy(state.nativeHandle);
  } catch (_e) { /* ignore */ }
  state.nativeHandle = 0;
};
