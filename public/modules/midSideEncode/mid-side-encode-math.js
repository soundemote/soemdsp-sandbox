// Mid/Side Encoder — pure math (main + worklet).
// 0.5 matrix:
//   M = (L + R) / 2
//   S = (L − R) / 2
// Mid/Side gains are dB after encode (0 dB = unity).

function nodeGraphMidSideDbToGain(db) {
  const d = Number(db);
  if (!Number.isFinite(d)) return 1;
  if (d <= -140) return 0;
  return Math.pow(10, d * (1 / 20));
}

function nodeGraphMidSideEncodeSample(left, right, midGainDb = 0, sideGainDb = 0) {
  const l = Number(left) || 0;
  const r = Number(right) || 0;
  const midG = nodeGraphMidSideDbToGain(midGainDb);
  const sideG = nodeGraphMidSideDbToGain(sideGainDb);
  return {
    Mid: 0.5 * (l + r) * midG,
    Side: 0.5 * (l - r) * sideG,
  };
}
