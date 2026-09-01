// Shared Yellow Graph payload + additive partial tables + Effect modes.
// Graph is once-per-quantum ZOH: parallel arrays length H.

const ADDITIVE_GRAPH_MAX_H = 4096;

function additiveGraphClamp(v, lo, hi) {
  const n = Number(v);
  if (!(n === n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function additiveGraphWrap01(v) {
  const n = Number(v) || 0;
  const w = n - Math.floor(n);
  return w < 0 ? 0 : w >= 1 ? 0 : w;
}

function additiveGraphRationalCurve(t, c) {
  const x = additiveGraphClamp(t, 0, 1);
  const skew = additiveGraphClamp(c, -0.9999, 0.9999);
  const cv = skew * x;
  const den = 2 * cv - skew + 1;
  if (Math.abs(den) < 1e-12) return x;
  return (cv + x) / den;
}

/** Exponential 0…1 map. c∈(−1…+1): + = slow start / fast end. */
function additiveGraphExpCurve(t, c) {
  const x = additiveGraphClamp(t, 0, 1);
  const k = additiveGraphClamp(c, -0.9999, 0.9999) * 8;
  if (Math.abs(k) < 1e-6) return x;
  return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
}

/**
 * FrequencySkew Exponential — tighter than the shared Bubble exp (*8)
 * so |c|→1 approaches Rational extremity (k up to ~48).
 */
function additiveGraphExpCurveTight(t, c) {
  const x = additiveGraphClamp(t, 0, 1);
  const s = additiveGraphClamp(c, -0.9999, 0.9999);
  if (Math.abs(s) < 1e-6) return x;
  const k = s * (12 + 36 * s * s);
  return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
}

/** FrequencySkew Curve: 0 Exponential, 1 Rational, 2 Logarithmic. */
function additiveGraphNormalizeFrequencySkewCurveMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1 || n === 2) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "rat" || s === "rational") return 1;
  if (s === "2" || s === "log" || s === "logarithmic") return 2;
  return 0;
}

/**
 * Logarithmic 0…1 map. c∈(−1…+1): + = fast start / slow end.
 * Positive uses strength ×8. Negative mirrors via (1−t) so the full −1…0
 * travel is usable (raw u=c×8 floors at c≈−0.125 and felt “dead” below that).
 */
function additiveGraphLogCurve(t, c) {
  const x = additiveGraphClamp(t, 0, 1);
  const s = additiveGraphClamp(c, -0.9999, 0.9999);
  if (Math.abs(s) < 1e-6) return x;
  if (s > 0) {
    const u = s * 8;
    return Math.log(1 + u * x) / Math.log(1 + u);
  }
  // Mirror positive log around the diagonal — endpoints stay 0/1.
  const u = (-s) * 8;
  return 1 - Math.log(1 + u * (1 - x)) / Math.log(1 + u);
}

/** Growl Skew Curve family: 0 Rational, 1 Exponential, 2 Logarithmic, 3 Linear. */
function additiveGraphNormalizeSkewCurveMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1 || n === 2 || n === 3) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "exp" || s === "exponential") return 1;
  if (s === "2" || s === "log" || s === "logarithmic") return 2;
  if (s === "3" || s === "lin" || s === "linear") return 3;
  return 0;
}

function additiveGraphSkewMap(t, curve, mode) {
  const m = additiveGraphNormalizeSkewCurveMode(mode);
  if (m === 3) return additiveGraphClamp(t, 0, 1);
  // Exponential: flip skew so −1/+1 matches Rational / Log knob sense.
  if (m === 1) return additiveGraphExpCurve(t, -curve);
  if (m === 2) return additiveGraphLogCurve(t, curve);
  return additiveGraphRationalCurve(t, curve);
}

/**
 * Basic harmonic waveforms for Additive Generator (Yellow Graph).
 * Indices: 0 Saw, 1 Square, 2 PulseCenter, 3 PulseLeft, 4 PulseRight,
 *          5 Tri, 6 RectSine.
 * PWM (−1…+1) applies only to Pulse*: 0 = 50% duty, ±1 → ~2%…~98%.
 * Saw / Square / Tri / RectSine ignore PWM.
 * Phase Rotation is on Additive Generator (baked into Graph phases).
 */
function additiveGraphWaveformPartial(waveform, harmonic, pwm = 0) {
  const n = Math.max(1, Math.floor(Number(harmonic) || 1));
  const h = n;
  const odd = n % 2 === 1;
  const m = additiveGraphClamp(Number(pwm) || 0, -1, 1);
  let amplitude = 0;
  let phase = 0;
  const wf = Math.round(Number(waveform) || 0);

  // Classic PWM: amp_n ∝ sin(π·n·duty) / n. Duty kept off 0/1 so partials stay alive.
  const pulseDuty = 0.5 + m * 0.48;
  const pulseAmp = Math.sin(Math.PI * h * pulseDuty) / h;

  switch (wf) {
    case 0: // Saw — full odd+even 1/n
      amplitude = 1 / h;
      phase = odd ? 0.5 : 0;
      break;
    case 1: // Square — odds only 1/n
      amplitude = odd ? 1 / h : 0;
      phase = 0.5;
      break;
    case 2: // PulseCenter — PWM width
      amplitude = pulseAmp;
      phase = 0.25;
      break;
    case 3: // PulseLeft — rising edge at cycle start
      amplitude = pulseAmp;
      phase = h * pulseDuty * 0.5;
      break;
    case 4: // PulseRight — falling edge at cycle end
      amplitude = pulseAmp;
      phase = 1 - (h * pulseDuty * 0.5);
      break;
    case 5: // Tri — odds / n²
      amplitude = odd ? 1 / (h * h) : 0;
      phase = n % 4 === 1 ? 0 : 0.5;
      break;
    case 6: // RectSine — 1/n², odds @0.25 / evens @0.75
      amplitude = 1 / (h * h);
      phase = odd ? 0.25 : 0.75;
      break;
    default:
      amplitude = 1 / h;
      phase = odd ? 0.5 : 0;
      break;
  }
  if (!(amplitude === amplitude)) amplitude = 0;
  // Negative Fourier coeffs → positive amp + half-cycle phase flip.
  if (amplitude < 0) {
    amplitude = -amplitude;
    phase += 0.5;
  }
  return { amplitude, phase: additiveGraphWrap01(phase), ratio: h };
}

function additiveGraphCreatePayload(harmonics) {
  // 0 harmonics = empty graph (valid). Fallback only when non-finite.
  let hCount = Number(harmonics);
  if (!Number.isFinite(hCount)) hCount = 1;
  const H = Math.max(0, Math.min(ADDITIVE_GRAPH_MAX_H, Math.round(hCount)));
  return {
    harmonics: H,
    ratio: new Float32Array(H),
    phase: new Float32Array(H),
    amplitude: new Float32Array(H),
    // Final Graph plane: bipolar pan −1…+1 (0 = center). Additive Out → L/R.
    pan: new Float32Array(H),
  };
}

function additiveGraphClonePayload(src) {
  if (!src || !src.ratio) return null;
  const H = src.ratio.length | 0;
  const out = additiveGraphCreatePayload(H);
  out.ratio.set(src.ratio);
  out.phase.set(src.phase);
  out.amplitude.set(src.amplitude);
  if (src.pan && src.pan.length === H) {
    out.pan.set(src.pan);
  }
  // WhiteNoise recipes + quantum lerps (walks shared by ref for Out).
  const copyNoise = (key) => {
    const n = src[key];
    if (!n || typeof n !== "object") return;
    out[key] = {
      mode: n.mode,
      amount: n.amount,
      speedHz: n.speedHz,
      walks: n.walks,
      seed: n.seed,
    };
  };
  copyNoise("ratioNoise");
  copyNoise("phaseNoise");
  copyNoise("panNoise");
  copyNoise("ampNoise");
  const copyLerp = (key) => {
    const lerp = src[key];
    if (!lerp?.from || !lerp?.to) return;
    const lf = lerp.from;
    const lt = lerp.to;
    const n = Math.min(H, lf.length | 0, lt.length | 0);
    const from = new Float32Array(H);
    const to = new Float32Array(H);
    for (let i = 0; i < n; i += 1) {
      from[i] = lf[i];
      to[i] = lt[i];
    }
    out[key] = { from, to };
  };
  copyLerp("ratioLerp");
  copyLerp("phaseLerp");
  copyLerp("panLerp");
  copyLerp("ampLerp");
  if (src.harmonicsExact != null) out.harmonicsExact = src.harmonicsExact;
  if (src.phaseReset) out.phaseReset = true;
  return out;
}

/** HarmonicFade: 0 Instant / 1 Smoothed / 2 Decimal. */
function additiveGraphNormalizeHarmonicFade(mode) {
  const n = Math.round(Number(mode));
  if (n === 0 || n === 2) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "0" || s === "instant") return 0;
  if (s === "2" || s === "decimal") return 2;
  return 1;
}

/**
 * Resolve allocated slot count + trailing frac from Harmonics + HarmonicFade.
 * Instant/Smoothed: round to integer (frac=0). Decimal: ceil + trailing frac.
 */
function additiveGraphResolveHarmonicSlots(harmonics, harmonicFade = 1) {
  const fade = additiveGraphNormalizeHarmonicFade(harmonicFade);
  let exact = Number(harmonics);
  if (!Number.isFinite(exact) || exact < 0) exact = 0;
  if (exact > ADDITIVE_GRAPH_MAX_H) exact = ADDITIVE_GRAPH_MAX_H;
  if (fade !== 2) {
    const H = Math.max(0, Math.min(ADDITIVE_GRAPH_MAX_H, Math.round(exact)));
    return { exact: H, H, lastFrac: 0, fade };
  }
  if (!(exact > 0)) return { exact: 0, H: 0, lastFrac: 0, fade };
  const full = Math.floor(exact + 1e-9);
  let frac = exact - full;
  let H;
  if (frac > 1e-9) {
    H = Math.min(ADDITIVE_GRAPH_MAX_H, full + 1);
  } else {
    H = Math.min(ADDITIVE_GRAPH_MAX_H, full);
    frac = 0;
  }
  return { exact, H, lastFrac: frac, fade };
}

/**
 * Build Generator Graph: relative ratios + waveform amps/phases; pan centered.
 * HarmonicFade Instant/Smoothed: integer slots. Decimal: trailing partial amp.
 * Bubble Cutoff may still apply its own harmonic_count_gain skirt.
 */
function additiveGraphBuildFromWaveform(
  waveform, pwm, harmonics, phaseRotation = 0, harmonicFade = 1,
) {
  const slots = additiveGraphResolveHarmonicSlots(harmonics, harmonicFade);
  const H = slots.H;
  const graph = additiveGraphCreatePayload(H);
  const wf = Number(waveform) || 0;
  const m = additiveGraphClamp(Number(pwm) || 0, -1, 1);
  const rot = Number(phaseRotation) || 0;
  for (let i = 0; i < H; i += 1) {
    const partial = additiveGraphWaveformPartial(wf, i + 1, m);
    graph.ratio[i] = partial.ratio;
    graph.phase[i] = additiveGraphWrap01(partial.phase + rot);
    let amp = partial.amplitude;
    if (slots.lastFrac > 0 && i === H - 1) amp *= slots.lastFrac;
    graph.amplitude[i] = amp;
    graph.pan[i] = 0;
  }
  graph.harmonicsExact = slots.exact;
  graph.harmonicFade = slots.fade;
  return graph;
}

/**
 * One-quantum amp crossfade when Generator slot count changes (HarmonicFade=Smoothed).
 * Grows: new partials from=0. Shrinks: keep old ratio/phase one quantum, to=0.
 */
