// Linkwitz–Riley multiway crossover (stereo).
// Inspired by Robin Schmidt / RS-MET rsLinkwitzRileyCrossOver + CrossOver4Way tree.
//
// 2-way core: matched LR LP/HP (Butterworth cascaded twice). Mag sum ~ flat.
// N-way: successive low-band extraction with compensation allpass on already
// extracted bands (sum of that stage’s LR LP+HP) so later splits stay phase-aligned.
//
// I/O contract: Mono+Left+Right in; per-band Left/Right out only (no mono out).

const nodeGraphCrossoverLrOrders = Object.freeze([2, 4, 8]); // LR2 / LR4 / LR8

function nodeGraphCrossoverClampLrOrder(order) {
  const o = Math.round(Number(order) || 4);
  if (o <= 2) return 2;
  if (o <= 4) return 4;
  return 8;
}

function nodeGraphCrossoverButterworthQs(butterOrder) {
  // butterOrder = LR_order / 2 (1, 2, or 4)
  if (butterOrder <= 1) return null; // 1-pole path
  const n = butterOrder;
  const m = n / 2;
  const qs = [];
  for (let i = 0; i < m; i += 1) {
    const ang = ((2 * i + 1) * Math.PI) / (2 * n);
    const s = Math.sin(ang);
    qs.push(1 / (2 * Math.max(1e-9, s)));
  }
  return qs;
}

function nodeGraphCrossoverDesignBiquadLp(f0, Q, rate) {
  const sr = Math.max(1, Number(rate) || 44100);
  const f = Math.max(1e-9, Math.min(sr * 0.49, Number(f0) || 0));
  const q = Math.max(0.05, Math.min(100, Number(Q) || 0.707));
  const w0 = (2 * Math.PI * f) / sr;
  const sinw = Math.sin(w0);
  const cosw = Math.cos(w0);
  const alpha = sinw / (2 * q);
  const a0 = 1 + alpha;
  const inv = a0 !== 0 ? 1 / a0 : 1;
  const b1 = 1 - cosw;
  const b0 = 0.5 * b1;
  return {
    b0: b0 * inv,
    b1: b1 * inv,
    b2: b0 * inv,
    a1: (-2 * cosw) * inv,
    a2: (1 - alpha) * inv,
    z1: 0,
    z2: 0,
  };
}

function nodeGraphCrossoverDesignBiquadHp(f0, Q, rate) {
  const sr = Math.max(1, Number(rate) || 44100);
  const f = Math.max(1e-9, Math.min(sr * 0.49, Number(f0) || 0));
  const q = Math.max(0.05, Math.min(100, Number(Q) || 0.707));
  const w0 = (2 * Math.PI * f) / sr;
  const sinw = Math.sin(w0);
  const cosw = Math.cos(w0);
  const alpha = sinw / (2 * q);
  const a0 = 1 + alpha;
  const inv = a0 !== 0 ? 1 / a0 : 1;
  const b1 = -(1 + cosw);
  const b0 = -0.5 * b1;
  return {
    b0: b0 * inv,
    b1: b1 * inv,
    b2: b0 * inv,
    a1: (-2 * cosw) * inv,
    a2: (1 - alpha) * inv,
    z1: 0,
    z2: 0,
  };
}

function nodeGraphCrossoverBiquadProcess(s, x) {
  const y = s.b0 * x + s.z1;
  s.z1 = s.b1 * x - s.a1 * y + s.z2;
  s.z2 = s.b2 * x - s.a2 * y;
  return Number.isFinite(y) ? y : 0;
}

function nodeGraphCrossoverOnePoleLpCoeff(f0, rate) {
  const sr = Math.max(1, Number(rate) || 44100);
  const f = Math.max(0, Math.min(sr * 0.49, Number(f0) || 0));
  const w = Math.min((2 * Math.PI * f) / sr, Math.PI * 0.999);
  // a = exp(-w); y = (1-a)*x + a*y
  const a = Math.exp(-w);
  return { a, z: 0 };
}

function nodeGraphCrossoverOnePoleLpProcess(s, x) {
  const y = (1 - s.a) * x + s.a * s.z;
  s.z = Number.isFinite(y) ? y : 0;
  return s.z;
}

