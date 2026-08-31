// Yellow Graph / Additive: quantum DOMAIN chase using existing smoother kernels.
// GPU migration proof: one closed-form N-step advance per param per quantum
// (not a JS for-loop of sample kernels). Unit travel internally, DOMAIN in/out.
// Separate map from this.smoothers so efficient setParams clear does not wipe it.

/** Main-thread / offline: prefer live effective DOMAIN, else params/parameters. */
function nodeGraphAdditiveReadParam(node, key, fallback, runtime, frame, frames, frameValues) {
  if (runtime && typeof readNodeGraphLiveEffectiveParam === "function") {
    return readNodeGraphLiveEffectiveParam(
      runtime, node, key, fallback, frame || 0, frames || 1, frameValues,
    );
  }
  const p = node?.params || node?.parameters || {};
  const n = Number(p[key]);
  return Number.isFinite(n) ? n : fallback;
}

NodeLiveAudioProcessor.prototype.ensureAdditiveParamSmoothers = function ensureAdditiveParamSmoothers() {
  if (!this.additiveParamSmoothers) {
    this.additiveParamSmoothers = new Map();
  }
  return this.additiveParamSmoothers;
};

/**
 * Resolve one Additive param to effective DOMAIN for this quantum.
 * Mouse/unit mapping unchanged; chase uses existing filter sample kernels.
 */
NodeLiveAudioProcessor.prototype.additiveEffectiveParam = function additiveEffectiveParam(
  node,
  key,
  fallback,
  blockFrames,
) {
  const raw = Number(node?.params?.[key]);
  const target = Number.isFinite(raw) ? raw : fallback;
  const metadata = node?.paramMeta?.[key] || {};
  let smoothingType = typeof this.smoothingTypeFromMetadata === "function"
    ? this.smoothingTypeFromMetadata(metadata)
    : (metadata.linearSmoothing === false ? "none" : "linear");
  // GPU-shaped path: Papoulis → 3P (no Π in GPU module set).
  if (typeof nodeGraphParameterSmootherGpuSafeType === "function") {
    smoothingType = nodeGraphParameterSmootherGpuSafeType(smoothingType);
  } else if (String(smoothingType || "").toLowerCase() === "papoulis") {
    smoothingType = "threePole";
  }
  const usesFilter = typeof nodeGraphParameterSmootherUsesFilter === "function"
    ? nodeGraphParameterSmootherUsesFilter(smoothingType)
    : smoothingType !== "none";

  if (!usesFilter) {
    return target;
  }

  const mode = typeof this.smoothingModeFromMetadata === "function"
    ? this.smoothingModeFromMetadata(metadata)
    : String(metadata.smoothingMode || "global");
  const smoothingSamples = typeof this.smoothingSecondsFromMetadata === "function"
    ? this.smoothingSecondsFromMetadata(metadata)
    : 0;
  const frames = Math.max(1, Number(blockFrames) || 128);
  const rate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
  if (mode === "off") {
    return target;
  }

  let seconds = typeof this.resolveSmoothingSecondsForMode === "function"
    ? this.resolveSmoothingSecondsForMode(
      mode,
      smoothingSamples,
      frames,
      rate,
      this.autoSmoothingSeconds,
    )
    : (typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
      ? nodeGraphModuleSmoothingDefaultSeconds()
      : 0.0333);

  // Default Additive metadata is linear+global; if global auto-smooth is 0,
  // still glide at the module default so Cutoff/Phase Skew do not click.
  if (!(seconds > 0) && usesFilter) {
    seconds = typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
      ? nodeGraphModuleSmoothingDefaultSeconds()
      : 0.0333;
  }

  if (!(seconds > 0)) {
    return target;
  }

  const map = this.ensureAdditiveParamSmoothers();
  const smootherKey = `additive:${String(node?.id || "")}:${String(key || "")}`;
  let smoother = map.get(smootherKey);
  if (!smoother) {
    smoother = this.createSmoother(target, metadata);
    // createSmoother reads raw metadata (may be Π); force GPU-safe type.
    if (smoother.smoothingType !== smoothingType) {
      smoother.smoothingType = smoothingType;
      smoother.filterState = null;
      smoother.filterStateType = null;
    }
    map.set(smootherKey, smoother);
  } else {
    // Update target without touching the efficient-cleared this.smoothers dirty list.
    const nextType = smoothingType;
    if (target !== smoother.target || smoother.smoothingType !== nextType) {
      smoother.target = target;
      smoother.metadata = metadata;
      smoother.min = Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : smoother.min;
      smoother.max = Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : smoother.max;
      if (smoother.smoothingType !== nextType) {
        smoother.smoothingType = nextType;
        smoother.filterState = null;
        smoother.filterStateType = null;
      }
      smoother.linearSmoothing = usesFilter;
      smoother.targetSignal = this.parameterValueToNormalizedSignal(target, metadata);
      smoother.smoothingMode = mode;
      smoother.smoothingSeconds = smoothingSamples;
      smoother.wraparound = Boolean(metadata?.wraparound);
    } else {
      smoother.metadata = metadata;
      smoother.smoothingMode = mode;
      smoother.smoothingSeconds = smoothingSamples;
    }
  }

  if (!smoother.linearSmoothing) {
    smoother.current = target;
    smoother.lastValue = target;
    smoother.outputBuffer = smoother.targetSignal;
    return target;
  }

  const cutoff = typeof this.smoothingFrequencyFromSeconds === "function"
    ? this.smoothingFrequencyFromSeconds(seconds)
    : (seconds > 0 ? 1 / seconds : 0);

  if (typeof this.smootherNeedsWork === "function" && !this.smootherNeedsWork(smoother)) {
    if (typeof this.settleSmoother === "function") {
      this.settleSmoother(smoother);
    }
    const settled = Number(smoother.lastValue);
    return Number.isFinite(settled) ? settled : target;
  }

  const signal = typeof nodeGraphParameterSmootherFilterAdvance === "function"
    ? nodeGraphParameterSmootherFilterAdvance(
      smoother, smoother.targetSignal, cutoff, rate, frames,
    )
    : (typeof nodeGraphParameterSmootherFilterSample === "function"
      ? nodeGraphParameterSmootherFilterSample(smoother, smoother.targetSignal, cutoff, rate)
      : (smoother.outputBuffer = smoother.targetSignal));

  if (typeof this.smootherNeedsWork === "function" && !this.smootherNeedsWork(smoother)) {
    if (typeof this.settleSmoother === "function") {
      this.settleSmoother(smoother);
    }
  }

  const value = this.normalizedSignalToParameterValue(signal, smoother.metadata);
  smoother.current = value;
  smoother.lastValue = value;

  const out = Number(smoother.lastValue);
  return Number.isFinite(out) ? out : target;
};

/** Drop chase state for removed Additive nodes (call after setPlan if desired). */
NodeLiveAudioProcessor.prototype.pruneAdditiveParamSmoothers = function pruneAdditiveParamSmoothers() {
  const map = this.additiveParamSmoothers;
  if (!map?.size || !this.nodes) return;
  for (const key of [...map.keys()]) {
    const parts = String(key).split(":");
    const nodeId = parts[1];
    if (nodeId && !this.nodes.has(nodeId)) {
      map.delete(key);
    }
  }
};