function additiveGraphApplyGeneratorHarmonicsCountLerp(
  graph, prevAmp, prevRatio, prevPhase, prevH, newH,
) {
  if (!graph || prevH < 0 || newH < 0 || prevH === newH) return graph;
  const pH = Math.min(ADDITIVE_GRAPH_MAX_H, Math.max(0, prevH | 0));
  const nH = Math.min(ADDITIVE_GRAPH_MAX_H, Math.max(0, newH | 0));
  const Hlerp = Math.max(pH, nH);
  if (Hlerp <= 0) return graph;
  if (Hlerp > (graph.ratio?.length | 0)) {
    const ratio = new Float32Array(Hlerp);
    const phase = new Float32Array(Hlerp);
    const amplitude = new Float32Array(Hlerp);
    const pan = new Float32Array(Hlerp);
    if (graph.ratio) ratio.set(graph.ratio);
    if (graph.phase) phase.set(graph.phase);
    if (graph.amplitude) amplitude.set(graph.amplitude);
    if (graph.pan) pan.set(graph.pan);
    graph.ratio = ratio;
    graph.phase = phase;
    graph.amplitude = amplitude;
    graph.pan = pan;
  }
  const from = new Float32Array(Hlerp);
  const to = new Float32Array(Hlerp);
  for (let i = 0; i < Hlerp; i += 1) {
    from[i] = prevAmp && i < pH ? Number(prevAmp[i]) || 0 : 0;
    if (i < nH) {
      to[i] = Number(graph.amplitude[i]) || 0;
    } else {
      to[i] = 0;
      if (prevRatio && i < pH) graph.ratio[i] = Number(prevRatio[i]) || 0;
      if (prevPhase && i < pH) graph.phase[i] = Number(prevPhase[i]) || 0;
      graph.amplitude[i] = 0;
      graph.pan[i] = 0;
    }
  }
  graph.harmonics = Hlerp;
  graph.ampLerp = { from, to };
  return graph;
}

/**
 * FrequencySkew — stretch ratio span + optional mid compression.
 * Low/High Stretch + Skew ranges are owned by param min/max (not clamped here).
 * Linear remap [r0,rHi]→[newLo,newHi], then Skew+Curve reshape middles (endpoints fixed).
 * Curve: 0 Exponential (skew sense reversed vs Rational/Log), 1 Rational, 2 Log.
 * |Skew|≥1 → middles hard-converge to fund or last. Stamps ratioLerp.
 */
function additiveGraphApplyFrequencySkew(
  graph, lowStretch = 1, highStretch = 1, skew = 0, curveMode = 0, lerpFrom = null,
) {
  if (!graph || !graph.harmonics) return { graph, lerpFrom: null };
  const H = graph.harmonics | 0;
  if (H < 1) return { graph, lerpFrom: null };
  const Lraw = Number(lowStretch);
  const HsRaw = Number(highStretch);
  const skewRaw = Number(skew);
  const L = Number.isFinite(Lraw) ? Lraw : 1;
  const Hs = Number.isFinite(HsRaw) ? HsRaw : 1;
  const skewAmt = Number.isFinite(skewRaw) ? skewRaw : 0;
  const idle = !(Math.abs(L - 1) > 1e-12)
    && !(Math.abs(Hs - 1) > 1e-12)
    && !(Math.abs(skewAmt) > 1e-12);
  if (idle || H === 1) {
    graph.ratioLerp = null;
    graph.ratioNoise = null;
    return { graph, lerpFrom: null };
  }
  const mode = additiveGraphNormalizeFrequencySkewCurveMode(curveMode);
  const isExp = mode === 0;
  // Soft map: Exp flips sign so +Skew piles toward last (same as Rational/Log).
  const curveArg = isExp ? -skewAmt : skewAmt;
  const r0 = Math.max(0, Number(graph.ratio[0]) || 0);
  const rHi = Math.max(r0, Number(graph.ratio[H - 1]) || 0);
  const span = rHi - r0;
  const newLo = r0 / L;
  const newHi = rHi * Hs;
  const newSpan = newHi - newLo;
  // Hard extremes keyed off Skew (all curves share knob sense).
  const hardHi = skewAmt >= 1 - 1e-12;
  const hardLo = skewAmt <= -1 + 1e-12;
  // Curve kernels need |c|<1 for poles; only soft path (param should keep |skew|≤1).
  const soft = !hardHi && !hardLo
    ? additiveGraphClamp(curveArg, -0.9999, 0.9999)
    : 0;
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const r = Math.max(0, Number(graph.ratio[i]) || 0);
    let t = span > 1e-12 ? (r - r0) / span : (H <= 1 ? 0 : i / (H - 1));
    t = additiveGraphClamp(t, 0, 1);
    let u;
    if (hardHi) {
      // +1: all but fund → last.
      u = t <= 0 ? 0 : 1;
    } else if (hardLo) {
      // −1: all but last → fund.
      u = t >= 1 ? 1 : 0;
    } else if (isExp) {
      u = additiveGraphExpCurveTight(t, soft);
    } else if (mode === 2) {
      u = additiveGraphLogCurve(t, soft);
    } else {
      u = additiveGraphRationalCurve(t, soft);
    }
    to[i] = Math.max(0, newLo + u * newSpan);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.ratioLerp = { from, to };
  graph.ratio.set(to);
  graph.ratioNoise = null;
  return { graph, lerpFrom: new Float32Array(to) };
}

/** @deprecated use additiveGraphApplyFrequencySkew */
function additiveGraphApplyFrequencySlope(
  graph, scale = 0, skew = 0, curveMode = 0, lerpFrom = null,
) {
  // Old Scale±1 ≈ mild high/low stretch toward collapse; keep patches from hard-failing.
  const s = additiveGraphClamp(Number(scale) || 0, -1, 1);
  const low = s < 0 ? 1 + Math.abs(s) * 23 : 1;
  const high = s > 0 ? 1 + Math.abs(s) * 23 : 1;
  return additiveGraphApplyFrequencySkew(graph, low, high, skew, curveMode, lerpFrom);
}

/**
 * Snap x = r/r0 to nearest integer multiple (1,2,3,…) or dyadic division (1/2,1/4,…).
 */
function additiveGraphSnapHarmonicMultiple(x) {
  const v = Number(x);
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  let best = 1;
  let bestDist = Math.abs(v - 1);
  const nMax = Math.max(1, Math.ceil(v) + 2);
  for (let n = 1; n <= nMax; n += 1) {
    const d = Math.abs(v - n);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  for (let k = 1; k <= 16; k += 1) {
    const div = Math.pow(2, -k);
    const d = Math.abs(v - div);
    if (d < bestDist) {
      bestDist = d;
      best = div;
    }
  }
  return best;
}

/**
 * Stable per-harmonic unit random in [0,1). Avalanche-mix seed×index so
 * consecutive harmonics are not linearly correlated (weak LCG sounded “grid-y”).
 */
function additiveGraphHarmonicUnitRandom(seed, index, salt = 1) {
  let s = (Math.floor(Number(seed)) || 0) >>> 0;
  s ^= Math.imul((index | 0) + 1, 0x9e3779b1);
  s ^= Math.imul((salt | 0) || 1, 0x85ebca6b);
  s = Math.imul(s ^ (s >>> 16), 0x7feb352d) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x846ca68b) >>> 0;
  s ^= s >>> 16;
  return (s >>> 0) / 4294967295;
}

/**
 * QuantizePhase — optional lock to fundamental Graph phase, then random (last).
 * quantize on: every partial phase ← fund phase.
 * randomAmount: 0 = keep; (0,1) = morph toward independent random phase;
 *   ≥1 = use randomPhaseValue · amount (1 = exact random in [0,1) cycles).
 * Stamps phaseLerp. Returns { graph, lerpFrom }.
 */
function additiveGraphApplyQuantizePhase(
  graph, quantize = 0, randomAmount = 0, seed = 1, lerpFrom = null,
) {
  if (!graph || !graph.harmonics) return { graph, lerpFrom: null };
  const H = graph.harmonics | 0;
  if (H < 1) return { graph, lerpFrom: null };
  const doQuant = Math.round(Number(quantize) || 0) === 1;
  const amtRaw = Number(randomAmount);
  const amt = Number.isFinite(amtRaw) ? amtRaw : 0;
  const seedN = Number(seed);
  const seedUse = Number.isFinite(seedN) ? seedN : 1;
  if (!doQuant && !(Math.abs(amt) > 1e-12)) {
    graph.phaseLerp = null;
    return { graph, lerpFrom: null };
  }
  const fundPhase = additiveGraphWrap01(Number(graph.phase[0]) || 0);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    let p = additiveGraphWrap01(Number(graph.phase[i]) || 0);
    if (doQuant) {
      p = fundPhase;
    }
    // Random last — independent per partial for a diffuse bank.
    if (Math.abs(amt) > 1e-12) {
      const r = additiveGraphHarmonicUnitRandom(seedUse, i, 29); // [0,1)
      if (amt >= 1) {
        // 1 = exact random phase value; >1 scales that value (still wraps).
        p = additiveGraphWrap01(r * amt);
      } else {
        // Partial morph from current phase toward independent random.
        p = additiveGraphWrap01(p + (r - p) * amt);
      }
    }
    to[i] = p;
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.phaseLerp = { from, to };
  graph.phase.set(to);
  graph.phaseNoise = null;
  return { graph, lerpFrom: new Float32Array(to) };
}

/**
 * QuantizeFreq — bipolar random ratio offset first, then optional fund-relative snap.
 * qFund reference is always the pre-random fundamental.
 * affectFundamental Off: ratio[0] locked. On: fund may move via random; overtones
 * still snap to the original fund reference (fund slot itself is never snapped).
 * Stamps ratioLerp. Returns { graph, lerpFrom }.
 */
function additiveGraphNormalizeQuantizeOn(value) {
  if (value === true || value === 1 || value === "1") return 1;
  const n = Number(value);
  if (Number.isFinite(n)) return n >= 0.5 ? 1 : 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "on" || s === "true" || s === "yes") return 1;
  return 0;
}

function additiveGraphApplyQuantizeFreq(
  graph, quantize = 0, randomAmount = 0, seed = 1, lerpFrom = null, affectFundamental = 0,
) {
  if (!graph || !graph.harmonics) return { graph, lerpFrom: null };
  const H = graph.harmonics | 0;
  if (H < 1) return { graph, lerpFrom: null };
  const doQuant = additiveGraphNormalizeQuantizeOn(quantize) === 1;
  const affectFund = additiveGraphNormalizeQuantizeOn(affectFundamental) === 1;
  const amtRaw = Number(randomAmount);
  const amt = Number.isFinite(amtRaw) ? amtRaw : 0;
  const seedN = Number(seed);
  const seedUse = Number.isFinite(seedN) ? seedN : 1;
  if (!doQuant && !(Math.abs(amt) > 1e-12)) {
    graph.ratioLerp = null;
    graph.ratioNoise = null;
    return { graph, lerpFrom: null };
  }
  // Prefer upstream quantum target if a ratio lerp plane is present.
  if (graph.ratioLerp?.to && graph.ratioLerp.to.length === H) {
    graph.ratio.set(graph.ratioLerp.to);
  }
  const fundIn = Number(graph.ratio[0]);
  const fund = Number.isFinite(fundIn) ? fundIn : 0;
  const qFund = Math.abs(fund) > 1e-12 ? fund : 1;
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    if (i === 0 && !affectFund) {
      to[0] = fund;
      continue;
    }
    let r = Number(graph.ratio[i]) || 0;
    // 1) Bipolar random anywhere up/down.
    if (Math.abs(amt) > 1e-12) {
      const u = additiveGraphHarmonicUnitRandom(seedUse, i, 13);
      r += (u * 2 - 1) * amt;
    }
    // 2) Quantize after random (overtones only).
    if (doQuant && i > 0) {
      r = additiveGraphSnapHarmonicMultiple(r / qFund) * qFund;
    }
    to[i] = Math.max(0, r);
  }
  if (!affectFund) {
    to[0] = fund;
  }
  graph.ratio.set(to);
  graph.ratioNoise = null;
  if (doQuant) {
    // Hard grid — no quantum glide between snap slots (that sounded continuous).
    graph.ratioLerp = null;
    return { graph, lerpFrom: null };
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  if (!affectFund) from[0] = fund;
  graph.ratioLerp = { from, to };
  return { graph, lerpFrom: new Float32Array(to) };
}

