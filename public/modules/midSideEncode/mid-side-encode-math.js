// Mid/Side Encoder — pure math (main + worklet).
// 0.5 matrix:
//   M = (L + R) / 2
//   S = (L − R) / 2
// Optional linear Mid/Side gains after encode (default 1).

function nodeGraphMidSideEncodeSample(left, right, midGain = 1, sideGain = 1) {
  const l = Number(left) || 0;
  const r = Number(right) || 0;
  const mg = Number(midGain);
  const sg = Number(sideGain);
  const midG = Number.isFinite(mg) ? mg : 1;
  const sideG = Number.isFinite(sg) ? sg : 1;
  return {
    Mid: 0.5 * (l + r) * midG,
    Side: 0.5 * (l - r) * sideG,
  };
}
