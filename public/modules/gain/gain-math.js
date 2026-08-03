// Gain — pure math (main thread + AudioWorklet).
// Mono sums into L/R before scale (same as Bias / Gain Bias).

function nodeGraphGainSample(input, amount) {
  return (Number(input) || 0) * (Number(amount) || 0);
}

/**
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphGainFrame(mono, left, right, amount) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphGainSample(m, amount),
    Left: nodeGraphGainSample((Number(left) || 0) + m, amount),
    Right: nodeGraphGainSample((Number(right) || 0) + m, amount),
  };
}
