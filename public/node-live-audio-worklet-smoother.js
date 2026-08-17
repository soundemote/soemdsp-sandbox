// Extracted from node-live-audio-worklet-core.js (Phase D — parameter smoother).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.smoothingSecondsFromMetadata = function smoothingSecondsFromMetadata(metadata = {}) {
    const value = Number(metadata?.smoothingSeconds);
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    // Values in (0, 1) are seconds (e.g. 0.05); ≥ 1 are sample counts.
    if (value > 0 && value < 1) {
      const rate = Math.max(1, Number(this.engineSampleRate || sampleRate) || 44100);
      return Math.max(1, Math.round(value * rate));
    }
    return Math.max(0, Math.round(value));
};

NodeLiveAudioProcessor.prototype.smoothingModeFromMetadata = function smoothingModeFromMetadata(metadata = {}) {
    return nodeSmoothingModeNormalize(metadata?.smoothingMode);
};

NodeLiveAudioProcessor.prototype.smoothingTypeFromMetadata = function smoothingTypeFromMetadata(metadata = {}) {
    const raw = metadata?.smoothingType;
    if (raw != null && String(raw).trim() !== "") {
      if (typeof normalizeNodeGraphParameterSmootherFilterType === "function") {
        return normalizeNodeGraphParameterSmootherFilterType(raw);
      }
      const key = String(raw).trim();
      if (key === "none" || key === "off" || key === "instant") {
        return "none";
      }
      if (key === "linear" || key === "L" || key === "l" || key === "lerp") {
        return "linear";
      }
      if (key === "twoPole" || key === "2P" || key === "2p" || key === "two-pole" || key === "2pole") {
        return "twoPole";
      }
      return key === "papoulis" ? "papoulis" : "onePole";
    }
    // Legacy: linearSmoothing=false → instant snaps (not linear ramps).
    if (metadata?.linearSmoothing === false) {
      return "none";
    }
    return "onePole";
};

NodeLiveAudioProcessor.prototype.resolveSmoothingSecondsForMode = function resolveSmoothingSecondsForMode(mode, smoothingSamples, frames, rate = sampleRate, globalSeconds = this.autoSmoothingSeconds) {
    const safeRate = Math.max(1, Number(rate) || 44100);
    const safeGlobal = Number.isFinite(Number(globalSeconds)) ? Math.max(0, Number(globalSeconds)) : 0;
    const internalSeconds = smoothingSamples > 0 ? smoothingSamples / safeRate : 0;
    switch (mode) {
      case "off":
        return 0;
      case "blockSize":
        // Under construction: behaves as no smoothing until implemented.
        return 0;
      case "global":
        return safeGlobal;
      case "internalGlobal":
        return internalSeconds + safeGlobal;
      case "internal":
      default:
        if (internalSeconds > 0) {
          return internalSeconds;
        }
        return typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
          ? nodeGraphModuleSmoothingDefaultSeconds()
          : 0.0333;
    }
};

NodeLiveAudioProcessor.prototype.createSmoother = function createSmoother(initialValue, metadata = {}) {
    const value = Number(initialValue);
    const safeValue = Number.isFinite(value) ? value : 0;
    const signal = this.parameterValueToNormalizedSignal(safeValue, metadata);
    const smoothingType = this.smoothingTypeFromMetadata(metadata);
    const usesFilter = typeof nodeGraphParameterSmootherUsesFilter === "function"
      ? nodeGraphParameterSmootherUsesFilter(smoothingType)
      : (smoothingType !== "none" && metadata?.linearSmoothing !== false);
    const smoother = {
      current: safeValue,
      linearSmoothing: usesFilter,
      max: Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : 1,
      metadata,
      min: Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : 0,
      smoothingMode: this.smoothingModeFromMetadata(metadata),
      smoothingSeconds: this.smoothingSecondsFromMetadata(metadata),
      smoothingType,
      outputBuffer: signal,
      targetSignal: signal,
      target: safeValue,
      lastValue: safeValue,
      wraparound: Boolean(metadata?.wraparound),
      filterState: null,
      filterStateType: null,
    };
    if (typeof nodeGraphEnsureParameterSmootherFilterState === "function") {
      nodeGraphEnsureParameterSmootherFilterState(smoother, smoothingType);
    }
    return smoother;
};

NodeLiveAudioProcessor.prototype.clampAutoSmoothingSeconds = function clampAutoSmoothingSeconds(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) {
      return 0.016;
    }
    return Math.max(0, value);
};

