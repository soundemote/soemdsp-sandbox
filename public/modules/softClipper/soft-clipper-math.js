// Soft Clipper — pure math (main thread; worklet prefers native when ready).

function nodeGraphSoftClipperSample(input, center = 0, width = 2) {
  const safeWidth = Math.max(0.000001, Math.abs(Number(width) || 2));
  const safeCenter = Number(center) || 0;
  const scaleX = 2 / safeWidth;
  const shiftX = -1 - (scaleX * (safeCenter - 0.5 * safeWidth));
  const scaleY = 1 / scaleX;
  const shiftY = -shiftX * scaleY;
  return shiftY + scaleY * Math.tanh(scaleX * (Number(input) || 0) + shiftX);
}

/**
 * Mono sums into L/R before clip (same port contract as Gain / Bias).
 * @returns {{ Out: number, Left: number, Right: number }}
 */
function nodeGraphSoftClipperFrame(mono, left, right, center, width) {
  const m = Number(mono) || 0;
  return {
    Out: nodeGraphSoftClipperSample(m, center, width),
    Left: nodeGraphSoftClipperSample((Number(left) || 0) + m, center, width),
    Right: nodeGraphSoftClipperSample((Number(right) || 0) + m, center, width),
  };
}
