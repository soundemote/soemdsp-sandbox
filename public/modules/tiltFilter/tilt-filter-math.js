// Tilt Filter — pure math (main thread + AudioWorklet).
//
// First-order spectral tilt around a pivot frequency.
// Positive Amount: darker lows / brighter highs (and the reverse when negative).
//
// Implementation: cascade of Robin Schmidt (RS-MET) first-order bilinear
// low-shelf and high-shelf with complementary linear gains so the low↔high
// span equals Amount (dB) while the geometric mean stays near unity.
//
// Credit: Robin Schmidt / RS-MET (rapt OnePoleFilter shelf BLT formulas)
// https://github.com/RobinSchmidt/RS-MET
//
// Not the same as a 1-pole HP/LP "tame" (see Passive Filter, ~6 dB/oct).
// A true continuous 3 dB/oct slope would be fractional-order; tilt is the
// usual musical control for gentle spectral balance.

const nodeGraphTiltFilterAmountDefault = 0;
const nodeGraphTiltFilterPivotDefault = 1000;

function createNodeGraphTiltFilterState() {
  return {
    // Low-shelf state (x[n-1], y[n-1])
    lx1: 0,
    ly1: 0,
    // High-shelf state
    hx1: 0,
    hy1: 0,
  };
}

function createNodeGraphStereoTiltFilterState() {
  return {
    left: createNodeGraphTiltFilterState(),
    mono: createNodeGraphTiltFilterState(),
    right: createNodeGraphTiltFilterState(),
  };
}

function nodeGraphTiltFilterSafeTanHalfOmega(omega) {
  // omega = 2*pi*f/fs in (0, pi). Clamp away from Nyquist so tan stays finite.
  const half = Math.max(1e-9, Math.min(omega * 0.5, Math.PI * 0.499));
  return Math.tan(half);
}

/**
 * Robin Schmidt rsFirstOrderFilterBase::coeffsLowShelfBLT
 * y = b0*x + b1*x1 + a1*y1  (positive feedback-sign convention)
 */
function nodeGraphTiltFilterLowShelfCoeffs(omega, linearGain) {
  const g = Math.max(1e-6, Number(linearGain) || 1);
  let t = nodeGraphTiltFilterSafeTanHalfOmega(omega);
  t = g >= 1 ? (t - 1) / (t + 1) : (t - g) / (t + g);
  let c = 0.5 * (g - 1);
  c += c * t;
  return {
    b0: 1 + c,
    b1: t + c,
    a1: -t,
  };
}

/**
 * Robin Schmidt rsFirstOrderFilterBase::coeffsHighShelfBLT
 */
function nodeGraphTiltFilterHighShelfCoeffs(omega, linearGain) {
  const g = Math.max(1e-6, Number(linearGain) || 1);
  let t = nodeGraphTiltFilterSafeTanHalfOmega(omega);
  t = g >= 1 ? (t - 1) / (t + 1) : (g * t - 1) / (g * t + 1);
  let c = 0.5 * (g - 1);
  c -= c * t;
  return {
    b0: 1 + c,
    b1: t - c,
    a1: -t,
  };
}

function nodeGraphTiltFilterOnePole(stateXKey, stateYKey, state, input, coeffs) {
  const x = Number(input) || 0;
  const y = coeffs.b0 * x + coeffs.b1 * state[stateXKey] + coeffs.a1 * state[stateYKey];
  state[stateXKey] = x;
  state[stateYKey] = y;
  return y;
}

/**
 * @param {{ lx1:number, ly1:number, hx1:number, hy1:number }} state
 * @param {number} input
 * @param {number} amountDb  positive = brighter (cut lows / boost highs)
 * @param {number} pivotHz
 * @param {number} sampleRate
 */
function nodeGraphTiltFilterSample(state, input, amountDb, pivotHz, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const amount = Number(amountDb) || 0;
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-12) {
    // Bypass path still advances nothing meaningful — keep state quiet.
    return Number(input) || 0;
  }

  // 0 Hz pivot allowed; only non-negative + Nyquist. Tiny floor is for tan() only.
  const rawPivot = Number(pivotHz);
  const freq = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawPivot) ? rawPivot : 0));
  const omega = (2 * Math.PI * Math.max(freq, 1e-9)) / rate;

  // Half the dB on each side so low↔high span == amountDb.
  // A = 10^(amount/40): low shelf gets 1/A, high shelf gets A when amount > 0.
  const halfLinear = Math.pow(10, amount / 40);
  const lowGain = 1 / halfLinear;
  const highGain = halfLinear;

  const low = nodeGraphTiltFilterLowShelfCoeffs(omega, lowGain);
  const high = nodeGraphTiltFilterHighShelfCoeffs(omega, highGain);

  const afterLow = nodeGraphTiltFilterOnePole("lx1", "ly1", state, input, low);
  return nodeGraphTiltFilterOnePole("hx1", "hy1", state, afterLow, high);
}
