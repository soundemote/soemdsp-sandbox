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
          const frequencyHz = nodeGraphFiniteNumber(options.frequencyHz);
          const syncIn = nodeGraphFiniteNumber(options.syncIn);
          const hasExternalSync = options.hasExternalSync ? 1 : 0;
          const syncFrequencyHz = nodeGraphFiniteNumber(options.syncFrequencyHz);
          const waveform = Math.max(0, Math.min(3, Math.round(nodeGraphFiniteNumber(options.waveform))));
          const level = nodeGraphFiniteNumber(options.level);
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
          const main = nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_out(state.nativeHandle));
          return {
            Wave: main,
            Out: main,
            Saw: nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_saw(state.nativeHandle)),
            Square: nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_square(state.nativeHandle)),
            Tri: nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_tri(state.nativeHandle)),
            Sine: nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_sine(state.nativeHandle)),
            Synced: nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_synced(state.nativeHandle)),
            "Internal Sync": nodeGraphFiniteNumber(this.nativeSurgeOscillator.soemdsp_surge_oscillator_internal_sync(state.nativeHandle)),
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
    return { Wave: 0, Out: 0, Saw: 0, Square: 0, Tri: 0, Sine: 0, Synced: 0, 1: 0, "Internal Sync": 0 };
  };

