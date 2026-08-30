// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphChaoticPhaseLockingFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const reso = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));

  const cutoffHz = Math.max(0, Math.min(0.5 * rate, nodeGraphAnalogPitchToFreq(-12 + (135 - -12) * freqNorm)));
  const resGraph = [{x:0,y:0.1,skew:0,shape:0},{x:1,y:20.0,skew:-0.85,shape:2}];
  const mod = nodeGraphAnalogEvalGraph(resGraph, reso);
  const shape = 1 - chaos;

  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "chaotic phase locking input");
  state.feedbackSignal = mod * state.feedbackSignal + (-safeInput);
  const oscValue = nodeGraphAnalogWaveEllipse(state.feedbackSignal, shape);

  const a = nodeGraphAnalogLadderCoefficient(cutoffHz, rate);
  state.feedbackSignal = nodeGraphAnalogLadderTapStep(state.filterY, oscValue, a, 1, 2);

  const dcA = nodeGraphAnalogLadderCoefficient(5.0, rate);
  const dcOut = nodeGraphAnalogLadderTapStep(state.dcY, state.feedbackSignal, dcA, 2, 1);

  return nodeGraphSafeFilterNumber(-dcOut, runtime, nodeId, state, "chaotic phase locking output");
}


// Registers the offline/render-time dispatch handler for chaoticPhaseLockingFilter
// into nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.chaoticPhaseLockingFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.chaoticPhaseLockingFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphChaoticPhaseLockingFilterState);
  runtime.chaoticPhaseLockingFilterStates.set(nodeId, state);
  const chaoticPhaseLockingParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 1, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  // Always two independent engines (L/R). Mono In folds into both; Mono Out = (L+R)/2.
  const monoIn = mixInput(nodeId, "In") || mixInput(nodeId) || 0;
  const left = nodeGraphChaoticPhaseLockingFilterSample(
    state.left,
    (mixInput(nodeId, "Left") || 0) + monoIn,
    chaoticPhaseLockingParams,
    sampleRate,
    runtime,
    `${nodeId}:left`
  );
  const right = nodeGraphChaoticPhaseLockingFilterSample(
    state.right,
    (mixInput(nodeId, "Right") || 0) + monoIn,
    chaoticPhaseLockingParams,
    sampleRate,
    runtime,
    `${nodeId}:right`
  );
  return {
    Out: 0.5 * (left + right),
    Left: left,
    Right: right,
  };
};
