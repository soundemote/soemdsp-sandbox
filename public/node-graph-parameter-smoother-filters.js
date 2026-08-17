// Parameter-edit smoother filter kernels.
//
// Smoothing SOURCE (global / internal / off / …) chooses the time constant.
// Smoothing TYPE chooses the filter that chases the target over that time.
//
// Register new types with nodeGraphRegisterParameterSmootherFilter(...).
// Types:
//   linear   — time-based linear lerp (L): always takes the full smoothing time
//   onePole  — exponential chase (1P)
//   twoPole  — cascaded one-poles (2P)
//   papoulis — Optimum-L order-3 (Π)
//   none     — instant snap (legacy linearSmoothing=false; not a UI L button)
//
// Smoothing SOURCE (global / internal / off) still chooses the time constant.
// SOURCE=off snaps. Unset / 0 per-module time uses the shared 0.0333 s default.

/** App-wide default for per-module (internal) parameter smoothing. */
const NODE_GRAPH_MODULE_SMOOTHING_DEFAULT_SECONDS = 0.0333;

function nodeGraphModuleSmoothingDefaultSeconds() {
  const n = Number(NODE_GRAPH_MODULE_SMOOTHING_DEFAULT_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 0.0333;
}

// One-pole / multi-pole smoothers asymptote toward the target and never quite
// land. When |out − target| is within Planck, snap exactly so knobs read 1.00
// and Number Readout settles. Same floor as silence/idle/dirty-near.
const nodeGraphParameterSmootherConvergenceEpsilon =
  typeof NODE_GRAPH_PLANCK === "number" ? NODE_GRAPH_PLANCK : 1e-7;

const nodeGraphParameterSmootherFilterTypes = Object.freeze([
  "linear",
  "onePole",
  "twoPole",
  "papoulis",
  "none",
]);

function normalizeNodeGraphParameterSmootherFilterType(value) {
  const key = String(value || "").trim();
  // Instant / no filter (discrete params, legacy linearSmoothing=false).
  if (key === "none" || key === "off" || key === "instant" || key === "0") {
    return "none";
  }
  // CPU experiment: only linear ramps. onePole / twoPole / papoulis parked.
  return "linear";
}

/** True when the parameter should glide (not snap). Derived from smoothing type. */
function nodeGraphParameterSmootherUsesFilter(typeOrMetadata) {
  const type = typeof typeOrMetadata === "object" && typeOrMetadata
    ? normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata.smoothingType)
    : normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata);
  return type !== "none";
}

// Legacy alias used in some metadata paths.
function normalizeNodeGraphMetadataSmoothingType(value) {
  return normalizeNodeGraphParameterSmootherFilterType(value);
}

const nodeGraphParameterSmootherFilterRegistry = Object.create(null);

function nodeGraphRegisterParameterSmootherFilter(type, implementation) {
  const key = String(type || "").trim();
  if (!key || !implementation || typeof implementation.process !== "function") {
    return;
  }
  nodeGraphParameterSmootherFilterRegistry[key] = implementation;
}

function nodeGraphParameterSmootherFilterImpl(type) {
  const key = normalizeNodeGraphParameterSmootherFilterType(type);
  return nodeGraphParameterSmootherFilterRegistry[key]
    || nodeGraphParameterSmootherFilterRegistry.onePole
    || null;
}

function nodeGraphEnsureParameterSmootherFilterState(smoother, type) {
  const key = normalizeNodeGraphParameterSmootherFilterType(type);
  if (!smoother.filterState || smoother.filterStateType !== key) {
    const impl = nodeGraphParameterSmootherFilterImpl(key);
    smoother.filterStateType = key;
    smoother.filterState = impl?.createState
      ? impl.createState(smoother.outputBuffer ?? 0)
      : { outputBuffer: smoother.outputBuffer ?? 0 };
  }
  return smoother.filterState;
}

/**
 * Advance one sample of parameter-edit smoothing.
 * @returns {number} smoothed normalized signal (0..1-ish parameter space)
 */
function nodeGraphParameterSmootherFilterSample(smoother, input, cutoffHz, sampleRate) {
  const type = normalizeNodeGraphParameterSmootherFilterType(
    smoother?.smoothingType || smoother?.metadata?.smoothingType,
  );
  const impl = nodeGraphParameterSmootherFilterImpl(type);
  const state = nodeGraphEnsureParameterSmootherFilterState(smoother, type);
  const target = Number(input) || 0;
  if (!impl) {
    smoother.outputBuffer = target;
    return smoother.outputBuffer;
  }
  let out = impl.process(state, target, Number(cutoffHz) || 0, Number(sampleRate) || 44100);
  // Precision floor: non-linear filters never hit the target; snap when close.
  if (Math.abs(out - target) <= nodeGraphParameterSmootherConvergenceEpsilon) {
    if (impl.snap) {
      impl.snap(state, target);
    } else {
      state.outputBuffer = target;
    }
    out = target;
  }
  // Keep the legacy one-pole field in sync for needsWork / settle checks.
  smoother.outputBuffer = out;
  return out;
}

