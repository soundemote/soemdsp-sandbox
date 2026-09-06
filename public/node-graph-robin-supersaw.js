// Offline JS mirror of native RobinSupersaw (pitch-dithered, frequency-detuned).
// Hard voice cap 128; UI typically ≤32. Fractional voices like Hypersaw.
// Dual: N/side same detune map. Alternating: LRLR pans. Face X wraps ±0.5 oct.

const NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES = 128;
const NODE_GRAPH_ROBIN_SUPERSAW_FACE_HALF_OCT_CENTS = 600;

function nodeGraphRobinSupersawCalcCycleDistribution(c) {
  const ci = Math.floor(c);
  const cf = c - ci;
  let c2 = ci;
  if (cf >= 0.5) c2 += 1;
  const c1 = c2 - 1;
  const c3 = c2 + 1;
  const e1 = c1 - c;
  const e2 = c2 - c;
  const e3 = c3 - c;
  const v1 = e1 * e1;
  const v2 = e2 * e2;
  const v3 = e3 * e3;
  const v = 0.25;
  const d1 = v - v1;
  const d2 = v - v2;
  const d3 = v - v3;
  const s = 1 / (e3 * (v1 - v2) - e2 * (v1 - v3) + e1 * (v2 - v3));
  return {
    lenMid: c2,
    probShort: (d2 * e3 - d3 * e2) * s,
    probMid: (d3 * e1 - d1 * e3) * s,
  };
}

function nodeGraphRobinSupersawCreateVoice() {
  return {
    sampleCount: 0,
    lenNow: 100,
    lenMid: 100,
    probShort: 0,
    probMid: 1,
    phaseSlope: 1 / 99,
    centsOffset: 0,
    phaseRandom: Math.random(),
    targetHz: 0,
    currentHz: 0,
    portaUnit: Math.random(),
    portaInc: 0,
    portaCoeff: 1,
    portaMode: 0,
    portaArmed: false,
  };
}

function createNodeGraphRobinSupersawState() {
  const left = [];
  const right = [];
  for (let i = 0; i < NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES; i++) {
    left.push(nodeGraphRobinSupersawCreateVoice());
    right.push(nodeGraphRobinSupersawCreateVoice());
  }
  return { left, right, lastReset: 0, lastVoicePhases: [], lastVoiceAmplitudes: [], lastVoicePans: [] };
}

function nodeGraphRobinSupersawUpdateCycleLength(voice) {
  const r = Math.random();
  if (r < voice.probShort) {
    voice.lenNow = voice.lenMid - 1;
  } else if (r < voice.probShort + voice.probMid) {
    voice.lenNow = voice.lenMid;
  } else {
    voice.lenNow = voice.lenMid + 1;
  }
  const maxCount = Math.max(1, voice.lenNow - 1);
  voice.phaseSlope = 1 / maxCount;
}

function nodeGraphRobinSupersawWrap01(value) {
  let x = Number(value) || 0;
  x -= Math.floor(x);
  if (x < 0) x += 1;
  if (x >= 1) x = 0;
  return x;
}

/** Base phasor + live Random Phase offset (phaseRandom × amount). */
function nodeGraphRobinSupersawGetSamplePhasor(voice, randomPhaseAmount) {
  // Amount is not hard-clamped — param domain min/max are UI guides only.
  const amount = Number.isFinite(Number(randomPhaseAmount)) ? Number(randomPhaseAmount) : 0;
  const base = voice.phaseSlope * voice.sampleCount;
  const p = nodeGraphRobinSupersawWrap01(base + (Number(voice.phaseRandom) || 0) * amount);
  voice.sampleCount += 1;
  if (voice.sampleCount >= voice.lenNow) {
    voice.sampleCount = 0;
    nodeGraphRobinSupersawUpdateCycleLength(voice);
  }
  return p;
}

function nodeGraphRobinSupersawSawFromPhasor(phasor) {
  return 2 * phasor - 1;
}

function nodeGraphRobinSupersawResolveVoices(voicesExact) {
  let exact = Number(voicesExact);
  if (!Number.isFinite(exact) || exact < 1) exact = 1;
  if (exact > NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES) exact = NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES;
  const full = Math.floor(exact + 1e-9);
  const frac = exact - full;
  if (frac > 1e-9) {
    return { voiceCount: Math.min(NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES, full + 1), lastFrac: frac };
  }
  return { voiceCount: Math.max(1, full), lastFrac: 0 };
}

