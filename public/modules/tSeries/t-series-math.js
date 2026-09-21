// t-series: transistor-switched paths.
//   t / tN  → demux: In → outs 0…N   Digital = one-hot; Analog = 0…1 address
//   Nt      → mux:   ins 0…N + A/D → Out
//     D only = discrete index
//     A only = −1…+1 full-range crossfade
//     both   = D is base; A −1…0 sweeps 0…D, A 0…+1 sweeps D…N

const NODE_GRAPH_T_SERIES_TYPES = Object.freeze([
  "t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10",
]);

const NODE_GRAPH_T_SERIES_MUX_TYPES = Object.freeze([
  "1t", "2t", "3t", "4t", "5t", "6t", "7t", "8t", "9t", "10t",
]);

function nodeGraphTSeriesType(lastIndex) {
  const last = Math.max(0, Math.min(10, Math.round(nodeGraphFiniteNumber(lastIndex))));
  return last === 0 ? "t" : `t${last}`;
}

function nodeGraphTSeriesMuxType(lastIndex) {
  const last = Math.max(1, Math.min(10, Math.round(nodeGraphFiniteNumber(lastIndex))));
  return `${last}t`;
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
  const mux = key.match(/^([1-9]|10)t$/);
  if (mux) {
    return Number(mux[1]);
  }
  return 0;
}

function nodeGraphTSeriesIsMuxType(type) {
  return /^([1-9]|10)t$/.test(String(type || ""));
}

function nodeGraphTSeriesClamp(v, lo, hi) {
  const n = nodeGraphFiniteNumber(v);
  return n < lo ? lo : (n > hi ? hi : n);
}

/** Mux address 0…last from A (−1…+1) and/or D (index). */
function nodeGraphTSeriesMuxAddress(options = {}) {
  const last = Math.max(0, Math.min(10, Math.round(nodeGraphFiniteNumber(options.lastIndex))));
  const hasAnalog = Boolean(options.hasAnalog);
  const hasDigital = Boolean(options.hasDigital);
  const a = nodeGraphTSeriesClamp(options.analog, -1, 1);
  const d = nodeGraphFiniteNumber(options.digital);

  if (hasDigital && !hasAnalog) {
    const idx = Math.round(d);
    return nodeGraphTSeriesClamp(idx, 0, last);
  }
  if (hasAnalog && !hasDigital) {
    return ((a + 1) * 0.5) * last;
  }
  if (hasAnalog && hasDigital) {
    const base = nodeGraphTSeriesClamp(d, 0, last);
    if (a >= 0) {
      return base + a * (last - base);
    }
    return base * (a + 1);
  }
  return 0;
}

function nodeGraphTSeriesMuxSample(options = {}) {
  const lastIndex = Number.isFinite(Number(options.lastIndex))
    ? Math.max(0, Math.min(10, Math.round(Number(options.lastIndex))))
    : nodeGraphTSeriesLastIndexForType(options.type);
  const hasAnalog = Boolean(options.hasAnalog);
  const hasDigital = Boolean(options.hasDigital);
  const inputs = Array.isArray(options.inputs) ? options.inputs : [];
  const addr = nodeGraphTSeriesMuxAddress({
    lastIndex,
    hasAnalog,
    hasDigital,
    analog: options.analog,
    digital: options.digital,
  });

  if (!hasAnalog && !hasDigital) {
    return { Out: 0, Open: 0 };
  }

  if (hasDigital && !hasAnalog) {
    const idx = Math.round(addr);
    const sample = nodeGraphFiniteNumber(inputs[idx]);
    return { Out: sample, Open: 1 };
  }

  const i0 = Math.max(0, Math.min(lastIndex, Math.floor(addr)));
  const i1 = Math.max(0, Math.min(lastIndex, i0 + 1));
  const frac = nodeGraphTSeriesClamp(addr - i0, 0, 1);
  const s0 = nodeGraphFiniteNumber(inputs[i0]);
  const s1 = nodeGraphFiniteNumber(inputs[i1]);
  const out = s0 * (1 - frac) + s1 * frac;
  const openAmount = i0 === i1 ? 1 : Math.max(1 - frac, frac);
  return { Out: out, Open: openAmount };
}

function nodeGraphTSeriesSample(options = {}) {
  const lastIndex = Number.isFinite(Number(options.lastIndex))
    ? Math.max(0, Math.min(10, Math.round(Number(options.lastIndex))))
    : nodeGraphTSeriesLastIndexForType(options.type);
  if (nodeGraphTSeriesIsMuxType(options.type) || options.mux) {
    return nodeGraphTSeriesMuxSample({ ...options, lastIndex });
  }
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
