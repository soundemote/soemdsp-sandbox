// Linkwitz–Riley multiway crossover (stereo).
// Inspired by Robin Schmidt / RS-MET rsLinkwitzRileyCrossOver + CrossOver4Way tree.
//
// 2-way core: matched LR LP/HP (Butterworth cascaded twice). Mag sum ~ flat.
// N-way: binary tree of LR splits (exactly N-1 splits/channel) — same idea as
// RS-MET’s nested CrossOverNWay, not successive-extract + O(N²) allpass comps.
//
// I/O contract: Mono+Left+Right in; per-band Left/Right out only (no mono out).
// Hot path: no per-sample object/array alloc; mono-identical L/R processes once.

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
  // Transposed direct form II — tight hot path (crossover runs many of these/sample).
  const y = s.b0 * x + s.z1;
  s.z1 = s.b1 * x - s.a1 * y + s.z2;
  s.z2 = s.b2 * x - s.a2 * y;
  return y;
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

/**
 * Rebuild LR coeffs for a new fc/order/rate, preserving delay state when the
 * topology is unchanged. Zeroing z on every smoother micro-step was the main
 * zipper/click when Freq was modulated or auto-smoothed.
 */
function nodeGraphCrossoverPreserveOnePole(prev, a) {
  return {
    a,
    z: Number.isFinite(Number(prev?.z)) ? Number(prev.z) : 0,
    x1: Number.isFinite(Number(prev?.x1)) ? Number(prev.x1) : 0,
  };
}

function nodeGraphCrossoverPreserveBiquad(prev, next) {
  return {
    ...next,
    z1: Number.isFinite(Number(prev?.z1)) ? Number(prev.z1) : 0,
    z2: Number.isFinite(Number(prev?.z2)) ? Number(prev.z2) : 0,
  };
}

function nodeGraphCrossoverRemapCascade(prevSections, qs, designFn, f, sr) {
  const prev = Array.isArray(prevSections) ? prevSections : [];
  return qs.map((Q, i) => nodeGraphCrossoverPreserveBiquad(prev[i], designFn(f, Q, sr)));
}

function nodeGraphCrossoverEnsureSplit(state, fc, lrOrder, rate) {
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  // Floor tiny / non-finite fc so filters stay stable (UI min is 20 Hz).
  const f = Math.max(1e-3, Number.isFinite(Number(fc)) ? Number(fc) : 0);
  const sr = Math.max(1, Number(rate) || 44100);
  // Hysteresis: skip redesign for sub-threshold fc noise (CPU). Smoothed /
  // modulated fc still steps past this regularly — that path MUST keep z.
  const prevF = Number(state.lastFc);
  const sameOrder = state.lastOrder === order;
  const sameRate = state.lastRate === sr;
  if (
    sameOrder
    && sameRate
    && Number.isFinite(prevF)
    && Math.abs(prevF - f) <= Math.max(0.05, prevF * 1e-4)
  ) {
    return;
  }
  const keepState = sameOrder && sameRate;
  state.lastFc = f;
  state.lastOrder = order;
  state.lastRate = sr;

  if (order === 2) {
    const c1 = nodeGraphCrossoverOnePoleLpCoeff(f, sr);
    const c2 = nodeGraphCrossoverOnePoleLpCoeff(f, sr);
    if (keepState) {
      state.lpPole1 = nodeGraphCrossoverPreserveOnePole(state.lpPole1, c1.a);
      state.lpPole2 = nodeGraphCrossoverPreserveOnePole(state.lpPole2, c2.a);
      state.hpPole1 = nodeGraphCrossoverPreserveOnePole(state.hpPole1, c1.a);
      state.hpPole2 = nodeGraphCrossoverPreserveOnePole(state.hpPole2, c2.a);
    } else {
      state.lpPole1 = { a: c1.a, z: 0 };
      state.lpPole2 = { a: c2.a, z: 0 };
      state.hpPole1 = { a: c1.a, z: 0, x1: 0 };
      state.hpPole2 = { a: c2.a, z: 0, x1: 0 };
    }
    state.lpA = [];
    state.lpB = [];
    state.hpA = [];
    state.hpB = [];
    return;
  }

  const butterOrder = order / 2; // 2 or 4
  const qs = nodeGraphCrossoverButterworthQs(butterOrder);
  state.lpPole1 = state.lpPole2 = state.hpPole1 = state.hpPole2 = null;
  if (keepState) {
    state.lpA = nodeGraphCrossoverRemapCascade(state.lpA, qs, nodeGraphCrossoverDesignBiquadLp, f, sr);
    state.lpB = nodeGraphCrossoverRemapCascade(state.lpB, qs, nodeGraphCrossoverDesignBiquadLp, f, sr);
    state.hpA = nodeGraphCrossoverRemapCascade(state.hpA, qs, nodeGraphCrossoverDesignBiquadHp, f, sr);
    state.hpB = nodeGraphCrossoverRemapCascade(state.hpB, qs, nodeGraphCrossoverDesignBiquadHp, f, sr);
  } else {
    state.lpA = qs.map((Q) => nodeGraphCrossoverDesignBiquadLp(f, Q, sr));
    state.lpB = qs.map((Q) => nodeGraphCrossoverDesignBiquadLp(f, Q, sr));
    state.hpA = qs.map((Q) => nodeGraphCrossoverDesignBiquadHp(f, Q, sr));
    state.hpB = qs.map((Q) => nodeGraphCrossoverDesignBiquadHp(f, Q, sr));
  }
}

