NodeLiveAudioProcessor.prototype.createRandomClockState = function createRandomClockState() {
    return {
      intervalSamples: 0,
      intervalUnit: 0,
      lastMaxSeconds: NaN,
      lastMinSeconds: NaN,
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
      state.intervalUnit = 0;
      state.lastMinSeconds = NaN;
      state.lastMaxSeconds = NaN;
      state.phaseSamples = 0;
      state.remainingTriggerSamples = 0;
    }
    state.randomState = (Math.imul(state.randomState || 1, 1664525) + 1013904223) >>> 0;
    return state.randomState / 4294967296;
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
    // JS path: pure math (random-clock-math.js).
    if (typeof nodeGraphRandomClockCore === "function") {
      const out = nodeGraphRandomClockCore(
        state,
        this.safeFilterNumber(reset, null),
        params || {},
        rateHz,
        nodeId,
      );
      return {
        Gate: this.safeFilterNumber(out.Gate, null),
        Trigger: this.safeFilterNumber(out.Trigger, null),
      };
    }
    return { Gate: 0, Trigger: 0 };
  };

