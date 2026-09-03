// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function createNodeGraphFlowerChildFilterState() {
  return {
    phase: 0,
    phaseOffset: 0,
    stage1: 0,
    stage2: 0,
    selfMod: 0,
    rev3Feedback: 0,
    rev3Lpf1Y1: 0,
    rev3Lpf2Y1: 0,
    dsPhase: 0,
    dsHeld: 0,
  };
}

function nodeGraphFlowerChildFilterRationalCurve(p, skew) {
  return ((1 + skew) * p) / (1 - skew + 2 * skew * p);
}


function nodeGraphFlowerChildFilterEvalGraph(nodes, x) {
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
  if (n2.shape === 1) return n1.y + (n2.y - n1.y) * nodeGraphFlowerChildFilterRationalCurve(p, n2.skew);
  if (n2.shape === 2) {
    const c = 0.5 * (n2.skew + 1);
    const a = 2 * Math.log((1 - c) / c);
    return n1.y + (n2.y - n1.y) * (1 - Math.exp(p * a)) / (1 - Math.exp(a));
  }
  return n1.y + (n2.y - n1.y) * p;
}

function nodeGraphFlowerChildFilterOnePoleIitCoefficient(cutoffHz, sampleRate) {
  const w = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * cutoffHz / sampleRate));
  return Math.exp(-w);
}

function nodeGraphFlowerChildFilterOnePoleIitStep(prevY1, input, a1) {
  const b0 = 1 - a1;
  return b0 * input + a1 * prevY1;
}

function nodeGraphFlowerChildFilterSampleAndHold(state, incoming, samplingFreq, sampleRate) {
  state.dsPhase += samplingFreq / sampleRate;
  if (state.dsPhase >= 1) {
    state.dsPhase -= Math.floor(state.dsPhase);
    state.dsHeld = incoming;
  }
  return state.dsHeld;
}

function nodeGraphFlowerChildFilterEvalResonanceGraph(x, n0y, breakpoint, n2y, skew) {
  if (x < 0) return n0y;
  if (x >= 1) return n2y;
  if (x < breakpoint) return n0y;
  const p = (x - breakpoint) / (1 - breakpoint);
  return n0y + (n2y - n0y) * nodeGraphFlowerChildFilterRationalCurve(p, skew);
}

function nodeGraphFlowerChildFilterOnePoleCoefficient(cutoffHz, sampleRate) {
  const rawWc = 2 * Math.PI * cutoffHz / sampleRate;
  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, rawWc));
  const s = Math.sin(wc);
  const c = Math.cos(wc);
  const t = Math.tan(0.25 * (wc - Math.PI));
  let denom = s - c * t;
  if (denom > -1e-12 && denom < 1e-12) denom = denom >= 0 ? 1e-12 : -1e-12;
  return t / denom;
}

function nodeGraphFlowerChildFilterOnePoleStep(prevY1, input, a) {
  let y0 = input;
  y0 = y0 / (1 + y0 * y0);
  return y0 + a * (y0 - prevY1);
}

function nodeGraphFlowerChildFilterEllipse(phase, ellipseC) {
  const sinX = Math.sin(phase * 2 * Math.PI);
  const cosX = Math.cos(phase * 2 * Math.PI);
  let sqrtVal = Math.sqrt(cosX * cosX + (ellipseC * sinX) * (ellipseC * sinX));
  if (sqrtVal < 1e-12) sqrtVal = 1e-12;
  return cosX / sqrtVal;
}


function nodeGraphFlowerChildFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));
  const modeNum = Math.round(Number(params.mode) || 0);

  if (modeNum === 2) {
    const masterPitch = -120 + (105 - -120) * freqNorm;
    const masterFrequency = 440 * Math.pow(2, (masterPitch - 69) / 12);
    const fmAmount = 440 * Math.pow(2, (-48.377 - 69) / 12);
    const lpf1Cutoff = 440 * Math.pow(2, ((90 + (180 - 90) * (masterPitch - -120) / (120 - -120)) - 69) / 12);
    const lpf2Cutoff = 440 * Math.pow(2, ((80 + (130 - 80) * (masterPitch - -120) / (120 - -120)) - 69) / 12);
    const lpf1A = nodeGraphFlowerChildFilterOnePoleIitCoefficient(lpf1Cutoff, rate);
    const lpf2A = nodeGraphFlowerChildFilterOnePoleIitCoefficient(lpf2Cutoff, rate);

    const phaseModGraph = [{x:0,y:0.0,skew:0,shape:0},{x:0.5,y:-0.017446,skew:0.9,shape:1},{x:0.6,y:-0.017575,skew:0.0,shape:1},{x:1.0,y:-0.0147,skew:0.6,shape:1}];
    const sineAmpGraph = [{x:0,y:4.44777,skew:0,shape:0},{x:0.5,y:8.6687,skew:0.9,shape:1},{x:0.6,y:8.6687,skew:0.0,shape:1},{x:1.0,y:2.0,skew:0.6,shape:1}];
    const sineToSquareGraph = [{x:0,y:0.6792,skew:0,shape:0},{x:0.5,y:0.9552,skew:0.9,shape:1},{x:0.6,y:0.9552,skew:0.0,shape:1},{x:1.0,y:0.001,skew:0.6,shape:1}];
    const clipLevelGraph = [{x:0.0,y:7.0,skew:0,shape:0},{x:0.7,y:7.0,skew:0.0,shape:1},{x:1.0,y:2.0,skew:0.6,shape:1}];
    const noiseGraph = [{x:0.0,y:0.0,skew:0,shape:0},{x:0.8,y:0.1,skew:0,shape:0},{x:1.0,y:1.0,skew:0.0,shape:1}];

    const pmAmount = nodeGraphFlowerChildFilterEvalGraph(phaseModGraph, reso);
    const sineAmp = nodeGraphFlowerChildFilterEvalGraph(sineAmpGraph, reso);
    const sineToSquare = nodeGraphFlowerChildFilterEvalGraph(sineToSquareGraph, reso);
    const clipLevelRaw = nodeGraphFlowerChildFilterEvalGraph(clipLevelGraph, reso);
    const clipLevel = Math.min(sineAmp, clipLevelRaw);
    const noiseReduction = nodeGraphFlowerChildFilterEvalGraph(noiseGraph, reso);
    const chaosAmount4x = chaos * 4;

    const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "flower child rev3 input");
    const inSig = state.rev3Feedback + Math.max(-clipLevel, Math.min(clipLevel, -1 * safeInput));
    const f = masterFrequency * inSig * fmAmount;
    const noiseTerm = masterFrequency * (Math.random() * 2 - 1) * chaosAmount4x * noiseReduction;

    state.phase = state.phase + (f + noiseTerm) / rate;
    state.phase = state.phase - Math.floor(state.phase);
    const bipolarPhasor = 2 * state.phase - 1;
    const phasorOut = bipolarPhasor + pmAmount * state.rev3Feedback;

    const ellipseOut = sineAmp * nodeGraphFlowerChildFilterEllipse(phasorOut, sineToSquare);

    let feedback = nodeGraphFlowerChildFilterOnePoleIitStep(state.rev3Lpf1Y1, ellipseOut, lpf1A);
    state.rev3Lpf1Y1 = feedback;
    feedback = nodeGraphFlowerChildFilterOnePoleIitStep(state.rev3Lpf2Y1, feedback, lpf2A);
    state.rev3Lpf2Y1 = feedback;
    state.rev3Feedback = feedback;

    return nodeGraphSafeFilterNumber(feedback * 0.15, runtime, nodeId, state, "flower child rev3 output");
  }

  if (modeNum === 3) {
    const maxNormFreq3 = rate <= 44100 ? 0.928 : 1;
    const normalizedFreqInUse3 = Math.min(freqNorm, maxNormFreq3) * (161 - 3) + 3;
    const frequencyHz3 = 440 * Math.pow(2, (normalizedFreqInUse3 - 69) / 12);

    const cutoff1 = frequencyHz3 * 0.4;
    const a1 = nodeGraphFlowerChildFilterOnePoleCoefficient(cutoff1, rate);

    let breakpoint, cap;
    if (rate <= 44100) { breakpoint = 0.732441; cap = 0.649123; }
    else if (rate <= 88200) { breakpoint = 0.816054; cap = 0.818713; }
    else { breakpoint = 0.879599; cap = 0.807018; }
    const cappedTarget = Math.min(reso, cap);
    const graphValue = nodeGraphFlowerChildFilterEvalResonanceGraph(reso, reso, breakpoint, cappedTarget, -0.38);
    const selfModAmp = 0.0368 + (0.6333 - 0.0368) * nodeGraphFlowerChildFilterCurveShape(graphValue, 0.4);

    const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "flower child downsampled input");
    let inputSignal = Math.max(-1, Math.min(1, -safeInput)) * 0.036;
    inputSignal += state.selfMod;

    const mod = 1.4 * inputSignal;
    const fm = mod;

    state.phase = state.phase + (frequencyHz3 * fm * 6.0) / rate;
    state.phase = state.phase - Math.floor(state.phase);

    const dsf = [{x:0,y:0,skew:0,shape:0},{x:1,y:0.025*rate,skew:-0.09,shape:2}];
    const samplingFreq = frequencyHz3 * 2.0 + nodeGraphFlowerChildFilterEvalGraph(dsf, 10.0 * Math.abs(mod));

    const downsampledPhase = nodeGraphFlowerChildFilterSampleAndHold(state, state.phase, samplingFreq, rate);
    const current_osc_value = Math.sin(downsampledPhase * 2 * Math.PI) * 1.3;

    const filtered = nodeGraphFlowerChildFilterOnePoleStep(state.stage1, current_osc_value, a1);
    state.stage1 = filtered;
    state.selfMod = filtered * selfModAmp;

    return nodeGraphSafeFilterNumber(filtered * 1.4, runtime, nodeId, state, "flower child downsampled output");
  }

  const dirty = modeNum !== 0;

  const maxNormFreq = rate <= 44100 ? 0.928 : 1;
  const normalizedFreqInUse = (Math.min(freqNorm, maxNormFreq)) * (161 - 3) + 3;
  const frequencyHz = 440 * Math.pow(2, (normalizedFreqInUse - 69) / 12);

  // FM/PM crossfade is provably always 0 (see the .cpp header comment) --
  // collapses to pure FM feedback: fm = mod, pm = 0.

  const cutoff1 = frequencyHz * 0.164312;
  const cutoff2 = frequencyHz * 0.366131;
  const a1 = nodeGraphFlowerChildFilterOnePoleCoefficient(cutoff1, rate);
  const a2 = nodeGraphFlowerChildFilterOnePoleCoefficient(cutoff2, rate);

  let breakpoint, cap;
  if (dirty) {
    if (rate <= 44100) { breakpoint = 0.816054; cap = 0.602339; }
    else if (rate <= 88200) { breakpoint = 0.902657; cap = 0.654971; }
    else { breakpoint = 0.977649; cap = 0.760234; }
  } else {
    if (rate <= 44100) { breakpoint = 0.732441; cap = 0.649123; }
    else if (rate <= 88200) { breakpoint = 0.816054; cap = 0.818713; }
    else { breakpoint = 0.879599; cap = 0.807018; }
  }
  const cappedTarget = Math.min(reso, cap);

  let selfModAmp = 1;
  let ellipseC = -1;
  if (!dirty) {
    const graphValue = nodeGraphFlowerChildFilterEvalResonanceGraph(reso, reso, breakpoint, cappedTarget, -0.38);
    selfModAmp = 0.0368 + (0.6333 - 0.0368) * nodeGraphFlowerChildFilterCurveShape(graphValue, 0.4);
  } else {
    const graphValue = nodeGraphFlowerChildFilterEvalResonanceGraph(freqNorm, reso, breakpoint, cappedTarget, -0.38);
    ellipseC = -1 + (0.00001 - -1) * nodeGraphFlowerChildFilterCurveShape(graphValue, -0.6);
  }

  const clampLimit = dirty ? 1.198 : 1;
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "flower child input");
  let inputSignal = Math.max(-clampLimit, Math.min(clampLimit, -safeInput));

  if (chaos > 0) {
    inputSignal += (Math.random() * 2 - 1) * chaos;
  }

  inputSignal = state.selfMod + 0.035848699999999845 * inputSignal;

  const mod = 1.4 * inputSignal;
  const fm = mod;

  state.phaseOffset = 0;
  const incAmt = (frequencyHz * fm) / rate;
  state.phase = state.phase + incAmt;
  state.phase = state.phase - Math.floor(state.phase);
  let unipolarPhase = state.phase + state.phaseOffset;
  unipolarPhase = unipolarPhase - Math.floor(unipolarPhase);

  const oscValue = dirty
    ? nodeGraphFlowerChildFilterEllipse(unipolarPhase, ellipseC) * 0.1
    : Math.sin(unipolarPhase * 2 * Math.PI) * 1.3;

  let out = nodeGraphFlowerChildFilterOnePoleStep(state.stage1, oscValue, a1);
  state.stage1 = out;
  out = nodeGraphFlowerChildFilterOnePoleStep(state.stage2, out, a2);
  state.stage2 = out;

  state.selfMod = dirty ? out * 0.465 : out * selfModAmp;

  const output = dirty ? out * 5.22 : out * 1.31;
  return nodeGraphSafeFilterNumber(output, runtime, nodeId, state, "flower child output");
}


// Registers the offline/render-time dispatch handler for flowerChildFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.flowerChildFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.flowerChildFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphFlowerChildFilterState);
  runtime.flowerChildFilterStates.set(nodeId, state);
  const flowerChildParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  // Always two independent engines (own filter + chaos noise each).
  // Mono In folds into both; Mono Out = (L+R)/2.
  const monoIn = mixInput(nodeId, "In") || mixInput(nodeId) || 0;
  const left = nodeGraphFlowerChildFilterSample(
    state.left,
    (mixInput(nodeId, "Left") || 0) + monoIn,
    flowerChildParams,
    sampleRate,
    runtime,
    `${nodeId}:left`,
  );
  const right = nodeGraphFlowerChildFilterSample(
    state.right,
    (mixInput(nodeId, "Right") || 0) + monoIn,
    flowerChildParams,
    sampleRate,
    runtime,
    `${nodeId}:right`,
  );
  return {
    Out: 0.5 * (left + right),
    Left: left,
    Right: right,
  };
};
