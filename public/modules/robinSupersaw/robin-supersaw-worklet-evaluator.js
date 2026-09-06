NodeLiveAudioProcessor.prototype.createRobinSupersawState = function createRobinSupersawState() {
  return {
    nativeHandle: 0,
    lastReset: 0,
    out: { Mono: 0, Left: 0, Right: 0 },
    lastVoicePhases: [],
    lastVoiceAmplitudes: [],
    lastVoicePans: [],
    blockCache: { cursor: 0, size: 0, left: null, right: null, mono: null, memory: null },
  };
};

NodeLiveAudioProcessor.prototype.bindRobinSupersawBlockViews = function bindRobinSupersawBlockViews(native, state, blockSize) {
  const memory = native?.memory;
  if (!memory?.buffer || !state?.nativeHandle || blockSize < 1) {
    return false;
  }
  const cache = state.blockCache || (state.blockCache = {});
  if (cache.left && cache.memory === memory.buffer && cache.size === blockSize) {
    return true;
  }
  const leftPtr = native.soemdsp_robin_supersaw_block_output_left_ptr?.(state.nativeHandle);
  const rightPtr = native.soemdsp_robin_supersaw_block_output_right_ptr?.(state.nativeHandle);
  const monoPtr = native.soemdsp_robin_supersaw_block_output_mono_ptr?.(state.nativeHandle);
  if (!leftPtr || !rightPtr || !monoPtr) {
    return false;
  }
  cache.left = new Float64Array(memory.buffer, leftPtr, blockSize);
  cache.right = new Float64Array(memory.buffer, rightPtr, blockSize);
  cache.mono = new Float64Array(memory.buffer, monoPtr, blockSize);
  cache.memory = memory.buffer;
  cache.size = blockSize;
  cache.cursor = blockSize;
  return true;
};

NodeLiveAudioProcessor.prototype.robinSupersawPublishVoices = function robinSupersawPublishVoices(native, state) {
  const countFn = native.soemdsp_robin_supersaw_voice_count;
  const xFn = native.soemdsp_robin_supersaw_voice_x;
  const panFn = native.soemdsp_robin_supersaw_voice_pan;
  const ampFn = native.soemdsp_robin_supersaw_voice_amp;
  if (!countFn || !xFn || !state?.nativeHandle) {
    state.lastVoicePhases = [];
    state.lastVoiceAmplitudes = [];
    state.lastVoicePans = [];
    return;
  }
  let n = 0;
  try {
    n = countFn(state.nativeHandle) | 0;
  } catch (_e) {
    n = 0;
  }
  if (n < 1) {
    state.lastVoicePhases = [];
    state.lastVoiceAmplitudes = [];
    state.lastVoicePans = [];
    return;
  }
  if (n > 256) n = 256;
  const phases = new Array(n);
  const amps = new Array(n);
  const pans = new Array(n);
  for (let i = 0; i < n; i++) {
    try {
      const x = Number(xFn(state.nativeHandle, i));
      // 0 is a valid face X (wrap edge). Do not coalesce with || 0.5.
      phases[i] = Number.isFinite(x) ? x : 0.5;
    } catch (_e) {
      phases[i] = 0.5;
    }
    try {
      const pan = panFn ? Number(panFn(state.nativeHandle, i)) : 0;
      pans[i] = Number.isFinite(pan) ? pan : 0;
    } catch (_e) {
      pans[i] = 0;
    }
    try {
      const amp = ampFn ? Number(ampFn(state.nativeHandle, i)) : 1;
      amps[i] = Number.isFinite(amp) ? amp : 1;
    } catch (_e) {
      amps[i] = 1;
    }
  }
  state.lastVoicePhases = phases;
  state.lastVoiceAmplitudes = amps;
  state.lastVoicePans = pans;
};

