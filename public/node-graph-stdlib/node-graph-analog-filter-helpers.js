// Node Graph Standard Library -- analog filter family.
//
// Shared sin/cos/2^x/pitch/waveshape/graph-eval helpers for the analog-
// modeled self-oscillating filter family: chaoticPhaseLockingFilter,
// humanFilter, resonatorFilter, activeFilter, superloveFilter,
// yellowjacketFilter. This is the JS counterpart of
// native_modules/sandbox_native_maths/analog_filter_trig.h -- same
// duplication problem (each module independently derived the same
// polynomial approach), same fix (one shared home instead of N copies).

function nodeGraphAnalogEvalGraph(nodes, x) {
  if (nodes.length === 0) return 0;
  if (x < nodes[0].x) return nodes[0].y;
  let i = -1;
  for (let k = 0; k < nodes.length; k++) {
    if (nodes[k].x > x) { i = k; break; }
  }
  if (i < 0) return nodes[nodes.length - 1].y;
  if (i === 0) return nodes[0].y;
  const n1 = nodes[i - 1];
  const n2 = nodes[i];
  if (n2.x - n1.x < 1e-9) return 0.5 * (n1.y + n2.y);
  const p = (x - n1.x) / (n2.x - n1.x);
  if (n2.shape === 1) return n1.y + (n2.y - n1.y) * nodeGraphAnalogRationalCurve(p, n2.skew);
  if (n2.shape === 2) {
    const c = 0.5 * (n2.skew + 1);
    const a = 2 * Math.log((1 - c) / c);
    return n1.y + (n2.y - n1.y) * (1 - Math.exp(p * a)) / (1 - Math.exp(a));
  }
  return n1.y + (n2.y - n1.y) * p;
}

function nodeGraphAnalogLadderCoefficient(cutoffHz, sampleRate) {
  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * cutoffHz / sampleRate));
  const s = Math.sin(wc);
  const c = Math.cos(wc);
  const t = Math.tan(0.25 * (wc - Math.PI));
  let denom = s - c * t;
  if (denom > -1e-12 && denom < 1e-12) denom = denom >= 0 ? 1e-12 : -1e-12;
  return t / denom;
}

function nodeGraphAnalogLadderTapStep(y, input, a, mode, stages) {
  const c = [0, 0, 0, 0, 0];
  if (mode === 1) {
    c[stages] = 1;
  } else if (mode === 2) {
    const hp = [[1, -1, 0, 0, 0], [1, -2, 1, 0, 0], [1, -3, 3, -1, 0], [1, -4, 6, -4, 1]];
    for (let i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
  } else if (mode === 3) {
    const bp = [[0, 2, -2, 0, 0], [0, 2, -2, 0, 0], [0, 0, 3, -3, 0], [0, 0, 4, -8, 4]];
    for (let i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
  }
  let y0 = input;
  y0 = y0 / (1 + y0 * y0);
  y[1] = y0 + a * (y0 - y[1]);
  y[2] = y[1] + a * (y[1] - y[2]);
  y[3] = y[2] + a * (y[2] - y[3]);
  y[4] = y[3] + a * (y[3] - y[4]);
  y[0] = y0;
  return c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3] + c[4] * y[4];
}

function nodeGraphAnalogPitchToFreq(pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

function nodeGraphAnalogWaveEllipse(phaseCycles, ellipseC) {
  return nodeGraphAnalogWaveEllipseFull(phaseCycles, 0, 0, 1, ellipseC);
}

function nodeGraphAnalogWaveEllipseFull(phaseCycles, A, bSin, bCos, C) {
  const sinX = Math.sin(phaseCycles * 2 * Math.PI);
  const cosX = Math.cos(phaseCycles * 2 * Math.PI);
  const apc = A + cosX;
  let sqrtVal = Math.sqrt(apc * apc + (C * sinX) * (C * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return (apc * bCos + (C * sinX) * bSin) / sqrtVal;
}

function nodeGraphAnalogRationalCurve(p, skew) {
  return ((1 + skew) * p) / (1 - skew + 2 * skew * p);
}

function nodeGraphAnalogNextNoiseBipolar() {
  return Math.random() * 2 - 1;
}
