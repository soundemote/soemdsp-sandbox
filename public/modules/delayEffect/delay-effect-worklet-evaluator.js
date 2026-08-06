NodeLiveAudioProcessor.prototype.createDelayEffectState = function createDelayEffectState() {
    return {
      buffer: new Float32Array(1),
      bufferSize: 1,
      lfoPhase: 0,
      lfoVariationState: 0,
      position: 0,
      wet: 0,
      nativeHandle: 0,
      nativeSeed: 0,
      nativeSeedKey: "",
    };
  };

NodeLiveAudioProcessor.prototype.createStereoDelayEffectState = function createStereoDelayEffectState() {
    return {
      left: this.createDelayEffectState(),
      mono: this.createDelayEffectState(),
      right: this.createDelayEffectState(),
    };
  };

NodeLiveAudioProcessor.prototype.delayParabolSample = function delayParabolSample(phase) {
    const wrapped = phase - Math.floor(phase);
    return wrapped < 0.5 ? wrapped * 4 - 1 : 3 - wrapped * 4;
  };

NodeLiveAudioProcessor.prototype.delayEffectInterp = function delayEffectInterp(buffer, where, interpolation = 1) {
    if (typeof nodeGraphDelayInterpolate === "function") {
      return nodeGraphDelayInterpolate(buffer, where, interpolation);
    }
    const length = buffer?.length || 0;
    if (!length) return 0;
    const mode = Math.round(Number(interpolation) || 0);
    let w = Number(where) || 0;
    while (w < 0) w += length;
    if (mode < 1) {
      const before = Math.floor(w) % length;
      const after = (before + 1) % length;
      const mix = w - Math.floor(w);
      return buffer[before] * (1 - mix) + buffer[after] * mix;
    }
    const whole = Math.floor(w);
    const t = w - whole;
    let i0 = whole % length;
    if (i0 < 0) i0 += length;
    const im1 = i0 === 0 ? length - 1 : i0 - 1;
    const i1 = i0 + 1 >= length ? i0 + 1 - length : i0 + 1;
    const i2 = i1 + 1 >= length ? i1 + 1 - length : i1 + 1;
    const ym1 = buffer[im1] || 0;
    const y0 = buffer[i0] || 0;
    const y1 = buffer[i1] || 0;
    const y2 = buffer[i2] || 0;
    const c0 = y0;
    const c1 = 0.5 * (y1 - ym1);
    const c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * t + c2) * t + c1) * t + c0;
  };

