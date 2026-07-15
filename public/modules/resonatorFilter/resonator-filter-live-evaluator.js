// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphResonatorFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));
  const mode = Math.max(0, Math.min(2, Math.round(Number(params.mode) || 0)));
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "resonator input");

  if (mode === 0 || mode === 1) {
    const triangle = mode === 1;
    const inputAmplitude = triangle ? 3.0 : 2.0;

    let maxFreqNorm, resDropPoint;
    if (rate <= 44100) { maxFreqNorm = 0.855; resDropPoint = 0.74; }
    else if (rate <= 88200) { maxFreqNorm = 0.9; resDropPoint = 0.75; }
    else if (rate <= 132300) { maxFreqNorm = 0.9; resDropPoint = 0.82; }
    else if (rate <= 176400) { maxFreqNorm = 0.9; resDropPoint = 0.88; }
    else if (rate <= 220500) { maxFreqNorm = 0.9; resDropPoint = 0.92; }
    else { maxFreqNorm = 0.955; resDropPoint = 0.92; }

    const freqNormInUse = Math.min(freqNorm, maxFreqNorm);
    const frequencyHz = nodeGraphAnalogPitchToFreq(-72.96 + (69.76 - -72.96) * freqNormInUse);
    const cutoffHz = frequencyHz * (0.248387 + (0.0927813 - 0.248387) * nodeGraphFlowerChildFilterCurveShape(freqNormInUse, -0.36));
    const osc2Ratio = 0.015625 + (1.58 - 0.015625) * freqNormInUse;
    const osc1Ratio = osc2Ratio - 0.015625;

    const resGraph = [{x:0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1,y:0.15,skew:0.557,shape:1}];
    const newResNorm = nodeGraphAnalogEvalGraph(resGraph, freqNorm);
    const freqModAmt = 10.0 + (484.43 - 10.0) * newResNorm;
    const phaseModAmt = 0.256 + (0.166 - 0.256) * chaos;

    let inputSignal = inputAmplitude * safeInput;
    inputSignal = state.osc2Value + state.osc1SelfMod + inputSignal;

    const freq1 = frequencyHz * osc1Ratio * freqModAmt * 0.1 * inputSignal;
    const clampedFreq1 = Math.max(-rate * 0.5, Math.min(rate * 0.5, freq1));
    state.phase1 += clampedFreq1 / rate;
    state.phase1 -= Math.floor(state.phase1);
    const phaseOffset1 = inputSignal * phaseModAmt;
    let unipolar1 = state.phase1 + phaseOffset1;
    unipolar1 -= Math.floor(unipolar1);
    state.osc1Value = nodeGraphAnalogWaveEllipse(unipolar1, 0.00749) * 0.5;

    const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
    inputSignal = nodeGraphAnalogLadderTapStep(state.filterY, state.osc1Value, a, 1, 1);

    state.osc1SelfMod = inputSignal;
    state.osc2SelfMod = state.osc2Value;

    const fm2 = freqModAmt * 4.53126 * inputSignal + state.osc2SelfMod * 3.0;
    const freq2 = frequencyHz * osc2Ratio * fm2;
    const clampedFreq2 = Math.max(-rate * 0.5, Math.min(rate * 0.5, freq2));
    state.phase2 += clampedFreq2 / rate;
    state.phase2 -= Math.floor(state.phase2);

    let out;
    if (!triangle) {
      out = Math.sin(state.phase2 * 2 * Math.PI);
      state.osc2Value = out * 10.0;
    } else {
      const ellipseCGraph = [{x:0,y:0.3,skew:0,shape:0},{x:1,y:1.0,skew:-0.99,shape:2}];
      const ellipseC = nodeGraphAnalogEvalGraph(ellipseCGraph, freqNormInUse);
      out = nodeGraphAnalogWaveEllipse(state.phase2, ellipseC);
      state.osc2Value = out * 10.0;
    }

    const dcA = nodeGraphAnalogLadderCoefficient(5.0, rate);
    const dcOut = nodeGraphAnalogLadderTapStep(state.dcY, -out, dcA, 2, 1);
    return nodeGraphSafeFilterNumber(dcOut * (triangle ? 10.0 : 4.6), runtime, nodeId, state, "resonator sinusoid/triangle output");
  } else {
    const inputAmplitude = 2.0;
    const frequencyHz = nodeGraphAnalogPitchToFreq(-50 + (108 - -50) * freqNorm);
    const cutoffHz = frequencyHz * 8.87718;

    const mod21Graph = [{x:0,y:-0.00105655,skew:0,shape:0},{x:1,y:-2.52898,skew:-0.99,shape:2}];
    const fmpm12Graph = [{x:0,y:0.0,skew:0,shape:0},{x:1,y:0.012216,skew:0.54,shape:2}];

    let breakpoint2, cap3;
    if (rate <= 44100) { breakpoint2 = 0.578595; cap3 = 0.432749; }
    else if (rate <= 88200) { breakpoint2 = 0.692308; cap3 = 0.502924; }
    else if (rate <= 132300) { breakpoint2 = 0.749164; cap3 = 0.561404; }
    else { breakpoint2 = 0.776273; cap3 = 0.54386; }
    const cappedTarget = Math.min(reso, cap3);
    const resGraph = [{x:0,y:0,skew:0,shape:0},{x:0.0434783,y:reso,skew:0,shape:0},{x:breakpoint2,y:reso,skew:0,shape:0},{x:1,y:cappedTarget,skew:0.195211,shape:1}];
    const resSample = nodeGraphAnalogEvalGraph(resGraph, freqNorm);
    let mod21 = nodeGraphAnalogEvalGraph(mod21Graph, resSample);
    if (mod21 < -1.53) mod21 = -1.53;
    const fmpm12 = nodeGraphAnalogEvalGraph(fmpm12Graph, chaos);

    let inputSignal = (-safeInput) * inputAmplitude + state.sawFeedback * -8.07896613446314289533 + state.osc2Value + state.osc1SelfMod * 20.0;

    const freq1 = frequencyHz * mod21 * inputSignal;
    state.phase1 += freq1 / rate;
    state.phase1 -= Math.floor(state.phase1);
    state.osc1Value = Math.sin(state.phase1 * 2 * Math.PI);
    // rsScaledAndShiftedSigmoid, center=0, width=0.00873698
    const scaleX = 2 / 0.00873698;
    state.osc1Value = (0.00873698 / 2) * Math.tanh(scaleX * state.osc1Value);

    const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
    inputSignal = nodeGraphAnalogLadderTapStep(state.filterY, state.osc1Value, a, 1, 1);

    state.osc1SelfMod = inputSignal;
    state.osc2SelfMod = state.osc2Value;

    const modv = inputSignal * -140.010789331 + state.osc2SelfMod * -1.05208;
    const fm = Math.cos((Math.PI / 2) * fmpm12) * modv;
    const pm = Math.sin((Math.PI / 2) * fmpm12) * modv;
    state.phase2 += (frequencyHz * (-0.425 + fm)) / rate;
    state.phase2 -= Math.floor(state.phase2);
    let unipolar2 = state.phase2 + pm;
    unipolar2 -= Math.floor(unipolar2);
    state.osc2Value = Math.sin(unipolar2 * 2 * Math.PI);

    state.sawFeedback = inputSignal + state.osc2Value;

    const dcA = nodeGraphAnalogLadderCoefficient(5.0, rate);
    const dcOut = nodeGraphAnalogLadderTapStep(state.dcY, -state.osc2Value * 0.1, dcA, 2, 1);
    return nodeGraphSafeFilterNumber(dcOut * 80.0, runtime, nodeId, state, "resonator sawtooth output");
  }
}


// Registers the offline/render-time dispatch handler for resonatorFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.resonatorFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.resonatorFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphResonatorFilterState);
  runtime.resonatorFilterStates.set(nodeId, state);
  const resonatorParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const resonatorMono = mixInput(nodeId);
  return {
    Out: nodeGraphResonatorFilterSample(state.mono, resonatorMono, resonatorParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphResonatorFilterSample(state.left, mixInput(nodeId, "Left") + resonatorMono, resonatorParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphResonatorFilterSample(state.right, mixInput(nodeId, "Right") + resonatorMono, resonatorParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
