// MixStereo — four stereo pairs + Mono → Mono / Left / Right.
// Per-pair Volume + Pan, then Amplitude (All). Volumes are dB (Gain/Output).
// Pan uses the same equal-power law as Output (−1 left, 0 unity, +1 right).
// Mono in is added to both sides after the pairs (master Amplitude applies).
// Mono out is (Left + Right) / 2.

function nodeGraphMixStereoDbToLin(db) {
  if (typeof nodeGraphGainDbToLin === "function") {
    return nodeGraphGainDbToLin(db);
  }
  const x = Number(db);
  if (!Number.isFinite(x) || x <= -140) {
    return 0;
  }
  return 10 ** (x / 20);
}

function nodeGraphMixStereoPanGains(pan) {
  if (typeof nodeGraphOutputPanGains === "function") {
    return nodeGraphOutputPanGains(pan);
  }
  const p = Math.max(-1, Math.min(1, Number(pan) || 0));
  if (p <= 0) {
    return { left: 1, right: Math.cos(-p * Math.PI * 0.5) };
  }
  return { left: Math.cos(p * Math.PI * 0.5), right: 1 };
}

/**
 * @param {{ Mono?: number, L1?: number, R1?: number, L2?: number, R2?: number, L3?: number, R3?: number, L4?: number, R4?: number }} inputs
 * @param {{ volume1?: number, pan1?: number, volume2?: number, pan2?: number, volume3?: number, pan3?: number, volume4?: number, pan4?: number, amplitude?: number }} params
 * @returns {{ Mono: number, Left: number, Right: number }}
 */
function nodeGraphMixStereoFrame(inputs, params) {
  const src = inputs && typeof inputs === "object" ? inputs : {};
  const p = params && typeof params === "object" ? params : {};
  const master = nodeGraphMixStereoDbToLin(p.amplitude);
  let left = 0;
  let right = 0;
  for (let i = 1; i <= 4; i += 1) {
    const vol = nodeGraphMixStereoDbToLin(p[`volume${i}`]) * master;
    const pan = nodeGraphMixStereoPanGains(p[`pan${i}`]);
    const L = Number(src[`L${i}`]) || 0;
    const R = Number(src[`R${i}`]) || 0;
    left += L * vol * pan.left;
    right += R * vol * pan.right;
  }
  const monoIn = (Number(src.Mono) || 0) * master;
  left += monoIn;
  right += monoIn;
  return {
    Mono: (left + right) * 0.5,
    Left: left,
    Right: right,
  };
}
