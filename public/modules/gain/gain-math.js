// Gain — pure math (main thread + AudioWorklet).
// out = in * amount + offset (scale first, then offset).
// Mono sums into L/R before scale (same as Bias).

function nodeGraphGainSample(input, amount, offset = 0) {
  return (Number(input) || 0) * (Number(amount) || 0) + (Number(offset) || 0);
}

/**
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphGainFrame(mono, left, right, amount, offset = 0) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphGainSample(m, amount, offset),
    Left: nodeGraphGainSample((Number(left) || 0) + m, amount, offset),
    Right: nodeGraphGainSample((Number(right) || 0) + m, amount, offset),
  };
}

// Legacy aliases (Gain Bias removed — same math as Gain with offset).
function nodeGraphGainBiasSample(input, amount, offset) {
  return nodeGraphGainSample(input, amount, offset);
}
function nodeGraphGainBiasFrame(mono, left, right, amount, offset) {
  return nodeGraphGainFrame(mono, left, right, amount, offset);
}
