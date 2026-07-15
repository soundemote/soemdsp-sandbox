NodeLiveAudioProcessor.prototype.createPingPongDelayState = function createPingPongDelayState() {
    return {
      bufferL: new Float32Array(1),
      bufferR: new Float32Array(1),
      bufferSize: 1,
      position: 0,
      wetL: 0,
      wetR: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.pingPongTimingModeMultiplier = function pingPongTimingModeMultiplier(mode) {
    const rounded = Math.round(Number(mode) || 0);
    if (rounded === 1) {
      return 1.5; // Dotted
    }
    if (rounded === 2) {
      return 2 / 3; // Triplet: three fit in the space of two normal notes
    }
    return 1; // Normal
  };

NodeLiveAudioProcessor.prototype.pingPongDelayFraction = function pingPongDelayFraction(numerator, denominator) {
    const effectiveNumerator = Math.max(0, Number(numerator) || 0);
    if (effectiveNumerator === 0) {
      return 0;
    }
    const effectiveDenominator = Math.max(0, Number(denominator) || 0);
    return effectiveNumerator / Math.max(1, effectiveDenominator);
  };

NodeLiveAudioProcessor.prototype.pingPongDelaySeconds = function pingPongDelaySeconds(params) {
    const secondsPerWholeNote = 240 / Math.max(1, Number(this.timing?.tempoBpm) || 120);
    const fraction = this.pingPongDelayFraction(params.timeNumerator, params.timeDenominator);
    const syncedSeconds = secondsPerWholeNote * fraction * this.pingPongTimingModeMultiplier(params.timingMode);
    const offsetSeconds = (Number(params.offsetMs) || 0) / 1000;
    return syncedSeconds + offsetSeconds;
  };

NodeLiveAudioProcessor.prototype.pingPongDelaySampleJs = function pingPongDelaySampleJs(state, input, params, rateHz = sampleRate) {
    const safeRate = Math.max(1, Number(rateHz) || 44100);
    const maxDelaySeconds = 8;
    const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
    if (!state.bufferL || state.bufferSize !== requiredSize) {
      state.bufferL = new Float32Array(requiredSize);
      state.bufferR = new Float32Array(requiredSize);
      state.bufferSize = requiredSize;
      state.position = 0;
      state.wetL = 0;
      state.wetR = 0;
    }
    const dry = this.safeFilterNumber(input, null);
    const feedback = this.clampValue(this.safeFilterNumber(params.feedback, null), 0, 0.95);
    const mix = this.clampValue(this.safeFilterNumber(params.mix, null), 0, 1);
    const level = this.clampValue(this.safeFilterNumber(params.level, null), 0, 2);

    // The computed time is what gets bounded to fit the (necessarily finite)
    // delay buffer -- timeNumerator/timeDenominator/offsetMs themselves are
    // read as-is above, in pingPongDelaySeconds, with no clamp.
    const rawSeconds = this.pingPongDelaySeconds(params);
    const safeSeconds = Number.isFinite(rawSeconds) ? Math.max(0, rawSeconds) : 0;
    const delaySamples = this.clampValue(safeSeconds * safeRate, 1, state.bufferSize - 2);

    state.position = (state.position + 1) % state.bufferSize;
    const readPosition = (state.position + state.bufferSize - delaySamples) % state.bufferSize;
    const readL = this.delayInterpolateLinear(state.bufferL, readPosition);
    const readR = this.delayInterpolateLinear(state.bufferR, readPosition);

    // Classic ping-pong topology: the input only ever enters the left line;
    // the right line is driven purely by the left line's own feedback, so a
    // single input bounces left -> right -> left -> right as it decays.
    const writeL = dry + readR * feedback;
    const writeR = readL * feedback;
    state.bufferL[state.position] = this.clampValue(writeL, -8, 8);
    state.bufferR[state.position] = this.clampValue(writeR, -8, 8);
    state.wetL = readL;
    state.wetR = readR;

    return {
      Left: (dry * (1 - mix) + state.wetL * mix) * level,
      Right: (dry * (1 - mix) + state.wetR * mix) * level,
    };
  };

NodeLiveAudioProcessor.prototype.pingPongDelaySample = function pingPongDelaySample(state, input, params, rateHz = sampleRate) {
    if (this.nativePingPongDelayReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativePingPongDelay.soemdsp_ping_pong_delay_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
          const left = this.nativePingPongDelay.soemdsp_ping_pong_delay_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, null),
            this.safeFilterNumber(params.feedback, null),
            this.safeFilterNumber(params.mix, null),
            this.safeFilterNumber(params.level, null),
            this.safeFilterNumber(params.timeNumerator, null),
            this.safeFilterNumber(params.timeDenominator, null),
            this.safeFilterNumber(params.timingMode, null),
            this.safeFilterNumber(params.offsetMs, null),
            Math.max(1, Number(this.timing?.tempoBpm) || 120),
            safeRate,
          );
          return {
            Left: this.safeFilterNumber(left, null),
            Right: this.safeFilterNumber(this.nativePingPongDelay.soemdsp_ping_pong_delay_right(state.nativeHandle), null),
          };
        }
      } catch (error) {
        this.nativePingPongDelayReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ping_pong_delay",
          status: "disabled",
          message: String(error?.message || error || "native Ping Pong Delay failed"),
        });
      }
    }
    return this.pingPongDelaySampleJs(state, input, params, rateHz);
  };