function nodeGraphCrossoverProcessCascade(sections, x) {
  let y = x;
  for (let i = 0; i < sections.length; i += 1) {
    y = nodeGraphCrossoverBiquadProcess(sections[i], y);
  }
  return y;
}

/**
 * LR split into state._low / state._high (no per-sample object alloc).
 * Mag sum ≈ flat (true LR pair).
 */
function nodeGraphCrossoverLrSplitInto(state, x, fc, lrOrder, rate) {
  nodeGraphCrossoverEnsureSplit(state, fc, lrOrder, rate);
  const xin = +x || 0;
  if (state.lastOrder === 2) {
    let low = nodeGraphCrossoverOnePoleLpProcess(state.lpPole1, xin);
    low = nodeGraphCrossoverOnePoleLpProcess(state.lpPole2, low);
    let high = nodeGraphCrossoverOnePoleHpProcess(state.hpPole1, xin);
    high = nodeGraphCrossoverOnePoleHpProcess(state.hpPole2, high);
    state._low = low;
    state._high = high;
    return;
  }
  // LR4/LR8: dual identical Butterworth cascades (inline DF2 biquad — no calls).
  let low = xin;
  let secs = state.lpA;
  for (let i = 0, n = secs.length; i < n; i += 1) {
    const s = secs[i];
    const y = s.b0 * low + s.z1;
    s.z1 = s.b1 * low - s.a1 * y + s.z2;
    s.z2 = s.b2 * low - s.a2 * y;
    low = y;
  }
  secs = state.lpB;
  for (let i = 0, n = secs.length; i < n; i += 1) {
    const s = secs[i];
    const y = s.b0 * low + s.z1;
    s.z1 = s.b1 * low - s.a1 * y + s.z2;
    s.z2 = s.b2 * low - s.a2 * y;
    low = y;
  }
  let high = xin;
  secs = state.hpA;
  for (let i = 0, n = secs.length; i < n; i += 1) {
    const s = secs[i];
    const y = s.b0 * high + s.z1;
    s.z1 = s.b1 * high - s.a1 * y + s.z2;
    s.z2 = s.b2 * high - s.a2 * y;
    high = y;
  }
  secs = state.hpB;
  for (let i = 0, n = secs.length; i < n; i += 1) {
    const s = secs[i];
    const y = s.b0 * high + s.z1;
    s.z1 = s.b1 * high - s.a1 * y + s.z2;
    s.z2 = s.b2 * high - s.a2 * y;
    high = y;
  }
  state._low = low;
  state._high = high;
}

/** @deprecated Prefer nodeGraphCrossoverLrSplitInto — kept for any external callers. */
function nodeGraphCrossoverLrSplit(state, x, fc, lrOrder, rate) {
  nodeGraphCrossoverLrSplitInto(state, x, fc, lrOrder, rate);
  return { low: state._low, high: state._high };
}

