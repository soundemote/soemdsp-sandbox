// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphAnalogWaveTrisaw(phaseCycles, morph) {
  let phaseRad = phaseCycles * 2 * Math.PI;
  phaseRad = phaseRad - 2 * Math.PI * Math.floor(phaseRad / (2 * Math.PI));
  const morphRad = morph * 2 * Math.PI;
  let sourceMin, sourceMax, targetMin, targetRange;
  if (phaseRad > morphRad) {
    sourceMin = morphRad; sourceMax = 2 * Math.PI; targetMin = 1; targetRange = -1;
  } else {
    sourceMin = 0; sourceMax = morphRad; targetMin = 0; targetRange = 1;
  }
  const sourceRange = sourceMax - sourceMin;
  let uni;
  if (sourceMin === sourceMax) uni = sourceMin;
  else uni = targetMin + (targetRange * (phaseRad - sourceMin)) / sourceRange;
  return 2 * uni - 1;
}


function nodeGraphSuperloveFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));
  const mode = Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0)));

  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "superlove input");

  if (mode <= 1) {
    const resGraph = [{x:0,y:0,skew:0,shape:0},{x:1,y:-2.7175,skew:-0.85,shape:2}];
    const noiseGraph = [{x:0,y:0.00,skew:0,shape:0},{x:0.75,y:0.05,skew:-0.7,shape:2},{x:1,y:0.10,skew:0.6,shape:2}];
    const cutoffHz = Math.max(0, Math.min(0.5 * rate, nodeGraphAnalogPitchToFreq(-12 + (135 - -12) * freqNorm)));
    const mod = nodeGraphAnalogEvalGraph(resGraph, reso);
    const noiseAmp = nodeGraphAnalogEvalGraph(noiseGraph, chaos);
    const shape = chaos;

    state.feedbackSignal = mod * state.feedbackSignal + safeInput;
    const pm = nodeGraphAnalogNextNoiseBipolar() * noiseAmp;
    const oscValue = -nodeGraphAnalogWaveTrisaw(state.feedbackSignal + 0.25725 + pm, shape);

    const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
    const stages = mode === 0 ? 3 : 4;
    state.feedbackSignal = nodeGraphAnalogLadderTapStep(state.filterY, oscValue, a, 1, stages);

    const dcCutoff = mode === 0 ? 10.0 : 5.0;
    const dcStages = mode === 0 ? 3 : 1;
    const dcA = nodeGraphAnalogLadderCoefficient(dcCutoff, rate);
    const dcOut = nodeGraphAnalogLadderTapStep(state.dcY, state.feedbackSignal, dcA, 2, dcStages);

    return nodeGraphSafeFilterNumber(dcOut * 1.02, runtime, nodeId, state, "superlove lp output");
  } else if (mode === 2) {
    const resGraph = [{x:0,y:-0.2,skew:0,shape:0},{x:1,y:1.3,skew:-0.85,shape:2}];
    const mod = nodeGraphAnalogEvalGraph(resGraph, reso);
    const shape = 1 - chaos;

    state.feedbackSignal = mod * state.feedbackSignal + safeInput;
    const oscValue = -nodeGraphAnalogWaveTrisaw(state.feedbackSignal + 0.75, shape);

    const lpA = nodeGraphAnalogLadderCoefficient(rate * 0.5, rate);
    let fb = nodeGraphAnalogLadderTapStep(state.filterY, oscValue * 0.1, lpA, 1, 1);

    const cutoffHz = Math.max(0, Math.min(0.5 * rate, nodeGraphAnalogPitchToFreq(-12 + (135 - -12) * freqNorm)));
    const hpA = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
    fb = nodeGraphAnalogLadderTapStep(state.dcY, fb, hpA, 2, 1);
    fb *= 10;

    state.feedbackSignal = fb;
    return nodeGraphSafeFilterNumber(-fb * 0.31, runtime, nodeId, state, "superlove hp output");
  } else {
    const resGraph = [{x:0,y:-0.2,skew:0,shape:0},{x:1,y:1.3,skew:-0.85,shape:2}];
    const mod = nodeGraphAnalogEvalGraph(resGraph, reso);
    const shape = 1 - chaos;

    state.feedbackSignal = mod * state.feedbackSignal + safeInput;
    const oscValue = -nodeGraphAnalogWaveTrisaw(state.feedbackSignal + 0.75, shape);

    const cutoffHz = Math.max(0, Math.min(0.5 * rate, nodeGraphAnalogPitchToFreq(-12 + (135 - -12) * freqNorm)));
    const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
    let fb = nodeGraphAnalogLadderTapStep(state.filterY, oscValue * 0.1, a, 3, 1);
    fb *= 10;

    state.feedbackSignal = fb;
    return nodeGraphSafeFilterNumber(fb, runtime, nodeId, state, "superlove bp output");
  }
}


// Registers the offline/render-time dispatch handler for superloveFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.superloveFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.superloveFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphSuperloveFilterState);
  runtime.superloveFilterStates.set(nodeId, state);
  const superloveParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0.5, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const superloveMono = mixInput(nodeId);
  return {
    Out: nodeGraphSuperloveFilterSample(state.mono, superloveMono, superloveParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphSuperloveFilterSample(state.left, mixInput(nodeId, "Left") + superloveMono, superloveParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphSuperloveFilterSample(state.right, mixInput(nodeId, "Right") + superloveMono, superloveParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
