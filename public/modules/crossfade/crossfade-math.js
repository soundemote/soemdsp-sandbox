// Crossfade2 / Crossfade3 / Crossfade4 — adjacent stereo-pair blend.
// Crossfade address 0..(N-1); lastIndex = N-1. Pairs beyond lastIndex ignored.

/**
 * @param {{ L1?: number, R1?: number, L2?: number, R2?: number, L3?: number, R3?: number, L4?: number, R4?: number }} inputs
 * @param {{ crossfade?: number, lastIndex?: number }} params
 * @returns {{ Left: number, Right: number }}
 */
function nodeGraphCrossfadeFrame(inputs, params) {
  const src = inputs && typeof inputs === "object" ? inputs : {};
  const p = params && typeof params === "object" ? params : {};
  const lastRaw = Number(p.lastIndex);
  const last = Number.isFinite(lastRaw)
    ? Math.max(1, Math.min(3, Math.round(lastRaw)))
    : 1;
  const cf = nodeGraphFiniteNumber(p.crossfade);
  const addr = cf < 0 ? 0 : (cf > last ? last : cf);
  let i0 = Math.floor(addr);
  if (i0 < 0) i0 = 0;
  if (i0 > last) i0 = last;
  let i1 = i0 + 1;
  if (i1 > last) i1 = last;
  let frac = addr - i0;
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  const pair = (i) => ({
    L: nodeGraphFiniteNumber(src[`L${i + 1}`]),
    R: nodeGraphFiniteNumber(src[`R${i + 1}`]),
  });
  const a = pair(i0);
  const b = pair(i1);
  return {
    Left: a.L * (1 - frac) + b.L * frac,
    Right: a.R * (1 - frac) + b.R * frac,
  };
}