/** Compensation allpass ≈ LP+HP of an LR stage (RS-MET branch compensation). */
function nodeGraphCrossoverLrAllpass(state, x, fc, lrOrder, rate) {
  nodeGraphCrossoverLrSplitInto(state, x, fc, lrOrder, rate);
  return state._low + state._high;
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
  return {
    bandCount: n,
    splits,
    comps,
    // Scratch (reused every sample — do not allocate in the audio hot path).
    bands: new Array(n),
    sortedFreqs: new Array(splitCount),
  };
}

function createNodeGraphCrossoverStereoState(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const portPairs = [];
  for (let i = 0; i < n; i += 1) {
    portPairs.push(nodeGraphCrossoverBandPortPair(n, i));
  }
  return {
    left: createNodeGraphCrossoverChannelState(n),
    right: createNodeGraphCrossoverChannelState(n),
    // Reused port map object (mutated in place each sample).
    out: Object.create(null),
    portPairs,
    bandCount: n,
  };
}

/** Write non-decreasing freqs into `dest` (length count). No alloc. */
function nodeGraphCrossoverFillSortedFreqs(dest, freqs, count) {
  const n = Math.max(0, count);
  for (let i = 0; i < n; i += 1) {
    dest[i] = Math.max(0, Number(freqs[i]) || 0);
  }
  for (let i = 1; i < n; i += 1) {
    if (dest[i] < dest[i - 1]) dest[i] = dest[i - 1];
  }
  return dest;
}

function nodeGraphCrossoverSortedFreqs(freqs, count) {
  const n = Math.max(0, count);
  const out = new Array(n);
  nodeGraphCrossoverFillSortedFreqs(out, freqs, n);
  return out;
}

/**
 * Process one channel into ch.bands (low → high). Returns ch.bands.
 *
 * Tree topology (RS-MET CrossOverNWay style): N-way uses exactly N-1 LR splits.
 * Older successive-extract + compensation-allpass was O(N²) LR passes and could
 * blow the audio budget on 4-way LR8 even for a single sine (see interrupted
 * audio patch). Tree keeps flat magnitude sum with far less CPU.
 */
