// Shared XY pad signal math (UI + offline + worklet). Pure; no DOM.
//
// Audio / phosphor path (per axis):
//   sig = bipolar(Phase) + Input CV
//   → Filter Order: Papoulis then lattice, or lattice then Papoulis
//   → Out (and the same sample feeds the phosphor drawer)
// Papoulis is native wasm only (no JS filter).

/**
 * Center-based quantize level from the 0..1 amount.
 *   0  → off (free continuous position)
 *   1  → center only (always snap to 0.5)
 *   2+ → half-steps from center to each edge = level−1
 *        so 0.5 is always a lattice point (e.g. 2 → 0 / 0.5 / 1)
 */
function nodeGraphXyPadDspQuantizeLevels(quantize) {
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  if (q <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(q * 16));
}

/** @deprecated alias — returns center-based levels (0 = off). */
function nodeGraphXyPadDspDivisions(quantize) {
  return nodeGraphXyPadDspQuantizeLevels(quantize);
}

function nodeGraphXyPadDspQuantizeUnit(value, quantize) {
  const levels = nodeGraphXyPadDspQuantizeLevels(quantize);
  const v = Number(value);
  const unit = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  if (levels <= 0) {
    return unit;
  }
  // Level 1: single center line / snap target.
  if (levels === 1) {
    return 0.5;
  }
  // Grow outward from center: k ∈ [−half, +half], unit = 0.5 + k * (0.5 / half).
  const halfSteps = levels - 1;
  const step = 0.5 / halfSteps;
  const k = Math.round((unit - 0.5) / step);
  const clampedK = Math.max(-halfSteps, Math.min(halfSteps, k));
  return 0.5 + clampedK * step;
}

function nodeGraphXyPadDspUnitToBipolar(unit) {
  const u = Number(unit);
  return Number.isFinite(u) ? u * 2 - 1 : 0;
}

function nodeGraphXyPadDspBipolarToUnit(bipolar) {
  const b = Number(bipolar);
  if (!Number.isFinite(b)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (b + 1) * 0.5));
}

/** 0 = off; (0..1] maps 60 Hz (light) → 2 Hz (heavy). */
function nodeGraphXyPadDspPapoulisCutoffHz(amount) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  if (a <= 1e-4) {
    return 0;
  }
  const logMin = Math.log(2);
  const logMax = Math.log(60);
  return Math.exp(logMax + a * (logMin - logMax));
}

function nodeGraphXyPadDspQuantizeBipolar(bipolar, quantizeAmount) {
  if ((Number(quantizeAmount) || 0) <= 0) {
    return bipolar;
  }
  return nodeGraphXyPadDspUnitToBipolar(
    nodeGraphXyPadDspQuantizeUnit(nodeGraphXyPadDspBipolarToUnit(bipolar), quantizeAmount),
  );
}

/**
 * One axis of the audio chain.
 * filterSample must be native Papoulis only (or null = dry when Papoulis requested).
 * No JS Papoulis path.
 */
function nodeGraphXyPadDspProcessAxis(sig, opts = {}) {
  const cutoff = Math.max(0, Number(opts.cutoff) || 0);
  const smoothOn = cutoff > 0;
  const quantizeAmt = Number(opts.quantizeAmt) || 0;
  const order = Math.max(0, Math.min(1, Math.round(Number(opts.order) || 0)));
  const filterSample = typeof opts.filterSample === "function" ? opts.filterSample : null;

  const applyPapoulis = (value) => {
    if (!smoothOn || !filterSample) {
      return value;
    }
    return filterSample(value);
  };

  if (smoothOn && quantizeAmt > 0) {
    if (order === 0) {
      return nodeGraphXyPadDspQuantizeBipolar(applyPapoulis(sig), quantizeAmt);
    }
    return applyPapoulis(nodeGraphXyPadDspQuantizeBipolar(sig, quantizeAmt));
  }
  if (smoothOn) {
    return applyPapoulis(sig);
  }
  return nodeGraphXyPadDspQuantizeBipolar(sig, quantizeAmt);
}

/** Pad axes that must never use the shared param smoother. */
const nodeGraphXyPadDspUnsmoothedParamKeys = Object.freeze(["x", "y", "xPhase", "yPhase"]);

function nodeGraphXyPadDspIsUnsmoothedParamKey(key) {
  return nodeGraphXyPadDspUnsmoothedParamKeys.includes(String(key || ""));
}
