// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphRsmetFilterModeToLadder(rsmetMode) {
  const table = [[1,1],[1,2],[1,3],[1,4],[2,1],[2,2],[2,3],[2,4],[3,1],[3,4]];
  const idx = Math.max(0, Math.min(9, Math.round(rsmetMode)));
  return table[idx];
}


function nodeGraphRsmetFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const freqNorm = Math.max(0, Math.min(1, Number(params.frequency) || 0));
  const resoNorm = Math.max(0, Math.min(1, Number(params.resonance) || 0));
  const chaos = Math.max(0, Math.min(1, Number(params.chaos) || 0));

  const freqGraph = [{x:0,y:3.0,skew:0,shape:0},{x:1,y:20000,skew:-0.95,shape:2}];
  const resoGraph = [{x:0,y:0.0,skew:0,shape:0},{x:1,y:1.0,skew:0.5,shape:2}];
  const cutoffHz = Math.max(0.000001, Math.min(rate * 0.49, nodeGraphAnalogEvalGraph(freqGraph, freqNorm)));
  const feedback = Math.max(0, Math.min(0.999, nodeGraphAnalogEvalGraph(resoGraph, resoNorm)));

  const [ladderMode, stages] = nodeGraphRsmetFilterModeToLadder(Number(params.mode) || 0);

  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * cutoffHz / rate));
  const sine = Math.sin(wc), cosine = Math.cos(wc), tangent = Math.tan(0.25 * (wc - Math.PI));
  let a = sine - cosine * tangent;
  a = (a > -1e-12 && a < 1e-12) ? (a >= 0 ? 1e-12 : -1e-12) : a;
  a = tangent / a;

  let mixS;
  const c = [0, 0, 0, 0, 0];
  if (ladderMode === 1) { c[stages] = 1; mixS = stages * 0.25; }
  else if (ladderMode === 2) {
    const hp = [[1,-1,0,0,0],[1,-2,1,0,0],[1,-3,3,-1,0],[1,-4,6,-4,1]];
    for (let i = 0; i <= stages; i++) c[i] = hp[stages-1][i];
    mixS = stages * 0.25;
  } else {
    const bp = [[0,2,-2,0,0],[0,2,-2,0,0],[0,0,3,-3,0],[0,0,4,-8,4]];
    for (let i = 0; i < 5; i++) c[i] = bp[stages-1][i];
    mixS = 0.125;
  }

  const b = 1 + a;
  const denom = Math.max(1e-12, 1 + a * a + 2 * a * cosine);
  const g2 = (b * b) / denom;
  const k = feedback / Math.max(1e-12, g2 * g2);
  const g = 1 + mixS * k;

  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "rsmet input");
  let inputSignal = Math.tanh(safeInput * 2);
  if (chaos > 0) inputSignal += nodeGraphAnalogNextNoiseBipolar() * chaos;

  const y = state.y;
  y[0] = (g * inputSignal - k * y[4]);
  y[0] = y[0] / (1 + y[0] * y[0]);
  y[1] = y[0] + a * (y[0] - y[1]);
  y[2] = y[1] + a * (y[1] - y[2]);
  y[3] = y[2] + a * (y[2] - y[3]);
  y[4] = y[3] + a * (y[3] - y[4]);

  const out = c[0]*y[0] + c[1]*y[1] + c[2]*y[2] + c[3]*y[3] + c[4]*y[4];
  return nodeGraphSafeFilterNumber(out * 0.41, runtime, nodeId, state, "rsmet output");
}


// Registers the offline/render-time dispatch handler for rsmetFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.rsmetFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.rsmetFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphRsmetFilterState);
  runtime.rsmetFilterStates.set(nodeId, state);
  const rsmetParams = {
    chaos: readNodeGraphLiveEffectiveParam(runtime, node, "chaos", 0, frame, frames, frameValues),
    frequency: readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 0.5, frame, frames, frameValues),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 0, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
  };
  const rsmetMono = mixInput(nodeId);
  return {
    Out: nodeGraphRsmetFilterSample(state.mono, rsmetMono, rsmetParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphRsmetFilterSample(state.left, mixInput(nodeId, "Left") + rsmetMono, rsmetParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphRsmetFilterSample(state.right, mixInput(nodeId, "Right") + rsmetMono, rsmetParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