function nodeGraphCrossoverProcessChannel(ch, x, freqs, lrOrder, rate) {
  const n = ch.bandCount;
  const splitCount = n - 1;
  if (!ch.bands || ch.bands.length !== n) {
    ch.bands = new Array(n);
  }
  if (!ch.sortedFreqs || ch.sortedFreqs.length !== splitCount) {
    ch.sortedFreqs = new Array(splitCount);
  }
  const f = nodeGraphCrossoverFillSortedFreqs(ch.sortedFreqs, freqs, splitCount);
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  const bands = ch.bands;
  const splits = ch.splits;
  const xin = Number(x) || 0;

  if (n === 2) {
    nodeGraphCrossoverLrSplitInto(splits[0], xin, f[0], order, rate);
    bands[0] = splits[0]._low;
    bands[1] = splits[0]._high;
    return bands;
  }

  if (n === 3) {
    // low | mid | high
    nodeGraphCrossoverLrSplitInto(splits[0], xin, f[0], order, rate);
    bands[0] = splits[0]._low;
    nodeGraphCrossoverLrSplitInto(splits[1], splits[0]._high, f[1], order, rate);
    bands[1] = splits[1]._low;
    bands[2] = splits[1]._high;
    return bands;
  }

  if (n === 4) {
    // Balanced tree: mid split f1, then f0 on low half, f2 on high half.
    nodeGraphCrossoverLrSplitInto(splits[1], xin, f[1], order, rate);
    const midLow = splits[1]._low;
    const midHigh = splits[1]._high;
    nodeGraphCrossoverLrSplitInto(splits[0], midLow, f[0], order, rate);
    bands[0] = splits[0]._low;
    bands[1] = splits[0]._high;
    nodeGraphCrossoverLrSplitInto(splits[2], midHigh, f[2], order, rate);
    bands[2] = splits[2]._low;
    bands[3] = splits[2]._high;
    return bands;
  }

  if (n === 5) {
    // Root at f2; low half → f0/f1 chain; high half → f3.
    nodeGraphCrossoverLrSplitInto(splits[2], xin, f[2], order, rate);
    const lowHalf = splits[2]._low;
    const highHalf = splits[2]._high;
    nodeGraphCrossoverLrSplitInto(splits[0], lowHalf, f[0], order, rate);
    bands[0] = splits[0]._low;
    nodeGraphCrossoverLrSplitInto(splits[1], splits[0]._high, f[1], order, rate);
    bands[1] = splits[1]._low;
    bands[2] = splits[1]._high;
    nodeGraphCrossoverLrSplitInto(splits[3], highHalf, f[3], order, rate);
    bands[3] = splits[3]._low;
    bands[4] = splits[3]._high;
    return bands;
  }

  // n === 6: root f2; each half is a 3-way (f0,f1) / (f3,f4).
  nodeGraphCrossoverLrSplitInto(splits[2], xin, f[2], order, rate);
  const lowHalf6 = splits[2]._low;
  const highHalf6 = splits[2]._high;
  nodeGraphCrossoverLrSplitInto(splits[0], lowHalf6, f[0], order, rate);
  bands[0] = splits[0]._low;
  nodeGraphCrossoverLrSplitInto(splits[1], splits[0]._high, f[1], order, rate);
  bands[1] = splits[1]._low;
  bands[2] = splits[1]._high;
  nodeGraphCrossoverLrSplitInto(splits[3], highHalf6, f[3], order, rate);
  bands[3] = splits[3]._low;
  nodeGraphCrossoverLrSplitInto(splits[4], splits[3]._high, f[4], order, rate);
  bands[4] = splits[4]._low;
  bands[5] = splits[4]._high;
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
 * @returns {Record<string, number>} port map (reused object — read immediately)
 */
function nodeGraphCrossoverSample(state, mono, leftIn, rightIn, freqs, lrOrder, sampleRate, bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (!state.left || state.left.bandCount !== n || !state.out || !state.portPairs) {
    Object.assign(state, createNodeGraphCrossoverStereoState(n));
  }
  const m = Number(mono) || 0;
  const lIn = (Number(leftIn) || 0) + m;
  const rIn = (Number(rightIn) || 0) + m;
  const order = nodeGraphCrossoverClampLrOrder(lrOrder);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const out = state.out;
  const portPairs = state.portPairs;

  // Mono (or identical L/R): process one channel and mirror — halves CPU for the
  // common mono-In wiring pattern without changing the stereo algorithm.
  if (lIn === rIn) {
    const bands = nodeGraphCrossoverProcessChannel(state.left, lIn, freqs, order, rate);
    for (let i = 0; i < n; i += 1) {
      const pair = portPairs[i];
      const v = Number.isFinite(bands[i]) ? bands[i] : 0;
      out[pair.L] = v;
      out[pair.R] = v;
    }
    return out;
  }

  const bandsL = nodeGraphCrossoverProcessChannel(state.left, lIn, freqs, order, rate);
  const bandsR = nodeGraphCrossoverProcessChannel(state.right, rIn, freqs, order, rate);
  for (let i = 0; i < n; i += 1) {
    const pair = portPairs[i];
    out[pair.L] = Number.isFinite(bandsL[i]) ? bandsL[i] : 0;
    out[pair.R] = Number.isFinite(bandsR[i]) ? bandsR[i] : 0;
  }
  return out;
}

/**
 * Band labels for UI (display face): first = Low, last = High.
 * 3-way mids = Mid; 4+ mids = 1..N-2.
 * e.g. 2→Low/High, 3→Low/Mid/High, 4→Low/1/2/High
 */
function nodeGraphCrossoverBandNames(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  if (n === 2) {
    return ["Low", "High"];
  }
  if (n === 3) {
    return ["Low", "Mid", "High"];
  }
  const names = ["Low"];
  for (let i = 1; i <= n - 2; i += 1) {
    names.push(String(i));
  }
  names.push("High");
  return names;
}

/**
 * Stereo outlet names for band index i (0-based).
 * Low/High → LFL/LFR, HFL/HFR; 3-way mid → ML/MR; 4+ mids → L1/R1, L2/R2, …
 * @returns {{ L: string, R: string }}
 */
function nodeGraphCrossoverBandPortPair(bandCount, bandIndex) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const i = Math.max(0, Math.min(n - 1, Math.round(Number(bandIndex) || 0)));
  if (i === 0) {
    return { L: "LFL", R: "LFR" };
  }
  if (i === n - 1) {
    return { L: "HFL", R: "HFR" };
  }
  // 3-way single mid band: ML / MR (not L1/R1).
  if (n === 3) {
    return { L: "ML", R: "MR" };
  }
  // 4+ mid bands 1..N-2 → L1/R1, L2/R2, …
  return { L: `L${i}`, R: `R${i}` };
}

