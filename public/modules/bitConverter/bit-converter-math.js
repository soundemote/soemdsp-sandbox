// Bit Converter — pure math (main thread; no worklet peel required if only live).
// Full-scale integer 0…(2^bits−1) ↔ unipolar 0…1 / bipolar −1…1.

/**
 * @param {number} bits 1…53
 * @param {number} fullScale
 * @param {number} unipolar 0…1
 * @param {number} bipolar −1…1
 */
function nodeGraphBitConverterSample(bits, fullScale, unipolar, bipolar) {
  const b = Math.max(1, Math.min(53, Math.round(Number(bits) || 53)));
  const maxValue = 2 ** b - 1;
  const fs = Math.max(0, Math.min(maxValue, Number(fullScale) || 0));
  const uni = Math.max(0, Math.min(1, Number(unipolar) || 0));
  const bi = Math.max(-1, Math.min(1, Number(bipolar) || 0));
  return {
    "Full Scale to Unipolar": maxValue > 0 ? fs / maxValue : 0,
    "Full Scale to Bipolar": maxValue > 0 ? (fs / maxValue) * 2 - 1 : -1,
    "Unipolar to Full Scale": Math.round(uni * maxValue),
    "Bipolar to Full Scale": Math.round(((bi + 1) / 2) * maxValue),
  };
}
