// Worklet Ping Pong Delay — pure JS tape path (L/R LFO, passive HP/LP, soft clip).
// Native is used only when exports support the tape-style arity (version >= 2).

NodeLiveAudioProcessor.prototype.createPingPongDelayState = function createPingPongDelayState() {
  return {
    bufferL: new Float32Array(1),
    bufferR: new Float32Array(1),
    bufferSize: 1,
    position: 0,
    wetL: 0,
    wetR: 0,
    nativeHandle: 0,
    lfoL: { phase: 0, fbmTime: 0, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xA11CE },
    lfoR: { phase: 0.37, fbmTime: 0.17, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xB0B5 },
    lpL: { z: 0 },
    lpR: { z: 0 },
    hpL: { x0: 0, y0: 0 },
    hpR: { x0: 0, y0: 0 },
  };
};

NodeLiveAudioProcessor.prototype.pingPongTimingModeMultiplier = function pingPongTimingModeMultiplier(mode) {
  const rounded = Math.round(Number(mode) || 0);
  if (rounded === 1) return 1.5;
  if (rounded === 2) return 2 / 3;
  return 1;
};

NodeLiveAudioProcessor.prototype.pingPongDelayFraction = function pingPongDelayFraction(numerator, denominator) {
  const effectiveNumerator = Math.max(0, Number(numerator) || 0);
  if (effectiveNumerator === 0) return 0;
  const effectiveDenominator = Math.max(1, Math.round(Number(denominator) || 0) || 1);
  return effectiveNumerator / effectiveDenominator;
};

NodeLiveAudioProcessor.prototype.pingPongDelayBaseSeconds = function pingPongDelayBaseSeconds(params) {
  const secondsPerWholeNote = 240 / Math.max(1, Number(this.timing?.tempoBpm) || 120);
  const fraction = this.pingPongDelayFraction(params.timeNumerator, params.timeDenominator);
  return secondsPerWholeNote * fraction * this.pingPongTimingModeMultiplier(params.timingMode);
};

NodeLiveAudioProcessor.prototype.pingPongHashBipolar = function pingPongHashBipolar(index, seed) {
  let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return (value / 0xffffffff) * 2 - 1;
};

NodeLiveAudioProcessor.prototype.pingPongSmoothNoise1d = function pingPongSmoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = this.pingPongHashBipolar(left, seed);
  const b = this.pingPongHashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
};

NodeLiveAudioProcessor.prototype.pingPongFbmUnipolar = function pingPongFbmUnipolar(time, seed) {
  let total = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;
  for (let i = 0; i < 4; i += 1) {
    total += this.pingPongSmoothNoise1d(time * freq, (seed + i * 1013) >>> 0) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    freq *= 2;
  }
  if (!(maxValue > 0)) return 0.5;
  return (total / maxValue) * 0.5 + 0.5;
};

NodeLiveAudioProcessor.prototype.pingPongParabolBipolar = function pingPongParabolBipolar(phase01) {
  let fit = (phase01 * 2) % 2;
  if (fit < 0) fit += 2;
  fit -= 1;
  return 4 * fit * (1 - Math.abs(fit));
};

NodeLiveAudioProcessor.prototype.pingPongRationalCurve01 = function pingPongRationalCurve01(x, k) {
  const v = Math.max(0, Math.min(1, Number(x) || 0));
  const kk = Math.max(-0.999, Math.min(0.999, Number(k) || 0));
  const denom = 2 * kk * v - kk - 1;
  if (Math.abs(denom) < 1e-12) return v;
  return (kk * v - v) / denom;
};

NodeLiveAudioProcessor.prototype.pingPongRunLfoChannel = function pingPongRunLfoChannel(ch, style, rateHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const hz = Math.max(0, Number(rateHz) || 0);
  const st = Math.round(Number(style) || 0);

  if (st === 1) {
    const noise = this.pingPongHashBipolar((ch.walkTick = (ch.walkTick + 1) | 0), ch.seed);
    const increment = Math.max(0, Math.min(1, hz / rate));
    const jitterInc = Math.max(0, Math.min(1, (hz * 0.37) / rate));
    const stepSize = Math.max(0, Math.min(1, increment + this.pingPongRationalCurve01(jitterInc, 0.99)));
    const averageIncrement = (jitterInc + increment) * 0.5;
    const whiteNoiseMix = averageIncrement >= 0.9
      ? this.pingPongRationalCurve01((averageIncrement - 0.9) / 0.1, -0.7)
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
    const uni = this.pingPongFbmUnipolar(ch.fbmTime, ch.seed);
    return Math.max(-1, Math.min(1, uni * 2 - 1));
  }

  ch.phase = ((ch.phase || 0) + hz / rate) % 1;
  if (ch.phase < 0) ch.phase += 1;
  return this.pingPongParabolBipolar(ch.phase);
};

