// Noise Detector — McLeod NSDF peak only (Helmholtz fidelity, no pitch).
// Analysis is decimated so the O(W²) NSDF stays cheap.

const NODE_GRAPH_NOISE_DETECTOR_WINDOW = 512;
const NODE_GRAPH_NOISE_DETECTOR_DECIMATE = 2;
const NODE_GRAPH_NOISE_DETECTOR_ANALYSIS_HZ = 20;

function createNodeGraphNoiseDetectorState() {
  return {
    ring: new Float64Array(NODE_GRAPH_NOISE_DETECTOR_WINDOW),
    win: new Float64Array(NODE_GRAPH_NOISE_DETECTOR_WINDOW / NODE_GRAPH_NOISE_DETECTOR_DECIMATE),
    write: 0,
    filled: 0,
    hop: 0,
    interval: 1,
    sampleRate: 0,
    fidelity: 0,
  };
}

function nodeGraphNoiseDetectorMixMono(left, mono, right, hasLeft, hasMono, hasRight) {
  let sum = 0;
  let n = 0;
  if (hasLeft) {
    sum += Number(left) || 0;
    n += 1;
  }
  if (hasMono) {
    sum += Number(mono) || 0;
    n += 1;
  }
  if (hasRight) {
    sum += Number(right) || 0;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

/** Global max of NSDF(tau) for tau >= 1. Same metric Helmholtz reports as fidelity. */
function nodeGraphNoiseDetectorNsdfPeak(win, count) {
  let best = 0;
  const maxLag = count >> 1;
  for (let tau = 1; tau <= maxLag; tau += 1) {
    let acf = 0;
    let energy = 0;
    const n = count - tau;
    for (let j = 0; j < n; j += 1) {
      const a = win[j];
      const b = win[j + tau];
      acf += a * b;
      energy += a * a + b * b;
    }
    if (energy > 1e-12) {
      const nsdf = (2 * acf) / energy;
      if (nsdf > best) best = nsdf;
    }
  }
  if (!(best > 0)) return 0;
  return best > 1 ? 1 : best;
}

function nodeGraphNoiseDetectorAnalyze(state) {
  const step = NODE_GRAPH_NOISE_DETECTOR_DECIMATE;
  const count = NODE_GRAPH_NOISE_DETECTOR_WINDOW / step;
  const start = (state.write - NODE_GRAPH_NOISE_DETECTOR_WINDOW + NODE_GRAPH_NOISE_DETECTOR_WINDOW * 4)
    % NODE_GRAPH_NOISE_DETECTOR_WINDOW;
  for (let i = 0; i < count; i += 1) {
    state.win[i] = state.ring[(start + i * step) % NODE_GRAPH_NOISE_DETECTOR_WINDOW];
  }
  state.fidelity = nodeGraphNoiseDetectorNsdfPeak(state.win, count);
}

/**
 * @returns {{ Left: number, Mono: number, Right: number, Fidelity: number, Gate: number }}
 */
function nodeGraphNoiseDetectorSample(
  state,
  left,
  mono,
  right,
  threshold,
  sampleRate,
  hasLeft,
  hasMono,
  hasRight,
) {
  const l = Number(left) || 0;
  const m = Number(mono) || 0;
  const r = Number(right) || 0;
  const x = nodeGraphNoiseDetectorMixMono(l, m, r, hasLeft, hasMono, hasRight);
  const rate = Math.max(1, Number(sampleRate) || 44100);
  if (state.sampleRate !== rate) {
    state.sampleRate = rate;
    state.interval = Math.max(1, Math.round(rate / NODE_GRAPH_NOISE_DETECTOR_ANALYSIS_HZ));
  }
  state.ring[state.write] = Number.isFinite(x) ? x : 0;
  state.write = (state.write + 1) % NODE_GRAPH_NOISE_DETECTOR_WINDOW;
  if (state.filled < NODE_GRAPH_NOISE_DETECTOR_WINDOW) state.filled += 1;
  state.hop += 1;
  if (state.filled >= NODE_GRAPH_NOISE_DETECTOR_WINDOW && state.hop >= state.interval) {
    state.hop = 0;
    nodeGraphNoiseDetectorAnalyze(state);
  }
  const rawThresh = Number(threshold);
  const thresh = Number.isFinite(rawThresh) ? Math.max(0, Math.min(1, rawThresh)) : 0.9;
  const fid = state.fidelity;
  return {
    Left: l,
    Mono: m,
    Right: r,
    Fidelity: fid,
    Gate: fid >= thresh ? 1 : 0,
  };
}
