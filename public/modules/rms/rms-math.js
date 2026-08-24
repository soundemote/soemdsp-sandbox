// RMS meter — sliding one-pole mean-square per channel + dB gate.
// Outs Left/Right/Mono are bipolar meter CV: −1 ≈ −60 dB FS, +1 ≈ +6 dB FS.
// Gate is 1 when Mono RMS (dB) ≥ threshold.

const NODE_GRAPH_RMS_DB_FLOOR = -60;
const NODE_GRAPH_RMS_DB_CEIL = 6;
const NODE_GRAPH_RMS_DB_SPAN = NODE_GRAPH_RMS_DB_CEIL - NODE_GRAPH_RMS_DB_FLOOR;

/** Horizontal guide lines drawn on the RMS waterfall face (dB FS). */
const NODE_GRAPH_RMS_DB_GUIDES = Object.freeze([
  6, 3, 0, -1, -3, -6, -12, -18, -24, -48, -60,
]);

function createNodeGraphRmsChannelState() {
  return { meanSquare: 0 };
}

function createNodeGraphRmsState() {
  return {
    left: createNodeGraphRmsChannelState(),
    right: createNodeGraphRmsChannelState(),
    mono: createNodeGraphRmsChannelState(),
    sampleRate: 0,
    coeff: 0,
    windowSec: -1,
  };
}

function nodeGraphRmsCoeffForWindow(windowSec, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const sec = Math.max(1e-4, Math.min(10, Number(windowSec) || 0.05));
  return 1 - Math.exp(-1 / (sec * rate));
}

function nodeGraphRmsUpdateChannel(channel, sample, coeff) {
  const x = Number(sample);
  const xx = Number.isFinite(x) ? x * x : 0;
  const c = Number.isFinite(coeff) ? Math.max(0, Math.min(1, coeff)) : 0.01;
  const ms = channel.meanSquare;
  channel.meanSquare = ms + c * (xx - ms);
  if (!(channel.meanSquare > 0) || !Number.isFinite(channel.meanSquare)) {
    channel.meanSquare = 0;
  }
  return Math.sqrt(channel.meanSquare);
}

function nodeGraphRmsLinearToDb(rms) {
  const r = Number(rms);
  if (!(r > 0) || !Number.isFinite(r)) {
    return NODE_GRAPH_RMS_DB_FLOOR;
  }
  return 20 * Math.log10(Math.max(r, 1e-10));
}

/** dB FS → linear amplitude (0 dB = 1, +6 dB ≈ 2, −inf → 0). */
function nodeGraphRmsDbToLinear(db) {
  const d = Number(db);
  if (!Number.isFinite(d) || d <= -200) {
    return 0;
  }
  return 10 ** (d / 20);
}

/**
 * Face mapping for linear RMS amplitude on the waterfall:
 * gain 1, offset −1 → 0 at bottom, 1 (0 dB) at mid, 2 (+6 dB) at top.
 */
const NODE_GRAPH_RMS_FACE_GAIN = 1;
const NODE_GRAPH_RMS_FACE_OFFSET = -1;

/** Map dB FS (−60…+6) → bipolar via amplitude face mapping (legacy helper). */
function nodeGraphRmsDbToBipolar(db) {
  const amp = nodeGraphRmsDbToLinear(db);
  const v = amp * NODE_GRAPH_RMS_FACE_GAIN + NODE_GRAPH_RMS_FACE_OFFSET;
  return Math.max(-1, Math.min(1, v));
}

function nodeGraphRmsMixMono(left, mono, right, hasLeft, hasMono, hasRight) {
  if (hasMono) {
    return Number(mono) || 0;
  }
  let sum = 0;
  let n = 0;
  if (hasLeft) {
    sum += Number(left) || 0;
    n += 1;
  }
  if (hasRight) {
    sum += Number(right) || 0;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

/**
 * @returns {{
 *   "RMS Left": number,
 *   "RMS Right": number,
 *   "RMS Mono": number,
 *   "RMS Left D": number,
 *   "RMS Right D": number,
 *   "RMS Mono D": number,
 *   Gate: number,
 *   RMS: number,
 * }}
 * Analog RMS Left/Right/Mono = linear amplitude (0 = −inf, 1 = 0 dB, >1 for +dB).
 * Digital RMS * D = same linear values. Gate from threshold dB vs mono.
 */
function nodeGraphRmsSample(
  state,
  left,
  mono,
  right,
  windowSec,
  thresholdDb,
  sampleRate,
  hasLeft,
  hasMono,
  hasRight,
) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const win = Math.max(1e-4, Math.min(10, Number(windowSec) || 0.05));
  if (state.sampleRate !== rate || state.windowSec !== win) {
    state.sampleRate = rate;
    state.windowSec = win;
    state.coeff = nodeGraphRmsCoeffForWindow(win, rate);
  }
  const coeff = state.coeff;
  const lIn = hasLeft ? (Number(left) || 0) : 0;
  const rIn = hasRight ? (Number(right) || 0) : 0;
  const mIn = nodeGraphRmsMixMono(left, mono, right, hasLeft, hasMono, hasRight);

  const lRms = hasLeft ? nodeGraphRmsUpdateChannel(state.left, lIn, coeff) : 0;
  const rRms = hasRight ? nodeGraphRmsUpdateChannel(state.right, rIn, coeff) : 0;
  const mRms = (hasLeft || hasMono || hasRight)
    ? nodeGraphRmsUpdateChannel(state.mono, mIn, coeff)
    : 0;

  const mDb = nodeGraphRmsLinearToDb(mRms);
  const thresh = Number(thresholdDb);
  const gateDb = Number.isFinite(thresh) ? Math.max(-120, Math.min(24, thresh)) : -12;

  return {
    "RMS Left": lRms,
    "RMS Right": rRms,
    "RMS Mono": mRms,
    "RMS Left D": lRms,
    "RMS Right D": rRms,
    "RMS Mono D": mRms,
    Gate: mDb >= gateDb ? 1 : 0,
    RMS: mRms,
  };
}
