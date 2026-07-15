// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphHumanFilterDbToAmp(db) {
  return Math.pow(10, db / 20);
}


function nodeGraphHumanFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));
  const mode = Math.max(0, Math.min(2, Math.round(Number(params.mode) || 0)));

  let maxPitch, resDropPoint, chaosMax;
  if (rate <= 44100) { maxPitch = 115.57; resDropPoint = 0.78; chaosMax = 0.64; }
  else if (rate <= 88200) { maxPitch = 128.7; resDropPoint = 0.78; chaosMax = 1.0; }
  else if (rate <= 132300) { maxPitch = 137.0; resDropPoint = 0.83; chaosMax = 0.856; }
  else if (rate <= 176400) { maxPitch = 137.0; resDropPoint = 0.91; chaosMax = 1.0; }
  else if (rate <= 220500) { maxPitch = 137.0; resDropPoint = 1.0; chaosMax = 1.0; }
  else { maxPitch = 137.0; resDropPoint = 0.78; chaosMax = 1.0; }

  const pitch = -0.38 + (137.0 - -0.38) * freqNorm;
  const frequencyHz = nodeGraphAnalogPitchToFreq(Math.min(pitch, maxPitch));

  const mod11Graph = [{x:0.0,y:2.92396,skew:0,shape:0},{x:1.0,y:-1.7544,skew:0.785442,shape:1}];
  let mod11;
  if (resDropPoint !== 1.0) {
    const resVfreqGraph = [{x:0.0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1.0,y:0.2,skew:0.57,shape:1}];
    const newResNormalized = nodeGraphAnalogEvalGraph(resVfreqGraph, freqNorm);
    mod11 = nodeGraphAnalogEvalGraph(mod11Graph, newResNormalized);
  } else {
    mod11 = nodeGraphAnalogEvalGraph(mod11Graph, reso);
  }

  const gainDb = Math.min(chaos, chaosMax) * 14.9;

  // rsStateVariableFilter BELL mode -- documented Q=1/1kHz approximation,
  // see human_filter.cpp's header comment.
  const centerHz = 1000.0;
  const Q = 1.0;
  const A = nodeGraphHumanFilterDbToAmp(gainDb);
  const w = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * centerHz / rate));
  const r = 1 / (Q * A);
  const g = Math.tan(0.5 * w);
  const c = g + r;
  const sCoef = 1 / (1 + g * c);
  const aB = A * A * r;

  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "human input");
  const clampedInput = Math.max(-2, Math.min(2, safeInput));
  const svfIn = state.osc2Value + state.osc1ModSelf + clampedInput + state.lastOutValue;
  const yH = (svfIn - c * state.fbZ1 - state.fbZ2) * sCoef;
  const yB = state.fbZ1 + g * yH;
  const yL = state.fbZ2 + g * yB;
  state.fbZ1 = 2 * yB - state.fbZ1;
  state.fbZ2 = 2 * yL - state.fbZ2;
  const inputSignal = yH + aB * yB + yL;

  const fm1 = -2.2784975504539248 * inputSignal;
  state.phase1 += (frequencyHz * fm1) / rate;
  state.phase1 -= Math.floor(state.phase1);
  state.osc1Value = Math.sin(state.phase1 * 2 * Math.PI) * 0.177898;

  state.osc1ModSelf = state.osc1Value * mod11;
  state.osc2ModSelf = state.osc2Value * -0.395833;

  const fm2 = 0.0333333 + 2.7429968062 * state.osc1Value + state.osc2ModSelf;
  state.phase2 += (frequencyHz * fm2) / rate;
  state.phase2 -= Math.floor(state.phase2);
  state.osc2Value = Math.sin(state.phase2 * 2 * Math.PI) * 0.71597;

  state.lastOutValue = (state.osc1Value + state.osc2Value) * 0.1443178;

  const dcA = nodeGraphAnalogLadderCoefficient(5.0, rate);
  let out;
  if (mode === 0) out = nodeGraphAnalogLadderTapStep(state.dcY, state.osc1Value, dcA, 2, 1) * 2.0;
  else if (mode === 1) out = nodeGraphAnalogLadderTapStep(state.dcY, state.osc1Value + state.osc2Value, dcA, 2, 1);
  else out = nodeGraphAnalogLadderTapStep(state.dcY, state.osc2Value, dcA, 2, 1);

  return nodeGraphSafeFilterNumber(out, runtime, nodeId, state, "human output");
}


// Registers the offline/render-time dispatch handler for humanFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.humanFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.humanFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphHumanFilterState);
  runtime.humanFilterStates.set(nodeId, state);
  const humanFilterParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const humanFilterMono = mixInput(nodeId);
  return {
    Out: nodeGraphHumanFilterSample(state.mono, humanFilterMono, humanFilterParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphHumanFilterSample(state.left, mixInput(nodeId, "Left") + humanFilterMono, humanFilterParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphHumanFilterSample(state.right, mixInput(nodeId, "Right") + humanFilterMono, humanFilterParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
