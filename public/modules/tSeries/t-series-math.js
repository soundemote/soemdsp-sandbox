// t-series: transistor-switched paths.
//   t   → out 0            send / don't send
//   nt  → outs 0 … n       through 10t (0 … 10)
// out[i] = in * gain[i]. Open In = 1. Digital is one-hot (round + equality).
// Analog 0…1 windows neighbors: max(0, 1 − |addr − i|). Lone t analog is conduction.

const NODE_GRAPH_T_SERIES_TYPES = Object.freeze([
  "t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10",
]);

function nodeGraphTSeriesType(lastIndex) {
  const last = Math.max(0, Math.min(10, Math.round(Number(lastIndex) || 0)));
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
  const unit = Math.max(0, Math.min(1, Number(options.analog) || 0));
  const addr = unit * lastIndex;
  const idx = Math.round(Number(options.digital) || 0);
  const inRange = Number(idx >= 0) * Number(idx <= lastIndex);
  const lone = 1 + (unit - 1) * Number(lastIndex === 0);
  const carrier = hasIn
    ? (Number(options.input) || 0)
    : Number(hasAnalog || hasDigital);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const digitalGain = Number(i === idx) * inRange * Number(hasDigital);
    const analogGain = Math.max(0, 1 - Math.abs(addr - i)) * lone * Number(hasAnalog);
    out[String(i)] = carrier * Math.max(digitalGain, analogGain);
  }
  return out;
}
