// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphYellowjacketFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));

  let maxPitch, resDropPoint;
  if (rate <= 44100) { maxPitch = 87.7; resDropPoint = 0.77; }
  else if (rate <= 88200) { maxPitch = 96.0; resDropPoint = 0.82; }
  else if (rate <= 132300) { maxPitch = 96.0; resDropPoint = 0.83; }
  else if (rate <= 176400) { maxPitch = 96.0; resDropPoint = 0.86; }
  else if (rate <= 220500) { maxPitch = 96.0; resDropPoint = 0.89; }
  else if (rate <= 264600) { maxPitch = 96.0; resDropPoint = 0.90; }
  else { maxPitch = 96.0; resDropPoint = 0.95; }

  const pitch = -156 + (96 - -156) * freqNorm;
  const frequencyHz = nodeGraphAnalogPitchToFreq(Math.min(pitch, maxPitch));
  const cutoffHz = frequencyHz * (4.56415 + (0.972007 - 4.56415) * chaos);

  const resGraph = [{x:0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1,y:0.2,skew:0.57,shape:1}];
  const newResNormalized = nodeGraphAnalogEvalGraph(resGraph, freqNorm);
  const ellipseCGraph = [{x:0,y:7.6024,skew:0,shape:0},{x:1,y:0.00001,skew:0.99,shape:2}];
  const feedbackGainGraph = [{x:0,y:20.0,skew:0,shape:0},{x:1,y:-0.0429102,skew:0.99,shape:2}];
  const ellipseC = nodeGraphAnalogEvalGraph(ellipseCGraph, newResNormalized);
  const feedbackGain = nodeGraphAnalogEvalGraph(feedbackGainGraph, newResNormalized);

  const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);

  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "yellowjacket input");
  let inputSignal = Math.max(-7, Math.min(7, safeInput * 4));
  inputSignal = state.oscSelfMod + 1.04025 * inputSignal + state.lastOutValue;

  state.phase += (frequencyHz * 1.9400625 * inputSignal) / rate;
  state.phase -= Math.floor(state.phase);

  let oscValue = nodeGraphAnalogWaveEllipseFull(state.phase, 0.0, -0.71286768918541499, 0.70129855105756955, ellipseC);
  oscValue *= 0.635417;

  let y0 = oscValue;
  y0 = y0 / (1 + y0 * y0);
  state.filterY1 = y0 + a * (y0 - state.filterY1);
  inputSignal = state.filterY1;

  state.oscSelfMod = inputSignal * 20.0;

  const out = 1.3892758936011171 * oscValue;
  state.lastOutValue = out * 0.5 * feedbackGain;

  return nodeGraphSafeFilterNumber(out, runtime, nodeId, state, "yellowjacket output");
}


// Registers the offline/render-time dispatch handler for yellowjacketFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.yellowjacketFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.yellowjacketFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphYellowjacketFilterState);
  runtime.yellowjacketFilterStates.set(nodeId, state);
  const yellowjacketParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const yellowjacketMono = mixInput(nodeId);
  return {
    Out: nodeGraphYellowjacketFilterSample(state.mono, yellowjacketMono, yellowjacketParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphYellowjacketFilterSample(state.left, mixInput(nodeId, "Left") + yellowjacketMono, yellowjacketParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphYellowjacketFilterSample(state.right, mixInput(nodeId, "Right") + yellowjacketMono, yellowjacketParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