NodeLiveAudioProcessor.prototype.pingPongSoftClip = function pingPongSoftClip(v, saturate) {
  const thr = Math.max(0.01, Number(saturate) || 1);
  const width = Math.max(1e-6, thr * 2);
  const scaleX = 2 / width;
  const shiftX = -1 - scaleX * (0 - 0.5 * width);
  const scaleY = 1 / scaleX;
  const shiftY = -shiftX * scaleY;
  const x = scaleX * (Number(v) || 0) + shiftX;
  // freestanding-friendly tanh via exp
  const e2 = Math.exp(2 * Math.max(-20, Math.min(20, x)));
  const th = (e2 - 1) / (e2 + 1);
  return shiftY + scaleY * th;
};

NodeLiveAudioProcessor.prototype.pingPongOnePoleLp = function pingPongOnePoleLp(state, input, freqHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const f = Math.max(0, Number(freqHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * f;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  state.z = b0 * input + a1 * (state.z || 0);
  return state.z;
};

NodeLiveAudioProcessor.prototype.pingPongOnePoleHp = function pingPongOnePoleHp(state, input, freqHz, sampleRate) {
  const rate = Math.max(1, sampleRate);
  const f = Math.max(0, Number(freqHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * f;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  const b1 = -b0;
  const y = b0 * input + b1 * (state.x0 || 0) + a1 * (state.y0 || 0);
  state.x0 = input;
  state.y0 = y;
  return y;
};

NodeLiveAudioProcessor.prototype.pingPongInterpLinear = function pingPongInterpLinear(buffer, where) {
  const length = buffer.length;
  if (!length) return 0;
  let w = where;
  while (w < 0) w += length;
  const before = Math.floor(w) % length;
  const after = (before + 1) % length;
  const mix = w - Math.floor(w);
  return buffer[before] * (1 - mix) + buffer[after] * mix;
};

/** Pure JS tape ping-pong (always available). */
NodeLiveAudioProcessor.prototype.pingPongDelaySampleJs = function pingPongDelaySampleJs(state, input, params, rateHz) {
  const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
  const maxDelaySeconds = 8;
  const requiredSize = Math.max(2, Math.ceil(safeRate * maxDelaySeconds) + 2);
  if (!state.bufferL || state.bufferSize !== requiredSize) {
    state.bufferL = new Float32Array(requiredSize);
    state.bufferR = new Float32Array(requiredSize);
    state.bufferSize = requiredSize;
    state.position = 0;
    state.wetL = 0;
    state.wetR = 0;
  }
  if (!state.lfoL) {
    state.lfoL = { phase: 0, fbmTime: 0, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xA11CE };
    state.lfoR = { phase: 0.37, fbmTime: 0.17, walkOut: 0, walkLpf: 0, walkTick: 0, seed: 0xB0B5 };
    state.lpL = { z: 0 };
    state.lpR = { z: 0 };
    state.hpL = { x0: 0, y0: 0 };
    state.hpR = { x0: 0, y0: 0 };
  }

  const dry = this.safeFilterNumber(input, null);
  const feedback = this.clampValue(Number(params.feedback) || 0, 0, 0.95);
  const mix = this.clampValue(Number(params.mix) || 0, 0, 1);
  const level = this.clampValue(Number(params.level) || 0, 0, 2);
  const offsetMs = Math.max(0, Number(params.offsetMs) || 0);
  const lfoStyle = Math.round(Number(params.lfoStyle) || 0);
  const lfoRate = this.clampValue(Number(params.lfoRate) || 0, 0, 40);
  const lfoVariation = this.clampValue(Number(params.lfoVariation) || 0, 0, 1);
  const saturate = this.clampValue(Number(params.saturate) || 1, 0.01, 4);
  const lpfHz = this.clampValue(Number(params.lpfFrequency) || 8000, 20, 20000);
  const hpfHz = this.clampValue(Number(params.hpfFrequency) || 20, 1, 2000);

  const baseSeconds = Math.max(0, this.pingPongDelayBaseSeconds(params));
  const driftSec = offsetMs / 1000;
  const rateL = lfoRate * (1 + lfoVariation * 0.31);
  const rateR = lfoRate * (1 - lfoVariation * 0.27);
  const modL = driftSec > 1e-9 ? this.pingPongRunLfoChannel(state.lfoL, lfoStyle, rateL, safeRate) : 0;
  const modR = driftSec > 1e-9 ? this.pingPongRunLfoChannel(state.lfoR, lfoStyle, rateR, safeRate) : 0;

  const delaySamplesL = Math.min(state.bufferSize - 2, Math.max(1, (baseSeconds + driftSec * modL) * safeRate));
  const delaySamplesR = Math.min(state.bufferSize - 2, Math.max(1, (baseSeconds + driftSec * modR) * safeRate));

  state.position = (state.position + 1) % state.bufferSize;
  const readPosL = (state.position + state.bufferSize - delaySamplesL) % state.bufferSize;
  const readPosR = (state.position + state.bufferSize - delaySamplesR) % state.bufferSize;
  const readL = this.pingPongInterpLinear(state.bufferL, readPosL);
  const readR = this.pingPongInterpLinear(state.bufferR, readPosR);

  const clippedL = this.pingPongSoftClip(dry + readR * feedback, saturate);
  const clippedR = this.pingPongSoftClip(readL * feedback, saturate);
  const writeL = this.pingPongOnePoleLp(state.lpL, this.pingPongOnePoleHp(state.hpL, clippedL, hpfHz, safeRate), lpfHz, safeRate);
  const writeR = this.pingPongOnePoleLp(state.lpR, this.pingPongOnePoleHp(state.hpR, clippedR, hpfHz, safeRate), lpfHz, safeRate);

  state.bufferL[state.position] = Math.max(-8, Math.min(8, writeL));
  state.bufferR[state.position] = Math.max(-8, Math.min(8, writeR));
  state.wetL = readL;
  state.wetR = readR;

  return {
    Left: (dry * (1 - mix) + state.wetL * mix) * level,
    Right: (dry * (1 - mix) + state.wetR * mix) * level,
  };
};

NodeLiveAudioProcessor.prototype.pingPongDelaySample = function pingPongDelaySample(state, input, params, rateHz = sampleRate) {
  // Prefer pure JS so tape features work without a native rebuild.
  // Native path only if version >= 2 and new sample arity is present.
  const native = this.nativePingPongDelay;
  const nativeVer = Number(native?.soemdsp_ping_pong_delay_version?.() || 0);
  if (
    this.nativePingPongDelayReady
    && nativeVer >= 2
    && native?.soemdsp_ping_pong_delay_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = native.soemdsp_ping_pong_delay_create();
      }
      if (state.nativeHandle) {
        const safeRate = Math.max(1, Number(rateHz) || sampleRate || 44100);
        const left = native.soemdsp_ping_pong_delay_sample(
          state.nativeHandle,
          this.safeFilterNumber(input, null),
          this.clampValue(Number(params.feedback) || 0, 0, 0.95),
          this.clampValue(Number(params.mix) || 0, 0, 1),
          this.clampValue(Number(params.level) || 0, 0, 2),
          this.safeFilterNumber(params.timeNumerator, null),
          this.safeFilterNumber(params.timeDenominator, null),
          this.safeFilterNumber(params.timingMode, null),
          Math.max(0, Number(params.offsetMs) || 0),
          Math.round(Number(params.lfoStyle) || 0),
          this.clampValue(Number(params.lfoRate) || 0, 0, 40),
          this.clampValue(Number(params.lfoVariation) || 0, 0, 1),
          this.clampValue(Number(params.saturate) || 1, 0.01, 4),
          this.clampValue(Number(params.lpfFrequency) || 8000, 20, 20000),
          this.clampValue(Number(params.hpfFrequency) || 20, 1, 2000),
          Math.max(1, Number(this.timing?.tempoBpm) || 120),
          safeRate,
        );
        return {
          Left: this.safeFilterNumber(left, null),
          Right: this.safeFilterNumber(native.soemdsp_ping_pong_delay_right(state.nativeHandle), null),
        };
      }
    } catch (error) {
      this.nativePingPongDelayReady = false;
      state.nativeHandle = 0;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "ping_pong_delay",
        status: "disabled",
        message: String(error?.message || error || "native Ping Pong Delay failed"),
      });
    }
  }
  return this.pingPongDelaySampleJs(state, input, params, rateHz);
};
