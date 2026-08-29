// Range — pure math for legacy / full-product only.
// Efficient product uses native graph_engine (no JS DSP twin).
// Out = outLow + (in - inLow) / (inHigh - inLow) * (outHigh - outLow).

function nodeGraphRangeSample(input, inLow, inHigh, outLow, outHigh) {
  const x = Number(input) || 0;
  const lo = Number(inLow);
  const hi = Number(inHigh);
  const oLo = Number(outLow);
  const oHi = Number(outHigh);
  const a = Number.isFinite(lo) ? lo : -1;
  const b = Number.isFinite(hi) ? hi : 1;
  const c = Number.isFinite(oLo) ? oLo : 0;
  const d = Number.isFinite(oHi) ? oHi : 1000;
  const den = b - a;
  if (!(den * 0.0 === 0.0) || (den > -1e-30 && den < 1e-30)) {
    return c;
  }
  return c + (x - a) / den * (d - c);
}

/**
 * @returns {{ Out: number }}
 */
function nodeGraphRangeFrame(input, inLow, inHigh, outLow, outHigh) {
  return {
    Out: nodeGraphRangeSample(input, inLow, inHigh, outLow, outHigh),
  };
}