function nodeGraphRobinSupersawCentsToFaceX(centsOffset) {
  // Face = ±0.5 oct (1200¢ wide), unison at 0.5. Wrap instead of clip.
  const span = 2 * NODE_GRAPH_ROBIN_SUPERSAW_FACE_HALF_OCT_CENTS;
  let x = 0.5 + (Number(centsOffset) || 0) / span;
  x -= Math.floor(x);
  if (x < 0) x += 1;
  if (x >= 1) x = 0;
  return x;
}

function nodeGraphRobinSupersawResetVoice(voice) {
  voice.sampleCount = 0;
  if (voice.lenMid > 1) {
    voice.lenNow = voice.lenMid;
    nodeGraphRobinSupersawUpdateCycleLength(voice);
  }
  voice.phaseRandom = Math.random();
  voice.portaUnit = Math.random();
}

function nodeGraphRobinSupersawApplyHzToVoiceCycle(voice, hz, sampleRate) {
  const voiceFreq = hz > 1 ? hz : 1;
  const meanCycleLength = sampleRate / voiceFreq;
  const dist = nodeGraphRobinSupersawCalcCycleDistribution(meanCycleLength);
  voice.lenMid = dist.lenMid;
  voice.probShort = dist.probShort;
  voice.probMid = dist.probMid;
  const maxCount = voice.lenNow > 1
    ? voice.lenNow - 1
    : (meanCycleLength > 1 ? meanCycleLength - 1 : 1);
  voice.phaseSlope = 1 / Math.max(1, maxCount);
}

function nodeGraphRobinSupersawPortamentoEnabled(portaMinSec, portaMaxSec) {
  let tMin = Math.max(0, Number(portaMinSec) || 0);
  let tMax = Math.max(0, Number(portaMaxSec) || 0);
  if (tMax < tMin) tMax = tMin;
  return tMax > 0;
}

function nodeGraphRobinSupersawMapNtoN(v, in0, in1, out0, out1) {
  const d = in1 - in0;
  if (!(Math.abs(d) > 1e-30)) return out0;
  return out0 + (out1 - out0) * ((v - in0) / d);
}

/** soemdsp::curve::Rational{c}.get(p) on 0…1. */
function nodeGraphRobinSupersawRational01(p, c) {
  const x = Math.min(1, Math.max(0, Number(p) || 0));
  const skew = Math.min(0.9999, Math.max(-0.9999, Number(c) || 0));
  const den = 1 - skew + 2 * skew * x;
  if (!(Math.abs(den) > 1e-12)) return x;
  return ((1 + skew) * x) / den;
}

/** Supersaw Style → { mode: 0 lin / 1 exp, curve: Rational tension }. */
function nodeGraphRobinSupersawPortamentoStyleToModeAndCurve(style) {
  const s = Math.min(1, Math.max(0, Number(style) || 0));
  if (s < 0.5) {
    return { mode: 0, curve: nodeGraphRobinSupersawMapNtoN(s, 0, 0.5, -1, 1) };
  }
  return { mode: 1, curve: nodeGraphRobinSupersawMapNtoN(s, 0.5, 1, 1, -1) };
}

function nodeGraphRobinSupersawConfigureVoicePortamento(voice, portaMinSec, portaMaxSec, portaStyle, sampleRate) {
  let tMin = Math.max(0, Number(portaMinSec) || 0);
  let tMax = Math.max(0, Number(portaMaxSec) || 0);
  if (tMax < tMin) {
    const tmp = tMin;
    tMin = tMax;
    tMax = tmp;
  }
  // Min=Max=0 → bypass portamento circuit (instant Hz).
  if (!(tMax > 0)) {
    voice.currentHz = voice.targetHz;
    voice.portaInc = 0;
    voice.portaCoeff = 1;
    voice.portaArmed = false;
    return;
  }
  const { mode, curve } = nodeGraphRobinSupersawPortamentoStyleToModeAndCurve(portaStyle);
  voice.portaMode = mode;
  const u = Math.min(1, Math.max(0, Number(voice.portaUnit) || 0));
  const uWarped = nodeGraphRobinSupersawRational01(u, curve);
  const timeSec = tMin + uWarped * (tMax - tMin);
  const tSamples = timeSec * (sampleRate > 1 ? sampleRate : 48000);
  const delta = (Number(voice.targetHz) || 0) - (Number(voice.currentHz) || 0);
  if (!(tSamples > 1) || !(Math.abs(delta) > 1e-12)) {
    voice.currentHz = voice.targetHz;
    voice.portaInc = 0;
    voice.portaCoeff = 1;
    voice.portaArmed = false;
    return;
  }
  voice.portaArmed = true;
  if (voice.portaMode === 0) {
    voice.portaInc = delta / tSamples;
    voice.portaCoeff = 1;
  } else {
    voice.portaInc = 0;
    const a1 = Math.exp(-1 / tSamples);
    voice.portaCoeff = Math.min(1, Math.max(0, 1 - a1)) || 1;
  }
}