NodeLiveAudioProcessor.prototype.smoothingFrequencyFromSeconds = function smoothingFrequencyFromSeconds(seconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    return normalized <= 0 ? 0 : 1 / normalized;
};

NodeLiveAudioProcessor.prototype.syncNestedAutoSmoothingSeconds = function syncNestedAutoSmoothingSeconds(seconds = this.autoSmoothingSeconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.autoSmoothingSeconds = normalized;
      runtime.syncNestedAutoSmoothingSeconds?.(normalized);
    }
};

NodeLiveAudioProcessor.prototype.smootherNeedsWork = function smootherNeedsWork(smoother) {
    // Shared floor with main-thread smoothers (filters.js). Planck.
    const eps = typeof nodeGraphParameterSmootherConvergenceEpsilon === "number"
      ? nodeGraphParameterSmootherConvergenceEpsilon
      : (typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7);
    return Math.abs((smoother.outputBuffer ?? 0) - (smoother.targetSignal ?? 0)) > eps;
};

NodeLiveAudioProcessor.prototype.settleSmoother = function settleSmoother(smoother, { snapFilter = true } = {}) {
    if (!smoother) {
      return;
    }
    smoother.current = smoother.target;
    smoother.outputBuffer = smoother.targetSignal;
    smoother.lastValue = smoother.target;
    if (snapFilter && typeof nodeGraphParameterSmootherFilterSnap === "function") {
      nodeGraphParameterSmootherFilterSnap(smoother, smoother.targetSignal);
    }
};

NodeLiveAudioProcessor.prototype.clearSmootherActiveMembership = function clearSmootherActiveMembership(smoother) {
    if (!smoother) {
      return;
    }
    const key = smoother._activeKey;
    if (key) {
      this.activeSmootherKeys.delete(key);
    }
    smoother._activeKey = null;
    smoother._activeDrop = false;
};

NodeLiveAudioProcessor.prototype.activateSmoother = function activateSmoother(key, smoother) {
    if (!smoother || !key) {
      return false;
    }
    if (!smoother.linearSmoothing || !this.smootherNeedsWork(smoother)) {
      return false;
    }
    if (this.activeSmootherKeys.has(key)) {
      return true;
    }
    this.activeSmootherKeys.add(key);
    smoother._activeKey = key;
    smoother._activeDrop = false;
    this.activeSmoothers.push(smoother);
    return true;
};

NodeLiveAudioProcessor.prototype.deactivateSmoother = function deactivateSmoother(key, smoother) {
    if (!key || !this.activeSmootherKeys.has(key)) {
      if (smoother) {
        smoother._activeKey = null;
      }
      return;
    }
    this.activeSmootherKeys.delete(key);
    if (smoother) {
      smoother._activeKey = null;
      // Compact in runActiveSmoothers / finishSmoothing.
      smoother._activeDrop = true;
    }
};

NodeLiveAudioProcessor.prototype.stepSmootherOneSample = function stepSmootherOneSample(smoother, frames) {
    if (!smoother?.linearSmoothing) {
      this.settleSmoother(smoother, { snapFilter: false });
      return false;
    }
    if (!this.smootherNeedsWork(smoother)) {
      this.settleSmoother(smoother);
      return false;
    }
    const smoothingSeconds = this.clampAutoSmoothingSeconds(this.resolveSmoothingSecondsForMode(
      smoother.smoothingMode,
      smoother.smoothingSeconds || 0,
      frames,
      sampleRate,
    ));
    if (smoothingSeconds <= 0) {
      this.settleSmoother(smoother);
      return false;
    }
    const cutoff = this.smoothingFrequencyFromSeconds(smoothingSeconds);
    const signal = typeof nodeGraphParameterSmootherFilterSample === "function"
      ? nodeGraphParameterSmootherFilterSample(smoother, smoother.targetSignal, cutoff, sampleRate)
      : this.onePoleLowpassSample(smoother, smoother.targetSignal, cutoff, sampleRate);
    // When the asymptotic filter lands inside epsilon, snap domain value to the
    // exact target. Without this, lastValue stuck at ~0.999… and deactivation
    // skipped settle (Number Readout never showed 1.00).
    if (!this.smootherNeedsWork(smoother)) {
      this.settleSmoother(smoother);
      return false;
    }
    const value = this.normalizedSignalToParameterValue(signal, smoother.metadata);
    smoother.current = value;
    smoother.lastValue = value;
    return true;
};

