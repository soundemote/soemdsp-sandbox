// Active Filter — pure math (main thread + AudioWorklet Blob).
// RS-MET multipole ladder. No Flat/bypass mode.
// feedbackCircuit: 0 Off | 1 Resonance only | 2 Clipping only | 3 Res + Clip
// gainCompensation: 0 off | nonzero on

const nodeGraphActiveFilterModes = Object.freeze([
  "LP6", "LP12", "LP18", "LP24",
  "HP6", "HP12", "HP18", "HP24",
  "BP6", "BP12",
]);

const nodeGraphActiveFilterFeedbackCircuits = Object.freeze([
  "Off",
  "Resonance only",
  "Clipping only",
  "Res + Clip",
]);

function createNodeGraphActiveFilterState() {
  return { y: [0, 0, 0, 0, 0] };
}

function createNodeGraphStereoActiveFilterState() {
  return {
    left: createNodeGraphActiveFilterState(),
    mono: createNodeGraphActiveFilterState(),
    right: createNodeGraphActiveFilterState(),
  };
}

function nodeGraphActiveFilterModeToLadder(mode) {
  const table = [
    [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 1], [2, 2], [2, 3], [2, 4],
    [3, 1], [3, 4],
  ];
  const idx = Math.max(0, Math.min(9, Math.round(Number(mode) || 0)));
  return table[idx];
}

function nodeGraphActiveFilterSample(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  if (!state.y || state.y.length < 5) {
    state.y = [0, 0, 0, 0, 0];
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const rawHz = Number(params?.frequency);
  const cutoffHz = Math.max(0, Math.min(rate * 0.49, Number.isFinite(rawHz) ? rawHz : 0));

  const circuit = Math.max(0, Math.min(3, Math.round(Number(params?.feedbackCircuit) || 0)));
  const useRes = circuit === 1 || circuit === 3;
  const useClip = circuit === 2 || circuit === 3;
  const useGainComp = Math.round(Number(params?.gainCompensation)) !== 0;

  const feedback = useRes ? Math.max(0, Math.min(1, Number(params?.resonance) || 0)) : 0;
  const [ladderMode, stages] = nodeGraphActiveFilterModeToLadder(params?.mode);

  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, (2 * Math.PI * cutoffHz) / rate));
  const sine = Math.sin(wc);
  const cosine = Math.cos(wc);
  const tangent = Math.tan(0.25 * (wc - Math.PI));
  let a = sine - cosine * tangent;
  a = a > -1e-12 && a < 1e-12 ? (a >= 0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;

  const c = [0, 0, 0, 0, 0];
  let mixS = 0.125;
  if (ladderMode === 1) {
    c[stages] = 1;
    mixS = stages * 0.25;
  } else if (ladderMode === 2) {
    const hp = [
      [1, -1, 0, 0, 0],
      [1, -2, 1, 0, 0],
      [1, -3, 3, -1, 0],
      [1, -4, 6, -4, 1],
    ];
    for (let i = 0; i <= stages; i += 1) c[i] = hp[stages - 1][i];
    mixS = stages * 0.25;
  } else {
    const bp = [
      [0, 2, -2, 0, 0],
      [0, 2, -2, 0, 0],
      [0, 0, 3, -3, 0],
      [0, 0, 4, -8, 4],
    ];
    for (let i = 0; i < 5; i += 1) c[i] = bp[stages - 1][i];
    mixS = 0.125;
  }

  const b = 1 + a;
  const denom = Math.max(1e-12, 1 + a * a + 2 * a * cosine);
  const g2 = (b * b) / denom;
  const k = feedback / Math.max(1e-12, g2 * g2);
  const g = useGainComp ? 1 + mixS * k : 1;

  const xIn = Number(input) || 0;
  const driven = useClip ? Math.tanh(xIn * 2) : xIn;
  const y = state.y;
  let y0 = g * driven - k * y[4];
  y0 = y0 / (1 + y0 * y0); // stability soft clip
  y[0] = y0;
  y[1] = y[0] + a * (y[0] - y[1]);
  y[2] = y[1] + a * (y[1] - y[2]);
  y[3] = y[2] + a * (y[2] - y[3]);
  y[4] = y[3] + a * (y[3] - y[4]);

  const out = (c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3] + c[4] * y[4]) * 0.41;
  return Number.isFinite(out) ? out : 0;
}
