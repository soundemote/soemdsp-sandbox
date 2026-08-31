// Parameter-edit smoother filter kernels.
//
// Smoothing SOURCE (global / internal / off / …) chooses the time constant.
// Smoothing TYPE chooses the filter that chases the target over that time.
//
// GPU migration proof: each type exposes processN(state, x, cutoff, rate, N) —
// closed-form O(1) block advance for linear/1P/2P/3P (held target). Papoulis
// stays CPU/wasm-only; GPU / Additive use nodeGraphParameterSmootherGpuSafeType
// (Π → 3P). Quantum / Control block paths should call
// nodeGraphParameterSmootherFilterAdvance, not a JS sample for-loop.
//
// Register new types with nodeGraphRegisterParameterSmootherFilter(...).
// Types:
//   linear    — time-based linear lerp (L): always takes the full smoothing time
//   onePole   — exponential chase (1P)
//   twoPole   — cascaded one-poles (2P)
//   threePole — cascaded one-poles ×3 (3P): steeper than 2P, no overshoot
//   papoulis  — Optimum-L order-3 (Π); can overshoot on steps
//   none      — instant snap (legacy linearSmoothing=false; not a UI L button)
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
  "threePole",
  "papoulis",
  "none",
]);

function normalizeNodeGraphParameterSmootherFilterType(value) {
  const key = String(value || "").trim();
  // Instant / no filter (discrete params, legacy linearSmoothing=false).
  if (key === "none" || key === "off" || key === "instant") {
    return "none";
  }
  const lower = key.toLowerCase();
  if (lower === "linear" || lower === "lin" || lower === "l" || lower === "lerp") {
    return "linear";
  }
  if (lower === "onepole" || lower === "1p" || lower === "one-pole" || lower === "1pole") {
    return "onePole";
  }
  if (lower === "twopole" || lower === "2p" || lower === "two-pole" || lower === "2pole") {
    return "twoPole";
  }
  if (lower === "threepole" || lower === "3p" || lower === "three-pole" || lower === "3pole") {
    return "threePole";
  }
  if (lower === "papoulis" || lower === "pi" || lower === "π") {
    return "papoulis";
  }
  return "linear";
}

/** True when the parameter should glide (not snap). Derived from smoothing type. */
function nodeGraphParameterSmootherUsesFilter(typeOrMetadata) {
  const type = typeof typeOrMetadata === "object" && typeOrMetadata
    ? normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata.smoothingType)
    : normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata);
  return type !== "none";
}

/**
 * GPU / efficient Additive: Papoulis (Π) is wasm-only and not in the GPU set.
 * Map Π → 3P (closest steeper real-pole chase). CPU Control rails keep real Π.
 */
function nodeGraphParameterSmootherGpuSafeType(typeOrMetadata) {
  const type = typeof typeOrMetadata === "object" && typeOrMetadata
    ? normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata.smoothingType)
    : normalizeNodeGraphParameterSmootherFilterType(typeOrMetadata);
  return type === "papoulis" ? "threePole" : type;
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
 * Prefer nodeGraphParameterSmootherFilterAdvance for block/quantum jumps
 * (GPU-shaped: one closed-form N-step update per param).
 * @returns {number} smoothed normalized signal (0..1-ish parameter space)
 */
function nodeGraphParameterSmootherFilterSample(smoother, input, cutoffHz, sampleRate) {
  return nodeGraphParameterSmootherFilterAdvance(smoother, input, cutoffHz, sampleRate, 1);
}

/**
 * Advance N samples in one call (held target). GPU migration proof:
 * linear / 1P / 2P / 3P use closed-form O(1); Papoulis uses native block
 * advance when available, else N× sample (same end state as a Control buffer).
 * @returns {number} end-of-block smoothed normalized signal
 */
