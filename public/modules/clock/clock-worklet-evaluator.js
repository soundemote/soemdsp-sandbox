NodeLiveAudioProcessor.prototype.createClockState = function createClockState() {
    return {
      hasStarted: false,
      phase: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.clockAnalogWhipSample = function clockAnalogWhipSample(phase, level) {
    const p = this.clampValue(Number(phase) || 0, 0, 1);
    const attack = 1 - Math.pow(1 - Math.min(1, p / 0.035), 4);
    const release = Math.pow(Math.max(0, 1 - p), 1.85);
    const snapEnvelope = attack * release;
    const sweepTurns = (3.15 * (1 - Math.exp(-4.2 * p)) / (1 - Math.exp(-4.2))) + (0.18 * Math.sin(Math.PI * p));
    const liquidBend = 0.075 * Math.sin(Math.PI * 2 * p) * Math.pow(Math.max(0, 1 - p), 1.2);
    const body = Math.sin((sweepTurns + liquidBend) * Math.PI * 2);
    const sheen = Math.sin((sweepTurns * 2.02 + 0.17) * Math.PI * 2) * 0.16 * Math.pow(Math.max(0, 1 - p), 2.8);
    return (body + sheen) * snapEnvelope * level;
  };

NodeLiveAudioProcessor.prototype.clockSampleJs = function clockSampleJs(state, reset, phaseOffset, rate, duty, level, rateHz = sampleRate) {
    const safeReset = this.safeFilterNumber(reset, null);
    const safePhaseOffset = this.wrapValue(this.safeFilterNumber(phaseOffset, null), 0, 1);
    const safeRate = Math.max(0, this.safeFilterNumber(rate, null));
    const safeDuty = this.clampValue(this.safeFilterNumber(duty, null), 0, 1);
    const safeLevel = this.safeFilterNumber(level, null);
    const resetActive = safeReset > 0;
    const rawPhase = resetActive ? 0 : this.wrapValue(Number(state.phase) || 0, 0, 1);
    const phase = this.wrapValue(rawPhase + safePhaseOffset, 0, 1);
    const digital = phase < safeDuty ? safeLevel : 0;
    const analog = this.clockAnalogWhipSample(phase, safeLevel);
    const nextRawPhase = this.wrapValue(rawPhase + safeRate / Math.max(1, rateHz), 0, 1);
    const pulse = safeRate > 0 && !resetActive && (!state.hasStarted || nextRawPhase < rawPhase) ? safeLevel : 0;
    state.hasStarted = !resetActive;
    state.phase = resetActive ? 0 : nextRawPhase;
    return {
      "Analog Out": analog,
      "Digital Out": digital,
      Out: digital,
      Pulse: pulse,
    };
  };

NodeLiveAudioProcessor.prototype.clockSample = function clockSample(state, reset, phaseOffset, rate, duty, level, rateHz = sampleRate) {
    if (this.nativeClockReady) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeClock.soemdsp_clock_create();
        }
        if (state.nativeHandle) {
          const safeRateHz = Math.max(1, Number(rateHz) || sampleRate || 44100);
          const digital = this.safeFilterNumber(
            this.nativeClock.soemdsp_clock_sample(
              state.nativeHandle,
              this.safeFilterNumber(reset, null),
              this.safeFilterNumber(phaseOffset, null),
              Math.max(0, this.safeFilterNumber(rate, null)),
              this.clampValue(this.safeFilterNumber(duty, null), 0, 1),
              this.safeFilterNumber(level, null),
              safeRateHz,
            ),
            null,
          );
          const analog = this.safeFilterNumber(this.nativeClock.soemdsp_clock_analog_out(state.nativeHandle), null);
          const pulse = this.safeFilterNumber(this.nativeClock.soemdsp_clock_pulse(state.nativeHandle), null);
          return {
            "Analog Out": analog,
            "Digital Out": digital,
            Out: digital,
            Pulse: pulse,
          };
        }
      } catch (error) {
        this.nativeClockReady = false;
        state.nativeHandle = 0;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "clock",
          status: "disabled",
          message: String(error?.message || error || "native Clock failed"),
        });
      }
    }
    return this.clockSampleJs(state, reset, phaseOffset, rate, duty, level, rateHz);
  };

