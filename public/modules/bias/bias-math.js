// Bias — pure math (main thread + AudioWorklet).
// Mono sums into L/R before offset (same as Gain / Gain Bias).

function nodeGraphBiasSample(input, offset) {
  return (Number(input) || 0) + (Number(offset) || 0);
}

/**
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphBiasFrame(mono, left, right, offset) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphBiasSample(m, offset),
    Left: nodeGraphBiasSample((Number(left) || 0) + m, offset),
    Right: nodeGraphBiasSample((Number(right) || 0) + m, offset),
  };
}
