// Gain Bias — pure math (main thread + AudioWorklet).
// out = in * amount + offset (scale first, then offset).

function nodeGraphGainBiasSample(input, amount, offset) {
  return (Number(input) || 0) * (Number(amount) || 0) + (Number(offset) || 0);
}

/**
 * Mono sums into L/R before scale (same contract as Gain / Bias modules).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphGainBiasFrame(mono, left, right, amount, offset) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphGainBiasSample(m, amount, offset),
    Left: nodeGraphGainBiasSample((Number(left) || 0) + m, amount, offset),
    Right: nodeGraphGainBiasSample((Number(right) || 0) + m, amount, offset),
  };
}