function nodeGraphRobinSupersawGlideVoiceHz(voice, sampleRate) {
  if (!voice.portaArmed) {
    voice.currentHz = voice.targetHz;
  } else if (voice.portaMode === 0) {
    voice.currentHz += voice.portaInc;
    if (
      (voice.portaInc > 0 && voice.currentHz > voice.targetHz)
      || (voice.portaInc < 0 && voice.currentHz < voice.targetHz)
      || Math.abs(voice.portaInc) < 1e-30
    ) {
      voice.currentHz = voice.targetHz;
      voice.portaArmed = false;
    }
  } else {
    voice.currentHz += voice.portaCoeff * (voice.targetHz - voice.currentHz);
    if (Math.abs(voice.currentHz - voice.targetHz) <= 1e-6) {
      voice.currentHz = voice.targetHz;
      voice.portaArmed = false;
    }
  }
  const hz = voice.currentHz > 1 ? voice.currentHz : 1;
  const meanCycle = sampleRate / hz;
  const maxCount = meanCycle > 1 ? meanCycle - 1 : 1;
  voice.phaseSlope = 1 / maxCount;
}

function nodeGraphRobinSupersawPrepareVoiceAtCents(
  voice, centsOffset, safeFrequency, sampleRate, portaMinSec, portaMaxSec, portaStyle,
) {
  voice.centsOffset = centsOffset;
  const ratio = Math.pow(2, centsOffset / 1200);
  const voiceFreq = safeFrequency * ratio;
  const first = !(voice.currentHz > 0);
  voice.targetHz = voiceFreq > 1 ? voiceFreq : 1;
  if (first) voice.currentHz = voice.targetHz;
  nodeGraphRobinSupersawConfigureVoicePortamento(
    voice, portaMinSec, portaMaxSec, portaStyle, sampleRate,
  );
  nodeGraphRobinSupersawApplyHzToVoiceCycle(voice, voice.currentHz, sampleRate);
}

/** Primes for Supersaw RatioGenerator-style tables (cached). */
let nodeGraphRobinSupersawPrimes = null;

function nodeGraphRobinSupersawEnsurePrimes() {
  if (nodeGraphRobinSupersawPrimes) return;
  const need = NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES + 2;
  const sieveLimit = 2048;
  const composite = new Array(sieveLimit + 1).fill(false);
  composite[0] = true;
  composite[1] = true;
  for (let p = 2; p * p <= sieveLimit; p++) {
    if (composite[p]) continue;
    for (let m = p * p; m <= sieveLimit; m += p) composite[m] = true;
  }
  const primes = [];
  for (let n = 2; n <= sieveLimit && primes.length < need; n++) {
    if (!composite[n]) primes.push(n);
  }
  while (primes.length < need) primes.push(2 + primes.length);
  nodeGraphRobinSupersawPrimes = primes;
}

function nodeGraphRobinSupersawTransformRange(arr, targetMin, targetMax) {
  const n = arr.length;
  if (n <= 0) return;
  if (n === 1) {
    arr[0] = 0.5 * (targetMin + targetMax);
    return;
  }
  let curMin = arr[0];
  let curMax = arr[0];
  for (let i = 1; i < n; i++) {
    if (arr[i] < curMin) curMin = arr[i];
    if (arr[i] > curMax) curMax = arr[i];
  }
  const denom = curMax - curMin;
  if (!(Math.abs(denom) > 0)) {
    const mid = 0.5 * (targetMin + targetMax);
    for (let i = 0; i < n; i++) arr[i] = mid;
    return;
  }
  const a = (targetMin - targetMax) / (curMin - curMax);
  const b = (curMax * targetMin - curMin * targetMax) / (curMax - curMin);
  for (let i = 0; i < n; i++) arr[i] = a * arr[i] + b;
}

