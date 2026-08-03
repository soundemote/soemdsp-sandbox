// Metallic Ratio — pure closed-form math (main + worklet JS path).
// metallic(n) = (n + sqrt(n^2 + 4)) / 2 — metallic means (golden, silver, …).
// Mirrors native_modules/metallic_ratio.

function nodeGraphMetallicRatioSample(index) {
  const n = Number(index) || 0;
  return {
    Ratio: 0.5 * (n + Math.sqrt(n * n + 4)),
  };
}
