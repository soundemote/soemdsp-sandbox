// Pi Spigot Noise — revolving BBP (matches native_modules/pi_spigot_noise).

const NODE_GRAPH_PI_SPIGOT_MAX_N = 2048;
const NODE_GRAPH_PI_SPIGOT_TAIL = 16;
const NODE_GRAPH_PI_SPIGOT_SERIES_M = [1, 4, 5, 6];
const NODE_GRAPH_PI_SPIGOT_SERIES_C = [4, -2, -1, -1];

NodeLiveAudioProcessor.prototype.createPiSpigotNoiseChannelState = function createPiSpigotNoiseChannelState() {
  return {
    pink: [0, 0, 0, 0, 0, 0, 0],
    brown: 0,
    prevWhite1: 0,
    prevWhite2: 0,
    smoothLp: [0, 0, 0, 0],
  };
};

NodeLiveAudioProcessor.prototype.createPiSpigotNoiseState = function createPiSpigotNoiseState() {
  return {
    startN: 0,
    stride: 1,
    n: 0,
    k: 0,
    phase: 0,
    S: 0,
    lastTerm: 0,
    hex: 0,
    pulse: 0,
    sumCh: this.createPiSpigotNoiseChannelState(),
    termCh: this.createPiSpigotNoiseChannelState(),
    nativeHandle: 0,
    nativeStart: null,
    nativeStride: null,
  };
};

NodeLiveAudioProcessor.prototype.applyPiSpigotSmoothing = function applyPiSpigotSmoothing(channel, x, smoothing) {
  const safeSmoothing = this.clampValue(Number(smoothing) || 0, 0, 1);
  if (safeSmoothing <= 0) return x;
  const g = Math.exp(safeSmoothing * -3.912023005428146);
  let y = x;
  for (let i = 0; i < 4; i += 1) {
    channel.smoothLp[i] += g * (y - channel.smoothLp[i]);
    y = channel.smoothLp[i];
  }
  return y;
};

