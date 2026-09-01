// Harmonic Series — pure CV Hz multiplier (main + worklet JS path).
// Zero-based: Harmonic 0 = ×1 (fundamental). Effective e = Harmonic + Offset.
// e ≥ 0 → mult = 1 + e; e < 0 → mult = 1 / (1 − e). Out = baseHz × mult.
// Mirrors native_modules/harmonic_series.

function nodeGraphHarmonicSeriesEffective(harmonic, offset) {
  const h = Number(harmonic);
  const o = Number(offset);
  const e = (Number.isFinite(h) ? h : 0) + (Number.isFinite(o) ? o : 0);
  return e;
}

function nodeGraphHarmonicSeriesMultiplier(effective) {
  const e = Number(effective);
  if (!Number.isFinite(e)) return 1;
  if (e >= 0) return 1 + e;
  const denom = 1 - e;
  if (!(denom > 0) || !Number.isFinite(denom)) return 0;
  return 1 / denom;
}

function nodeGraphHarmonicSeriesSample(baseHz, harmonic, offset) {
  const base = Number(baseHz);
  const safeBase = Number.isFinite(base) ? base : 0;
  const effective = nodeGraphHarmonicSeriesEffective(harmonic, offset);
  const mult = nodeGraphHarmonicSeriesMultiplier(effective);
  const hz = safeBase * mult;
  return {
    f: Number.isFinite(hz) ? hz : 0,
    f0: safeBase,
    effective,
    multiplier: mult,
  };
}
