// Parameter-edit smoother filter kernels.
//
// Smoothing SOURCE (global / internal / off / …) chooses the time constant.
// Smoothing TYPE chooses the filter that chases the target over that time.
//
// Register new types with nodeGraphRegisterParameterSmootherFilter(...).
// Only onePole + papoulis ship today — this is a plug-in point, not a catalog
// of every DSP filter in the sandbox.

const nodeGraphParameterSmootherFilterTypes = Object.freeze(["onePole", "papoulis"]);

function normalizeNodeGraphParameterSmootherFilterType(value) {
  const key = String(value || "").trim();
  return nodeGraphParameterSmootherFilterTypes.includes(key) ? key : "onePole";
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

// ── one-pole (default, matches historical parameter smoothing) ───────────

nodeGraphRegisterParameterSmootherFilter("onePole", {
  createState(initial = 0) {
    return { outputBuffer: Number(initial) || 0 };
  },
  process(state, input, frequency, rate) {
    // Same coefficient path as nodeGraphOnePoleParameterLowpassSample /
    // worklet onePoleLowpassSample (edit-smoothing time → “frequency”).
    const safeRate = Math.max(1, Number(rate) || 44100);
    const safeInput = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);
    const frequencyValue = Math.max(0, Number.isFinite(Number(frequency)) ? Number(frequency) : 0);
    const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
    const a1 = Math.exp(-w);
    const b0 = 1 - a1;
    state.outputBuffer = b0 * safeInput + a1 * (Number(state.outputBuffer) || 0);
    return state.outputBuffer;
  },
  snap(state, target) {
    state.outputBuffer = target;
  },
});

// ── papoulis (Optimum-L order-3 lowpass) ─────────────────────────────────
// Same bilinear prototype as node-graph-papoulis-filter.js / native module:
//   D(s) = (s + 0.6203) * (s^2 + 0.6904s + 0.9308)
// Used as a parameter chase filter: cutoffHz = 1 / smoothingSeconds.

function nodeGraphPapoulisSmootherDesign(cutoffHz, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const safeCutoff = Math.max(0.01, Math.min(rate * 0.49, Number(cutoffHz) || 0));
  const wc = 2 * Math.PI * safeCutoff;
  const k = 2 * rate;
  const p = 0.6203 * wc;
  const poleA0 = k + p;
  const a1s = 0.6904 * wc;
  const a0s = 0.9308 * wc * wc;
  const biquadA0 = k * k + a1s * k + a0s;
  return {
    cutoffHz: safeCutoff,
    sampleRate: rate,
    poleB0: p / poleA0,
    poleB1: p / poleA0,
    poleA1: (p - k) / poleA0,
    biquadB0: a0s / biquadA0,
    biquadB1: (2 * a0s) / biquadA0,
    biquadB2: a0s / biquadA0,
    biquadA1: (2 * a0s - 2 * k * k) / biquadA0,
    biquadA2: (k * k - a1s * k + a0s) / biquadA0,
  };
}

/**
 * Optional native host for worklet audio-thread Papoulis chase.
 * Shape: { ready, create(), sample(handle, input, cutoffHz, rate), snap?(handle, value), destroy(handle) }
 * Set by the AudioWorklet processor when papoulis_filter.wasm is loaded.
 * Offline main-thread smoothing keeps the pure-JS path below.
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
      poleX1: v,
      poleY1: v,
      biquadX1: v,
      biquadX2: v,
      biquadY1: v,
      biquadY2: v,
      outputBuffer: v,
      coeffs: null,
      cutoffHz: NaN,
      sampleRate: NaN,
      // WASM instance handle when host is attached (worklet).
      nativeHandle: 0,
    };
  },
  process(state, input, frequency, rate) {
    // Map the same “frequency = 1/seconds” used by one-pole onto cutoff Hz.
    const cutoffHz = Math.max(0, Number(frequency) || 0);
    const sampleRate = Math.max(1, Number(rate) || 44100);
    const x = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);

    // Prefer native papoulis_filter.wasm on the audio thread when available.
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
            // Keep JS delay mirrors coherent for snap/fallback transitions.
            state.poleX1 = x;
            state.poleY1 = out;
            state.biquadX1 = out;
            state.biquadX2 = out;
            state.biquadY1 = out;
            state.biquadY2 = out;
            return out;
          }
        }
      } catch (_error) {
        nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
        // Fall through to JS.
      }
    }

    if (
      !state.coeffs
      || state.cutoffHz !== cutoffHz
      || state.sampleRate !== sampleRate
    ) {
      state.coeffs = nodeGraphPapoulisSmootherDesign(cutoffHz, sampleRate);
      state.cutoffHz = cutoffHz;
      state.sampleRate = sampleRate;
    }
    const c = state.coeffs;
    const poleOut = c.poleB0 * x + c.poleB1 * state.poleX1 - c.poleA1 * state.poleY1;
    state.poleX1 = x;
    state.poleY1 = poleOut;
    const biquadOut = c.biquadB0 * poleOut
      + c.biquadB1 * state.biquadX1
      + c.biquadB2 * state.biquadX2
      - c.biquadA1 * state.biquadY1
      - c.biquadA2 * state.biquadY2;
    state.biquadX2 = state.biquadX1;
    state.biquadX1 = poleOut;
    state.biquadY2 = state.biquadY1;
    state.biquadY1 = biquadOut;
    state.outputBuffer = biquadOut;
    return biquadOut;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    const host = nodeGraphPapoulisParameterSmootherNativeHost;
    if (state.nativeHandle && host?.snap) {
      try {
        host.snap(state.nativeHandle, v);
        // Legacy host.snap may destroy the instance when snap export is missing.
        if (!host.hasSnapExport) {
          state.nativeHandle = 0;
        }
      } catch (_error) {
        nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
      }
    } else if (state.nativeHandle) {
      nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
    }
    state.poleX1 = v;
    state.poleY1 = v;
    state.biquadX1 = v;
    state.biquadX2 = v;
    state.biquadY1 = v;
    state.biquadY2 = v;
    state.outputBuffer = v;
  },
  destroy(state) {
    nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
  },
});