function nodeGraphParameterSmootherFilterAdvance(smoother, input, cutoffHz, sampleRate, frames) {
  const type = normalizeNodeGraphParameterSmootherFilterType(
    smoother?.smoothingType || smoother?.metadata?.smoothingType,
  );
  const impl = nodeGraphParameterSmootherFilterImpl(type);
  const state = nodeGraphEnsureParameterSmootherFilterState(smoother, type);
  const target = Number(input) || 0;
  const n = Math.max(0, Math.floor(Number(frames) || 0));
  if (!impl || n <= 0) {
    if (!impl) {
      smoother.outputBuffer = target;
    }
    return smoother.outputBuffer ?? target;
  }
  const cutoff = Number(cutoffHz) || 0;
  const rate = Number(sampleRate) || 44100;
  let out;
  if (typeof impl.processN === "function") {
    out = impl.processN(state, target, cutoff, rate, n);
  } else {
    out = Number(state.outputBuffer) || 0;
    for (let i = 0; i < n; i += 1) {
      out = impl.process(state, target, cutoff, rate);
    }
  }
  // Precision floor: non-linear filters never hit the target; snap when close.
  if (Math.abs(out - target) <= nodeGraphParameterSmootherConvergenceEpsilon) {
    if (impl.snap) {
      impl.snap(state, target);
    } else {
      state.outputBuffer = target;
    }
    out = target;
  }
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

/** Shared: retarget linear ramp state for a held target (0 samples advanced). */
function nodeGraphParameterSmootherLinearPrepare(state, input, frequency, rate) {
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
    return { target, done: true };
  }
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
    const oldDur = Math.max(1, Number(state.rampDuration) || durationSamples);
    const progress = Math.min(1, (Number(state.rampSamples) || 0) / oldDur);
    state.rampDuration = durationSamples;
    state.rampSamples = Math.floor(progress * durationSamples);
  }
  if (Math.abs(prev - target) <= nodeGraphParameterSmootherConvergenceEpsilon
    && (Number(state.rampSamples) || 0) >= (Number(state.rampDuration) || 0)) {
    state.outputBuffer = target;
    return { target, done: true };
  }
  return { target, done: false, durationSamples };
}

/** Closed-form: jump rampSamples by N, emit end value (GPU-shaped). */
function nodeGraphParameterSmootherLinearAdvanceN(state, input, frequency, rate, frames) {
  const prep = nodeGraphParameterSmootherLinearPrepare(state, input, frequency, rate);
  const target = prep.target;
  if (prep.done || frames <= 0) {
    return target;
  }
  const duration = Math.max(1, Number(state.rampDuration) || prep.durationSamples || 1);
  state.rampSamples = (Number(state.rampSamples) || 0) + frames;
  if (state.rampSamples >= duration) {
    state.outputBuffer = target;
    state.rampFrom = target;
    state.rampTo = target;
    return target;
  }
  const from = Number.isFinite(Number(state.rampFrom)) ? Number(state.rampFrom) : (Number(state.outputBuffer) || 0);
  const out = from + (target - from) * (state.rampSamples / duration);
  state.outputBuffer = out;
  return out;
}

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
    return nodeGraphParameterSmootherLinearAdvanceN(state, input, frequency, rate, 1);
  },
  processN(state, input, frequency, rate, frames) {
    return nodeGraphParameterSmootherLinearAdvanceN(state, input, frequency, rate, frames);
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
  processN(state, input) {
    const x = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);
    state.outputBuffer = x;
    return x;
  },
  snap(state, target) {
    state.outputBuffer = Number(target) || 0;
  },
});

/** Shared one-pole coeffs (must match historical worklet / Control path). */
function nodeGraphParameterSmootherOnePoleCoeffs(frequency, rate) {
  const safeRate = Math.max(1, Number(rate) || 44100);
  const frequencyValue = Math.max(0, Number.isFinite(Number(frequency)) ? Number(frequency) : 0);
  const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
  const a1 = Math.exp(-w);
  return { a1, b0: 1 - a1 };
}

/** Shared one-pole step used by 1P and cascaded 2P/3P. */
function nodeGraphParameterSmootherOnePoleStep(stateKey, state, input, frequency, rate) {
  const prev = Number(state[stateKey]) || 0;
  const safeInput = Number.isFinite(Number(input)) ? Number(input) : prev;
  const { a1, b0 } = nodeGraphParameterSmootherOnePoleCoeffs(frequency, rate);
  const out = b0 * safeInput + a1 * prev;
  state[stateKey] = out;
  return out;
}

/**
 * Closed-form N-step advance for cascaded identical one-poles (step input).
 * stages: mutable array [s1, s2, …, sOut]; last entry is the audible output.
 * GPU-shaped: one pow + O(poles) arithmetic, not N sample loops.
 */
