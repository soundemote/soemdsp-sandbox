// Bias — pure math (main thread + AudioWorklet).
// Single In → Out + Offset. No Left/Right/Mono paths.

function nodeGraphBiasSample(input, offset) {
  return (nodeGraphFiniteNumber(input)) + (nodeGraphFiniteNumber(offset));
}

/**
 * @returns {{ Out: number }}
 */
function nodeGraphBiasFrame(input, _left, _right, offset) {
  return {
    Out: nodeGraphBiasSample(input, offset),
  };
}