function nodeGraphCrossoverOnePoleHpProcess(s, x) {
  // DC-blocking style HP from same pole: y = a * (y + x - x1)
  const y = s.a * (s.z + x - s.x1);
  s.x1 = x;
  s.z = Number.isFinite(y) ? y : 0;
  return s.z;
}

/** One LR split pair (LP path + HP path), redesigned when fc/order/rate change. */
function createNodeGraphCrossoverSplitState() {
  return {
    lastFc: NaN,
    lastOrder: -1,
    lastRate: NaN,
    // LR2: two 1-pole LP + two 1-pole HP
    lpPole1: null,
    lpPole2: null,
    hpPole1: null,
    hpPole2: null,
    // LR4/8: two identical Butterworth cascades (sections arrays)
    lpA: [],
    lpB: [],
    hpA: [],
    hpB: [],
  };
}

function nodeGraphCrossoverEnsureSplit(state, fc, lrOrder, rate) {
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  const f = Math.max(0, Number(fc) || 0);
  const sr = Math.max(1, Number(rate) || 44100);
  if (state.lastFc === f && state.lastOrder === order && state.lastRate === sr) {
    return;
  }
  state.lastFc = f;
  state.lastOrder = order;
  state.lastRate = sr;

  if (order === 2) {
    const c1 = nodeGraphCrossoverOnePoleLpCoeff(f, sr);
    const c2 = nodeGraphCrossoverOnePoleLpCoeff(f, sr);
    state.lpPole1 = { a: c1.a, z: 0 };
    state.lpPole2 = { a: c2.a, z: 0 };
    state.hpPole1 = { a: c1.a, z: 0, x1: 0 };
    state.hpPole2 = { a: c2.a, z: 0, x1: 0 };
    state.lpA = [];
    state.lpB = [];
    state.hpA = [];
    state.hpB = [];
    return;
  }

  const butterOrder = order / 2; // 2 or 4
  const qs = nodeGraphCrossoverButterworthQs(butterOrder);
  state.lpPole1 = state.lpPole2 = state.hpPole1 = state.hpPole2 = null;
  state.lpA = qs.map((Q) => nodeGraphCrossoverDesignBiquadLp(f, Q, sr));
  state.lpB = qs.map((Q) => nodeGraphCrossoverDesignBiquadLp(f, Q, sr));
  state.hpA = qs.map((Q) => nodeGraphCrossoverDesignBiquadHp(f, Q, sr));
  state.hpB = qs.map((Q) => nodeGraphCrossoverDesignBiquadHp(f, Q, sr));
}

function nodeGraphCrossoverProcessCascade(sections, x) {
  let y = x;
  for (let i = 0; i < sections.length; i += 1) {
    y = nodeGraphCrossoverBiquadProcess(sections[i], y);
  }
  return y;
}

/**
 * LR split: low + high. Mag sum ≈ flat (true LR pair).
 * @returns {{ low: number, high: number }}
 */
function nodeGraphCrossoverLrSplit(state, x, fc, lrOrder, rate) {
  nodeGraphCrossoverEnsureSplit(state, fc, lrOrder, rate);
  const xin = Number(x) || 0;
  if (state.lastOrder === 2) {
    let low = nodeGraphCrossoverOnePoleLpProcess(state.lpPole1, xin);
    low = nodeGraphCrossoverOnePoleLpProcess(state.lpPole2, low);
    let high = nodeGraphCrossoverOnePoleHpProcess(state.hpPole1, xin);
    high = nodeGraphCrossoverOnePoleHpProcess(state.hpPole2, high);
    return { low, high };
  }
  let low = nodeGraphCrossoverProcessCascade(state.lpA, xin);
  low = nodeGraphCrossoverProcessCascade(state.lpB, low);
  let high = nodeGraphCrossoverProcessCascade(state.hpA, xin);
  high = nodeGraphCrossoverProcessCascade(state.hpB, high);
  return { low, high };
}

/** Compensation allpass ≈ LP+HP of an LR stage (RS-MET branch compensation). */
function nodeGraphCrossoverLrAllpass(state, x, fc, lrOrder, rate) {
  const { low, high } = nodeGraphCrossoverLrSplit(state, x, fc, lrOrder, rate);
  return low + high;
}

/**
 * Channel state for an N-way crossover (N = 2..6).
 * splits[i] processes remaining high at freqs[i]
 * comps[p][i] compensates earlier band p for stage i (i > p)
 */