// Native-only RobinSupersaw.
NodeLiveAudioProcessor.prototype.robinSupersawSample = function robinSupersawSample(state, options = {}) {
  if (
    !this.nativeRobinSupersawReady
    || !this.nativeRobinSupersaw?.soemdsp_robin_supersaw_create
    || !this.nativeRobinSupersaw?.soemdsp_robin_supersaw_sample
  ) {
    throw new Error("native RobinSupersaw not ready");
  }
  const native = this.nativeRobinSupersaw;
  if (!state.nativeHandle) {
    state.nativeHandle = native.soemdsp_robin_supersaw_create();
    if (state.blockCache) {
      state.blockCache.cursor = 0;
      state.blockCache.size = 0;
      state.blockCache.left = null;
      state.blockCache.right = null;
      state.blockCache.mono = null;
      state.blockCache.memory = null;
    }
  }
  if (!state.nativeHandle) {
    throw new Error("native RobinSupersaw failed to create instance");
  }
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const frequencyHz = Number(options.frequencyHz) || 0;
  const detuneCents = Number(options.detuneCents) || 0;
  const voices = Number(options.voices);
  const voicesExact = Number.isFinite(voices) && voices > 0 ? voices : 1;
  const level = Number(options.level) || 0;
  const phaseSpread = Number.isFinite(Number(options.phaseSpread))
    ? Number(options.phaseSpread)
    : 1;
  const stereoMode = Number(options.stereoMode) || 0;
  const detuneAlgorithmRaw = Number(options.detuneAlgorithm);
  const detuneAlgorithm = Number.isFinite(detuneAlgorithmRaw) ? detuneAlgorithmRaw : 2;
  const portaTimeMinRaw = Number(options.portaTimeMin);
  const portaTimeMin = Number.isFinite(portaTimeMinRaw) ? Math.max(0, portaTimeMinRaw) : 0;
  const portaTimeMaxRaw = Number(options.portaTimeMax);
  const portaTimeMax = Number.isFinite(portaTimeMaxRaw) ? Math.max(0, portaTimeMaxRaw) : 0;
  const portamentoStyleRaw = Number(options.portamentoStyle);
  const portamentoStyle = Number.isFinite(portamentoStyleRaw) ? portamentoStyleRaw : 0.126;
  const reset = Number(options.reset) || 0;
  const out = state.out || (state.out = { Mono: 0, Left: 0, Right: 0 });
  const blockSize = NodeLiveAudioProcessor.ROBIN_SUPERSAW_NATIVE_BLOCK_SIZE;
  if (
    options.useBlock
    && native.soemdsp_robin_supersaw_process_block
    && this.bindRobinSupersawBlockViews(native, state, blockSize)
  ) {
    const cache = state.blockCache;
    if (cache.cursor >= cache.size) {
      native.soemdsp_robin_supersaw_process_block(
        state.nativeHandle,
        frequencyHz,
        sampleRate,
        detuneCents,
        voicesExact,
        level,
        phaseSpread,
        stereoMode,
        detuneAlgorithm,
        portaTimeMin,
        portaTimeMax,
        portamentoStyle,
        reset,
        blockSize,
      );
      this.robinSupersawPublishVoices(native, state);
      cache.cursor = 0;
    }
    const index = cache.cursor;
    cache.cursor += 1;
    out.Mono = Number(cache.mono[index]) || 0;
    out.Left = Number(cache.left[index]) || 0;
    out.Right = Number(cache.right[index]) || 0;
    return out;
  }
  native.soemdsp_robin_supersaw_sample(
    state.nativeHandle,
    frequencyHz,
    sampleRate,
    detuneCents,
    voicesExact,
    level,
    phaseSpread,
    stereoMode,
    detuneAlgorithm,
    portaTimeMin,
    portaTimeMax,
    portamentoStyle,
    reset,
  );
  this.robinSupersawPublishVoices(native, state);
  out.Mono = Number(native.soemdsp_robin_supersaw_mono(state.nativeHandle)) || 0;
  out.Left = Number(native.soemdsp_robin_supersaw_left(state.nativeHandle)) || 0;
  out.Right = Number(native.soemdsp_robin_supersaw_right(state.nativeHandle)) || 0;
  return out;
};