/** @deprecated use additiveGraphApplyQuantizeFreq */
function additiveGraphApplyHarmonicMath(
  graph,
  multiplyDivide = 0,
  addSubtract = 0,
  quantize = 0,
  smoothAmount = 0,
  smoothStyle = 0,
  lerpFrom = null,
) {
  return additiveGraphApplyQuantizeFreq(graph, quantize, 0, 1, lerpFrom);
}

/** @deprecated use additiveGraphApplyQuantizeFreq */
function additiveGraphApplyFrequencyMath(graph, multiplyDivide = 0, addSubtract = 0, lerpFrom = null) {
  return additiveGraphApplyQuantizeFreq(graph, 0, 0, 1, lerpFrom);
}

// --- Noisy modulation sources (once-per-quantum, GPU-friendly state machines) ---

function cheapWalkCreate(seed = 1) {
  return { x: 0, y: 0, seed: (seed >>> 0) || 1 };
}

/** Shared LCG bipolar sample in (−1, +1). Advances state.seed. */
function cheapNoiseWhiteSample(state) {
  let s = state.seed >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  state.seed = s;
  return (s / 4294967295) * 2 - 1;
}

/**
 * CheapWalk tick. speed01 dimensionless (quantum-scaled Hz).
 * Reflecting random walk — great slow deviation; weak as hiss.
 * Speed 0 → frozen (x unchanged).
 */
function cheapWalkStep(state, speed01) {
  const bipolar = cheapNoiseWhiteSample(state);
  const rate = Number(speed01);
  const step = (Number.isFinite(rate) && rate > 0 ? rate : 0) * 0.35;
  let x = (Number(state.x) || 0) + bipolar * step;
  if (x > 1) x = 2 - x;
  if (x < -1) x = -2 - x;
  state.x = x;
  return x;
}

/**
 * CheapFilteredNoise: white → one-pole, then soft-rail.
 * Low Speed: slow LP + strong drive/tanh → fuller ±1 swings than CheapWalk.
 * High Speed: filter opens → sizzle / hiss (CheapWalk struggles here).
 * Speed 0 → frozen (last soft output).
 */
function cheapFilteredNoiseStep(state, speed01) {
  const rate = Number(speed01);
  if (!(Number.isFinite(rate) && rate > 0)) {
    const held = Number(state.out);
    return Number.isFinite(held) ? held : 0;
  }
  const white = cheapNoiseWhiteSample(state);
  // Compress quantum speed01 into (0,1] pole open amount.
  const a = 1 - Math.exp(-Math.min(24, rate * 2.75));
  const y0 = Number(state.y) || 0;
  const y = y0 + a * (white - y0);
  state.y = y;
  // Variance shrinks with a — over-drive so slow settings visit the rails.
  const boost = Math.min(14, 1 / Math.pow(Math.max(a, 8e-4), 0.72));
  const out = Math.tanh(y * boost);
  state.out = out;
  return out;
}

/**
 * WhiteNoise: fresh bipolar sample each quantum. Speed ignored.
 */
function cheapWhiteNoiseStep(state) {
  const out = cheapNoiseWhiteSample(state);
  state.out = out;
  return out;
}

/** NoisyFreq noiseMode: 0 CheapWalk, 1 CheapFilteredNoise, 2 WhiteNoise. */
function additiveGraphNormalizeNoisyNoiseMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1 || n === 2) return n;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "cheapfilterednoise" || s === "filtered" || s === "cfn") return 1;
  if (s === "2" || s === "whitenoise" || s === "white") return 2;
  return 0;
}

function additiveGraphNoisySample(state, speed01, noiseMode) {
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  if (mode === 2) return cheapWhiteNoiseStep(state);
  if (mode === 1) return cheapFilteredNoiseStep(state, speed01);
  return cheapWalkStep(state, speed01);
}

/**
 * Yellow Graph Noisy Speed is Hz. Effects run once per quantum, so scale like
 * Cheap Walk’s per-sample step accumulated over the block:
 *   speed01 = (Hz / sr) * blockFrames
 * Hz=0 → 0 (stopped). Hz≈20000 at 48k/128 → large step ≈ white-ish.
 */
function additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames) {
  const hz = Number(speedHz);
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const frames = Math.max(1, Number(blockFrames) || 128);
  return (hz / sr) * frames;
}

// --- Effect modes (split modules: Linear Filter / Analog Filter / Growl / Noisy) ---

/**
 * Filter choice index matches UI order LP / BP / HP (0 / 1 / 2).
 * (Previously 1→HP and 2→BP, which disagreed with the choice labels.)
 */
function additiveGraphNormalizeFilterMode(mode) {
  const m = String(mode ?? "lp").toLowerCase();
  if (m === "1" || m === "bp" || m === "bandpass" || m === "band") return "bp";
  if (m === "2" || m === "hp" || m === "highpass" || m === "high") return "hp";
  return "lp";
}

/**
 * Shared log-frequency X axis for Additive Out / filter faces.
 * Matches harmonicLines: ~20 Hz … project speed limit (log).
 */
function additiveGraphDisplayFreqAxis(sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const xMaxHz = typeof nodeGraphProjectSpeedLimitHz === "function"
    ? Math.max(1, nodeGraphProjectSpeedLimitHz())
    : Math.max(1, Number(typeof nodeGraphMvp !== "undefined" ? nodeGraphMvp?.live?.speedLimit : 0) || 20000);
  const xMinHz = Math.min(20, xMaxHz * 0.5);
  const logXMin = Math.log(Math.max(1e-6, xMinHz));
  const logXSpan = Math.max(1e-9, Math.log(Math.max(xMinHz * 1.0001, xMaxHz)) - logXMin);
  return {
    sampleRate: sr,
    nyquist: sr * 0.5,
    xMinHz,
    xMaxHz,
    logXMin,
    logXSpan,
    hzToT(hz) {
      const c = Math.max(xMinHz, Math.min(xMaxHz, Number(hz) || 0));
      return (Math.log(c) - logXMin) / logXSpan;
    },
    tToHz(t) {
      const u = Math.max(0, Math.min(1, Number(t) || 0));
      return Math.exp(logXMin + u * logXSpan);
    },
  };
}

/**
 * Slope in dB/octave → Butterworth-ish order (6 dB/oct per pole).
 * 0 dB/oct → flat (order 0). Large values (e.g. 96) → near brickwall.
 */
function additiveGraphFilterOrderFromSlopeDbOct(slopeDbOct) {
  const db = Number(slopeDbOct);
  if (!(db > 0)) return 0;
  return Math.min(64, db / 6);
}

/**
 * One-sided Butterworth magnitude.
 * LP: 1/sqrt(1+(f/fc)^(2n)); HP: 1/sqrt(1+(fc/f)^(2n)).
 * LP + fc≤0 → 0 (silence). HP + fc≤0 → 1 (all-pass). order≤0 → flat.
 */
function additiveGraphButterworthMag(freqHz, cutoffHz, order, kind) {
  const f = Math.max(0, Number(freqHz) || 0);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const n = Math.max(0, Number(order) || 0);
  if (!(n > 0)) return 1;
  if (kind === "lp") {
    if (!(fc > 0)) return 0;
    if (!(f > 0)) return 1;
    const r = f / fc;
    return 1 / Math.sqrt(1 + Math.pow(r, 2 * n));
  }
  // hp
  if (!(fc > 0)) return 1;
  if (!(f > 0)) return 0;
  const r = fc / Math.max(1e-12, f);
  return 1 / Math.sqrt(1 + Math.pow(r, 2 * n));
}

/**
 * Analog skew: stretch/compress log(f/fc) before the magnitude law
 * (asymmetric skirt character; 0 = plain Butterworth).
 */
function additiveGraphFilterSkewedFreqRatio(freqHz, cutoffHz, skew) {
  const f = Math.max(1e-12, Number(freqHz) || 0);
  const fc = Math.max(1e-12, Number(cutoffHz) || 0);
  const sk = additiveGraphClamp(Number(skew) || 0, -0.9999, 0.9999);
  if (!(Math.abs(sk) > 1e-9)) return f / fc;
  const oct = Math.log(f / fc) / Math.LN2;
  // Positive skew steepens above fc for LP (compress positive octaves).
  const warped = oct >= 0
    ? oct * (1 + sk * 0.85)
    : oct / Math.max(1e-6, 1 + sk * 0.85);
  return Math.pow(2, warped);
}

/**
 * Approximate analog/spectral filter gain at an absolute frequency.
 * slopeDbOct = asymptotic skirt in dB/octave (unit on the Slope param).
 * curveKind "analog" applies Skew on log(f/fc); "linear" = plain Butterworth.
 */
function additiveGraphFilterResponseGainHz(
  freqHz, mode, cutoffHz, slopeDbOct, curveKind, skew,
) {
  const m = additiveGraphNormalizeFilterMode(mode);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const order = additiveGraphFilterOrderFromSlopeDbOct(slopeDbOct);
  const f = Math.max(0, Number(freqHz) || 0);

  if (m === "bp") {
    if (!(fc > 0) || !(order > 0)) return 0;
    // Bandwidth from slope: gentler slope → wider band (octaves).
    // order high (steep) → narrow; order low → wide.
    const oct = Math.max(0.02, 4 / Math.max(order, 0.25));
    const fLo = fc / Math.pow(2, oct);
    const fHi = fc * Math.pow(2, oct);
    let fEff = f;
    if (curveKind === "analog") {
      const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
      fEff = fc * r;
    }
    return additiveGraphButterworthMag(fEff, fHi, order, "lp")
      * additiveGraphButterworthMag(fEff, fLo, order, "hp");
  }

  if (m === "hp") {
    if (!(order > 0)) return 1;
    if (curveKind === "analog" && fc > 0 && f > 0) {
      const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
      // Warped f/fc → effective freq; HP mag uses (fc/fEff)=1/r (was fc/r → LP bug).
      const fEff = fc * Math.max(1e-12, r);
      return additiveGraphButterworthMag(fEff, fc, order, "hp");
    }
    return additiveGraphButterworthMag(f, fc, order, "hp");
  }

  // lp
  if (!(order > 0)) return 1;
  if (!(fc > 0)) return 0;
  if (curveKind === "analog" && f > 0) {
    const r = additiveGraphFilterSkewedFreqRatio(f, fc, skew);
    return 1 / Math.sqrt(1 + Math.pow(Math.max(1e-12, r), 2 * order));
  }
  return additiveGraphButterworthMag(f, fc, order, "lp");
}

/**
 * Warm ladder-style resonance bump (spectral, not IIR feedback).
 * Soft Lorentzian; LP peaks slightly below fc, HP slightly above, BP at fc.
 * Wider/warmer than a pure Q peak; depth 0…10.
 * Returns { bump01, depth, fPeak } for Peak≈1 compensation.
 */
