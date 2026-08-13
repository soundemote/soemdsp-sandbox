// Comb Resonator — delay+feedback (or feedforward) comb with pitch from delay length.
// Scientific sibling of Mode Resonator (poles). Not a waveguide network.
//
// Feedback:  y[n] = amp·x[n] + s·g · LPF(y[n−D])
// Feedforward: y[n] = amp·x[n] + s·depth · x[n−D]
//
// D = fs / f0 (fractional). Integer ring + 1st-order Thiran allpass for the
// fractional sample — |H|=1 so loop gain g stays accurate (unlike lerp-in-loop).
// Positive-feedback peaks at k·f0; negative: (k+½)·f0.
// Decay τ (s to 1/e): g = exp(−D/(τ·fs)); Hold → g ≈ 1.
// Damping: one-pole LPF in the loop (KS-style loss); 0 = pure comb.

const NODE_GRAPH_COMB_RESONATOR_MIN_HZ = 10;
const NODE_GRAPH_COMB_RESONATOR_MAX_SECONDS = 0.12; // ≥ 1/minHz + headroom

function createNodeGraphCombResonatorState() {
  return {
    buffer: null,
    capacity: 0,
    writeIndex: 0,
    filled: 0,
    lp: 0,
    // 1st-order Thiran fractional-delay state
    thiranX1: 0,
    thiranY1: 0,
    _lastTrig: 0,
  };
}

function nodeGraphCombResonatorEnsureBuffer(state, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const capacity = Math.max(
    64,
    Math.min(768000, Math.ceil(rate * NODE_GRAPH_COMB_RESONATOR_MAX_SECONDS) + 8),
  );
  if (!(state.buffer instanceof Float32Array) || state.capacity !== capacity) {
    state.buffer = new Float32Array(capacity);
    state.capacity = capacity;
    state.writeIndex = 0;
    state.filled = 0;
    state.lp = 0;
    state.thiranX1 = 0;
    state.thiranY1 = 0;
  }
  return { capacity, rate };
}

/**
 * Feedback magnitude from decay time (seconds to 1/e) and loop length D samples.
 * g = exp(−D/(τ·fs)) so after τ seconds the round-trip envelope is 1/e.
 */
function nodeGraphCombResonatorFeedbackGain(decaySec, delaySamples, sampleRate, hold) {
  if (hold) return 1 - 1e-12;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const D = Math.max(1, Number(delaySamples) || 1);
  const tau = Math.max(1e-6, Number(decaySec) || 1e-6);
  let g = Math.exp(-D / (tau * rate));
  if (!(g >= 0) || !Number.isFinite(g)) g = 0;
  if (g > 1 - 1e-12) g = 1 - 1e-12;
  return g;
}

/** Integer tap: sample written delayInt steps ago (writeIndex = next write). */
function nodeGraphCombResonatorReadInt(state, delayInt) {
  const capacity = state.capacity;
  const buf = state.buffer;
  if (!buf || capacity < 2 || state.filled <= 0) return 0;
  let d = delayInt | 0;
  if (d < 1) d = 1;
  if (d > capacity - 2) d = capacity - 2;
  let i = state.writeIndex - d;
  i %= capacity;
  if (i < 0) i += capacity;
  return buf[i] || 0;
}

/**
 * 1st-order Thiran allpass fractional delay (0 ≤ frac < 1 samples).
 * H(z) = (a + z^{−1}) / (1 + a z^{−1}), a = (1−δ)/(1+δ), |H|=1.
 * When frac≈0, pure passthrough (no extra delay).
 */
function nodeGraphCombResonatorThiran(state, x, frac) {
  let d = Number(frac) || 0;
  if (d < 1e-12) {
    // Keep state continuous but add no delay.
    state.thiranX1 = x;
    state.thiranY1 = x;
    return x;
  }
  if (d > 0.999999) d = 0.999999;
  const a = (1 - d) / (1 + d);
  const y = a * x + state.thiranX1 - a * state.thiranY1;
  state.thiranX1 = x;
  state.thiranY1 = Number.isFinite(y) ? y : 0;
  if (!Number.isFinite(y)) {
    state.thiranX1 = 0;
    state.thiranY1 = 0;
    return 0;
  }
  return y;
}