NodeLiveAudioProcessor.prototype.runActiveSmoothers = function runActiveSmoothers(frames) {
    const list = this.activeSmoothers;
    if (!list.length) {
      return;
    }
    let write = 0;
    for (let i = 0; i < list.length; i += 1) {
      const smoother = list[i];
      if (!smoother || smoother._activeDrop) {
        this.clearSmootherActiveMembership(smoother);
        continue;
      }
      if (this.stepSmootherOneSample(smoother, frames)) {
        list[write] = smoother;
        write += 1;
      } else {
        this.clearSmootherActiveMembership(smoother);
      }
    }
    list.length = write;
};

NodeLiveAudioProcessor.prototype.updateSmoother = function updateSmoother(smoother, targetValue, metadata = {}, smootherKey = null) {
    const value = Number(targetValue);
    const nextTarget = Number.isFinite(value) ? value : smoother.target;
    const nextType = this.smoothingTypeFromMetadata(metadata);
    const key = smootherKey || smoother._activeKey || null;
    // setParams / setPlan push every knob on every sync. If the domain value
    // did not move, do not rewrite targetSignal (normalize can ulp-jitter)
    // or the linear ramp treats that as a brand-new move and stays dirty.
    if (nextTarget === smoother.target && smoother.smoothingType === nextType) {
      smoother.metadata = metadata || smoother.metadata;
      if (key && this.smootherNeedsWork(smoother)) {
        this.activateSmoother(key, smoother);
      }
      return;
    }
    smoother.target = nextTarget;
    smoother.max = Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : smoother.max;
    smoother.metadata = metadata;
    smoother.min = Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : smoother.min;
    smoother.smoothingMode = this.smoothingModeFromMetadata(metadata);
    smoother.smoothingSeconds = this.smoothingSecondsFromMetadata(metadata);
    if (smoother.smoothingType !== nextType) {
      if (smoother.filterState?.nativeHandle) {
        this.destroyPapoulisParameterSmootherNativeState(smoother);
      }
      smoother.smoothingType = nextType;
      smoother.filterState = null;
      smoother.filterStateType = null;
    } else {
      smoother.smoothingType = nextType;
    }
    smoother.linearSmoothing = typeof nodeGraphParameterSmootherUsesFilter === "function"
      ? nodeGraphParameterSmootherUsesFilter(nextType)
      : (nextType !== "none" && metadata?.linearSmoothing !== false);
    smoother.targetSignal = this.parameterValueToNormalizedSignal(smoother.target, metadata);
    smoother.wraparound = Boolean(metadata?.wraparound);
    if (!smoother.linearSmoothing || !this.smootherNeedsWork(smoother)) {
      this.settleSmoother(smoother);
      if (key) {
        this.deactivateSmoother(key, smoother);
      }
      return;
    }
    if (key) {
      this.activateSmoother(key, smoother);
    }
};

NodeLiveAudioProcessor.prototype.readSmoothedParameter = function readSmoothedParameter(node, key, fallback, frame, frames) {
    const smootherKey = this.parameterKey(node?.id, key);
    const smoother = this.smoothers.get(smootherKey);
    if (!smoother) {
      const value = Number(node?.params?.[key]);
      return Number.isFinite(value) ? value : fallback;
    }
    if (!smoother.linearSmoothing) {
      return smoother.target;
    }
    // Safety: target moved but not yet on the dirty list — lazy one-shot step.
    if (this.smootherNeedsWork(smoother) && !this.activeSmootherKeys.has(smootherKey)) {
      this.activateSmoother(smootherKey, smoother);
      this.stepSmootherOneSample(smoother, frames);
      if (!this.smootherNeedsWork(smoother)) {
        this.deactivateSmoother(smootherKey, smoother);
      }
    }
    return Number.isFinite(smoother.lastValue) ? smoother.lastValue : smoother.target;
};

NodeLiveAudioProcessor.prototype.finishSmoothing = function finishSmoothing() {
    const list = this.activeSmoothers;
    if (list.length) {
      let write = 0;
      for (let i = 0; i < list.length; i += 1) {
        const smoother = list[i];
        if (!smoother || smoother._activeDrop) {
          this.clearSmootherActiveMembership(smoother);
          continue;
        }
        smoother.current = smoother.lastValue ?? smoother.current;
        list[write] = smoother;
        write += 1;
      }
      list.length = write;
    }
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.finishSmoothing();
    }
};