function additiveGraphLadderResonanceParts(freqHz, cutoffHz, resonance, slopeDbOct, mode) {
  const res = Math.max(0, Number(resonance) || 0);
  const slope = Number(slopeDbOct);
  const order = additiveGraphFilterOrderFromSlopeDbOct(
    Number.isFinite(slope) ? slope : 12,
  );
  const f = Math.max(1e-12, Number(freqHz) || 0);
  const fc = Math.max(1e-12, Number(cutoffHz) || 0);
  const m = additiveGraphNormalizeFilterMode(mode);
  let fPeak = fc;
  if (m === "lp") fPeak = fc * 0.92;
  else if (m === "hp") fPeak = fc * 1.08;
  if (!(res > 1e-12) || !(order > 0)) {
    return { bump01: 0, depth: 0, fPeak, gain: 1 };
  }
  const oct = Math.log(f / Math.max(1e-12, fPeak)) / Math.LN2;
  const bw = Math.max(0.08, 0.85 / Math.sqrt(1 + order * 0.35));
  const bump01 = 1 / (1 + (oct * oct) / (bw * bw));
  const depth = res / (1 + res * 0.08);
  return { bump01, depth, fPeak, gain: 1 + depth * bump01 };
}

function additiveGraphLadderResonanceGain(freqHz, cutoffHz, resonance, slopeDbOct, mode) {
  return additiveGraphLadderResonanceParts(
    freqHz, cutoffHz, resonance, slopeDbOct, mode,
  ).gain;
}

/**
 * Ladder Filter response: Butterworth-ish skirts × warm resonance.
 * Always Peak≈1 gain compensation (passband drops as Resonance rises).
 */
function additiveGraphLadderResponseGainHz(
  freqHz, mode, cutoffHz, slopeDbOct, resonance,
) {
  const base = additiveGraphFilterResponseGainHz(
    freqHz, mode, cutoffHz, slopeDbOct, "analog", 0,
  );
  const parts = additiveGraphLadderResonanceParts(
    freqHz, cutoffHz, resonance, slopeDbOct, mode,
  );
  // No Resonance → plain filter skirts (no Peak≈1 rescale).
  if (!(parts.depth > 1e-12)) return base;
  // Peak≈1: normalize so resonant peak stays ~unity (passband drops).
  let resGain = parts.gain / Math.max(1e-12, 1 + parts.depth);
  let g = base * resGain;
  const baseAtPeak = additiveGraphFilterResponseGainHz(
    parts.fPeak, mode, cutoffHz, slopeDbOct, "analog", 0,
  );
  if (baseAtPeak > 1e-12) g /= baseAtPeak;
  return g;
}

/** Apply Ladder Filter to Yellow Graph amplitudes. */
function additiveGraphApplyLadderFilter(
  graph, mode, cutoffHz, slopeDbOct, resonance, fundHz, sampleRate,
) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const f0 = Math.max(0, Number(fundHz) || 0);
  const fc = Number(cutoffHz) || 0;
  const slope = Number(slopeDbOct);
  const slopeSafe = Number.isFinite(slope) ? slope : 12;
  const res = Number(resonance) || 0;
  for (let i = 0; i < H; i += 1) {
    const partialHz = Math.max(0, Number(graph.ratio[i]) || 0) * f0;
    additiveGraphScaleHarmonicAmp(
      graph,
      i,
      additiveGraphLadderResponseGainHz(partialHz, mode, fc, slopeSafe, res),
    );
  }
  return graph;
}

/** @deprecated normalized API — prefer additiveGraphFilterResponseGainHz */
function additiveGraphFilterResponseGain(x, mode, cutoffNorm, slopeDbOct, curveKind, skew) {
  // Interpret x/cutoffNorm as fractions of an arbitrary Nyquist=1 Hz for legacy callers.
  const f = additiveGraphClamp(x, 0, 1);
  const fc = additiveGraphClamp(cutoffNorm, 0, 1);
  return additiveGraphFilterResponseGainHz(f, mode, fc, slopeDbOct, curveKind, skew);
}

/** Sample N points on a linear 0…1 freq axis (legacy / tests). */
function additiveGraphFilterResponseCurve(mode, cutoffNorm, slopeDbOct, curveKind, skew, samples = 128) {
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = n <= 1 ? 0 : i / (n - 1);
    ys[i] = additiveGraphFilterResponseGain(x, mode, cutoffNorm, slopeDbOct, curveKind, skew);
  }
  return ys;
}

/**
 * Filter response on Additive Out’s log-Hz axis (overlay-compatible).
 * curveKind "rational" → Linear Filter (slope 0…1 + skew).
 * otherwise → Butterworth (slope in dB/oct + skew).
 * Returns { ys, axis, cutoffT }.
 */
function additiveGraphFilterResponseCurveLogHz(
  mode, cutoffHz, slope, curveKind, skew, sampleRate, samples = 128,
) {
  const axis = additiveGraphDisplayFreqAxis(sampleRate);
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  const rational = curveKind === "rational" || curveKind === "linear";
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const hz = axis.tToHz(t);
    ys[i] = rational
      ? additiveGraphFilterResponseGainRational(hz, mode, cutoffHz, slope, skew)
      : additiveGraphFilterResponseGainHz(hz, mode, cutoffHz, slope, "analog", skew);
  }
  return {
    ys,
    axis,
    cutoffT: axis.hzToT(Number(cutoffHz) || 0),
  };
}

/** Face curve for Additive Ladder Filter. */
function additiveGraphLadderResponseCurveLogHz(
  mode, cutoffHz, slopeDbOct, resonance, sampleRate, samples = 128,
) {
  const axis = additiveGraphDisplayFreqAxis(sampleRate);
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    ys[i] = additiveGraphLadderResponseGainHz(
      axis.tToHz(t), mode, cutoffHz, slopeDbOct, resonance,
    );
  }
  return {
    ys,
    axis,
    cutoffT: axis.hzToT(Number(cutoffHz) || 0),
  };
}

/**
 * Resolve fundamental Hz for spectral filters (partialHz = ratio × fund).
 * Prefers graph.frequencyHz, else first downstream Additive Out Frequency, else 100.
 */
function additiveGraphResolveFundamentalHz({
  graph = null,
  nodes = null,
  connections = null,
  fromNodeId = "",
  readFrequency = null,
  fallback = 100,
} = {}) {
  const stamped = Number(graph?.frequencyHz);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;

  const fb = Number.isFinite(Number(fallback)) && Number(fallback) > 0 ? Number(fallback) : 100;
  if (!nodes || !connections || !fromNodeId) return fb;

  const queue = [String(fromNodeId)];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (let i = 0; i < connections.length; i += 1) {
      const c = connections[i];
      if (!c || String(c.sourceNode || "") !== id) continue;
      if (String(c.destinationPort || "") !== "Graph") continue;
      const dstId = String(c.destinationNode || "");
      if (!dstId || seen.has(dstId)) continue;
      const node = typeof nodes.get === "function" ? nodes.get(dstId) : nodes[dstId];
      if (!node) continue;
      if (String(node.type || "") === "additiveOut") {
        const hz = typeof readFrequency === "function"
          ? Number(readFrequency(node))
          : Number(node?.params?.frequency ?? node?.parameters?.frequency);
        return Number.isFinite(hz) && hz > 0 ? hz : fb;
      }
      queue.push(dstId);
    }
  }
  return fb;
}

/**
 * Apply slope filter in absolute Hz: partialHz = ratio[i] × fundHz vs cutoffHz.
 * Face/response use freq/Nyquist; slope is still 0…1 of the Nyquist span.
 */
/**
 * Rational-curve spectral filter (Linear Filter module).
 * Cutoff Hz (LP @ 0 → silence). Slope 0…1 = brickwall → gradual (octaves).
 * Skew = rationalCurve bend on the skirt (−1…+1).
 */
function additiveGraphFilterResponseGainRational(freqHz, mode, cutoffHz, slope01, skew) {
  const m = additiveGraphNormalizeFilterMode(mode);
  const fc = Math.max(0, Number(cutoffHz) || 0);
  const slope = additiveGraphClamp(slope01, 0, 1);
  const f = Math.max(0, Number(freqHz) || 0);
  const skewC = additiveGraphClamp(Number(skew) || 0, -0.9999, 0.9999);
  const shape = (t) => additiveGraphRationalCurve(additiveGraphClamp(t, 0, 1), skewC);
  // half-width in octaves around fc (slope 0 → brickwall / tiny).
  const halfOct = slope <= 1e-6 ? 0 : (0.05 + slope * 5);

  if (m === "lp") {
    if (!(fc > 0)) return 0;
    if (!(f > 0)) return 1;
    if (halfOct <= 0) return f <= fc ? 1 : 0;
    const oct = Math.log(f / fc) / Math.LN2;
    const t = additiveGraphClamp((oct + halfOct) / (2 * halfOct), 0, 1);
    return 1 - shape(t);
  }
  if (m === "hp") {
    if (!(fc > 0)) return 1;
    if (!(f > 0)) return 0;
    if (halfOct <= 0) return f >= fc ? 1 : 0;
    const oct = Math.log(f / fc) / Math.LN2;
    const t = additiveGraphClamp((oct + halfOct) / (2 * halfOct), 0, 1);
    return shape(t);
  }
  // bp — pass near fc; slope widens band + edges (mirrored rational skirts)
  if (!(fc > 0) || !(f > 0)) return 0;
  const passOct = halfOct <= 0 ? 0.02 : Math.max(0.02, halfOct * 0.35);
  const edgeOct = halfOct <= 0 ? 0.01 : Math.max(0.02, halfOct * 0.65);
  const a = Math.abs(Math.log(f / fc) / Math.LN2);
  if (a <= passOct) return 1;
  if (a >= passOct + edgeOct) return 0;
  return shape(1 - ((a - passOct) / edgeOct));
}

/**
 * Scale harmonic amp by `gain`. Also scales ampLerp from/to when present —
 * Additive Out plays ampLerp, while faces often read amplitude[]. Filtering
 * only amplitude[] made Linear/Butterworth visible but silent after Bubble.
 */
function additiveGraphScaleHarmonicAmp(graph, index, gain) {
  const i = index | 0;
  const g = Number(gain);
  const scale = Number.isFinite(g) ? g : 0;
  if (graph.amplitude && i < graph.amplitude.length) {
    graph.amplitude[i] = (Number(graph.amplitude[i]) || 0) * scale;
  }
  const lerp = graph.ampLerp;
  if (lerp?.from && lerp?.to && i < lerp.from.length && i < lerp.to.length) {
    lerp.from[i] = (Number(lerp.from[i]) || 0) * scale;
    lerp.to[i] = (Number(lerp.to[i]) || 0) * scale;
  }
}

/** Apply Butterworth-ish spectral filter (dB/oct Slope). */
function additiveGraphApplyButterworthFilter(
  graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate,
) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const f0 = Math.max(0, Number(fundHz) || 0);
  const fc = Number(cutoffHz) || 0;
  const slope = Number(slopeDbOct);
  const slopeSafe = Number.isFinite(slope) ? slope : 12;
  for (let i = 0; i < H; i += 1) {
    const partialHz = Math.max(0, Number(graph.ratio[i]) || 0) * f0;
    additiveGraphScaleHarmonicAmp(
      graph,
      i,
      additiveGraphFilterResponseGainHz(partialHz, mode, fc, slopeSafe, "analog", skew),
    );
  }
  return graph;
}

/** @deprecated alias — Additive “Analog Filter” renamed Butterworth Filter */
function additiveGraphApplyAnalogFilter(graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate) {
  return additiveGraphApplyButterworthFilter(
    graph, mode, cutoffHz, slopeDbOct, skew, fundHz, sampleRate,
  );
}

