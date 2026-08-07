// Papoulis (Optimum-L) order-3 lowpass — used to smooth live XY draw input.
//
// Order-2 Papoulis is identical to Butterworth (both reduce to s^2 + sqrt(2)s + 1),
// so order 3 is the lowest order where Papoulis actually differs: faster roll-off
// than Butterworth while staying monotonic (no ripple/overshoot), which is what you
// want smoothing a drawn path — jitter gets cut harder without the trace overshooting
// past where the mouse actually went.
//
// Normalized (cutoff = 1 rad/s) analog prototype, from Papoulis (1958):
//   D(s) = (s + 0.6203) * (s^2 + 0.6904s + 0.9308)
// Each factor is designed here with unity DC gain individually so the cascade's
// overall DC gain is exactly 1.

function papoulisLowpass3BilinearPole(pole, cutoffHz, sampleRate) {
  const wc = 2 * Math.PI * Math.max(0, cutoffHz);
  const k = 2 * sampleRate;
  const p = pole * wc;
  const a0 = k + p;
  return {
    b0: p / a0,
    b1: p / a0,
    a1: (p - k) / a0,
  };
}

function papoulisLowpass3BilinearBiquad(alpha, beta, cutoffHz, sampleRate) {
  const wc = 2 * Math.PI * Math.max(0, cutoffHz);
  const k = 2 * sampleRate;
  const a1s = alpha * wc;
  const a0s = beta * wc * wc;
  const a0 = k * k + a1s * k + a0s;
  return {
    b0: a0s / a0,
    b1: (2 * a0s) / a0,
    b2: a0s / a0,
    a1: (2 * a0s - 2 * k * k) / a0,
    a2: (k * k - a1s * k + a0s) / a0,
  };
}

function designPapoulisLowpass3(cutoffHz, sampleRate) {
  return {
    pole: papoulisLowpass3BilinearPole(0.6203, cutoffHz, sampleRate),
    biquad: papoulisLowpass3BilinearBiquad(0.6904, 0.9308, cutoffHz, sampleRate),
  };
}

function createPapoulisLowpass3State() {
  return {
    poleX1: 0,
    poleY1: 0,
    biquadX1: 0,
    biquadX2: 0,
    biquadY1: 0,
    biquadY2: 0,
  };
}

function papoulisLowpass3Process(state, coeffs, input) {
  const poleOut = coeffs.pole.b0 * input + coeffs.pole.b1 * state.poleX1 - coeffs.pole.a1 * state.poleY1;
  state.poleX1 = input;
  state.poleY1 = poleOut;

  const { b0, b1, b2, a1, a2 } = coeffs.biquad;
  const biquadOut = b0 * poleOut + b1 * state.biquadX1 + b2 * state.biquadX2 - a1 * state.biquadY1 - a2 * state.biquadY2;
  state.biquadX2 = state.biquadX1;
  state.biquadX1 = poleOut;
  state.biquadY2 = state.biquadY1;
  state.biquadY1 = biquadOut;

  return biquadOut;
}

function papoulisLowpass3Snap(state, value) {
  const v = Number(value) || 0;
  state.poleX1 = v;
  state.poleY1 = v;
  state.biquadX1 = v;
  state.biquadX2 = v;
  state.biquadY1 = v;
  state.biquadY2 = v;
}

// ── Shared mouse-path smoother (PrettyScope / Phosphillator pattern) ──────
// Papoulis chase on pointer samples with a 0..1 amount control:
//   0 = almost raw (high cutoff), 1 = heavy smooth (low cutoff).
// Nominal sample rate is pointer-event rate (~120 Hz), not audio rate.

const nodeGraphMouseSmoothCaptureRateHz = 120;
const nodeGraphMouseSmoothMinCutoffHz = 2;
const nodeGraphMouseSmoothMaxCutoffHz = 60;

function nodeGraphMouseSmoothCutoffHz(amount) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  const logMin = Math.log(nodeGraphMouseSmoothMinCutoffHz);
  const logMax = Math.log(nodeGraphMouseSmoothMaxCutoffHz);
  return Math.exp(logMax + a * (logMin - logMax));
}

function createNodeGraphMouseSmoothState(initialX = 0, initialY = 0) {
  const x = Number(initialX) || 0;
  const y = Number(initialY) || 0;
  const stateX = createPapoulisLowpass3State();
  const stateY = createPapoulisLowpass3State();
  papoulisLowpass3Snap(stateX, x);
  papoulisLowpass3Snap(stateY, y);
  return {
    amount: NaN,
    coeffs: null,
    stateX,
    stateY,
    x,
    y,
  };
}

