// Native-only Hypersaw. Voice phase/amp/pan arrays feed the face burn only
// (no Phases/Amplitudes/Pans output jacks).
// SoEmHypersaw Phase Modulation set (additive PM; saws not FM'd).

NodeLiveAudioProcessor.prototype.createHypersawState = function createHypersawState() {
  return { nativeHandle: 0, lastReset: 0 };
};

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
  const frequencyHz = nodeGraphFiniteNumber(options.frequencyHz);
  const phaseOffset = nodeGraphFiniteNumber(options.phaseOffset);
  let numVoicesExact = Number(options.numVoices);
  if (!Number.isFinite(numVoicesExact) || numVoicesExact < 1) numVoicesExact = 1;
  if (numVoicesExact > 64) numVoicesExact = 64;
  const distributePhase = Number(options.distributePhase ?? options.spread);
  const randomizePhase = nodeGraphFiniteNumber(options.randomizePhase ?? options.randomAmount);
  const vibratoDistribution = nodeGraphFiniteNumber(
    options.vibratoDistribution ?? options.vibratoOffset,
  );
  const vibratoAmp = nodeGraphFiniteNumber(options.vibratoAmp);
  const vibratoSpeedHz = nodeGraphFiniteNumber(options.vibratoSpeedHz ?? options.vibratoSpeed);
  const driftStyle = Number(options.driftStyle);
  const driftAmp = Number(options.driftAmp ?? options.driftAmount);
  const driftPitch = Number(options.driftPitch);
  const driftJitterHz = Number(options.driftJitterHz ?? options.driftJitter);
  const driftCompensation = nodeGraphFiniteNumber(options.driftCompensation);
  const centerSide = Number(options.centerSide);
  const waveform = Number(options.waveform);
  const morph = Number(options.morph);
  const level = nodeGraphFiniteNumber(options.level);
  const seed = Number(options.seed);
  this.nativeHypersaw.soemdsp_hypersaw_sample(
    state.nativeHandle,
    frequencyHz,
    sampleRate,
    phaseOffset,
    numVoicesExact,
    Number.isFinite(distributePhase) ? distributePhase : 1,
    randomizePhase,
    vibratoDistribution,
    vibratoAmp,
    vibratoSpeedHz,
    Number.isFinite(driftStyle) ? driftStyle : 0,
    Number.isFinite(driftAmp) ? driftAmp : 22.6,
    Number.isFinite(driftPitch) ? driftPitch : 64.256,
    Number.isFinite(driftJitterHz) ? driftJitterHz : 246,
    driftCompensation,
    Number.isFinite(centerSide) ? centerSide : 0.5,
    Number.isFinite(waveform) ? waveform : 1,
    Number.isFinite(morph) ? morph : 0.5,
    level,
    Number.isFinite(seed) ? seed : 1,
  );
  const n = this.nativeHypersaw.soemdsp_hypersaw_voice_count
    ? Math.max(0, Math.min(64, this.nativeHypersaw.soemdsp_hypersaw_voice_count(state.nativeHandle) | 0))
    : Math.max(0, Math.min(64, Math.ceil(numVoicesExact - 1e-9)));
  const lastFrac = this.nativeHypersaw.soemdsp_hypersaw_voice_last_frac
    ? nodeGraphFiniteNumber(this.nativeHypersaw.soemdsp_hypersaw_voice_last_frac(state.nativeHandle))
    : 0;
  // Same crossfade as native getCenterSideAmplitudeValue (0=center, 1=sides).
  const cs = Math.max(0, Math.min(1, Number.isFinite(centerSide) ? centerSide : 0.5));
  const ampCenter = Math.min(2 - cs * 2, 1);
  const ampSide = Math.min(cs * 2, 1);
  const voicePhases = new Array(n);
  const voiceAmplitudes = new Array(n);
  const voicePans = new Array(n);
  for (let i = 0; i < n; i++) {
    voicePhases[i] = this.nativeHypersaw.soemdsp_hypersaw_voice_phase
      ? nodeGraphFiniteNumber(this.nativeHypersaw.soemdsp_hypersaw_voice_phase(state.nativeHandle, i))
      : 0;
    const isCenter = i === 0;
    const base = (lastFrac > 0 && i === n - 1) ? lastFrac : 1;
    voiceAmplitudes[i] = base * (isCenter ? ampCenter : ampSide);
    voicePans[i] = isCenter ? 0 : (((i - 1) % 2 === 0) ? -1 : 1);
  }
  state.lastVoicePhases = voicePhases;
  state.lastVoiceAmplitudes = voiceAmplitudes;
  state.lastVoicePans = voicePans;
  return {
    Left: nodeGraphFiniteNumber(this.nativeHypersaw.soemdsp_hypersaw_left(state.nativeHandle)),
    Right: nodeGraphFiniteNumber(this.nativeHypersaw.soemdsp_hypersaw_right(state.nativeHandle)),
    Phases: voicePhases,
    Amplitudes: voiceAmplitudes,
    Pans: voicePans,
  };
};