/** Apply rational-curve spectral filter (Linear Filter module). */
function additiveGraphApplyLinearFilter(graph, mode, cutoffHz, slope01, skew, fundHz, sampleRate) {
  const H = graph.harmonics;
  if (H <= 0) return graph;
  const f0 = Math.max(0, Number(fundHz) || 0);
  const fc = Number(cutoffHz) || 0;
  const slope = Number(slope01);
  const slopeSafe = Number.isFinite(slope) ? slope : 0.25;
  const sk = Number(skew) || 0;
  for (let i = 0; i < H; i += 1) {
    const partialHz = Math.max(0, Number(graph.ratio[i]) || 0) * f0;
    additiveGraphScaleHarmonicAmp(
      graph,
      i,
      additiveGraphFilterResponseGainRational(partialHz, mode, fc, slopeSafe, sk),
    );
  }
  return graph;
}

/** @deprecated use applyButterworth / applyLinear */
function additiveGraphApplySlopeFilter(
  graph, mode, cutoffHz, slope, curveKind, skew, fundHz, sampleRate,
) {
  if (curveKind === "rational" || curveKind === "linear") {
    return additiveGraphApplyLinearFilter(
      graph, mode, cutoffHz, slope, skew, fundHz, sampleRate,
    );
  }
  return additiveGraphApplyButterworthFilter(
    graph, mode, cutoffHz, slope, skew, fundHz, sampleRate,
  );
}

/**
 * Bubble Unskew: effective Phase Skew vs Cutoff.
 * unskew≤0 → Phase Skew unchanged at every cutoff.
 * unskew>0 → lerp phaseSkew→unskew as cutoff 0→1
 *   (cutoff=1 → effective = unskew; cutoff=0 → effective = phaseSkew).
 */
function additiveGraphBubbleEffectivePhaseSkew(phaseSkew, unskew, cutoff) {
  const base = Number(phaseSkew);
  const skew = Number.isFinite(base) ? base : 0;
  const u = Number(unskew);
  if (!(u > 0)) return skew;
  const cutRaw = Number(cutoff);
  const cut = Number.isFinite(cutRaw) ? additiveGraphClamp(cutRaw, 0, 1) : 1;
  return skew + (u - skew) * cut;
}

/**
 * Face sample for Bubble: phase cascade vs harmonic index.
 * Returns { ys, ysGhost, amps, cutoffT, yMax, effSkew, phaseSkew, unskew }.
 * ys = current (Cutoff/Unskew); ysGhost = cascade at Cutoff=1 when Unskew>0.
 * amps = Cutoff gate 0…1; cutoffT = edge/H on X.
 */
function additiveGraphBubbleCascadeCurve(
  harmonics,
  phaseSkew,
  skewAmount,
  cutoff,
  unskew,
  samples = 128,
) {
  const H = Math.max(1, Math.round(Number(harmonics) || 32));
  const n = Math.max(2, Math.round(Number(samples) || 128));
  const cutRaw = Number(cutoff);
  const cut = Number.isFinite(cutRaw) ? additiveGraphClamp(cutRaw, 0, 1) : 1;
  const curve = additiveGraphClamp(Number(skewAmount) || 0, -0.9999, 0.9999);
  const skew0 = Number(phaseSkew);
  const baseSkew = Number.isFinite(skew0) ? Math.max(0, skew0) : 0;
  const uRaw = Number(unskew);
  const u = Number.isFinite(uRaw) ? uRaw : 0;
  const eff = additiveGraphBubbleEffectivePhaseSkew(baseSkew, u, cut);
  const effFull = additiveGraphBubbleEffectivePhaseSkew(baseSkew, u, 1);
  const edge = cut * H;
  const H_eff = Math.max(1e-12, edge);
  const ys = new Float32Array(n);
  const ysGhost = new Float32Array(n);
  const amps = new Float32Array(n);
  const showGhost = u > 1e-12 && Math.abs(effFull - eff) > 1e-9;
  for (let i = 0; i < n; i += 1) {
    const harm = n <= 1 ? 0 : (i / (n - 1)) * Math.max(0, H - 1e-9);
    const t = harm / H_eff;
    const tFull = harm / Math.max(1e-12, H);
    const map = additiveGraphSkewMap(t, curve, 2);
    const mapFull = additiveGraphSkewMap(tFull, curve, 2);
    ys[i] = (eff > 0 ? map * eff : 0);
    ysGhost[i] = showGhost && effFull > 0 ? mapFull * effFull : 0;
    // Continuous Cutoff gate for the face (integer gain is slot-based).
    amps[i] = harm + 1e-9 < edge ? 1 : 0;
  }
  const yMax = Math.max(1e-6, baseSkew, u > 0 ? u : 0, eff, effFull);
  return {
    ys,
    ysGhost: showGhost ? ysGhost : null,
    amps,
    cutoffT: cut,
    yMax,
    effSkew: eff,
    phaseSkew: baseSkew,
    unskew: u,
    harmonics: H,
  };
}

/**
 * Bubble (ex-Growl) — Hydrus SoEmAdditive Phase Skew:
 *   skewPhase[h] = curveMap(h / H_eff, skewCurve) * skewAmount
 * rotation = constant phase add (cycles) on every harmonic.
 * curveMode: 0 Rational (Hydrus), 1 Exponential, 2 Logarithmic, 3 Linear.
 * cutoff 0…1: fractional harmonic amp count + phase cascade over H_eff=cut·H.
 * brickwall: unused (kept for call-site compat).
 * Quantum phaseLerp + ampLerp (like Noisy*) so param moves do not zipper.
 * lerpFrom = { phase, amp } from previous quantum; returns { graph, lerpFrom }.
 * No upper clamp on skewAmount — param max owns the range.
 */
function additiveGraphApplyGrowl(
  graph, rotation, skew, skewCurve, curveMode = 0, cutoff = 1,
  brickwall = 0, lerpFrom = null,
) {
  const H = graph.harmonics;
  if (H <= 0) return { graph, lerpFrom: null };
  const rot = Number(rotation) || 0;
  const skewAmt = Number(skew);
  const amount = Number.isFinite(skewAmt) && skewAmt > 0 ? skewAmt : 0;
  const curve = additiveGraphClamp(Number(skewCurve) || 0, -0.9999, 0.9999);
  const mode = additiveGraphNormalizeSkewCurveMode(curveMode);
  const cutRaw = Number(cutoff);
  // Default open (1) when missing/non-finite — never treat NaN as silence.
  const cut = Number.isFinite(cutRaw) ? additiveGraphClamp(cutRaw, 0, 1) : 1;
  const edge = cut * H;
  const H_eff = Math.max(1e-12, edge);
  const applyAmp = cut < 1 - 1e-12;
  const toPhase = new Float32Array(H);
  const toAmp = applyAmp ? new Float32Array(H) : null;
  for (let i = 0; i < H; i += 1) {
    if (applyAmp) {
      const gain = additiveGraphHarmonicCountGain(i, edge);
      const baseAmp = Number(graph.amplitude?.[i]) || 0;
      toAmp[i] = baseAmp * gain;
    }
    // Remap cascade over audible edge.
    const t = i / H_eff;
    const skewPhase = amount <= 0 ? 0 : additiveGraphSkewMap(t, curve, mode) * amount;
    toPhase[i] = additiveGraphWrap01((Number(graph.phase[i]) || 0) + rot + skewPhase);
  }
  let fromPhase;
  let fromAmp = null;
  if (lerpFrom?.phase && lerpFrom.phase.length === H) {
    fromPhase = new Float32Array(lerpFrom.phase);
  } else {
    fromPhase = new Float32Array(toPhase);
  }
  graph.phaseLerp = { from: fromPhase, to: toPhase };
  graph.phase.set(toPhase);

  if (applyAmp && toAmp) {
    if (lerpFrom?.amp && lerpFrom.amp.length === H) {
      fromAmp = new Float32Array(lerpFrom.amp);
    } else {
      fromAmp = new Float32Array(toAmp);
    }
    graph.ampLerp = { from: fromAmp, to: toAmp };
    if (graph.amplitude && graph.amplitude.length === H) {
      graph.amplitude.set(toAmp);
    }
  } else {
    // cut≥1: amplitudes untouched (no soft filter-like skirt).
    graph.ampLerp = null;
  }

  return {
    graph,
    lerpFrom: {
      phase: new Float32Array(toPhase),
      amp: toAmp ? new Float32Array(toAmp) : null,
    },
  };
}

/** @deprecated alias — Bubble module uses additiveGraphApplyGrowl under the hood. */
function additiveGraphApplyBubble(
  graph, rotation, skew, skewCurve, curveMode, cutoff, brickwall, lerpFrom,
) {
  return additiveGraphApplyGrowl(
    graph, rotation, skew, skewCurve, curveMode, cutoff, brickwall, lerpFrom,
  );
}

/**
 * Diffusor — hard scramble (±4 wraps) + CheapWalk animation only.
 */
function additiveGraphApplyDiffusor(
  graph,
  diffusion = 1,
  seed = 1,
  speedHz = 35,
  walks = null,
  sampleRate = 44100,
  blockFrames = 128,
  lerpFrom = null,
) {
  if (!graph || !graph.phase) return graph;
  const H = graph.harmonics | 0;
  if (H <= 0) return graph;
  let diff = Number(diffusion);
  if (!(diff === diff) || diff < 0) diff = 0;
  const phase0 = Number(graph.phase[0]) || 0;
  let rng = (Math.floor(Number(seed)) || 1) >>> 0;
  if (!rng) rng = 1;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const frames = Math.max(1, Number(blockFrames) || 128);
  const speed01 = Math.max(0, (Number(speedHz) || 0) / sr) * frames;
  const havePrev = Array.isArray(lerpFrom) || (lerpFrom && lerpFrom.length === H);
  const fromPhase = new Float32Array(H);
  const toPhase = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    rng = (Math.imul(rng, 1664525) + 1013904223 + Math.imul(i, 747796405)) >>> 0;
    const rnd = ((rng >>> 8) & 0xffffff) / 16777216;
    const scramble = (rnd - 0.5) * 2 * diff * 4;
    let base = phase0 + scramble;
    base = typeof additiveGraphWrap01 === "function" ? additiveGraphWrap01(base) : ((base % 1) + 1) % 1;
    // Always apply CheapWalk position. Speed only advances x — Speed=0 freezes the
    // same offset as a tiny Speed (never zero the offset just because speed===0).
    let walk = 0;
    if (diff > 0 && walks && walks[i]) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const bip = ((rng >>> 8) & 0xffffff) / 16777216 * 2 - 1;
      const step = speed01 * 0.35;
      let x = (Number(walks[i].x) || 0) + bip * step;
      if (x > 1) x = 2 - x;
      if (x < -1) x = -2 - x;
      walks[i].x = x;
      walk = x * diff * 2;
    }
    let to = base + walk;
    to = typeof additiveGraphWrap01 === "function" ? additiveGraphWrap01(to) : ((to % 1) + 1) % 1;
    toPhase[i] = to;
    fromPhase[i] = havePrev ? Number(lerpFrom[i]) || to : to;
    graph.phase[i] = to;
  }
  graph.phaseLerp = { from: fromPhase, to: toPhase };
  return graph;
}

/**
 * Blaster — shared phase per index bin.
 * phaseMode 0 Stagger (Bubble-like curve staircase + jump), 1 Random.
 * Always bins by harmonic index (stable under fund sweep).
 */
