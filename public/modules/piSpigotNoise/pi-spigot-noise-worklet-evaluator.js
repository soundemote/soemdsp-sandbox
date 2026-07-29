// Realtime worklet evaluator methods for piSpigotNoise, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.piSpigotNoiseSample(...) directly.
NodeLiveAudioProcessor.prototype.createPiSpigotNoiseChannelState = function createPiSpigotNoiseChannelState() {
  return {
    cache: null,
    readIndex: 0,
    cacheStart: null,
    pink: [0, 0, 0, 0, 0, 0, 0],
    brown: 0,
    prevWhite1: 0,
    prevWhite2: 0,
    smoothLp: [0, 0, 0, 0],
  };
};

// JS mirror of pi_spigot_noise.cpp's applySmoothing -- see that file
// for why a 4-stage one-pole cascade with an exponential g curve.
NodeLiveAudioProcessor.prototype.applyPiSpigotSmoothing = function applyPiSpigotSmoothing(channel, x, smoothing) {
  const safeSmoothing = this.clampValue(Number(smoothing) || 0, 0, 1);
  if (safeSmoothing <= 0) return x;
  const lnSmoothMinG = -3.912023005428146; // ln(0.02)
  const g = Math.exp(safeSmoothing * lnSmoothMinG);
  let y = x;
  for (let i = 0; i < 4; i++) {
    channel.smoothLp[i] += g * (y - channel.smoothLp[i]);
    y = channel.smoothLp[i];
  }
  return y;
};

NodeLiveAudioProcessor.prototype.createPiSpigotNoiseState = function createPiSpigotNoiseState() {
  return {
    left: this.createPiSpigotNoiseChannelState(),
    right: this.createPiSpigotNoiseChannelState(),
    nativeHandle: 0,
    nativeSeedLeft: null,
    nativeSeedRight: null,
  };
};

// JS mirror of pi_spigot_noise.cpp's applyColor -- used by the JS
// fallback path only (native path applies the same filters in wasm).
NodeLiveAudioProcessor.prototype.applyPiSpigotColor = function applyPiSpigotColor(state, white, color) {
  if (color === 1) {
    state.pink[0] = 0.99886 * state.pink[0] + white * 0.0555179;
    state.pink[1] = 0.99332 * state.pink[1] + white * 0.0750759;
    state.pink[2] = 0.969 * state.pink[2] + white * 0.153852;
    state.pink[3] = 0.8665 * state.pink[3] + white * 0.3104856;
    state.pink[4] = 0.55 * state.pink[4] + white * 0.5329522;
    state.pink[5] = -0.7616 * state.pink[5] - white * 0.016898;
    const out = (state.pink[0] + state.pink[1] + state.pink[2] +
      state.pink[3] + state.pink[4] + state.pink[5] + state.pink[6] + white * 0.5362) * 0.11;
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

// JS-side mirror of pi_spigot_noise.cpp's BBP digit extraction -- only
// exercised when the wasm module fails to load. See the .cpp file for
// the math writeup (Bailey-Borwein-Plouffe formula) and the honest
// cost/precision tradeoffs that shape kPiSpigotCacheSize/kPiSpigotMaxStart.
NodeLiveAudioProcessor.prototype.piSpigotPowMod = function piSpigotPowMod(a, b, m) {
  let result = 1;
  let base = a % m;
  while (b > 0.5) {
    if (b % 2 >= 1) {
      result = (result * base) % m;
    }
    b = Math.floor(b / 2);
    base = (base * base) % m;
  }
  return result;
};

NodeLiveAudioProcessor.prototype.piSpigotSeries = function piSpigotSeries(m, n) {
  let s = 0;
  for (let k = 0; k <= n; k++) {
    const ak = 8 * k + m;
    const t = this.piSpigotPowMod(16, n - k, ak);
    s += t / ak;
    s -= Math.floor(s);
  }
  for (let k = n + 1; k < n + 100; k++) {
    const ak = 8 * k + m;
    const t = Math.pow(16, n - k);
    if (t < 1e-17) break;
    s += t / ak;
  }
  const frac = s - Math.floor(s);
  return frac < 0 ? frac + 1 : frac;
};

NodeLiveAudioProcessor.prototype.piSpigotBipolar = function piSpigotBipolar(n) {
  let x = 4 * this.piSpigotSeries(1, n) - 2 * this.piSpigotSeries(4, n)
    - this.piSpigotSeries(5, n) - this.piSpigotSeries(6, n);
  x -= Math.floor(x);
  if (x < 0) x += 1;
  return x * 2 - 1;
};

NodeLiveAudioProcessor.prototype.fillPiSpigotNoiseCacheJs = function fillPiSpigotNoiseCacheJs(state, start) {
  // Matches pi_spigot_noise.cpp's kCacheSize/kMaxStart exactly -- see
  // that file for why these particular values were chosen.
  const cacheSize = 1024;
  const maxStart = 256;
  const safeStart = this.clampValue(Math.floor(Number(start) || 0), 0, maxStart);
  const cache = new Float64Array(cacheSize);
  for (let i = 0; i < cacheSize; i++) {
    cache[i] = this.piSpigotBipolar(safeStart + i);
  }
  state.cache = cache;
  state.readIndex = 0;
  state.cacheStart = safeStart;
};

NodeLiveAudioProcessor.prototype.piSpigotNoiseSample = function piSpigotNoiseSample(state, params) {
  const seedLeft = this.clampValue(this.safeFilterNumber(params.seedLeft, null), 0, 1);
  const seedRight = this.clampValue(this.safeFilterNumber(params.seedRight, null), 0, 1);
  const color = this.clampValue(Math.round(this.safeFilterNumber(params.color, null)), 0, 4);
  const smoothing = this.clampValue(this.safeFilterNumber(params.smoothing, null), 0, 1);
  const level = this.safeFilterNumber(params.level, null);
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
        if (state.nativeSeedLeft !== seedLeft || state.nativeSeedRight !== seedRight) {
          state.nativeSeedLeft = seedLeft;
          state.nativeSeedRight = seedRight;
          this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_reset_seed(state.nativeHandle, seedLeft, seedRight);
        }
        this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_sample(state.nativeHandle, color, smoothing, level);
        return {
          "Left Out": this.safeFilterNumber(this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_left(state.nativeHandle), null),
          "Right Out": this.safeFilterNumber(this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_right(state.nativeHandle), null),
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
  return { "Left Out": 0, "Right Out": 0 };
};

