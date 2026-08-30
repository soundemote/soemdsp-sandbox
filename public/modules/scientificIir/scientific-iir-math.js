// Shared classical IIR cascade (mirrors native scientific_iir.h).
// Used offline/render and as worklet fallback when wasm is unavailable.
// Kinds: 0 Butterworth, 1 Linkwitz-Riley, 2 Bessel, 3 Chebyshev, 4 Elliptic
// Modes: 0 LP, 1 HP, 2 BP, 3 BR

const nodeGraphScientificIirKinds = Object.freeze({
  butterworth: 0,
  linkwitzRiley: 1,
  bessel: 2,
  chebyshev: 3,
  elliptic: 4,
});

const nodeGraphScientificIirModes = Object.freeze(["LP", "HP", "BP", "BR"]);

function createNodeGraphScientificIirState() {
  return {
    sections: [],
    lastKind: -1,
    lastMode: -1,
    lastOrder: -1,
    lastFreq: NaN,
    lastBw: NaN,
    lastRipple: NaN,
    lastRate: NaN,
    nativeHandle: 0,
  };
}

function createNodeGraphStereoScientificIirState() {
  return {
    left: createNodeGraphScientificIirState(),
    mono: createNodeGraphScientificIirState(),
    right: createNodeGraphScientificIirState(),
  };
}

function nodeGraphScientificIirClampOrder(order) {
  let o = Math.round(Number(order) || 4);
  if (o < 2) o = 2;
  if (o > 8) o = 8;
  if (o & 1) o += 1;
  return o;
}

function nodeGraphScientificIirButterworthQ(order, i) {
  const ang = ((2 * i + 1) * Math.PI) / (2 * order);
  const s = Math.sin(ang);
  return 1 / (2 * Math.max(1e-9, s));
}

function nodeGraphScientificIirBesselQ(order, i) {
  if (order <= 2) return 0.57735026919;
  if (order <= 4) {
    const q4 = [0.805538, 0.521935];
    return q4[Math.max(0, Math.min(1, i))];
  }
  if (order <= 6) {
    const q6 = [1.023314, 0.611195, 0.510318];
    return q6[Math.max(0, Math.min(2, i))];
  }
  const q8 = [1.225670, 0.710852, 0.559609, 0.505991];
  return q8[Math.max(0, Math.min(3, i))];
}

function nodeGraphScientificIirChebyEps(rippleDb) {
  const r = Math.max(0.01, Number(rippleDb) || 0.01);
  const ten = Math.pow(10, r / 10);
  return Math.sqrt(Math.max(1e-12, ten - 1));
}

function nodeGraphScientificIirEllipticQ(order, i, rippleDb) {
  const qb = nodeGraphScientificIirButterworthQ(order, i);
  const boost = 1 + 0.35 * Math.max(0.1, Number(rippleDb) || 0.1);
  return qb * boost * (1 + 0.15 * i);
}

