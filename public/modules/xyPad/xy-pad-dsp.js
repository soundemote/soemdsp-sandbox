// Shared XY pad signal math (UI + offline + worklet). Pure; no DOM.
//
// Audio / phosphor path (per axis):
//   sig = bipolar(Phase) + Input CV
//   → Filter Order: Papoulis then lattice, or lattice then Papoulis
//   → Out (and the same sample feeds the phosphor drawer)
// Papoulis is native wasm only (no JS filter).

function nodeGraphXyPadDspDivisions(quantize) {
  const q = Math.max(0, Math.min(1, Number(quantize) || 0));
  return q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
}

function nodeGraphXyPadDspQuantizeUnit(value, quantize) {
  const divisions = nodeGraphXyPadDspDivisions(quantize);
  const v = Number(value);
  const unit = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  if (divisions <= 1) {
    return unit;
  }
  const step = 1 / divisions;
  return Math.max(0, Math.min(1, Math.round(unit / step) * step));
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
