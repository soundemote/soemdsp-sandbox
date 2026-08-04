// Realtime worklet evaluator methods for fractalBrownianNoise, split out
// of node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's
// prototype. Loaded as part of the Blob-assembled AudioWorklet module
// (see nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js)
// after core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.fractalBrownianNoiseVector(...) directly.
//
// hashBipolar stays in core.js: confirmed shared with another, unrelated
// module.
NodeLiveAudioProcessor.prototype.createFractalBrownianNoiseState = function createFractalBrownianNoiseState() {
  return {
    axes: {},
    nativeHandle: 0,
    resetWasHigh: false,
    // Block-processing cache: resolves params once per
    // FBM_NATIVE_BLOCK_SIZE calls via soemdsp_fbm_process_block instead of
    // once per sample via soemdsp_fbm_sample. cursor >= size means the
    // cache is empty/exhausted and the next read triggers a refill.
    blockCache: { cursor: 0, size: 0, x: null, y: null, z: null, xRaw: null, yRaw: null, zRaw: null },
  };
};

NodeLiveAudioProcessor.prototype.resetFractalBrownianNoiseState = function resetFractalBrownianNoiseState(state) {
  for (const axisState of Object.values(state.axes || {})) {
    axisState.time = 0;
  }
  if (state.blockCache) {
    state.blockCache.cursor = 0;
    state.blockCache.size = 0;
  }
  if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_reset) {
    this.nativeFbm.soemdsp_fbm_reset(state.nativeHandle);
  }
};

NodeLiveAudioProcessor.prototype.smoothNoise1d = function smoothNoise1d(x, seed) {
  const left = Math.floor(x);
  const frac = x - left;
  const smooth = frac * frac * (3 - 2 * frac);
  const a = this.hashBipolar(left, seed);
  const b = this.hashBipolar(left + 1, seed);
  return a + (b - a) * smooth;
};

NodeLiveAudioProcessor.prototype.fractalBrownianNoiseAxisState = function fractalBrownianNoiseAxisState(state, axis) {
  const key = String(axis || "x");
  if (!state.axes || typeof state.axes !== "object") {
    state.axes = {};
  }
  if (!state.axes[key]) {
    state.axes[key] = { seedKey: "", time: 0 };
  }
  return state.axes[key];
};

NodeLiveAudioProcessor.prototype.fractalBrownianNoiseSample = function fractalBrownianNoiseSample(state, params, rate = sampleRate, nodeId = "", axis = "x", options = {}) {
  const axisState = this.fractalBrownianNoiseAxisState(state, axis);
  const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
  const seed = Math.max(0, Math.round(this.safeFilterNumber(params.seed, null)));
  const seedKey = this.seededKey(nodeId, seed, `fractalBrownianNoise:${axis}`);
  if (axisState.seedKey !== seedKey) {
    axisState.seedKey = seedKey;
    axisState.time = 0;
  }
  const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
  const octaves = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.octaves, null))));
  const persistence = this.clampValue(this.safeFilterNumber(params.persistence, null), 0, 0.99);
  const scale = Math.max(0.000001, this.safeFilterNumber(params.scale, null));
  const level = this.safeFilterNumber(params.amplitude, null);
  let total = 0;
  let amplitude = 1;
  let noiseFrequency = 1;
  let maxValue = 0;
  const baseSeed = this.stableSeed(seedKey);
  for (let i = 0; i < octaves; i += 1) {
    total += this.smoothNoise1d(axisState.time * scale * noiseFrequency, baseSeed + i * 1013) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    noiseFrequency *= 2;
  }
  axisState.time += frequency / safeRate;
  const normalized = maxValue > 0 ? total / maxValue : 0;
  return this.safeFilterNumber(options.raw ? normalized : normalized * level, null);
};