function nodeGraphScientificIirDesignSection(mode, f0, Q, rate) {
  const sr = Math.max(1, nodeGraphFiniteNumber(rate, 44100));
  let f = Math.max(1e-9, Math.min(sr * 0.49, Number(f0) || 0));
  const q = Math.max(0.05, Math.min(100, Number(Q) || 0.707));
  const w0 = (2 * Math.PI * f) / sr;
  const sinw = Math.sin(w0);
  const cosw = Math.cos(w0);
  const alpha = sinw / (2 * q);
  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1 + alpha;
  let a1 = -2 * cosw;
  let a2 = 1 - alpha;
  if (mode === 0) {
    b1 = 1 - cosw;
    b0 = 0.5 * b1;
    b2 = b0;
  } else if (mode === 1) {
    b1 = -(1 + cosw);
    b0 = -0.5 * b1;
    b2 = b0;
  } else if (mode === 2) {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else {
    b0 = 1;
    b1 = -2 * cosw;
    b2 = 1;
  }
  const inv = a0 !== 0 ? 1 / a0 : 1;
  return {
    b0: b0 * inv,
    b1: b1 * inv,
    b2: b2 * inv,
    a1: a1 * inv,
    a2: a2 * inv,
    z1: 0,
    z2: 0,
  };
}

function nodeGraphScientificIirSectionQs(kind, order, mode, bandwidthOct, rippleDb) {
  const n = nodeGraphScientificIirClampOrder(order);
  const m = n / 2;
  const bw = Math.max(0.05, nodeGraphFiniteNumber(bandwidthOct, 1));
  let bandQ = 1 / (2 * (bw * 0.5));
  bandQ = Math.max(0.2, Math.min(50, bandQ));
  const qs = [];
  for (let i = 0; i < m; i += 1) {
    let Q = 0.707;
    if (kind === 0) Q = nodeGraphScientificIirButterworthQ(n, i);
    else if (kind === 2) Q = nodeGraphScientificIirBesselQ(n, i);
    else if (kind === 3) {
      const eps = nodeGraphScientificIirChebyEps(rippleDb);
      Q = nodeGraphScientificIirButterworthQ(n, i) * (1 + 0.5 * eps * (1 + i));
    } else if (kind === 4) Q = nodeGraphScientificIirEllipticQ(n, i, rippleDb);
    if (mode === 2 || mode === 3) Q = bandQ;
    qs.push(Q);
  }
  return qs;
}

function nodeGraphScientificIirDesign(kind, mode, order, freqHz, bandwidthOct, rippleDb, sampleRate) {
  const safeMode = Math.max(0, Math.min(3, Math.round(Number(mode) || 0)));
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const freq = Math.max(0, Number(freqHz) || 0);
  // Linkwitz-Riley: two identical Butterworth of half order
  if (kind === 1 && Number(order) <= 2) {
    const a = Math.exp(-Math.min(2.8, (2 * Math.PI * Math.max(1e-6, freq)) / rate));
    const sec = safeMode === 1
      ? { b0: 0.5 * (1 + a), b1: -0.5 * (1 + a), b2: 0, a1: -a, a2: 0, z1: 0, z2: 0 }
      : { b0: 1 - a, b1: 0, b2: 0, a1: -a, a2: 0, z1: 0, z2: 0 };
    return [{ ...sec }, { ...sec }];
  }
  if (kind === 1) {
    let half = nodeGraphScientificIirClampOrder(order) / 2;
    if (half < 2) half = 2;
    if (half & 1) half += 1;
    const halfSecs = nodeGraphScientificIirDesign(0, safeMode, half, freq, bandwidthOct, rippleDb, rate);
    return halfSecs.concat(
      halfSecs.map((s) => ({
        b0: s.b0,
        b1: s.b1,
        b2: s.b2,
        a1: s.a1,
        a2: s.a2,
        z1: 0,
        z2: 0,
      })),
    );
  }
  const qs = nodeGraphScientificIirSectionQs(kind, order, safeMode, bandwidthOct, rippleDb);
  return qs.map((Q) => nodeGraphScientificIirDesignSection(safeMode, freq, Q, rate));
}

function nodeGraphScientificIirEnsure(state, kind, mode, order, freqHz, bandwidthOct, rippleDb, sampleRate) {
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const safeKind = Math.max(0, Math.min(4, Math.round(Number(kind) || 0)));
  const safeMode = Math.max(0, Math.min(3, Math.round(Number(mode) || 0)));
  const safeOrder = nodeGraphScientificIirClampOrder(order);
  const freq = Math.max(0, Number(freqHz) || 0);
  const bw = Math.max(0.05, nodeGraphFiniteNumber(bandwidthOct, 1));
  const ripple = Math.max(0.01, Number(rippleDb) || 0.01);
  if (
    state.lastKind === safeKind
    && state.lastMode === safeMode
    && state.lastOrder === safeOrder
    && state.lastFreq === freq
    && state.lastBw === bw
    && state.lastRipple === ripple
    && state.lastRate === rate
  ) {
    return;
  }
  const hard =
    state.lastKind !== safeKind
    || state.lastMode !== safeMode
    || state.lastOrder !== safeOrder
    || !state.sections
    || state.sections.length === 0;
  const prev = Array.isArray(state.sections) ? state.sections : [];
  state.sections = nodeGraphScientificIirDesign(safeKind, safeMode, safeOrder, freq, bw, ripple, rate);
  if (hard) {
    for (let i = 0; i < state.sections.length; i += 1) {
      state.sections[i].z1 = 0;
      state.sections[i].z2 = 0;
    }
  } else {
    for (let i = 0; i < state.sections.length; i += 1) {
      if (prev[i]) {
        state.sections[i].z1 = prev[i].z1;
        state.sections[i].z2 = prev[i].z2;
      }
    }
  }
  state.lastKind = safeKind;
  state.lastMode = safeMode;
  state.lastOrder = safeOrder;
  state.lastFreq = freq;
  state.lastBw = bw;
  state.lastRipple = ripple;
  state.lastRate = rate;
}

function nodeGraphScientificIirSample(state, input, kind, mode, frequency, order, bandwidth, ripple, sampleRate) {
  if (!state || typeof state !== "object") return 0;
  nodeGraphScientificIirEnsure(state, kind, mode, order, frequency, bandwidth, ripple, sampleRate);
  let y = Number(input) || 0;
  const secs = state.sections || [];
  for (let i = 0; i < secs.length; i += 1) {
    const s = secs[i];
    const out = s.b0 * y + s.z1;
    s.z1 = s.b1 * y - s.a1 * out + s.z2;
    s.z2 = s.b2 * y - s.a2 * out;
    y = out;
  }
  return Number.isFinite(y) ? y : 0;
}
