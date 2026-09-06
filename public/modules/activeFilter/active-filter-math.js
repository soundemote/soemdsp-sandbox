// Dual Ladder Filter — pure math (main thread + AudioWorklet Blob).
// RS-MET multipole ladder. HP/LP slopes: 0 Bypass, 1=6, 2=12, 3=18, 4=24.
// Both Bypass = thru. HP then LP when both active (bandpass).
// feedbackCircuit: 0 Off | 1 Resonance only | 2 Clipping only | 3 Res + Clip
// gainCompensation: 0 off | nonzero on

const nodeGraphActiveFilterSlopeChoices = Object.freeze([
  "Bypass", "6", "12", "18", "24",
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

/** Slope index 0..4 (Bypass..24). Migrates legacy mode 0..9 when slopes missing. */
function nodeGraphActiveFilterSlopeIndex(value, fallback = 0) {
  const n = Math.round(Number(value));
  if (Number.isFinite(n)) {
    return Math.max(0, Math.min(4, n));
  }
  const fb = Math.round(Number(fallback));
  return Number.isFinite(fb) ? Math.max(0, Math.min(4, fb)) : 0;
}

function nodeGraphActiveFilterLegacyModeToSlopes(mode) {
  const m = Math.max(0, Math.min(9, Math.round(Number(mode) || 0)));
  if (m <= 3) return { hpSlope: 0, lpSlope: m + 1 }; // LP6..24
  if (m <= 7) return { hpSlope: m - 3, lpSlope: 0 }; // HP6..24
  // Old BP — both on; prefer stored slopes if any, else 12/12
  return { hpSlope: 2, lpSlope: 2 };
}

function nodeGraphActiveFilterResolveInto(dst, params) {
  const out = dst && typeof dst === "object" ? dst : {};
  const sweep = Number(params?.sweep) || 0;
  out.feedbackCircuit = params?.feedbackCircuit;
  out.gainCompensation = params?.gainCompensation;
  out.resonance = params?.resonance;

  let hpSlope = params?.hpSlope;
  let lpSlope = params?.lpSlope;
  const hasHp = hpSlope != null && hpSlope !== "";
  const hasLp = lpSlope != null && lpSlope !== "";
  if (!hasHp || !hasLp) {
    const legacy = nodeGraphActiveFilterLegacyModeToSlopes(params?.mode);
    if (!hasHp) hpSlope = legacy.hpSlope;
    if (!hasLp) lpSlope = legacy.lpSlope;
  }
  hpSlope = nodeGraphActiveFilterSlopeIndex(hpSlope, 0);
  lpSlope = nodeGraphActiveFilterSlopeIndex(lpSlope, 4);

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

  out.hpSlope = hpSlope;
  out.lpSlope = lpSlope;
  out.bypass = hpSlope === 0 && lpSlope === 0;
  out.bandpass = hpSlope > 0 && lpSlope > 0;
  out.lowFrequency = hpHz;
  out.highFrequency = lpHz;
  out.frequency = lpSlope > 0 ? lpHz : hpHz;
  // Native ladder modes: HP = 4+(stages-1), LP = stages-1 (legacy fill helpers).
  out.hpHz = hpHz;
  out.hpMode = hpSlope > 0 ? 3 + hpSlope : 0; // 4..7 for HP6..24
  out.lpHz = lpHz;
  out.lpMode = lpSlope > 0 ? lpSlope - 1 : 0; // 0..3 for LP6..24
  out.mode = out.bandpass ? 8 : (hpSlope > 0 ? out.hpMode : out.lpMode);
  return out;
}

function nodeGraphActiveFilterResolveParams(params) {
  return nodeGraphActiveFilterResolveInto({}, params);
}

function nodeGraphActiveFilterIsBandpass(paramsOrMode) {
  if (paramsOrMode && typeof paramsOrMode === "object") {
    const r = nodeGraphActiveFilterResolveParams(paramsOrMode);
    return !!r.bandpass;
  }
  // Legacy: mode >= 8 was BP
  return Math.round(Number(paramsOrMode) || 0) >= 8;
}

function nodeGraphActiveFilterFillLadderParams(dst, resolved, which) {
  const out = dst && typeof dst === "object" ? dst : {};
  out.feedbackCircuit = resolved.feedbackCircuit;
  out.gainCompensation = resolved.gainCompensation;
  out.resonance = resolved.resonance;
  if (which === "hp") {
    out.frequency = resolved.hpHz;
    out.mode = resolved.hpMode;
    out.lowFrequency = resolved.hpHz;
    out.highFrequency = resolved.hpHz;
    out.hpSlope = resolved.hpSlope;
    out.lpSlope = 0;
  } else if (which === "lp") {
    out.frequency = resolved.lpHz;
    out.mode = resolved.lpMode;
    out.lowFrequency = resolved.lpHz;
    out.highFrequency = resolved.lpHz;
    out.hpSlope = 0;
    out.lpSlope = resolved.lpSlope;
  } else {
    out.frequency = resolved.frequency;
    out.mode = resolved.mode;
    out.lowFrequency = resolved.lowFrequency;
    out.highFrequency = resolved.highFrequency;
    out.hpSlope = resolved.hpSlope;
    out.lpSlope = resolved.lpSlope;
  }
  return out;
}

function nodeGraphActiveFilterProcess(state, input, params, sampleRate) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  const resolved = nodeGraphActiveFilterResolveInto(state._resolved || (state._resolved = {}), params);
  if (resolved.bypass) {
    return Number(input) || 0;
  }
  if (resolved.bandpass) {
    if (!state.hp) state.hp = createNodeGraphActiveFilterState();
    if (!state.lp) state.lp = createNodeGraphActiveFilterState();
    const hpParams = nodeGraphActiveFilterFillLadderParams(state.hp._p || (state.hp._p = {}), resolved, "hp");
    const lpParams = nodeGraphActiveFilterFillLadderParams(state.lp._p || (state.lp._p = {}), resolved, "lp");
    const mid = nodeGraphActiveFilterSample(state.hp, input, hpParams, sampleRate);
    return nodeGraphActiveFilterSample(state.lp, mid, lpParams, sampleRate);
  }
  if (resolved.hpSlope > 0) {
    const hpParams = nodeGraphActiveFilterFillLadderParams(state._p || (state._p = {}), resolved, "hp");
    return nodeGraphActiveFilterSample(state, input, hpParams, sampleRate);
  }
  const lpParams = nodeGraphActiveFilterFillLadderParams(state._p || (state._p = {}), resolved, "lp");
  return nodeGraphActiveFilterSample(state, input, lpParams, sampleRate);
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

  // Prefer explicit slopes when provided (0 Bypass skipped by Process).
  let ladderMode = 1;
  let stages = 4;
  const hpS = Math.round(Number(params?.hpSlope));
  const lpS = Math.round(Number(params?.lpSlope));
  if (Number.isFinite(hpS) && hpS > 0 && !(Number.isFinite(lpS) && lpS > 0)) {
    ladderMode = 2;
    stages = hpS;
  } else if (Number.isFinite(lpS) && lpS > 0) {
    ladderMode = 1;
    stages = lpS;
  } else {
    const pair = nodeGraphActiveFilterModeToLadder(params?.mode);
    ladderMode = pair[0];
    stages = pair[1];
  }

  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, (2 * Math.PI * cutoffHz) / rate));
  const sine = Math.sin(wc);
  const cosine = Math.cos(wc);
  const tangent = Math.tan(0.25 * (wc - Math.PI));
  let a = sine - cosine * tangent;
  if (Math.abs(a) < 1e-12) a = a >= 0 ? 1e-12 : -1e-12;
  a = tangent / a;

  const c = [0, 0, 0, 0, 0];
  let mixS = 0.125;
  if (ladderMode === 1) {
    c[stages] = 1;
    mixS = stages * 0.25;
  } else {
    const hp = [
      [1, -1, 0, 0, 0],
      [1, -2, 1, 0, 0],
      [1, -3, 3, -1, 0],
      [1, -4, 6, -4, 1],
    ];
    const row = hp[stages - 1];
    for (let i = 0; i <= stages; i++) c[i] = row[i];
    mixS = stages * 0.25;
  }

  const b = 1 + a;
  const denom = Math.max(1e-12, 1 + a * a + 2 * a * cosine);
  const g2 = (b * b) / denom;
  const g2sq = Math.max(1e-12, g2 * g2);
  const k = feedback / g2sq;
  const g = useGainComp ? (1 + mixS * k) : 1;

  const xIn = Number(input) || 0;
  const driven = useClip ? Math.tanh(xIn * 2) : xIn;
  const safeIn = g * driven - k * state.y[4];
  let y0 = safeIn / (1 + safeIn * safeIn);
  const ny1 = y0 + a * (y0 - state.y[1]);
  const ny2 = ny1 + a * (ny1 - state.y[2]);
  const ny3 = ny2 + a * (ny2 - state.y[3]);
  const ny4 = ny3 + a * (ny3 - state.y[4]);
  state.y[0] = y0;
  state.y[1] = ny1;
  state.y[2] = ny2;
  state.y[3] = ny3;
  state.y[4] = ny4;

  const out = c[0] * state.y[0] + c[1] * state.y[1] + c[2] * state.y[2]
    + c[3] * state.y[3] + c[4] * state.y[4];
  return out * 0.41;
}
