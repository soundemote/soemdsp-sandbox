// Realtime SoEmReverb — native-only (APP_POLICY §2/§5).
// Outputs: Dry L/R (pure input), Mix L/R (dry/wet blend). No wet-only.
// Echo base: free seconds OR one tempo-synced time for both echo L/R.

NodeLiveAudioProcessor.prototype.createSoemReverbState = function createSoemReverbState() {
  return { nativeHandle: 0, nativeParamKey: "", nativeSampleRate: 0 };
};

NodeLiveAudioProcessor.prototype.soemReverbTimingModeMultiplier = function soemReverbTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
  if (rounded === 1) return 1.5;
  if (rounded === 2) return 2 / 3;
  return 1;
};

NodeLiveAudioProcessor.prototype.soemReverbNoteFraction = function soemReverbNoteFraction(numerator, denominator) {
  const num = Math.max(0, Number(numerator) || 0);
  if (num === 0) return 0;
  const den = Math.max(0, Number(denominator) || 0);
  return num / Math.max(1, den);
};

/** One echo base in seconds for both echo L/R. */
NodeLiveAudioProcessor.prototype.soemReverbEchoSeconds = function soemReverbEchoSeconds(params) {
  const offsetSeconds = (Number(params.offsetMs) || 0) / 1000;
  const freeSeconds = Math.max(0.0001, Number(params.echoTime) || 0.35);
  if (Math.round(Number(params.echoTempoSync) || 0) === 0) {
    return freeSeconds + offsetSeconds;
  }
  const bpm = Math.max(1, Number(this.timing?.tempoBpm) || 120);
  const secondsPerWholeNote = 240 / bpm;
  const fraction = this.soemReverbNoteFraction(params.timeNumerator, params.timeDenominator);
  const synced = secondsPerWholeNote * fraction * this.soemReverbTimingModeMultiplier(params.timingMode);
  const raw = synced + offsetSeconds;
  return Number.isFinite(raw) ? Math.max(0.0001, raw) : freeSeconds;
};

NodeLiveAudioProcessor.prototype.applySoemReverbParams = function applySoemReverbParams(state, p) {
  const native = this.nativeSoemReverb;
  if (!native?.soemdsp_soem_reverb_set_params || !state.nativeHandle) return;
  const key = [
    p.mix, p.volume, p.echoTime, p.recycle, p.numDelays, p.diffusionSize,
    p.diffusionAmount, p.seed, p.lfoAmp, p.lfoFrequency, p.lfoVariation, p.lfoStyle,
    p.echoMode, p.pingPong, p.doModulateEcho, p.saturate, p.lpfFrequency, p.hpfFrequency,
    p.bandFrequency, p.bandDecibels, p.bandQ, p.lpfStages, p.bandStages,
    p.duckLimit, p.duckRelease,
  ].map((v) => Math.round(Number(v) * 1e6)).join(":");
  if (key === state.nativeParamKey) return;
  state.nativeParamKey = key;
  native.soemdsp_soem_reverb_set_params(
    state.nativeHandle,
    p.mix, p.volume, p.echoTime, p.recycle, p.numDelays, p.diffusionSize,
    p.diffusionAmount, p.seed, p.lfoAmp, p.lfoFrequency, p.lfoVariation, p.lfoStyle,
    p.echoMode, p.pingPong, p.doModulateEcho, p.saturate, p.lpfFrequency, p.hpfFrequency,
    p.bandFrequency, p.bandDecibels, p.bandQ, p.lpfStages, p.bandStages,
    p.duckLimit, p.duckRelease,
  );
};

