// RMS meter — sliding mean-square + attack/release envelope, optional peak hold.
// Mono: In → RMS A / RMS D / Gate
// Stereo: Left/Right → per-channel outs + music RMS ((L+R)/2 or lone side).
// Face = RMS A. Digital outs are absolute dBFS (no Ref offset).

/** Silence floor for digital RMS D when amplitude is ~0 (not a face guide). */
const NODE_GRAPH_RMS_DB_FLOOR = -120;
/** Default meter top — 0 dB FS; above that is clipping / speaker-danger. */
const NODE_GRAPH_RMS_DB_CEIL = 0;
/** Default meter bottom / Min dB floor. */
const NODE_GRAPH_RMS_DB_DEFAULT_MIN = -48;

/**
 * Established interior guide lines (dB FS). Top/bottom extremes follow Min/Max zoom.
 * +6 only appears when Max dB is raised above it.
 */
const NODE_GRAPH_RMS_DB_GUIDES = Object.freeze([
  6, 3, 0, -1, -3, -6, -12, -18, -24, -48, -60,
]);

/** Legacy amplitude-face constants (unused for RMS; face is dB-linear now). */
const NODE_GRAPH_RMS_FACE_GAIN = 1;
const NODE_GRAPH_RMS_FACE_OFFSET = -1;

function createNodeGraphRmsChannelState() {
  return {
    meanSquare: 0,
    envAmp: 0,
    holdDb: NODE_GRAPH_RMS_DB_FLOOR,
    holdSamples: 0,
  };
}

function createNodeGraphRmsState() {
  return {
    mono: createNodeGraphRmsChannelState(),
    left: createNodeGraphRmsChannelState(),
    right: createNodeGraphRmsChannelState(),
    avg: createNodeGraphRmsChannelState(),
    sampleRate: 0,
    windowSec: -1,
    windowCoeff: 0,
  };
}

function nodeGraphRmsCoeffForSeconds(seconds, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const sec = Math.max(0, Number(seconds) || 0);
  if (sec <= 1e-6) {
    return 1;
  }
  return 1 - Math.exp(-1 / (sec * rate));
}

function nodeGraphRmsEnsureWindowCoeff(state, windowSec, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const win = Math.max(1e-4, Math.min(10, Number(windowSec) || 0.05));
  if (state.sampleRate !== rate || state.windowSec !== win) {
    state.sampleRate = rate;
    state.windowSec = win;
    state.windowCoeff = nodeGraphRmsCoeffForSeconds(win, rate);
  }
  return state.windowCoeff;
}