function nodeGraphParameterSmootherFilterSnap(smoother, targetSignal) {
  const type = normalizeNodeGraphParameterSmootherFilterType(
    smoother?.smoothingType || smoother?.metadata?.smoothingType,
  );
  const impl = nodeGraphParameterSmootherFilterImpl(type);
  const state = nodeGraphEnsureParameterSmootherFilterState(smoother, type);
  const target = Number(targetSignal) || 0;
  if (impl?.snap) {
    impl.snap(state, target);
  } else {
    state.outputBuffer = target;
  }
  smoother.outputBuffer = target;
}

// ── linear (time-based lerp over smoothing time) ─────────────────────────
// Host passes frequency = 1/seconds (same mapping as 1P). When the target
// changes, the value lerps from the current output to that target over
// exactly `seconds` — independent of distance (0.01-range and full-range
// moves both take the full smoothing time). Cheap and exact.

nodeGraphRegisterParameterSmootherFilter("linear", {
  createState(initial = 0) {
    const v = Number(initial) || 0;
    return {
      outputBuffer: v,
      rampFrom: v,
      rampTo: v,
      rampSamples: 0,
      rampDuration: 0,
    };
  },
  process(state, input, frequency, rate) {
    const prev = Number(state.outputBuffer) || 0;
    const target = Number.isFinite(Number(input)) ? Number(input) : prev;
    const safeRate = Math.max(1, Number(rate) || 44100);
    const freq = Math.max(0, Number(frequency) || 0);
    if (freq <= 0) {
      state.outputBuffer = target;
      state.rampFrom = target;
      state.rampTo = target;
      state.rampSamples = 0;
      state.rampDuration = 0;
      return target;
    }
    // seconds = 1/freq → sample count for a complete move.
    const durationSamples = Math.max(1, Math.round(safeRate / freq));
    const prevTarget = Number(state.rampTo);
    const targetChanged = !Number.isFinite(prevTarget)
      || Math.abs(prevTarget - target) > nodeGraphParameterSmootherConvergenceEpsilon;
    if (targetChanged) {
      state.rampFrom = prev;
      state.rampTo = target;
      state.rampSamples = 0;
      state.rampDuration = durationSamples;
    } else if (
      (Number(state.rampDuration) || 0) > 0
      && (Number(state.rampDuration) || 0) !== durationSamples
    ) {
      // Smooth Time changed mid-ramp: keep progress ratio, retarget length.
      const oldDur = Math.max(1, Number(state.rampDuration) || durationSamples);
      const progress = Math.min(1, (Number(state.rampSamples) || 0) / oldDur);
      state.rampDuration = durationSamples;
      state.rampSamples = Math.floor(progress * durationSamples);
    }

    // Already at target (e.g. after settle).
    if (Math.abs(prev - target) <= nodeGraphParameterSmootherConvergenceEpsilon
      && (Number(state.rampSamples) || 0) >= (Number(state.rampDuration) || 0)) {
      state.outputBuffer = target;
      return target;
    }

    state.rampSamples = (Number(state.rampSamples) || 0) + 1;
    const duration = Math.max(1, Number(state.rampDuration) || durationSamples);
    if (state.rampSamples >= duration) {
      state.outputBuffer = target;
      state.rampFrom = target;
      state.rampTo = target;
      return target;
    }
    const t = state.rampSamples / duration;
    const from = Number.isFinite(Number(state.rampFrom)) ? Number(state.rampFrom) : prev;
    const out = from + (target - from) * t;
    state.outputBuffer = out;
    return out;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    state.outputBuffer = v;
    state.rampFrom = v;
    state.rampTo = v;
    state.rampSamples = 0;
    state.rampDuration = 0;
  },
});

// ── none (instant snap — was linearSmoothing=false / mislabeled “linear”) ─

nodeGraphRegisterParameterSmootherFilter("none", {
  createState(initial = 0) {
    return { outputBuffer: Number(initial) || 0 };
  },
  process(state, input) {
    const x = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);
    state.outputBuffer = x;
    return x;
  },
  snap(state, target) {
    state.outputBuffer = Number(target) || 0;
  },
});