function nodeGraphRobinSupersawFillRawRatios(n, supersawAlgo) {
  nodeGraphRobinSupersawEnsurePrimes();
  const primes = nodeGraphRobinSupersawPrimes;
  const specs = [
    { kind: 0, p1: 1 },
    { kind: 0, p1: 1e-8 },
    { kind: 1, p1: 1e-8 },
    { kind: 1, p1: 1 },
    { kind: 2, p1: 0 },
    { kind: 2, p1: 1 },
  ];
  const spec = specs[Math.max(0, Math.min(5, supersawAlgo | 0))];
  const out = new Array(n);
  if (spec.kind === 0) {
    for (let i = 0; i < n; i++) out[i] = Math.pow(primes[i], spec.p1);
  } else if (spec.kind === 1) {
    for (let i = 0; i < n; i++) {
      out[i] = Math.pow(primes[i + 1], spec.p1) - Math.pow(primes[i], spec.p1);
    }
    out.sort((a, b) => a - b);
  } else {
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      const linVal = 1 + t;
      const expVal = Math.exp(linVal) / Math.exp(2);
      out[i] = (1 - spec.p1) * linVal + spec.p1 * expVal;
    }
  }
  return out;
}

function nodeGraphRobinSupersawFillVoiceCents(voiceCount, algorithm, spreadCents) {
  if (voiceCount <= 1) return [0];
  let algo = Math.round(Number(algorithm) || 0);
  if (algo < 0) algo = 0;
  if (algo > 6) algo = 6;
  const half = 0.5 * Math.max(0, Number(spreadCents) || 0);

  // UI: 0 Linear, 1 Chordal, 2 Emotional, 3 Realistic, 4 Classic, 5 Uniform, 6 Exponential.
  // Uniform: original even cents around unison.
  if (algo === 5) {
    const cents = new Array(voiceCount);
    for (let i = 0; i < voiceCount; i++) {
      const t = i / (voiceCount - 1);
      cents[i] = (t - 0.5) * (2 * half);
    }
    return cents;
  }

  // RatioGenerator kinds: Classic=0, Realistic=1, Emotional=2, Chordal=3, Linear=4, Exponential=5.
  const supersawAlgo = (
    algo === 4 ? 0
      : algo === 3 ? 1
        : algo === 2 ? 2
          : algo === 1 ? 3
            : algo === 0 ? 4
              : 5
  );
  const ratios = nodeGraphRobinSupersawFillRawRatios(voiceCount, supersawAlgo);
  const minRatio = Math.pow(2, -half / 1200);
  const maxRatio = Math.pow(2, half / 1200);
  nodeGraphRobinSupersawTransformRange(ratios, minRatio, maxRatio);
  const cents = new Array(voiceCount);
  for (let i = 0; i < voiceCount; i++) {
    let r = ratios[i];
    if (!(r > 1e-12)) r = 1e-12;
    cents[i] = 1200 * Math.log2(r);
  }

  // Emotional (2) / Realistic (3): cluster-center then stretch.
  if (algo === 2 || algo === 3) {
    const sorted = cents.slice().sort((a, b) => a - b);
    const median = (voiceCount % 2 === 1)
      ? sorted[(voiceCount - 1) >> 1]
      : 0.5 * (sorted[voiceCount / 2 - 1] + sorted[voiceCount / 2]);
    for (let i = 0; i < voiceCount; i++) cents[i] -= median;

    let lo = cents[0];
    let hi = cents[0];
    for (let i = 1; i < voiceCount; i++) {
      if (cents[i] < lo) lo = cents[i];
      if (cents[i] > hi) hi = cents[i];
    }
    const scaleNeg = lo < -1e-12 ? half / -lo : 1;
    const scalePos = hi > 1e-12 ? half / hi : 1;
    for (let i = 0; i < voiceCount; i++) {
      cents[i] *= cents[i] < 0 ? scaleNeg : scalePos;
    }
  }
  return cents;
}

/** Detuned saws are partly uncorrelated — √Σamp keeps loudness steadier than /N. */
function nodeGraphRobinSupersawBankMixScale(ampWeightSum) {
  const w = Number(ampWeightSum);
  if (!(w > 0)) return 0;
  return 1 / Math.sqrt(w);
}