function additiveGraphApplyBlaster(
  graph,
  quantization = 0,
  layout = 0,
  fundHz = 100,
  sampleRate = 44100,
  seed = 1,
  depth = 1,
  curve = 0,
  curveKind = 2,
  offset = 0,
  phaseMode = 0,
  invert = 0,
  bias = 0,
  jump = 0,
) {
  if (!graph || !graph.phase) return graph;
  const H = graph.harmonics | 0;
  if (H <= 0) return graph;
  let bins = Math.round(Number(quantization) || 0);
  if (!(bins >= 1)) return graph;
  if (bins > H) bins = H;
  void layout;
  void fundHz;
  void sampleRate;

  const mode = Math.round(Number(phaseMode) || 0) >= 1 ? 1 : 0;
  const kind = Math.max(0, Math.min(3, Math.round(Number(curveKind) || 0)));
  const doInvert = Number(invert) >= 0.5;
  const depthAmt = Number(depth) || 0;
  const curveAmt = additiveGraphClamp(Number(curve) || 0, -0.9999, 0.9999);
  const offsetAmt = Number(offset) || 0;
  const biasAmt = Number(bias) || 0;
  const jumpAmt = Number(jump) || 0;
  const binPhase = new Float32Array(bins);

  if (mode === 1) {
    let rng = (Math.floor(Number(seed)) || 1) >>> 0;
    if (!rng) rng = 1;
    for (let b = 0; b < bins; b += 1) {
      rng = (Math.imul(rng, 1664525) + 1013904223 + Math.imul(b, 747796405)) >>> 0;
      binPhase[b] = ((rng >>> 8) & 0xffffff) / 16777216;
    }
  } else {
    const denom = bins > 1 ? bins - 1 : 1;
    for (let b = 0; b < bins; b += 1) {
      let t = bins > 1 ? b / denom : 0;
      t = additiveGraphClamp(t + biasAmt, 0, 1);
      if (doInvert) t = 1 - t;
      const mapped = typeof additiveGraphSkewMap === "function"
        ? additiveGraphSkewMap(t, curveAmt, kind)
        : t;
      const ph = mapped * depthAmt + offsetAmt + b * jumpAmt;
      binPhase[b] = typeof additiveGraphWrap01 === "function"
        ? additiveGraphWrap01(ph)
        : ((ph % 1) + 1) % 1;
    }
  }

  for (let i = 0; i < H; i += 1) {
    let bin = Math.floor((i * bins) / H);
    if (bin >= bins) bin = bins - 1;
    graph.phase[i] = binPhase[bin] || 0;
  }
  graph.phaseLerp = null;
  return graph;
}

/**
 * Face bins — always index membership (same as DSP).
 * layout 0: t0/t1 = equal columns.
 * layout 1: t0/t1 = log-Hz span of that index bin (slides with fund, no rebin).
 */
function additiveGraphBlasterBins(H, quantization, layout = 0, graph = null, fundHz = 100, sampleRate = 44100) {
  const h = Math.max(0, H | 0);
  let bins = Math.round(Number(quantization) || 0);
  if (!(h > 0)) return [];
  if (!(bins >= 1)) return [{ start: 0, end: h, phase: 0, t0: 0, t1: 1 }];
  if (bins > h) bins = h;
  const layoutMode = Math.round(Number(layout) || 0) >= 1 ? 1 : 0;

  const axis = typeof additiveGraphDisplayFreqAxis === "function"
    ? additiveGraphDisplayFreqAxis(sampleRate)
    : null;
  const xMin = axis?.xMinHz ?? 20;
  const xMax = axis?.xMaxHz ?? Math.max(40, 0.45 * (Number(sampleRate) || 44100));
  const logMin = Math.log(xMin);
  const logSpan = Math.log(xMax) - logMin;
  const f0 = Number(fundHz) > 0 ? Number(fundHz) : 100;

  const hzToT = (hz) => {
    let f = Number(hz);
    if (!(f > 0)) f = xMin;
    if (f < xMin) f = xMin;
    if (f > xMax) f = xMax;
    let t = (Math.log(f) - logMin) / logSpan;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t;
  };

  const out = [];
  for (let b = 0; b < bins; b += 1) {
    const start = Math.floor((b * h) / bins);
    const end = Math.floor(((b + 1) * h) / bins);
    if (!(end > start)) continue;
    let t0 = b / bins;
    let t1 = (b + 1) / bins;
    if (layoutMode === 1) {
      const r0 = Number(graph?.ratio?.[start]) || (start + 1);
      const r1 = Number(graph?.ratio?.[end - 1]) || end;
      t0 = hzToT(r0 * f0);
      t1 = hzToT(r1 * f0);
      if (t1 < t0) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t1 - t0 < 1e-4) t1 = Math.min(1, t0 + 1e-3);
    }
    out.push({
      start,
      end,
      phase: Number(graph?.phase?.[start]) || 0,
      t0,
      t1,
    });
  }
  return out;
}

/**
 * Per-harmonic CheapWalk / noise states.
 * `seed` = module Seed; `salt` = family (freq/phase/pan/amp).
 * Changing Seed rebuilds all streams; growing H appends new harmonics only.
 */
function additiveGraphEnsureWalks(walks, H, salt = 13, seed = 1) {
  const s0 = (Math.floor(Number(seed)) || 0) >>> 0;
  const family = (Math.floor(Number(salt)) || 0) >>> 0;
  const need = Math.max(0, Math.floor(Number(H)) || 0);
  if (!Array.isArray(walks) || walks.__seed !== s0 || walks.__salt !== family) {
    walks = [];
    walks.__seed = s0;
    walks.__salt = family;
  }
  while (walks.length < need) {
    const i = walks.length;
    const mixed = (
      Math.imul(s0 ^ 0x9e3779b9, family + 0x85ebca6b)
      + Math.imul(i + 1, 0xc2b2ae35)
    ) >>> 0;
    walks.push(cheapWalkCreate(mixed || (i + 1)));
  }
  if (walks.length > need) {
    walks.length = need;
  }
  return walks;
}

/**
 * NoisyFreq — additive jitter on harmonic ratio (hz' = (ratio+Δ)×f0).
 * `add` = max |Δ| from bipolar noise (DOMAIN, not 0…1). No hidden ×0.5.
 * noiseMode: 0 CheapWalk / 1 CheapFilteredNoise — quantum + ratioLerp at Out.
 *            2 WhiteNoise — ratioNoise per-sample add at Out (Speed ignored).
 */
function additiveGraphApplyNoisyFreq(
  graph, add, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const amt = Number(add);
  const depth = Number.isFinite(amt) && amt > 0 ? amt : 0;
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 13, seed);

  // WhiteNoise: audio-rate ratio add at Additive Out.
  if (mode === 2) {
    graph.ratioNoise = {
      mode: 2,
      amount: depth,
      speedHz: 0,
      walks,
      seed: (Math.floor(Number(seed)) || 0) >>> 0,
    };
    graph.ratioLerp = null;
    return { graph, walks, lerpFrom };
  }

  // CheapWalk / CheapFilteredNoise: new target this quantum; Out lerps from→to.
  graph.ratioNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = Math.max(0, graph.ratio[i] + w * depth);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to); // first quantum: no step-in
  }
  graph.ratioLerp = { from, to };
  graph.ratio.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

/** Effective harmonic ratio at block position (linear from→to when ratioLerp set). */
function additiveGraphEffectiveRatio(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.ratioLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t;
  }
  return Number(graph?.ratio?.[i]) || 0;
}

/** @deprecated use additiveGraphApplyNoisyFreq */
function additiveGraphApplyNoisy(
  graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode, lerpFrom, seed,
) {
  return additiveGraphApplyNoisyFreq(
    graph, amount, speedHz, walks, sampleRate, blockFrames, noiseMode, lerpFrom, seed,
  );
}

/** Shortest-path lerp on unit circle [0,1). */
function additiveGraphLerpPhase01(from, to, t) {
  let d = (Number(to) || 0) - (Number(from) || 0);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return additiveGraphWrap01((Number(from) || 0) + d * t);
}

/** Shared: stamp WhiteNoise recipe; clear matching lerp. Depth uncapped — Out clamps. */
function additiveGraphStampWhiteNoise(graph, key, add, walks, seed = 1) {
  const depth = Number(add);
  graph[key] = {
    mode: 2,
    amount: Number.isFinite(depth) && depth > 0 ? depth : 0,
    speedHz: 0,
    walks,
    seed: (Math.floor(Number(seed)) || 0) >>> 0,
  };
}

/**
 * NoisyPhase — additive phase jitter (cycles): phase' = wrap(phase + noise×Add).
 * 0/1 quantum + phaseLerp; 2 WhiteNoise → phaseNoise at Out. No hardcoded depth clamp.
 */
function additiveGraphApplyNoisyPhase(
  graph, add, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const depth = Number(add);
  const amt = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 29, seed);
  // Add≈0: phase unchanged — skip walks + phaseLerp so Out stays on direct phase[].
  if (!(amt > 1e-12)) {
    graph.phaseNoise = null;
    graph.phaseLerp = null;
    return { graph, walks, lerpFrom: null };
  }
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "phaseNoise", amt, walks, seed);
    graph.phaseLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.phaseNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = additiveGraphWrap01(graph.phase[i] + w * amt);
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.phaseLerp = { from, to };
  graph.phase.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

function additiveGraphEffectivePhase(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.phaseLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return additiveGraphLerpPhase01(lerp.from[i], lerp.to[i], t);
  }
  return additiveGraphWrap01(Number(graph?.phase?.[i]) || 0);
}

/**
 * Additive Pan — Width first (stereo spread), then Pan crossfades to one side.
 * Width (−1…+1): odd/even spread. + = even→L / odd→R; − = reversed.
 *   0 = mono; ±1 = hard alternating L/R. Amps untouched.
 * Pan (−1…+1): morph from the Width image → all-hard-L or all-hard-R.
 *   pan[i] = widthPan[i]·(1−|Pan|) + sign(Pan)·|Pan|
 *   Pan=0 → Width image; |Pan|=1 → every harmonic hard that side.
 *   Width=0 → pans the mono image (same formula). Never silences.
 * Stamps panLerp only. lerpFrom = Float32Array | {pan}.
 */
/**
 * Stereo wrap: past ±1 continues onto the other speaker.
 * Keeps hard ±1 as true hard L/R; only values outside (−∞,−1)∪(+1,+∞) fold by 2.
 */
function additiveGraphWrapStereoPan(pan) {
  let x = Number(pan);
  if (!Number.isFinite(x)) return 0;
  while (x > 1) x -= 2;
  while (x < -1) x += 2;
  return x;
}

/**
 * AutoPan — Width-first stereo chain with wrap, swirl, HF shimmer, orbit.
 * 1) Width: odd/even hard L↔R fan (sign flips; |Width|>1 wraps past hard).
 * 2) Rate/Depth/Spread/Bias/Orbit: rotator swirl (highs can orbit faster).
 * 3) Shimmer: index-weighted hard L/R jumps on upper partials.
 * 4) Wrap into [-1,1) so past-hard pans appear on the other speaker.
 * state.phase / state.shimmerPhase: persistent LFO phases (cycles).
 */