/** Shared one-pole step used by 1P and cascaded 2P. */
function nodeGraphParameterSmootherOnePoleStep(stateKey, state, input, frequency, rate) {
  const safeRate = Math.max(1, Number(rate) || 44100);
  const prev = Number(state[stateKey]) || 0;
  const safeInput = Number.isFinite(Number(input)) ? Number(input) : prev;
  const frequencyValue = Math.max(0, Number.isFinite(Number(frequency)) ? Number(frequency) : 0);
  const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  const out = b0 * safeInput + a1 * prev;
  state[stateKey] = out;
  return out;
}

// ── one-pole (default, matches historical parameter smoothing) ───────────

nodeGraphRegisterParameterSmootherFilter("onePole", {
  createState(initial = 0) {
    return { outputBuffer: Number(initial) || 0 };
  },
  process(state, input, frequency, rate) {
    // Same coefficient path as nodeGraphOnePoleParameterLowpassSample /
    // worklet onePoleLowpassSample (edit-smoothing time → “frequency”).
    const out = nodeGraphParameterSmootherOnePoleStep("outputBuffer", state, input, frequency, rate);
    return out;
  },
  snap(state, target) {
    state.outputBuffer = target;
  },
});

// ── two-pole: cascaded one-poles (2× same coeff) ──────────────────────────
// Between 1P cost/feel and 3rd-order Papoulis: steeper settle, modest CPU.

nodeGraphRegisterParameterSmootherFilter("twoPole", {
  createState(initial = 0) {
    const v = Number(initial) || 0;
    return {
      stage1: v,
      outputBuffer: v,
    };
  },
  process(state, input, frequency, rate) {
    const s1 = nodeGraphParameterSmootherOnePoleStep("stage1", state, input, frequency, rate);
    const out = nodeGraphParameterSmootherOnePoleStep("outputBuffer", state, s1, frequency, rate);
    return out;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    state.stage1 = v;
    state.outputBuffer = v;
  },
});

// ── papoulis (parameter chase) ───────────────────────────────────────────
// Native papoulis_filter.wasm only. No JS filter reimplementation.
// Host is bound by the AudioWorklet when wasm is ready. Without host: dry.

/**
 * Shape: { ready, create(), sample(handle, input, cutoffHz, rate), snap?(handle, value), destroy(handle) }
 */
let nodeGraphPapoulisParameterSmootherNativeHost = null;

function nodeGraphSetPapoulisParameterSmootherNativeHost(host) {
  nodeGraphPapoulisParameterSmootherNativeHost = host && typeof host === "object" ? host : null;
}

function nodeGraphGetPapoulisParameterSmootherNativeHost() {
  return nodeGraphPapoulisParameterSmootherNativeHost;
}

function nodeGraphDestroyPapoulisParameterSmootherNativeState(state) {
  if (!state?.nativeHandle) {
    return;
  }
  const host = nodeGraphPapoulisParameterSmootherNativeHost;
  if (host?.destroy) {
    try {
      host.destroy(state.nativeHandle);
    } catch (_error) {
      // Best-effort.
    }
  }
  state.nativeHandle = 0;
}

nodeGraphRegisterParameterSmootherFilter("papoulis", {
  createState(initial = 0) {
    const v = Number(initial) || 0;
    return {
      outputBuffer: v,
      nativeHandle: 0,
    };
  },
  process(state, input, frequency, rate) {
    const cutoffHz = Math.max(0, Number(frequency) || 0);
    const sampleRate = Math.max(1, Number(rate) || 44100);
    const x = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);
    const host = nodeGraphPapoulisParameterSmootherNativeHost;
    if (host?.ready && host.create && host.sample) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = host.create() || 0;
        }
        if (state.nativeHandle) {
          const out = Number(host.sample(state.nativeHandle, x, cutoffHz, sampleRate));
          if (Number.isFinite(out)) {
            state.outputBuffer = out;
            return out;
          }
        }
      } catch (_error) {
        nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
      }
    }
    // No native host / failure: dry (no JS Papoulis).
    state.outputBuffer = x;
    return x;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    const host = nodeGraphPapoulisParameterSmootherNativeHost;
    if (state.nativeHandle && host?.snap) {
      try {
        host.snap(state.nativeHandle, v);
        if (!host.hasSnapExport) {
          state.nativeHandle = 0;
        }
      } catch (_error) {
        nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
      }
    } else if (state.nativeHandle) {
      nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
    }
    state.outputBuffer = v;
  },
  destroy(state) {
    nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
  },
});
