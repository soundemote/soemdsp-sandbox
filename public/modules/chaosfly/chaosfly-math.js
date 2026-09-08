// Chaosfly — dual sine FM chaos (JSFX Elan's Chaos Generator port).
// Oscillators: sine wavetable + linear interpolation (nodeGraphSineWavetableLookup).
// Filters: passive one-pole LP/HP (nodeGraphOnePoleLowpass/HighpassSample).
// Parameter smoothing is owned by the host param system — not done here.

const nodeGraphChaosflyMaxLpStages = 64;

function nodeGraphChaosflyTaper(a, x) {
  const aa = Number(a) || 0;
  const xx = Math.max(0, Math.min(1, Number(x) || 0));
  const den = 2 * aa * xx - aa - 1;
  if (Math.abs(den) < 1e-12) return xx;
  return (aa * xx - xx) / den;
}

/** Map 0..1 Lowpass Chaos knob → cutoff Hz (JSFX display formula). */
function nodeGraphChaosflyLowpassHz(amount01, sampleRate) {
  const a = Math.max(0, Math.min(1, Number(amount01) || 0));
  if (a <= 0) return 0;
  if (a >= 1) return Math.max(1, Number(sampleRate) || 44100) * 0.45;
  const lpcut = 1 - nodeGraphChaosflyTaper(0.5, a);
  if (!(lpcut > 0) || lpcut >= 1) return a >= 1 ? Math.max(1, Number(sampleRate) || 44100) * 0.45 : 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  return Math.max(0, -Math.log(lpcut) * rate / (Math.PI * 2));
}

/** Map 0..1 Highpass Chaos knob → cutoff Hz. */
function nodeGraphChaosflyHighpassHz(amount01, sampleRate) {
  const a = Math.max(0, Math.min(1, Number(amount01) || 0));
  if (a <= 0) return 0;
  if (a >= 1) return Math.max(1, Number(sampleRate) || 44100) * 0.45;
  const hpcut = 1 - nodeGraphChaosflyTaper(-0.1, a);
  if (!(hpcut > 0) || hpcut >= 1) return a >= 1 ? Math.max(1, Number(sampleRate) || 44100) * 0.45 : 0;
  const rate = Math.max(1, Number(sampleRate) || 44100);
  return Math.max(0, -Math.log(hpcut) * rate / (Math.PI * 2));
}

// Direct pole count 1…64 (not a power-of-two index).
function nodeGraphChaosflyTapCount(taps) {
  const n = Math.round(Number(taps) || 0);
  return Math.max(1, Math.min(nodeGraphChaosflyMaxLpStages, n));
}

function createNodeGraphChaosflyState() {
  const poles = () => {
    const out = [];
    for (let n = 0; n < nodeGraphChaosflyMaxLpStages; n += 1) {
      out.push({ inputBuffer: 0, outputBuffer: 0 });
    }
    return out;
  };
  return {
    pos1: 0,
    pos2: 0,
    out1: 0,
    out2: 0,
    prefilter: 0,
    lp: poles(),
    hp: { inputBuffer: 0, outputBuffer: 0 },
    dcL: { inputBuffer: 0, outputBuffer: 0 },
    dcR: { inputBuffer: 0, outputBuffer: 0 },
  };
}

function nodeGraphChaosflyWrapTau(phase) {
  const tau = Math.PI * 2;
  let p = Number(phase) || 0;
  if (!Number.isFinite(p)) return 0;
  while (p >= tau) p -= tau;
  while (p < 0) p += tau;
  return p;
}

function nodeGraphChaosflySine(phaseRadians) {
  if (typeof nodeGraphSineWavetableLookup === "function") {
    return nodeGraphSineWavetableLookup(phaseRadians);
  }
  return Math.sin(Number(phaseRadians) || 0);
}

