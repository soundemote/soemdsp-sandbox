NodeLiveAudioProcessor.prototype.createDelayEffectLfoState = function createDelayEffectLfoState(seed = 0xA11CE) {
  return {
    phase: 0,
    fbmTime: 0,
    walkOut: 0,
    walkLpf: 0,
    walkTick: 0,
    seed: seed >>> 0,
    seedKey: "",
  };
};

NodeLiveAudioProcessor.prototype.createDelayEffectState = function createDelayEffectState() {
  return {
    buffer: new Float32Array(1),
    bufferSize: 1,
    lfo: this.createDelayEffectLfoState(),
    lfoVariationState: 0,
    position: 0,
    wet: 0,
    nativeHandle: 0,
    nativeSeed: 0,
    nativeSeedKey: "",
  };
};

NodeLiveAudioProcessor.prototype.createStereoDelayEffectState = function createStereoDelayEffectState() {
  return {
    left: this.createDelayEffectState(),
    mono: this.createDelayEffectState(),
    right: this.createDelayEffectState(),
  };
};

NodeLiveAudioProcessor.prototype.delayHashBipolar = function delayHashBipolar(index, seed) {
  let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
};

NodeLiveAudioProcessor.prototype.delaySmoothNoise1d = function delaySmoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = this.delayHashBipolar(left, seed);
  const b = this.delayHashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
};

NodeLiveAudioProcessor.prototype.delayFbmUnipolar = function delayFbmUnipolar(time, seed, octaves = 4, persistence = 0.5) {
  let total = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;
  const n = Math.max(1, Math.min(8, octaves | 0));
  const pers = Math.max(0, Math.min(0.999, persistence));
  for (let i = 0; i < n; i += 1) {
    total += this.delaySmoothNoise1d(time * freq, (seed + i * 1013) >>> 0) * amplitude;
    maxValue += amplitude;
    amplitude *= pers;
    freq *= 2;
  }
  if (!(maxValue > 0)) return 0.5;
  return (total / maxValue) * 0.5 + 0.5;
};

NodeLiveAudioProcessor.prototype.delayParabolBipolar = function delayParabolBipolar(phase01) {
  let fit = (phase01 * 2) % 2;
  if (fit < 0) fit += 2;
  fit -= 1;
  return 4 * fit * (1 - Math.abs(fit));
};

NodeLiveAudioProcessor.prototype.delayRationalCurve01 = function delayRationalCurve01(x, k) {
  const v = Math.max(0, Math.min(1, Number(x) || 0));
  const kk = Math.max(-0.999, Math.min(0.999, Number(k) || 0));
  const denom = 2 * kk * v - kk - 1;
  if (Math.abs(denom) < 1e-12) return v;
  return (kk * v - v) / denom;
};

/** Mod LFO (Parabol / Random Walk / FBM) → bipolar −1…+1. */
NodeLiveAudioProcessor.prototype.delayRunModLfo = function delayRunModLfo(ch, style, rateHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const hz = Math.max(0, Number(rateHz) || 0);
  const st = Math.round(Number(style) || 0);

  if (st === 1) {
    const noise = this.delayHashBipolar((ch.walkTick = (ch.walkTick + 1) | 0), ch.seed);
    const increment = Math.max(0, Math.min(1, hz / rate));
    const jitterInc = Math.max(0, Math.min(1, (hz * 0.37) / rate));
    const stepSize = Math.max(0, Math.min(1, increment + this.delayRationalCurve01(jitterInc, 0.99)));
    const averageIncrement = (jitterInc + increment) * 0.5;
    const whiteNoiseMix = averageIncrement >= 0.9
      ? this.delayRationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
      : 0;
    const randomMix = 1 - whiteNoiseMix;
    const step = noise > 0 ? stepSize : -stepSize;
    ch.walkOut = Math.max(-1, Math.min(1, (ch.walkOut || 0) + step));
    const mixed = ch.walkOut * randomMix + noise * whiteNoiseMix;
    const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * Math.max(0, hz);
    const a1 = Math.exp(-w);
    ch.walkLpf = (1 - a1) * mixed + a1 * (ch.walkLpf || 0);
    return Math.max(-1, Math.min(1, ch.walkLpf));
  }

  if (st === 2) {
    ch.fbmTime = (ch.fbmTime || 0) + hz / rate;
    const uni = this.delayFbmUnipolar(ch.fbmTime, ch.seed);
    return Math.max(-1, Math.min(1, uni * 2 - 1));
  }

  ch.phase = ((ch.phase || 0) + hz / rate) % 1;
  if (ch.phase < 0) ch.phase += 1;
  return this.delayParabolBipolar(ch.phase);
};

