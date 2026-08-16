// Mid/Side Encoder — worklet peel. Math: mid-side-encode-math.js.

NodeLiveAudioProcessor.prototype.midSideEncodeSample = function midSideEncodeSample(
  left,
  right,
  midGainDb = 0,
  sideGainDb = 0,
) {
  if (typeof nodeGraphMidSideEncodeSample === "function") {
    const out = nodeGraphMidSideEncodeSample(left, right, midGainDb, sideGainDb);
    return {
      Mid: this.safeFilterNumber(out.Mid, null) ?? 0,
      Side: this.safeFilterNumber(out.Side, null) ?? 0,
    };
  }
  const l = this.safeFilterNumber(left, null) ?? 0;
  const r = this.safeFilterNumber(right, null) ?? 0;
  const midLin = typeof nodeGraphMidSideDbToGain === "function"
    ? nodeGraphMidSideDbToGain(midGainDb)
    : 1;
  const sideLin = typeof nodeGraphMidSideDbToGain === "function"
    ? nodeGraphMidSideDbToGain(sideGainDb)
    : 1;
  return {
    Mid: 0.5 * (l + r) * midLin,
    Side: 0.5 * (l - r) * sideLin,
  };
};
