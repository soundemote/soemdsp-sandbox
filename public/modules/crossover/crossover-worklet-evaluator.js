// Worklet: crossover2 … crossover6 — native LR tree only (APP_POLICY §2/§5).
// Silence until crossover.wasm / combined exports are ready.

/** Per-node native handle shell (setPlan / moduleGroup pre-create). */
NodeLiveAudioProcessor.prototype.createCrossoverStereoState = function createCrossoverStereoState(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  return { nativeHandle: 0, nativeBandCount: n, out: Object.create(null) };
};

NodeLiveAudioProcessor.prototype.crossoverSilentPorts = function crossoverSilentPorts(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const out = Object.create(null);
  if (typeof nodeGraphCrossoverOutputPorts === "function") {
    for (const p of nodeGraphCrossoverOutputPorts(n)) {
      out[p] = 0;
    }
    return out;
  }
  out.LFL = 0;
  out.LFR = 0;
  out.HFL = 0;
  out.HFR = 0;
  return out;
};

NodeLiveAudioProcessor.prototype.crossoverDestroyNative = function crossoverDestroyNative(state) {
  if (!state?.nativeHandle) return;
  try {
    this.nativeCrossover?.soemdsp_crossover_destroy?.(state.nativeHandle);
  } catch (_) {
    /* ignore */
  }
  state.nativeHandle = 0;
};

/**
 * Native stereo multi-band sample. Mutates/returns state.out port map.
 * freqs: length bandCount-1 (unused slots ignored by native).
 */
NodeLiveAudioProcessor.prototype.crossoverSample = function crossoverSample(
  state,
  mono,
  left,
  right,
  freqs,
  lrOrder,
  rate,
  bandCount,
) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (
    !this.nativeCrossoverReady
    || !this.nativeCrossover?.soemdsp_crossover_create
    || !this.nativeCrossover?.soemdsp_crossover_sample
  ) {
    return this.crossoverSilentPorts(n);
  }
  try {
    if (!state.nativeHandle || state.nativeBandCount !== n) {
      this.crossoverDestroyNative(state);
      state.nativeHandle = this.nativeCrossover.soemdsp_crossover_create(n);
      state.nativeBandCount = n;
    }
    if (!state.nativeHandle) {
      return this.crossoverSilentPorts(n);
    }
    const f = Array.isArray(freqs) ? freqs : [];
    this.nativeCrossover.soemdsp_crossover_sample(
      state.nativeHandle,
      Number(mono) || 0,
      Number(left) || 0,
      Number(right) || 0,
      Number(f[0]) || 0,
      Number(f[1]) || 0,
      Number(f[2]) || 0,
      Number(f[3]) || 0,
      Number(f[4]) || 0,
      Math.round(Number(lrOrder) || 4),
      Math.max(1, Number(rate) || sampleRate || 44100),
    );
    if (!state.out) state.out = Object.create(null);
    const out = state.out;
    for (let i = 0; i < n; i += 1) {
      const pair = typeof nodeGraphCrossoverBandPortPair === "function"
        ? nodeGraphCrossoverBandPortPair(n, i)
        : (i === 0 ? { L: "LFL", R: "LFR" } : i === n - 1 ? { L: "HFL", R: "HFR" } : { L: `L${i}`, R: `R${i}` });
      out[pair.L] = this.safeFilterNumber(
        this.nativeCrossover.soemdsp_crossover_band_l(state.nativeHandle, i),
        null,
      );
      out[pair.R] = this.safeFilterNumber(
        this.nativeCrossover.soemdsp_crossover_band_r(state.nativeHandle, i),
        null,
      );
    }
    return out;
  } catch (error) {
    this.nativeCrossoverReady = false;
    this.crossoverDestroyNative(state);
    this.port.postMessage({
      type: "nativeModuleStatus",
      name: "crossover",
      status: "disabled",
      message: String(error?.message || error || "native crossover failed"),
    });
    return this.crossoverSilentPorts(n);
  }
};

NodeLiveAudioProcessor.prototype.crossoverEvaluator = function crossoverEvaluator(
  bandCount,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  safeRate,
) {
  const type = `crossover${bandCount}`;
  const mapName = `${type}States`;
  if (!this[mapName]) this[mapName] = new Map();
  let state = this[mapName].get(nodeId);
  if (!state || state.nativeBandCount !== bandCount) {
    if (state) this.crossoverDestroyNative(state);
    state = this.createCrossoverStereoState(bandCount);
    this[mapName].set(nodeId, state);
  }
  const lrOrder = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
  const splitCount = bandCount - 1;
  const defaults = typeof nodeGraphCrossoverDefaultFreqs === "function"
    ? nodeGraphCrossoverDefaultFreqs(bandCount)
    : [];
  const freqs = [];
  for (let i = 0; i < splitCount; i += 1) {
    const key = splitCount === 1 ? "frequency" : `frequency${i + 1}`;
    freqs.push(this.readEffectiveParameter(node, key, defaults[i] ?? 1000, frame, frames, frameValues));
  }
  return this.crossoverSample(
    state,
    mixInput(nodeId),
    mixInput(nodeId, "L") + mixInput(nodeId, "Left"),
    mixInput(nodeId, "R") + mixInput(nodeId, "Right"),
    freqs,
    lrOrder,
    safeRate,
    bandCount,
  );
};