// Legacy name kept for any external callers.
NodeLiveAudioProcessor.prototype.delayParabolSample = function delayParabolSample(phase) {
  return this.delayParabolBipolar(phase);
};

NodeLiveAudioProcessor.prototype.delayEffectInterp = function delayEffectInterp(buffer, where, interpolation = 1) {
  if (typeof nodeGraphDelayInterpolate === "function") {
    return nodeGraphDelayInterpolate(buffer, where, interpolation);
  }
  const length = buffer?.length || 0;
  if (!length) return 0;
  const mode = Math.round(Number(interpolation) || 0);
  let w = Number(where) || 0;
  while (w < 0) w += length;
  if (mode < 1) {
    const before = Math.floor(w) % length;
    const after = (before + 1) % length;
    const mix = w - Math.floor(w);
    return buffer[before] * (1 - mix) + buffer[after] * mix;
  }
  const whole = Math.floor(w);
  const t = w - whole;
  let i0 = whole % length;
  if (i0 < 0) i0 += length;
  const im1 = i0 === 0 ? length - 1 : i0 - 1;
  const i1 = i0 + 1 >= length ? i0 + 1 - length : i0 + 1;
  const i2 = i1 + 1 >= length ? i1 + 1 - length : i1 + 1;
  const ym1 = buffer[im1] || 0;
  const y0 = buffer[i0] || 0;
  const y1 = buffer[i1] || 0;
  const y2 = buffer[i2] || 0;
  const c0 = y0;
  const c1 = 0.5 * (y1 - ym1);
  const c2 = ym1 - 2.5 * y0 + 2.0 * y1 - 0.5 * y2;
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
  return ((c3 * t + c2) * t + c1) * t + c0;
};

NodeLiveAudioProcessor.prototype.delayEffectEnsureLfo = function delayEffectEnsureLfo(state, nodeId) {
  if (!state.lfo || typeof state.lfo !== "object") {
    state.lfo = this.createDelayEffectLfoState();
  }
  const seedKey = `${nodeId}:delayMod`;
  if (state.lfo.seedKey !== seedKey) {
    state.lfo.seedKey = seedKey;
    state.lfo.seed = this.stableSeed ? (this.stableSeed(seedKey) >>> 0) : 0xA11CE;
  }
};

