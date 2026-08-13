// Look-ahead brickwall limiter — pure math (main + worklet).
// Detect on undelayed peak, delay audio by look-ahead, apply gain, hard clamp.
// Stereo-linked (max |L|,|R|).
//
// Look-ahead is an explicit delay (modulatable like Sample Delay). No host
// delay compensation — the delay is part of the sound, not hidden.

/** Max look-ahead ring (samples). ~100 ms @ 96 kHz. */
const NODE_GRAPH_LOOKAHEAD_LIMITER_MAX_SAMPLES = 16384;

function createNodeGraphLookaheadLimiterState() {
  const max = NODE_GRAPH_LOOKAHEAD_LIMITER_MAX_SAMPLES;
  return {
    delayL: new Float32Array(max),
    delayR: new Float32Array(max),
    pos: 0,
    cap: max,
    gain: 1,
    env: 0,
  };
}

function nodeGraphLookaheadLimiterDbToGain(db) {
  const d = Number(db);
  if (!Number.isFinite(d)) return 1;
  return Math.pow(10, d * (1 / 20));
}

/**
 * @param {object} state
 * @param {number} left
 * @param {number} right
 * @param {number} ceilingDb  e.g. -0.3
 * @param {number} lookaheadMs
 * @param {number} lookaheadSamples  added to ms (like Sample Delay)
 * @param {number} attackMs  gain attack toward reduction (0 = instant)
 * @param {number} releaseMs gain release (default 100)
 * @param {number} sampleRate
 * @param {number} [lookaheadEnabled]  >0.5 = use look-ahead delay; else delay is 0
 * @returns {{ Out: number, Left: number, Right: number, Gain: number }}
 */
function nodeGraphLookaheadLimiterFrame(
  state,
  left,
  right,
  ceilingDb,
  lookaheadMs,
  lookaheadSamples,
  attackMs,
  releaseMs,
  sampleRate,
  lookaheadEnabled,
) {
  if (!state || !state.delayL) {
    const x = Number(left) || 0;
    const y = Number(right) || 0;
    return { Out: 0.5 * (x + y), Left: x, Right: y, Gain: 1 };
  }

  const rate = Math.max(1, Number(sampleRate) || 44100);
  const lIn = Number(left) || 0;
  const rIn = Number(right) || 0;
  const ceiling = Math.max(1e-6, nodeGraphLookaheadLimiterDbToGain(ceilingDb));

  const laOn = lookaheadEnabled == null ? true : Number(lookaheadEnabled) > 0.5;
  const laFromMs = laOn ? Math.max(0, Number(lookaheadMs) || 0) * 0.001 * rate : 0;
  const laFromSamples = laOn ? Math.max(0, Number(lookaheadSamples) || 0) : 0;
  let la = Math.round(laFromMs + laFromSamples);
  if (!Number.isFinite(la) || la < 0) la = 0;
  if (la > state.cap - 1) la = state.cap - 1;

  // Envelope on undelayed peak (attack/release follower).
  const peak = Math.max(Math.abs(lIn), Math.abs(rIn));
  const attMs = Math.max(0, Number(attackMs) || 0);
  const relMs = Math.max(0, Number(releaseMs) || 100);
  // Attack toward higher env (fast when reducing), release toward lower env.
  const attCoeff = attMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, attMs * 0.001 * rate));
  const relCoeff = relMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, relMs * 0.001 * rate));
  if (peak > state.env) {
    state.env += attCoeff * (peak - state.env);
  } else {
    state.env += relCoeff * (peak - state.env);
  }
  if (state.env < 1e-25) state.env = 0;

  let targetGain = 1;
  if (state.env > ceiling) {
    targetGain = ceiling / state.env;
  }
  // One-pole on gain (attack when reducing = follow attCoeff; release = relCoeff).
  if (targetGain < state.gain) {
    state.gain += attCoeff * (targetGain - state.gain);
  } else {
    state.gain += relCoeff * (targetGain - state.gain);
  }
  if (!Number.isFinite(state.gain) || state.gain < 0) state.gain = 0;
  if (state.gain > 1) state.gain = 1;

  // Write undelayed audio into ring.
  const pos = state.pos;
  state.delayL[pos] = lIn;
  state.delayR[pos] = rIn;
  // Read delayed sample (look-ahead).
  let readPos = pos - la;
  const cap = state.cap;
  readPos %= cap;
  if (readPos < 0) readPos += cap;
  let dL = state.delayL[readPos];
  let dR = state.delayR[readPos];
  state.pos = (pos + 1) % cap;

  const g = state.gain;
  dL *= g;
  dR *= g;
  // Hard brickwall clamp at ceiling (true ceiling, not "almost").
  if (dL > ceiling) dL = ceiling;
  else if (dL < -ceiling) dL = -ceiling;
  if (dR > ceiling) dR = ceiling;
  else if (dR < -ceiling) dR = -ceiling;
  if (!Number.isFinite(dL)) dL = 0;
  if (!Number.isFinite(dR)) dR = 0;

  return {
    Out: 0.5 * (dL + dR),
    Left: dL,
    Right: dR,
    Gain: g,
  };
}
