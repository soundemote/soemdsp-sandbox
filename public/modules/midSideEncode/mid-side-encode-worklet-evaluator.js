// Mid/Side Encoder — worklet peel. Math: mid-side-encode-math.js.

NodeLiveAudioProcessor.prototype.midSideEncodeSample = function midSideEncodeSample(
  left,
  right,
  midGain = 1,
  sideGain = 1,
) {
  if (typeof nodeGraphMidSideEncodeSample === "function") {
    const out = nodeGraphMidSideEncodeSample(left, right, midGain, sideGain);
    return {
      Mid: this.safeFilterNumber(out.Mid, null) ?? 0,
      Side: this.safeFilterNumber(out.Side, null) ?? 0,
    };
  }
  const l = this.safeFilterNumber(left, null) ?? 0;
  const r = this.safeFilterNumber(right, null) ?? 0;
  const mg = this.safeFilterNumber(midGain, null);
  const sg = this.safeFilterNumber(sideGain, null);
  return {
    Mid: 0.5 * (l + r) * (Number.isFinite(mg) ? mg : 1),
    Side: 0.5 * (l - r) * (Number.isFinite(sg) ? sg : 1),
  };
};
