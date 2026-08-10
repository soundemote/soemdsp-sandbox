// Quadrature network (IIR) — pure math (main + worklet).
// Low-latency IIR pair for ~+90° relative phase (Hilbert-class tool).
//
// Four-section allpass pair (published coefficients): I is reference phase,
// Q leads I by ~90°. One sample delay on I aligns the pair. Both legs share
// the same allpass phase distortion so Mid from I and Side from Q stay
// ~90° apart.
//
// Realtime, no host delay compensation — ~1 sample group delay is audible.

/** @returns {{ c: number, x1: number, x2: number, y1: number, y2: number }} */
function nodeGraphQuadratureMakeSection(c) {
  return { c: Number(c) || 0, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function nodeGraphQuadratureSectionProcess(sec, x) {
  const y = sec.c * (x + sec.y2) - sec.x2;
  sec.x2 = sec.x1;
  sec.x1 = x;
  sec.y2 = sec.y1;
  // Flush denormals
  const yy = Math.abs(y) < 1e-25 ? 0 : y;
  sec.y1 = yy;
  return yy;
}

/** Published pole radii for the allpass pair; sections use radius² as coeff. */
const NODE_GRAPH_QUADRATURE_I_RADII = Object.freeze([
  0.6923877778065,
  0.9360654322959,
  0.9882295226860,
  0.9987488452737,
]);
const NODE_GRAPH_QUADRATURE_Q_RADII = Object.freeze([
  0.4021921162426,
  0.8561710882420,
  0.9722909545651,
  0.9952884791278,
]);

function nodeGraphQuadratureMakeNet() {
  return {
    iChain: NODE_GRAPH_QUADRATURE_I_RADII.map((r) => nodeGraphQuadratureMakeSection(r * r)),
    qChain: NODE_GRAPH_QUADRATURE_Q_RADII.map((r) => nodeGraphQuadratureMakeSection(r * r)),
    delayed: 0,
  };
}

function nodeGraphQuadratureClearNet(net) {
  if (!net) return;
  for (const s of net.iChain) {
    s.x1 = s.x2 = s.y1 = s.y2 = 0;
  }
  for (const s of net.qChain) {
    s.x1 = s.x2 = s.y1 = s.y2 = 0;
  }
  net.delayed = 0;
}

/**
 * One sample through one quadrature network.
 * @returns {{ i: number, q: number }}
 */
function nodeGraphQuadratureNetProcess(net, input) {
  const x = Number(input) || 0;
  let i = x;
  for (let k = 0; k < net.iChain.length; k += 1) {
    i = nodeGraphQuadratureSectionProcess(net.iChain[k], i);
  }
  let q = x;
  for (let k = 0; k < net.qChain.length; k += 1) {
    q = nodeGraphQuadratureSectionProcess(net.qChain[k], q);
  }
  // I chain one sample ahead of Q by construction — delay I to align.
  const outI = net.delayed;
  net.delayed = Math.abs(i) < 1e-25 ? 0 : i;
  const outQ = Math.abs(q) < 1e-25 ? 0 : q;
  return { i: outI, q: outQ };
}

/**
 * Module state: side/main net (In/Side → I,Q) + mid net (Mid → MidI).
 */
function createNodeGraphQuadratureState() {
  return {
    side: nodeGraphQuadratureMakeNet(),
    mid: nodeGraphQuadratureMakeNet(),
  };
}

/**
 * Dual-bus process: Side/In → I,Q; Mid → MidI; SideQ mirrors Side Q.
 * @param {object} state
 * @param {number} sideIn  Side or mono In (rotated path → Q)
 * @param {number} midIn   Mid (aligned I path)
 * @returns {{ I: number, Q: number, MidI: number, SideQ: number }}
 */
function nodeGraphQuadratureFrame(state, sideIn, midIn) {
  if (!state || !state.side || !state.mid) {
    return { I: 0, Q: 0, MidI: 0, SideQ: 0 };
  }
  const side = nodeGraphQuadratureNetProcess(state.side, sideIn);
  const mid = nodeGraphQuadratureNetProcess(state.mid, midIn);
  return {
    I: side.i,
    Q: side.q,
    MidI: mid.i,
    SideQ: side.q,
  };
}