function additiveGraphApplyPan(
  graph,
  width = 0.75,
  rateHz = 0.25,
  depth = 0.85,
  spread = 1,
  bias = 0,
  shimmer = 0.35,
  orbit = 1,
  shimmerHz = 18,
  state = null,
  sampleRate = 44100,
  blockFrames = 128,
  lerpFrom = null,
) {
  if (!graph || !graph.harmonics) {
    return { graph, lerpFrom: null, phase: 0, shimmerPhase: 0 };
  }
  const H = graph.harmonics | 0;
  if (H < 1) return { graph, lerpFrom: null, phase: 0, shimmerPhase: 0 };
  if (!graph.pan || graph.pan.length !== H) {
    graph.pan = new Float32Array(H);
  }
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const frames = Math.max(1, Number(blockFrames) || 128);
  const wRaw = Number(width);
  const wFinite = Number.isFinite(wRaw) ? wRaw : 0;
  const wAbs = Math.abs(wFinite);
  const wFlip = wFinite < 0;
  const rate = Math.max(0, Number(rateHz) || 0);
  const depthAmt = Math.max(0, Number(depth) || 0);
  const spreadAmt = Math.max(0, Number(spread) || 0);
  const biasAmt = Number.isFinite(Number(bias)) ? Number(bias) : 0;
  const shimmerAmt = Math.max(0, Number(shimmer) || 0);
  const orbitAmt = Math.max(0, Number(orbit) || 0);
  const shRate = Math.max(0, Number(shimmerHz) || 0);
  let phase = Number(state?.phase);
  if (!Number.isFinite(phase)) phase = 0;
  let shimmerPhase = Number(state?.shimmerPhase);
  if (!Number.isFinite(shimmerPhase)) shimmerPhase = 0;
  phase += (rate / sr) * frames;
  phase = ((phase % 1) + 1) % 1;
  shimmerPhase += (shRate / sr) * frames;
  shimmerPhase = ((shimmerPhase % 1) + 1) % 1;

  const denom = H > 1 ? H - 1 : 1;
  const twoPi = Math.PI * 2;
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const norm = i / denom;
    // 1) Width fan — even→L / odd→R (or flipped); |w|>1 wraps later.
    let side = (i & 1) === 0 ? -1 : 1;
    if (wFlip) side = -side;
    const base = side * wAbs;
    // 2) Orbit skew: highs spin faster than the fundamental.
    const harmPhase = phase * (1 + orbitAmt * norm) + norm * spreadAmt;
    const swirl = Math.sin(harmPhase * twoPi);
    // 3) HF shimmer — hard square jumps, strongest on upper partials.
    const hf = norm * norm;
    const shLocal = shimmerPhase + norm * 0.37 + (i & 1) * 0.5;
    const jump = Math.sin(shLocal * twoPi) >= 0 ? 1 : -1;
    const raw = base + biasAmt + depthAmt * swirl + shimmerAmt * hf * jump;
    to[i] = additiveGraphWrapStereoPan(raw);
  }
  const prev = Array.isArray(lerpFrom) || (lerpFrom instanceof Float32Array)
    ? lerpFrom
    : lerpFrom?.pan;
  let from;
  if (prev && prev.length === H) {
    from = new Float32Array(prev);
  } else {
    from = new Float32Array(to);
  }
  graph.panNoise = null;
  graph.panLerp = { from, to };
  graph.pan.set(to);
  return {
    graph,
    lerpFrom: new Float32Array(to),
    phase,
    shimmerPhase,
  };
}

/**
 * NoisyPan — additive pan jitter: pan' = pan + noise×Add (no stagger/slope).
 * 0/1 quantum + panLerp; 2 WhiteNoise → panNoise at Out.
 * Depth uncapped here; Additive Out clamps pan to −1…+1.
 */
function additiveGraphApplyNoisyPan(
  graph, add, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  if (!graph.pan || graph.pan.length !== H) {
    graph.pan = new Float32Array(H);
  }
  const depth = Number(add);
  const amt = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 47, seed);
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "panNoise", amt, walks, seed);
    graph.panLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.panNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    const p = Number(graph.pan[i]) || 0;
    to[i] = p + w * amt;
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.panLerp = { from, to };
  graph.pan.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

/** Effective pan at block position (linear from→to when panLerp set). Unclamped — Out clamps. */
function additiveGraphEffectivePan(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.panLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t;
  }
  if (graph?.pan && i >= 0 && i < graph.pan.length) {
    return Number(graph.pan[i]) || 0;
  }
  return 0;
}

/**
 * NoisyAmp — additive amp jitter: amp' = amp + noise×Add.
 * 0/1 quantum + ampLerp; 2 WhiteNoise → ampNoise at Out.
 * Depth uncapped here; Additive Out clamps amp to 0…1.
 */
function additiveGraphApplyNoisyAmp(
  graph, add, speedHz, walks, sampleRate, blockFrames, noiseMode = 0, lerpFrom = null,
  seed = 1,
) {
  const H = graph.harmonics;
  const depth = Number(add);
  const amt = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const mode = additiveGraphNormalizeNoisyNoiseMode(noiseMode);
  walks = additiveGraphEnsureWalks(walks, H, 61, seed);
  if (mode === 2) {
    additiveGraphStampWhiteNoise(graph, "ampNoise", amt, walks, seed);
    graph.ampLerp = null;
    return { graph, walks, lerpFrom };
  }
  graph.ampNoise = null;
  const spd = additiveGraphNoisySpeed01(speedHz, sampleRate, blockFrames);
  const to = new Float32Array(H);
  for (let i = 0; i < H; i += 1) {
    const w = mode === 1
      ? cheapFilteredNoiseStep(walks[i], spd)
      : cheapWalkStep(walks[i], spd);
    to[i] = (Number(graph.amplitude[i]) || 0) + w * amt;
  }
  let from;
  if (lerpFrom && lerpFrom.length === H) {
    from = new Float32Array(lerpFrom);
  } else {
    from = new Float32Array(to);
  }
  graph.ampLerp = { from, to };
  graph.amplitude.set(to);
  return { graph, walks, lerpFrom: new Float32Array(to) };
}

/** Effective amp at block position. Unclamped — Out clamps to 0…1. */
function additiveGraphEffectiveAmp(graph, harmonicIndex, blockFrame = 0, blockFrames = 1) {
  const i = harmonicIndex | 0;
  const lerp = graph?.ampLerp;
  if (lerp?.from && lerp?.to && i >= 0 && i < lerp.from.length && i < lerp.to.length) {
    const n = Math.max(1, Math.floor(Number(blockFrames) || 1));
    const f = Math.max(0, Math.floor(Number(blockFrame) || 0));
    const t = n <= 1 ? 1 : Math.min(1, f / (n - 1));
    return lerp.from[i] + (lerp.to[i] - lerp.from[i]) * t;
  }
  return Number(graph?.amplitude?.[i]) || 0;
}

/** Legacy combined Additive Effect dispatcher (retired module / tests). */
function additiveGraphApplyEffect(graph, mode, parA, parB, parC, parD, effectState) {
  const out = additiveGraphClonePayload(graph);
  if (!out) return { graph: null, state: effectState };
  const state = effectState || {};
  const m = String(mode || "LinearFilter");
  const filterMode = additiveGraphNormalizeFilterMode(parC);
  if (m === "LinearFilter" || m === "0") {
    // Legacy: parA=slope 0…1, parB=cutoffHz, parD→skew; fund/sr defaulted.
    const skew = (Number(parD) || 0) * 2 - 1;
    additiveGraphApplyLinearFilter(out, filterMode, parB, parA, skew, 100, 44100);
  } else if (m === "AnalogFilter" || m === "ButterworthFilter" || m === "1") {
    const skew = (Number(parD) || 0) * 2 - 1;
    additiveGraphApplyButterworthFilter(out, filterMode, parB, parA, skew, 100, 44100);
  } else if (m === "Growl" || m === "Bubble" || m === "2") {
    // parA=rotation, parB=skew amount, parC=skewCurve 0…1 → −1…+1
    const curve = (Number(parC) || 0) * 2 - 1;
    const applied = additiveGraphApplyGrowl(out, parA, parB, curve);
    if (applied?.graph) {
      // Legacy path ignores lerp state.
    }
  } else if (m === "Noisy" || m === "NoisyFreq" || m === "3") {
    const noisy = additiveGraphApplyNoisyFreq(out, parA, parB, state.walks);
    state.walks = noisy.walks;
  }
  return { graph: out, state };
}

/** Linear pan −1…+1 → { left, right } gains (sum = 1). Wraps past ±1. */
function additiveGraphPanGains(pan) {
  const p = additiveGraphWrapStereoPan(pan);
  return {
    left: 0.5 * (1 - p),
    right: 0.5 * (1 + p),
  };
}

/**
 * Phase → RGBA stops: 0 red, 0.25 orange, 0.5 blue, 0.75 pink, 1 red.
 */
function additiveGraphPhaseColor(phase01) {
  const t = additiveGraphWrap01(phase01);
  const stops = [
    { t: 0, r: 255, g: 40, b: 40 },
    { t: 0.25, r: 255, g: 140, b: 40 },
    { t: 0.5, r: 60, g: 100, b: 255 },
    { t: 0.75, r: 255, g: 105, b: 180 },
    { t: 1, r: 255, g: 40, b: 40 },
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1].t) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

/**
 * Instantaneous Nyquist / speed-limit amp curve (not smoothed over time):
 *   hz < 0.75·Nyquist → 1
 *   0.75·Nyquist … Nyquist → linear 1→0
 *   hz ≥ Nyquist → 0
 * Phase still advances above Nyquist so harmonics stay coherent if they return.
 */
function additiveGraphNyquistAmpGain(hz, sampleRate) {
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = 0.5 * sr;
  const f = Math.abs(Number(hz) || 0);
  if (!(nyquist > 0) || !(f >= 0)) return 0;
  if (f >= nyquist) return 0;
  const rampStart = 0.75 * nyquist;
  if (f <= rampStart) return 1;
  return 1 - (f - rampStart) / Math.max(1e-12, nyquist - rampStart);
}

/**
 * Cutoff amp edge on a unit axis. Silent at/above edge.
 * brickwall 0…1: 0 = soft Nyquist-style (full until 0.75·edge, linear 1→0),
 * 1 = hard brickwall (full until edge, then 0).
 * Kept for Linear/Analog filter faces; Bubble Cutoff uses harmonicCountGain.
 */
function additiveGraphEdgeRampGain(position, edge, brickwall = 0) {
  const f = Number(position) || 0;
  const e = Number(edge) || 0;
  if (!(e > 0) || !(f >= 0)) return 0;
  if (f >= e) return 0;
  const bw = additiveGraphClamp(Number(brickwall) || 0, 0, 1);
  // Soft ramp width = 25% of edge at bw=0; shrinks to 0 at bw=1.
  const rampFrac = 0.25 * (1 - bw);
  if (rampFrac <= 1e-9) return 1;
  const rampStart = (1 - rampFrac) * e;
  if (f <= rampStart) return 1;
  return 1 - (f - rampStart) / Math.max(1e-12, e - rampStart);
}

/**
 * Fractional harmonic-count gain on a fixed slot list (Bubble Cutoff).
 * edge = continuous count in index space (0…H). index 0-based.
 * floor(edge) slots at 1, next slot ×frac, rest 0 — never shrinks H.
 */
function additiveGraphHarmonicCountGain(index, edge) {
  const i = Number(index) || 0;
  const e = Number(edge) || 0;
  if (!(e > 0) || !(i >= 0)) return 0;
  const full = Math.floor(e + 1e-9);
  const frac = e - full;
  if (i < full) return 1;
  if (i === full && frac > 1e-9) return frac;
  return 0;
}

/** One WhiteNoise sample for a stamped *Noise recipe (walks by ref). */
function additiveGraphWhiteNoiseSample(recipe, harmonicIndex, salt = 13) {
  if (!recipe || !(Number(recipe.amount) > 0)) return 0;
  if (additiveGraphNormalizeNoisyNoiseMode(recipe.mode) !== 2) return 0;
  const H = Math.max(1, harmonicIndex + 1);
  const walks = additiveGraphEnsureWalks(recipe.walks, H, salt, recipe.seed ?? 1);
  recipe.walks = walks;
  const i = Math.max(0, harmonicIndex | 0);
  return cheapWhiteNoiseStep(walks[i]);
}

