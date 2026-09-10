// Compatibility shim — formula lives in modules/metallicRatio/metallic-ratio-math.js.
// Kept so older script tags / docs still resolve.
// Prefer loading the module math file directly.

if (typeof nodeGraphMetallicRatioSample !== "function") {
  function nodeGraphMetallicRatioSample(index) {
    const n = nodeGraphFiniteNumber(index);
    return {
      Ratio: 0.5 * (n + Math.sqrt(n * n + 4)),
    };
  }
}
