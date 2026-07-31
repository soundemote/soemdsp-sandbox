// Parameter-edit smoother filter kernels.
//
// Smoothing SOURCE (global / internal / off / …) chooses the time constant.
// Smoothing TYPE chooses the filter that chases the target over that time.
//
// Register new types with nodeGraphRegisterParameterSmootherFilter(...).
// Types: linear (instant), onePole (1P), twoPole (2P), papoulis (Π / Optimum-L).
// linear replaces the old linearSmoothing=false checkbox.

const nodeGraphParameterSmootherFilterTypes = Object.freeze([
  "linear",
  "onePole",
  "twoPole",
  "papoulis",
]);

function normalizeNodeGraphParameterSmootherFilterType(value) {
  const key = String(value || "").trim();
  if (key === "L" || key === "l" || key === "none" || key === "off" || key === "instant") {
    return "linear";
  }
  if (key === "2P" || key === "2p" || key === "twoPole" || key === "two-pole" || key === "2pole") {
    return "twoPole";
  }
  if (key === "1P" || key === "1p") {
    return "onePole";
  }
  return nodeGraphParameterSmootherFilterTypes.includes(key) ? key : "onePole";
}

/** True when the parameter should glide (not snap). Derived from smoothing type. */
function nodeGraphParameterSmootherUsesFilter(typeOrMetadata) {
  const type = typeof typeOrMetadata === "object" && typeOrMetadata
    ? normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata.smoothingType)
    : normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata);
  return type !== "linear";
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
  if (!impl) {
    smoother.outputBuffer = Number(input) || 0;
    return smoother.outputBuffer;
  }
  const out = impl.process(state, Number(input) || 0, Number(cutoffHz) || 0, Number(sampleRate) || 44100);
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

// ── linear (instant; no filter — was linearSmoothing=false) ──────────────

nodeGraphRegisterParameterSmootherFilter("linear", {
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
