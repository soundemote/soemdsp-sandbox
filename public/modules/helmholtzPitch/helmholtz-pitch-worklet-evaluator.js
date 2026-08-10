NodeLiveAudioProcessor.prototype.createHelmholtzState = function createHelmholtzState() {
    return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
  };

NodeLiveAudioProcessor.prototype.helmholtzPitchView = function helmholtzPitchView(frequencyHz) {
    if (!(frequencyHz > 0)) return -1;
    const minHz = 80;
    const octaves = 4;
    const clampedHz = Math.max(minHz, Math.min(minHz * Math.pow(2, octaves), frequencyHz));
    const norm = Math.log2(clampedHz / minHz) / octaves;
    return norm * 2 - 1;
  };

/**
 * Detune vs equal temperament, −1…+1.
 * 0 = exact nearest pitch; ±1 = half-semitone away (midpoint between notes).
 * Crossing the midpoint wraps −1 → +1 (flat of upper becomes sharp of lower).
 * Concert A4 = 440 Hz (same as face MIDI conversion).
 */
NodeLiveAudioProcessor.prototype.helmholtzDetune = function helmholtzDetune(frequencyHz, a4Hz = 440) {
    const f = Number(frequencyHz);
    if (!(f > 0) || !Number.isFinite(f)) {
      return 0;
    }
    const a4 = Number(a4Hz) > 0 ? Number(a4Hz) : 440;
    const midi = 69 + 12 * Math.log2(f / a4);
    if (!Number.isFinite(midi)) {
      return 0;
    }
    // Nearest ET pitch; cents in (−50, +50].
    const nearest = Math.round(midi);
    const cents = (midi - nearest) * 100;
    // Map ±50¢ → ±1. At exact midpoint cents is ±50 → ±1; next sample wraps.
    return Math.max(-1, Math.min(1, cents / 50));
  };

NodeLiveAudioProcessor.prototype.destroyHelmholtzState = function destroyHelmholtzState(state) {
    if (!state?.nativeHandle || !this.nativeHelmholtz?.soemdsp_helmholtz_destroy) return;
    this.nativeHelmholtz.soemdsp_helmholtz_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  };

NodeLiveAudioProcessor.prototype.reportHelmholtzStatus = function reportHelmholtzStatus(status, message = "") {
    const key = `${status}:${message}`;
    if (this.nativeHelmholtzStatusKey === key) return;
    this.nativeHelmholtzStatusKey = key;
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "helmholtz",
      status,
      message,
    });
  };

NodeLiveAudioProcessor.prototype.helmholtzSample = function helmholtzSample(state, input, params, inputConnected = true, rateHz = sampleRate) {
    const silent = { Frequency: 0, Fidelity: 0, Gate: 0, Detune: 0, "Pitch View": -1 };
    if (!inputConnected) {
      this.destroyHelmholtzState(state);
      state.nativeSampleRate = 0;
      state.nativeParamKey = "";
      return silent;
    }
    const native = this.nativeHelmholtz;
    if (!this.nativeHelmholtzReady || !native?.soemdsp_helmholtz_create || !native?.soemdsp_helmholtz_process) {
      if (native) {
        this.reportHelmholtzStatus("disabled", "native Helmholtz exports missing; analyzer outputs zero");
      }
      return silent;
    }
    try {
      const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
      if (!state.nativeHandle || state.nativeSampleRate !== safeRate) {
        if (state.nativeHandle && native.soemdsp_helmholtz_destroy) {
          native.soemdsp_helmholtz_destroy(state.nativeHandle);
        }
        state.nativeHandle = native.soemdsp_helmholtz_create(safeRate) || 0;
        state.nativeSampleRate = safeRate;
        state.nativeParamKey = "";
      }
      if (!state.nativeHandle) {
        this.reportHelmholtzStatus("disabled", "native Helmholtz handle creation failed; analyzer outputs zero");
        return silent;
      }
      const windowSize = Math.max(128, Math.min(4096, Math.round(this.safeFilterNumber(params.windowSize, null) ?? 1024)));
      // UI range 0…1; native still gets a safe clamp (0 → very permissive).
      const threshold = this.clampValue(this.safeFilterNumber(params.threshold, null) ?? 0.93, 0, 1);
      const nativeThreshold = Math.max(0, Math.min(0.999, threshold));
      const paramKey = `${windowSize}:${Math.round(nativeThreshold * 1000)}`;
      if (paramKey !== state.nativeParamKey && native.soemdsp_helmholtz_set_params) {
        state.nativeParamKey = paramKey;
        native.soemdsp_helmholtz_set_params(state.nativeHandle, safeRate, windowSize, nativeThreshold);
      }
      const safeIn = this.safeFilterNumber(input, null) ?? 0;
      native.soemdsp_helmholtz_process(state.nativeHandle, safeIn);
      const frequency = this.safeFilterNumber(native.soemdsp_helmholtz_frequency?.(state.nativeHandle), null) ?? 0;
      const fidelity = this.safeFilterNumber(native.soemdsp_helmholtz_fidelity?.(state.nativeHandle), null) ?? 0;
      // Gate high when a pitch is locked (Frequency set only if fidelity ≥ threshold).
      const gate = frequency > 0 ? 1 : 0;
      return {
        Frequency: frequency,
        Fidelity: fidelity,
        Gate: gate,
        Detune: this.helmholtzDetune(frequency),
        "Pitch View": this.helmholtzPitchView(frequency),
      };
    } catch (error) {
      this.nativeHelmholtzReady = false;
      this.destroyHelmholtzState(state);
      this.reportHelmholtzStatus(
        "disabled",
        `native Helmholtz failed; analyzer outputs zero: ${String(error?.message || error || "unknown error")}`,
      );
      return silent;
    }
  };
