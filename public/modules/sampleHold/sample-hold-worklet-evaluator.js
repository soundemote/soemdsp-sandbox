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
    noise: this.createNoiseGeneratorChannelState(),
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

/**
 * Native path only for classic hold (Interpolate Off). Linear/Smoothstep use JS core.
 */
NodeLiveAudioProcessor.prototype.sampleHoldSample = function sampleHoldSample(
  state,
  input,
  clock,
  threshold,
  sampleFrequency,
  sampleRate,
  hasInConnected,
  nodeId,
  interpolate = 0,
) {
  const interp = typeof nodeGraphSampleHoldNormalizeInterpolate === "function"
    ? nodeGraphSampleHoldNormalizeInterpolate(interpolate)
    : (Math.round(Number(interpolate)) || 0);

  if (interp === 0 && this.nativeSampleHoldReady) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeSampleHold.soemdsp_sample_hold_create();
      }
      if (state.nativeHandle) {
        const safeRate = Math.max(1, Number(sampleRate) || 44100);
        const seedKey = this.seededKey(nodeId, 0, "sampleHoldNoise");
        const seedInt = this.stableSeed(seedKey) | 0;
        return this.safeFilterNumber(
          this.nativeSampleHold.soemdsp_sample_hold_sample(
            state.nativeHandle,
            this.safeFilterNumber(input, null),
            this.safeFilterNumber(clock, null),
            this.safeFilterNumber(threshold, null),
            Math.max(0, Number(sampleFrequency) || 0),
            safeRate,
            hasInConnected ? 1 : 0,
            seedInt,
          ),
          null,
        );
      }
    } catch (error) {
      this.nativeSampleHoldReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "sample_hold",
        status: "disabled",
        message: String(error?.message || error || "native Sample & Hold failed"),
      });
    }
  }

  if (typeof nodeGraphSampleHoldCore === "function") {
    return this.safeFilterNumber(
      nodeGraphSampleHoldCore(
        state,
        this.safeFilterNumber(input, state),
        this.safeFilterNumber(clock, state),
        this.safeFilterNumber(threshold, state),
        sampleFrequency,
        sampleRate,
        hasInConnected,
        nodeId || "sampleHold",
        interp,
      ),
      state,
    );
  }
  return this.safeFilterNumber(input, state) ?? 0;
};
