// Mid/Side Encoder — pure math (main + worklet).
// 0.5 matrix:
//   M = (L + R) / 2
//   S = (L − R) / 2
// Mid/Side gains are dB after encode (0 dB = unity).

function nodeGraphMidSideDbToGain(db) {
  return SoemMath.dbToAmp(db);
}

function nodeGraphMidSideEncodeSample(left, right, midGainDb = 0, sideGainDb = 0) {
  const l = nodeGraphFiniteNumber(left);
  const r = nodeGraphFiniteNumber(right);
  const midG = nodeGraphMidSideDbToGain(midGainDb);
  const sideG = nodeGraphMidSideDbToGain(sideGainDb);
  return {
    Mid: 0.5 * (l + r) * midG,
    Side: 0.5 * (l - r) * sideG,
  };
}
