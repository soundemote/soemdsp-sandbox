// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphTb303FilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const safeCutoff = Math.max(200, Math.min(20000, Math.min(rate * 0.49, Number(params.cutoff) || 1000)));
  const resonanceRaw = Math.max(0, Math.min(1, (Number(params.resonance) || 0) * 0.01));
  const drive = Number(params.drive) || 0;
  const driveFactor = Math.pow(10, Math.max(-24, Math.min(24, drive)) / 20);
  const safeMode = Math.max(0, Math.min(14, Math.round(Number(params.mode) || 4)));

  // resonance skewing
  const r = (1 - Math.exp(-3 * resonanceRaw)) / (1 - Math.exp(-3));

  // coefficients
  const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * safeCutoff / rate));
  const sinWc = Math.sin(wc), cosWc = Math.cos(wc);
  const tanWc = Math.tan(0.25 * (wc - Math.PI));
  const denomA = sinWc - cosWc * tanWc;
  const a1FullRes = Math.abs(denomA) < 1e-15 ? -1 : tanWc / denomA;
  const a1NoRes = -Math.exp(-wc);
  const a1 = r * a1FullRes + (1 - r) * a1NoRes;
  const b0 = 1 + a1;
  const gsqD = Math.max(1e-12, 1 + a1 * a1 + 2 * a1 * cosWc);
  const gsq = b0 * b0 / gsqD;
  const k = r / Math.max(1e-24, gsq * gsq);

  // feedback highpass (1-pole, 150 Hz)
  if (!state.hpP || state.lastRate !== rate) {
    state.hpP = Math.exp(-2 * Math.PI * 150 / rate);
    state.hpB0 = (1 + state.hpP) * 0.5;
    state.lastRate = rate;
  }
  const fbIn = k * (state.y[3] || 0);
  const fbHp = state.hpB0 * (fbIn - state.hpX) + state.hpP * state.hpY;
  state.hpX = fbIn;
  state.hpY = nodeGraphSafeFilterNumber(fbHp, runtime, nodeId, state, "tb303 hp");

  const safeIn = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "tb303 in");
  const y = state.y;
  const y0 = nodeGraphSafeFilterNumber(0.125 * driveFactor * safeIn - fbHp, runtime, nodeId, state, "tb303 y0");
  y[0] = nodeGraphSafeFilterNumber(y0 + a1 * (y0 - y[0]), runtime, nodeId, state, "tb303 y1");
  y[1] = nodeGraphSafeFilterNumber(y[0] + a1 * (y[0] - y[1]), runtime, nodeId, state, "tb303 y2");
  y[2] = nodeGraphSafeFilterNumber(y[1] + a1 * (y[1] - y[2]), runtime, nodeId, state, "tb303 y3");
  y[3] = nodeGraphSafeFilterNumber(y[2] + a1 * (y[2] - y[3]), runtime, nodeId, state, "tb303 y4");

  // mode mix coefficients
  const modes = [
    [1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1],
    [1,-1,0,0,0],[1,-2,1,0,0],[1,-3,3,-1,0],[1,-4,6,-4,1],
    [0,0,1,-2,1],[0,0,0,1,-1],[0,1,-3,3,-1],[0,0,1,-1,0],[0,1,-2,1,0],[0,1,-1,0,0],
  ];
  const c = modes[safeMode] || modes[4];
  const out = 8 * (c[0]*y0 + c[1]*y[0] + c[2]*y[1] + c[3]*y[2] + c[4]*y[3]);
  return nodeGraphSafeFilterNumber(out, runtime, nodeId, state, "tb303 out");
}


// Registers the offline/render-time dispatch handler for tb303Filter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.tb303Filter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, sampleRate }) => {
  const state = runtime.tb303FilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphTb303FilterState);
  runtime.tb303FilterStates.set(nodeId, state);
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const tb303Params = {
    cutoff: read("cutoff", 1000),
    drive: read("drive", 0),
    mode: read("mode", 4),
    resonance: read("resonance", 0),
  };
  const tb303Mono = mixInput(nodeId);
  return {
    Out: nodeGraphTb303FilterSample(state.mono, tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphTb303FilterSample(state.left, mixInput(nodeId, "Left") + tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphTb303FilterSample(state.right, mixInput(nodeId, "Right") + tb303Mono, tb303Params, sampleRate, runtime, `${nodeId}:right`),
  };
};
