// Gain — pure math (main thread + AudioWorklet).
// Master / Left / Right are dB (−∞ floor = −140 dB → 0 linear).
// Same contract as soemdsp ParameterPrototype::DecibelsToAmplitude:
// patch stores dB, DSP uses 10^(dB/20).
// Out is a downmix of the processed L/R paths (mono-sum law).
// Output Volume / Pan helpers live here so the worklet blob shares them.

const NODE_GRAPH_GAIN_DB_FLOOR = -140;
const NODE_GRAPH_GAIN_MONO_SUM = Object.freeze({
  AVERAGE: 0,
  POWER: 1,
  SUM: 2,
  EQUAL_POWER: 3,
  PEAK: 4,
  LEFT: 5,
  RIGHT: 6,
});

function nodeGraphGainDbToLin(db) {
  const x = Number(db);
  if (!Number.isFinite(x) || x <= NODE_GRAPH_GAIN_DB_FLOOR) {
    return 0;
  }
  return 10 ** (x / 20);
}

function nodeGraphOutputVolumeDbToLin(db) {
  return nodeGraphGainDbToLin(db);
}

function nodeGraphOutputLinToVolumeDb(lin) {
  const x = Number(lin);
  if (!Number.isFinite(x) || x <= 0) {
    return NODE_GRAPH_GAIN_DB_FLOOR;
  }
  return 20 * Math.log10(x);
}

/** Pan −1…+1. 0 keeps Mono→both at unity; edges mute the opposite side. */
function nodeGraphOutputPanGains(pan) {
  const p = Math.max(-1, Math.min(1, Number(pan) || 0));
  if (p <= 0) {
    return { left: 1, right: Math.cos(-p * Math.PI * 0.5) };
  }
  return { left: Math.cos(p * Math.PI * 0.5), right: 1 };
}

function nodeGraphGainLegacyAmountToDb(amount) {
  const lin = Number(amount);
  if (!Number.isFinite(lin) || lin <= 0) {
    return NODE_GRAPH_GAIN_DB_FLOOR;
  }
  return 20 * Math.log10(lin);
}

function nodeGraphGainResolveMasterDb(params, amount, gainDb) {
  const raw = params && typeof params === "object" ? params : {};
  if (Object.prototype.hasOwnProperty.call(raw, "gainDb")) {
    const db = Number(gainDb);
    return Number.isFinite(db) ? db : 0;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "amount")) {
    return nodeGraphGainLegacyAmountToDb(amount);
  }
  const db = Number(gainDb);
  return Number.isFinite(db) ? db : 0;
}

function nodeGraphGainMonoSum(left, right, mode) {
  const l = Number(left) || 0;
  const r = Number(right) || 0;
  const law = Math.round(Number(mode) || 0);
  if (law === NODE_GRAPH_GAIN_MONO_SUM.POWER) {
    const energy = (l * l + r * r) * 0.5;
    const sign = l + r;
    return (sign < 0 ? -1 : 1) * Math.sqrt(Math.max(0, energy));
  }
  if (law === NODE_GRAPH_GAIN_MONO_SUM.SUM) {
    return l + r;
  }
  if (law === NODE_GRAPH_GAIN_MONO_SUM.EQUAL_POWER) {
    return (l + r) * Math.SQRT1_2;
  }
  if (law === NODE_GRAPH_GAIN_MONO_SUM.PEAK) {
    return Math.abs(l) >= Math.abs(r) ? l : r;
  }
  if (law === NODE_GRAPH_GAIN_MONO_SUM.LEFT) {
    return l;
  }
  if (law === NODE_GRAPH_GAIN_MONO_SUM.RIGHT) {
    return r;
  }
  return (l + r) * 0.5;
}

function nodeGraphGainSample(input, amount, offset = 0) {
  return (Number(input) || 0) * (Number(amount) || 0) + (Number(offset) || 0);
}

/**
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphGainFrame(mono, left, right, amount, offset = 0) {
  return nodeGraphGainFrameDb(mono, left, right, {
    masterDb: nodeGraphGainLegacyAmountToDb(amount),
    leftDb: 0,
    rightDb: 0,
    monoSum: NODE_GRAPH_GAIN_MONO_SUM.AVERAGE,
    offset,
  });
}

function nodeGraphGainFrameDb(mono, left, right, opts) {
  const m = Number(mono) || 0;
  const master = nodeGraphGainDbToLin(opts?.masterDb);
  const leftLin = master * nodeGraphGainDbToLin(opts?.leftDb);
  const rightLin = master * nodeGraphGainDbToLin(opts?.rightDb);
  const offset = Number(opts?.offset) || 0;
  const outL = ((Number(left) || 0) + m) * leftLin + offset;
  const outR = ((Number(right) || 0) + m) * rightLin + offset;
  return {
    Out: nodeGraphGainMonoSum(outL, outR, opts?.monoSum),
    Left: outL,
    Right: outR,
  };
}

// Legacy aliases (Gain Bias removed — same math as Gain with offset).
function nodeGraphGainBiasSample(input, amount, offset) {
  return nodeGraphGainSample(input, amount, offset);
}
function nodeGraphGainBiasFrame(mono, left, right, amount, offset) {
  return nodeGraphGainFrame(mono, left, right, amount, offset);
}