function createNodeGraphCrossoverChannelState(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const splitCount = n - 1;
  const splits = [];
  const comps = [];
  for (let i = 0; i < splitCount; i += 1) {
    splits.push(createNodeGraphCrossoverSplitState());
  }
  for (let p = 0; p < splitCount; p += 1) {
    comps[p] = [];
    for (let i = 0; i < splitCount; i += 1) {
      comps[p][i] = i > p ? createNodeGraphCrossoverSplitState() : null;
    }
  }
  return { bandCount: n, splits, comps };
}

function createNodeGraphCrossoverStereoState(bandCount) {
  return {
    left: createNodeGraphCrossoverChannelState(bandCount),
    right: createNodeGraphCrossoverChannelState(bandCount),
  };
}

function nodeGraphCrossoverSortedFreqs(freqs, count) {
  const n = Math.max(0, count);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const f = Math.max(0, Number(freqs[i]) || 0);
    out.push(f);
  }
  // Enforce non-decreasing splits (same fc ok → thin mid band)
  for (let i = 1; i < out.length; i += 1) {
    if (out[i] < out[i - 1]) out[i] = out[i - 1];
  }
  return out;
}

/**
 * Process one channel into bandCount bands (low → high).
 * @returns {number[]} length bandCount
 */
function nodeGraphCrossoverProcessChannel(ch, x, freqs, lrOrder, rate) {
  const n = ch.bandCount;
  const splitCount = n - 1;
  const f = nodeGraphCrossoverSortedFreqs(freqs, splitCount);
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  const bands = new Array(n);
  let remaining = Number(x) || 0;

  for (let i = 0; i < splitCount; i += 1) {
    const { low, high } = nodeGraphCrossoverLrSplit(ch.splits[i], remaining, f[i], order, rate);
    bands[i] = low;
    remaining = high;
    // Compensate already-extracted lower bands for this stage (RS-MET idea).
    for (let p = 0; p < i; p += 1) {
      const comp = ch.comps[p][i];
      if (comp) {
        bands[p] = nodeGraphCrossoverLrAllpass(comp, bands[p], f[i], order, rate);
      }
    }
  }
  bands[splitCount] = remaining;
  return bands;
}

/**
 * Full stereo frame.
 * @param {{ left, right }} state
 * @param {number} mono
 * @param {number} leftIn
 * @param {number} rightIn
 * @param {number[]} freqs length bandCount-1
 * @param {number} lrOrder 2|4|8
 * @param {number} sampleRate
 * @returns {Record<string, number>} port map
 */
function nodeGraphCrossoverSample(state, mono, leftIn, rightIn, freqs, lrOrder, sampleRate, bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (!state.left || state.left.bandCount !== n) {
    Object.assign(state, createNodeGraphCrossoverStereoState(n));
  }
  const m = Number(mono) || 0;
  const lIn = (Number(leftIn) || 0) + m;
  const rIn = (Number(rightIn) || 0) + m;
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const bandsL = nodeGraphCrossoverProcessChannel(state.left, lIn, freqs, order, rate);
  const bandsR = nodeGraphCrossoverProcessChannel(state.right, rIn, freqs, order, rate);

  const names = nodeGraphCrossoverBandNames(n);
  const out = {};
  for (let i = 0; i < n; i += 1) {
    out[`${names[i]} Left`] = Number.isFinite(bandsL[i]) ? bandsL[i] : 0;
    out[`${names[i]} Right`] = Number.isFinite(bandsR[i]) ? bandsR[i] : 0;
  }
  return out;
}

function nodeGraphCrossoverBandNames(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (n === 2) return ["Low", "High"];
  if (n === 3) return ["Low", "Mid", "High"];
  if (n === 4) return ["Low", "Low-Mid", "High-Mid", "High"];
  const names = [];
  for (let i = 1; i <= n; i += 1) names.push(`Band ${i}`);
  return names;
}

function nodeGraphCrossoverDefaultFreqs(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  // Musical defaults spanning the spectrum
  const table = {
    2: [1000],
    3: [300, 3000],
    4: [200, 1000, 5000],
    5: [150, 500, 2000, 8000],
    6: [100, 300, 1000, 3000, 10000],
  };
  return (table[n] || table[2]).slice();
}
