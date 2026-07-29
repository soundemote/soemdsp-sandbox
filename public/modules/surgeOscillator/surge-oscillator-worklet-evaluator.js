NodeLiveAudioProcessor.prototype.createSurgeOscillatorState = function createSurgeOscillatorState() {
    return {
      phase: 0,
      prevSyncIn: 0,
      hasPrevSyncIn: false,
      syncedThisSample: false,
      triangleIntegrator: 0,
      masterPhase: 0,
      internalSyncOut: 0,
      nativeHandle: 0,
    };
  };

NodeLiveAudioProcessor.prototype.surgeOscillatorSample = function surgeOscillatorSample(state, options = {}) {
    if (
      this.nativeSurgeOscillatorReady &&
      this.nativeSurgeOscillator?.soemdsp_surge_oscillator_create &&
      this.nativeSurgeOscillator?.soemdsp_surge_oscillator_sample
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeSurgeOscillator.soemdsp_surge_oscillator_create();
        }
        if (state.nativeHandle) {
          const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
          const frequencyHz = Number(options.frequencyHz) || 0;
          const syncIn = Number(options.syncIn) || 0;
          const hasExternalSync = options.hasExternalSync ? 1 : 0;
          const syncFrequencyHz = Number(options.syncFrequencyHz) || 0;
          const waveform = Math.max(0, Math.min(3, Math.round(Number(options.waveform) || 0)));
          const level = Number(options.level) || 0;
          this.nativeSurgeOscillator.soemdsp_surge_oscillator_sample(
            state.nativeHandle,
            frequencyHz,
            sampleRate,
            syncIn,
            hasExternalSync,
            syncFrequencyHz,
            waveform,
            level,
          );
          return {
            Out: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_out(state.nativeHandle)) || 0,
            Saw: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_saw(state.nativeHandle)) || 0,
            Square: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_square(state.nativeHandle)) || 0,
            Tri: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_tri(state.nativeHandle)) || 0,
            Sine: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_sine(state.nativeHandle)) || 0,
            Synced: Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_synced(state.nativeHandle)) || 0,
            "Internal Sync": Number(this.nativeSurgeOscillator.soemdsp_surge_oscillator_internal_sync(state.nativeHandle)) || 0,
          };
        }
      } catch (error) {
        this.nativeSurgeOscillatorReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "surge_oscillator",
          status: "disabled",
          message: String(error?.message || error || "native Surge Oscillator failed"),
        });
      }
    }
    return { Out: 0, Saw: 0, Square: 0, Tri: 0, Sine: 0, Synced: 0, 1: 0, "Internal Sync": 0 };
  };

