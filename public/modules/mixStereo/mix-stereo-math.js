// MixStereo2 / MixStereo4 — stereo pairs → Left / Right.
// Per-pair Volume + Pan, then Amplitude (All). Volumes are dB (Gain/Output).
// Pan uses the same equal-power law as Output (−1 left, 0 unity, +1 right).
// MixStereo2 callers pass volume3/volume4 = −140 so unused pairs stay silent.

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
  const p = nodeGraphFiniteNumber(pan);
  if (p <= 0) {
    return { left: 1, right: Math.cos(-p * Math.PI * 0.5) };
  }
  return { left: Math.cos(p * Math.PI * 0.5), right: 1 };
}

/**
 * @param {{ L1?: number, R1?: number, L2?: number, R2?: number, L3?: number, R3?: number, L4?: number, R4?: number }} inputs
 * @param {{ volume1?: number, pan1?: number, volume2?: number, pan2?: number, volume3?: number, pan3?: number, volume4?: number, pan4?: number, amplitude?: number }} params
 * @returns {{ Left: number, Right: number }}
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
    const L = nodeGraphFiniteNumber(src[`L${i}`]);
    const R = nodeGraphFiniteNumber(src[`R${i}`]);
    left += L * vol * pan.left;
    right += R * vol * pan.right;
  }
  return {
    Left: left,
    Right: right,
  };
}