NodeLiveAudioProcessor.prototype.delayEffectSampleJs = function delayEffectSampleJs(state, input, params, rateHz = sampleRate, nodeId = "") {
    const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const maxDelaySeconds = 4.25;
    const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
    if (!state.buffer || state.bufferSize !== requiredSize) {
      state.buffer = new Float32Array(requiredSize);
      state.bufferSize = requiredSize;
      state.position = 0;
      state.lfoPhase = 0;
      state.lfoVariationState = 0;
      state.wet = 0;
    }
    const dry = this.safeFilterNumber(input, null);
    const time = this.clampValue(Number(params.time) || 0, 0.001, maxDelaySeconds);
    const feedback = this.clampValue(Number(params.feedback) || 0, 0, 0.95);
    const mix = this.clampValue(Number(params.mix) || 0, 0, 1);
    const level = this.clampValue(Number(params.level) || 0, 0, 2);
    const modAmount = this.clampValue(Number(params.modAmount) || 0, 0, 0.5);
    const modRate = this.clampValue(Number(params.modRate) || 0, 0, 90);
    const modVariation = this.clampValue(Number(params.modVariation) || 0, 0, 1);
    const mode = Math.round(Number(params.mode) || 0) >= 1 ? 1 : 0;
    const interpMode = Math.round(Number(params.interpolation) || 0) >= 1 ? 1 : 0;

    const seedKey = `${nodeId}:delayVariation`;
    if (state.nativeSeedKey !== seedKey) {
      state.nativeSeedKey = seedKey;
      state.nativeSeed = this.stableSeed ? this.stableSeed(seedKey) : 1;
    }
    const variationTarget = this.hashBipolar
      ? this.hashBipolar(Math.floor(state.lfoPhase * 997) + state.position, state.nativeSeed)
      : 0;
    state.lfoVariationState += (variationTarget - state.lfoVariationState) * Math.min(1, modRate / safeRate);
    const variedRate = Math.max(0, modRate * (1 + state.lfoVariationState * modVariation));
    state.lfoPhase = (state.lfoPhase + variedRate / safeRate) % 1;
    const lfo = (this.delayParabolSample(state.lfoPhase) + 1) * 0.5;

    const delaySamples = Math.max(1, Math.min(state.bufferSize - 2, time * safeRate));
    const bufferOffset = delaySamples - delaySamples * lfo * modAmount + 1;
    state.position = (state.position + 1) % state.bufferSize;
    const readPosition = (state.position + state.bufferSize - bufferOffset) % state.bufferSize;
    const wet = this.delayEffectInterp(state.buffer, readPosition, interpMode);
    const write = mode ? ((0 - dry) - wet * feedback) : (dry + wet * feedback);
    state.buffer[state.position] = Math.max(-8, Math.min(8, write));
    state.wet = mode ? (dry * feedback - wet * (1 - feedback * feedback)) : wet;
    const dryOut = dry * level;
    const mixOut = (dry * (1 - mix) + state.wet * mix) * level;
    return { Dry: dryOut, Mix: mixOut, Out: mixOut };
  };

NodeLiveAudioProcessor.prototype.delayEffectSample = function delayEffectSample(state, input, params, rateHz = sampleRate, nodeId = "") {
    // Prefer JS when Hermite is selected so Interp works without a native rebuild.
    // Native delay_effect is linear-only today.
    const wantHermite = Math.round(Number(params.interpolation) || 0) >= 1;
    if (
      !wantHermite
      && this.nativeDelayEffectReady
      && this.nativeDelayEffect?.soemdsp_delay_effect_create
      && this.nativeDelayEffect?.soemdsp_delay_effect_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeDelayEffect.soemdsp_delay_effect_create();
        }
        if (state.nativeHandle) {
          const seedKey = `${nodeId}:delayVariation`;
          if (state.nativeSeedKey !== seedKey) {
            state.nativeSeedKey = seedKey;
            state.nativeSeed = this.stableSeed(seedKey);
          }
          const safeRateValue = Math.max(1, Number(rateHz) || 44100);
          const modeValue = Math.round(this.safeFilterNumber(params.mode, null)) >= 1 ? 1 : 0;
          this.nativeDelayEffect.soemdsp_delay_effect_sample(
            state.nativeHandle,
            Number(input) || 0,
            this.clampValue(Number(params.time) || 0, 0.001, 4.25),
            this.clampValue(Number(params.feedback) || 0, 0, 0.95),
            this.clampValue(Number(params.mix) || 0, 0, 1),
            this.clampValue(Number(params.level) || 0, 0, 2),
            this.clampValue(Number(params.modAmount) || 0, 0, 0.5),
            this.clampValue(Number(params.modRate) || 0, 0, 90),
            this.clampValue(Number(params.modVariation) || 0, 0, 1),
            modeValue,
            state.nativeSeed >>> 0,
            safeRateValue,
          );
          const mixOut = this.nativeDelayEffect.soemdsp_delay_effect_out(state.nativeHandle);
          const dryOut = (Number(input) || 0) * this.clampValue(Number(params.level) || 0, 0, 2);
          return {
            Dry: dryOut,
            Mix: mixOut,
            Out: mixOut,
          };
        }
      } catch (error) {
        this.nativeDelayEffectReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "delay_effect",
          status: "disabled",
          message: String(error?.message || error || "native Delay Effect failed"),
        });
      }
    }
    return this.delayEffectSampleJs(state, input, params, rateHz, nodeId);
  };

