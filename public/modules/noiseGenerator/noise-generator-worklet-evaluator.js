// Realtime worklet evaluator methods for noiseGenerator, split out of
// node-live-audio-worklet-core.js onto NodeLiveAudioProcessor's prototype.
// Loaded as part of the Blob-assembled AudioWorklet module (see
// nodeGraphLiveWorkletSourceFiles in node-graph-live-runtime.js) after
// core.js defines the class and before register.js calls
// registerProcessor -- no call-site changes needed since the dispatch
// registry calls this.noiseGeneratorSample(...) directly.
//
// nextSeededUnipolar/nextSeededBipolar, resetSeededState, and
// createNoiseGeneratorChannelState stay in core.js: confirmed shared with
// other modules (sampleHold reuses createNoiseGeneratorChannelState;
// nextSeededUnipolar/Bipolar back multiple modules' PRNGs).
NodeLiveAudioProcessor.prototype.nextSeededGaussian = function nextSeededGaussian(state) {
  if (state.gaussianSpare !== null && state.gaussianSpare !== undefined) {
    const spare = state.gaussianSpare;
    state.gaussianSpare = null;
    return spare;
  }
  const u1 = Math.max(1e-12, this.nextSeededUnipolar(state));
  const u2 = this.nextSeededUnipolar(state);
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  const angle = Math.PI * 2 * u2;
  state.gaussianSpare = magnitude * Math.sin(angle);
  return magnitude * Math.cos(angle);
};

// 0 = even bipolar, 1 = Gaussian. Smoothstep blend (matches native).
NodeLiveAudioProcessor.prototype.noiseGeneratorShapedBipolar = function noiseGeneratorShapedBipolar(chanState, shape) {
  const t = this.clampValue(Number(shape) || 0, 0, 1);
  if (t <= 1e-12) {
    return this.nextSeededBipolar(chanState);
  }
  if (t >= 1 - 1e-12) {
    return this.nextSeededGaussian(chanState);
  }
  const s = t * t * (3 - 2 * t);
  const u = this.nextSeededBipolar(chanState);
  const g = this.nextSeededGaussian(chanState);
  return u * (1 - s) + g * s;
};

NodeLiveAudioProcessor.prototype.noiseGeneratorChannelSample = function noiseGeneratorChannelSample(chanState, mode, mean, deviation, shape = 0) {
  const white = this.nextSeededBipolar(chanState);
  if (mode === 1) {
    return mean + this.nextSeededGaussian(chanState) * deviation;
  }
  if (mode === 2) {
    chanState.brown = this.clampValue(chanState.brown + white * Math.max(0.001, deviation) * 0.05, -1, 1);
    return mean + chanState.brown;
  }
  if (mode === 3) {
    chanState.pink[0] = 0.99886 * chanState.pink[0] + white * 0.0555179;
    chanState.pink[1] = 0.99332 * chanState.pink[1] + white * 0.0750759;
    chanState.pink[2] = 0.969   * chanState.pink[2] + white * 0.153852;
    chanState.pink[3] = 0.8665  * chanState.pink[3] + white * 0.3104856;
    chanState.pink[4] = 0.55    * chanState.pink[4] + white * 0.5329522;
    chanState.pink[5] = -0.7616 * chanState.pink[5] - white * 0.016898;
    const out = mean + (chanState.pink[0] + chanState.pink[1] + chanState.pink[2] + chanState.pink[3] + chanState.pink[4] + chanState.pink[5] + chanState.pink[6] + white * 0.5362) * 0.11;
    chanState.pink[6] = white * 0.115926;
    return out;
  }
  if (mode === 4) {
    return Math.abs(white) > 0.94 ? mean + Math.sign(white) * deviation : mean;
  }
  return mean + this.noiseGeneratorShapedBipolar(chanState, shape) * deviation;
};

