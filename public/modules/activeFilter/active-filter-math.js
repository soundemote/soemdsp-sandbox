// Active Filter — pure math (main thread + AudioWorklet Blob).
// RS-MET multipole ladder. No Flat/bypass mode.
// feedbackCircuit: 0 Off | 1 Resonance only | 2 Clipping only | 3 Res + Clip
// gainCompensation: 0 off | nonzero on

const nodeGraphActiveFilterModes = Object.freeze([
  "LP6", "LP12", "LP18", "LP24",
  "HP6", "HP12", "HP18", "HP24",
  "BP",
]);

function nodeGraphSweepFrequencyHz(hz, semitones) {
  const f = Number(hz);
  if (!Number.isFinite(f) || f <= 0) {
    return 0;
  }
  const st = Number(semitones);
  if (!Number.isFinite(st) || st === 0) {
    return f;
  }
  const out = f * (2 ** (st / 12));
  return Number.isFinite(out) && out > 0 ? out : 0;
}

function nodeGraphActiveFilterIsBandpass(mode) {
  return Math.round(Number(mode) || 0) >= 8;
}

function nodeGraphActiveFilterSlopeIndex(value, fallback = 1) {
  const n = Math.round(Number(value));
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(3, n));
  }
  const fb = Math.round(Number(fallback));
  return Number.isFinite(fb) ? Math.max(0, Math.min(3, fb)) : 1;
}

function nodeGraphActiveFilterLegacySlope(mode) {
  return Math.round(Number(mode) || 0) >= 9 ? 1 : 0;
}

function nodeGraphActiveFilterResolveInto(dst, params) {
  const out = dst && typeof dst === "object" ? dst : {};
  const rawMode = Math.round(Number(params?.mode) || 0);
  const sweep = Number(params?.sweep) || 0;
  out.feedbackCircuit = params?.feedbackCircuit;
  out.gainCompensation = params?.gainCompensation;
  out.resonance = params?.resonance;
  const bandpass = rawMode >= 8;
  out.bandpass = bandpass;
  if (!bandpass) {
    out.mode = Math.max(0, Math.min(7, rawMode));
    const isHp = rawMode >= 4;
    const baseHz = isHp ? params?.lowFrequency : params?.highFrequency;
    out.frequency = nodeGraphSweepFrequencyHz(baseHz, sweep);
    out.highFrequency = out.frequency;
    out.lowFrequency = out.frequency;
    out.hpSlope = 0;
    out.lpSlope = 0;
    out.hpHz = out.frequency;
    out.hpMode = out.mode;
    out.lpHz = out.frequency;
    out.lpMode = out.mode;
    return out;
  }
  const legacySlope = nodeGraphActiveFilterLegacySlope(rawMode);
  const hpSlope = params?.hpSlope == null || params?.hpSlope === ""
    ? legacySlope
    : nodeGraphActiveFilterSlopeIndex(params.hpSlope, legacySlope);
  const lpSlope = params?.lpSlope == null || params?.lpSlope === ""
    ? legacySlope
    : nodeGraphActiveFilterSlopeIndex(params.lpSlope, legacySlope);
  let low = Number(params?.lowFrequency);
  let high = Number(params?.highFrequency);
  if (params?.inheritBandFromFrequency && !Number.isFinite(low) && !Number.isFinite(high)) {
    const center = Math.max(0, Number(params?.frequency) || 0);
    low = center > 0 ? center * 0.5 : 0;
    high = center > 0 ? center * 2 : 0;
  }
  if (!Number.isFinite(low)) low = 0;
  if (!Number.isFinite(high)) high = 0;
  const centerHz = Number(params?.centerFrequency);
  if (Number.isFinite(centerHz)) {
    if (centerHz <= 0) {
      low = 0;
      high = 0;
    } else if (low > 0 || high > 0) {
      const geo = (low > 0 && high > 0) ? Math.sqrt(low * high) : Math.max(low, high);
      if (geo > 0) {
        const scale = centerHz / geo;
        low *= scale;
        high *= scale;
      }
    } else {
      low = centerHz * 0.5;
      high = centerHz * 2;
    }
  }
  low = nodeGraphSweepFrequencyHz(low, sweep);
  high = nodeGraphSweepFrequencyHz(high, sweep);
  const hpHz = Math.min(low, high);
  const lpHz = Math.max(low, high);
  out.mode = 8;
  out.hpSlope = hpSlope;
  out.lpSlope = lpSlope;
  out.lowFrequency = hpHz;
  out.highFrequency = lpHz;
  out.frequency = lpHz;
  out.hpHz = hpHz;
  out.hpMode = 4 + hpSlope;
  out.lpHz = lpHz;
  out.lpMode = lpSlope;
  return out;
}

function nodeGraphActiveFilterResolveParams(params) {
  return nodeGraphActiveFilterResolveInto({}, params);
}

function nodeGraphActiveFilterFillLadderParams(dst, resolved, which) {
  const out = dst && typeof dst === "object" ? dst : {};
  out.feedbackCircuit = resolved.feedbackCircuit;
  out.gainCompensation = resolved.gainCompensation;
  out.resonance = resolved.resonance;
  if (which === "hp") {
    out.frequency = resolved.hpHz;
    out.mode = resolved.hpMode;
  } else if (which === "lp") {
    out.frequency = resolved.lpHz;
    out.mode = resolved.lpMode;
  } else {
    out.frequency = resolved.frequency;
    out.mode = resolved.mode;
  }
  return out;
}

function nodeGraphActiveFilterProcess(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  const resolved = nodeGraphActiveFilterResolveInto(state._resolved || (state._resolved = {}), params);
  if (resolved.bandpass) {
    if (!state.hp) state.hp = createNodeGraphActiveFilterState();
    if (!state.lp) state.lp = createNodeGraphActiveFilterState();
    const hpParams = nodeGraphActiveFilterFillLadderParams(state.hp._p || (state.hp._p = {}), resolved, "hp");
    const lpParams = nodeGraphActiveFilterFillLadderParams(state.lp._p || (state.lp._p = {}), resolved, "lp");
    const mid = nodeGraphActiveFilterSample(state.hp, input, hpParams, sampleRate);
    return nodeGraphActiveFilterSample(state.lp, mid, lpParams, sampleRate);
  }
  const single = nodeGraphActiveFilterFillLadderParams(state._p || (state._p = {}), resolved, "single");
  return nodeGraphActiveFilterSample(state, input, single, sampleRate);
}

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
