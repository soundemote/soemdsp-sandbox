NodeLiveAudioProcessor.prototype.createDsfOscillatorState = function createDsfOscillatorState() {
    return { t: 0, sawAcc: 0, sqAcc: 0, blendSqAcc: 0, triAcc: 0, triPeak: 1, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.dsfPureSawEng = function dsfPureSawEng(t, n) {
    const denom = Math.sin(Math.PI * t);
    if (denom > -1e-9 && denom < 1e-9) return (2 * n + 1) - 1;
    return Math.sin(Math.PI * t * (2 * n + 1)) / denom - 1;
  };

NodeLiveAudioProcessor.prototype.dsfPureSawEngMorphed = function dsfPureSawEngMorphed(t, nMax, morph) {
    const m = this.clampValue(Number(morph) || 0, 0, 1);
    const target = 1 + m * (nMax - 1);
    const lowN = Math.max(1, Math.floor(target));
    const highN = Math.min(lowN + 1, nMax);
    const frac = target - lowN;
    return this.dsfPureSawEng(t, lowN) * (1 - frac) + this.dsfPureSawEng(t, highN) * frac;
  };

NodeLiveAudioProcessor.prototype.dsfAdaptiveRetention = function dsfAdaptiveRetention(dt) {
    return Math.exp(-0.23026 * dt);
  };

NodeLiveAudioProcessor.prototype.dsfOscillatorSampleJs = function dsfOscillatorSampleJs(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const safeFrequency = Number(options.frequencyHz) > 1 ? Number(options.frequencyHz) : 1;
    const dt = this.clampValue((Number(options.frequencyHz) || 0) / sampleRate, -0.5, 0.5);
    const waveform = Math.round(Number(options.waveform) || 0);
    const phaseOffset = this.wrapValue(Number(options.phase) || 0, 0, 1);
    const level = Number(options.level) || 0;

    let sample;
    if (waveform === 0) {
      state.t = this.wrapValue(state.t + dt, 0, 1);
      // Phase is a pure time offset on the free-running cycle.
      sample = Math.sin(this.wrapValue(state.t + phaseOffset, 0, 1) * Math.PI * 2);
    } else {
      const nyquist = sampleRate * 0.5;
      const nMax = Math.max(1, Math.floor(nyquist / safeFrequency));
      state.t = this.wrapValue(state.t + dt * 0.9999, 0, 1);
      const renderT = this.wrapValue(state.t + phaseOffset, 0, 1);

      const retention = this.dsfAdaptiveRetention(dt);
      const rawSaw = this.dsfPureSawEngMorphed(renderT, nMax, options.morph);
      state.sawAcc = state.sawAcc * retention + rawSaw * dt;

      if (waveform === 1) {
        sample = state.sawAcc;
      } else if (waveform === 4) {
        // SquSaw: crossfades Saw with a plain, fixed 50%-duty Square,
        // decoupled from the PWM slider on purpose -- reported live as
        // sounding "triangle-like" when it inherited PWM's variable duty
        // cycle; simplified back to always crossfading two cleanly-
        // shaped waveforms instead.
        const rawBlendSquare = rawSaw - this.dsfPureSawEngMorphed(this.wrapValue(renderT - 0.5, 0, 1), nMax, options.morph);
        state.blendSqAcc = state.blendSqAcc * retention + rawBlendSquare * dt;
        const blend = this.clampValue(Number(options.blend) ?? 0.5, 0, 1);
        sample = state.sawAcc * (1 - blend) + state.blendSqAcc * blend;
      } else {
        const pw = this.clampValue(Number(options.pulseWidth) ?? 0.5, 0.01, 0.99);
        const rawShiftedSaw = this.dsfPureSawEngMorphed(this.wrapValue(renderT - pw, 0, 1), nMax, options.morph);
        const rawSquare = rawSaw - rawShiftedSaw;
        state.sqAcc = state.sqAcc * retention + rawSquare * dt;

        if (waveform === 2) {
          sample = state.sqAcc;
        } else {
          state.triAcc = state.triAcc * retention + state.sqAcc * dt * 4;
          // Compensate for the fundamental's own amplitude shrinking
          // toward 0 as pulseWidth approaches 0 or 1 -- reported live as
          // Trimorph going quiet toward silence at extreme PWM.
          const compensation = 1 / this.clampValue(Math.abs(Math.sin(Math.PI * pw)), 0.05, 1);
          const compensatedTri = state.triAcc * compensation;
          state.triPeak = Math.max(1, state.triPeak * 0.999 + Math.abs(compensatedTri) * 0.001);
          sample = compensatedTri / state.triPeak;
        }
      }
    }

    if (!Number.isFinite(sample)) sample = 0;
    const out = this.clampValue(sample, -1.5, 1.5) * level;
    return { Out: out };
  };

NodeLiveAudioProcessor.prototype.dsfOscillatorSample = function dsfOscillatorSample(state, options = {}) {
    if (
      this.nativeDsfOscillatorReady &&
      this.nativeDsfOscillator?.soemdsp_dsf_oscillator_create &&
      this.nativeDsfOscillator?.soemdsp_dsf_oscillator_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeDsfOscillator.soemdsp_dsf_oscillator_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const waveform = Math.round(Number(options.waveform) || 0);
          const morph = Number(options.morph) || 0;
          const pulseWidth = Number(options.pulseWidth) ?? 0.5;
          const blend = Number(options.blend) ?? 0.5;
          const phase = Number(options.phase) || 0;
          const level = Number(options.level) || 0;
          this.nativeDsfOscillator.soemdsp_dsf_oscillator_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            waveform,
            morph,
            pulseWidth,
            blend,
            phase,
            level,
          );
          return {
            Out: Number(this.nativeDsfOscillator.soemdsp_dsf_oscillator_out(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeDsfOscillatorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "dsf_oscillator",
          status: "disabled",
          message: String(error?.message || error || "native DSF Oscillator failed"),
        });
      }
    }
    return this.dsfOscillatorSampleJs(state, options);
  };

