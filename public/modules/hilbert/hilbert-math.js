// Mono Hilbert — +90° / −90° (Q of the IIR quadrature pair).
// Reuses quadrature-math.js. One in, one out.

function createNodeGraphHilbertState() {
  return { net: nodeGraphQuadratureMakeNet() };
}

/**
 * @param {object} state
 * @param {number} input
 * @param {number} sign  +1 = +90°, −1 = −90°
 * @returns {{ Out: number }}
 */
function nodeGraphHilbertFrame(state, input, sign) {
  if (!state || !state.net) {
    return { Out: 0 };
  }
  const pair = nodeGraphQuadratureNetProcess(state.net, input);
  const s = Number(sign) < 0 ? -1 : 1;
  return { Out: s * pair.q };
}
