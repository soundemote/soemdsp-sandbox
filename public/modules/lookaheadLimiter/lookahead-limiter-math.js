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
    // Cached control-derived values (rebuild only when controls change).
    controlsValid: false,
    lastCeilingDb: NaN,
    lastAttackMs: NaN,
    lastReleaseMs: NaN,
    lastSampleRate: NaN,
    lastLookaheadMs: NaN,
    lastLookaheadSamples: NaN,
    lastLookaheadEnabled: NaN,
    lastDipGain: NaN,
    ceiling: 1,
    makeup: 1,
    attCoeff: 1,
    relCoeff: 1,
    lookaheadSamplesResolved: 0,
    dipGainCached: 1,
  };
}

function nodeGraphLookaheadLimiterDbToGain(db) {
  const d = Number(db);
  if (!Number.isFinite(d)) return 1;
  return Math.pow(10, d * (1 / 20));
}

function nodeGraphLookaheadLimiterSyncControls(
  state,
  ceilingDb,
  lookaheadMs,
  lookaheadSamples,
  attackMs,
  releaseMs,
  sampleRate,
  lookaheadEnabled,
  dipGain,
) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const ceilDb = Number(ceilingDb);
  const attMs = Math.max(0, Number(attackMs) || 0);
  const relMs = Math.max(0, Number(releaseMs) || 100);
  const laMs = Number(lookaheadMs) || 0;
  const laSamp = Number(lookaheadSamples) || 0;
  const laEn = lookaheadEnabled == null ? 1 : Number(lookaheadEnabled);
  const dip = Number(dipGain);
  const dipSafe = Number.isFinite(dip) ? dip : 1;

  const dirty =
    !state.controlsValid
    || ceilDb !== state.lastCeilingDb
    || attMs !== state.lastAttackMs
    || relMs !== state.lastReleaseMs
    || rate !== state.lastSampleRate
    || laMs !== state.lastLookaheadMs
    || laSamp !== state.lastLookaheadSamples
    || laEn !== state.lastLookaheadEnabled
    || dipSafe !== state.lastDipGain;

  if (!dirty) return;

  state.lastCeilingDb = ceilDb;
  state.lastAttackMs = attMs;
  state.lastReleaseMs = relMs;
  state.lastSampleRate = rate;
  state.lastLookaheadMs = laMs;
  state.lastLookaheadSamples = laSamp;
  state.lastLookaheadEnabled = laEn;
  state.lastDipGain = dipSafe;
  state.controlsValid = true;

  state.ceiling = Math.max(1e-6, nodeGraphLookaheadLimiterDbToGain(ceilDb));
  state.makeup = 1 / state.ceiling;
  state.attCoeff = attMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, attMs * 0.001 * rate));
  state.relCoeff = relMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, relMs * 0.001 * rate));
  state.dipGainCached = dipSafe;

  const laOn = laEn > 0.5;
  const laFromMs = laOn ? Math.max(0, laMs) * 0.001 * rate : 0;
  const laFromSamples = laOn ? Math.max(0, laSamp) : 0;
  let la = Math.round(laFromMs + laFromSamples);
  if (!Number.isFinite(la) || la < 0) la = 0;
  if (la > state.cap - 1) la = state.cap - 1;
  state.lookaheadSamplesResolved = la;
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
 * @param {number} [gainCompensation]  >0.5 = makeup −ceiling so limited peaks hit 0 dBFS
 * @param {number} [dipGain]  over-reduction exponent (1 = exact brickwall, 2 = twice the dB cut)
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
  gainCompensation,
  dipGain,
) {
  if (!state || !state.delayL) {
    const x = Number(left) || 0;
    const y = Number(right) || 0;
    return { Out: 0.5 * (x + y), Left: x, Right: y, Gain: 1 };
  }

  nodeGraphLookaheadLimiterSyncControls(
    state,
    ceilingDb,
    lookaheadMs,
    lookaheadSamples,
    attackMs,
    releaseMs,
    sampleRate,
    lookaheadEnabled,
    dipGain,
  );

  const lIn = Number(left) || 0;
  const rIn = Number(right) || 0;
  const ceiling = state.ceiling;
  const la = state.lookaheadSamplesResolved;
  const attCoeff = state.attCoeff;
  const relCoeff = state.relCoeff;

  // Envelope on undelayed peak (attack/release follower).
  const peak = Math.max(Math.abs(lIn), Math.abs(rIn));
  if (peak > state.env) {
    state.env += attCoeff * (peak - state.env);
  } else {
    state.env += relCoeff * (peak - state.env);
  }
  if (state.env < 1e-25) state.env = 0;

  let targetGain = 1;
  if (state.env > ceiling) {
    targetGain = ceiling / state.env;
    const dip = state.dipGainCached;
    if (dip !== 1 && targetGain < 1) {
      targetGain = Math.pow(targetGain, dip);
    }
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
  if (Number(gainCompensation) > 0.5) {
    dL *= state.makeup;
    dR *= state.makeup;
  }
  if (!Number.isFinite(dL)) dL = 0;
  if (!Number.isFinite(dR)) dR = 0;

  return {
    Out: 0.5 * (dL + dR),
    Left: dL,
    Right: dR,
    Gain: g,
  };
}

/**
 * Musical Limiter — look-ahead delay + threshold/ratio GR.
 * Detect from Sidechain when wired, else from the input-gained audio.
 * Env out = detector envelope 0…1. Amplitude is a final output trim (no autogain).
 */
function createNodeGraphPumpingLimiterState() {
  const state = createNodeGraphLookaheadLimiterState();
  state.meanSquare = 0;
  return state;
}

function nodeGraphPumpingLimiterFrame(
  state,
  left,
  right,
  sidechain,
  hasSidechain,
  inputGainDb,
  thresholdDb,
  ratio,
  lookaheadMs,
  lookaheadSamples,
  attackMs,
  releaseMs,
  sampleRate,
  lookaheadEnabled,
  amplitude,
) {
  if (!state || !state.delayL) {
    const x = Number(left) || 0;
    const y = Number(right) || 0;
    return { Out: 0.5 * (x + y), Left: x, Right: y, Gain: 1, Env: 0 };
  }

  const rate = Math.max(1, Number(sampleRate) || 44100);
  const inGain = nodeGraphLookaheadLimiterDbToGain(
    Number.isFinite(Number(inputGainDb)) ? Number(inputGainDb) : 0,
  );
  const lIn = (Number(left) || 0) * inGain;
  const rIn = (Number(right) || 0) * inGain;

  const laOn = lookaheadEnabled == null ? true : Number(lookaheadEnabled) > 0.5;
  const laFromMs = laOn ? Math.max(0, Number(lookaheadMs) || 0) * 0.001 * rate : 0;
  const laFromSamples = laOn ? Math.max(0, Number(lookaheadSamples) || 0) : 0;
  let la = Math.round(laFromMs + laFromSamples);
  if (!Number.isFinite(la) || la < 0) la = 0;
  if (la > state.cap - 1) la = state.cap - 1;

  // Detect: sidechain when connected, else linked stereo from the gained input.
  const detectPeak = hasSidechain
    ? Math.abs(Number(sidechain) || 0)
    : Math.max(Math.abs(lIn), Math.abs(rIn));
  const instantPower = detectPeak * detectPeak;
  const attMs = Math.max(0, Number(attackMs) || 0);
  const relMs = Math.max(1, Number(releaseMs) || 250);
  const attCoeff = attMs <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, attMs * 0.001 * rate));
  const relCoeff = 1 - Math.exp(-1 / Math.max(1, relMs * 0.001 * rate));
  const ms = Number(state.meanSquare) || 0;
  if (instantPower > ms) {
    state.meanSquare = ms + attCoeff * (instantPower - ms);
  } else {
    state.meanSquare = ms + relCoeff * (instantPower - ms);
  }
  if (state.meanSquare < 1e-30) state.meanSquare = 0;
  const env = Math.sqrt(state.meanSquare);
  state.env = env;

  const threshDb = Number.isFinite(Number(thresholdDb)) ? Number(thresholdDb) : -18;
  const thresh = Math.max(1e-6, nodeGraphLookaheadLimiterDbToGain(threshDb));
  let r = Number(ratio);
  if (!Number.isFinite(r) || r < 1) r = 8;
  if (r > 100) r = 100;

  // Soft over-threshold GR: gain = (thresh/env)^((r-1)/r)
  let targetGain = 1;
  if (env > thresh) {
    const exp = (r - 1) / r;
    targetGain = Math.pow(thresh / env, exp);
  }
  if (!Number.isFinite(targetGain) || targetGain < 0) targetGain = 0;
  if (targetGain > 1) targetGain = 1;

  if (targetGain < state.gain) {
    state.gain += attCoeff * (targetGain - state.gain);
  } else {
    state.gain += relCoeff * (targetGain - state.gain);
  }
  if (!Number.isFinite(state.gain) || state.gain < 0) state.gain = 0;
  if (state.gain > 1) state.gain = 1;

  const pos = state.pos;
  state.delayL[pos] = lIn;
  state.delayR[pos] = rIn;
  let readPos = pos - la;
  const cap = state.cap;
  readPos %= cap;
  if (readPos < 0) readPos += cap;
  let dL = state.delayL[readPos];
  let dR = state.delayR[readPos];
  state.pos = (pos + 1) % cap;

  const g = state.gain;
  let amp = Number(amplitude);
  if (!Number.isFinite(amp) || amp < 0) amp = 1;
  dL *= g * amp;
  dR *= g * amp;
  if (!Number.isFinite(dL)) dL = 0;
  if (!Number.isFinite(dR)) dR = 0;

  return {
    Out: 0.5 * (dL + dR),
    Left: dL,
    Right: dR,
    Gain: g,
    Env: env > 1 ? 1 : env,
  };
}