NodeLiveAudioProcessor.prototype.delayEffectSampleJs = function delayEffectSampleJs(state, input, params, rateHz = sampleRate, nodeId = "") {
  const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
  const maxDelaySeconds = 4.25;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.buffer || state.bufferSize !== requiredSize) {
    state.buffer = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.lfo = this.createDelayEffectLfoState(state.lfo?.seed);
    state.lfoVariationState = 0;
    state.wet = 0;
  }
  this.delayEffectEnsureLfo(state, nodeId);

  const inLevel = Number(params.inLevel);
  const dry = (Number(input) || 0) * (Number.isFinite(inLevel) ? inLevel : 1);
  const time = this.clampValue(Number(params.time) || 0, 0.001, maxDelaySeconds);
  // Rare hard clamp: feedback 0–1 only.
  const feedback = this.clampValue(Number(params.feedback) || 0, 0, 1);
  const mix = this.clampValue(Number(params.mix) || 0, 0, 1);
  const outLevelRaw = params.outLevel != null ? params.outLevel : params.level;
  const outLevel = Number(outLevelRaw);
  const level = Number.isFinite(outLevel) ? outLevel : 1;
  const modAmount = this.clampValue(Number(params.modAmount) || 0, 0, 0.5);
  const modRate = this.clampValue(Number(params.modRate) || 0, 0, 90);
  const modVariation = this.clampValue(Number(params.modVariation) || 0, 0, 1);
  const modStyle = Math.round(Number(params.modStyle) || 0);
  const interpMode = Math.round(Number(params.interpolation) || 0) >= 1 ? 1 : 0;

  const ch = state.lfo;
  const phaseProxy = Number(ch.phase) || Number(ch.fbmTime) || 0;
  const variationTarget = this.delayHashBipolar(
    Math.floor(phaseProxy * 997) + state.position,
    ch.seed,
  );
  state.lfoVariationState += (variationTarget - state.lfoVariationState) * Math.min(1, modRate / safeRate);
  const variedRate = Math.max(0, modRate * (1 + state.lfoVariationState * modVariation));
  const lfo = (this.delayRunModLfo(ch, modStyle, variedRate, safeRate) + 1) * 0.5;

  const delaySamples = Math.max(1, Math.min(state.bufferSize - 2, time * safeRate));
  const bufferOffset = delaySamples - delaySamples * lfo * modAmount + 1;
  state.position = (state.position + 1) % state.bufferSize;
  const readPosition = (state.position + state.bufferSize - bufferOffset) % state.bufferSize;
  const wet = this.delayEffectInterp(state.buffer, readPosition, interpMode);
  const write = dry + wet * feedback;
  state.buffer[state.position] = Math.max(-8, Math.min(8, write));
  state.wet = wet;
  const mixOut = (dry * (1 - mix) + state.wet * mix) * level;
  return { Mix: mixOut, Out: mixOut };
};

NodeLiveAudioProcessor.prototype.delayEffectSample = function delayEffectSample(state, input, params, rateHz = sampleRate, nodeId = "") {
  // Prefer JS: Hermite interp, mod styles (Parabol/RW/FBM), InLevel, and
  // feedback 0–1. Native delay_effect is linear-only and still mode-era.
  const wantHermite = false;
  const modStyle = Math.round(Number(params.modStyle) || 0);
  const useNative = !wantHermite
    && modStyle === 0
    && this.nativeDelayEffectReady
    && this.nativeDelayEffect?.soemdsp_delay_effect_create
    && this.nativeDelayEffect?.soemdsp_delay_effect_sample;

  if (useNative) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativeDelayEffect.soemdsp_delay_effect_create();
      }
      if (state.nativeHandle) {
        const seedKey = `${nodeId}:delayVariation`;
        if (state.nativeSeedKey !== seedKey) {
          state.nativeSeedKey = seedKey;
          state.nativeSeed = this.stableSeed(seedKey);
        }
        const safeRateValue = Math.max(1, nodeGraphFiniteNumber(rateHz, 44100));
        const inLevel = Number(params.inLevel);
        const scaledIn = (Number(input) || 0) * (Number.isFinite(inLevel) ? inLevel : 1);
        const outLevelRaw = params.outLevel != null ? params.outLevel : params.level;
        const outLevel = Number(outLevelRaw);
        const level = Number.isFinite(outLevel) ? outLevel : 1;
        this.nativeDelayEffect.soemdsp_delay_effect_sample(
          state.nativeHandle,
          scaledIn,
          this.clampValue(Number(params.time) || 0, 0.001, 4.25),
          this.clampValue(Number(params.feedback) || 0, 0, 1),
          this.clampValue(Number(params.mix) || 0, 0, 1),
          level,
          this.clampValue(Number(params.modAmount) || 0, 0, 0.5),
          this.clampValue(Number(params.modRate) || 0, 0, 90),
          this.clampValue(Number(params.modVariation) || 0, 0, 1),
          0, // mode removed — always classic delay
          state.nativeSeed >>> 0,
          safeRateValue,
        );
        const mixOut = this.nativeDelayEffect.soemdsp_delay_effect_out(state.nativeHandle);
        return {
          Mix: mixOut,
          Out: mixOut,
        };
      }
    } catch (error) {
      this.nativeDelayEffectReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "delay_effect",
        status: "disabled",
        message: String(error?.message || error || "native Delay Effect failed"),
      });
    }
  }
  return this.delayEffectSampleJs(state, input, params, rateHz, nodeId);
};
