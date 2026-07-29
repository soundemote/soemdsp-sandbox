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
    return { Out: 0 };
  };