function nodeGraphRmsUpdateMeanSquare(channel, sample, coeff) {
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

function nodeGraphRmsApplyBallistics(channel, targetAmp, attackSec, releaseSec, sampleRate) {
  const target = Math.max(0, Number(targetAmp) || 0);
  if (!Number.isFinite(channel.envAmp) || channel.envAmp < 0) {
    channel.envAmp = 0;
  }
  const rising = target > channel.envAmp;
  const sec = rising
    ? Math.max(0, Number(attackSec) || 0)
    : Math.max(0, Number(releaseSec) || 0);
  const coeff = nodeGraphRmsCoeffForSeconds(sec, sampleRate);
  channel.envAmp += coeff * (target - channel.envAmp);
  if (!(channel.envAmp > 0) || !Number.isFinite(channel.envAmp)) {
    channel.envAmp = 0;
  }
  return channel.envAmp;
}

/** Optional display LUT for face mapping (digital outs always use exact log). */
const NODE_GRAPH_RMS_LOG_LUT_SIZE = 2048;
let nodeGraphRmsLogLut = null;

function nodeGraphRmsEnsureLogLut() {
  if (nodeGraphRmsLogLut) {
    return nodeGraphRmsLogLut;
  }
  const lut = new Float32Array(NODE_GRAPH_RMS_LOG_LUT_SIZE);
  for (let i = 0; i < NODE_GRAPH_RMS_LOG_LUT_SIZE; i += 1) {
    const amp = i / (NODE_GRAPH_RMS_LOG_LUT_SIZE - 1);
    // Map 0…1 amp into a usable meter span; bright peaks use exact log fallback.
    const x = Math.max(1e-10, amp);
    lut[i] = 20 * Math.log10(x);
  }
  nodeGraphRmsLogLut = lut;
  return lut;
}

function nodeGraphRmsLinearToDbExact(rms) {
  const r = Number(rms);
  if (!(r > 0) || !Number.isFinite(r)) {
    return NODE_GRAPH_RMS_DB_FLOOR;
  }
  return 20 * Math.log10(Math.max(r, 1e-10));
}

function nodeGraphRmsLinearToDbLut(rms) {
  const r = Number(rms);
  if (!(r > 0) || !Number.isFinite(r)) {
    return NODE_GRAPH_RMS_DB_FLOOR;
  }
  if (r >= 1) {
    return nodeGraphRmsLinearToDbExact(r);
  }
  const lut = nodeGraphRmsEnsureLogLut();
  const pos = r * (NODE_GRAPH_RMS_LOG_LUT_SIZE - 1);
  const i0 = Math.max(0, Math.min(NODE_GRAPH_RMS_LOG_LUT_SIZE - 2, Math.floor(pos)));
  const frac = pos - i0;
  return lut[i0] + (lut[i0 + 1] - lut[i0]) * frac;
}

function nodeGraphRmsLinearToDb(rms, useLut = false) {
  return useLut ? nodeGraphRmsLinearToDbLut(rms) : nodeGraphRmsLinearToDbExact(rms);
}

/** dB FS → linear amplitude (0 dB = 1, +6 dB ≈ 2, −inf → 0). */
function nodeGraphRmsDbToLinear(db) {
  const d = Number(db);
  if (!Number.isFinite(d) || d <= -200) {
    return 0;
  }
  return 10 ** (d / 20);
}

function nodeGraphRmsApplyPeakHold(channel, db, peakHoldSec, sampleRate) {
  const value = Number(db);
  const safeDb = Number.isFinite(value) ? value : NODE_GRAPH_RMS_DB_FLOOR;
  const holdSec = Math.max(0, Number(peakHoldSec) || 0);
  if (!(holdSec > 0)) {
    channel.holdDb = safeDb;
    channel.holdSamples = 0;
    return safeDb;
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (safeDb >= channel.holdDb - 1e-9) {
    channel.holdDb = safeDb;
    channel.holdSamples = Math.max(1, Math.round(holdSec * rate));
    return channel.holdDb;
  }
  if (channel.holdSamples > 0) {
    channel.holdSamples -= 1;
    return channel.holdDb;
  }
  channel.holdDb = safeDb;
  return safeDb;
}

function nodeGraphRmsNormalizeOptions(options = {}) {
  const windowSec = Math.max(1e-4, Math.min(10, Number(options.windowSec) || 0.05));
  const attackSec = Math.max(0, Math.min(5, Number(options.attackSec)));
  const releaseSec = Math.max(0, Math.min(10, Number(options.releaseSec)));
  const thresholdDb = Number(options.thresholdDb);
  const peakHoldSec = Math.max(0, Math.min(30, Number(options.peakHoldSec) || 0));
  const useLogLut = options.useLogLut === true
    || options.useLogLut === 1
    || options.useLogLut === "1"
    || Math.round(Number(options.logMode)) === 1;
  return {
    windowSec,
    attackSec: Number.isFinite(attackSec) ? attackSec : 0,
    // Default release a bit slower than window so the meter settles musically.
    releaseSec: Number.isFinite(releaseSec) ? releaseSec : 0.15,
    thresholdDb: Number.isFinite(thresholdDb) ? Math.max(-120, Math.min(24, thresholdDb)) : -12,
    peakHoldSec,
    useLogLut,
  };
}

function nodeGraphRmsProcessChannel(channel, sample, options, sampleRate, hasInput) {
  const opts = nodeGraphRmsNormalizeOptions(options);
  const instant = hasInput
    ? nodeGraphRmsUpdateMeanSquare(channel, sample, options.windowCoeff)
    : 0;
  if (!hasInput) {
    channel.meanSquare = 0;
    channel.envAmp = 0;
    channel.holdDb = NODE_GRAPH_RMS_DB_FLOOR;
    channel.holdSamples = 0;
    return { amp: 0, db: NODE_GRAPH_RMS_DB_FLOOR, gate: 0 };
  }
  const envAmp = nodeGraphRmsApplyBallistics(
    channel,
    instant,
    opts.attackSec,
    opts.releaseSec,
    sampleRate,
  );
  // Digital outs always use exact log; LUT is for face mapping only.
  const measuredDb = nodeGraphRmsLinearToDbExact(envAmp);
  const heldDb = nodeGraphRmsApplyPeakHold(channel, measuredDb, opts.peakHoldSec, sampleRate);
  return {
    amp: envAmp,
    db: heldDb,
    gate: measuredDb >= opts.thresholdDb ? 1 : 0,
  };
}

/** Normalize zoom range so min < max (clamped to −48…0). */
function nodeGraphRmsNormalizeDbRange(minDb, maxDb) {
  let min = Number(minDb);
  let max = Number(maxDb);
  if (!Number.isFinite(min)) min = NODE_GRAPH_RMS_DB_DEFAULT_MIN;
  if (!Number.isFinite(max)) max = NODE_GRAPH_RMS_DB_CEIL;
  min = Math.max(NODE_GRAPH_RMS_DB_DEFAULT_MIN, Math.min(NODE_GRAPH_RMS_DB_CEIL, min));
  max = Math.max(NODE_GRAPH_RMS_DB_DEFAULT_MIN, Math.min(NODE_GRAPH_RMS_DB_CEIL, max));
  if (!(max > min)) {
    if (max === min) {
      // Prefer expanding toward the quiet end when both sit at the ceiling.
      min = Math.max(NODE_GRAPH_RMS_DB_DEFAULT_MIN, max - 1);
      if (!(max > min)) {
        max = Math.min(NODE_GRAPH_RMS_DB_CEIL, min + 1);
      }
    } else {
      const swap = min;
      min = max;
      max = swap;
    }
  }
  return { minDb: min, maxDb: max };
}

/**
 * Face map for RMS waterfall: equal dB → equal pixels.
 * Linear amplitude samples are converted to dB, then minDb→−1, maxDb→+1.
 */
function nodeGraphRmsFaceGainOffset(minDb, maxDb) {
  const range = nodeGraphRmsNormalizeDbRange(minDb, maxDb);
  return {
    mode: "rmsDb",
    gain: 1,
    offset: 0,
    minDb: range.minDb,
    maxDb: range.maxDb,
  };
}

function nodeGraphRmsFaceRangeFromNode(node) {
  const params = node?.params && typeof node.params === "object" ? node.params : {};
  const face = nodeGraphRmsFaceGainOffset(params.minDb, params.maxDb);
  const logMode = Math.round(Number(params.logMode));
  face.useLogLut = logMode !== 0;
  return face;
}

function nodeGraphRmsFaceRangeFromSlot(slot) {
  const node = typeof nodeGraphPatchNode === "function"
    ? nodeGraphPatchNode(slot?.nodeId)
    : null;
  return nodeGraphRmsFaceRangeFromNode(node);
}

/** dB → waterfall bipolar for current Min/Max zoom (−1 bottom … +1 top). */
function nodeGraphRmsDbToFaceBipolar(db, minDb, maxDb) {
  const range = nodeGraphRmsNormalizeDbRange(minDb, maxDb);
  const span = range.maxDb - range.minDb;
  if (!(span > 1e-12)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, 2 * ((Number(db) || 0) - range.minDb) / span - 1));
}

/**
 * Guide lines to draw for the current zoom:
 * - always top = maxDb, bottom = minDb
 * - established guides strictly inside (minDb, maxDb)
 */
function nodeGraphRmsGuideLevels(minDb, maxDb) {
  const range = nodeGraphRmsNormalizeDbRange(minDb, maxDb);
  const levels = [];
  const push = (db, role) => {
    const value = Number(db);
    if (!Number.isFinite(value)) {
      return;
    }
    if (levels.some((entry) => Math.abs(entry.db - value) < 1e-9)) {
      return;
    }
    levels.push({ db: value, role: role || "guide" });
  };
  push(range.maxDb, "max");
  push(range.minDb, "min");
  const established = typeof NODE_GRAPH_RMS_DB_GUIDES !== "undefined"
    ? NODE_GRAPH_RMS_DB_GUIDES
    : [6, 3, 0, -1, -3, -6, -12, -18, -24, -48, -60];
  for (const db of established) {
    if (db > range.minDb && db < range.maxDb) {
      push(db, "guide");
    }
  }
  levels.sort((a, b) => b.db - a.db);
  return levels;
}

/** Map dB FS → bipolar (dB-linear face). */
function nodeGraphRmsDbToBipolar(db, minDb, maxDb) {
  return nodeGraphRmsDbToFaceBipolar(db, minDb, maxDb);
}

function nodeGraphRmsReadOptions(options, state, sampleRate) {
  const opts = nodeGraphRmsNormalizeOptions(options);
  const windowCoeff = nodeGraphRmsEnsureWindowCoeff(state, opts.windowSec, sampleRate);
  return { ...opts, windowCoeff };
}

/**
 * Mono meter.
 * @returns {{ "RMS A": number, "RMS D": number, Gate: number }}
 */
function nodeGraphRmsSample(state, input, options, sampleRate, hasInput) {
  const opts = nodeGraphRmsReadOptions(options, state, sampleRate);
  const channel = nodeGraphRmsProcessChannel(
    state.mono,
    hasInput ? (Number(input) || 0) : 0,
    opts,
    sampleRate,
    Boolean(hasInput),
  );
  return {
    "RMS A": channel.amp,
    "RMS D": channel.db,
    Gate: channel.gate,
  };
}

/**
 * Stereo meter. Music RMS = (L+R)/2 when both connected; otherwise the lone side.
 * Face / visible jacks: RMS A / RMS D (same names as Mono).
 */
function nodeGraphRmsStereoSample(
  state,
  left,
  right,
  options,
  sampleRate,
  hasLeft,
  hasRight,
) {
  const opts = nodeGraphRmsReadOptions(options, state, sampleRate);
  const lIn = hasLeft ? (Number(left) || 0) : 0;
  const rIn = hasRight ? (Number(right) || 0) : 0;
  let avgIn = 0;
  let hasAvg = false;
  if (hasLeft && hasRight) {
    avgIn = 0.5 * (lIn + rIn);
    hasAvg = true;
  } else if (hasLeft) {
    avgIn = lIn;
    hasAvg = true;
  } else if (hasRight) {
    avgIn = rIn;
    hasAvg = true;
  }

  const leftCh = nodeGraphRmsProcessChannel(state.left, lIn, opts, sampleRate, Boolean(hasLeft));
  const rightCh = nodeGraphRmsProcessChannel(state.right, rIn, opts, sampleRate, Boolean(hasRight));
  const avgCh = nodeGraphRmsProcessChannel(state.avg, avgIn, opts, sampleRate, hasAvg);

  return {
    "RMS A Left": leftCh.amp,
    "RMS A Right": rightCh.amp,
    "RMS A": avgCh.amp,
    "RMS D Left": leftCh.db,
    "RMS D Right": rightCh.db,
    "RMS D": avgCh.db,
    "Gate Left": leftCh.gate,
    "Gate Right": rightCh.gate,
    Gate: avgCh.gate,
  };
}