/**
 * Fractional delay read: integer ring of floor(D) + Thiran of {D}.
 * Total delay ≈ D samples with unity magnitude (safe in feedback).
 */
function nodeGraphCombResonatorReadFrac(state, delaySamples) {
  const capacity = state.capacity;
  if (!state.buffer || capacity < 2) return 0;

  let D = Number(delaySamples) || 0;
  if (D < 2) D = 2;
  if (D > capacity - 2) D = capacity - 2;

  const dInt = Math.floor(D);
  const frac = D - dInt;
  const integer = nodeGraphCombResonatorReadInt(state, dInt);
  return nodeGraphCombResonatorThiran(state, integer, frac);
}

/**
 * One-pole lowpass in loop. damping 0 = bypass, 1 = heavy averaging.
 * No DC blocker in the loop — that would steal energy and falsify Decay.
 */
function nodeGraphCombResonatorLoopFilter(state, x, damping) {
  const d = Math.max(0, Math.min(1, Number(damping) || 0));
  if (d <= 1e-9) {
    state.lp = x;
    return x;
  }
  const coef = d * d;
  const a = 1 - coef;
  state.lp += a * (x - state.lp);
  if (!Number.isFinite(state.lp)) state.lp = 0;
  return state.lp;
}

/**
 * @param {number} topology 0 = feedback, 1 = feedforward
 * @param {number} invert 0 = +, 1 = − (sign of delayed term)
 * @param {number} depth 0..1 amount for feedforward (ignored in feedback; decay sets g)
 */
function nodeGraphCombResonatorSample(
  state,
  input,
  frequencyHz,
  decaySec,
  hold,
  damping,
  topology,
  invert,
  depth,
  amplitude,
  sampleRate,
) {
  if (!state || typeof state !== "object") return 0;
  const { capacity, rate } = nodeGraphCombResonatorEnsureBuffer(state, sampleRate);

  const f0 = Math.max(
    NODE_GRAPH_COMB_RESONATOR_MIN_HZ,
    Math.min(rate * 0.499, Number(frequencyHz) || NODE_GRAPH_COMB_RESONATOR_MIN_HZ),
  );
  // Continuous pitch: D = fs/f0 (fractional). Thiran handles the sub-sample.
  let delaySamples = rate / f0;
  if (delaySamples < 2) delaySamples = 2;
  if (delaySamples > capacity - 2) delaySamples = capacity - 2;

  const amp = Number.isFinite(Number(amplitude)) ? Number(amplitude) : 1;
  const x = (Number(input) || 0) * amp;
  const sign = Math.round(Number(invert) || 0) !== 0 ? -1 : 1;
  const isFf = Math.round(Number(topology) || 0) !== 0;

  let y;
  if (isFf) {
    const delayed = nodeGraphCombResonatorReadFrac(state, delaySamples);
    const amt = Math.max(0, Math.min(1, Number(depth) || 0));
    y = x + sign * amt * delayed;
  } else {
    const delayed = nodeGraphCombResonatorReadFrac(state, delaySamples);
    const fb = nodeGraphCombResonatorLoopFilter(state, delayed, damping);
    const g = nodeGraphCombResonatorFeedbackGain(decaySec, delaySamples, rate, hold);
    y = x + sign * g * fb;
  }

  if (!Number.isFinite(y)) y = 0;
  if (y > 1) y = 1;
  else if (y < -1) y = -1;
  if (y > -1e-30 && y < 1e-30) y = 0;

  // Feedback writes the clipped output so the loop cannot explode.
  // Feedforward writes the (unclipped) input history.
  state.buffer[state.writeIndex] = isFf ? x : y;

  state.writeIndex = (state.writeIndex + 1) % capacity;
  if (state.filled < capacity) state.filled += 1;

  return y;
}

/** Rising-edge trigger → unit impulse this sample (adds to audio in). */
function nodeGraphCombResonatorTriggerEdge(state, trigger, threshold = 0.5) {
  if (!state || typeof state !== "object") return 0;
  if (state._lastTrig == null) state._lastTrig = 0;
  const t = Number(trigger) || 0;
  const on = t > threshold;
  const edge = on && !state._lastTrig;
  state._lastTrig = on ? 1 : 0;
  return edge ? 1 : 0;
}