/** Canonical stereo outs: LFL, LFR, [ML/MR | L1 R1 …], HFL, HFR. */
function nodeGraphCrossoverOutputPorts(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const outs = [];
  for (let i = 0; i < n; i += 1) {
    const pair = nodeGraphCrossoverBandPortPair(n, i);
    outs.push(pair.L, pair.R);
  }
  return outs;
}

/** Map legacy port names (Low L, High R, Mid, L1, Band N, "1 L", …) → current scheme. */
function nodeGraphCrossoverOutputAliases(bandCount) {
  const n = Math.max(2, Math.min(6, Math.round(Number(bandCount) || 2)));
  const aliases = {};
  // Older title sets → current band index.
  const legacyTitles = {
    2: ["Low", "High"],
    3: ["Low", "Mid", "High"],
    4: ["Low", "Low-Mid", "High-Mid", "High"],
    5: ["Band 1", "Band 2", "Band 3", "Band 4", "Band 5"],
    6: ["Band 1", "Band 2", "Band 3", "Band 4", "Band 5", "Band 6"],
  };
  const titles = legacyTitles[n] || nodeGraphCrossoverBandNames(n);
  for (let i = 0; i < n; i += 1) {
    const { L, R } = nodeGraphCrossoverBandPortPair(n, i);
    const title = titles[i] || String(i);
    // Spaced forms: "Low L", "1 L", "Mid Left", …
    aliases[`${title} Left`] = L;
    aliases[`${title} Right`] = R;
    aliases[`${title} L`] = L;
    aliases[`${title} R`] = R;
    aliases[`Left ${title}`] = L;
    aliases[`Right ${title}`] = R;
    // Numeric mid: "1 L" / "L 1" → L1 (or ML for 3-way)
    if (i > 0 && i < n - 1) {
      aliases[`${i} L`] = L;
      aliases[`${i} R`] = R;
      aliases[`${i} Left`] = L;
      aliases[`${i} Right`] = R;
      aliases[`L ${i}`] = L;
      aliases[`R ${i}`] = R;
      // Pre-ML scheme used L1/R1 for 3-way mid.
      aliases[`L${i}`] = L;
      aliases[`R${i}`] = R;
    }
    // Already-canonical names map to themselves (idempotent).
    aliases[L] = L;
    aliases[R] = R;
  }
  // Explicit previous Low/High L·R scheme (pre-LFL rename).
  const low = nodeGraphCrossoverBandPortPair(n, 0);
  const high = nodeGraphCrossoverBandPortPair(n, n - 1);
  aliases["Low L"] = low.L;
  aliases["Low R"] = low.R;
  aliases["Low Left"] = low.L;
  aliases["Low Right"] = low.R;
  aliases["High L"] = high.L;
  aliases["High R"] = high.R;
  aliases["High Left"] = high.L;
  aliases["High Right"] = high.R;
  if (n === 3) {
    const mid = nodeGraphCrossoverBandPortPair(n, 1);
    aliases["L1"] = mid.L;
    aliases["R1"] = mid.R;
    aliases["Mid L"] = mid.L;
    aliases["Mid R"] = mid.R;
    aliases["Mid Left"] = mid.L;
    aliases["Mid Right"] = mid.R;
  }
  return aliases;
}

/**
 * Slider label for split frequency k (1-based among N-1 splits).
 * All crossovers: "Freq L1", "Freq L2", … (2-way single also "Freq L1").
 */
function nodeGraphCrossoverFrequencyLabel(splitIndex1Based) {
  const i = Math.max(1, Math.round(Number(splitIndex1Based) || 1));
  return `Freq L${i}`;
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