NodeLiveAudioProcessor.prototype.soemReverbSample = function soemReverbSample(state, left, right, params, rateHz) {
  const inL = Number(left) || 0;
  const inR = Number(right) || 0;
  // Dry = pure input; Mix = full dry/wet blend (native left/right).
  const silent = {
    "Dry L": inL,
    "Dry R": inR,
    "Mix L": inL,
    "Mix R": inR,
  };
  if (
    !this.nativeSoemReverbReady
    || !this.nativeSoemReverb?.soemdsp_soem_reverb_create
    || !this.nativeSoemReverb?.soemdsp_soem_reverb_process
  ) {
    return silent;
  }
  try {
    const rate = Math.max(1, Number(rateHz) || sampleRate || 44100);
    const native = this.nativeSoemReverb;
    if (!state.nativeHandle || state.nativeSampleRate !== rate) {
      if (state.nativeHandle) native.soemdsp_soem_reverb_destroy?.(state.nativeHandle);
      state.nativeHandle = native.soemdsp_soem_reverb_create(rate) || 0;
      state.nativeSampleRate = rate;
      state.nativeParamKey = "";
    }
    if (!state.nativeHandle) {
      return silent;
    }
    const echoSeconds = this.soemReverbEchoSeconds(params);
    this.applySoemReverbParams(state, { ...params, echoTime: echoSeconds });
    native.soemdsp_soem_reverb_process(state.nativeHandle, inL, inR);
    const mixL = Number(native.soemdsp_soem_reverb_left(state.nativeHandle));
    const mixR = Number(native.soemdsp_soem_reverb_right(state.nativeHandle));
    return {
      "Dry L": inL,
      "Dry R": inR,
      "Mix L": Number.isFinite(mixL) ? mixL : inL,
      "Mix R": Number.isFinite(mixR) ? mixR : inR,
    };
  } catch (_e) {
    this.nativeSoemReverbReady = false;
    return silent;
  }
};

NodeLiveAudioProcessor.prototype.soemReverbWorkletEvaluate = function soemReverbWorkletEvaluate(
  node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput,
) {
  const state = this.soemReverbStates.get(nodeId) || this.createSoemReverbState();
  this.soemReverbStates.set(nodeId, state);
  const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
  let left = 0;
  let right = 0;
  if (hasInput(nodeId, "Left") || hasInput(nodeId, "Right")) {
    left = this.safeFilterNumber(mixInput(nodeId, "Left"), 0);
    right = this.safeFilterNumber(mixInput(nodeId, "Right"), 0);
  } else if (hasInput(nodeId, "Mono")) {
    left = right = this.safeFilterNumber(mixInput(nodeId, "Mono"), 0);
  }
  return this.soemReverbSample(state, left, right, {
    mix: read("mix", 0.43),
    volume: read("volume", 1),
    echoTempoSync: read("echoTempoSync", 0),
    echoTime: read("echoTime", 0.35),
    timeNumerator: read("timeNumerator", 1),
    timeDenominator: read("timeDenominator", 4),
    timingMode: read("timingMode", 0),
    offsetMs: read("offsetMs", 0),
    recycle: read("recycle", 0.5),
    numDelays: read("numDelays", 10),
    diffusionSize: read("diffusionSize", 0.35),
    diffusionAmount: read("diffusionAmount", 0.7),
    seed: read("seed", 500),
    lfoAmp: read("lfoAmp", 0.002),
    lfoFrequency: read("lfoFrequency", 0.5),
    lfoVariation: read("lfoVariation", 1),
    lfoStyle: read("lfoStyle", 0),
    echoMode: read("echoMode", 0),
    pingPong: read("pingPong", 0),
    doModulateEcho: read("doModulateEcho", 1),
    saturate: read("saturate", 1),
    lpfFrequency: read("lpfFrequency", 8000),
    hpfFrequency: read("hpfFrequency", 20),
    bandFrequency: read("bandFrequency", 1000),
    bandDecibels: read("bandDecibels", 0),
    bandQ: read("bandQ", 1),
    lpfStages: read("lpfStages", 2),
    bandStages: read("bandStages", 2),
    duckLimit: read("duckLimit", 1),
    duckRelease: read("duckRelease", 0.04),
  }, safeRate);
};
