// Mono Hilbert — +90° / −90° / 0° (Q, −Q, or delay-matched I).
// Reuses quadrature-math.js. One in, one out.

function createNodeGraphHilbertState() {
  return { net: nodeGraphQuadratureMakeNet() };
}

/**
 * @param {object} state
 * @param {number} input
 * @param {number} mode  0 = +90° (Q), 1 = −90° (−Q), 2 = 0° (I)
 * @returns {{ Out: number }}
 */
function nodeGraphHilbertFrame(state, input, mode) {
  if (!state || !state.net) {
    return { Out: 0 };
  }
  const pair = nodeGraphQuadratureNetProcess(state.net, input);
  const m = Math.round(Number(mode) || 0);
  if (m >= 2) {
    return { Out: pair.i };
  }
  if (m === 1) {
    return { Out: -pair.q };
  }
  return { Out: pair.q };
}