/** (Re)design coeffs for amount and seed filters at (x, y). */
function nodeGraphMouseSmoothBegin(state, amount, x, y) {
  if (!state) {
    return createNodeGraphMouseSmoothState(x, y);
  }
  const ax = Number.isFinite(Number(x)) ? Number(x) : (state.x || 0);
  const ay = Number.isFinite(Number(y)) ? Number(y) : (state.y || 0);
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  state.amount = a;
  state.coeffs = a <= 1e-4
    ? null
    : designPapoulisLowpass3(nodeGraphMouseSmoothCutoffHz(a), nodeGraphMouseSmoothCaptureRateHz);
  papoulisLowpass3Snap(state.stateX, ax);
  papoulisLowpass3Snap(state.stateY, ay);
  state.x = ax;
  state.y = ay;
  return state;
}

/**
 * Filter one pointer sample. amount 0 → passthrough.
 * If amount changes mid-gesture, coeffs are redesigned (state carries over).
 */
function nodeGraphMouseSmoothPoint(state, x, y, amount) {
  const ax = Number(x) || 0;
  const ay = Number(y) || 0;
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  if (!state || a <= 1e-4) {
    if (state) {
      state.x = ax;
      state.y = ay;
      state.amount = a;
      state.coeffs = null;
    }
    return { x: ax, y: ay };
  }
  if (state.amount !== a || !state.coeffs) {
    state.amount = a;
    state.coeffs = designPapoulisLowpass3(
      nodeGraphMouseSmoothCutoffHz(a),
      nodeGraphMouseSmoothCaptureRateHz,
    );
  }
  state.x = papoulisLowpass3Process(state.stateX, state.coeffs, ax);
  state.y = papoulisLowpass3Process(state.stateY, state.coeffs, ay);
  return { x: state.x, y: state.y };
}

// Module-facing API for the standalone Papoulis Filter node — mirrors the
// createNodeGraphXState()/nodeGraphXSample() naming convention used by
// passiveFilter/cookbookFilter/ladderFilter so it plugs into the same
// per-node state-map dispatch pattern in the live evaluator and worklet.

function createNodeGraphPapoulisFilterState() {
  return {
    filter: createPapoulisLowpass3State(),
    coeffs: null,
    cutoffHz: NaN,
    sampleRate: NaN,
  };
}

function nodeGraphPapoulisFilterSample(state, input, cutoffHz, sampleRate) {
  // Param may be 0 (frozen LP). Tiny floor only for bilinear design stability.
  const raw = Number(cutoffHz);
  const safeCutoff = Math.max(0, Math.min(sampleRate * 0.49, Number.isFinite(raw) ? raw : 0));
  const designCutoff = Math.max(1e-6, safeCutoff);
  if (state.cutoffHz !== designCutoff || state.sampleRate !== sampleRate) {
    state.coeffs = designPapoulisLowpass3(designCutoff, sampleRate);
    state.cutoffHz = designCutoff;
    state.sampleRate = sampleRate;
  }
  return papoulisLowpass3Process(state.filter, state.coeffs, Number(input) || 0);
}

function nodeGraphPapoulisFilterMagnitudeAt(cutoffHz, frequency, sampleRate) {
  const raw = Number(cutoffHz);
  const safeCutoff = Math.max(0, Math.min(sampleRate * 0.49, Number.isFinite(raw) ? raw : 0));
  const designCutoff = Math.max(1e-6, safeCutoff);
  const coeffs = designPapoulisLowpass3(designCutoff, sampleRate);
  const omega = (2 * Math.PI * Math.max(0, frequency)) / Math.max(1, sampleRate);
  const zRe = Math.cos(omega);
  const zIm = -Math.sin(omega);

  const poleNumRe = coeffs.pole.b0 + coeffs.pole.b1 * zRe;
  const poleNumIm = coeffs.pole.b1 * zIm;
  const poleDenRe = 1 + coeffs.pole.a1 * zRe;
  const poleDenIm = coeffs.pole.a1 * zIm;
  const poleDenMagSq = poleDenRe * poleDenRe + poleDenIm * poleDenIm;
  const poleMag = Math.sqrt((poleNumRe * poleNumRe + poleNumIm * poleNumIm) / Math.max(1e-12, poleDenMagSq));

  const z2Re = zRe * zRe - zIm * zIm;
  const z2Im = 2 * zRe * zIm;
  const { b0, b1, b2, a1, a2 } = coeffs.biquad;
  const biquadNumRe = b0 + b1 * zRe + b2 * z2Re;
  const biquadNumIm = b1 * zIm + b2 * z2Im;
  const biquadDenRe = 1 + a1 * zRe + a2 * z2Re;
  const biquadDenIm = a1 * zIm + a2 * z2Im;
  const biquadDenMagSq = biquadDenRe * biquadDenRe + biquadDenIm * biquadDenIm;
  const biquadMag = Math.sqrt(
    (biquadNumRe * biquadNumRe + biquadNumIm * biquadNumIm) / Math.max(1e-12, biquadDenMagSq),
  );

  return poleMag * biquadMag;
}