/**
 * WhiteNoise ratio addend (Out): bipolar × Add depth each sample.
 * Effective ratio = max(0, baseRatio + addend). Frequency add via ×f0.
 */
function additiveGraphRatioNoiseAddend(graph, harmonicIndex) {
  const rn = graph?.ratioNoise;
  if (!rn) return 0;
  const amt = Number(rn.amount);
  if (!(amt > 0)) return 0;
  const w = additiveGraphWhiteNoiseSample(rn, harmonicIndex, 13);
  return w * amt;
}

// Half-cycle sine LUT (0…π), 2^15 samples + 1 for lerp. Second half = −reverse.
const ADDITIVE_SIN_LUT_HALF = 32768; // 2^15
let additiveGraphSinLut = null;

function additiveGraphEnsureSinLut() {
  if (additiveGraphSinLut && additiveGraphSinLut.length === ADDITIVE_SIN_LUT_HALF + 1) {
    return additiveGraphSinLut;
  }
  const n = ADDITIVE_SIN_LUT_HALF;
  const lut = new Float32Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    lut[i] = Math.sin(Math.PI * (i / n));
  }
  additiveGraphSinLut = lut;
  return lut;
}

/** phase01 in turns [0,1). Linear-interpolated half-sine wavetable. */
function additiveGraphSinTurn(phase01) {
  const lut = additiveGraphEnsureSinLut();
  const n = ADDITIVE_SIN_LUT_HALF;
  let p = Number(phase01) || 0;
  p -= Math.floor(p);
  if (p < 0) p += 1;
  if (p < 0.5) {
    const x = p * 2 * n;
    const i = x | 0;
    const f = x - i;
    const a = lut[i];
    const b = lut[i + 1 < lut.length ? i + 1 : i];
    return a + (b - a) * f;
  }
  const x = (p - 0.5) * 2 * n;
  const i = x | 0;
  const f = x - i;
  const a = lut[i];
  const b = lut[i + 1 < lut.length ? i + 1 : i];
  return -(a + (b - a) * f);
}

/** Optimize: 0 None, 1 Inaudible Harmonics (skip amp≤0, below hearing, or hz≥Nyquist). */
function additiveGraphNormalizeOptimizeMode(mode) {
  const n = Math.round(Number(mode));
  if (n === 1) return 1;
  const s = String(mode ?? "").trim().toLowerCase();
  if (s === "1" || s === "inaudible" || s === "inaudibleharmonics" || s === "inaudible harmonics") {
    return 1;
  }
  return 0;
}

/** Linear amp floor for Optimize Inaudible Harmonics (−80 dBFS ≈ 0.0001). */
const ADDITIVE_GRAPH_INAUDIBLE_AMP = Math.pow(10, -80 / 20);

/**
 * Bake one fundamental cycle of the Yellow Graph into `out` (length N).
 * Cheap face preview: O(min(H,hCap)·N). Uses ratio/phase/amplitude only.
 */
function additiveGraphBakeWaveform(graph, out, hCap = 64) {
  const N = out && out.length ? out.length | 0 : 0;
  if (!graph || !graph.ratio || N < 2) return out;
  const Hfull = Math.min(graph.ratio.length | 0, Math.max(1, graph.harmonics | 0));
  const H = Math.min(Hfull, Math.max(1, hCap | 0));
  out.fill(0);
  for (let n = 0; n < N; n += 1) {
    const t = n / N; // one fundamental cycle
    let y = 0;
    for (let i = 0; i < H; i += 1) {
      const amp = Number(graph.amplitude?.[i]) || 0;
      if (!(amp > 0)) continue;
      const ratio = Number(graph.ratio[i]) || 0;
      if (!(ratio > 0)) continue;
      const ph = Number(graph.phase?.[i]) || 0;
      y += amp * additiveGraphSinTurn(ratio * t + ph);
    }
    out[n] = y;
  }
  // Peak-normalize for face (keep silence as zeros).
  let peak = 0;
  for (let n = 0; n < N; n += 1) {
    const a = Math.abs(out[n]);
    if (a > peak) peak = a;
  }
  if (peak > 1e-12) {
    const inv = 1 / peak;
    for (let n = 0; n < N; n += 1) out[n] *= inv;
  }
  return out;
}

/**
 * Sum one sample. Mono = unpanned sum; Left/Right use pan (−1…+1).
 * *Lerp fields: linear from→to across the block. *Noise: WhiteNoise per sample.
 * optimizeMode 1: skip inaudible sin/pan work (amp≤0, below −80 dBFS, or hz≥Nyquist);
 * phaseAcc still advances.
 */
function additiveGraphSumSample(
  graph, phaseAcc, frequencyHz, masterPhase, masterAmp, sampleRate,
  blockFrame = 0, blockFrames = 1, optimizeMode = 0,
) {
  if (!graph || !graph.harmonics) {
    return { y: 0, left: 0, right: 0, mono: 0, phaseAcc };
  }
  const H = graph.harmonics;
  const sr = Math.max(1, Number(sampleRate) || 44100);
  const nyquist = sr * 0.5;
  const f0 = Number(frequencyHz) || 0;
  const mp = Number(masterPhase) || 0;
  const ma = additiveGraphClamp(masterAmp, 0, 1);
  // Harmonics count change → hard reset all free-running phases (Generator).
  // Grow/shrink without wiping running phases. New slots lock to fund by default
  // (phaseEntryMode 0); Free=0 / Random=uniform when Phase Entry stamps the Graph.
  if (!phaseAcc || phaseAcc.length !== H) {
    const oldLen = phaseAcc && phaseAcc.length ? phaseAcc.length : 0;
    const next = new Float64Array(H);
    if (phaseAcc && oldLen) {
      next.set(phaseAcc.subarray(0, Math.min(oldLen, H)));
    }
    if (H > oldLen) {
      const fund = oldLen > 0 ? next[0] : 0;
      const mode = Number(graph.phaseEntryMode) | 0;
      const r0 = Number(graph.ratio?.[0]) || 1;
      let rng = (Number(graph._phaseEntryRng) >>> 0) || 0xA5A5A5A5;
      for (let i = oldLen; i < H; i += 1) {
        if (mode === 1) {
          next[i] = 0;
        } else if (mode === 2) {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          next[i] = ((rng >>> 8) & 0xffffff) / 16777216;
        } else {
          const ri = Number(graph.ratio?.[i]) || (i + 1);
          next[i] = r0 > 1e-12 ? additiveGraphWrap01(fund * (ri / r0)) : fund;
        }
      }
      graph._phaseEntryRng = rng;
    }
    phaseAcc = next;
  }
  const skipInaudible = additiveGraphNormalizeOptimizeMode(optimizeMode) === 1;
  const hearFloor = skipInaudible ? ADDITIVE_GRAPH_INAUDIBLE_AMP : 0;
  const hasPan = Boolean(graph.pan && graph.pan.length === H)
    || Boolean(graph.panLerp)
    || Boolean(graph.panNoise);
  const hasRatioNoise = Boolean(graph.ratioNoise && Number(graph.ratioNoise.amount) > 0);
  const hasPhaseNoise = Boolean(graph.phaseNoise && Number(graph.phaseNoise.amount) > 0);
  const hasPanNoise = Boolean(graph.panNoise && Number(graph.panNoise.amount) > 0);
  const hasAmpNoise = Boolean(graph.ampNoise && Number(graph.ampNoise.amount) > 0);
  const ampLerp = graph.ampLerp;
  const ratioLerp = graph.ratioLerp;
  const phaseLerp = graph.phaseLerp;
  const panLerp = graph.panLerp;
  const hasAmpLerp = Boolean(ampLerp?.from && ampLerp?.to);
  const hasRatioLerp = Boolean(ratioLerp?.from && ratioLerp?.to);
  const hasPhaseLerp = Boolean(phaseLerp?.from && phaseLerp?.to);
  const hasPanLerp = Boolean(panLerp?.from && panLerp?.to);
  const nBlock = Math.max(1, Math.floor(Number(blockFrames) || 1));
  const fBlock = Math.max(0, Math.floor(Number(blockFrame) || 0));
  const lerpT = nBlock <= 1 ? 1 : Math.min(1, fBlock / (nBlock - 1));
  const ampArr = graph.amplitude;
  const ratioArr = graph.ratio;
  const phaseArr = graph.phase;
  const panArr = graph.pan;
  let mono = 0;
  let left = 0;
  let right = 0;
  let displayPhase = null;
  if (graph._wantDisplayPhase) {
    displayPhase = graph.displayPhase && graph.displayPhase.length === H
      ? graph.displayPhase
      : new Float32Array(H);
    graph.displayPhase = displayPhase;
  }

  for (let i = 0; i < H; i += 1) {
    let partialAmp = hasAmpLerp && i < ampLerp.from.length && i < ampLerp.to.length
      ? ampLerp.from[i] + (ampLerp.to[i] - ampLerp.from[i]) * lerpT
      : Number(ampArr?.[i]) || 0;
    if (hasAmpNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.ampNoise, i, 61);
      const amt = Number(graph.ampNoise.amount) || 0;
      partialAmp += w * amt;
    }
    partialAmp = additiveGraphClamp(partialAmp, 0, 1);

    let baseRatio = hasRatioLerp && i < ratioLerp.from.length && i < ratioLerp.to.length
      ? ratioLerp.from[i] + (ratioLerp.to[i] - ratioLerp.from[i]) * lerpT
      : Number(ratioArr?.[i]) || 0;
    if (hasRatioNoise) {
      baseRatio = Math.max(0, baseRatio + additiveGraphRatioNoiseAddend(graph, i));
    }
    const hz = baseRatio * f0;

    const inc = hz / sr;
    phaseAcc[i] = additiveGraphWrap01(phaseAcc[i] + inc);

    let partialPhase = hasPhaseLerp && i < phaseLerp.from.length && i < phaseLerp.to.length
      ? additiveGraphLerpPhase01(phaseLerp.from[i], phaseLerp.to[i], lerpT)
      : additiveGraphWrap01(Number(phaseArr?.[i]) || 0);
    if (hasPhaseNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.phaseNoise, i, 29);
      const amt = Number(graph.phaseNoise.amount) || 0;
      partialPhase = additiveGraphWrap01(partialPhase + w * amt);
    }
    const p = additiveGraphWrap01(phaseAcc[i] + partialPhase + mp);
    if (displayPhase) displayPhase[i] = p;

    const heardAmp = partialAmp * ma;
    const inaudible = skipInaudible && (
      !(partialAmp > 0) || heardAmp < hearFloor || hz >= nyquist
    );
    if (inaudible) continue;

    const gain = additiveGraphNyquistAmpGain(hz, sr);
    if (gain <= 0) continue;

    const s = additiveGraphSinTurn(p) * partialAmp * ma * gain;
    mono += s;

    let pan = 0;
    if (hasPan) {
      if (hasPanLerp && i < panLerp.from.length && i < panLerp.to.length) {
        pan = panLerp.from[i] + (panLerp.to[i] - panLerp.from[i]) * lerpT;
      } else {
        pan = Number(panArr?.[i]) || 0;
      }
    }
    if (hasPanNoise) {
      const w = additiveGraphWhiteNoiseSample(graph.panNoise, i, 47);
      const amt = Number(graph.panNoise.amount) || 0;
      pan += w * amt;
    }
    pan = additiveGraphWrapStereoPan(pan);
    const gains = additiveGraphPanGains(pan);
    left += s * gains.left;
    right += s * gains.right;
  }
  return { y: mono, mono, left, right, phaseAcc, displayPhase };
}