NodeLiveAudioProcessor.prototype.fractalBrownianNoiseVector = function fractalBrownianNoiseVector(state, params, rate = sampleRate, nodeId = "", reset = 0) {
  const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
  const resetHigh = Number(reset) > 0.5;
  if (resetHigh && !state.resetWasHigh) {
    this.resetFractalBrownianNoiseState(state);
  }
  state.resetWasHigh = resetHigh;
  if (this.nativeFbmReady) {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeFbm.soemdsp_fbm_create();
      // A stale cache here would replay up to one block's worth of
      // samples read from a detached WASM memory buffer belonging to a
      // module instance that no longer exists -- most likely after a
      // native-module hot-reload (see the "fractal_brownian_noise"
      // reload handler above, which destroys the handle but doesn't
      // touch this Map entry). Matches the same reset already applied
      // in noiseGeneratorSample.
      if (state.blockCache) {
        state.blockCache.cursor = 0;
        state.blockCache.size = 0;
      }
    }
    if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_process_block) {
      const cache = state.blockCache;
      if (cache.cursor >= cache.size) {
        // Block-processing boundary: resolve params ONCE for the whole
        // block instead of once per sample, run the native block kernel
        // (SIMD internally), and cache the results for the next
        // FBM_NATIVE_BLOCK_SIZE reads. Params are frozen for the
        // duration of one cached block (128 samples, ~2.9ms @ 44.1kHz) --
        // the standard block-rate tradeoff, well below audible for a
        // slowly-evolving noise generator like FBM.
        const seed = Math.max(0, Math.round(this.safeFilterNumber(params.seed, null)));
        const octaves = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.octaves, null))));
        const persistence = this.clampValue(this.safeFilterNumber(params.persistence, null), 0, 0.99);
        const scale = Math.max(0.000001, this.safeFilterNumber(params.scale, null));
        const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
        const level = this.safeFilterNumber(params.amplitude, null);
        const blockSize = NodeLiveAudioProcessor.FBM_NATIVE_BLOCK_SIZE;
        this.nativeFbm.soemdsp_fbm_process_block(state.nativeHandle, seed, octaves, persistence, scale, frequency, level, safeRate, blockSize, 1);
        const memory = this.nativeFbm.memory;
        const xPtr = this.nativeFbm.soemdsp_fbm_block_output_x_ptr(state.nativeHandle);
        const yPtr = this.nativeFbm.soemdsp_fbm_block_output_y_ptr(state.nativeHandle);
        const zPtr = this.nativeFbm.soemdsp_fbm_block_output_z_ptr(state.nativeHandle);
        const xRawPtr = this.nativeFbm.soemdsp_fbm_block_output_x_raw_ptr(state.nativeHandle);
        const yRawPtr = this.nativeFbm.soemdsp_fbm_block_output_y_raw_ptr(state.nativeHandle);
        const zRawPtr = this.nativeFbm.soemdsp_fbm_block_output_z_raw_ptr(state.nativeHandle);
        cache.x = new Float64Array(memory.buffer, xPtr, blockSize);
        cache.y = new Float64Array(memory.buffer, yPtr, blockSize);
        cache.z = new Float64Array(memory.buffer, zPtr, blockSize);
        cache.xRaw = new Float64Array(memory.buffer, xRawPtr, blockSize);
        cache.yRaw = new Float64Array(memory.buffer, yRawPtr, blockSize);
        cache.zRaw = new Float64Array(memory.buffer, zRawPtr, blockSize);
        cache.size = blockSize;
        cache.cursor = 0;
      }
      const index = cache.cursor;
      cache.cursor += 1;
      const outX = this.safeFilterNumber(cache.x[index], null);
      const outY = this.safeFilterNumber(cache.y[index], null);
      const outZ = this.safeFilterNumber(cache.z[index], null);
      return {
        "Out X": outX,
        "Out Y": outY,
        "Out Z": outZ,
        "Out X Raw": this.safeFilterNumber(cache.xRaw[index], null),
        "Out Y Raw": this.safeFilterNumber(cache.yRaw[index], null),
        "Out Z Raw": this.safeFilterNumber(cache.zRaw[index], null),
      };
    }
    if (state.nativeHandle) {
      const seed = Math.max(0, Math.round(this.safeFilterNumber(params.seed, null)));
      const octaves = Math.max(1, Math.min(8, Math.round(this.safeFilterNumber(params.octaves, null))));
      const persistence = this.clampValue(this.safeFilterNumber(params.persistence, null), 0, 0.99);
      const scale = Math.max(0.000001, this.safeFilterNumber(params.scale, null));
      const frequency = Math.max(0, this.safeFilterNumber(params.frequency, null));
      const level = this.safeFilterNumber(params.amplitude, null);
      this.nativeFbm.soemdsp_fbm_sample(state.nativeHandle, seed, octaves, persistence, scale, frequency, level, safeRate);
      const rawX = this.nativeFbm.soemdsp_fbm_x_raw?.(state.nativeHandle);
      const rawY = this.nativeFbm.soemdsp_fbm_y_raw?.(state.nativeHandle);
      const rawZ = this.nativeFbm.soemdsp_fbm_z_raw?.(state.nativeHandle);
      return {
        "Out X": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_x(state.nativeHandle), null),
        "Out Y": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_y(state.nativeHandle), null),
        "Out Z": this.safeFilterNumber(this.nativeFbm.soemdsp_fbm_z(state.nativeHandle), null),
        "Out X Raw": this.safeFilterNumber(rawX ?? this.nativeFbm.soemdsp_fbm_x(state.nativeHandle), null),
        "Out Y Raw": this.safeFilterNumber(rawY ?? this.nativeFbm.soemdsp_fbm_y(state.nativeHandle), null),
        "Out Z Raw": this.safeFilterNumber(rawZ ?? this.nativeFbm.soemdsp_fbm_z(state.nativeHandle), null),
      };
    }
  }
  const rawX = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "x", { raw: true });
  const rawY = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "y", { raw: true });
  const rawZ = this.fractalBrownianNoiseSample(state, params, safeRate, nodeId, "z", { raw: true });
  const level = this.safeFilterNumber(params.amplitude, null);
  return {
    "Out X": this.safeFilterNumber(rawX * level, null),
    "Out Y": this.safeFilterNumber(rawY * level, null),
    "Out Z": this.safeFilterNumber(rawZ * level, null),
    "Out X Raw": rawX,
    "Out Y Raw": rawY,
    "Out Z Raw": rawZ,
  };
};