NodeLiveAudioProcessor.prototype.applyPiSpigotColor = function applyPiSpigotColor(state, white, color) {
  if (color === 1) {
    state.pink[0] = 0.99886 * state.pink[0] + white * 0.0555179;
    state.pink[1] = 0.99332 * state.pink[1] + white * 0.0750759;
    state.pink[2] = 0.969 * state.pink[2] + white * 0.153852;
    state.pink[3] = 0.8665 * state.pink[3] + white * 0.3104856;
    state.pink[4] = 0.55 * state.pink[4] + white * 0.5329522;
    state.pink[5] = -0.7616 * state.pink[5] - white * 0.016898;
    const out = (state.pink[0] + state.pink[1] + state.pink[2]
      + state.pink[3] + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
    state.pink[6] = white * 0.115926;
    return out;
  }
  if (color === 2) {
    state.brown = this.clampValue(state.brown + white * 0.05, -1, 1);
    return state.brown;
  }
  if (color === 3) {
    const out = (white - state.prevWhite1) * 0.5;
    state.prevWhite1 = white;
    return out;
  }
  if (color === 4) {
    const out = (white - 2 * state.prevWhite1 + state.prevWhite2) * 0.25;
    state.prevWhite2 = state.prevWhite1;
    state.prevWhite1 = white;
    return out;
  }
  return white;
};

NodeLiveAudioProcessor.prototype.resetPiSpigotColorFilters = function resetPiSpigotColorFilters(state) {
  state.pink[0] = 0; state.pink[1] = 0; state.pink[2] = 0; state.pink[3] = 0;
  state.pink[4] = 0; state.pink[5] = 0; state.pink[6] = 0;
  state.brown = 0;
  state.prevWhite1 = 0;
  state.prevWhite2 = 0;
  state.smoothLp[0] = 0; state.smoothLp[1] = 0; state.smoothLp[2] = 0; state.smoothLp[3] = 0;
};

NodeLiveAudioProcessor.prototype.piSpigotPowMod = function piSpigotPowMod(a, b, m) {
  if (!(m > 0)) return 0;
  let result = 1;
  let base = a % m;
  if (base < 0) base += m;
  let expn = b < 0 ? 0 : b;
  while (expn > 0.5) {
    if (expn % 2 >= 1) result = (result * base) % m;
    expn = Math.floor(expn / 2);
    base = (base * base) % m;
  }
  return result;
};

NodeLiveAudioProcessor.prototype.piSpigotSeriesTerm = function piSpigotSeriesTerm(m, k, n) {
  const ak = 8 * k + m;
  if (ak <= 0) return 0;
  if (k <= n) return this.piSpigotPowMod(16, n - k, ak) / ak;
  let t = 1;
  for (let i = 0; i < k - n; i += 1) t *= 0.0625;
  return t / ak;
};

NodeLiveAudioProcessor.prototype.piSpigotRestartDigit = function piSpigotRestartDigit(state) {
  state.k = 0;
  state.phase = 0;
  state.S = 0;
  state.lastTerm = 0;
};

NodeLiveAudioProcessor.prototype.piSpigotApplyStartStride = function piSpigotApplyStartStride(state, start, stride) {
  const startN = this.clampValue(Math.round((Number(start) || 0) * NODE_GRAPH_PI_SPIGOT_MAX_N), 0, NODE_GRAPH_PI_SPIGOT_MAX_N);
  const st = this.clampValue(Math.round(Number(stride) || 1), 1, 16);
  if (startN === state.startN && st === state.stride) return;
  state.startN = startN;
  state.stride = st;
  state.n = startN;
  state.hex = 0;
  state.pulse = 0;
  this.piSpigotRestartDigit(state);
  this.resetPiSpigotColorFilters(state.sumCh);
  this.resetPiSpigotColorFilters(state.termCh);
};

NodeLiveAudioProcessor.prototype.piSpigotStepEquation = function piSpigotStepEquation(state) {
  const m = NODE_GRAPH_PI_SPIGOT_SERIES_M[state.phase];
  const c = NODE_GRAPH_PI_SPIGOT_SERIES_C[state.phase];
  const term = c * this.piSpigotSeriesTerm(m, state.k, state.n);
  state.lastTerm = term;
  state.S += term;
  state.S -= Math.floor(state.S);
  if (state.S < 0) state.S += 1;
  state.pulse = 0;
  state.phase += 1;
  if (state.phase < 4) return;
  state.phase = 0;
  state.k += 1;
  if (state.k <= state.n + NODE_GRAPH_PI_SPIGOT_TAIL) return;
  let hex = Math.floor(state.S * 16);
  if (hex > 15) hex = 15;
  if (hex < 0) hex = 0;
  state.hex = hex;
  state.pulse = 1;
  state.n += state.stride;
  if (state.n > NODE_GRAPH_PI_SPIGOT_MAX_N) state.n = state.startN;
  this.piSpigotRestartDigit(state);
};

NodeLiveAudioProcessor.prototype.piSpigotPortsFromState = function piSpigotPortsFromState(state, color, smoothing, level) {
  this.piSpigotStepEquation(state);
  const sum = state.S * 2 - 1;
  const term = this.clampValue(state.lastTerm * 0.25, -1, 1);
  return {
    "Left Out": this.applyPiSpigotSmoothing(state.sumCh, this.applyPiSpigotColor(state.sumCh, sum, color), smoothing) * level,
    "Right Out": this.applyPiSpigotSmoothing(state.termCh, this.applyPiSpigotColor(state.termCh, term, color), smoothing) * level,
    Hex: state.hex / 15,
    N: state.n / NODE_GRAPH_PI_SPIGOT_MAX_N,
    T: state.pulse ? 1 : 0,
    B3: (state.hex & 8) ? 1 : 0,
    B2: (state.hex & 4) ? 1 : 0,
    B1: (state.hex & 2) ? 1 : 0,
    B0: (state.hex & 1) ? 1 : 0,
  };
};

NodeLiveAudioProcessor.prototype.piSpigotNoiseSample = function piSpigotNoiseSample(state, params) {
  const start = this.clampValue(this.safeFilterNumber(params.start ?? params.seedLeft, null), 0, 1);
  const stride = this.clampValue(this.safeFilterNumber(params.stride, null) || 1, 1, 16);
  const color = this.clampValue(Math.round(this.safeFilterNumber(params.color, null)), 0, 4);
  const smoothing = this.clampValue(this.safeFilterNumber(params.smoothing, null), 0, 1);
  const level = this.safeFilterNumber(params.amplitude ?? params.level, null);
  if (
    this.nativePiSpigotNoiseReady &&
    this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_create &&
    this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_create();
      }
      if (state.nativeHandle) {
        if (state.nativeStart !== start || state.nativeStride !== stride) {
          state.nativeStart = start;
          state.nativeStride = stride;
          this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_reset_seed(state.nativeHandle, start, stride);
        }
        this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_sample(state.nativeHandle, color, smoothing, level);
        const api = this.nativePiSpigotNoise;
        const h = state.nativeHandle;
        return {
          "Left Out": this.safeFilterNumber(api.soemdsp_pi_spigot_noise_left(h), null),
          "Right Out": this.safeFilterNumber(api.soemdsp_pi_spigot_noise_right(h), null),
          Hex: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_hex?.(h), null) ?? 0,
          N: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_n?.(h), null) ?? 0,
          T: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_t?.(h), null) ?? 0,
          B3: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_b3?.(h), null) ?? 0,
          B2: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_b2?.(h), null) ?? 0,
          B1: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_b1?.(h), null) ?? 0,
          B0: this.safeFilterNumber(api.soemdsp_pi_spigot_noise_b0?.(h), null) ?? 0,
        };
      }
    } catch (error) {
      this.nativePiSpigotNoiseReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "pi_spigot_noise",
        status: "disabled",
        message: String(error?.message || error || "native Pi Spigot Noise failed"),
      });
    }
  }
  this.piSpigotApplyStartStride(state, start, stride);
  return this.piSpigotPortsFromState(state, color, smoothing, level);
};
