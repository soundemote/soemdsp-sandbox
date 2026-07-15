NodeLiveAudioProcessor.prototype.createRandomClockState = function createRandomClockState() {
    return {
      intervalSamples: 0,
      lastReset: 0,
      phaseSamples: 0,
      randomState: 0,
      remainingTriggerSamples: 0,
      seedKey: "",
      nativeHandle: 0,
      lastGate: 0,
    };
  };

NodeLiveAudioProcessor.prototype.randomClockNextUnit = function randomClockNextUnit(state, nodeId, seed) {
    const seedKey = `${nodeId}:${Math.round(Number(seed) || 0)}`;
    if (state.seedKey !== seedKey) {
      state.seedKey = seedKey;
      state.randomState = this.stableSeed(seedKey);
      state.intervalSamples = 0;
      state.phaseSamples = 0;
      state.remainingTriggerSamples = 0;
    }
    state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
    return state.randomState / 4294967296;
  };

NodeLiveAudioProcessor.prototype.randomClockChooseIntervalSamples = function randomClockChooseIntervalSamples(state, params, rateHz, nodeId) {
    const rate = Math.max(1, rateHz || sampleRate || 44100);
    const minSeconds = Math.max(0, this.safeFilterNumber(params.minSeconds, null));
    const maxSeconds = Math.max(0, this.safeFilterNumber(params.maxSeconds, null));
    const low = Math.min(minSeconds, maxSeconds);
    const high = Math.max(minSeconds, maxSeconds);
    const random = this.randomClockNextUnit(state, nodeId, params.seed);
    return Math.max(1, Math.round((low + (high - low) * random) * rate));
  };

NodeLiveAudioProcessor.prototype.randomClockSampleJs = function randomClockSampleJs(state, reset, params, rateHz = sampleRate, nodeId = "") {
    const safeReset = this.safeFilterNumber(reset, null);
    const threshold = this.safeFilterNumber(params.threshold, null);
    const rate = Math.max(1, rateHz || sampleRate || 44100);
    const duty = this.clampValue(this.safeFilterNumber(params.duty, null), 0, 1);
    const triggerTime = Math.max(0, this.safeFilterNumber(params.triggerTime, null));
    const level = this.safeFilterNumber(params.level, null);
    const resetEdge = state.lastReset <= threshold && safeReset > threshold;

    if (resetEdge || state.intervalSamples <= 0) {
      state.intervalSamples = this.randomClockChooseIntervalSamples(state, params, rate, nodeId);
      state.phaseSamples = 0;
      state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
    } else if (state.phaseSamples >= state.intervalSamples) {
      state.intervalSamples = this.randomClockChooseIntervalSamples(state, params, rate, nodeId);
      state.phaseSamples = 0;
      state.remainingTriggerSamples = Math.max(1, Math.round(triggerTime * rate));
    }

    const gateSamples = Math.round(state.intervalSamples * duty);
    const trigger = state.remainingTriggerSamples > 0 ? level : 0;
    const gate = state.phaseSamples < gateSamples ? level : 0;
    state.remainingTriggerSamples = Math.max(0, state.remainingTriggerSamples - 1);
    state.phaseSamples += 1;
    state.lastReset = safeReset;
    return {
      Gate: this.safeFilterNumber(gate, null),
      Trigger: this.safeFilterNumber(trigger, null),
    };
  };

NodeLiveAudioProcessor.prototype.randomClockSample = function randomClockSample(state, reset, params, rateHz = sampleRate, nodeId = "") {
    if (this.nativeRandomClockReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeRandomClock.soemdsp_random_clock_create();
        }
        if (state.nativeHandle) {
          const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
          const seedKeyStr = `${nodeId}:${Math.round(Number(params.seed) || 0)}`;
          const seedInt = this.stableSeed(seedKeyStr) | 0;
          const trigger = this.nativeRandomClock.soemdsp_random_clock_sample(
            state.nativeHandle,
            this.safeFilterNumber(reset, null),
            this.safeFilterNumber(params.threshold, null),
            Math.max(0, this.safeFilterNumber(params.minSeconds, null)),
            Math.max(0, this.safeFilterNumber(params.maxSeconds, null)),
            this.clampValue(this.safeFilterNumber(params.duty, null), 0, 1),
            Math.max(0, this.safeFilterNumber(params.triggerTime, null)),
            this.safeFilterNumber(params.level, null),
            safeRate,
            seedInt,
          );
          return {
            Gate: this.safeFilterNumber(this.nativeRandomClock.soemdsp_random_clock_gate(state.nativeHandle), null),
            Trigger: this.safeFilterNumber(trigger, null),
          };
        }
      } catch (error) {
        this.nativeRandomClockReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "random_clock",
          status: "disabled",
          message: String(error?.message || error || "native Random Clock failed"),
        });
      }
    }
    return this.randomClockSampleJs(state, reset, params, rateHz, nodeId);
  };

