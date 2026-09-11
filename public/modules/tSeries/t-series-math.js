// t-series: transistor-switched paths.
//   t   → out 0            Digital = presence (any > 0 → send); Analog = conduction 0…1
//   nt  → outs 0 … n       Digital = one-hot index; Analog = windowed address
// out[i] = in * gain[i]. Open In = 1.

const NODE_GRAPH_T_SERIES_TYPES = Object.freeze([
  "t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10",
]);

function nodeGraphTSeriesType(lastIndex) {
  const last = Math.max(0, Math.min(10, Math.round(nodeGraphFiniteNumber(lastIndex))));
  return last === 0 ? "t" : `t${last}`;
}

function nodeGraphTSeriesLastIndexForType(type) {
  const key = String(type || "");
  if (key === "t") {
    return 0;
  }
  if (key.charAt(0) === "t") {
    const n = Number(key.slice(1));
    if (Number.isInteger(n) && n >= 1 && n <= 10) {
      return n;
    }
  }
  return 0;
}

function nodeGraphTSeriesSample(options = {}) {
  const lastIndex = Number.isFinite(Number(options.lastIndex))
    ? Math.max(0, Math.min(10, Math.round(Number(options.lastIndex))))
    : nodeGraphTSeriesLastIndexForType(options.type);
  const count = lastIndex + 1;
  const hasAnalog = Boolean(options.hasAnalog);
  const hasDigital = Boolean(options.hasDigital);
  const hasIn = Boolean(options.hasIn);
  const unit = Math.max(0, Math.min(1, nodeGraphFiniteNumber(options.analog)));
  const addr = unit * lastIndex;
  const digitalRaw = nodeGraphFiniteNumber(options.digital);
  const lone = 1 + (unit - 1) * Number(lastIndex === 0);
  const carrier = hasIn
    ? (nodeGraphFiniteNumber(options.input))
    : Number(hasAnalog || hasDigital);
  const out = {};
  let openAmount = 0;
  for (let i = 0; i < count; i += 1) {
    // Lone t: Digital = gate presence (any > 0 → send). Multi-t: one-hot index.
    let digitalGain = 0;
    if (hasDigital) {
      if (lastIndex === 0) {
        digitalGain = Number(i === 0) * Number(digitalRaw > 0);
      } else {
        const idx = Math.round(digitalRaw);
        digitalGain = Number(i === idx) * Number(idx >= 0 && idx <= lastIndex);
      }
    }
    const analogGain = Math.max(0, 1 - Math.abs(addr - i)) * lone * Number(hasAnalog);
    const gain = Math.max(digitalGain, analogGain);
    if (gain > openAmount) openAmount = gain;
    out[String(i)] = carrier * gain;
  }
  // Face Value Line: how open the switch is (not In × gain).
  out.Open = openAmount;
  return out;
}
