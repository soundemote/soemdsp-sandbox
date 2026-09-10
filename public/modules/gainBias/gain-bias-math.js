// Gain Bias — pure math (main thread + AudioWorklet).
// out = in * amount + offset (scale first, then offset).

function nodeGraphGainBiasSample(input, amount, offset) {
  return (nodeGraphFiniteNumber(input)) * (nodeGraphFiniteNumber(amount)) + (nodeGraphFiniteNumber(offset));
}

/**
 * Mono sums into L/R before scale (same contract as Gain / Bias modules).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphGainBiasFrame(mono, left, right, amount, offset) {
  const m = nodeGraphFiniteNumber(mono);
  return {
    Out: nodeGraphGainBiasSample(m, amount, offset),
    Left: nodeGraphGainBiasSample((nodeGraphFiniteNumber(left)) + m, amount, offset),
    Right: nodeGraphGainBiasSample((nodeGraphFiniteNumber(right)) + m, amount, offset),
  };
}