function nodeGraphRobinSupersawSumPreparedBank(bank, voiceCount, lastFrac, randomPhaseAmount, sampleRate, portaOn) {
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < voiceCount; i++) {
    if (portaOn) nodeGraphRobinSupersawGlideVoiceHz(bank[i], sampleRate);
    else bank[i].currentHz = bank[i].targetHz;
    let amp = 1;
    if (lastFrac > 0 && i === voiceCount - 1) amp = lastFrac;
    sum += nodeGraphRobinSupersawSawFromPhasor(
      nodeGraphRobinSupersawGetSamplePhasor(bank[i], randomPhaseAmount),
    ) * amp;
    norm += amp;
  }
  return sum * nodeGraphRobinSupersawBankMixScale(norm);
}

function nodeGraphRobinSupersawSumVoiceBank(
  bank, voiceCount, lastFrac, safeFrequency, sampleRate, spreadCents, randomPhaseAmount, detuneAlgorithm,
  portaMinSec, portaMaxSec, portaStyle,
) {
  const cents = nodeGraphRobinSupersawFillVoiceCents(voiceCount, detuneAlgorithm, spreadCents);
  for (let i = 0; i < voiceCount; i++) {
    nodeGraphRobinSupersawPrepareVoiceAtCents(
      bank[i], cents[i], safeFrequency, sampleRate, portaMinSec, portaMaxSec, portaStyle,
    );
  }
  const portaOn = nodeGraphRobinSupersawPortamentoEnabled(portaMinSec, portaMaxSec);
  return nodeGraphRobinSupersawSumPreparedBank(
    bank, voiceCount, lastFrac, randomPhaseAmount, sampleRate, portaOn,
  );
}

/** Alternating: L R L R… across the detune stack (not low-half L / high-half R). */
function nodeGraphRobinSupersawAlternatingPan(index, voiceCount) {
  if (voiceCount <= 1) return 0;
  return (index & 1) === 0 ? -1 : 1;
}

function nodeGraphRobinSupersawPublishDual(state, bankL, _bankR, voiceCount, lastFrac) {
  // Same detune map on both channels — one column per voice, red+blue stacked.
  const phases = [];
  const amps = [];
  const pans = [];
  for (let i = 0; i < voiceCount; i++) {
    const x = nodeGraphRobinSupersawCentsToFaceX(bankL[i].centsOffset);
    const amp = lastFrac > 0 && i === voiceCount - 1 ? lastFrac : 1;
    phases.push(x, x);
    pans.push(-1, 1);
    amps.push(amp, amp);
  }
  state.lastVoicePhases = phases;
  state.lastVoiceAmplitudes = amps;
  state.lastVoicePans = pans;
}

function nodeGraphRobinSupersawPublishAlternating(state, bank, voiceCount, lastFrac) {
  const phases = [];
  const amps = [];
  const pans = [];
  for (let i = 0; i < voiceCount; i++) {
    phases.push(nodeGraphRobinSupersawCentsToFaceX(bank[i].centsOffset));
    pans.push(nodeGraphRobinSupersawAlternatingPan(i, voiceCount));
    amps.push(lastFrac > 0 && i === voiceCount - 1 ? lastFrac : 1);
  }
  state.lastVoicePhases = phases;
  state.lastVoiceAmplitudes = amps;
  state.lastVoicePans = pans;
}

function nodeGraphRobinSupersawMixAlternating(
  bank, voiceCount, lastFrac, safeFrequency, sampleRate, spreadCents, randomPhaseAmount, detuneAlgorithm,
  portaMinSec, portaMaxSec, portaStyle,
) {
  const cents = nodeGraphRobinSupersawFillVoiceCents(voiceCount, detuneAlgorithm, spreadCents);
  for (let i = 0; i < voiceCount; i++) {
    nodeGraphRobinSupersawPrepareVoiceAtCents(
      bank[i], cents[i], safeFrequency, sampleRate, portaMinSec, portaMaxSec, portaStyle,
    );
  }
  const portaOn = nodeGraphRobinSupersawPortamentoEnabled(portaMinSec, portaMaxSec);
  let left = 0;
  let right = 0;
  let normL = 0;
  let normR = 0;
  for (let i = 0; i < voiceCount; i++) {
    if (portaOn) nodeGraphRobinSupersawGlideVoiceHz(bank[i], sampleRate);
    else bank[i].currentHz = bank[i].targetHz;
    let amp = 1;
    if (lastFrac > 0 && i === voiceCount - 1) amp = lastFrac;
    const saw = nodeGraphRobinSupersawSawFromPhasor(
      nodeGraphRobinSupersawGetSamplePhasor(bank[i], randomPhaseAmount),
    );
    const pan = nodeGraphRobinSupersawAlternatingPan(i, voiceCount);
    if (pan < -0.25) {
      left += saw * amp;
      normL += amp;
    } else if (pan > 0.25) {
      right += saw * amp;
      normR += amp;
    } else {
      left += saw * amp * 0.5;
      right += saw * amp * 0.5;
      normL += amp * 0.5;
      normR += amp * 0.5;
    }
  }
  return {
    left: left * nodeGraphRobinSupersawBankMixScale(normL),
    right: right * nodeGraphRobinSupersawBankMixScale(normR),
  };
}