function nodeGraphChaosflyOnePoleLp(pole, input, frequencyHz, sampleRate) {
  if (typeof nodeGraphPassiveFilterLowpassSample === "function") {
    return nodeGraphPassiveFilterLowpassSample(pole, input, frequencyHz, sampleRate, null, "");
  }
  if (typeof nodeGraphOnePoleLowpassSample === "function") {
    return nodeGraphOnePoleLowpassSample(pole, input, frequencyHz, sampleRate, null, "");
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const freq = Math.max(0, Number(frequencyHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * freq;
  const a1 = Math.exp(-w);
  const b0 = 1 - a1;
  const x = Number(input) || 0;
  pole.outputBuffer = b0 * x + a1 * (Number(pole.outputBuffer) || 0);
  return pole.outputBuffer;
}

function nodeGraphChaosflyOnePoleHp(pole, input, frequencyHz, sampleRate) {
  if (typeof nodeGraphOnePoleHighpassSample === "function") {
    return nodeGraphOnePoleHighpassSample(pole, input, frequencyHz, sampleRate, null, "");
  }
  const rate = Math.max(1, Number(sampleRate) || 44100);
  const freq = Math.max(0, Number(frequencyHz) || 0);
  const w = Math.min((Math.PI * 2) / rate, 0.000142475857) * freq;
  const a1 = Math.exp(-w);
  const b0 = 0.5 * (1 + a1);
  const x = Number(input) || 0;
  const y = b0 * x - b0 * (Number(pole.inputBuffer) || 0) + a1 * (Number(pole.outputBuffer) || 0);
  pole.inputBuffer = x;
  pole.outputBuffer = y;
  return y;
}

/**
 * One sample of Chaosfly.
 * @returns {{ left: number, right: number, out: number, x: number, y: number, z: number }}
 */
function nodeGraphChaosflyCore(state, options = {}) {
  const s = state && typeof state === "object" ? state : createNodeGraphChaosflyState();
  const rate = Math.max(1, Number(options.sampleRate) || 44100);
  const tau = Math.PI * 2;
  const invRate = 1 / rate;
  const fRef = 55; // when Frequency≈0 (Phase PM), filters still have a base

  // Frequency = base Hz. Pitch = overall transpose. LP/HP = offsets from pitched master:
  //   osc = Frequency × 2^Pitch
  //   LP  = |base| × 2^(Pitch + Lowpass)
  //   HP  = |base| × 2^(Pitch + Highpass)
  // Octave offsets: no ±10 clamp — Pitch / Lowpass / Highpass ranges are metaparam-owned.
  const pitchRaw = Number(options.pitch);
  const lpRaw = Number(options.lowpass);
  const hpRaw = Number(options.highpass);
  const pitchOct = Number.isFinite(pitchRaw) ? pitchRaw : 0;
  const lpOct = Number.isFinite(lpRaw) ? lpRaw : 0;
  const hpOct = Number.isFinite(hpRaw) ? hpRaw : 0;
  const applyOct = (hz, oct) => {
    const f = Number(hz);
    if (!Number.isFinite(f) || f === 0) return 0;
    const o = Number.isFinite(oct) ? oct : 0;
    return f * (2 ** o);
  };

  const mixMode = Math.max(0, Math.min(6, Math.round(Number(options.outputMode) || 0)));
  const frequencyHz = Number(options.frequency) || 0;
  const baseAbs = Math.abs(frequencyHz) > 1e-9 ? Math.abs(frequencyHz) : fRef;
  const oscHz = applyOct(frequencyHz, pitchOct);
  const pitchScale = Math.max(1e-12, 2 ** pitchOct);

  const masterFm = Number(options.masterFm) || 0;
  const taps = nodeGraphChaosflyTapCount(options.taps);
  const hpPos = Math.max(0, Math.min(2, Math.round(Number(options.hpPosition) || 0)));
  const osc1Detune = (Number(options.osc1Detune) || 0) * pitchScale;
  const osc2Detune = (Number(options.osc2Detune) || 0) * pitchScale;
  const fm1 = ((Number(options.fm1) || 0) + masterFm) * pitchScale;
  const fm2 = ((Number(options.fm2) || 0) + masterFm) * pitchScale;
  const pan = Math.max(0, Math.min(1, ((Number(options.pan) || 0) + 1) * 0.5));
  let volume = Number(options.amplitude);
  if (!Number.isFinite(volume) || volume < 0) volume = 0;

  const ny = rate * 0.45;
  let lpHz = applyOct(baseAbs, pitchOct + lpOct);
  let hpHz = applyOct(baseAbs, pitchOct + hpOct);
  if (!(lpHz > 0)) lpHz = 0;
  if (!(hpHz > 0)) hpHz = 0;
  if (lpHz > ny) lpHz = ny;
  if (hpHz > ny) hpHz = ny;

  const freqInc = oscHz * tau * invRate;
  const osc1Inc = osc1Detune * tau * invRate;
  const osc2Inc = osc2Detune * tau * invRate;
  // Phase offset (cycles → radians) — lookup only, so 0 Hz still modulates.
  let phaseOff = Number(options.phase) || 0;
  phaseOff -= Math.floor(phaseOff);
  if (phaseOff < 0) phaseOff += 1;
  const phaseOffRad = phaseOff * tau;

  let out1 = Number(s.out1) || 0;
  let out2 = Number(s.out2) || 0;

  // Oscillator 1 — FM from osc2 (Hz terms already pitch-scaled)
  const adj1 = (tau * invRate * out2 * fm1) + freqInc + osc1Inc;
  s.pos1 = nodeGraphChaosflyWrapTau((Number(s.pos1) || 0) + adj1);
  out1 = nodeGraphChaosflySine(s.pos1 + phaseOffRad);

  // HP Position relative to LP in the chaos chain (feeds Osc2 FM):
  //   0 Before = HP → LP → Osc2
  //   1 After  = LP → HP → Osc2
  //   2 Both   = HP → LP → HP → Osc2
  if ((hpPos === 0 || hpPos === 2) && hpHz > 0) {
    out1 = nodeGraphChaosflyOnePoleHp(s.hp, out1, hpHz, rate);
  }

  const prefilter = out1;

  // Cascaded passive lowpass
  if (lpHz > 0) {
    let v = out1;
    for (let i = 0; i < taps; i += 1) {
      v = nodeGraphChaosflyOnePoleLp(s.lp[i], v, lpHz, rate);
    }
    out1 = v;
  }

  if ((hpPos === 1 || hpPos === 2) && hpHz > 0) {
    out1 = nodeGraphChaosflyOnePoleHp(s.hp, out1, hpHz, rate);
  }

  // Oscillator 2 — FM from filtered osc1, cosine phase
  const adj2 = (tau * invRate * out1 * fm2) + freqInc + osc2Inc;
  s.pos2 = nodeGraphChaosflyWrapTau((Number(s.pos2) || 0) + adj2);
  out2 = nodeGraphChaosflySine(s.pos2 + Math.PI * 0.5 + phaseOffRad);

  s.out1 = out1;
  s.out2 = out2;
  s.prefilter = prefilter;

  let left = 0;
  let right = 0;
  if (mixMode === 0) {
    left = prefilter;
    right = out2;
  } else if (mixMode === 1) {
    left = out1;
    right = out2;
  } else if (mixMode === 2) {
    left = right = prefilter;
  } else if (mixMode === 3) {
    left = right = out1;
  } else if (mixMode === 4) {
    left = right = out2;
  } else if (mixMode === 5) {
    left = right = (prefilter + out2) * 0.5;
  } else {
    left = right = (out1 + out2) * 0.5;
  }

  // Volume master gain, then equal-power pan (matches native chaosfly).
  left *= volume;
  right *= volume;
  {
    const angle = pan * Math.PI * 0.5;
    left *= Math.cos(angle);
    right *= Math.sin(angle);
  }

  // Face X/Y track Volume (visual module — face must respond to Volume).
  const usePre = mixMode === 0 || mixMode === 2 || mixMode === 5;
  const displayX = (usePre ? prefilter : out1) * volume;
  const displayY = out2 * volume;

  // DC blockers ≈ JSFX 0.9999 one-pole HP (~very low cut)
  const dcHz = Math.max(1, rate * 0.0000159155); // ~exp coeff 0.9999 at 44.1k
  left = nodeGraphChaosflyOnePoleHp(s.dcL, left, dcHz, rate);
  right = nodeGraphChaosflyOnePoleHp(s.dcR, right, dcHz, rate);

  return {
    left,
    right,
    out: (left + right) * 0.5,
    x: displayX,
    y: displayY,
    z: out1 * volume,
  };
}