function nodeGraphParameterSmootherCascadedOnePoleAdvanceN(stages, input, frequency, rate, frames) {
  const n = Math.max(0, Math.floor(Number(frames) || 0));
  const x = Number.isFinite(Number(input)) ? Number(input) : (Number(stages[stages.length - 1]) || 0);
  if (n <= 0) {
    return Number(stages[stages.length - 1]) || 0;
  }
  const { a1 } = nodeGraphParameterSmootherOnePoleCoeffs(frequency, rate);
  if (!(a1 > 0) || a1 >= 1) {
    for (let i = 0; i < stages.length; i += 1) {
      stages[i] = x;
    }
    return x;
  }
  const aN = Math.pow(a1, n);
  const oneMinus = 1 - a1;
  const errors = stages.map((s) => (Number(s) || 0) - x);
  // Identical-pole cascade step responses (derived from the sample recurrence).
  // 1P: e1' = e1 * a^n
  // 2P: e2' = a^n * (e2 + n(1-a)e1)
  // 3P: e3' = a^n * (e3 + n(1-a)e2 + n(n+1)/2 (1-a)^2 e1)
  const next = new Array(errors.length);
  if (errors.length >= 1) {
    next[0] = errors[0] * aN;
  }
  if (errors.length >= 2) {
    next[1] = aN * (errors[1] + n * oneMinus * errors[0]);
  }
  if (errors.length >= 3) {
    next[2] = aN * (
      errors[2]
      + n * oneMinus * errors[1]
      + (n * (n + 1) * 0.5) * oneMinus * oneMinus * errors[0]
    );
  }
  // 4+ poles not used; fall back would be sample loop — keep stages ≤ 3.
  for (let i = 0; i < stages.length; i += 1) {
    stages[i] = x + (next[i] || 0);
  }
  return stages[stages.length - 1];
}

// ── one-pole (default, matches historical parameter smoothing) ───────────

nodeGraphRegisterParameterSmootherFilter("onePole", {
  createState(initial = 0) {
    return { outputBuffer: Number(initial) || 0 };
  },
  process(state, input, frequency, rate) {
    return nodeGraphParameterSmootherOnePoleStep("outputBuffer", state, input, frequency, rate);
  },
  processN(state, input, frequency, rate, frames) {
    const stages = [Number(state.outputBuffer) || 0];
    const out = nodeGraphParameterSmootherCascadedOnePoleAdvanceN(
      stages, input, frequency, rate, frames,
    );
    state.outputBuffer = out;
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
    return nodeGraphParameterSmootherOnePoleStep("outputBuffer", state, s1, frequency, rate);
  },
  processN(state, input, frequency, rate, frames) {
    const stages = [Number(state.stage1) || 0, Number(state.outputBuffer) || 0];
    const out = nodeGraphParameterSmootherCascadedOnePoleAdvanceN(
      stages, input, frequency, rate, frames,
    );
    state.stage1 = stages[0];
    state.outputBuffer = out;
    return out;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    state.stage1 = v;
    state.outputBuffer = v;
  },
});

// ── three-pole: cascaded one-poles (3× same coeff) ───────────────────────
// Steeper than 2P; all-real poles ⇒ no step overshoot (unlike Papoulis).

nodeGraphRegisterParameterSmootherFilter("threePole", {
  createState(initial = 0) {
    const v = Number(initial) || 0;
    return {
      stage1: v,
      stage2: v,
      outputBuffer: v,
    };
  },
  process(state, input, frequency, rate) {
    const s1 = nodeGraphParameterSmootherOnePoleStep("stage1", state, input, frequency, rate);
    const s2 = nodeGraphParameterSmootherOnePoleStep("stage2", state, s1, frequency, rate);
    return nodeGraphParameterSmootherOnePoleStep("outputBuffer", state, s2, frequency, rate);
  },
  processN(state, input, frequency, rate, frames) {
    const stages = [
      Number(state.stage1) || 0,
      Number(state.stage2) || 0,
      Number(state.outputBuffer) || 0,
    ];
    const out = nodeGraphParameterSmootherCascadedOnePoleAdvanceN(
      stages, input, frequency, rate, frames,
    );
    state.stage1 = stages[0];
    state.stage2 = stages[1];
    state.outputBuffer = out;
    return out;
  },
  snap(state, target) {
    const v = Number(target) || 0;
    state.stage1 = v;
    state.stage2 = v;
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
  // GPU path wants host.sampleN / block advance. Until that exists, N× sample
  // matches Control-buffer truth (deterministic; not a JS filter reimpl).
  processN(state, input, frequency, rate, frames) {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    const host = nodeGraphPapoulisParameterSmootherNativeHost;
    const x = Number.isFinite(Number(input)) ? Number(input) : (state.outputBuffer || 0);
    if (n <= 0) {
      return Number(state.outputBuffer) || 0;
    }
    if (host?.ready && host.sampleN && host.create) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = host.create() || 0;
        }
        if (state.nativeHandle) {
          const out = Number(host.sampleN(
            state.nativeHandle, x, Math.max(0, Number(frequency) || 0),
            Math.max(1, Number(rate) || 44100), n,
          ));
          if (Number.isFinite(out)) {
            state.outputBuffer = out;
            return out;
          }
        }
      } catch (_error) {
        nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
      }
    }
    let out = Number(state.outputBuffer) || 0;
    for (let i = 0; i < n; i += 1) {
      out = this.process(state, input, frequency, rate);
    }
    return out;
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
