// Yellow Graph / Additive: quantum DOMAIN chase.
// Smooths in DOMAIN (not unit 0…1) so missing min/max in paramMeta cannot
// collapse every value to unit 0 and snap instantly (that broke Harmonics).
//
// This file is loaded on BOTH:
//   - main thread (index.html) — only nodeGraphAdditiveReadParam is needed
//   - AudioWorklet blob — NodeLiveAudioProcessor.prototype methods attach here
// Guard prototype writes so main-thread boot does not throw
// "NodeLiveAudioProcessor is not defined" and abort later UI scripts.

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

if (typeof NodeLiveAudioProcessor === "function") {
  NodeLiveAudioProcessor.prototype.ensureAdditiveParamSmoothers = function ensureAdditiveParamSmoothers() {
    if (!this.additiveParamSmoothers) {
      this.additiveParamSmoothers = new Map();
    }
    return this.additiveParamSmoothers;
  };

  /** Fill missing min/max so callers still have guides (not required for domain lerp). */
  NodeLiveAudioProcessor.prototype.additiveParamMetaWithDefaults = function additiveParamMetaWithDefaults(
    node,
    key,
  ) {
    const meta = { ...(node?.paramMeta?.[key] || {}) };
    const min = Number(meta.min);
    const max = Number(meta.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
      // Worklet may omit full meta on partial updates — keep Harmonics usable.
      if (key === "harmonics") {
        meta.min = Number.isFinite(min) ? min : 1;
        meta.max = Number.isFinite(max) && max > meta.min ? max : 1024;
        if (!Number.isFinite(Number(meta.mid))) meta.mid = 32;
      }
    }
    return meta;
  };

  /**
   * Resolve one Additive param to effective DOMAIN for this quantum.
   * Domain-space linear ramp over the resolved smoothing time.
   */
  NodeLiveAudioProcessor.prototype.additiveEffectiveParam = function additiveEffectiveParam(
    node,
    key,
    fallback,
    blockFrames,
  ) {
    const raw = Number(node?.params?.[key]);
    let target = Number.isFinite(raw) ? raw : fallback;
    // Efficient path: fold Knob/Bias MOD (controllers published by controller peel).
    if (typeof this.foldEfficientParamModulations === "function") {
      target = this.foldEfficientParamModulations(node, key, target);
    }

    const metadata = this.additiveParamMetaWithDefaults
      ? this.additiveParamMetaWithDefaults(node, key)
      : (node?.paramMeta?.[key] || {});

    let smoothingType = typeof this.smoothingTypeFromMetadata === "function"
      ? this.smoothingTypeFromMetadata(metadata)
      : (metadata.linearSmoothing === false ? "none" : "linear");
    let mode = typeof this.smoothingModeFromMetadata === "function"
      ? this.smoothingModeFromMetadata(metadata)
      : String(metadata.smoothingMode || "global");

    const map = this.ensureAdditiveParamSmoothers();
    const smootherKey = `additive:${String(node?.id || "")}:${String(key || "")}`;

    // Respect Off / none / instant — snap to target (no secret Additive override).
    const typeOff = smoothingType === "none" || smoothingType === "off" || smoothingType === "instant";
    const modeOff = mode === "off";
    if (typeOff || modeOff) {
      let state = map.get(smootherKey);
      if (!state) {
        state = {
          value: target,
          target,
          rampFrom: target,
          rampSamples: 0,
          rampDuration: 0,
          seconds: 0,
        };
        map.set(smootherKey, state);
      } else {
        state.value = target;
        state.target = target;
        state.rampFrom = target;
        state.rampSamples = 0;
        state.rampDuration = 0;
      }
      return target;
    }

    if (typeof nodeGraphParameterSmootherGpuSafeType === "function") {
      smoothingType = nodeGraphParameterSmootherGpuSafeType(smoothingType);
    } else if (String(smoothingType || "").toLowerCase() === "papoulis") {
      smoothingType = "threePole";
    }

    const smoothingSamples = typeof this.smoothingSecondsFromMetadata === "function"
      ? this.smoothingSecondsFromMetadata(metadata)
      : 0;
    const frames = Math.max(1, Number(blockFrames) || 128);
    const rate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);

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

    // Defaults only when smoothing is ON and time is unset.
    const additiveDefault = 0.0333;
    if (!(seconds > 0)) {
      seconds = typeof nodeGraphModuleSmoothingDefaultSeconds === "function"
        ? Math.max(additiveDefault, nodeGraphModuleSmoothingDefaultSeconds())
        : additiveDefault;
    }

    let state = map.get(smootherKey);
    if (!state) {
      state = {
        value: target,
        target,
        rampFrom: target,
        rampSamples: 0,
        rampDuration: 0,
        seconds,
      };
      map.set(smootherKey, state);
      return target;
    }

    const eps = 1e-9;
    const targetChanged = Math.abs(target - state.target) > eps;
    const durationSamples = Math.max(1, Math.round(rate * seconds));

    if (targetChanged) {
      state.rampFrom = state.value;
      state.target = target;
      state.rampSamples = 0;
      state.rampDuration = durationSamples;
      state.seconds = seconds;
    } else if (Math.abs((state.seconds || 0) - seconds) > 1e-6 && state.rampDuration > 0) {
      // Smoothing time edited mid-ramp — keep progress, retarget duration.
      const oldDur = Math.max(1, state.rampDuration);
      const progress = Math.min(1, state.rampSamples / oldDur);
      state.rampDuration = durationSamples;
      state.rampSamples = Math.floor(progress * durationSamples);
      state.seconds = seconds;
    }

    if (state.rampDuration <= 0 || Math.abs(state.value - state.target) <= eps) {
      state.value = state.target;
      return state.value;
    }

    state.rampSamples += frames;
    if (state.rampSamples >= state.rampDuration) {
      state.value = state.target;
      state.rampFrom = state.target;
      return state.value;
    }
    const t = state.rampSamples / state.rampDuration;
    state.value = state.rampFrom + (state.target - state.rampFrom) * t;
    return state.value;
  };
}
