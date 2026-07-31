NodeLiveAudioProcessor.prototype.hypersawPolyBlep = function hypersawPolyBlep(t, dt) {
    if (dt <= 0) return 0;
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  };

NodeLiveAudioProcessor.prototype.hypersawWrap01 = function hypersawWrap01(x) {
    const w = x - Math.floor(x);
    return w < 0 ? 0 : (w >= 1 ? 0 : w);
  };

NodeLiveAudioProcessor.prototype.createHypersawVoice = function createHypersawVoice() {
    return { phase: 0, randomOffset: Math.random() - 0.5, driftLp: 0 };
  };

NodeLiveAudioProcessor.prototype.createHypersawState = function createHypersawState() {
    const voices = [];
    for (let i = 0; i < 32; i++) {
      voices.push(this.createHypersawVoice());
    }
    return { voices, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.hypersawAdvanceVoices = function hypersawAdvanceVoices(state, options = {}) {
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const safeFrequency = Number(options.frequencyHz) > 0 ? Number(options.frequencyHz) : 0;
    const phaseOffset = this.hypersawWrap01(Number(options.phaseOffset) || 0);
    const numVoices = this.clampValue(Math.round(Number(options.numVoices) || 1), 1, 32);
    const spreadAmt = this.clampValue(Number(options.spread) || 0, 0, 1);
    const randomAmt = this.clampValue(Number(options.randomAmount) || 0, 0, 1);
    const driftAmt = this.clampValue(Number(options.driftAmount) || 0, 0, 1);

    // Drift is a genuine reflecting random walk, NOT a lowpass filter over
    // fresh-every-sample white noise (that was tried first and is a bug --
    // filtering a brand-new random value each sample suppresses its
    // variance to near-nothing at any audio-rate-appropriate coefficient).
    // stepScale is normalized by 1/sqrt(sampleRate) so the walk's
    // diffusive growth reaches a given wander range in the same wall-
    // clock time regardless of sample rate; reflecting at +/-0.5 keeps it
    // bounded while still continuously wandering.
    const driftStepScale = 0.2 / Math.sqrt(sampleRate);
    const phaseIncrement = safeFrequency / sampleRate;

    const sawSamples = new Array(numVoices);
    const voicePhases = new Array(numVoices);
    const voicePans = new Array(numVoices);

    for (let i = 0; i < numVoices; i++) {
      const voice = state.voices[i];
      const basePosition = i / numVoices;
      voice.driftLp += (Math.random() * 2 - 1) * driftStepScale;
      if (voice.driftLp > 0.5) voice.driftLp = 1 - voice.driftLp;
      if (voice.driftLp < -0.5) voice.driftLp = -1 - voice.driftLp;

      const dispersion = basePosition * spreadAmt + voice.randomOffset * randomAmt + voice.driftLp * driftAmt;
      const renderPhase = this.hypersawWrap01(voice.phase + phaseOffset + dispersion);
      sawSamples[i] = 2 * renderPhase - 1 - this.hypersawPolyBlep(renderPhase, phaseIncrement > 0 ? phaseIncrement : 1);
      // Display position is dispersion only -- voice.phase runs at the
      // fundamental frequency (the pitch itself), not something a "voice
      // position" display should show.
      voicePhases[i] = this.hypersawWrap01(dispersion);
      voice.phase = this.hypersawWrap01(voice.phase + phaseIncrement);

      const isCenter = i === 0 || (i === 1 && numVoices % 2 === 0);
      voicePans[i] = isCenter ? 0 : (i % 2 === 0 ? -1 : 1);
    }

    state.lastVoicePhases = voicePhases;
    state.lastVoiceAmplitudes = sawSamples;
    state.lastVoicePans = voicePans;
    return { sawSamples, numVoices, voicePans };
  };

// Native-only Hypersaw (no silent zero / JS sample fallback).
NodeLiveAudioProcessor.prototype.hypersawSample = function hypersawSample(state, options = {}) {
    if (
      !this.nativeHypersawReady
      || !this.nativeHypersaw?.soemdsp_hypersaw_create
      || !this.nativeHypersaw?.soemdsp_hypersaw_sample
    ) {
      throw new Error("native Hypersaw not ready");
    }
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeHypersaw.soemdsp_hypersaw_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Hypersaw failed to create instance");
    }
    const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
    const frequencyHz = Number(options.frequencyHz) || 0;
    const phaseOffset = Number(options.phaseOffset) || 0;
    const numVoices = Math.round(Number(options.numVoices) || 1);
    const spread = Number(options.spread) || 0;
    const randomAmount = Number(options.randomAmount) || 0;
    const driftAmount = Number(options.driftAmount) || 0;
    const level = Number(options.level) || 0;
    this.nativeHypersaw.soemdsp_hypersaw_sample(
      state.nativeHandle,
      frequencyHz,
      sampleRate,
      phaseOffset,
      numVoices,
      spread,
      randomAmount,
      driftAmount,
      level,
    );
    // Shadow bank for phosphor display only (not an audio fallback).
    this.hypersawAdvanceVoices(state, options);
    return {
      Left: Number(this.nativeHypersaw.soemdsp_hypersaw_left(state.nativeHandle)) || 0,
      Right: Number(this.nativeHypersaw.soemdsp_hypersaw_right(state.nativeHandle)) || 0,
      Phases: state.lastVoicePhases,
      Amplitudes: state.lastVoiceAmplitudes,
      Pans: state.lastVoicePans,
    };
  };

