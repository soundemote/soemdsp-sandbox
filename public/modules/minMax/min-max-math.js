// Min/Max — pure math (main thread + worklet JS path).
// connectedMask bit i set → values[i] participates.

/**
 * @param {number[]} values length 4
 * @param {number} connectedMask
 * @returns {{ Min: number, Max: number }}
 */
function nodeGraphMinMaxCore(values, connectedMask) {
  let have = false;
  let lo = 0;
  let hi = 0;
  const list = values || [];
  for (let i = 0; i < 4; i++) {
    if (!(connectedMask & (1 << i))) continue;
    const v = Number(list[i]) || 0;
    if (!have) {
      lo = v;
      hi = v;
      have = true;
    } else {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return {
    Max: have ? hi : 0,
    Min: have ? lo : 0,
  };
}
