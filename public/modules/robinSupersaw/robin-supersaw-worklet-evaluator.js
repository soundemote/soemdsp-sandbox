NodeLiveAudioProcessor.prototype.createRobinSupersawDitherVoice = function createRobinSupersawDitherVoice() {
    return { sampleCount: 0, lenNow: 100, lenMid: 100, probShort: 0, probMid: 1, phaseSlope: 1 / 99 };
  };

NodeLiveAudioProcessor.prototype.createRobinSupersawState = function createRobinSupersawState() {
    const left = [];
    const right = [];
    for (let i = 0; i < 9; i++) {
      left.push(this.createRobinSupersawDitherVoice());
      right.push(this.createRobinSupersawDitherVoice());
    }
    return {
      left,
      right,
      nativeHandle: 0,
      cachedParams: null,
      out: { Mono: 0, Left: 0, Right: 0 },
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

NodeLiveAudioProcessor.prototype.robinSupersawCalcCycleDistribution = function robinSupersawCalcCycleDistribution(c) {
    const ci = Math.floor(c);
    const cf = c - ci;
    let c2 = ci;
    if (cf >= 0.5) c2 += 1;
    const c1 = c2 - 1;
    const c3 = c2 + 1;
    const e1 = c1 - c;
    const e2 = c2 - c;
    const e3 = c3 - c;
    const v1 = e1 * e1;
    const v2 = e2 * e2;
    const v3 = e3 * e3;
    const v = 0.25;
    const d1 = v - v1;
    const d2 = v - v2;
    const d3 = v - v3;
    const s = 1 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));
    return { lenMid: c2, probShort: (d2 * e3 - d3 * e2) * s, probMid: (d3 * e1 - d1 * e3) * s };
  };

NodeLiveAudioProcessor.prototype.robinSupersawUpdateCycleLength = function robinSupersawUpdateCycleLength(voice) {
    const r = Math.random();
    if (r < voice.probShort) {
      voice.lenNow = voice.lenMid - 1;
    } else if (r < voice.probShort + voice.probMid) {
      voice.lenNow = voice.lenMid;
    } else {
      voice.lenNow = voice.lenMid + 1;
    }
    voice.phaseSlope = 1 / Math.max(1, voice.lenNow - 1);  // phasorRangeClosed = true
  };

NodeLiveAudioProcessor.prototype.robinSupersawGetSamplePhasor = function robinSupersawGetSamplePhasor(voice) {
    const p = voice.phaseSlope * voice.sampleCount;
    voice.sampleCount += 1;
    if (voice.sampleCount >= voice.lenNow) {
      voice.sampleCount = 0;
      this.robinSupersawUpdateCycleLength(voice);
    }
    return p;
  };

// Native-only RobinSupersaw (no silent zero / JS sample fallback).
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
    const voices = Math.round(Number(options.voices) || 1);
    const level = Number(options.level) || 0;
    const out = state.out || (state.out = { Mono: 0, Left: 0, Right: 0 });
    const blockSize = NodeLiveAudioProcessor.ROBIN_SUPERSAW_NATIVE_BLOCK_SIZE;
    if (
      options.useBlock &&
      native.soemdsp_robin_supersaw_process_block &&
      this.bindRobinSupersawBlockViews(native, state, blockSize)
    ) {
      const cache = state.blockCache;
      if (cache.cursor >= cache.size) {
        native.soemdsp_robin_supersaw_process_block(
          state.nativeHandle,
          frequencyHz,
          sampleRate,
          detuneCents,
          voices,
          level,
          blockSize,
        );
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
      voices,
      level,
    );
    out.Mono = Number(native.soemdsp_robin_supersaw_mono(state.nativeHandle)) || 0;
    out.Left = Number(native.soemdsp_robin_supersaw_left(state.nativeHandle)) || 0;
    out.Right = Number(native.soemdsp_robin_supersaw_right(state.nativeHandle)) || 0;
    return out;
  };