NodeLiveAudioProcessor.prototype.noiseGeneratorSample = function noiseGeneratorSample(state, params, nodeId) {
  const mode = Math.max(0, Math.min(4, Math.round(this.safeFilterNumber(params.mode, null))));
  const mean = this.safeFilterNumber(params.mean, null);
  const deviation = Math.max(0, this.safeFilterNumber(params.deviation, null));
  const shape = this.clampValue(this.safeFilterNumber(params.shape, null), 0, 1);
  const level = this.safeFilterNumber(params.amplitude, null);
  const seed = this.safeFilterNumber(params.seed, null);
  if (this.nativeNoiseGeneratorReady) {
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeNoiseGenerator.soemdsp_noise_generator_create();
      if (state.blockCache) {
        state.blockCache.cursor = 0;
        state.blockCache.size = 0;
      }
    }
    if (state.nativeHandle) {
      if (this.nativeNoiseGenerator.soemdsp_noise_generator_process_block) {
        const cache = state.blockCache || (state.blockCache = { cursor: 0, size: 0, left: null, right: null });
        if (cache.cursor >= cache.size) {
          const blockSize = NodeLiveAudioProcessor.NOISE_NATIVE_BLOCK_SIZE;
          // v2: (handle, seed, mode, mean, deviation, shape, level, frames, simd)
          this.nativeNoiseGenerator.soemdsp_noise_generator_process_block(
            state.nativeHandle, seed, mode, mean, deviation, shape, level, blockSize, 1,
          );
          const memory = this.nativeNoiseGenerator.memory;
          const leftPtr = this.nativeNoiseGenerator.soemdsp_noise_generator_block_output_left_ptr(state.nativeHandle);
          const rightPtr = this.nativeNoiseGenerator.soemdsp_noise_generator_block_output_right_ptr(state.nativeHandle);
          cache.left = new Float64Array(memory.buffer, leftPtr, blockSize);
          cache.right = new Float64Array(memory.buffer, rightPtr, blockSize);
          cache.size = blockSize;
          cache.cursor = 0;
        }
        const index = cache.cursor;
        cache.cursor += 1;
        return {
          "Left Out": this.safeFilterNumber(cache.left[index], null),
          "Right Out": this.safeFilterNumber(cache.right[index], null),
        };
      }
      // v2: (handle, seed, mode, mean, deviation, shape, level)
      this.nativeNoiseGenerator.soemdsp_noise_generator_sample(
        state.nativeHandle, seed, mode, mean, deviation, shape, level,
      );
      return {
        "Left Out": this.safeFilterNumber(this.nativeNoiseGenerator.soemdsp_noise_generator_left(state.nativeHandle), null),
        "Right Out": this.safeFilterNumber(this.nativeNoiseGenerator.soemdsp_noise_generator_right(state.nativeHandle), null),
      };
    }
  }
  this.resetSeededState(state.left, `${nodeId}:left`, seed, "noiseGenerator");
  this.resetSeededState(state.right, `${nodeId}:right`, seed, "noiseGenerator");
  const left = this.safeFilterNumber(this.clampValue(this.noiseGeneratorChannelSample(state.left, mode, mean, deviation, shape), -1, 1) * level, null);
  const right = this.safeFilterNumber(this.clampValue(this.noiseGeneratorChannelSample(state.right, mode, mean, deviation, shape), -1, 1) * level, null);
  return { "Left Out": left, "Right Out": right };
};

NodeLiveAudioProcessor.prototype.createNoiseGeneratorState = function createNoiseGeneratorState() {
  return {
    left: this.createNoiseGeneratorChannelState(), nativeHandle: 0, right: this.createNoiseGeneratorChannelState(),
    blockCache: { cursor: 0, size: 0, left: null, right: null },
  };
};

NodeLiveAudioProcessor.prototype.destroyNoiseGeneratorNativeState = function destroyNoiseGeneratorNativeState(state) {
  if (state.nativeHandle && this.nativeNoiseGenerator?.soemdsp_noise_generator_destroy) {
    this.nativeNoiseGenerator.soemdsp_noise_generator_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
};