function nodeGraphRobinSupersawSample(state, options = {}) {
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const safeFrequency = Number.isFinite(Number(options.frequencyHz)) ? Number(options.frequencyHz) : 0;
  const { voiceCount, lastFrac } = nodeGraphRobinSupersawResolveVoices(options.voices);
  const spreadCents = Math.max(0, Number(options.detuneCents) || 0);
  const level = Number(options.level) || 0;
  const randomPhaseRaw = Number(options.phaseSpread);
  const randomPhase = Number.isFinite(randomPhaseRaw) ? randomPhaseRaw : 1;
  const stereoMode = Number(options.stereoMode) >= 0.5 ? 1 : 0;
  const detuneAlgorithmRaw = Number(options.detuneAlgorithm);
  const detuneAlgorithm = Number.isFinite(detuneAlgorithmRaw) ? detuneAlgorithmRaw : 2;
  const portaMinRaw = Number(options.portaTimeMin);
  const portaMinSec = Number.isFinite(portaMinRaw) ? Math.max(0, portaMinRaw) : 0;
  const portaMaxRaw = Number(options.portaTimeMax);
  const portaMaxSec = Number.isFinite(portaMaxRaw) ? Math.max(0, portaMaxRaw) : 0;
  const portaStyleRaw = Number(options.portamentoStyle);
  const portaStyle = Number.isFinite(portaStyleRaw) ? portaStyleRaw : 0.126;
  const reset = Number(options.reset) || 0;
  if ((Number(state.lastReset) || 0) <= 0 && reset > 0) {
    for (let i = 0; i < NODE_GRAPH_ROBIN_SUPERSAW_MAX_VOICES; i++) {
      nodeGraphRobinSupersawResetVoice(state.left[i]);
      nodeGraphRobinSupersawResetVoice(state.right[i]);
    }
  }
  state.lastReset = reset;

  let left = 0;
  let right = 0;
  if (stereoMode === 0) {
    // Dual Channel: same detune map on L and R (independent dither).
    left = nodeGraphRobinSupersawSumVoiceBank(
      state.left, voiceCount, lastFrac, safeFrequency, sampleRate, spreadCents, randomPhase, detuneAlgorithm,
      portaMinSec, portaMaxSec, portaStyle,
    );
    right = nodeGraphRobinSupersawSumVoiceBank(
      state.right, voiceCount, lastFrac, safeFrequency, sampleRate, spreadCents, randomPhase, detuneAlgorithm,
      portaMinSec, portaMaxSec, portaStyle,
    );
    nodeGraphRobinSupersawPublishDual(state, state.left, state.right, voiceCount, lastFrac);
  } else {
    const mixed = nodeGraphRobinSupersawMixAlternating(
      state.left, voiceCount, lastFrac, safeFrequency, sampleRate, spreadCents, randomPhase, detuneAlgorithm,
      portaMinSec, portaMaxSec, portaStyle,
    );
    left = mixed.left;
    right = mixed.right;
    nodeGraphRobinSupersawPublishAlternating(state, state.left, voiceCount, lastFrac);
  }
  if (!Number.isFinite(left)) left = 0;
  if (!Number.isFinite(right)) right = 0;

  const outLeft = clampNodeSliderValue(left, -1.5, 1.5) * level;
  const outRight = clampNodeSliderValue(right, -1.5, 1.5) * level;
  const outMono = (outLeft + outRight) * 0.5;
  return {
    Mono: outMono,
    Left: outLeft,
    Right: outRight,
    voicePhases: state.lastVoicePhases,
    voiceAmplitudes: state.lastVoiceAmplitudes,
    voicePans: state.lastVoicePans,
  };
}
