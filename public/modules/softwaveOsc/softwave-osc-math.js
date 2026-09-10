// Softwave shape twin of native_modules/softwave/softwave.cpp run_shape().
// Pure f(phase) for the module face — does not advance oscillator state.

const SOFTWAVE_PI = Math.PI;
const SOFTWAVE_HALF_PI = Math.PI * 0.5;
const SOFTWAVE_LN2 = Math.LN2;

function nodeGraphSoftwaveWrap01(x) {
  const n = nodeGraphFiniteNumber(x);
  return n - Math.floor(n);
}

function nodeGraphSoftwaveTanh(v) {
  if (v > 5) return 1;
  if (v < -5) return -1;
  const e2 = Math.exp(2 * v);
  return (e2 - 1) / (e2 + 1);
}

function nodeGraphSoftwaveAcos(x) {
  const a = nodeGraphFiniteNumber(x);
  const x2 = a * a;
  const series = a * (1 + x2 * (1 / 6
    + x2 * (0.075
    + x2 * (0.044642857142857144
    + x2 * 0.030381944444444444))));
  return SOFTWAVE_HALF_PI - series;
}

function nodeGraphSoftwaveParabolSine(x) {
  let xin = x;
  if (x > 0.5) xin = x - 0.5;
  xin = xin * 4 - 1;
  const a = xin * xin;
  if (x > 0.5) return 0 - (1 - a) * (1 - a * 0.202);
  return (1 - a) * (1 - a * 0.202);
}

function nodeGraphSoftwaveFreqToPitch(frequencyHz) {
  const f = Math.max(1e-12, nodeGraphFiniteNumber(frequencyHz, 1e-12));
  return 69 + 12 * (Math.log(f / 440) / SOFTWAVE_LN2);
}

function nodeGraphSoftwaveSineAmp(frequencyHz, sampleRate = 44100) {
  const f = Math.max(1, nodeGraphFiniteNumber(frequencyHz, 1));
  const sr = Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100));
  const quarter = sr * 0.25;
  const denom = Math.log10(f) * f;
  const d = Math.abs(denom) > 1e-12 ? denom : 1e-12;
  return (quarter / d) * (SOFTWAVE_PI * 0.5) * 0.8;
}

function nodeGraphSoftwaveMorphFactor(morph) {
  const m = Math.max(0, Math.min(1, nodeGraphFiniteNumber(morph)));
  const m2 = m * m;
  const m4 = m2 * m2;
  return m4 * 0.999 + 0.001;
}

/** One sample of Softwave shape at phase ∈ [0,1). Matches native run_shape. */
function nodeGraphSoftwaveShapeAt(phase01, waveform, morph, frequencyHz = 100, sampleRate = 44100) {
  const p = nodeGraphSoftwaveWrap01(phase01);
  const shape = Math.max(0, Math.min(9, Math.round(nodeGraphFiniteNumber(waveform))));
  const sa = nodeGraphSoftwaveSineAmp(frequencyHz, sampleRate);
  const mf = nodeGraphSoftwaveMorphFactor(morph);
  switch (shape) {
    case 0: {
      const toSine = (p * 2 - 1) * SOFTWAVE_PI;
      return nodeGraphSoftwaveTanh(Math.sin(toSine) * sa * mf) * Math.cos(toSine);
    }
    case 1:
      return nodeGraphSoftwaveTanh(nodeGraphSoftwaveParabolSine(p) * sa * mf)
        * nodeGraphSoftwaveParabolSine(nodeGraphSoftwaveWrap01(p + 0.25));
    case 2: {
      const a = nodeGraphSoftwaveTanh(Math.sin(p * SOFTWAVE_PI * 2) * sa * mf)
        * Math.sin(nodeGraphSoftwaveWrap01(p + 0.25) * SOFTWAVE_PI * 2);
      return nodeGraphSoftwaveAcos(a) / (SOFTWAVE_PI * 0.5) - 1;
    }
    case 3: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      return nodeGraphSoftwaveTanh(bow * sa * mf)
        * (nodeGraphSoftwaveTanh(bow * sa * 0.5 * mf)
          * nodeGraphSoftwaveParabolSine(nodeGraphSoftwaveWrap01(p + 0.25)) * 0.5 + 0.5);
    }
    case 4:
      return nodeGraphSoftwaveTanh(nodeGraphSoftwaveParabolSine(p) * sa * mf);
    case 5: {
      const t = Math.max(0, Math.min(1, mf));
      const adjusted = 0.15 + (1 - 0.15) * t;
      const scaling = nodeGraphSoftwaveTanh((1 - (nodeGraphSoftwaveFreqToPitch(frequencyHz) / 127)) * 9);
      return nodeGraphSoftwaveAcos(
        Math.sin(p * SOFTWAVE_PI * 2) * adjusted * scaling,
      ) / SOFTWAVE_PI * 2 - 1;
    }
    case 6: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      return nodeGraphSoftwaveTanh(bow * sa * mf) * bow * 2 - 1;
    }
    case 7: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      const sq = nodeGraphSoftwaveTanh(bow * sa * mf);
      return nodeGraphSoftwaveTanh(sq * bow * 2) * 2 - 1;
    }
    case 8: {
      const bow = nodeGraphSoftwaveParabolSine(p);
      const sq = nodeGraphSoftwaveTanh(bow * sa * mf);
      return sq * 0.5 + 0.5 - nodeGraphSoftwaveTanh(sq * bow * 2);
    }
    case 9:
    default:
      return nodeGraphSoftwaveParabolSine(p);
  }
}