NodeLiveAudioProcessor.prototype.applyParameterBounds = function applyParameterBounds(value, metadata = {}) {
    // DOMAIN only — always honor parameter min/max. MOD uses applyParameterModulation.
    if (typeof nodeGraphParamApplyDomainBounds === "function") {
      return nodeGraphParamApplyDomainBounds(value, metadata);
    }
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return value;
    }
    return metadata.wraparound
      ? this.wrapValue(value, min, max)
      : this.clampValue(value, min, max);
};

/** DOMAIN + MOD → effective domain (linear unit / absolute hybrid via nodeGraphParamApplyMod). */
NodeLiveAudioProcessor.prototype.applyParameterModulation = function applyParameterModulation(base, modulationSignal, metadata = {}) {
    if (typeof nodeGraphParamApplyMod === "function") {
      return nodeGraphParamApplyMod(base, modulationSignal, metadata);
    }
    // Fallback mirrors nodeGraphParamApplyMod (linear unit, no skew).
    const baseN = Number(base);
    const b = Number.isFinite(baseN) ? baseN : 0;
    let mod = Number(modulationSignal);
    if (!Number.isFinite(mod)) {
      mod = 0;
    }
    const bipolar = metadata && Object.hasOwn(metadata, "bipolar")
      ? Boolean(metadata.bipolar)
      : (Number(metadata?.min) < 0 && Number(metadata?.max) > 0);
    if (!bipolar) {
      mod = Math.max(0, mod);
    }
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (Number.isFinite(range) && range > 0 && Math.abs(mod) <= 1 + 1e-9) {
      const unit = ((b - min) / range) + mod;
      const result = min + unit * range;
      return Number.isFinite(result) ? result : 0;
    }
    let result = b + mod;
    if (!Number.isFinite(result)) {
      return 0;
    }
    let shouldClamp = false;
    if (Object.hasOwn(metadata, "modClamp")) {
      shouldClamp = Boolean(metadata.modClamp);
    } else if (metadata.wraparound || metadata.hardClamp === true) {
      shouldClamp = true;
    } else {
      const c = String(metadata.constraint || "").toLowerCase();
      shouldClamp = c === "cpu" || c === "gpu" || c === "ram" || c === "memory";
    }
    return shouldClamp ? this.applyParameterBounds(result, metadata) : result;
};

NodeLiveAudioProcessor.prototype.readRuntimePortOutput = function readRuntimePortOutput(frameValues, nodeId, port = "Out", frame = 0, frames = 1) {
    const node = this.nodes.get(nodeId);
    if (!this.parameterOutputExists(node, port)) {
      return this.readRuntimeOutput(frameValues, nodeId, port);
    }
    const value = this.readSmoothedParameter(node, port, 0, frame, frames);
    return this.normalizeParameterOutputValue(value, node?.paramMeta?.[port] || {});
};

NodeLiveAudioProcessor.prototype.readEffectiveParameter = function readEffectiveParameter(node, key, fallback, frame, frames, frameValues) {
    const base = this.readSmoothedParameter(node, key, fallback, frame, frames);
    const modulations = this.modulationConnections.get(this.parameterKey(node?.id, key));
    // Most parameters have no modulation wired to them at all. Skip the
    // normalize/denormalize round trip (parameterSkewExponent alone runs two
    // Math.log() calls) entirely in that case instead of paying it on every
    // sample for every parameter, modulated or not -- this was the actual
    // per-sample cost behind Sabrina Reverb's real-time audio underruns
    // (measured, not guessed: 8 parameters x this unconditional work was
    // enough to push ctx.currentTime ~5% behind wall-clock).
    if (!modulations || !modulations.length) {
      return base;
    }
    const metadata = node?.paramMeta?.[key] || {};
    const sources = modulations.map((modulation) => this.normalizeParameterModulationInput(this.readRuntimePortOutput(
      frameValues,
      modulation.sourceNode,
      modulation.sourcePort,
      frame,
      frames,
    ), metadata));
    if (typeof nodeGraphParamFoldModSources === "function") {
      return nodeGraphParamFoldModSources(base, sources, metadata);
    }
    return this.applyParameterModulation(base, sources.reduce((a, b) => a + b, 0), metadata);
};

